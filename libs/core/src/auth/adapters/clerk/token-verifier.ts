import { createClerkClient, verifyToken as clerkVerifyToken } from '@clerk/backend';
import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

// TODO(auth): Revisit shared logging for low-level auth adapters and standalone auth paths
// so we can standardize this without forcing Nest Logger into every runtime context.
function logError(message: string, detail: unknown): void {
  const rendered = detail instanceof Error ? detail.stack ?? detail.message : String(detail);
  process.stderr.write(`${message} ${rendered}\n`);
}

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
      try {
        const payload = await clerkVerifyToken(token, { secretKey: this.getSecretKey() });
        const orgPermissions = (payload['org_permissions'] as string[] | undefined) ?? [];
        return {
          user: {
            id: payload.sub,
            email: (payload['email'] as string) ?? null,
            name: (payload['name'] as string) ?? null,
            avatarUrl: (payload['image_url'] as string) ?? null,
          },
          tenantId: (payload['org_id'] as string) ?? null,
          permissions: orgPermissions,
        };
      } catch (error) {
        const oauthSession = await this.verifyOauthAccessToken(token);
        if (oauthSession) {
          return oauthSession;
        }

        logError('[ClerkTokenVerifier] JWT verification failed:', error);
        return null;
      }
    }

    const oauthSession = await this.verifyOauthAccessToken(token);
    if (oauthSession) {
      return oauthSession;
    }

    // Clerk Testing Token (non-JWT format) — use authenticateRequest()
    // These are issued by POST /v1/testing_tokens and only work with sk_test_ keys
    const clerk = createClerkClient({
      secretKey: this.getSecretKey(),
      publishableKey: this.getPublishableKey(),
    });
    // Session tokens (non-JWT) must be passed via the __session cookie —
    // Clerk's authenticateRequest() only accepts JWTs in the Authorization header.
    const mockRequest = new Request('http://localhost', {
      headers: { cookie: `__session=${token}` },
    });
    const state = await clerk.authenticateRequest(mockRequest, {
      secretKey: this.getSecretKey(),
      publishableKey: this.getPublishableKey(),
    });

    if (!state.isAuthenticated) {
      logError(
        '[ClerkTokenVerifier] authenticateRequest not authenticated:',
        `${state.reason} ${state.message ?? ''}`.trim(),
      );
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
      permissions: auth.orgPermissions ?? [],
    };
  }

  private async verifyOauthAccessToken(token: string): Promise<AuthSession | null> {
    const discoveryUrl = process.env.AUTH_HANDLER_CLERK_DISCOVERY_URL?.trim();
    const secretKey = this.getSecretKey();
    if (!secretKey || !discoveryUrl) {
      return null;
    }

    const verifyResponse = await fetch('https://api.clerk.com/oauth_applications/access_tokens/verify', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ access_token: token }),
    });

    if (!verifyResponse.ok) {
      return null;
    }

    const verifyPayload = (await verifyResponse.json()) as Record<string, unknown>;
    const metadataResponse = await fetch(discoveryUrl);
    if (!metadataResponse.ok) {
      return null;
    }

    const metadata = (await metadataResponse.json()) as { userinfo_endpoint?: string };
    if (!metadata.userinfo_endpoint) {
      return null;
    }

    const userinfoResponse = await fetch(metadata.userinfo_endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!userinfoResponse.ok) {
      return null;
    }

    const claims = (await userinfoResponse.json()) as Record<string, unknown>;
    const userId = this.readStringClaim(claims, ['sub']) ?? this.readStringClaim(verifyPayload, ['user_id', 'sub']);

    if (!userId) {
      return null;
    }

    return {
      user: {
        id: userId,
        email: this.readStringClaim(claims, ['email']),
        name: this.readStringClaim(claims, ['name', 'preferred_username']),
        avatarUrl: this.readStringClaim(claims, ['picture', 'image_url']),
      },
      tenantId: this.readStringClaim(claims, ['org_id', 'organization_id']),
      permissions: this.readScopeClaim(verifyPayload),
    };
  }

  private readStringClaim(claims: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
      const value = claims[key];
      if (typeof value === 'string' && value.trim()) {
        return value;
      }
    }

    return null;
  }

  private readScopeClaim(claims: Record<string, unknown>): string[] {
    const scopes = claims['scopes'];
    if (Array.isArray(scopes)) {
      return scopes.filter((value): value is string => typeof value === 'string' && value.length > 0);
    }

    const scope = claims['scope'];
    if (typeof scope === 'string') {
      return scope.split(/\s+/).filter(Boolean);
    }

    return [];
  }

  private getSecretKey(): string | undefined {
    return this.secretKey ?? process.env.AUTH_SECRET_KEY?.trim();
  }

  private getPublishableKey(): string | undefined {
    return this.publishableKey ?? process.env.AUTH_PUBLISHABLE_KEY?.trim();
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new ClerkTokenVerifier();
void _typeCheck;
