import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Header,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Public, resolveAuthAdapter } from '@forge-core/core';
import { issueAccessToken, issueIdToken } from '@forge-core/core/auth/platform-tokens';
import type { AuthSession } from '@forge-core/core';
import type { AuthClientConfig, UserInfoResponse } from '@forge-core/core/auth/oauth.types';
import type { Request, Response } from 'express';
import { appendSetCookie } from './cookies';
import { AuthHandlerConfigService } from './auth-handler.config';
import { OidcProviderService } from './oidc-provider.service';

class TokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...' })
  access_token!: string;

  @ApiProperty({ example: 'bearer' })
  token_type!: string;

  @ApiProperty({ example: 900 })
  expires_in!: number;

  @ApiProperty({ example: 'openid profile email offline_access agents:read', required: false })
  scope?: string;

  @ApiProperty({ example: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...', required: false })
  id_token?: string;

  @ApiProperty({ example: '8f8463a1-8db8-4c82-97e5-9b6a868d3398', required: false })
  refresh_token?: string;
}

class AuthorizerContextDto {
  @ApiProperty({ example: 'dev-user-id' })
  userId!: string;

  @ApiProperty({ example: 'dev@example.com' })
  email!: string;

  @ApiProperty({ example: 'Dev User' })
  name!: string;

  @ApiProperty({ example: '' })
  avatarUrl!: string;

  @ApiProperty({ example: 'dev-org-id' })
  orgId!: string;

  @ApiProperty({ example: ['agents:read'], type: [String] })
  permissions!: string[];
}

class AuthorizerResultDto {
  @ApiProperty({ enum: ['Allow', 'Deny'], example: 'Allow' })
  effect!: string;

  @ApiProperty({ example: 'dev-user-id' })
  principalId!: string;

  @ApiProperty({ type: AuthorizerContextDto, required: false, nullable: true })
  context!: AuthorizerContextDto | null;
}

class JwksDocumentDto {
  @ApiProperty({
    example: [
      {
        kid: 'abc123',
        kty: 'RSA',
        alg: 'RS256',
        use: 'sig',
        n: '...',
        e: 'AQAB',
      },
    ],
    type: [Object],
  })
  keys!: Array<Record<string, string>>;
}

class DiscoveryDocumentDto {
  @ApiProperty({ example: 'http://localhost:3002/auth' })
  issuer!: string;

  @ApiProperty({ example: 'http://localhost:3002/auth/authorize' })
  authorization_endpoint!: string;

  @ApiProperty({ example: 'http://localhost:3002/auth/token' })
  token_endpoint!: string;

  @ApiProperty({ example: 'http://localhost:3002/auth/userinfo' })
  userinfo_endpoint!: string;

  @ApiProperty({ example: 'http://localhost:3002/auth/jwks.json' })
  jwks_uri!: string;
}

class LogoutResponseDto {
  @ApiProperty({ example: 'http://localhost:3002/auth' })
  redirect_to!: string;
}

class UserInfoResponseDto implements UserInfoResponse {
  @ApiProperty({ example: 'dev-user-id' })
  sub!: string;

  @ApiProperty({ example: 'dev@example.com', required: false, nullable: true })
  email?: string | null;

  @ApiProperty({ example: 'Dev User', required: false, nullable: true })
  name?: string | null;

  @ApiProperty({ example: null, required: false, nullable: true })
  picture?: string | null;

  @ApiProperty({ example: 'dev-org-id', required: false, nullable: true })
  org_id?: string | null;

  @ApiProperty({ example: ['agents:read'], required: false, type: [String] })
  permissions?: string[];
}

@ApiTags('auth')
@Controller()
export class AuthHandlerController {
  constructor(
    private readonly providerService: OidcProviderService,
    private readonly configService: AuthHandlerConfigService,
  ) {}

  @Get('.well-known/openid-configuration')
  @Public()
  @ApiOperation({ summary: 'OIDC discovery document' })
  @ApiResponse({ status: 200, type: DiscoveryDocumentDto })
  discovery(@Req() request: Request) {
    return this.providerService.getDiscoveryDocument(request);
  }

  @Get('jwks.json')
  @Public()
  @ApiOperation({ summary: 'JWKS for auth-handler-issued tokens' })
  @ApiResponse({ status: 200, type: JwksDocumentDto })
  jwks() {
    return this.providerService.getJwks();
  }

  @Get('authorize')
  @Public()
  @ApiOperation({ summary: 'Start OAuth 2.0 / OIDC authorization code flow' })
  @ApiQuery({ name: 'client_id', required: true })
  @ApiQuery({ name: 'redirect_uri', required: true })
  @ApiQuery({ name: 'response_type', required: true, example: 'code' })
  @ApiQuery({ name: 'scope', required: false, example: 'openid profile email offline_access agents:read' })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'nonce', required: false })
  @ApiQuery({ name: 'code_challenge', required: false })
  @ApiQuery({ name: 'code_challenge_method', required: false, example: 'S256' })
  @ApiQuery({ name: 'connection', required: false, example: 'clerk' })
  async authorize(
    @Req() request: Request,
    @Res() response: Response,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.providerService.beginAuthorization(
      request,
      this.normalizeParams(rawQuery),
    );
    this.redirectWithCookies(response, result);
  }

  @Get('callback/:connection')
  @Public()
  @ApiOperation({ summary: 'Complete upstream login callback' })
  async callback(
    @Req() request: Request,
    @Res() response: Response,
    @Param('connection') connection: string,
    @Query() rawQuery: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.providerService.handleCallback(
      request,
      connection,
      this.normalizeParams(rawQuery),
    );
    this.redirectWithCookies(response, result);
  }

  @Get('consent')
  @Public()
  @Header('Content-Type', 'text/html; charset=utf-8')
  @ApiOperation({ summary: 'Consent screen for third-party clients' })
  consentPage(@Req() request: Request): string {
    return this.providerService.getConsentPage(request);
  }

  @Post('consent')
  @Public()
  @ApiOperation({ summary: 'Approve or deny a pending consent request' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        decision: {
          type: 'string',
          enum: ['approve', 'deny'],
        },
      },
      required: ['decision'],
    },
  })
  async submitConsent(
    @Req() request: Request,
    @Res() response: Response,
    @Body() rawBody: Record<string, unknown>,
  ): Promise<void> {
    const result = await this.providerService.submitConsent(
      request,
      this.normalizeParams(rawBody).decision,
    );
    this.redirectWithCookies(response, result);
  }

  @Post('token')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'OAuth 2.0 token endpoint' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        grant_type: { type: 'string', enum: ['authorization_code', 'refresh_token', 'client_credentials'] },
        code: { type: 'string' },
        redirect_uri: { type: 'string' },
        code_verifier: { type: 'string' },
        refresh_token: { type: 'string' },
        client_id: { type: 'string' },
        client_secret: { type: 'string' },
        scope: { type: 'string' },
      },
      required: ['grant_type'],
    },
  })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  async token(
    @Req() request: Request,
    @Headers('authorization') authorization: string | undefined,
    @Body() rawBody: Record<string, unknown>,
  ) {
    return this.providerService.exchangeToken(
      request,
      this.normalizeParams(rawBody),
      authorization,
    );
  }

  @Get('userinfo')
  @Public()
  @ApiBearerAuth()
  @ApiOperation({ summary: 'OIDC userinfo endpoint' })
  @ApiResponse({ status: 200, type: UserInfoResponseDto })
  userinfo(@Headers('authorization') authorization: string | undefined) {
    return this.providerService.getUserInfo(authorization);
  }

  @Post('logout')
  @Public()
  @ApiOperation({ summary: 'Clear the auth-handler browser session' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        return_to: { type: 'string' },
      },
    },
  })
  @ApiResponse({ status: 200, type: LogoutResponseDto })
  logout(
    @Req() request: Request,
    @Res() response: Response,
    @Body() rawBody: Record<string, unknown>,
  ): void {
    const result = this.providerService.logout(
      request,
      this.normalizeParams(rawBody).return_to,
    );
    this.applyCookies(response, result.cookies);
    response.status(200).json({ redirect_to: result.redirectUrl });
  }

  @Post('dev/token')
  @Public()
  @HttpCode(200)
  @ApiExcludeEndpoint(process.env.NODE_ENV === 'production')
  @ApiOperation({ summary: 'Development-only helper for minting platform tokens' })
  @ApiResponse({ status: 200, type: TokenResponseDto })
  devToken(@Body() rawBody: Record<string, unknown>): TokenResponseDto {
    if (process.env.NODE_ENV === 'production') {
      throw new ForbiddenException('The development token endpoint is not available in production.');
    }

    const params = this.normalizeParams(rawBody);
    const client = this.resolveDevClient(params.client_id);
    const runtime = this.configService.getRuntimeConfig();
    const scope = this.resolveDevScope(client, params.scope);
    const subject = params.user_id?.trim() || 'dev-user-id';
    const email = params.email?.trim() || 'dev@example.com';
    const name = params.name?.trim() || 'Dev User';
    const orgId = params.org_id?.trim() || 'dev-org-id';
    const permissions = this.resolveDevPermissions(scope);

    const response: TokenResponseDto = {
      access_token: issueAccessToken(runtime, {
        subject,
        clientId: client.clientId,
        email,
        name,
        avatarUrl: null,
        orgId,
        permissions,
        scope,
        tokenKind: 'user',
      }),
      token_type: 'bearer',
      expires_in: runtime.accessTokenTtlSeconds,
      scope: scope.join(' '),
    };

    if (scope.includes('openid')) {
      response.id_token = issueIdToken(runtime, {
        clientId: client.clientId,
        subject,
        email,
        name,
        avatarUrl: null,
        orgId,
        permissions,
      });
    }

    return response;
  }

  @Post('verify')
  @Public()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Inspect an auth-handler-issued access token' })
  @ApiResponse({ status: 200, type: AuthorizerResultDto })
  verify(@Headers('authorization') authorization: string | undefined): AuthorizerResultDto {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (!token) {
      return { effect: 'Deny', principalId: 'unauthorized', context: null };
    }

    try {
      const session = this.providerService.verifyAccessToken(token);
      return this.allowResult(session);
    } catch {
      return { effect: 'Deny', principalId: 'unauthorized', context: null };
    }
  }

  @Post('clerk/verify')
  @Public()
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiExcludeEndpoint(process.env.NODE_ENV === 'production')
  @ApiOperation({ summary: 'Inspect a direct Clerk token using the local Clerk verifier' })
  @ApiResponse({ status: 200, type: AuthorizerResultDto })
  async verifyClerk(
    @Headers('authorization') authorization: string | undefined,
  ): Promise<AuthorizerResultDto> {
    const token = authorization?.replace(/^Bearer\s+/i, '').trim() ?? '';
    if (!token) {
      return { effect: 'Deny', principalId: 'unauthorized', context: null };
    }

    try {
      const oauthSession = await this.verifyClerkOauthAccessToken(token);
      if (oauthSession) {
        return this.allowResult(oauthSession);
      }

      const verifier = resolveAuthAdapter(
        'clerk',
        process.env.AUTH_SECRET_KEY,
        process.env.AUTH_PUBLISHABLE_KEY,
      );
      const session = await verifier.verifyToken(token);

      if (!session) {
        return { effect: 'Deny', principalId: 'unauthorized', context: null };
      }

      return this.allowResult(session);
    } catch {
      return { effect: 'Deny', principalId: 'unauthorized', context: null };
    }
  }

  private normalizeParams(raw: Record<string, unknown>): Record<string, string | undefined> {
    return Object.entries(raw).reduce<Record<string, string | undefined>>((acc, [key, value]) => {
      if (typeof value === 'string') {
        acc[key] = value;
      } else if (Array.isArray(value)) {
        acc[key] = typeof value[0] === 'string' ? value[0] : undefined;
      } else if (value !== undefined && value !== null) {
        acc[key] = String(value);
      } else {
        acc[key] = undefined;
      }
      return acc;
    }, {});
  }

  private applyCookies(response: Response, cookies: string[] | undefined): void {
    for (const cookie of cookies ?? []) {
      appendSetCookie(response, cookie);
    }
  }

  private redirectWithCookies(
    response: Response,
    result: { redirectUrl: string; cookies?: string[] },
  ): void {
    this.applyCookies(response, result.cookies);
    response.redirect(302, result.redirectUrl);
  }

  private resolveDevClient(clientId: string | undefined): AuthClientConfig {
    const resolvedClientId = clientId?.trim() || 'forge-local-spa';
    const client = this.configService.getClient(resolvedClientId);

    if (!client) {
      throw new BadRequestException(`Unknown client_id '${resolvedClientId}'.`);
    }

    return client;
  }

  private resolveDevScope(client: AuthClientConfig, rawScope: string | undefined): string[] {
    const scope = rawScope?.trim()
      ? rawScope.trim().split(/\s+/)
      : ['openid', 'profile', 'email', 'offline_access', 'agents:read'];

    const invalid = scope.filter(item => !client.scopes.includes(item));
    if (invalid.length > 0) {
      throw new BadRequestException(`Requested scope is not allowed: ${invalid.join(', ')}`);
    }

    return Array.from(new Set(scope));
  }

  private resolveDevPermissions(scope: string[]): string[] {
    const permissions = scope.filter(item => !['openid', 'profile', 'email', 'offline_access'].includes(item));
    return permissions.length > 0 ? permissions : ['*'];
  }

  private allowResult(session: AuthSession): AuthorizerResultDto {
    return {
      effect: 'Allow',
      principalId: session.user.id,
      context: {
        userId: session.user.id,
        email: session.user.email ?? '',
        name: session.user.name ?? '',
        avatarUrl: session.user.avatarUrl ?? '',
        orgId: session.tenantId ?? '',
        permissions: session.permissions,
      },
    };
  }

  private async verifyClerkOauthAccessToken(token: string): Promise<AuthSession | null> {
    const secretKey = process.env.AUTH_SECRET_KEY?.trim();
    const discoveryUrl = process.env.AUTH_HANDLER_CLERK_DISCOVERY_URL?.trim();

    if (!secretKey || !discoveryUrl) {
      return null;
    }

    const verifyResponse = await fetch(
      'https://api.clerk.com/oauth_applications/access_tokens/verify',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: token }),
      },
    );

    if (!verifyResponse.ok) {
      return null;
    }

    const verifyPayload = (await verifyResponse.json()) as Record<string, unknown>;
    const metadataResponse = await fetch(discoveryUrl);
    if (!metadataResponse.ok) {
      return null;
    }

    const metadata = (await metadataResponse.json()) as { userinfo_endpoint?: string };
    if (!metadata.userinfo_endpoint) {
      return null;
    }

    const userinfoResponse = await fetch(metadata.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userinfoResponse.ok) {
      return null;
    }

    const claims = (await userinfoResponse.json()) as Record<string, unknown>;
    const userId = this.readStringClaim(claims, ['sub']) ?? this.readStringClaim(verifyPayload, ['user_id', 'sub']);

    if (!userId) {
      return null;
    }

    return {
      user: {
        id: userId,
        email: this.readStringClaim(claims, ['email']),
        name: this.readStringClaim(claims, ['name', 'preferred_username']),
        avatarUrl: this.readStringClaim(claims, ['picture', 'image_url']),
      },
      tenantId: this.readStringClaim(claims, ['org_id', 'organization_id']),
      permissions: this.readScopeClaim(verifyPayload).filter(Boolean),
    };
  }

  private readStringClaim(
    claims: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return null;
  }

  private readScopeClaim(claims: Record<string, unknown>): string[] {
    const scopes = claims['scopes'];
    if (Array.isArray(scopes)) {
      return scopes.filter((value): value is string => typeof value === 'string' && value.length > 0);
    }

    const scope = claims['scope'];
    if (typeof scope === 'string') {
      return scope.split(/\s+/).filter(Boolean);
    }

    return [];
  }
}
