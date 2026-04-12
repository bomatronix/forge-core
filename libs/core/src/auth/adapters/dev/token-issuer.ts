import type { AuthTokenIssuer, TokenResponse } from '../../contracts';
import { DevTokenVerifier } from './token-verifier';

/**
 * Dev token issuer — local development only.
 *
 * Wraps DevTokenVerifier.issueToken() to implement the AuthTokenIssuer contract.
 * Issues a signed JWT with mock user data — never use in production.
 */
export class DevTokenIssuer implements AuthTokenIssuer {
  async issueToken(_scopes?: string[]): Promise<TokenResponse> {
    return {
      access_token: DevTokenVerifier.issueToken(),
      token_type: 'bearer',
      expires_in: 3600,
      scope: (_scopes ?? []).join(' ') || undefined,
    };
  }
}

// Compile-time check: ensures this class satisfies the contract
const _typeCheck: AuthTokenIssuer = new DevTokenIssuer();
void _typeCheck;
