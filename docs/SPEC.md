# forge-core — Project Specification

## Purpose

Backend API service for the **Agent Forge** platform. Provides REST APIs consumed by the `agent-forge` Next.js frontend via `@forge/api-client`. Deployed as AWS Lambda functions using the Mono-Lambda (Lambdalith) pattern.

## Architecture

### Deployment Model: Lambdalith

The entire NestJS API deploys as a **single Lambda function** behind API Gateway. This consolidates traffic into one function, keeping it warm more frequently and reducing cold start probability.

**Cold start optimizations baked in:**

| Optimization | Technique |
|---|---|
| Bootstrap caching | `NestFactory.create()` runs in global scope (Lambda Init phase), cached across warm invocations |
| esbuild bundling | Two-step build (tsc → esbuild) produces a single JS file, minimizing disk I/O and module resolution |
| Minimal externals | Only unused NestJS packages (`@nestjs/microservices`, `@nestjs/websockets`) are excluded |
| Express adapter | `@codegenie/serverless-express` bridges Lambda events to Express, battle-tested in production |

**Entry points:**
- `apps/api/src/main.ts` — Local development (port 3001)
- `apps/api/src/lambda.ts` — AWS Lambda handler

### Monorepo Structure

```
apps/
  api/              — Platform/default API application
  client-<name>/    — Per-client applications (custom modules)
libs/
  common/           — Shared TypeScript interfaces, DTOs (zero runtime cost)
  core/             — Shared NestJS runtime modules (auth, guards, interceptors)
```

Managed by NestJS CLI monorepo mode (`nest-cli.json`) + Turbo for task orchestration.

### Agency Model: Shared Core + Client Folders

**Pattern**: One repo with shared core infrastructure (`libs/core/`) and per-client app folders (`apps/client-<name>/`). Each client is a separate NestJS application that imports `CoreModule.forRoot()` and adds its own custom modules.

**Deployment**: One Lambda per client. Each client gets its own Lambda function with isolated env vars, DB connection, and API Gateway. Benefits:
- Process-level isolation between clients
- Independent deployments (Client A deploy doesn't affect Client B)
- Clean handoff — extract client folder + libs into standalone repo

**Tenant isolation (defense-in-depth)**:
1. `AuthGuard` — validates JWT via pluggable adapter, extracts user + org_id
2. `TenantGuard` — validates org_id is in `allowedOrgIds` for this deployment
3. Database scoping — all queries filtered by tenant (future)

**Adding a new client**:
1. Create `apps/client-<name>/` with `main.ts`, `lambda.ts`, `app.module.ts`
2. Import `CoreModule.forRoot({ allowedOrgIds: [...] })` + client-specific modules
3. Register in `nest-cli.json` as a new project
4. Add build script: `"build:<name>": "CLIENT=client-<name> pnpm build:client"`

**Client handoff**:
1. Copy `apps/client-<name>/`, `libs/common/`, `libs/core/` into new repo
2. Rewrite `nest-cli.json` to only their project + libraries
3. Transfer AWS resources (Lambda, API Gateway, DB)
4. Optionally: publish `@forge-core/core` as private npm package for ongoing updates

## Planned API Surface

All endpoints prefixed with `/api`.

### Agents

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agents` | List agents (scoped by tenant) |
| GET | `/api/agents/:id` | Get agent by ID |
| POST | `/api/agents` | Create agent |
| PATCH | `/api/agents/:id` | Update agent |
| DELETE | `/api/agents/:id` | Delete agent |

### Agent Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent-templates` | List available templates |
| GET | `/api/agent-templates/:id` | Get template by ID |

### Metrics

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/agent-metrics` | Dashboard metrics |
| GET | `/api/agent-metrics/intents` | Unresolved intents + recommendation |

### Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |

## Authentication

- **Method**: Bearer token in `Authorization` header
- **Provider**: Pluggable via adapter pattern — Clerk (default), NextAuth, Okta
- **Implementation**: Provider-agnostic `AuthGuard` injects `AuthTokenVerifier` adapter resolved at startup via `resolveAuthAdapter()` registry
- **Adapter pattern**: Contract (`AuthTokenVerifier`) → concrete adapters (`ClerkTokenVerifier`, etc.) → exhaustive switch registry → injection token (`AUTH_TOKEN_VERIFIER`). Same pattern from agent-forge, applied to all third-party service integrations.
- **Session shape**: `AuthSession { user: AuthUser { id, email, name, avatarUrl }, tenantId: string | null }`
- **Decorators**: `@CurrentUser()`, `@CurrentTenant()` extract from request
- **Public routes**: `@Public()` decorator skips auth guards (e.g., health checks)
- **Configuration**: `CoreModule.forRoot({ authProvider: 'clerk', authSecretKey: '...', allowedOrgIds: [...] })`
- **Status**: Adapter structure complete. Clerk adapter is a stub (TODO: integrate `@clerk/backend`). NextAuth and Okta adapters throw `NotImplementedError`.

## Multi-Tenancy

- `TenantGuard` validates org_id from JWT against `allowedOrgIds` env var per deployment
- Each client Lambda has its own `ALLOWED_ORG_IDS` — defense-in-depth against cross-tenant access
- Database scoping via tenant ID on all queries (future)
- Brand configuration remains frontend-side (`NEXT_PUBLIC_BRAND`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 |
| Language | TypeScript 5.7.3 (strict mode) |
| HTTP | Express 4 |
| Lambda adapter | @codegenie/serverless-express |
| Build | NestJS CLI (tsc builder) + esbuild for Lambda bundle |
| Orchestration | Turbo |
| Package manager | pnpm 9.11.0 |
| Testing | Jest + @nestjs/testing |
| Linting | ESLint + Prettier |
| Runtime | Node.js 20 (Lambda target) |

## Shared Types

`libs/common/src/interfaces/` mirrors the frontend type definitions from `agent-forge/apps/web/src/features/agents/types.ts` to keep API contracts aligned. These are pure TypeScript interfaces with zero runtime cost.

## Infrastructure (Future)

- AWS CDK or SAM for Lambda + API Gateway provisioning
- Provisioned Concurrency for production (eliminates cold starts)
- CloudWatch for monitoring and alerting
