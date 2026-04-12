import type { AuthTokenIssuer, TokenResponse } from '../../contracts';

/**
 * Clerk token issuer — dev/test only.
 *
 * Calls Clerk's Testing Tokens API to issue a short-lived token without
 * requiring a real browser sign-in. Only works with sk_test_ keys.
 *
 * Returns null for sk_live_ keys — no test tokens in production.
 */
export class ClerkTokenIssuer implements AuthTokenIssuer {
  constructor(private readonly secretKey?: string) {}

  async issueToken(_scopes?: string[]): Promise<TokenResponse | null> {
    const key = this.secretKey ?? '';

    if (!key.startsWith('sk_test_')) {
      // eslint-disable-next-line no-console
      console.warn('[ClerkTokenIssuer] Token issuance only available with sk_test_ keys.');
      return null;
    }

    const res = await fetch('https://api.clerk.com/v1/testing_tokens', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
    });

    if (!res.ok) {
      throw new Error(`Clerk testing tokens API returned ${res.status}`);
    }

    const data = (await res.json()) as { token: string; expires_at: number };
    return {
      access_token: data.token,
      token_type: 'bearer',
      expires_in: Math.max(0, data.expires_at - Math.floor(Date.now() / 1000)),
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenIssuer = new ClerkTokenIssuer();
void _typeCheck;
