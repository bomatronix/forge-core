#!/usr/bin/env node
/**
 * deploy-tfe.js — Updates the api_config_json.artifacts variable in a HCP
 * Terraform workspace, then triggers an auto-apply run.
 *
 * Usage:
 *   node deploy-tfe.js <workspace_name> <sha> [functions_csv] [prefix]
 *
 * Env:
 *   TFE_TOKEN             — HCP Terraform API token
 *   TFE_ORG               — HCP Terraform organization (default: core-aws)
 *   TFE_WAIT_FOR_RUN      — wait for the triggered run to finish (default: true)
 *   TFE_POLL_INTERVAL_MS  — run polling interval in ms (default: 10000)
 *   TFE_TIMEOUT_MS        — max wait time in ms (default: 2700000 / 45m)
 */

const [, , workspaceName, sha, functionsCsv = '', prefixArg = ''] = process.argv

if (!workspaceName || !sha) {
  console.error('Usage: node deploy-tfe.js <workspace_name> <sha> [functions_csv] [prefix]')
  process.exit(1)
}

const functions = functionsCsv.split(',').map((value) => value.trim()).filter(Boolean)
const prefix = prefixArg.trim()

const TFE_TOKEN = process.env.TFE_TOKEN
const TFE_ORG = process.env.TFE_ORG ?? 'core-aws'
const TFE_WAIT_FOR_RUN = (process.env.TFE_WAIT_FOR_RUN ?? 'true').toLowerCase() !== 'false'
const TFE_POLL_INTERVAL_MS = parsePositiveInt('TFE_POLL_INTERVAL_MS', 10000)
const TFE_TIMEOUT_MS = parsePositiveInt('TFE_TIMEOUT_MS', 45 * 60 * 1000)
const BASE = 'https://app.terraform.io/api/v2'
const RUN_SUCCESS_STATUSES = new Set(['applied', 'planned_and_finished'])
const RUN_FAILURE_STATUSES = new Set([
  'canceled',
  'discarded',
  'errored',
  'force_canceled',
  'policy_soft_failed',
])
const RUN_MANUAL_STATUSES = new Set(['planned_and_saved', 'policy_override'])

if (!TFE_TOKEN) {
  console.error('TFE_TOKEN env var is required')
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${TFE_TOKEN}`,
  'Content-Type': 'application/vnd.api+json',
}

function parsePositiveInt(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback

  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer. Received: ${raw}`)
  }

  return value
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds}s`
}

async function tfe(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`TFE ${method} ${path} → ${res.status}: ${text}`)
  }
  const contentType = res.headers.get('content-type') ?? ''
  return contentType.includes('json') ? res.json() : null
}

async function waitForRun(runId, runUrl) {
  const startedAt = Date.now()
  const deadline = startedAt + TFE_TIMEOUT_MS
  let previousStatus = ''

  console.log(
    `[deploy-tfe] Waiting for run completion ` +
      `(timeout=${formatDuration(TFE_TIMEOUT_MS)}, poll=${Math.round(TFE_POLL_INTERVAL_MS / 1000)}s)`,
  )

  while (true) {
    const runData = await tfe('GET', `/runs/${runId}`)
    const attributes = runData.data.attributes
    const status = attributes.status
    const actions = attributes.actions ?? {}

    if (status !== previousStatus) {
      const elapsed = formatDuration(Date.now() - startedAt)
      console.log(`[deploy-tfe] Run status: ${status} (${elapsed})`)
      previousStatus = status
    }

    if (RUN_SUCCESS_STATUSES.has(status)) {
      console.log(`[deploy-tfe] Run completed successfully: ${runUrl}`)
      return
    }

    if (RUN_FAILURE_STATUSES.has(status)) {
      throw new Error(`Run finished with status '${status}'. Review: ${runUrl}`)
    }

    if (RUN_MANUAL_STATUSES.has(status) || actions['is-confirmable']) {
      throw new Error(
        `Run requires manual intervention (status='${status}'). ` +
          `Open HCP Terraform to continue: ${runUrl}`,
      )
    }

    if (Date.now() >= deadline) {
      throw new Error(
        `Timed out waiting for run completion after ${formatDuration(TFE_TIMEOUT_MS)} ` +
          `(last status='${status}'). Review: ${runUrl}`,
      )
    }

    await sleep(TFE_POLL_INTERVAL_MS)
  }
}

async function main() {
  // 1. Resolve workspace ID from name
  console.log(`[deploy-tfe] Resolving workspace: ${workspaceName} in org: ${TFE_ORG}`)
  const wsData = await tfe('GET', `/organizations/${TFE_ORG}/workspaces/${workspaceName}`)
  const workspaceId = wsData.data.id
  console.log(`[deploy-tfe] Workspace ID: ${workspaceId}`)

  // 2. List workspace variables to find api_config_json
  const varsData = await tfe('GET', `/workspaces/${workspaceId}/vars`)
  const configVar = varsData.data.find((v) => v.attributes.key === 'api_config_json')

  if (!configVar) {
    throw new Error(
      `api_config_json variable not found in workspace ${workspaceName}. ` +
        `Ensure the TFE workspace has been provisioned by the account portal.`,
    )
  }

  const varId = configVar.id

  // 3. Parse current value (stored as HCL = JSON expression) and update artifacts metadata
  let currentValue
  try {
    currentValue = JSON.parse(configVar.attributes.value)
  } catch {
    throw new Error(
      `Failed to parse api_config_json value as JSON. Raw value: ${configVar.attributes.value}`,
    )
  }

  const nextArtifacts = {
    ...(currentValue.artifacts ?? {}),
    version: sha,
  }

  if (prefix) {
    nextArtifacts.prefix = prefix
  }

  if (functions.length > 0) {
    nextArtifacts.functions = functions
  }

  const updated = {
    ...currentValue,
    artifacts: nextArtifacts,
  }

  console.log(
    `[deploy-tfe] Updating artifacts → ${JSON.stringify({
      version: nextArtifacts.version,
      prefix: nextArtifacts.prefix,
      functions: nextArtifacts.functions,
    })}`,
  )
  await tfe('PATCH', `/workspaces/${workspaceId}/vars/${varId}`, {
    data: {
      type: 'vars',
      id: varId,
      attributes: {
        value: JSON.stringify(updated),
        hcl: true,
      },
    },
  })

  // 4. Create an auto-apply run
  console.log(`[deploy-tfe] Triggering run on ${workspaceName}`)
  const runData = await tfe('POST', '/runs', {
    data: {
      type: 'runs',
      attributes: {
        message: `deploy ${workspaceName} ${sha}`,
        'auto-apply': true,
      },
      relationships: {
        workspace: {
          data: { type: 'workspaces', id: workspaceId },
        },
      },
    },
  })

  const runId = runData.data.id
  const runUrl = `https://app.terraform.io/app/${TFE_ORG}/workspaces/${workspaceName}/runs/${runId}`
  console.log(`[deploy-tfe] Run created: ${runUrl}`)

  if (!TFE_WAIT_FOR_RUN) {
    console.log('[deploy-tfe] Skipping wait because TFE_WAIT_FOR_RUN=false')
    return
  }

  await waitForRun(runId, runUrl)
}

main().catch((err) => {
  console.error('[deploy-tfe] Error:', err.message)
  process.exit(1)
})
