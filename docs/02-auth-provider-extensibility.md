# 01 — Auth Provider Extensibility

The auth-handler is a provider-agnostic OIDC federation layer. It federates any upstream identity
provider into a single platform JWT format (RS256) that the API Lambda trusts. The API never
sees upstream provider tokens — it only validates auth-handler-issued platform tokens.

## How it works

```
Client → GET /auth/authorize?connection=<id>
              ↓
         auth-handler redirects to upstream OIDC provider
              ↓
         upstream provider redirects to /auth/callback/<connectionId>
              ↓
         auth-handler validates upstream token, fetches userinfo
              ↓
         issues platform JWT (RS256, signed with AUTH_HANDLER_PRIVATE_KEY)
              ↓
         Lambda authorizer validates platform JWT via AUTH_HANDLER_PUBLIC_KEY
              ↓
         API receives normalized AuthSession { userId, email, permissions }
```

The authorizer and API are **completely decoupled from the upstream provider**.
Adding or swapping upstream providers requires no changes to `apps/authorizer/` or `apps/api/`.

---

## Adding a new OIDC provider — pure config, zero code

Set `AUTH_HANDLER_CONNECTIONS_JSON` as an env var (or a Secrets Manager ARN in prod):

```json
[
  {
    "id": "google",
    "name": "Google",
    "type": "oidc",
    "discoveryUrl": "https://accounts.google.com/.well-known/openid-configuration",
    "clientId": "YOUR_GOOGLE_CLIENT_ID",
    "clientSecret": "YOUR_GOOGLE_CLIENT_SECRET",
    "scopes": ["openid", "profile", "email"]
  },
  {
    "id": "auth0",
    "name": "Auth0",
    "type": "oidc",
    "discoveryUrl": "https://YOUR_TENANT.auth0.com/.well-known/openid-configuration",
    "clientId": "YOUR_AUTH0_CLIENT_ID",
    "clientSecret": "YOUR_AUTH0_CLIENT_SECRET",
    "scopes": ["openid", "profile", "email"]
  }
]
```

The callback URL is auto-derived: `${AUTH_HANDLER_ISSUER}/callback/${id}`

Register this URL as an allowed redirect in the upstream provider's OAuth app settings.

### Providers that work today with no code changes

| Provider | Discovery URL |
|---|---|
| Google | `https://accounts.google.com/.well-known/openid-configuration` |
| Auth0 | `https://<tenant>.auth0.com/.well-known/openid-configuration` |
| Okta | `https://<tenant>.okta.com/.well-known/openid-configuration` |
| Keycloak | `https://<host>/realms/<realm>/.well-known/openid-configuration` |
| Microsoft Entra (Azure AD) | `https://login.microsoftonline.com/<tenant>/v2.0/.well-known/openid-configuration` |
| Clerk | `https://<domain>/.well-known/openid-configuration` |
| Any OIDC-compliant provider | Must expose a `/.well-known/openid-configuration` discovery URL |

---

## What requires code for non-OIDC protocols

| Protocol | Effort | What's needed |
|---|---|---|
| SAML 2.0 | ~3–5 days | New `upstream-saml.service.ts`, XML assertion parsing, SP/IdP metadata, cert validation |
| GitHub OAuth2 (no OIDC) | ~1–2 days | Custom userinfo fetch via `/user` + `/user/emails` endpoints |
| Custom OAuth2 (no userinfo endpoint) | ~1–2 days | Custom claim extraction from access token or introspection endpoint |

**Implementation pattern** for non-OIDC:
1. Add a new `type` value to `UpstreamConnectionType` in `libs/core/src/auth/oauth.types.ts`
2. Implement a new upstream service (e.g. `upstream-saml.service.ts`) in `apps/auth-handler/src/`
3. Route the new type in `OidcProviderService.handleCallback()` in `apps/auth-handler/src/oidc-provider.service.ts`

Nothing else changes — the authorizer, API, and guards are untouched.

---

## Files unchanged when adding a new upstream OIDC provider

- `apps/authorizer/src/handler.ts` — validates platform JWTs, provider-agnostic
- `libs/core/src/auth/auth-registry.ts` — resolves the platform adapter, unchanged
- `apps/api/src/app.module.ts` — unchanged
- `libs/core/src/auth/adapters/platform/token-verifier.ts` — unchanged
- All existing tests — unchanged

---

## Key implementation files

| File | Role |
|---|---|
| `apps/auth-handler/src/auth-handler.config.ts` | Loads `AUTH_HANDLER_CONNECTIONS_JSON` from env |
| `apps/auth-handler/src/upstream-oidc.service.ts` | Generic OIDC federation — no provider-specific code |
| `apps/auth-handler/src/oidc-provider.service.ts` | Core orchestration: authorize → callback → token issuance |
| `libs/core/src/auth/oauth.types.ts` | `UpstreamConnectionConfig` interface definition |
| `libs/core/src/auth/platform-tokens.ts` | RS256 JWT issuance (`issueAccessToken`, `issueIdToken`) + JWKS |
| `libs/core/src/auth/adapters/platform/token-verifier.ts` | What the authorizer uses to validate platform JWTs |

---

## Production checklist for new provider

- [ ] Create OAuth app in upstream provider, note client ID + secret
- [ ] Register callback URL: `${AUTH_HANDLER_ISSUER}/callback/<id>`
- [ ] Add connection object to `AUTH_HANDLER_CONNECTIONS_JSON` in Secrets Manager
- [ ] Redeploy auth-handler Lambda (no API or authorizer redeploy needed)
- [ ] Verify: `GET /auth/authorize?connection=<id>` redirects to upstream login
