#!/usr/bin/env bun

import { existsSync, renameSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command: string, args: string[], cwd: string): void {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function main(): void {
  const targetArg = process.argv[2] ?? '.';
  const packageDir = resolve(process.cwd(), targetArg);
  const distDir = resolve(packageDir, 'dist');
  const cjsPath = resolve(distDir, 'index.cjs');
  const cjsMapPath = resolve(distDir, 'index.cjs.map');
  const jsPath = resolve(distDir, 'index.js');
  const jsMapPath = resolve(distDir, 'index.js.map');

  rmSync(distDir, { recursive: true, force: true });

  run(
    'bun',
    ['build', './src/index.ts', '--outdir', './dist', '--format', 'cjs', '--target', 'node', '--sourcemap'],
    packageDir,
  );

  if (existsSync(jsPath)) {
    renameSync(jsPath, cjsPath);
  }
  if (existsSync(jsMapPath)) {
    renameSync(jsMapPath, cjsMapPath);
  }

  run(
    'bun',
    ['build', './src/index.ts', '--outdir', './dist', '--format', 'esm', '--target', 'node', '--sourcemap'],
    packageDir,
  );

  run('bun', ['x', 'tsc', '-p', 'tsconfig.build.json', '--emitDeclarationOnly'], packageDir);
}

main();
