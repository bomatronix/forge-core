import { AuthHandlerConfigService } from './auth-handler.config';

describe('AuthHandlerConfigService', () => {
  afterEach(() => {
    delete process.env.AUTH_HANDLER_CLIENTS_JSON;
    delete process.env.AUTH_HANDLER_CONNECTIONS_JSON;
    delete process.env.AUTH_HANDLER_CLERK_CONNECTION_ID;
    delete process.env.AUTH_HANDLER_CLERK_CONNECTION_NAME;
    delete process.env.AUTH_HANDLER_CLERK_DISCOVERY_URL;
    delete process.env.AUTH_HANDLER_CLERK_CLIENT_ID;
    delete process.env.AUTH_HANDLER_CLERK_CLIENT_SECRET;
    delete process.env.AUTH_HANDLER_CLERK_SCOPES;
  });

  it('includes the built-in forge-postman client by default', () => {
    const service = new AuthHandlerConfigService();

    const client = service.getClient('forge-postman');
    expect(client).toBeDefined();
    expect(client?.redirectUris).toContain('https://oauth.pstmn.io/v1/callback');
  });

  it('adds a default Clerk upstream connection when env vars are set', () => {
    process.env.AUTH_HANDLER_CLERK_DISCOVERY_URL = 'https://example.clerk.accounts.dev/.well-known/openid-configuration';
    process.env.AUTH_HANDLER_CLERK_CLIENT_ID = 'clerk-client-id';
    process.env.AUTH_HANDLER_CLERK_CLIENT_SECRET = 'clerk-client-secret';
    process.env.AUTH_HANDLER_CLERK_SCOPES = 'openid profile email';

    const service = new AuthHandlerConfigService();

    const connection = service.getConnection('clerk');
    expect(connection).toBeDefined();
    expect(connection).toMatchObject({
      id: 'clerk',
      type: 'clerk',
      discoveryUrl: 'https://example.clerk.accounts.dev/.well-known/openid-configuration',
      clientId: 'clerk-client-id',
      clientSecret: 'clerk-client-secret',
      scopes: ['openid', 'profile', 'email'],
    });
  });
});
