import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import type { AuthProviderKey } from '@forge-core/core';
import { resolveAuthAdapter } from '@forge-core/core';
import type { AuthSession } from '@forge-core/core';

/**
 * Provider-agnostic Lambda Authorizer for API Gateway REST API (token-based).
 *
 * Delegates token verification to the same adapter registry used by the NestJS app.
 * Set AUTH_PROVIDER to the direct provider (e.g. 'clerk', 'next-auth', 'okta').
 * Do NOT set AUTH_PROVIDER=lambda-authorizer here — this IS the authorizer.
 *
 * On success: returns an IAM Allow policy + user claims in the context object.
 * On failure: returns an IAM Deny policy.
 *
 * API Gateway caches the result by token value (default TTL: 300s, max: 3600s).
 * The context object is forwarded to the main Lambda via event.requestContext.authorizer.
 *
 * Environment variables:
 *   AUTH_PROVIDER   — provider key (default: 'clerk')
 *   AUTH_SECRET_KEY — provider-specific secret key
 */
export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const provider = (process.env.AUTH_PROVIDER ?? 'clerk') as AuthProviderKey;

  if (provider === 'lambda-authorizer') {
    throw new Error(
      "AUTH_PROVIDER='lambda-authorizer' is invalid for the authorizer Lambda. " +
        'Set AUTH_PROVIDER to a direct provider (clerk, next-auth, okta).',
    );
  }

  const adapter = resolveAuthAdapter(provider, process.env.AUTH_SECRET_KEY);
  const token = event.authorizationToken?.replace(/^Bearer\s+/i, '') ?? '';

  try {
    const session = await adapter.verifyToken(token);
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
