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
  /**
   * Granted permissions for this session.
   * - Clerk session tokens:  sourced from `org_permissions` JWT claim
   * - Clerk machine tokens:  sourced from `scopes` claim
   * - Okta:                  sourced from `scp` JWT claim
   * - Dev:                   `['*']` (all permissions)
   * - Lambda-authorizer:     forwarded from authorizer context
   */
  permissions: string[];
}
