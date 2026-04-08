# forge-core

Backend API platform for Agent Forge. NestJS 10 monorepo deployed as AWS Lambda (Lambdalith pattern) with a shared core library and per-client app architecture.

## Overview

```
apps/
  api/              — Platform API (default, forge-core client)
  authorizer/       — Lambda Authorizer (token verification for API Gateway)
  client-<name>/    — Per-client apps (own Lambda, own deployment)
libs/
  common/           — Shared TypeScript interfaces and DTOs (zero runtime)
  core/             — Shared NestJS runtime modules (auth, guards, interceptors)
```

Each client gets its own Lambda deployment backed by the same shared `CoreModule`. The Lambda Authorizer runs as a separate function, verifies Bearer tokens, and injects user claims into `requestContext.authorizer` for the API to consume.

## Local Development

```bash
pnpm install
pnpm dev           # API at http://localhost:3001
                   # Swagger UI at http://localhost:3001/api/docs
```

Set `AUTH_PROVIDER=dev` in `.env` (see `.env.example`) — Swagger's **Authorize** button will issue a local dev token automatically.

## Build

```bash
pnpm build:lambda      # Build api Lambda bundle → dist/lambda/api/handler.js
pnpm build:authorizer  # Build authorizer bundle → dist/lambda/authorizer/handler.js
pnpm build:all         # Build both
APP=foo pnpm build:app # Build any app generically
```

## CI/CD

The pipeline lives in `.github/workflows/` and deploys to AWS Lambda via HCP Terraform (TFE).

### Branch model

| Branch | Pipeline | Deploys |
|---|---|---|
| `develop` | CI checks + deploy | Dev |
| `qa` | CI checks + deploy | QA |
| `main` | CI checks + deploy | Staging → approval gate → Production |

PRs only run CI checks — deploys only trigger on direct pushes to the branch.

### How deploys work

1. Push to `main` — CI checks run (typecheck, lint, test)
2. Path filtering detects which TFE workspaces are affected:
   - Change in `apps/api/` or `apps/authorizer/` → `forge-core` workspace
   - Change in `libs/` → all workspaces
3. Each affected workspace: builds its apps, uploads `api/${app}-${sha}.zip` to S3, updates the TFE workspace variable with artifact metadata (`version`, `prefix`, `functions`), triggers a Terraform run
4. Staging deploys run in parallel per workspace
5. A manual approval gate blocks production
6. Production deploys run with the same artifacts

### Workspace config

`.github/deploy.json` is the single source of truth mapping workspaces → apps → S3 buckets.

### Required GitHub setup (one-time)

**Environments** — Settings → Environments:
- Create `production` environment with required reviewers

**Secrets** — Settings → Secrets and variables → Actions → Secrets:

| Secret | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM key for S3 uploads |
| `AWS_SECRET_ACCESS_KEY` | IAM secret for S3 uploads |
| `TFE_TOKEN` | HCP Terraform API token |

**Variables** — Settings → Secrets and variables → Actions → Variables:

| Variable | Example | Description |
|---|---|---|
| `AWS_REGION` | `us-east-1` | AWS region (repo-level) |
| `CLIENT` | `test-client` | Client slug used to derive HCP Terraform workspace names |
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::...` | OIDC role ARN — set per GitHub Environment |
| `S3_FORGE_CORE` | `forge-core-dev-123456789-api-code` | S3 bucket — set per GitHub Environment |

> Set `AWS_ROLE_TO_ASSUME` and `S3_FORGE_CORE` under **Settings → Environments → <env> → Variables** for each environment (`development`, `qa`, `staging`, `production`). The value differs per environment; the variable name is the same.

**Branch rulesets** — import via GitHub CLI:
```bash
gh api repos/{owner}/forge-core/rulesets --method POST --input .github/rulesets/develop-ruleset.json
gh api repos/{owner}/forge-core/rulesets --method POST --input .github/rulesets/qa-ruleset.json
gh api repos/{owner}/forge-core/rulesets --method POST --input .github/rulesets/main-ruleset.json
```

## Onboarding a new client

### 1. Create the app

```bash
# Scaffold the app
mkdir -p apps/client-acme/src
# Add main.ts, lambda.ts, app.module.ts (see apps/api/ as reference)
```

Register in `nest-cli.json`:
```json
"client-acme": {
  "type": "application",
  "root": "apps/client-acme",
  "sourceRoot": "apps/client-acme/src",
  "entryFile": "lambda",
  "compilerOptions": { "tsConfigPath": "apps/client-acme/tsconfig.app.json" }
}
```

### 2. Add to deploy config

Add a workspace entry to `.github/deploy.json`:
```json
"acme": {
  "apps": ["client-acme"],
  "lambda_key_prefix": "api",
  "staging": {
    "tfe_workspace": "acme-staging-api",
    "s3_bucket": "${S3_ACME_STAGING}"
  },
  "prod": {
    "tfe_workspace": "acme-prod-api",
    "s3_bucket": "${S3_ACME_PROD}"
  }
}
```

### 3. Add GitHub variables

Add four bucket vars in **Settings → Secrets and variables → Actions → Variables**:
- `S3_ACME_DEV`, `S3_ACME_QA`, `S3_ACME_STAGING`, `S3_ACME_PROD`

### 4. Use environment vars in deploy jobs

Bucket and role variables are read in the deploy jobs themselves, after the GitHub environment is attached. Keep environment-specific values in the matching GitHub Environment:

- `development`
- `qa`
- `staging`
- `production`

> **Important:** Do not resolve environment-scoped bucket vars during matrix generation. The `detect-changes` job does not have an attached GitHub environment, so those vars may resolve to empty strings and produce invalid `s3:///...` upload targets.

That's it. The pipeline picks up the new workspace automatically on the next push to `main`.

## Auth

Auth is provider-agnostic via an adapter pattern. Set `AUTH_PROVIDER` in the environment:

| Value | Use case |
|---|---|
| `dev` | Local development — issues self-signed JWTs, no external dependency |
| `clerk` | Clerk.com — verifies JWTs with `@clerk/backend` |
| `lambda-authorizer` | Production — reads claims injected by the Lambda Authorizer |
| `next-auth` | NextAuth.js (stub — implement `libs/core/src/auth/adapters/next-auth/`) |
| `okta` | Okta (stub — implement `libs/core/src/auth/adapters/okta/`) |

Adding a new provider: add the key to `AuthProviderKey` in `libs/core/src/auth/contracts.ts` — TypeScript will guide you to all the places that need updating.
