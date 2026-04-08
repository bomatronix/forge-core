#!/usr/bin/env node
/**
 * build-matrix.js — Reads .github/deploy.json + paths-filter output,
 * produces a GitHub Actions matrix JSON array for a given environment.
 *
 * Env vars (set by the workflow before calling this script):
 *   DEPLOY_ENV     — target environment: dev | qa | staging | prod
 *   CHANGED_FILES  — space-separated list of changed file paths
 *   LIBS_CHANGED   — 'true' if any libs/** file changed, else 'false'
 *   CLIENT         — optional client slug for naming downstream resources
 *
 * Each matrix entry:
 *   { workspace, apps, lambda_key_prefix, tfe_workspace }
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

function resolveTemplate(value, context) {
  return value.replace(/\$\{([^}]+)\}/g, (_, name) => context[name] ?? process.env[name] ?? '')
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
  const client = process.env.CLIENT ?? wsName

  return {
    workspace: wsName,
    apps: ws.apps,
    lambda_key_prefix: ws.lambda_key_prefix,
    tfe_workspace: resolveTemplate(env.tfe_workspace, {
      CLIENT: client,
      DEPLOY_ENV: deployEnv,
      WORKSPACE: wsName,
    }),
  }
})

process.stdout.write(JSON.stringify(matrix))
