#!/usr/bin/env bun

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type PackageJson = {
  version: string;
  [key: string]: unknown;
};

const PACKAGE_PATHS = [
  'packages/sdk/package.json',
  'packages/internal-sdk/package.json',
];

function fail(message: string): never {
  console.error(`Version update failed: ${message}`);
  process.exit(1);
}

function main(): void {
  const version = process.argv[2]?.trim();
  if (!version) {
    fail('Usage: bun run scripts/release/set-version.ts <version>');
  }

  for (const relativePath of PACKAGE_PATHS) {
    const path = join(process.cwd(), relativePath);
    const data = JSON.parse(readFileSync(path, 'utf8')) as PackageJson;
    const previousVersion = data.version;
    data.version = version;
    writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
    console.log(`Updated ${relativePath}: ${previousVersion} -> ${version}`);
  }
}

main();
