export type OAuthGrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

export type OAuthResponseType = 'code';

export type AuthClientType = 'public' | 'confidential';

export type UpstreamConnectionType = 'dev' | 'oidc';

export interface AuthClientConfig {
  clientId: string;
  clientSecret?: string;
  name: string;
  type: AuthClientType;
  firstParty: boolean;
  redirectUris: string[];
  scopes: string[];
  grantTypes: OAuthGrantType[];
  responseTypes: OAuthResponseType[];
  defaultConnectionId?: string;
}

export interface UpstreamConnectionConfig {
  id: string;
  name: string;
  type: UpstreamConnectionType;
  discoveryUrl?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  userinfoUrl?: string;
  jwksUrl?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  /** Provider backend API secret key (e.g. Clerk sk_live_/sk_test_). Stored in AUTH_HANDLER_CONNECTIONS_JSON. */
  secretKey?: string;
  scopes?: string[];
}

export interface BrowserSession {
  sub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  orgId: string | null;
  permissions: string[];
  provider: string;
  createdAt: string;
}

export interface PendingAuthorizationRequest {
  requestId: string;
  clientId: string;
  redirectUri: string;
  responseType: OAuthResponseType;
  scope: string[];
  state?: string;
  nonce?: string;
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  connectionId: string;
  upstreamState?: string;
  createdAt: string;
}

export interface AuthorizationCodeRecord {
  code: string;
  clientId: string;
  redirectUri: string;
  scope: string[];
  nonce?: string;
  subject: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  orgId: string | null;
  permissions: string[];
  codeChallenge?: string;
  codeChallengeMethod?: 'S256' | 'plain';
  createdAt: string;
  expiresAt: string;
}

export interface RefreshTokenRecord {
  tokenId: string;
  clientId: string;
  subject: string;
  scope: string[];
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  orgId: string | null;
  permissions: string[];
  issuedAt: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface ConsentRecord {
  clientId: string;
  subject: string;
  scope: string[];
  grantedAt: string;
}

export interface IssuedTokenClaims {
  iss: string;
  aud: string | string[];
  sub: string;
  exp: number;
  iat: number;
  jti?: string;
  azp?: string;
  scope?: string;
  permissions?: string[];
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  org_id?: string | null;
  token_use: 'access' | 'id';
  token_kind: 'user' | 'machine';
  nonce?: string;
}

export interface UserInfoResponse {
  sub: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  org_id?: string | null;
  permissions?: string[];
}

export interface UpstreamProfile {
  sub: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  orgId: string | null;
}
