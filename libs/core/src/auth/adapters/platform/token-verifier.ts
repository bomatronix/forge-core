import type { AuthTokenVerifier } from '../../contracts';
import type { AuthSession } from '../../types';
import {
  authSessionFromClaims,
  getAuthHandlerRuntimeConfig,
  verifyIssuedToken,
} from '../../platform-tokens';

export interface AuthHandlerTokenVerifierOptions {
  issuer?: string;
  audience?: string;
  publicKey?: string;
}

/**
 * Verifies access tokens issued by auth-handler.
 *
 * This is the runtime used by the API Gateway authorizer once auth-handler
 * becomes the single token issuer for the platform.
 */
export class AuthHandlerTokenVerifier implements AuthTokenVerifier {
  private readonly issuer: string;
  private readonly audience: string;
  private readonly publicKey: string;

  constructor(options: AuthHandlerTokenVerifierOptions = {}) {
    const runtime = getAuthHandlerRuntimeConfig();
    this.issuer = options.issuer ?? runtime.issuer;
    this.audience = options.audience ?? runtime.audience;
    this.publicKey = options.publicKey ?? runtime.publicKey;
  }

  async verifyToken(token: string): Promise<AuthSession | null> {
    if (!token) return null;

    const claims = verifyIssuedToken(token, {
      issuer: this.issuer,
      audience: this.audience,
      publicKey: this.publicKey,
      expectedUse: 'access',
    });

    return authSessionFromClaims(claims);
  }
}

const _typeCheck: AuthTokenVerifier = new AuthHandlerTokenVerifier();
void _typeCheck;
