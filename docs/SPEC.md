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
apps/api/         — Main API application (@nestjs)
libs/common/      — Shared interfaces, DTOs, guards
```

Managed by NestJS CLI monorepo mode (`nest-cli.json`) + Turbo for task orchestration.

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

## Authentication (Future)

- **Method**: Bearer token in `Authorization` header
- **Provider**: Clerk JWT validation (initially), pluggable for NextAuth/Okta
- **Implementation**: NestJS Guard that validates JWT and extracts user/tenant claims
- **Session shape**: `{ user: { id, email, name, avatarUrl } }`

## Multi-Tenancy (Future)

- Tenant/org scoping via JWT claims (Clerk organization ID)
- All data queries scoped to authenticated tenant
- Brand configuration remains frontend-side (`NEXT_PUBLIC_BRAND`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 |
| Language | TypeScript 5.7.3 (strict mode) |
| HTTP | Express 4 |
| Lambda adapter | @codegenie/serverless-express |
| Build | NestJS CLI (esbuild builder) + esbuild for Lambda bundle |
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
