#!/usr/bin/env bun
/**
 * Local development workflow.
 *
 * Bundles the backend's OpenAPI spec, regenerates the SDK, and builds both
 * the public and internal packages — all from a local backend checkout.
 *
 * Use this when iterating on backend API changes that affect the SDK, so the
 * frontend can pick up the new SDK via `file:` / `npm link` without waiting
 * for CI to publish a new version.
 *
 * Env vars:
 *   BACKEND_PATH  Path to the Nadeshiko backend checkout. Default: ../Nadeshiko/backend
 *   SDK_TYPE      "public" | "internal" | "both" (default). Limits what gets built.
 */

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT_DIR = join(__dirname, '..');

const BACKEND_PATH = resolve(ROOT_DIR, process.env.BACKEND_PATH ?? '../Nadeshiko/backend');
const SDK_TYPE = (process.env.SDK_TYPE ?? 'both').toLowerCase();
const BUNDLED_SPEC = join(BACKEND_PATH, 'docs/generated/openapi.yaml');

function fail(message: string): never {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

function run(label: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = {}): void {
  console.log(`\n▸ ${label}`);
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  });
  if (result.status !== 0) {
    fail(`${label} failed (exit ${result.status ?? 'unknown'})`);
  }
}

if (!existsSync(BACKEND_PATH)) {
  fail(`Backend path not found: ${BACKEND_PATH}\nSet BACKEND_PATH to override (default: ../Nadeshiko/backend).`);
}
if (!existsSync(join(BACKEND_PATH, 'package.json'))) {
  fail(`${BACKEND_PATH} does not look like the Nadeshiko backend (no package.json).`);
}

// 1. Bundle the backend spec (resolves external $refs into a single file)
run('Bundling backend OpenAPI spec', 'bun', ['run', 'docs:bundle'], BACKEND_PATH);

if (!existsSync(BUNDLED_SPEC)) {
  fail(`Expected bundled spec at ${BUNDLED_SPEC} but it wasn't produced.`);
}

// 2. Regenerate + build the requested SDK(s)
const targets = SDK_TYPE === 'both' ? ['public', 'internal'] : [SDK_TYPE];
for (const target of targets) {
  run(`Generating ${target} SDK`, 'bun', ['run', `codegen:${target}`], ROOT_DIR, {
    OPENAPI_SPEC_PATH: BUNDLED_SPEC,
  });
  run(`Building ${target} package`, 'bun', ['run', `pack:${target}`], ROOT_DIR);
}

console.log('\n✓ Local SDK build ready at build/{public,internal}');
console.log('  Frontend can consume this via:');
console.log('    "@brigadasos/nadeshiko-sdk": "file:../nadeshiko-sdk-ts/build/public"');
console.log('  or `bun link` / `npm link` from build/{public,internal}.\n');
