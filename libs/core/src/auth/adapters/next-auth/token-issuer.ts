import type { AuthTokenIssuer, TokenResponse } from '../../contracts';
import { NotImplementedError } from '../../not-implemented.error';

/**
 * NextAuth token issuer — stub.
 * TODO: Implement using NextAuth's credentials provider or session exchange.
 */
export class NextAuthTokenIssuer implements AuthTokenIssuer {
  async issueToken(_scopes?: string[]): Promise<TokenResponse | null> {
    throw new NotImplementedError('next-auth', 'issueToken');
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenIssuer = new NextAuthTokenIssuer();
void _typeCheck;
