#!/usr/bin/env node
/**
 * build-matrix.js — Reads .github/deploy.json + paths-filter output,
 * produces a GitHub Actions matrix JSON array for a given environment.
 *
 * Env vars (set by the workflow before calling this script):
 *   DEPLOY_ENV     — target environment: dev | qa | staging | prod
 *   CHANGED_FILES  — space-separated list of changed file paths
 *   LIBS_CHANGED   — 'true' if any libs/** file changed, else 'false'
 *   S3_*           — bucket name vars injected from GitHub vars (one per workspace/env)
 *
 * Each matrix entry:
 *   { workspace, apps, lambda_key_prefix, tfe_workspace, s3_bucket }
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const deployJson = JSON.parse(
  readFileSync(resolve(__dirname, '../deploy.json'), 'utf8'),
)

const deployEnv = process.env.DEPLOY_ENV
if (!deployEnv) throw new Error('DEPLOY_ENV env var is required (dev|qa|staging|prod)')

const changedFiles = (process.env.CHANGED_FILES ?? '').split(/\s+/).filter(Boolean)
const libsChanged = process.env.LIBS_CHANGED === 'true'

/**
 * Resolve a bucket placeholder like "${S3_FORGE_CORE_STAGING}"
 * to the actual value from process.env.
 */
function resolveBucket(value) {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => process.env[name] ?? value)
}

/**
 * Determine which workspaces are affected by the current changeset.
 * - libs changed → all workspaces
 * - otherwise → workspaces whose apps/<name>/** files changed
 */
function affectedWorkspaces() {
  const workspaces = deployJson.workspaces

  if (libsChanged) {
    return Object.keys(workspaces)
  }

  const affected = new Set()
  for (const [wsName, ws] of Object.entries(workspaces)) {
    for (const app of ws.apps) {
      if (changedFiles.some((f) => f.startsWith(`apps/${app}/`))) {
        affected.add(wsName)
        break
      }
    }
  }
  return [...affected]
}

const affected = affectedWorkspaces()

const matrix = affected.map((wsName) => {
  const ws = deployJson.workspaces[wsName]
  const env = ws[deployEnv]
  if (!env) throw new Error(`No '${deployEnv}' entry in deploy.json for workspace '${wsName}'`)

  return {
    workspace: wsName,
    apps: ws.apps,
    lambda_key_prefix: ws.lambda_key_prefix,
    tfe_workspace: env.tfe_workspace,
    s3_bucket: resolveBucket(env.s3_bucket),
  }
})

process.stdout.write(JSON.stringify(matrix))
