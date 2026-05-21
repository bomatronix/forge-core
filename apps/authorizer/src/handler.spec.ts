import type { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';
import {
  getAuthHandlerRuntimeConfig,
  issueAccessToken,
  issueIdToken,
} from '@forge-core/core/auth/platform-tokens';
import { handler } from './handler';

const runtime = getAuthHandlerRuntimeConfig();

const mockEvent = (
  token: string,
  path = '/api/auth/me',
  method = 'GET',
  authorizerMethod = method,
): APIGatewayRequestAuthorizerEvent => ({
  type: 'REQUEST',
  methodArn: `arn:aws:execute-api:us-east-1:123456789:abc123/prod/${method}${path}`,
  resource: path,
  path,
  httpMethod: authorizerMethod,
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  multiValueHeaders: {},
  pathParameters: null,
  queryStringParameters: null,
  multiValueQueryStringParameters: null,
  stageVariables: null,
  requestContext: {
    httpMethod: method,
  } as APIGatewayRequestAuthorizerEvent['requestContext'],
});

const buildUserToken = (
  overrides: Partial<{
    subject: string;
    email: string | null;
    name: string | null;
    avatarUrl: string | null;
    orgId: string | null;
    permissions: string[];
    scope: string[];
  }> = {},
) =>
  issueAccessToken(runtime, {
    subject: 'subject' in overrides ? (overrides.subject ?? 'user_abc123') : 'user_abc123',
    clientId: 'forge-swagger-ui',
    email: 'email' in overrides ? (overrides.email ?? null) : 'alice@example.com',
    name: 'name' in overrides ? (overrides.name ?? null) : 'Alice',
    avatarUrl:
      'avatarUrl' in overrides ? (overrides.avatarUrl ?? null) : 'https://example.com/avatar.jpg',
    orgId: 'orgId' in overrides ? (overrides.orgId ?? null) : 'org_xyz',
    permissions: overrides.permissions ?? ['org:agents:read', 'org:agents:write'],
    scope: overrides.scope ?? ['openid', 'profile', 'email', 'agents:read', 'agents:write'],
    tokenKind: 'user',
  });

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
  delete process.env.AUTH_HANDLER_ISSUER;
  delete process.env.AUTH_HANDLER_AUDIENCE;
  delete process.env.AUTH_HANDLER_PUBLIC_KEY;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('Lambda Authorizer handler', () => {
  it('returns Allow policy with anonymous principal for public paths (no token required)', async () => {
    const result = await handler(mockEvent('', '/api/health', 'GET'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows public agent metadata through the authorizer without a bearer token', async () => {
    const result = await handler(mockEvent('', '/api/public/agents/agent_123', 'GET'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows stage-prefixed public health paths through the authorizer without a bearer token', async () => {
    const result = await handler(mockEvent('', '/v1/api/health', 'GET'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows stage-prefixed public agent metadata through the authorizer without a bearer token', async () => {
    const result = await handler(mockEvent('', '/v1/api/public/agents/agent_123', 'GET'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('uses the real request method for API Gateway ANY proxy routes', async () => {
    const result = await handler(mockEvent('', '/api/public/agents/agent_123', 'GET', 'ANY'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows public agent streams through the authorizer without a bearer token', async () => {
    const result = await handler(mockEvent('', '/api/public/agents/agent_123/chat/stream', 'POST'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows stage-prefixed public agent streams through the authorizer without a bearer token', async () => {
    const result = await handler(
      mockEvent('', '/v1/api/public/agents/agent_123/chat/stream', 'POST'),
    );

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows public agent streams for API Gateway ANY proxy routes', async () => {
    const result = await handler(
      mockEvent('', '/api/public/agents/agent_123/chat/stream', 'POST', 'ANY'),
    );

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows public channel webhooks through the authorizer without a bearer token', async () => {
    const result = await handler(mockEvent('', '/api/public/webhook/channel_123', 'POST'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows stage-prefixed public channel webhooks through the authorizer', async () => {
    const result = await handler(mockEvent('', '/v1/api/public/webhook/channel_123', 'POST'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('allows public channel webhooks for API Gateway ANY proxy routes', async () => {
    const result = await handler(mockEvent('', '/api/public/webhook/channel_123', 'POST', 'ANY'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('anonymous');
  });

  it('does not treat nearby public agent paths as authorizer-public', async () => {
    const result = await handler(mockEvent('', '/api/public/agents/agent_123/chat', 'POST'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unauthorized');
  });

  it('does not treat nearby stage-prefixed public agent paths as authorizer-public', async () => {
    const result = await handler(mockEvent('', '/v1/api/public/agents/agent_123/chat', 'POST'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unauthorized');
  });

  it('does not treat nearby public agent paths as authorizer-public for API Gateway ANY proxy routes', async () => {
    const result = await handler(mockEvent('', '/api/public/agents/agent_123/chat', 'POST', 'ANY'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unauthorized');
  });

  it('returns Allow policy with normalized user context for a valid platform access token', async () => {
    const token = buildUserToken();

    const result = await handler(mockEvent(token));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('user_abc123');
    expect(result.context).toEqual({
      userId: 'user_abc123',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://example.com/avatar.jpg',
      orgId: 'org_xyz',
      permissions: 'org:agents:read,org:agents:write',
    });
  });

  it('returns Deny policy when the token is missing', async () => {
    const result = await handler(mockEvent(''));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unauthorized');
    expect(result.context).toBeUndefined();
  });

  it('returns Deny policy when the token is not an auth-handler-issued access token', async () => {
    const result = await handler(mockEvent('eyJnot-a-real-platform-token'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('returns Deny policy for auth-handler id_tokens', async () => {
    const idToken = issueIdToken(runtime, {
      clientId: 'forge-swagger-ui',
      subject: 'user_abc123',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://example.com/avatar.jpg',
      orgId: 'org_xyz',
      permissions: ['org:agents:read'],
    });

    const result = await handler(mockEvent(idToken));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('context values are always strings for REST API authorizer compatibility', async () => {
    const token = buildUserToken({
      email: null,
      name: null,
      avatarUrl: null,
      orgId: null,
      permissions: [],
      scope: ['openid'],
    });

    const result = await handler(mockEvent(token));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.context?.email).toBe('');
    expect(result.context?.name).toBe('');
    expect(result.context?.avatarUrl).toBe('');
    expect(result.context?.orgId).toBe('');
    expect(result.context?.permissions).toBe('');
  });
});
