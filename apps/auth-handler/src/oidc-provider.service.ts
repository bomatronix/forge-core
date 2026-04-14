import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createClerkClient } from '@clerk/backend';
import { randomUUID, timingSafeEqual, createHash } from 'crypto';
import type { Request } from 'express';
import {
  authSessionFromClaims,
  buildJwksDocument,
  buildUserInfo,
  hashOpaqueToken,
  issueAccessToken,
  issueIdToken,
  verifyIssuedToken,
} from '@forge-core/core/auth/platform-tokens';
import type {
  AuthClientConfig,
  AuthorizationCodeRecord,
  BrowserSession,
  PendingAuthorizationRequest,
  RefreshTokenRecord,
  UpstreamConnectionConfig,
} from '@forge-core/core/auth/oauth.types';
import { AuthHandlerConfigService } from './auth-handler.config';
import { AuthPersistenceStore } from './auth-store';
import {
  clearCookie,
  parseCookieHeader,
  sealCookieValue,
  serializeCookie,
  unsealCookieValue,
} from './cookies';
import { UpstreamOidcService } from './upstream-oidc.service';

const FLOW_COOKIE = 'forge_auth_flow';
const SESSION_COOKIE = 'forge_auth_session';
const STANDARD_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access']);

export interface RedirectResult {
  redirectUrl: string;
  cookies?: string[];
}

@Injectable()
export class OidcProviderService {
  constructor(
    private readonly configService: AuthHandlerConfigService,
    private readonly store: AuthPersistenceStore,
    private readonly upstreamOidcService: UpstreamOidcService,
  ) {}

  getDiscoveryDocument(request: Request) {
    const issuer = this.getIssuer(request);
    return {
      issuer,
      authorization_endpoint: `${issuer}/authorize`,
      token_endpoint: `${issuer}/token`,
      userinfo_endpoint: `${issuer}/userinfo`,
      jwks_uri: `${issuer}/jwks.json`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic', 'none'],
      code_challenge_methods_supported: ['S256', 'plain'],
      scopes_supported: Array.from(
        new Set(
          this.configService
            .getClients()
            .flatMap(client => client.scopes),
        ),
      ),
      claims_supported: ['sub', 'email', 'name', 'picture', 'org_id', 'permissions'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
    };
  }

  getJwks() {
    return buildJwksDocument(this.configService.getRuntimeConfig().publicKey);
  }

  async beginAuthorization(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<RedirectResult> {
    const client = this.requireClient(params.client_id);
    this.ensureGrant(client, 'authorization_code');

    const redirectUri = this.requireRedirectUri(client, params.redirect_uri);
    const requestedScopes = this.resolveRequestedScope(client, params.scope);
    const connection = this.resolveConnection(params.connection, client);
    const pending: PendingAuthorizationRequest = {
      requestId: randomUUID(),
      clientId: client.clientId,
      redirectUri,
      responseType: this.requireResponseType(params.response_type),
      scope: requestedScopes,
      state: params.state,
      nonce: params.nonce,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: this.normalizeCodeChallengeMethod(params.code_challenge_method),
      connectionId: connection.id,
      createdAt: new Date().toISOString(),
    };

    const existingSession = this.readBrowserSession(request);
    if (existingSession && existingSession.provider === connection.id) {
      return this.completeAuthorizationRequest(request, pending, existingSession);
    }

    if (connection.type === 'dev') {
      const browserSession: BrowserSession = {
        sub: params.login_hint?.trim() || 'dev-user-id',
        email: 'dev@example.com',
        name: 'Dev User',
        avatarUrl: null,
        orgId: 'dev-org-id',
        permissions: ['*'],
        provider: connection.id,
        createdAt: new Date().toISOString(),
      };

      return this.completeAuthorizationRequest(request, pending, browserSession);
    }

    pending.upstreamState = randomUUID();
    const callbackUrl = this.getUpstreamCallbackUrl(request, connection.id);
    const redirectUrl = await this.upstreamOidcService.buildAuthorizationUrl(connection, {
      redirectUri: callbackUrl,
      state: pending.upstreamState,
      nonce: pending.nonce ?? randomUUID(),
    });

    return {
      redirectUrl,
      cookies: [this.createFlowCookie(pending)],
    };
  }

  async handleCallback(
    request: Request,
    connectionId: string,
    params: Record<string, string | undefined>,
  ): Promise<RedirectResult> {
    const pending = this.requirePendingAuthorization(request);
    if (pending.connectionId !== connectionId) {
      throw new BadRequestException('Authorization flow connection mismatch.');
    }

    if (params.error) {
      return this.redirectWithOAuthError(
        pending.redirectUri,
        pending.state,
        params.error,
        params.error_description,
      );
    }

    if (!params.code || !params.state || params.state !== pending.upstreamState) {
      throw new BadRequestException('Invalid upstream authorization callback.');
    }

    const connection = this.requireConnection(connectionId);
    const upstreamProfile = await this.upstreamOidcService.exchangeCodeForProfile(connection, {
      code: params.code,
      redirectUri: this.getUpstreamCallbackUrl(request, connectionId),
      nonce: pending.nonce,
    });

    const browserSession: BrowserSession = {
      sub: upstreamProfile.sub,
      email: upstreamProfile.email,
      name: upstreamProfile.name,
      avatarUrl: upstreamProfile.avatarUrl,
      orgId: upstreamProfile.orgId,
      permissions: [],
      provider: connectionId,
      createdAt: new Date().toISOString(),
    };

    return this.completeAuthorizationRequest(request, pending, browserSession);
  }

  getConsentPage(request: Request): string {
    const pending = this.requirePendingAuthorization(request);
    const session = this.requireBrowserSession(request);
    const client = this.requireClient(pending.clientId);

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Authorize ${this.escapeHtml(client.name)}</title>
    <style>
      body { font-family: sans-serif; margin: 3rem auto; max-width: 42rem; line-height: 1.5; }
      .card { border: 1px solid #ddd; border-radius: 12px; padding: 1.5rem; }
      code { background: #f5f5f5; padding: 0.1rem 0.35rem; border-radius: 4px; }
      button { margin-right: 0.75rem; padding: 0.6rem 1rem; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Authorize ${this.escapeHtml(client.name)}</h1>
      <p>Signed in as <strong>${this.escapeHtml(session.email ?? session.sub)}</strong>.</p>
      <p>This client is requesting access to:</p>
      <ul>${pending.scope.map(scope => `<li><code>${this.escapeHtml(scope)}</code></li>`).join('')}</ul>
      <form method="post" action="/auth/consent">
        <button type="submit" name="decision" value="approve">Approve</button>
        <button type="submit" name="decision" value="deny">Deny</button>
      </form>
    </div>
  </body>
</html>`;
  }

  async submitConsent(
    request: Request,
    decision: string | undefined,
  ): Promise<RedirectResult> {
    const pending = this.requirePendingAuthorization(request);
    const session = this.requireBrowserSession(request);

    if (decision !== 'approve') {
      return this.redirectWithOAuthError(
        pending.redirectUri,
        pending.state,
        'access_denied',
        'The resource owner denied the request.',
      );
    }

    this.store.grantConsent(pending.clientId, session.sub, pending.scope);
    return this.redirectWithAuthorizationCode(request, pending, session);
  }

  async exchangeToken(
    _request: Request,
    body: Record<string, string | undefined>,
    authorizationHeader: string | undefined,
  ) {
    const grantType = body.grant_type;
    if (!grantType) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'grant_type is required.',
      });
    }

    switch (grantType) {
      case 'authorization_code':
        return this.exchangeAuthorizationCode(body, authorizationHeader);
      case 'refresh_token':
        return this.exchangeRefreshToken(body, authorizationHeader);
      case 'client_credentials':
        return this.exchangeClientCredentials(body, authorizationHeader);
      default:
        throw new BadRequestException({
          error: 'unsupported_grant_type',
          error_description: `Unsupported grant_type '${grantType}'.`,
        });
    }
  }

  getUserInfo(authorizationHeader: string | undefined) {
    const token = this.extractBearerToken(authorizationHeader);
    const claims = verifyIssuedToken(token, {
      issuer: this.configService.getRuntimeConfig().issuer,
      audience: this.configService.getRuntimeConfig().audience,
      publicKey: this.configService.getRuntimeConfig().publicKey,
      expectedUse: 'access',
    });

    if (claims.token_kind !== 'user') {
      throw new ForbiddenException('userinfo is only available for user access tokens.');
    }

    return buildUserInfo(claims);
  }

  verifyAccessToken(token: string) {
    const claims = verifyIssuedToken(token, {
      issuer: this.configService.getRuntimeConfig().issuer,
      audience: this.configService.getRuntimeConfig().audience,
      publicKey: this.configService.getRuntimeConfig().publicKey,
      expectedUse: 'access',
    });

    return authSessionFromClaims(claims);
  }

  logout(request: Request, returnTo?: string): RedirectResult {
    const cookies = [this.clearFlowCookie(), this.clearSessionCookie()];
    return {
      redirectUrl: returnTo?.trim() || this.getIssuer(request),
      cookies,
    };
  }

  /**
   * Credential-based login endpoint — verifies email/password directly instead of redirecting to
   * an upstream OIDC provider. Returns a JSON response with a redirectUrl containing the
   * authorization code, allowing the frontend to drive the PKCE callback flow without a browser
   * redirect to auth-handler.
   *
   * Supported connection types:
   * - dev: auto-authenticates with mock credentials (no password check)
   * - oidc (Clerk): verifies via Clerk Backend API (requires AUTH_SECRET_KEY)
   */
  async loginWithCredentials(
    request: Request,
    params: Record<string, string | undefined>,
  ): Promise<{ redirectUrl: string }> {
    const email = params.email?.trim();
    const password = params.password?.trim();

    if (!email || !password) {
      throw new BadRequestException('email and password are required.');
    }

    const client = this.requireClient(params.client_id);
    this.ensureGrant(client, 'authorization_code');

    const redirectUri = this.requireRedirectUri(client, params.redirect_uri);
    const requestedScopes = this.resolveRequestedScope(client, params.scope);
    const connection = this.resolveConnection(params.connection, client);

    const pending: PendingAuthorizationRequest = {
      requestId: randomUUID(),
      clientId: client.clientId,
      redirectUri,
      responseType: 'code',
      scope: requestedScopes,
      state: params.state,
      nonce: params.nonce,
      codeChallenge: params.code_challenge,
      codeChallengeMethod: this.normalizeCodeChallengeMethod(params.code_challenge_method),
      connectionId: connection.id,
      createdAt: new Date().toISOString(),
    };

    let browserSession: BrowserSession;

    if (connection.type === 'dev') {
      browserSession = {
        sub: 'dev-user-id',
        email: 'dev@example.com',
        name: 'Dev User',
        avatarUrl: null,
        orgId: 'dev-org-id',
        permissions: ['*'],
        provider: connection.id,
        createdAt: new Date().toISOString(),
      };
    } else {
      browserSession = await this.verifyCredentialsViaClerk(email, password, connection);
    }

    // Issue authorization code directly — bypasses cookie-based flow since all
    // PKCE params arrive in the request body, not via a browser-set flow cookie.
    const code = randomUUID();
    const authorizationCode: AuthorizationCodeRecord = {
      code,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      scope: pending.scope,
      nonce: pending.nonce,
      subject: browserSession.sub,
      email: browserSession.email,
      name: browserSession.name,
      avatarUrl: browserSession.avatarUrl,
      orgId: browserSession.orgId,
      permissions: this.resolvePermissions(pending.scope, browserSession.permissions),
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    this.store.saveAuthorizationCode(authorizationCode);

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) {
      redirectUrl.searchParams.set('state', pending.state);
    }

    return { redirectUrl: redirectUrl.toString() };
  }

  private async verifyCredentialsViaClerk(
    email: string,
    password: string,
    connection: UpstreamConnectionConfig,
  ): Promise<BrowserSession> {
    if (connection.type !== 'oidc') {
      throw new BadRequestException(`Credential login is not supported for connection type '${connection.type}'.`);
    }

    const secretKey = (connection.secretKey ?? process.env.AUTH_SECRET_KEY)?.trim();
    if (!secretKey) {
      throw new BadRequestException('Server auth key is not configured. Cannot verify credentials.');
    }

    const clerk = createClerkClient({ secretKey });

    const userList = await clerk.users.getUserList({ emailAddress: [email] });
    const user = userList.data?.[0];
    if (!user) {
      throw new UnauthorizedException('Invalid credentials.');
    }

    try {
      await clerk.users.verifyPassword({ userId: user.id, password });
    } catch {
      throw new UnauthorizedException('Invalid credentials.');
    }

    const primaryEmail = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress ?? email;
    const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || null;

    return {
      sub: user.id,
      email: primaryEmail,
      name,
      avatarUrl: user.imageUrl ?? null,
      orgId: null,
      permissions: [],
      provider: connection.id,
      createdAt: new Date().toISOString(),
    };
  }

  private async exchangeAuthorizationCode(
    body: Record<string, string | undefined>,
    authorizationHeader: string | undefined,
  ) {
    const client = this.authenticateClient(body, authorizationHeader, true);
    this.ensureGrant(client, 'authorization_code');

    const code = body.code?.trim();
    if (!code) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'code is required.',
      });
    }

    const record = this.store.consumeAuthorizationCode(code);
    if (!record) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'The authorization code is invalid or expired.',
      });
    }

    if (record.clientId !== client.clientId) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'The authorization code does not belong to this client.',
      });
    }

    if ((body.redirect_uri ?? '').trim() !== record.redirectUri) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'redirect_uri does not match the original request.',
      });
    }

    if (record.codeChallenge) {
      const verifier = body.code_verifier?.trim();
      if (!verifier) {
        throw new BadRequestException({
          error: 'invalid_request',
          error_description: 'code_verifier is required for PKCE-enabled authorization codes.',
        });
      }

      const expected = record.codeChallengeMethod === 'S256'
        ? createHash('sha256').update(verifier).digest('base64url')
        : verifier;

      if (expected !== record.codeChallenge) {
        throw new BadRequestException({
          error: 'invalid_grant',
          error_description: 'PKCE verification failed.',
        });
      }
    }

    const runtime = this.configService.getRuntimeConfig();
    const accessToken = issueAccessToken(runtime, {
      subject: record.subject,
      clientId: client.clientId,
      email: record.email,
      name: record.name,
      avatarUrl: record.avatarUrl,
      orgId: record.orgId,
      permissions: record.permissions,
      scope: record.scope,
      tokenKind: 'user',
    });

    const response: Record<string, unknown> = {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: runtime.accessTokenTtlSeconds,
      scope: record.scope.join(' '),
    };

    if (record.scope.includes('openid')) {
      response['id_token'] = issueIdToken(runtime, {
        clientId: client.clientId,
        subject: record.subject,
        email: record.email,
        name: record.name,
        avatarUrl: record.avatarUrl,
        orgId: record.orgId,
        permissions: record.permissions,
        nonce: record.nonce,
      });
    }

    if (record.scope.includes('offline_access') && client.grantTypes.includes('refresh_token')) {
      const refreshToken = randomUUID();
      const refreshRecord: RefreshTokenRecord = {
        tokenId: hashOpaqueToken(refreshToken),
        clientId: client.clientId,
        subject: record.subject,
        scope: record.scope,
        email: record.email,
        name: record.name,
        avatarUrl: record.avatarUrl,
        orgId: record.orgId,
        permissions: record.permissions,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + runtime.refreshTokenTtlSeconds * 1000).toISOString(),
      };
      this.store.saveRefreshToken(refreshRecord);
      response['refresh_token'] = refreshToken;
    }

    return response;
  }

  private exchangeRefreshToken(
    body: Record<string, string | undefined>,
    authorizationHeader: string | undefined,
  ) {
    const client = this.authenticateClient(body, authorizationHeader, true);
    this.ensureGrant(client, 'refresh_token');

    const refreshToken = body.refresh_token?.trim();
    if (!refreshToken) {
      throw new BadRequestException({
        error: 'invalid_request',
        error_description: 'refresh_token is required.',
      });
    }

    const record = this.store.getRefreshToken(hashOpaqueToken(refreshToken));
    if (!record || record.revokedAt) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'The refresh token is invalid or expired.',
      });
    }

    if (record.clientId !== client.clientId) {
      throw new BadRequestException({
        error: 'invalid_grant',
        error_description: 'The refresh token does not belong to this client.',
      });
    }

    this.store.revokeRefreshToken(record.tokenId);

    const runtime = this.configService.getRuntimeConfig();
    const nextRefreshToken = randomUUID();
    this.store.saveRefreshToken({
      ...record,
      tokenId: hashOpaqueToken(nextRefreshToken),
      issuedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + runtime.refreshTokenTtlSeconds * 1000).toISOString(),
      revokedAt: undefined,
    });

    return {
      access_token: issueAccessToken(runtime, {
        subject: record.subject,
        clientId: client.clientId,
        email: record.email,
        name: record.name,
        avatarUrl: record.avatarUrl,
        orgId: record.orgId,
        permissions: record.permissions,
        scope: record.scope,
        tokenKind: 'user',
      }),
      token_type: 'bearer',
      expires_in: runtime.accessTokenTtlSeconds,
      refresh_token: nextRefreshToken,
      scope: record.scope.join(' '),
    };
  }

  private exchangeClientCredentials(
    body: Record<string, string | undefined>,
    authorizationHeader: string | undefined,
  ) {
    const client = this.authenticateClient(body, authorizationHeader, false);
    if (client.type !== 'confidential') {
      throw new BadRequestException({
        error: 'unauthorized_client',
        error_description: 'client_credentials requires a confidential client.',
      });
    }

    this.ensureGrant(client, 'client_credentials');

    const requestedScope = this.resolveRequestedScope(
      client,
      body.scope,
      client.scopes.filter(scope => !STANDARD_SCOPES.has(scope)),
    );
    const permissions = this.extractPermissionScopes(requestedScope);
    const runtime = this.configService.getRuntimeConfig();

    return {
      access_token: issueAccessToken(runtime, {
        subject: `client:${client.clientId}`,
        clientId: client.clientId,
        email: null,
        name: client.name,
        avatarUrl: null,
        orgId: null,
        permissions,
        scope: requestedScope,
        tokenKind: 'machine',
      }),
      token_type: 'bearer',
      expires_in: runtime.accessTokenTtlSeconds,
      scope: requestedScope.join(' '),
    };
  }

  private completeAuthorizationRequest(
    request: Request,
    pending: PendingAuthorizationRequest,
    session: BrowserSession,
  ): RedirectResult {
    const client = this.requireClient(pending.clientId);
    const cookies = [this.createFlowCookie(pending), this.createSessionCookie(session)];

    if (!client.firstParty && !this.store.hasConsent(client.clientId, session.sub, pending.scope)) {
      return {
        redirectUrl: `${this.getIssuer(request)}/consent`,
        cookies,
      };
    }

    const redirect = this.redirectWithAuthorizationCode(request, pending, session);
    return {
      redirectUrl: redirect.redirectUrl,
      cookies: [...cookies, ...(redirect.cookies ?? [])],
    };
  }

  private redirectWithAuthorizationCode(
    _request: Request,
    pending: PendingAuthorizationRequest,
    session: BrowserSession,
  ): RedirectResult {
    const code = randomUUID();
    const authorizationCode: AuthorizationCodeRecord = {
      code,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      scope: pending.scope,
      nonce: pending.nonce,
      subject: session.sub,
      email: session.email,
      name: session.name,
      avatarUrl: session.avatarUrl,
      orgId: session.orgId,
      permissions: this.resolvePermissions(pending.scope, session.permissions),
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    };
    this.store.saveAuthorizationCode(authorizationCode);

    const redirectUrl = new URL(pending.redirectUri);
    redirectUrl.searchParams.set('code', code);
    if (pending.state) {
      redirectUrl.searchParams.set('state', pending.state);
    }

    return {
      redirectUrl: redirectUrl.toString(),
      cookies: [this.clearFlowCookie()],
    };
  }

  private redirectWithOAuthError(
    redirectUri: string,
    state: string | undefined,
    error: string,
    description?: string,
  ): RedirectResult {
    const redirectUrl = new URL(redirectUri);
    redirectUrl.searchParams.set('error', error);
    if (description) redirectUrl.searchParams.set('error_description', description);
    if (state) redirectUrl.searchParams.set('state', state);

    return {
      redirectUrl: redirectUrl.toString(),
      cookies: [this.clearFlowCookie()],
    };
  }

  private requireClient(clientId: string | undefined): AuthClientConfig {
    if (!clientId) {
      throw new BadRequestException('client_id is required.');
    }

    const client = this.configService.getClient(clientId);
    if (!client) {
      throw new BadRequestException(`Unknown client_id '${clientId}'.`);
    }

    return client;
  }

  private requireConnection(connectionId: string): UpstreamConnectionConfig {
    const connection = this.configService.getConnection(connectionId);
    if (!connection) {
      throw new BadRequestException(`Unknown upstream connection '${connectionId}'.`);
    }
    return connection;
  }

  private resolveConnection(connectionId: string | undefined, client: AuthClientConfig) {
    const resolved = connectionId || client.defaultConnectionId || this.configService.getConnections()[0]?.id;
    if (!resolved) {
      throw new BadRequestException('No upstream connection is configured.');
    }
    return this.requireConnection(resolved);
  }

  private requireRedirectUri(client: AuthClientConfig, redirectUri: string | undefined): string {
    const value = redirectUri?.trim();
    if (!value) {
      throw new BadRequestException('redirect_uri is required.');
    }

    if (!client.redirectUris.includes(value)) {
      throw new BadRequestException('redirect_uri is not registered for this client.');
    }

    return value;
  }

  private requireResponseType(responseType: string | undefined): 'code' {
    if ((responseType ?? '').trim() !== 'code') {
      throw new BadRequestException('Only response_type=code is supported.');
    }
    return 'code';
  }

  private ensureGrant(client: AuthClientConfig, grant: 'authorization_code' | 'refresh_token' | 'client_credentials'): void {
    if (!client.grantTypes.includes(grant)) {
      throw new BadRequestException(`Client '${client.clientId}' is not allowed to use ${grant}.`);
    }
  }

  private resolveRequestedScope(
    client: AuthClientConfig,
    requestedScope: string | undefined,
    fallback: string[] = ['openid', 'profile', 'email'],
  ): string[] {
    const scope = requestedScope?.trim()
      ? requestedScope.trim().split(/\s+/)
      : fallback;

    const invalid = scope.filter(item => !client.scopes.includes(item));
    if (invalid.length > 0) {
      throw new BadRequestException(`Requested scope is not allowed: ${invalid.join(', ')}`);
    }

    return Array.from(new Set(scope));
  }

  private normalizeCodeChallengeMethod(value: string | undefined): 'S256' | 'plain' | undefined {
    if (!value) return undefined;
    if (value !== 'S256' && value !== 'plain') {
      throw new BadRequestException('Unsupported code_challenge_method.');
    }
    return value;
  }

  private parseBasicAuthorization(authorizationHeader: string | undefined): { clientId: string; clientSecret: string } | null {
    if (!authorizationHeader?.startsWith('Basic ')) return null;
    const decoded = Buffer.from(authorizationHeader.slice(6), 'base64').toString('utf8');
    const separatorIndex = decoded.indexOf(':');
    if (separatorIndex === -1) return null;
    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1),
    };
  }

  private authenticateClient(
    body: Record<string, string | undefined>,
    authorizationHeader: string | undefined,
    allowPublic: boolean,
  ): AuthClientConfig {
    const basic = this.parseBasicAuthorization(authorizationHeader);
    const clientId = basic?.clientId || body.client_id?.trim();
    const client = this.requireClient(clientId);

    if (client.type === 'confidential') {
      const suppliedSecret = basic?.clientSecret || body.client_secret?.trim();
      if (!suppliedSecret || !this.safeEquals(suppliedSecret, client.clientSecret ?? '')) {
        throw new UnauthorizedException({
          error: 'invalid_client',
          error_description: 'Client authentication failed.',
        });
      }
      return client;
    }

    if (!allowPublic) {
      throw new UnauthorizedException({
        error: 'unauthorized_client',
        error_description: 'This grant requires a confidential client.',
      });
    }

    return client;
  }

  private safeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    if (leftBuffer.length !== rightBuffer.length) return false;
    return timingSafeEqual(leftBuffer, rightBuffer);
  }

  private resolvePermissions(scope: string[], sessionPermissions: string[]): string[] {
    const requestedPermissions = this.extractPermissionScopes(scope);
    if (sessionPermissions.includes('*')) {
      return requestedPermissions.length > 0 ? requestedPermissions : ['*'];
    }

    return requestedPermissions;
  }

  private extractPermissionScopes(scope: string[]): string[] {
    return scope.filter(item => !STANDARD_SCOPES.has(item));
  }

  private extractBearerToken(authorizationHeader: string | undefined): string {
    const token = authorizationHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      throw new UnauthorizedException('Missing Bearer token.');
    }
    return token;
  }

  private requirePendingAuthorization(request: Request): PendingAuthorizationRequest {
    const cookies = parseCookieHeader(request.headers.cookie);
    const pending = unsealCookieValue<PendingAuthorizationRequest>(
      cookies[FLOW_COOKIE],
      this.configService.getRuntimeConfig().cookieSecret,
    );

    if (!pending) {
      throw new BadRequestException('No active authorization flow was found.');
    }

    return pending;
  }

  private readBrowserSession(request: Request): BrowserSession | null {
    const cookies = parseCookieHeader(request.headers.cookie);
    return unsealCookieValue<BrowserSession>(
      cookies[SESSION_COOKIE],
      this.configService.getRuntimeConfig().cookieSecret,
    );
  }

  private requireBrowserSession(request: Request): BrowserSession {
    const session = this.readBrowserSession(request);
    if (!session) {
      throw new UnauthorizedException('No browser session was found.');
    }
    return session;
  }

  private createFlowCookie(pending: PendingAuthorizationRequest): string {
    return this.serializeEncryptedCookie(
      FLOW_COOKIE,
      pending,
      10 * 60,
    );
  }

  private clearFlowCookie(): string {
    return this.serializeClearedCookie(FLOW_COOKIE);
  }

  private createSessionCookie(session: BrowserSession): string {
    return this.serializeEncryptedCookie(
      SESSION_COOKIE,
      session,
      60 * 60 * 8,
    );
  }

  private clearSessionCookie(): string {
    return this.serializeClearedCookie(SESSION_COOKIE);
  }

  private serializeEncryptedCookie(name: string, payload: unknown, maxAgeSeconds: number): string {
    return serializeCookie(
      name,
      sealCookieValue(payload, this.configService.getRuntimeConfig().cookieSecret),
      {
        maxAge: maxAgeSeconds,
        sameSite: 'Lax',
        secure: process.env.NODE_ENV === 'production',
      },
    );
  }

  private serializeClearedCookie(name: string): string {
    return clearCookie(name, {
      sameSite: 'Lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  private getIssuer(request: Request): string {
    const configuredIssuer = process.env.AUTH_HANDLER_ISSUER?.trim();
    if (configuredIssuer) return configuredIssuer;

    const protocol = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
    const host = (request.headers['x-forwarded-host'] as string | undefined) ?? request.get('host');
    return `${protocol}://${host}/auth`;
  }

  private getUpstreamCallbackUrl(request: Request, connectionId: string): string {
    return `${this.getIssuer(request)}/callback/${connectionId}`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
