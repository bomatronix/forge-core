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
 *   { workspace, apps, artifact_targets, lambda_functions, lambda_key_prefix, tfe_workspace }
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

function resolveArtifacts(wsName, ws) {
  const artifactMap = ws.artifacts ?? Object.fromEntries(ws.apps.map((app) => [app, [app]]))
  const bundleApps = new Set(ws.apps)
  const artifactTargets = []
  const lambdaFunctions = []

  for (const [bundle, functions] of Object.entries(artifactMap)) {
    if (!bundleApps.has(bundle)) {
      throw new Error(
        `Workspace '${wsName}' maps artifact bundle '${bundle}', but it is not listed in apps.`,
      )
    }

    if (!Array.isArray(functions) || functions.length === 0) {
      throw new Error(
        `Workspace '${wsName}' artifact mapping for '${bundle}' must be a non-empty array.`,
      )
    }

    for (const fn of functions) {
      artifactTargets.push(`${bundle}:${fn}`)
      lambdaFunctions.push(fn)
    }
  }

  return {
    artifactTargets,
    lambdaFunctions,
  }
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
  const { artifactTargets, lambdaFunctions } = resolveArtifacts(wsName, ws)
  const client = (process.env.CLIENT ?? '').trim()
  if (env.tfe_workspace.includes('${CLIENT}') && !client) {
    throw new Error(
      `CLIENT env var is required to resolve tfe_workspace for workspace '${wsName}'. ` +
        `Set CLIENT as a repository-level GitHub Actions variable.`,
    )
  }

  return {
    workspace: wsName,
    apps: ws.apps,
    artifact_targets: artifactTargets,
    lambda_functions: lambdaFunctions,
    lambda_key_prefix: ws.lambda_key_prefix,
    tfe_workspace: resolveTemplate(env.tfe_workspace, {
      CLIENT: client || wsName,
      DEPLOY_ENV: deployEnv,
      WORKSPACE: wsName,
    }),
  }
})

process.stdout.write(JSON.stringify(matrix))
