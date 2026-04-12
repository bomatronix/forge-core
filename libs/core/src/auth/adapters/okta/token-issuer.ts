import type { AuthTokenIssuer, TokenResponse } from '../../contracts';
import { NotImplementedError } from '../../not-implemented.error';

/**
 * Okta token issuer — stub.
 * TODO: Implement using Okta's client_credentials grant.
 */
export class OktaTokenIssuer implements AuthTokenIssuer {
  async issueToken(_scopes?: string[]): Promise<TokenResponse | null> {
    throw new NotImplementedError('okta', 'issueToken');
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenIssuer = new OktaTokenIssuer();
void _typeCheck;
