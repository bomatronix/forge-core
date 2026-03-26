import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';
import { NotImplementedError } from '../../not-implemented.error';

/**
 * Okta adapter stub.
 *
 * TODO: Implement this adapter:
 *   1. pnpm add @okta/jwt-verifier
 *   2. Use OktaJwtVerifier to validate the access token
 *   3. Extract user and org/tenant from the JWT claims
 *   4. Map to AuthSession
 */
export class OktaTokenVerifier implements AuthTokenVerifier {
  async verifyToken(_token: string): Promise<AuthSession | null> {
    throw new NotImplementedError('okta', 'verifyToken');
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenVerifier = new OktaTokenVerifier();
void _typeCheck;
