import { createClerkClient, verifyToken as clerkVerifyToken } from '@clerk/backend';
import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

/**
 * Clerk auth adapter — only file allowed to import from @clerk/backend.
 *
 * Handles two token formats:
 * - Standard Clerk JWT (eyJ...) — verified with verifyToken(), used in production
 * - Clerk Testing Token (non-JWT) — verified with authenticateRequest(), used in local dev
 *
 * Used for:
 * - Local development (AUTH_PROVIDER=clerk) — direct JWT or testing token verification
 * - Inside apps/authorizer Lambda — verifies the token before returning IAM policy
 *
 * Not used in production NestJS Lambda (AUTH_PROVIDER=lambda-authorizer reads context).
 */
export class ClerkTokenVerifier implements AuthTokenVerifier {
  constructor(
    private readonly secretKey?: string,
    private readonly publishableKey?: string,
  ) {}

  async verifyToken(token: string): Promise<AuthSession | null> {
    if (!token) return null;

    // Standard Clerk JWT starts with 'eyJ' — use verifyToken() for fast local verification
    if (token.startsWith('eyJ')) {
      const payload = await clerkVerifyToken(token, { secretKey: this.secretKey });
      return {
        user: {
          id: payload.sub,
          email: (payload['email'] as string) ?? null,
          name: (payload['name'] as string) ?? null,
          avatarUrl: (payload['image_url'] as string) ?? null,
        },
        tenantId: (payload['org_id'] as string) ?? null,
      };
    }

    // Clerk Testing Token (non-JWT format) — use authenticateRequest()
    // These are issued by POST /v1/testing_tokens and only work with sk_test_ keys
    const clerk = createClerkClient({
      secretKey: this.secretKey,
      publishableKey: this.publishableKey,
    });
    const mockRequest = new Request('http://localhost', {
      headers: { authorization: `Bearer ${token}` },
    });
    const state = await clerk.authenticateRequest(mockRequest, {
      secretKey: this.secretKey,
      publishableKey: this.publishableKey,
    });

    if (!state.isSignedIn) {
      console.error('[ClerkTokenVerifier] authenticateRequest not signed in:', state.reason, state.message);
      return null;
    }

    const auth = state.toAuth();
    // Fetch full user profile to populate email/name/avatarUrl
    const user = await clerk.users.getUser(auth.userId);

    return {
      user: {
        id: auth.userId,
        email: user.primaryEmailAddress?.emailAddress ?? null,
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || null,
        avatarUrl: user.imageUrl ?? null,
      },
      tenantId: auth.orgId ?? null,
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new ClerkTokenVerifier();
void _typeCheck;
