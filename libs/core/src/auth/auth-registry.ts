import type { AuthProviderKey, AuthTokenVerifier, AuthTokenIssuer } from './contracts';
import { AuthHandlerTokenVerifier } from './adapters/platform/token-verifier';
import { ClerkTokenVerifier } from './adapters/clerk/token-verifier';
import { NextAuthTokenVerifier } from './adapters/next-auth/token-verifier';
import { OktaTokenVerifier } from './adapters/okta/token-verifier';
import { LambdaAuthorizerContextReader } from './adapters/lambda-authorizer/context-reader';
import { DevTokenVerifier } from './adapters/dev/token-verifier';
import { ClerkTokenIssuer } from './adapters/clerk/token-issuer';
import { DevTokenIssuer } from './adapters/dev/token-issuer';
import { OktaTokenIssuer } from './adapters/okta/token-issuer';
import { NextAuthTokenIssuer } from './adapters/next-auth/token-issuer';

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
    case 'auth-handler':
      return new AuthHandlerTokenVerifier();
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

/**
 * Resolves the auth token issuer based on the provider key.
 *
 * Uses an exhaustive switch — adding a new key to AuthProviderKey
 * without adding a case here will cause a TypeScript error.
 */
export function resolveAuthIssuer(
  provider: AuthProviderKey,
  secretKey?: string,
): AuthTokenIssuer {
  switch (provider) {
    case 'auth-handler':
      return new DevTokenIssuer(); // auth-handler itself owns standards-based token issuance
    case 'clerk':
      return new ClerkTokenIssuer(secretKey);
    case 'next-auth':
      return new NextAuthTokenIssuer();
    case 'okta':
      return new OktaTokenIssuer();
    case 'lambda-authorizer':
      return new DevTokenIssuer(); // dev fallback — lambda-authorizer doesn't issue tokens
    case 'dev':
      return new DevTokenIssuer();
    default: {
      const _exhaustive: never = provider;
      throw new Error(`Unknown auth provider: ${_exhaustive}`);
    }
  }
}
