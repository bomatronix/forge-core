import * as jwt from 'jsonwebtoken';
import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

const DEV_JWT_SECRET = 'forge-dev-secret-not-for-production';

/**
 * Dev-only auth adapter — issues and verifies local JWTs with no external calls.
 *
 * Use AUTH_PROVIDER=dev for local Swagger testing when you don't have a real
 * user session. The /api/auth/token endpoint issues a signed token that this
 * adapter accepts.
 *
 * NEVER use this in production. It accepts any token signed with the local secret.
 */
export class DevTokenVerifier implements AuthTokenVerifier {
  /**
   * Issues a short-lived dev JWT representing a mock user.
   * Called by the /api/auth/token endpoint.
   */
  static issueToken(
    overrides: Partial<{ userId: string; email: string; orgId: string }> = {},
  ): string {
    const payload = {
      sub: overrides.userId ?? 'dev-user-id',
      email: overrides.email ?? 'dev@example.com',
      name: 'Dev User',
      org_id: overrides.orgId ?? 'dev-org-id',
    };
    return jwt.sign(payload, DEV_JWT_SECRET, { expiresIn: '1h' });
  }

  async verifyToken(token: string): Promise<AuthSession | null> {
    if (!token) return null;

    const payload = jwt.verify(token, DEV_JWT_SECRET) as jwt.JwtPayload;

    return {
      user: {
        id: payload['sub'] as string,
        email: (payload['email'] as string) ?? null,
        name: (payload['name'] as string) ?? null,
        avatarUrl: null,
      },
      tenantId: (payload['org_id'] as string) ?? null,
      permissions: ['*'],
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new DevTokenVerifier();
void _typeCheck;
