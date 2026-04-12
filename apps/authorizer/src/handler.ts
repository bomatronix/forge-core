import type { APIGatewayAuthorizerResult, APIGatewayTokenAuthorizerEvent } from 'aws-lambda';
import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager';
// Direct adapter import is intentional: this is a standalone Lambda with no NestJS DI container.
// Importing from the deep adapter path (not from @forge-core/core barrel) keeps the bundle
// small (~150 KB) by avoiding pulling in the full NestJS runtime.
import { AuthHandlerTokenVerifier } from '@forge-core/core/auth/adapters/platform/token-verifier';
import { normalizePem } from '@forge-core/core/auth/platform-tokens';
import type { AuthTokenVerifier } from '@forge-core/core/auth/contracts';
import type { AuthSession } from '@forge-core/core/auth/types';

/**
 * Lambda authorizer for platform access tokens issued by apps/auth-handler.
 *
 * The API no longer trusts upstream provider-native tokens directly. Instead,
 * auth-handler federates upstream login and issues the platform JWT that this
 * authorizer validates before forwarding the normalized user context.
 *
 * Environment variables (plain values or Secrets Manager ARNs):
 *   AUTH_HANDLER_ISSUER
 *   AUTH_HANDLER_AUDIENCE
 *   AUTH_HANDLER_PUBLIC_KEY
 */

const secretsClient = new SecretsManagerClient({});

const isArn = (value: string) => value.startsWith('arn:aws:secretsmanager:');

// TODO(auth): Revisit shared logging for standalone auth paths so this Lambda and the
// low-level auth adapters can use one consistent approach without unnecessary Nest coupling.
function logError(message: string, error: unknown): void {
  const detail = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message} ${detail}\n`);
}

async function resolveSecret(value: string): Promise<string> {
  if (!value || !isArn(value)) return value;

  const result = await secretsClient.send(new GetSecretValueCommand({ SecretId: value }));
  const raw = result.SecretString ?? '';

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const values = Object.values(parsed as Record<string, unknown>);
      if (values.length === 1 && typeof values[0] === 'string') {
        return values[0];
      }
    }
  } catch {
    // Plain string secrets are also supported.
  }

  return raw;
}

// Wraps concrete adapter instantiation — keeps the pattern consistent with multi-provider
// handlers and makes it easy to add other providers here without changing call sites.
function resolveAdapter(issuer?: string, audience?: string, publicKey?: string): AuthTokenVerifier {
  return new AuthHandlerTokenVerifier({ issuer, audience, publicKey });
}

let adapter: AuthTokenVerifier | null = null;

async function getAdapter(): Promise<AuthTokenVerifier> {
  if (adapter) return adapter;

  const [issuer, audience, publicKey] = await Promise.all([
    resolveSecret(process.env.AUTH_HANDLER_ISSUER ?? ''),
    resolveSecret(process.env.AUTH_HANDLER_AUDIENCE ?? ''),
    resolveSecret(process.env.AUTH_HANDLER_PUBLIC_KEY ?? ''),
  ]);

  adapter = resolveAdapter(
    issuer || undefined,
    audience || undefined,
    normalizePem(publicKey) || undefined,
  );

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
  } catch (err) {
    logError('[authorizer] token verification failed:', err);
    return denyPolicy(event.methodArn);
  }
};

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
      permissions: session.permissions.join(','),
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
