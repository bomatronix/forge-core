import { AuthHandlerConfigService } from './auth-handler.config';

describe('AuthHandlerConfigService', () => {
  afterEach(() => {
    delete process.env.AUTH_HANDLER_CLIENTS_JSON;
    delete process.env.AUTH_HANDLER_CONNECTIONS_JSON;
  });

  it('includes the built-in forge-postman client by default', () => {
    const service = new AuthHandlerConfigService();

    const client = service.getClient('forge-postman');
    expect(client).toBeDefined();
    expect(client?.redirectUris).toContain('https://oauth.pstmn.io/v1/callback');
  });

  it('always includes the local bypass connection', () => {
    const service = new AuthHandlerConfigService();

    const connection = service.getConnection('local');
    expect(connection).toBeDefined();
    expect(connection).toMatchObject({ id: 'local', type: 'dev' });
  });

  it('adds upstream connections from AUTH_HANDLER_CONNECTIONS_JSON', () => {
    process.env.AUTH_HANDLER_CONNECTIONS_JSON = JSON.stringify([
      {
        id: 'clerk',
        name: 'Clerk',
        type: 'oidc',
        discoveryUrl: 'https://example.clerk.accounts.dev/.well-known/openid-configuration',
        clientId: 'clerk-client-id',
        clientSecret: 'clerk-client-secret',
        scopes: ['openid', 'profile', 'email'],
      },
    ]);

    const service = new AuthHandlerConfigService();

    const connection = service.getConnection('clerk');
    expect(connection).toBeDefined();
    expect(connection).toMatchObject({
      id: 'clerk',
      type: 'oidc',
      discoveryUrl: 'https://example.clerk.accounts.dev/.well-known/openid-configuration',
      clientId: 'clerk-client-id',
      clientSecret: 'clerk-client-secret',
      scopes: ['openid', 'profile', 'email'],
    });
  });
});
