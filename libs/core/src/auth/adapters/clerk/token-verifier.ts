import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';

/**
 * Clerk auth adapter — only file allowed to import from @clerk/backend.
 *
 * TODO: Install @clerk/backend and implement real JWT verification:
 *   pnpm add @clerk/backend
 *   import { verifyToken } from '@clerk/backend';
 *   const payload = await verifyToken(token, { secretKey: this.secretKey });
 *
 * Currently a stub that accepts all tokens — the adapter structure is in place.
 */
export class ClerkTokenVerifier implements AuthTokenVerifier {
  constructor(private readonly secretKey?: string) {}

  async verifyToken(token: string): Promise<AuthSession | null> {
    if (!token) return null;

    // TODO: Replace with actual Clerk JWT verification:
    //
    // import { verifyToken } from '@clerk/backend';
    // const payload = await verifyToken(token, {
    //   secretKey: this.secretKey,
    // });
    // return {
    //   user: {
    //     id: payload.sub,
    //     email: payload.email ?? null,
    //     name: payload.name ?? null,
    //     avatarUrl: payload.image_url ?? null,
    //   },
    //   tenantId: payload.org_id ?? null,
    // };

    // Stub — accepts all tokens, returns placeholder session
    return {
      user: {
        id: 'stub-user-id',
        email: null,
        name: null,
        avatarUrl: null,
      },
      tenantId: null,
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new ClerkTokenVerifier();
void _typeCheck;
