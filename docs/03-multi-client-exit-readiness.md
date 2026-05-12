# 03 — Multi-Client Strategy, Exit Readiness & IP Isolation

## Status: Accepted — May 2026

---

## Context

Ploutos (the agency) builds and operates AI products for external clients (e.g. Mindrithm). The platform must support:

1. **Multiple clients** sharing the same codebase without leaking business logic across tenants
2. **Clean exit** — a client (e.g. Mindrithm) must be extractable into a fully standalone product
3. **IP protection** — platform infrastructure (auth, guards, interceptors) must not be transferred as part of a client handoff

---

## Decisions

### 1. Three Client Tiers

| Tier | Description | Infra footprint | Example |
|------|-------------|-----------------|---------|
| **Static** | Brochure / marketing site, no backend | Static hosting only | Blue Stone Construction |
| **Ploutos tenant** | Agency internal tooling — org ID in existing `apps/api/` | No separate Lambda | Ploutos agency ops |
| **Dedicated product** | Full NestJS app in `apps/client-<name>/`, own Lambda, own DB | Full AWS stack | Mindrithm |

**Ploutos itself is a Tier 2 tenant** — it uses the platform API as an org ID in `ALLOWED_ORG_IDS`, not as a separate Lambda or separate infra. No `apps/ploutos/` folder. No entry in `clients.json`.

### 2. Two-Account Production Model

```
ploutos-prod account (retained)
└── apps/api Lambda           ← Ploutos tenant + any Tier 1/2 clients

mindrithm-prod account (sellable)
└── apps/client-mindrithm Lambda   ← Mindrithm product only
```

**Why**: When Mindrithm exits, the buyer receives the `mindrithm-prod` AWS account. The `ploutos-prod` account — containing platform infrastructure — is never transferred.

In dev/staging: both can share an account (current setup: `889851937279`). Separation is a prod-only concern.

### 3. IP Protection via Private Packages

Platform infrastructure (`libs/core/`, `libs/common/`, Lambda authorizer) is published as **private npm packages** under the `@launchops/*` namespace:

| Package | Contents |
|---------|----------|
| `@launchops/core` | NestJS runtime modules: `CoreModule`, `AuthGuard`, `TenantGuard`, interceptors, filters |
| `@launchops/common` | TypeScript interfaces, DTOs, constants (zero runtime dep) |
| `@launchops/authorizer` | Lambda authorizer handler |

Client handoff delivers: `apps/client-<name>/`, `@launchops/*` as versioned deps (no source), their own env vars and secrets.

**The client never gets the source of `libs/core/` or `libs/common/`.**

### 4. Per-Client Isolation (Defense-in-Depth)

Three layers enforced on every request:

1. **AWS Lambda Authorizer** — validates platform JWT before request reaches NestJS
2. **`AuthGuard`** — extracts `AuthSession` (user + org_id) from validated token
3. **`TenantGuard`** — asserts `org_id ∈ allowedOrgIds` for this deployment

A Mindrithm user with a valid JWT cannot access a Ploutos-tenant endpoint — their `org_id` is not in `apps/api/`'s `ALLOWED_ORG_IDS`.

---

## Consequences

### Adding a Tier 2 (agency tenant)
1. Obtain org ID from identity provider (Clerk org ID, etc.)
2. Add to `ALLOWED_ORG_IDS` env var in `apps/api/` deployment (TFE workspace variable)
3. No code change, no deploy

### Adding a Tier 3 (dedicated client product)
1. `mkdir apps/client-<name>/` — copy from `apps/api/` as template
2. `CoreModule.forRoot({ allowedOrgIds: [...] })` + client-specific modules
3. Register in `nest-cli.json`, add `build:client-<name>` script
4. Add entry to `clients.json` (CI/CD manifest)
5. Add entry to `bootstrap-accounts-dev/accounts.tf.json` (Terraform control plane)

### Client exit / handoff
1. Copy `apps/client-<name>/` into new standalone repo
2. Replace `@launchops/*` with negotiated licence or source transfer
3. Transfer `<client>-prod` AWS account
4. Revoke IAM roles and rotate all secrets in transferred account

---

## What is NOT in scope here

- Billing / metering per tenant (future)
- Cross-tenant analytics aggregation (future)
- Multi-region replication (future)
