/**
 * Shared auth types used across all adapters.
 * All adapters must map their provider-specific types to these contracts.
 */

export interface AuthUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface AuthSession {
  user: AuthUser;
  tenantId: string | null;
}
