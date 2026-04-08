import type { AuthProviderKey, AuthTokenVerifier } from './contracts';
import { ClerkTokenVerifier } from './adapters/clerk/token-verifier';
import { NextAuthTokenVerifier } from './adapters/next-auth/token-verifier';
import { OktaTokenVerifier } from './adapters/okta/token-verifier';
import { LambdaAuthorizerContextReader } from './adapters/lambda-authorizer/context-reader';
import { DevTokenVerifier } from './adapters/dev/token-verifier';

/**
 * Resolves the auth adapter based on the provider key.
 *
 * Uses an exhaustive switch — adding a new key to AuthProviderKey
 * without adding a case here will cause a TypeScript error.
 *
 * @param provider - The auth provider key (from AUTH_PROVIDER env var)
 * @param secretKey - Provider-specific secret key for token verification
 *                    (not used by lambda-authorizer)
 */
export function resolveAuthAdapter(
  provider: AuthProviderKey,
  secretKey?: string,
  publishableKey?: string,
): AuthTokenVerifier {
  switch (provider) {
    case 'clerk':
      return new ClerkTokenVerifier(secretKey, publishableKey);
    case 'next-auth':
      return new NextAuthTokenVerifier();
    case 'okta':
      return new OktaTokenVerifier();
    case 'lambda-authorizer':
      return new LambdaAuthorizerContextReader();
    case 'dev':
      return new DevTokenVerifier();
    default: {
      // Exhaustive check — TypeScript will error if a case is missing
      const _exhaustive: never = provider;
      throw new Error(`Unknown auth provider: ${_exhaustive}`);
    }
  }
}
