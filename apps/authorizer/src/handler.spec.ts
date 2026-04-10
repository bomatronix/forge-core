import type { APIGatewayTokenAuthorizerEvent } from 'aws-lambda';

// Mock @clerk/backend before importing the handler so ClerkTokenVerifier uses the mock
jest.mock('@clerk/backend', () => ({
  verifyToken: jest.fn(),
}));

import { verifyToken as clerkVerifyToken } from '@clerk/backend';
import { handler } from './handler';

const mockVerifyToken = clerkVerifyToken as jest.MockedFunction<typeof clerkVerifyToken>;

// Tokens must start with 'eyJ' so ClerkTokenVerifier routes to the mocked
// clerkVerifyToken() path rather than the authenticateRequest() path.
const mockEvent = (token: string): APIGatewayTokenAuthorizerEvent => ({
  type: 'TOKEN',
  authorizationToken: `Bearer eyJ${token}`,
  methodArn: 'arn:aws:execute-api:us-east-1:123456789:abc123/prod/GET/api/agents',
});

const mockPayload = {
  sub: 'user_abc123',
  email: 'alice@example.com',
  name: 'Alice',
  image_url: 'https://example.com/avatar.jpg',
  org_id: 'org_xyz',
  // minimal required JWT fields
  iss: 'https://clerk.example.com',
  aud: 'forge-core',
  exp: Math.floor(Date.now() / 1000) + 3600,
  iat: Math.floor(Date.now() / 1000),
  nbf: Math.floor(Date.now() / 1000),
  jti: 'jwt_abc',
  sid: 'sess_abc',
  azp: 'forge-core',
};

beforeEach(() => {
  jest.clearAllMocks();
  process.env.AUTH_PROVIDER = 'clerk';
  process.env.AUTH_SECRET_KEY = 'sk_test_fake';
});

afterEach(() => {
  delete process.env.AUTH_PROVIDER;
  delete process.env.AUTH_SECRET_KEY;
});

describe('Lambda Authorizer handler', () => {
  it('returns Allow policy with user context for a valid token', async () => {
    mockVerifyToken.mockResolvedValueOnce(mockPayload as never);

    const result = await handler(mockEvent('valid-jwt'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    expect(result.principalId).toBe('user_abc123');
    expect(result.context).toEqual({
      userId: 'user_abc123',
      email: 'alice@example.com',
      name: 'Alice',
      avatarUrl: 'https://example.com/avatar.jpg',
      orgId: 'org_xyz',
    });
  });

  it('returns Deny policy when verifyToken returns null (invalid token)', async () => {
    mockVerifyToken.mockResolvedValueOnce(null as never);

    const result = await handler(mockEvent('invalid-jwt'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    expect(result.principalId).toBe('unauthorized');
    expect(result.context).toBeUndefined();
  });

  it('returns Deny policy when verifyToken throws (expired, bad signature, etc.)', async () => {
    mockVerifyToken.mockRejectedValueOnce(new Error('Token expired'));

    const result = await handler(mockEvent('expired-jwt'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });

  it('strips Bearer prefix before passing token to adapter', async () => {
    mockVerifyToken.mockResolvedValueOnce(mockPayload as never);

    await handler(mockEvent('my-raw-token'));

    expect(mockVerifyToken).toHaveBeenCalledWith('eyJmy-raw-token', expect.any(Object));
  });

  it('context values are strings (REST API authorizer requirement)', async () => {
    mockVerifyToken.mockResolvedValueOnce({
      ...mockPayload,
      email: undefined,
      name: undefined,
      image_url: undefined,
      org_id: undefined,
    } as never);

    const result = await handler(mockEvent('valid-jwt'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    // Undefined fields must become empty strings, not undefined/null
    expect(result.context?.email).toBe('');
    expect(result.context?.name).toBe('');
    expect(result.context?.avatarUrl).toBe('');
    expect(result.context?.orgId).toBe('');
  });

  it('returns Deny policy for unsupported AUTH_PROVIDER', async () => {
    process.env.AUTH_PROVIDER = 'unsupported-provider';

    const result = await handler(mockEvent('any-token'));

    expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
  });
});
