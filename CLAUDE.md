# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start API at localhost:3001 (nest start --watch)
pnpm dev:debug              # Start with debug port

# Build
pnpm build                  # NestJS build (tsc via nest-cli)
pnpm build:lambda           # nest build → esbuild → dist/lambda/api/handler.js
pnpm build:client           # Build a specific client: CLIENT=client-acme pnpm build:client

# Quality
pnpm typecheck              # tsc --noEmit
pnpm lint                   # ESLint
pnpm format                 # Prettier write
pnpm format:check           # Prettier check

# Testing
pnpm test                   # Jest (all specs)
pnpm test:watch             # Jest watch mode
pnpm test:cov               # Jest with coverage
npx jest apps/api/src/health/health.controller.spec.ts  # Single test file
```

This project uses **pnpm** as its package manager. **Turbo** is available for task orchestration as the project grows.

## Architecture

**NestJS 10 monorepo** — backend API for Agent Forge, deployed as AWS Lambda (Lambdalith pattern). Uses **shared core + client folders** agency model.

### Structure

```
apps/
  api/              — Platform/default API (imports CoreModule)
  client-<name>/    — Per-client apps (imports CoreModule + client modules)
libs/
  common/           — Shared TypeScript interfaces, DTOs (zero runtime)
    src/interfaces/ — Type contracts mirroring agent-forge frontend
    src/dto/        — Request/response DTOs (future)
  core/             — Shared NestJS runtime modules
    src/core.module.ts       — CoreModule.forRoot(options) DynamicModule
    src/auth/guards/         — ClerkAuthGuard, TenantGuard
    src/auth/decorators/     — @CurrentUser(), @CurrentTenant(), @Public()
    src/interceptors/        — LoggingInterceptor, TransformInterceptor
    src/filters/             — AllExceptionsFilter
    src/pipes/               — ValidationPipe config
```

### Path aliases

- `@forge-core/common` → `libs/common/src`
- `@forge-core/core` → `libs/core/src`

### Key conventions

- **Global prefix**: All routes under `/api` (matches frontend API client)
- **TypeScript strict mode**: `strict: true`, `noImplicitAny: true`
- **Decorators**: `emitDecoratorMetadata` + `experimentalDecorators` required (NestJS DI)
- **Lambda pattern**: Bootstrap in global scope, cached instance reused across warm invocations
- **Build pipeline**: NestJS CLI uses tsc builder; Lambda bundle uses two-step `nest build` → esbuild to produce a single file
- **Auth guards are global**: Registered by `CoreModule.forRoot()`. Use `@Public()` to skip auth on specific routes.

### Agency model

Each client gets their own `apps/client-<name>/` folder with:
- Own `lambda.ts` entry point (own Lambda deployment)
- Own `app.module.ts` importing `CoreModule.forRoot()` + client-specific modules
- Own `main.ts` for local dev (different port per client)

**Adding a new client:**
1. Create `apps/client-<name>/` with `main.ts`, `lambda.ts`, `app.module.ts`
2. Register in `nest-cli.json` as a new project
3. Import `CoreModule.forRoot({ allowedOrgIds: [...] })`
4. Add client-specific modules in `apps/client-<name>/src/<name>/`

### Frontend counterpart

The `agent-forge` repo (Next.js 16) calls these APIs via `@forge/api-client` with Bearer token auth. API contracts are defined in `libs/common/src/interfaces/` and must stay in sync with `agent-forge/apps/web/src/features/agents/types.ts`.

## Code rules

- Use `pnpm` — never `npm` or `yarn`
- NestJS CLI for code generation: `nest generate module <name>`, `nest generate controller <name>`, etc.
- Shared NestJS runtime modules (guards, interceptors, etc.) go in `libs/core/src/`
- Shared interfaces/DTOs go in `libs/common/src/`
- Client-specific modules go in `apps/client-<name>/src/`
- Import shared types via `@forge-core/common`, runtime modules via `@forge-core/core`
- Health endpoints must use `@Public()` decorator
