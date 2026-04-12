# 01 — Auth Handler & Authorizer

## Overview

The platform uses a two-component auth architecture:

- **auth-handler** (`apps/auth-handler/`) — A full OAuth 2.0 / OIDC authorization server that federates upstream identity providers (Clerk, Google, Auth0, etc.) into a single platform JWT format.
- **authorizer** (`apps/authorizer/`) — An AWS Lambda authorizer that validates auth-handler-issued platform tokens at the API Gateway layer before requests reach the API.

The API Lambda **never sees upstream provider tokens**. It only ever receives a normalized `AuthSession` extracted from a platform JWT.

---

## Auth Handler

### Runtime

- Port: `3002` (local dev via `pnpm dev:auth-handler`)
- Global prefix: `/auth`
- All routes are `@Public()` — auth guard is not applied to the auth server itself
- Entry: `apps/auth-handler/src/main.ts` (dev) / `apps/auth-handler/src/lambda.ts` (Lambda)

### HTTP Endpoints

#### OIDC Discovery & Keys

| Method | Path | Description |
|--------|------|-------------|
| GET | `/.well-known/openid-configuration` | OIDC discovery document (issuer, endpoints, supported grant types) |
| GET | `/jwks.json` | JWKS document — RS256 public key for verifying platform tokens |

#### Authorization Flow

| Method | Path | Description |
|--------|------|-------------|
| GET | `/authorize` | Start OAuth 2.0 authorization code flow |
| GET | `/callback/:connection` | Upstream provider callback — exchanges upstream code, establishes browser session |
| GET | `/consent` | Render HTML consent screen (third-party clients only) |
| POST | `/consent` | Process consent decision (`{ decision: 'approve' \| 'deny' }`) |

#### Token Operations

| Method | Path | Description |
|--------|------|-------------|
| POST | `/token` | OAuth 2.0 token endpoint — `authorization_code`, `refresh_token`, `client_credentials` |
| POST | `/dev/token` | Dev-only shortcut — mints tokens without a login flow (excluded in production) |

#### User Info & Debug

| Method | Path | Description |
|--------|------|-------------|
| GET | `/userinfo` | OIDC userinfo — returns user claims from a valid access token |
| POST | `/verify` | Debug — verifies a token and returns the authorizer result (`effect`, `principalId`, `context`) |
| POST | `/clerk/verify` | Dev-only — verifies a raw Clerk token and shows extracted user info |
| POST | `/logout` | Clears browser session cookies, optional `return_to` redirect |

---

### Authorization Code Flow (Clerk OIDC example)

```
1. GET /auth/authorize?client_id=forge-local-spa&connection=clerk&scope=openid+profile+email+offline_access+agents:read&...
        ↓
   Validate client + scopes → redirect to Clerk OIDC authorize URL
        ↓
2. User authenticates at Clerk → Clerk redirects to:
   GET /auth/callback/clerk?code=<code>&state=<state>
        ↓
   Exchange code for Clerk id_token + userinfo → create BrowserSession cookie
        ↓
3. Issue authorization code (UUID) → redirect to client:
   GET http://localhost:3000/callback?code=<uuid>&state=<state>
        ↓
4. POST /auth/token { grant_type: authorization_code, code: <uuid>, ... }
        ↓
   Return: { access_token, id_token, refresh_token, expires_in, scope }
```

**SSO**: If a valid `forge_auth_session` cookie exists for the same connection, step 2 is skipped — authorization code is issued immediately.

---

### Dev Token Flow (local testing only)

```
POST /auth/dev/token
{ client_id, user_id, email, name, org_id, scope }
        ↓
Returns: { access_token, id_token? }
```

Defaults: `user_id=dev-user-id`, `email=dev@example.com`, `org_id=dev-org-id`.

---

### Platform JWT Claims

#### Access Token (`token_use: "access"`)

```json
{
  "iss": "http://localhost:3002/auth",
  "aud": "forge-core-api",
  "sub": "user_abc123",
  "azp": "forge-local-spa",
  "scope": "openid profile email offline_access agents:read",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "avatar_url": "https://...",
  "org_id": "org_abc",
  "permissions": ["agents:read", "agents:write"],
  "token_use": "access",
  "token_kind": "user",
  "exp": 1234567890,
  "iat": 1234567800,
  "jti": "<uuid>",
  "kid": "<sha256-first-16-chars>"
}
```

Machine tokens (client_credentials grant) use `token_kind: "machine"`, `sub: "client:<clientId>"`, `email: null`, `org_id: null`.

#### ID Token (`token_use: "id"`)

Same fields minus `scope` and `azp`; `aud` is the specific `clientId` (not the platform audience); includes `nonce` if provided at authorization time.

---

### Token TTLs

| Token | Default TTL | Env var |
|-------|-------------|---------|
| Access token | 15 min (900s) | `AUTH_HANDLER_ACCESS_TOKEN_TTL_SECONDS` |
| ID token | 15 min (900s) | `AUTH_HANDLER_ID_TOKEN_TTL_SECONDS` |
| Refresh token | 30 days | `AUTH_HANDLER_REFRESH_TOKEN_TTL_SECONDS` |
| Authorization code | 5 min (hardcoded) | — |
| Browser session cookie | 8 hours (hardcoded) | — |

---

### Session Cookies

Two encrypted httpOnly cookies (AES via `AUTH_HANDLER_COOKIE_SECRET`):

| Cookie | Content | Max-Age |
|--------|---------|---------|
| `forge_auth_flow` | `PendingAuthorizationRequest` (sealed JSON) | 10 min |
| `forge_auth_session` | `BrowserSession` (sub, email, name, orgId, permissions, provider) | 8 hours |

`SameSite=Lax`; `Secure=true` in production only.

---

### OAuth Clients (built-in defaults)

| Client ID | Type | Grant Types | Notes |
|-----------|------|-------------|-------|
| `forge-swagger-ui` | public | authorization_code, refresh_token | Swagger UI OAuth2 redirect |
| `forge-local-spa` | public | authorization_code, refresh_token | Local frontend dev |
| `forge-machine-client` | confidential | client_credentials | M2M tokens |
| `forge-postman` | public | authorization_code, refresh_token | Postman testing |

First-party clients bypass the consent screen. Additional clients via `AUTH_HANDLER_CLIENTS_JSON`.

---

### Upstream Connections (built-in)

| Connection ID | Type | Source |
|---|---|---|
| `dev` | dev | Always available; short-circuits to hardcoded dev user |
| `clerk` | clerk | Auto-configured when `AUTH_HANDLER_CLERK_*` env vars are set |

Additional OIDC connections via `AUTH_HANDLER_CONNECTIONS_JSON` (see `docs/02-auth-provider-extensibility.md`).

---

### PKCE Support

- `code_challenge_method=S256`: SHA256(verifier) base64url-encoded
- `code_challenge_method=plain`: verifier passed directly
- Public clients should always use PKCE

---

### Key Configuration Env Vars

| Var | Default | Required in prod |
|-----|---------|-----------------|
| `AUTH_HANDLER_ISSUER` | `http://localhost:3002/auth` | Yes |
| `AUTH_HANDLER_AUDIENCE` | `forge-core-api` | Yes |
| `AUTH_HANDLER_PRIVATE_KEY` | DEV key (committed) | **Yes — fails fast if missing** |
| `AUTH_HANDLER_PUBLIC_KEY` | DEV key (committed) | **Yes — fails fast if missing** |
| `AUTH_HANDLER_COOKIE_SECRET` | `forge-core-auth-handler-cookie-secret` | Yes |
| `AUTH_HANDLER_CLERK_DISCOVERY_URL` | — | To enable Clerk login |
| `AUTH_HANDLER_CLERK_CLIENT_ID` | — | To enable Clerk login |
| `AUTH_HANDLER_CLERK_CLIENT_SECRET` | — | Optional (Clerk supports public OAuth apps) |
| `AUTH_HANDLER_CONNECTIONS_JSON` | — | To add OIDC providers |
| `AUTH_HANDLER_CLIENTS_JSON` | — | To add OAuth clients |

**Production guard**: `getAuthHandlerRuntimeConfig()` throws at startup if `NODE_ENV=production` and the private/public key env vars are missing. The committed dev keys must never be used in production.

---

## Authorizer Lambda

### Runtime

- Handler: `apps/authorizer/src/handler.ts`
- Deployed as an AWS Lambda authorizer (TOKEN type) — invoked by API Gateway before every request
- No NestJS DI; imports adapter directly via deep path to keep bundle ~150 KB

### Verification Flow

```
API Gateway receives request with Authorization: Bearer <token>
        ↓
authorizer Lambda invoked with { authorizationToken, methodArn }
        ↓
Resolve AuthHandlerTokenVerifier (cached across warm invocations):
  - Load AUTH_HANDLER_ISSUER / AUDIENCE / PUBLIC_KEY from env
  - If value is Secrets Manager ARN → fetch and cache resolved value
  - Instantiate AuthHandlerTokenVerifier
        ↓
verifier.verifyToken(token):
  - jwt.verify() with RS256, issuer, audience checks
  - Validate token_use === "access" (id_tokens are rejected)
  - Return AuthSession { user, tenantId, permissions }
        ↓
Allow → policyDocument Effect=Allow + context injected
Deny  → policyDocument Effect=Deny (any error path)
```

### Authorizer Context (passed to Lambda API)

```json
{
  "userId": "user_abc123",
  "email": "alice@example.com",
  "name": "Alice Smith",
  "avatarUrl": "https://...",
  "orgId": "org_abc",
  "permissions": "agents:read,agents:write"
}
```

Permissions are comma-joined strings (API Gateway context values must be scalar). The `LambdaAuthorizerContextReader` in `libs/core/src/auth/adapters/lambda-authorizer/context-reader.ts` splits them back into an array on the API side.

### Secrets Manager Support

If any env var value starts with `arn:aws:secretsmanager:`, the authorizer resolves it via `GetSecretValueCommand`. Supports both plain string secrets and single-key JSON objects.

### Key Configuration Env Vars

| Var | Notes |
|-----|-------|
| `AUTH_HANDLER_ISSUER` | Must match auth-handler issuer exactly |
| `AUTH_HANDLER_AUDIENCE` | Must match auth-handler audience exactly |
| `AUTH_HANDLER_PUBLIC_KEY` | PEM string or Secrets Manager ARN |

---

## Key Files

| File | Role |
|------|------|
| `apps/auth-handler/src/auth-handler.config.ts` | Loads clients + connections from env JSON; defines defaults |
| `apps/auth-handler/src/oidc-provider.service.ts` | Core orchestration: authorize, callback, token exchange |
| `apps/auth-handler/src/upstream-oidc.service.ts` | Generic OIDC federation — provider-agnostic |
| `apps/auth-handler/src/main.ts` | Dev entrypoint, CORS config |
| `apps/authorizer/src/handler.ts` | Lambda authorizer handler |
| `libs/core/src/auth/platform-tokens.ts` | `issueAccessToken`, `issueIdToken`, `verifyIssuedToken`, `buildJwksDocument` |
| `libs/core/src/auth/adapters/platform/token-verifier.ts` | `AuthHandlerTokenVerifier` — used by both authorizer and `/verify` endpoint |
| `libs/core/src/auth/adapters/lambda-authorizer/context-reader.ts` | Reads authorizer context from Lambda request on the API side |
| `libs/core/src/auth/oauth.types.ts` | `UpstreamConnectionConfig`, `AuthClientConfig`, `IssuedTokenClaims`, etc. |

---

## Known Limitations

| Limitation | Impact | Future fix |
|------------|--------|-----------|
| In-memory token store (auth codes, refresh tokens, consent) | Lost on restart; not suitable for multi-instance | Replace with DynamoDB / Redis |
| No token revocation API | Refresh tokens can't be revoked externally | Add `POST /token/revoke` endpoint |
| Single signing key (no rotation) | Key rotation requires redeploy | Add JWKS key rotation with `kid` selection |
| Cookie-based browser session (no server-side session) | Can't invalidate sessions server-side | Add session store |
| `SameSite=Lax` cookies | Works for redirects; may fail in strict iframe contexts | Adjust per deployment need |
