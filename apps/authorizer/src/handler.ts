import type { APIGatewayTokenAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { ClerkTokenVerifier } from '@forge-core/core/auth/adapters/clerk/token-verifier';
import { OktaTokenVerifier } from '@forge-core/core/auth/adapters/okta/token-verifier';
import { NextAuthTokenVerifier } from '@forge-core/core/auth/adapters/next-auth/token-verifier';
import type { AuthTokenVerifier } from '@forge-core/core/auth/contracts';
import type { AuthSession } from '@forge-core/core/auth/types';

/**
 * Provider-agnostic Lambda Authorizer for API Gateway REST API (token-based).
 *
 * Imports adapters directly (not via resolveAuthAdapter) to avoid pulling in
 * the full NestJS/Express runtime — keeps the bundle ~150 KB.
 *
 * On success: returns an IAM Allow policy + user claims in the context object.
 * On failure: returns an IAM Deny policy.
 *
 * API Gateway caches the result by token value (default TTL: 300s, max: 3600s).
 * The context object is forwarded to the main Lambda via event.requestContext.authorizer.
 *
 * Environment variables (plain values or Secrets Manager ARNs):
 *   AUTH_PROVIDER   — provider key: 'clerk' (default) | 'okta' | 'next-auth'
 *   AUTH_SECRET_KEY — provider-specific secret key
 */

const secretsClient = new SecretsManagerClient({});

const isArn = (value: string) => value.startsWith('arn:aws:secretsmanager:');

async function resolveSecret(value: string): Promise<string> {
  if (!isArn(value)) return value;
  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: value }));
  return result.SecretString ?? '';
}

function resolveAdapter(provider: string, secretKey: string): AuthTokenVerifier {
  switch (provider) {
    case 'clerk':     return new ClerkTokenVerifier(secretKey);
    case 'okta':      return new OktaTokenVerifier();
    case 'next-auth': return new NextAuthTokenVerifier();
    default:          throw new Error(`Unsupported AUTH_PROVIDER: '${provider}'`);
  }
}

// Resolved at cold start and cached across warm invocations.
let adapter: AuthTokenVerifier | null = null;

async function getAdapter(): Promise<AuthTokenVerifier> {
  if (adapter) return adapter;

  const [provider, secretKey] = await Promise.all([
    resolveSecret(process.env.AUTH_PROVIDER ?? 'clerk'),
    resolveSecret(process.env.AUTH_SECRET_KEY ?? ''),
  ]);

  adapter = resolveAdapter(provider, secretKey);
  return adapter;
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken?.replace(/^Bearer\s+/i, '') ?? '';

  try {
    const verifier = await getAdapter();
    const session = await verifier.verifyToken(token);
    if (!session) {
      return denyPolicy(event.methodArn);
    }
    return allowPolicy(event.methodArn, session);
  } catch {
    return denyPolicy(event.methodArn);
  }
};

/**
 * REST API authorizer context values must be strings.
 * The LambdaAuthorizerContextReader in the main Lambda reads these keys.
 */
function allowPolicy(methodArn: string, session: AuthSession): APIGatewayAuthorizerResult {
  return {
    principalId: session.user.id,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Allow',
          Resource: methodArn,
        },
      ],
    },
    context: {
      userId: session.user.id,
      email: session.user.email ?? '',
      name: session.user.name ?? '',
      avatarUrl: session.user.avatarUrl ?? '',
      orgId: session.tenantId ?? '',
    },
  };
}

function denyPolicy(methodArn: string): APIGatewayAuthorizerResult {
  return {
    principalId: 'unauthorized',
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: 'Deny',
          Resource: methodArn,
        },
      ],
    },
  };
}
