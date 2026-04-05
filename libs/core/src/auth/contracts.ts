import type { Request } from 'express';
import type { AuthSession } from './types';

/**
 * Auth provider key — adding a new provider requires:
 * 1. Add the key to this union type
 * 2. TypeScript will flag every missing case in the registry
 * 3. Create adapter in `adapters/<provider>/token-verifier.ts`
 * 4. Add the case to `auth-registry.ts`
 *
 * 'lambda-authorizer' — reads claims from API Gateway requestContext.authorizer
 *   (production only; requires the apps/authorizer Lambda Authorizer to be deployed)
 */
export type AuthProviderKey = 'clerk' | 'next-auth' | 'okta' | 'lambda-authorizer' | 'dev';

/**
 * Contract for verifying Bearer tokens and extracting session data.
 * Every auth provider adapter must implement this interface.
 *
 * Only the adapter file should import the provider SDK.
 * All app code imports from `@forge-core/core` — never from the SDK directly.
 */
export interface AuthTokenVerifier {
  /**
   * Verify a Bearer token and extract the session (user + tenant).
   * Returns null if the token is invalid or expired.
   * Throws on verification errors (network, misconfiguration).
   *
   * @param token - The Bearer token from the Authorization header
   * @param request - Optional Express request (used by lambda-authorizer adapter
   *                  to read from requestContext.authorizer context)
   */
  verifyToken(token: string, request?: Request): Promise<AuthSession | null>;
}
