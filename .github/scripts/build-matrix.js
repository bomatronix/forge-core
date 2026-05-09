#!/usr/bin/env node
/**
 * build-matrix.js — Reads .github/deploy.json + .github/clients.json + paths-filter output,
 * produces a GitHub Actions matrix JSON array for a given environment.
 *
 * Env vars (set by the workflow before calling this script):
 *   DEPLOY_ENV            — target environment: dev | qa | staging | prod
 *   CHANGED_FILES         — space-separated list of changed file paths
 *   LIBS_CHANGED          — 'true' if any libs/** file changed, else 'false'
 *   DEPLOY_CONFIG_CHANGED — 'true' if .github/** config files changed, else 'false'
 *
 * Each matrix entry:
 *   {
 *     client, apps, lambda_key_prefix,
 *     artifact_targets, lambda_functions,
 *     tfe_workspace, s3_bucket,
 *     role_to_assume, region, kms_key_id
 *   }
 *
 * artifact_targets: array of "bundle:lambdaName" strings (e.g. ["api:forge-core-api"])
 * lambda_functions: flat array of lambda function names (e.g. ["forge-core-api", "authorizer"])
 */

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const deployJson = JSON.parse(readFileSync(resolve(__dirname, '../deploy.json'), 'utf8'))
const clientsJson = JSON.parse(readFileSync(resolve(__dirname, '../clients.json'), 'utf8'))

const deployEnv = process.env.DEPLOY_ENV
if (!deployEnv) throw new Error('DEPLOY_ENV env var is required (dev|qa|staging|prod)')

const changedFiles = (process.env.CHANGED_FILES ?? '').split(/\s+/).filter(Boolean)
const libsChanged = process.env.LIBS_CHANGED === 'true'
const deployConfigChanged = process.env.DEPLOY_CONFIG_CHANGED === 'true'

const log = (...args) => console.error('[build-matrix]', ...args)

log(`DEPLOY_ENV=${deployEnv}`)
log(`LIBS_CHANGED=${libsChanged}`)
log(`DEPLOY_CONFIG_CHANGED=${deployConfigChanged}`)
if (changedFiles.length === 0) {
  log('CHANGED_FILES: (none)')
} else {
  log(`CHANGED_FILES (${changedFiles.length}):`)
  changedFiles.forEach((f) => log(' ', f))
}

/**
 * Determine which workspaces are affected by the current changeset.
 * - libs or deploy config changed → all workspaces
 * - otherwise → workspaces whose apps/<name>/** files changed
 * Returns [{ name, reason, matchedFile }]
 */
function affectedWorkspaces() {
  const workspaces = deployJson.workspaces

  if (libsChanged || deployConfigChanged) {
    const reason = libsChanged
      ? 'libs changed → all workspaces rebuild'
      : 'deploy config changed → all workspaces rebuild'
    return Object.keys(workspaces).map((name) => ({ name, reason, matchedFile: null }))
  }

  const affected = []
  for (const [wsName, ws] of Object.entries(workspaces)) {
    for (const app of ws.apps) {
      const match = changedFiles.find((f) => f.startsWith(`apps/${app}/`))
      if (match) {
        affected.push({ name: wsName, reason: 'file match', matchedFile: match })
        break
      }
    }
  }
  return affected
}

/**
 * Resolve the artifact map for a given workspace + client.
 * Prefers client_artifacts[clientName] over the default artifacts map.
 * Returns undefined if neither source is configured — callers must validate.
 */
function resolveArtifactsMap(ws, clientName) {
  return ws.client_artifacts?.[clientName] ?? ws.artifacts
}

/**
 * Build artifact_targets array from an artifacts map.
 * Format: "bundle:lambdaName" per Lambda function.
 */
function buildArtifactTargets(artifactsMap) {
  const targets = []
  for (const [bundle, lambdas] of Object.entries(artifactsMap)) {
    for (const lambda of lambdas) {
      targets.push(`${bundle}:${lambda}`)
    }
  }
  return targets
}

/**
 * Build lambda_functions array — flat list of all Lambda function names.
 */
function buildLambdaFunctions(artifactsMap) {
  const functions = []
  for (const lambdas of Object.values(artifactsMap)) {
    functions.push(...lambdas)
  }
  return functions
}

const affected = affectedWorkspaces()

if (affected.length === 0) {
  log('Affected workspaces: none — no matching files, nothing to deploy')
} else {
  log(`Affected workspaces (${affected.length}):`)
  affected.forEach(({ name, reason, matchedFile }) => {
    log(`  ${name}  reason: ${reason}${matchedFile ? `  matched: ${matchedFile}` : ''}`)
  })
}

const matrix = []

for (const { name: wsName } of affected) {
  const ws = deployJson.workspaces[wsName]

  for (const [clientName, clientData] of Object.entries(clientsJson)) {
    const clientEnv = clientData[deployEnv]
    if (!clientEnv) {
      // Intentional skip: clients are only deployed to the environments they exist in.
      // e.g. test-client is dev-only; it has no staging/prod entry. This is different
      // from a missing workspace env entry, which would be a misconfiguration error.
      log(`  skip client=${clientName} — no '${deployEnv}' entry in clients.json (client not deployed to this environment)`)
      continue
    }

    const artifactsMap = resolveArtifactsMap(ws, clientName)
    if (!artifactsMap || Object.keys(artifactsMap).length === 0) {
      throw new Error(
        `No artifacts configured for workspace '${wsName}' / client '${clientName}'. ` +
          `Add an entry to 'artifacts' or 'client_artifacts.${clientName}' in deploy.json.`,
      )
    }

    const artifactTargets = buildArtifactTargets(artifactsMap)
    const lambdaFunctions = buildLambdaFunctions(artifactsMap)

    matrix.push({
      client: clientName,
      apps: ws.apps,
      lambda_key_prefix: ws.lambda_key_prefix,
      artifact_targets: artifactTargets,
      lambda_functions: lambdaFunctions,
      tfe_workspace: clientEnv.tfe_workspace,
      s3_bucket: clientEnv.s3_bucket,
      role_to_assume: clientEnv.role_to_assume,
      region: clientEnv.region,
      kms_key_id: clientEnv.kms_key_id ?? '',
    })
  }
}

if (matrix.length === 0) {
  log('Matrix: empty — no deploy jobs will run')
} else {
  log(`Matrix (${matrix.length} ${matrix.length === 1 ? 'entry' : 'entries'}):`)
  matrix.forEach((entry, i) => {
    log(
      `  [${i}] client=${entry.client}` +
        `  apps=${entry.apps.join(',')}` +
        `  env=${deployEnv}` +
        `  tfe=${entry.tfe_workspace}` +
        `  bucket=${entry.s3_bucket}` +
        `  region=${entry.region}` +
        `  role=${entry.role_to_assume}` +
        `  artifacts=${entry.artifact_targets.join(',')}` +
        `  lambdas=${entry.lambda_functions.join(',')}`,
    )
  })
}

process.stdout.write(JSON.stringify(matrix))
