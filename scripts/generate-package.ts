#!/usr/bin/env bun

import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type GenerateTarget = 'public' | 'internal' | 'all';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const generateScriptPath = join(__dirname, 'generate.ts');

function fail(message: string): never {
  console.error(`Generation failed: ${message}`);
  process.exit(1);
}

function runGenerate(target: Exclude<GenerateTarget, 'all'>, specOverride?: string): void {
  const env = {
    ...process.env,
    SDK_TYPE: target,
    ...(specOverride ? { OPENAPI_SPEC_PATH: specOverride } : {}),
  };

  const result = spawnSync('bun', ['run', generateScriptPath], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    fail(`scripts/generate.ts exited with code ${result.status ?? 1} for target "${target}"`);
  }
}

function main(): void {
  const targetArg = (process.argv[2] ?? 'public').trim().toLowerCase();
  const specOverride = process.argv[3]?.trim();

  if (targetArg !== 'public' && targetArg !== 'internal' && targetArg !== 'all') {
    fail('Usage: bun run scripts/generate-package.ts <public|internal|all> [specPathOrUrl]');
  }

  const target = targetArg as GenerateTarget;
  if (target === 'all') {
    runGenerate('public', specOverride);
    runGenerate('internal', specOverride);
    return;
  }

  runGenerate(target, specOverride);
}

main();
