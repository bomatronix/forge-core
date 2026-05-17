import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthClientConfig, UserInfoResponse } from '@forge-core/core/auth/oauth.types';
import { AuthHandlerConfigService } from './auth-handler.config';
import { AuthPersistenceStore } from './auth-store';
import { OidcProviderService } from './oidc-provider.service';
import { UpstreamOidcService } from './upstream-oidc.service';

jest.mock('@clerk/backend', () => ({
  createClerkClient: jest.fn(),
}));

function createRequest(cookie?: string): Request {
  return {
    headers: cookie ? { cookie } : {},
    protocol: 'http',
    get: (header: string) => {
      if (header.toLowerCase() === 'host') return 'localhost:3002';
      return undefined;
    },
  } as unknown as Request;
}

function browserCookieHeader(cookies: string[] | undefined): string {
  return (cookies ?? [])
    .map((cookie) => cookie.split(';', 1)[0])
    .filter(Boolean)
    .join('; ');
}

function createService(clientOverrides?: AuthClientConfig[]): OidcProviderService {
  if (clientOverrides) {
    process.env.AUTH_HANDLER_CLIENTS_JSON = JSON.stringify(clientOverrides);
  } else {
    delete process.env.AUTH_HANDLER_CLIENTS_JSON;
  }

  delete process.env.AUTH_HANDLER_CONNECTIONS_JSON;

  return new OidcProviderService(
    new AuthHandlerConfigService(),
    new AuthPersistenceStore(),
    new UpstreamOidcService(),
  );
}

describe('OidcProviderService', () => {
  afterEach(() => {
    delete process.env.AUTH_HANDLER_CLIENTS_JSON;
    delete process.env.AUTH_HANDLER_CONNECTIONS_JSON;
  });

  it('completes the local dev authorization-code flow for first-party clients', async () => {
    const service = createService();

    const authorizeResult = await service.beginAuthorization(createRequest(), {
      client_id: 'forge-swagger-ui',
      redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
      response_type: 'code',
      scope: 'openid profile email offline_access agents:read',
      state: 'state-123',
      nonce: 'nonce-123',
      code_challenge: 'verifier-123',
      code_challenge_method: 'plain',
    });

    const redirect = new URL(authorizeResult.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe(
      'http://localhost:3001/api/docs/oauth2-redirect.html',
    );
    expect(redirect.searchParams.get('code')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe('state-123');

    const tokenResponse = (await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'authorization_code',
        client_id: 'forge-swagger-ui',
        code: redirect.searchParams.get('code') ?? undefined,
        redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
        code_verifier: 'verifier-123',
      },
      undefined,
    )) as Record<string, string>;

    expect(tokenResponse.access_token).toBeTruthy();
    expect(tokenResponse.id_token).toBeTruthy();
    expect(tokenResponse.refresh_token).toBeTruthy();

    const userInfo = service.getUserInfo(
      `Bearer ${tokenResponse.access_token}`,
    ) as UserInfoResponse;
    expect(userInfo.sub).toBe('dev-user-id');
    expect(userInfo.permissions).toEqual(['agents:read']);

    const refreshResponse = (await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'refresh_token',
        client_id: 'forge-swagger-ui',
        refresh_token: tokenResponse.refresh_token,
      },
      undefined,
    )) as Record<string, string>;

    expect(refreshResponse.access_token).toBeTruthy();
    expect(refreshResponse.refresh_token).toBeTruthy();
    expect(refreshResponse.refresh_token).not.toBe(tokenResponse.refresh_token);
  });

  it('requires consent for third-party clients before issuing a code', async () => {
    const service = createService([
      {
        clientId: 'third-party-app',
        name: 'Third Party App',
        type: 'public',
        firstParty: false,
        redirectUris: ['http://localhost:4000/callback'],
        scopes: ['openid', 'profile', 'email', 'agents:read'],
        grantTypes: ['authorization_code'],
        responseTypes: ['code'],
        defaultConnectionId: 'local',
      },
    ]);

    const authorizeResult = await service.beginAuthorization(createRequest(), {
      client_id: 'third-party-app',
      redirect_uri: 'http://localhost:4000/callback',
      response_type: 'code',
      scope: 'openid profile email agents:read',
      state: 'third-party-state',
    });

    expect(authorizeResult.redirectUrl).toBe('http://localhost:3002/auth/consent');

    const cookieHeader = browserCookieHeader(authorizeResult.cookies);
    const consentPage = service.getConsentPage(createRequest(cookieHeader));
    expect(consentPage).toContain('Third Party App');

    const consentResult = await service.submitConsent(createRequest(cookieHeader), 'approve');
    const redirect = new URL(consentResult.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe('http://localhost:4000/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe('third-party-state');
  });

  it('loginWithCredentials via Clerk populates orgId from org membership into the platform token', async () => {
    const { createClerkClient } = await import('@clerk/backend');
    const mockClerk = {
      users: {
        getUserList: jest.fn().mockResolvedValue({
          data: [
            {
              id: 'user_clerk123',
              primaryEmailAddressId: 'email_1',
              emailAddresses: [{ id: 'email_1', emailAddress: 'alice@example.com' }],
              firstName: 'Alice',
              lastName: 'Smith',
              imageUrl: null,
            },
          ],
        }),
        verifyPassword: jest.fn().mockResolvedValue({}),
        getOrganizationMembershipList: jest.fn().mockResolvedValue({
          data: [
            {
              organization: { id: 'org_mindrithm123' },
              permissions: ['org:agents:read', 'org:agents:write'],
            },
          ],
        }),
      },
    };
    (createClerkClient as jest.Mock).mockReturnValue(mockClerk);

    // Set Clerk connection before instantiating so AuthHandlerConfigService picks it up
    process.env.AUTH_HANDLER_CONNECTIONS_JSON = JSON.stringify([
      {
        id: 'clerk',
        name: 'Clerk',
        type: 'oidc',
        discoveryUrl: 'https://clerk.example.com/.well-known/openid-configuration',
        clientId: 'clerk-client-id',
        secretKey: 'sk_test_fake',
      },
    ]);

    // Instantiate directly to preserve the env var (createService() deletes it)
    const service = new OidcProviderService(
      new AuthHandlerConfigService(),
      new AuthPersistenceStore(),
      new UpstreamOidcService(),
    );

    const loginResult = await service.loginWithCredentials(createRequest(), {
      client_id: 'agent-forge-web',
      redirect_uri: 'https://mindrithm.app/callback',
      email: 'alice@example.com',
      password: 'correct-password',
      connection: 'clerk',
      scope: 'openid profile email agents:read agents:write',
      code_challenge: 'challenge-clerk',
      code_challenge_method: 'plain',
    });

    const redirect = new URL(loginResult.redirectUrl);
    const code = redirect.searchParams.get('code');
    expect(code).toBeTruthy();
    expect(mockClerk.users.getOrganizationMembershipList).toHaveBeenCalledWith({
      userId: 'user_clerk123',
    });

    const tokenResponse = (await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'authorization_code',
        client_id: 'agent-forge-web',
        code: code ?? undefined,
        redirect_uri: 'https://mindrithm.app/callback',
        code_verifier: 'challenge-clerk',
      },
      undefined,
    )) as Record<string, string>;

    expect(tokenResponse.access_token).toBeTruthy();

    const userInfo = service.getUserInfo(
      `Bearer ${tokenResponse.access_token}`,
    ) as UserInfoResponse;
    expect(userInfo.sub).toBe('user_clerk123');
    expect((userInfo as unknown as Record<string, unknown>).org_id).toBe('org_mindrithm123');
  });

  it('org_id from authorization request is embedded in the platform token', async () => {
    const service = createService();

    const authorizeResult = await service.beginAuthorization(createRequest(), {
      client_id: 'forge-swagger-ui',
      redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
      response_type: 'code',
      scope: 'openid profile email agents:read',
      code_challenge: 'verifier-org',
      code_challenge_method: 'plain',
      org_id: 'org_test123',
    });

    const code = new URL(authorizeResult.redirectUrl).searchParams.get('code');
    expect(code).toBeTruthy();

    const tokenResponse = (await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'authorization_code',
        client_id: 'forge-swagger-ui',
        code: code ?? undefined,
        redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
        code_verifier: 'verifier-org',
      },
      undefined,
    )) as Record<string, string>;

    const userInfo = service.getUserInfo(
      `Bearer ${tokenResponse.access_token}`,
    ) as UserInfoResponse;
    expect((userInfo as unknown as Record<string, unknown>).org_id).toBe('org_test123');
  });

  it('org_id from authorization request takes precedence over upstream profile orgId', async () => {
    const mockUpstreamOidcService = {
      buildAuthorizationUrl: jest
        .fn()
        .mockImplementation((_conn: unknown, params: { state: string }) =>
          Promise.resolve(`https://upstream.example.com/authorize?state=${params.state}`),
        ),
      exchangeCodeForProfile: jest.fn().mockResolvedValue({
        sub: 'upstream-user-1',
        email: 'user@example.com',
        name: 'Test User',
        avatarUrl: null,
        orgId: 'upstream-org-from-provider',
      }),
    };

    process.env.AUTH_HANDLER_CONNECTIONS_JSON = JSON.stringify([
      {
        id: 'mock-oidc',
        name: 'Mock OIDC',
        type: 'oidc',
        discoveryUrl: 'https://upstream.example.com/.well-known/openid-configuration',
        clientId: 'mock-client',
      },
    ]);

    const service = new OidcProviderService(
      new AuthHandlerConfigService(),
      new AuthPersistenceStore(),
      mockUpstreamOidcService as unknown as UpstreamOidcService,
    );

    // Step 1: begin authorization with org_id from client
    const req = createRequest();
    const authorizeResult = await service.beginAuthorization(req, {
      client_id: 'forge-swagger-ui',
      redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
      response_type: 'code',
      scope: 'openid profile email agents:read',
      code_challenge: 'verifier-precedence',
      code_challenge_method: 'plain',
      connection: 'mock-oidc',
      org_id: 'client-supplied-org',
    });

    // Extract the upstream state from the redirect to Clerk
    const upstreamRedirect = new URL(authorizeResult.redirectUrl);
    const upstreamState = upstreamRedirect.searchParams.get('state') ?? 'x';

    // Step 2: simulate upstream callback — upstream returns orgId: 'upstream-org-from-provider'
    const cookieHeader = browserCookieHeader(authorizeResult.cookies);
    const callbackResult = await service.handleCallback(createRequest(cookieHeader), 'mock-oidc', {
      code: 'upstream-code',
      state: upstreamState,
    });

    const code = new URL(callbackResult.redirectUrl).searchParams.get('code');
    expect(code).toBeTruthy();

    const callbackCookieHeader = browserCookieHeader(callbackResult.cookies);
    const tokenResponse = (await service.exchangeToken(
      createRequest(callbackCookieHeader),
      {
        grant_type: 'authorization_code',
        client_id: 'forge-swagger-ui',
        code: code ?? undefined,
        redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
        code_verifier: 'verifier-precedence',
      },
      undefined,
    )) as Record<string, string>;

    const userInfo = service.getUserInfo(
      `Bearer ${tokenResponse.access_token}`,
    ) as UserInfoResponse;
    // client-supplied org_id wins over upstream provider's orgId
    expect((userInfo as unknown as Record<string, unknown>).org_id).toBe('client-supplied-org');
  });

  it('issues machine tokens via client_credentials and blocks them from userinfo', async () => {
    const service = createService();

    const tokenResponse = (await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'client_credentials',
        client_id: 'forge-machine-client',
        client_secret: 'forge-machine-secret',
        scope: 'agents:read agents:write',
      },
      undefined,
    )) as Record<string, string>;

    expect(tokenResponse.access_token).toBeTruthy();
    expect(tokenResponse.scope).toBe('agents:read agents:write');

    expect(() => service.getUserInfo(`Bearer ${tokenResponse.access_token}`)).toThrow(
      ForbiddenException,
    );
  });
});
