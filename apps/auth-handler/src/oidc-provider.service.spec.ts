import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthClientConfig, UserInfoResponse } from '@forge-core/core/auth/oauth.types';
import { AuthHandlerConfigService } from './auth-handler.config';
import { AuthPersistenceStore } from './auth-store';
import { OidcProviderService } from './oidc-provider.service';
import { UpstreamOidcService } from './upstream-oidc.service';

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
    .map(cookie => cookie.split(';', 1)[0])
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
    expect(redirect.origin + redirect.pathname).toBe('http://localhost:3001/api/docs/oauth2-redirect.html');
    expect(redirect.searchParams.get('code')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe('state-123');

    const tokenResponse = await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'authorization_code',
        client_id: 'forge-swagger-ui',
        code: redirect.searchParams.get('code') ?? undefined,
        redirect_uri: 'http://localhost:3001/api/docs/oauth2-redirect.html',
        code_verifier: 'verifier-123',
      },
      undefined,
    ) as Record<string, string>;

    expect(tokenResponse.access_token).toBeTruthy();
    expect(tokenResponse.id_token).toBeTruthy();
    expect(tokenResponse.refresh_token).toBeTruthy();

    const userInfo = service.getUserInfo(`Bearer ${tokenResponse.access_token}`) as UserInfoResponse;
    expect(userInfo.sub).toBe('dev-user-id');
    expect(userInfo.permissions).toEqual(['agents:read']);

    const refreshResponse = await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'refresh_token',
        client_id: 'forge-swagger-ui',
        refresh_token: tokenResponse.refresh_token,
      },
      undefined,
    ) as Record<string, string>;

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

    const consentResult = await service.submitConsent(
      createRequest(cookieHeader),
      'approve',
    );
    const redirect = new URL(consentResult.redirectUrl);
    expect(redirect.origin + redirect.pathname).toBe('http://localhost:4000/callback');
    expect(redirect.searchParams.get('code')).toBeTruthy();
    expect(redirect.searchParams.get('state')).toBe('third-party-state');
  });

  it('issues machine tokens via client_credentials and blocks them from userinfo', async () => {
    const service = createService();

    const tokenResponse = await service.exchangeToken(
      createRequest(),
      {
        grant_type: 'client_credentials',
        client_id: 'forge-machine-client',
        client_secret: 'forge-machine-secret',
        scope: 'agents:read agents:write',
      },
      undefined,
    ) as Record<string, string>;

    expect(tokenResponse.access_token).toBeTruthy();
    expect(tokenResponse.scope).toBe('agents:read agents:write');

    expect(() => service.getUserInfo(`Bearer ${tokenResponse.access_token}`)).toThrow(ForbiddenException);
  });
});
