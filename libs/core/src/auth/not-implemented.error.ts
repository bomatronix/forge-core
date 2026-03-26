/**
 * Thrown by stub adapters to indicate the provider is not yet implemented.
 * Provides a helpful error message with the provider name and method.
 */
export class NotImplementedError extends Error {
  constructor(provider: string, method: string) {
    super(
      `Auth provider "${provider}" is selected but ${method}() is not implemented. ` +
        `To fix: implement the adapter in libs/core/src/auth/adapters/${provider}/token-verifier.ts`,
    );
    this.name = 'NotImplementedError';
  }
}
