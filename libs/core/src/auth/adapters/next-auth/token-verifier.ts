import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';
import { NotImplementedError } from '../../not-implemented.error';

/**
 * NextAuth adapter stub.
 *
 * TODO: Implement this adapter:
 *   1. pnpm add next-auth
 *   2. Verify the JWT using NextAuth's JWT secret
 *   3. Extract user and org/tenant from the session token
 *   4. Map to AuthSession
 */
export class NextAuthTokenVerifier implements AuthTokenVerifier {
  async verifyToken(_token: string): Promise<AuthSession | null> {
    throw new NotImplementedError('next-auth', 'verifyToken');
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new NextAuthTokenVerifier();
void _typeCheck;
