#!/usr/bin/env node
'use strict';

/**
 * verify-deployment.js — checks that deployed lambdas have real NestJS builds,
 * not seed placeholders. Data-driven via .github/verify.json.
 *
 * Usage:
 *   node .github/scripts/verify-deployment.js [env] [client]
 *   pnpm verify:dev                          # env=dev, all clients
 *   node .github/scripts/verify-deployment.js dev mindrithm
 *
 * Requires: AWS CLI configured with credentials for the target account(s).
 * Exit 0 = all checks passed. Exit 1 = one or more failures.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// ── ANSI colours ──────────────────────────────────────────────────────────────
const isTTY = process.stdout.isTTY;
const c = {
  green:  (s) => isTTY ? `\x1b[32m${s}\x1b[0m` : s,
  red:    (s) => isTTY ? `\x1b[31m${s}\x1b[0m` : s,
  yellow: (s) => isTTY ? `\x1b[33m${s}\x1b[0m` : s,
  bold:   (s) => isTTY ? `\x1b[1m${s}\x1b[0m`  : s,
  dim:    (s) => isTTY ? `\x1b[2m${s}\x1b[0m`  : s,
};

// ── Args ──────────────────────────────────────────────────────────────────────
const [,, envArg = 'dev', clientArg] = process.argv;

// ── Load config ───────────────────────────────────────────────────────────────
const configPath = path.resolve(__dirname, '..', 'verify.json');
if (!fs.existsSync(configPath)) {
  console.error(c.red(`ERROR: verify.json not found at ${configPath}`));
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// ── Resolve clients to check ──────────────────────────────────────────────────
const clientNames = clientArg ? [clientArg] : Object.keys(config);
const unknownClients = clientNames.filter((n) => !config[n]);
if (unknownClients.length) {
  console.error(c.red(`ERROR: Unknown client(s): ${unknownClients.join(', ')}`));
  console.error(`Available: ${Object.keys(config).join(', ')}`);
  process.exit(1);
}

// ── AWS helper ────────────────────────────────────────────────────────────────
function getLambdaConfig(functionName, region) {
  try {
    const out = execSync(
      `aws lambda get-function-configuration --function-name ${functionName} --region ${region} --output json`,
      { stdio: ['pipe', 'pipe', 'pipe'] }
    );
    return JSON.parse(out.toString());
  } catch (err) {
    const msg = err.stderr ? err.stderr.toString().trim() : err.message;
    return { _error: msg };
  }
}

// ── Check one lambda ──────────────────────────────────────────────────────────
function checkLambda(logicalName, spec, region) {
  const result = {
    name: logicalName,
    functionName: spec.function_name,
    checks: [],
    passed: true,
  };

  const cfg = getLambdaConfig(spec.function_name, region);

  if (cfg._error) {
    result.checks.push({ label: 'reachable', ok: false, got: cfg._error });
    result.passed = false;
    return result;
  }

  // State
  const stateOk = cfg.State === 'Active';
  result.checks.push({ label: 'State=Active', ok: stateOk, got: cfg.State });

  // Runtime
  const runtimeOk = cfg.Runtime === spec.runtime;
  result.checks.push({ label: `Runtime=${spec.runtime}`, ok: runtimeOk, got: cfg.Runtime });

  // Handler
  const handlerOk = cfg.Handler === spec.handler;
  result.checks.push({ label: `Handler=${spec.handler}`, ok: handlerOk, got: cfg.Handler });

  // Code size
  const minBytes = spec.min_code_kb * 1024;
  const sizeOk = (cfg.CodeSize || 0) >= minBytes;
  const gotKb = ((cfg.CodeSize || 0) / 1024).toFixed(1);
  result.checks.push({
    label: `CodeSize>=${spec.min_code_kb}KB`,
    ok: sizeOk,
    got: `${gotKb}KB`,
  });

  result.passed = result.checks.every((c) => c.ok);
  return result;
}

// ── Main ──────────────────────────────────────────────────────────────────────
let anyFailed = false;

for (const clientName of clientNames) {
  const clientConfig = config[clientName];
  const envConfig = clientConfig[envArg];

  if (!envConfig) {
    console.warn(c.yellow(`WARN: No config for ${clientName}/${envArg} — skipping`));
    continue;
  }

  console.log(c.bold(`\n${clientName} / ${envArg}  (${envConfig.region})`));
  console.log('─'.repeat(72));

  for (const [logicalName, spec] of Object.entries(envConfig.lambdas)) {
    process.stdout.write(`  ${logicalName.padEnd(20)} ${c.dim(spec.function_name.padEnd(36))}`);
    const result = checkLambda(logicalName, spec, envConfig.region);

    const failedChecks = result.checks.filter((ch) => !ch.ok);
    if (result.passed) {
      const gotKb = result.checks.find((ch) => ch.label.startsWith('CodeSize'))?.got || '';
      console.log(c.green('PASS') + c.dim(`  (${gotKb})`));
    } else {
      console.log(c.red('FAIL'));
      for (const ch of failedChecks) {
        console.log(`    ${c.red('✗')} ${ch.label}  got=${c.yellow(String(ch.got))}`);
      }
      anyFailed = true;
    }
  }
}

console.log('');
if (anyFailed) {
  console.log(c.red(c.bold('RESULT: FAILED — one or more lambdas are not correctly deployed')));
  process.exit(1);
} else {
  console.log(c.green(c.bold('RESULT: ALL CHECKS PASSED')));
  process.exit(0);
}
