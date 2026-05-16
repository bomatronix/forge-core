import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALG = 'aes-256-gcm';
const ENC_MARKER = '__encrypted';

function getKey(): Buffer | null {
  const hex = process.env.DATA_ENCRYPTION_KEY;
  if (!hex) return null;
  const buf = Buffer.from(hex, 'hex');
  if (buf.length !== 32) {
    throw new Error('DATA_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters)');
  }
  return buf;
}

/**
 * Encrypts a channel config object using AES-256-GCM.
 * Returns `{ __encrypted: 'iv:authTag:ciphertext' }` stored in the jsonb column.
 *
 * If DATA_ENCRYPTION_KEY is not set, logs a warning and returns the config unchanged.
 * This allows dev environments to run without a key; prod deployments must set it.
 */
export function encryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  // Already encrypted (idempotent guard)
  if (ENC_MARKER in config) return config;

  const key = getKey();
  if (!key) {
    console.warn(
      '[channels] DATA_ENCRYPTION_KEY is not set — channel config stored in plaintext. Set this env var in production.',
    );
    return config;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, key, iv);
  const plaintext = JSON.stringify(config);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const encoded = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('base64')}`;
  return { [ENC_MARKER]: encoded };
}

/**
 * Decrypts a channel config object encrypted by encryptConfig().
 * Returns the original plaintext config object.
 *
 * If the config does not contain `__encrypted`, it is returned as-is
 * (handles legacy plaintext records from before encryption was enabled).
 */
export function decryptConfig(config: Record<string, unknown>): Record<string, unknown> {
  if (!(ENC_MARKER in config)) return config;

  const key = getKey();
  if (!key) {
    throw new Error(
      'DATA_ENCRYPTION_KEY is required to decrypt channel config but is not set',
    );
  }

  const encoded = config[ENC_MARKER] as string;
  const colonIdx1 = encoded.indexOf(':');
  const colonIdx2 = encoded.indexOf(':', colonIdx1 + 1);

  const ivHex = encoded.slice(0, colonIdx1);
  const authTagHex = encoded.slice(colonIdx1 + 1, colonIdx2);
  const encryptedB64 = encoded.slice(colonIdx2 + 1);

  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encrypted = Buffer.from(encryptedB64, 'base64');

  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}
