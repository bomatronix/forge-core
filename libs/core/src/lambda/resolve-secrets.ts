import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({});

/** True when value looks like a Secrets Manager ARN. */
export function isArn(value: string): boolean {
  return value.startsWith('arn:aws:secretsmanager:');
}

/**
 * Resolves a single value: if it's an ARN, fetches the secret from Secrets Manager
 * and unwraps single-key JSON wrappers (e.g. `{"value":"..."}`). Plain strings pass through.
 */
export async function resolveSecret(value: string): Promise<string> {
  if (!value || !isArn(value)) return value;

  const result = await client.send(new GetSecretValueCommand({ SecretId: value }));
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
    // Plain string secret — use raw directly.
  }

  return raw;
}

/**
 * Scans `process.env` for ARN-shaped values and resolves each in parallel,
 * writing the plaintext back to `process.env` before the caller boots.
 *
 * Call this at the top of a Lambda bootstrap function so that any code that
 * reads `process.env` directly (e.g. NestJS config, JSON.parse) receives the
 * resolved secret value rather than the raw Secrets Manager ARN.
 */
export async function resolveSecretsToEnv(): Promise<void> {
  const entries = (Object.entries(process.env) as [string, string][]).filter(
    ([, v]) => v && isArn(v),
  );
  if (entries.length === 0) return;

  await Promise.all(
    entries.map(async ([key, arn]) => {
      process.env[key] = await resolveSecret(arn);
    }),
  );
}
