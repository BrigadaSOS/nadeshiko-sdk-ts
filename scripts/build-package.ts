#!/usr/bin/env bun

import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

type BuildTarget = 'public' | 'internal';

type RootPackageJson = {
  version: string;
  description?: string;
  license?: string;
  author?: string;
  repository?: unknown;
  homepage?: string;
  bugs?: unknown;
  keywords?: string[];
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

function fail(message: string): never {
  console.error(`Build failed: ${message}`);
  process.exit(1);
}

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

function resolveTarget(): BuildTarget {
  const value = (process.argv[2] ?? '').trim().toLowerCase();
  if (value !== 'public' && value !== 'internal') {
    fail('Usage: bun run scripts/build-package.ts <public|internal>');
  }
  return value;
}

function resolveLicenseSource(): string {
  const rootLicense = join(rootDir, 'LICENSE');
  if (existsSync(rootLicense)) return rootLicense;

  fail('No LICENSE file found at repository root.');
}

function main(): void {
  const target = resolveTarget();
  const sourceDir = join(rootDir, 'generated', target);
  const packageDir = join(rootDir, 'build', target);
  const distDir = join(packageDir, 'dist');

  if (!existsSync(sourceDir)) {
    fail(`Missing generated source directory: ${sourceDir}. Run generation first.`);
  }

  const rootPackage = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8')) as RootPackageJson;
  const baseVersion = process.env.SDK_VERSION?.trim() || rootPackage.version;
  const publishVersion = target === 'internal'
    ? (process.env.INTERNAL_VERSION?.trim() || `${baseVersion}-internal`)
    : baseVersion;

  rmSync(packageDir, { recursive: true, force: true });
  mkdirSync(packageDir, { recursive: true });

  run(
    'bun',
    ['build', join(sourceDir, 'index.ts'), '--outdir', distDir, '--format', 'cjs', '--target', 'node', '--sourcemap'],
    rootDir,
  );

  const cjsPath = join(distDir, 'index.cjs');
  const cjsMapPath = join(distDir, 'index.cjs.map');
  const jsPath = join(distDir, 'index.js');
  const jsMapPath = join(distDir, 'index.js.map');

  if (existsSync(jsPath)) {
    renameSync(jsPath, cjsPath);
  }
  if (existsSync(jsMapPath)) {
    renameSync(jsMapPath, cjsMapPath);
  }

  run(
    'bun',
    ['build', join(sourceDir, 'index.ts'), '--outdir', distDir, '--format', 'esm', '--target', 'node', '--sourcemap'],
    rootDir,
  );

  run(
    'bun',
    [
      'x',
      'tsc',
      '--declaration',
      '--declarationMap',
      '--emitDeclarationOnly',
      '--outDir',
      distDir,
      '--rootDir',
      sourceDir,
      '--module',
      'ESNext',
      '--moduleResolution',
      'bundler',
      '--target',
      'ES2020',
      '--strict',
      'true',
      '--lib',
      'ESNext,DOM',
      '--skipLibCheck',
      'true',
      join(sourceDir, 'index.ts'),
    ],
    rootDir,
  );

  copyFileSync(join(rootDir, 'README.md'), join(packageDir, 'README.md'));
  copyFileSync(resolveLicenseSource(), join(packageDir, 'LICENSE'));

  const keywords = Array.isArray(rootPackage.keywords) ? [...rootPackage.keywords] : [];
  if (target === 'internal' && !keywords.includes('internal')) {
    keywords.push('internal');
  }

  const publishPackage = {
    name: '@brigadasos/nadeshiko-sdk',
    version: publishVersion,
    description: target === 'internal'
      ? 'TypeScript SDK for Nadeshiko API (internal build - includes internal endpoints)'
      : (rootPackage.description || 'TypeScript SDK for Nadeshiko API (public endpoints only)'),
    main: './dist/index.cjs',
    module: './dist/index.js',
    types: './dist/index.d.ts',
    type: 'module',
    private: false,
    license: rootPackage.license || 'MIT',
    author: rootPackage.author || 'BrigadaSOS',
    repository: rootPackage.repository,
    homepage: rootPackage.homepage,
    bugs: rootPackage.bugs,
    publishConfig: {
      access: 'public',
    },
    keywords,
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.cjs',
        default: './dist/index.js',
      },
    },
    files: [
      'dist',
      'README.md',
      'LICENSE',
    ],
  };

  writeFileSync(join(packageDir, 'package.json'), `${JSON.stringify(publishPackage, null, 2)}\n`);
  console.log(`Built ${target} package: ${packageDir}`);
}

main();
