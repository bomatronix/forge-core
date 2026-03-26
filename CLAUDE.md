# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
pnpm dev                    # Start API at localhost:3001 (nest start --watch)
pnpm dev:debug              # Start with debug port

# Build
pnpm build                  # NestJS build (tsc via nest-cli)
pnpm build:lambda           # Two-step: nest build → esbuild bundle → dist/lambda/handler.js

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

**NestJS 10 monorepo** — backend API for Agent Forge, deployed as AWS Lambda (Lambdalith pattern).

### Structure

```
apps/api/           — Main API application (NestJS)
  src/main.ts       — Local dev entry point (port 3001)
  src/lambda.ts     — AWS Lambda entry point (cached bootstrap)
  src/app.module.ts — Root module
libs/common/        — Shared interfaces, DTOs
  src/interfaces/   — Type contracts mirroring agent-forge frontend
  src/dto/          — Request/response DTOs (future)
```

### Path aliases

- `@forge-core/common` → `libs/common/src`

### Key conventions

- **Global prefix**: All routes under `/api` (matches frontend API client)
- **TypeScript strict mode**: `strict: true`, `noImplicitAny: true`
- **Decorators**: `emitDecoratorMetadata` + `experimentalDecorators` required (NestJS DI)
- **Lambda pattern**: Bootstrap in global scope, cached instance reused across warm invocations
- **Build pipeline**: NestJS CLI uses tsc builder; Lambda bundle uses two-step `nest build` → esbuild to produce a single file

### Frontend counterpart

The `agent-forge` repo (Next.js 16) calls these APIs via `@forge/api-client` with Bearer token auth. API contracts are defined in `libs/common/src/interfaces/` and must stay in sync with `agent-forge/apps/web/src/features/agents/types.ts`.

## Code rules

- Use `pnpm` — never `npm` or `yarn`
- NestJS CLI for code generation: `nest generate module <name>`, `nest generate controller <name>`, etc.
- New modules go in `apps/api/src/<module-name>/`
- Shared interfaces/DTOs go in `libs/common/src/`
- Import shared types via `@forge-core/common`
