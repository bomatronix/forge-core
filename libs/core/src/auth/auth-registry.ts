import type { AuthProviderKey, AuthTokenVerifier } from './contracts';
import { ClerkTokenVerifier } from './adapters/clerk/token-verifier';
import { NextAuthTokenVerifier } from './adapters/next-auth/token-verifier';
import { OktaTokenVerifier } from './adapters/okta/token-verifier';

/**
 * Resolves the auth adapter based on the provider key.
 *
 * Uses an exhaustive switch — adding a new key to AuthProviderKey
 * without adding a case here will cause a TypeScript error.
 *
 * @param provider - The auth provider key (from AUTH_PROVIDER env var)
 * @param secretKey - Provider-specific secret key for token verification
 */
export function resolveAuthAdapter(
  provider: AuthProviderKey,
  secretKey?: string,
): AuthTokenVerifier {
  switch (provider) {
    case 'clerk':
      return new ClerkTokenVerifier(secretKey);
    case 'next-auth':
      return new NextAuthTokenVerifier();
    case 'okta':
      return new OktaTokenVerifier();
    default: {
      // Exhaustive check — TypeScript will error if a case is missing
      const _exhaustive: never = provider;
      throw new Error(`Unknown auth provider: ${_exhaustive}`);
    }
  }
}
