#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const publicIndexPath = join(rootDir, 'packages/sdk/src/generated/index.ts');
const internalGroupsDir = join(rootDir, 'packages/internal-sdk/src/generated/internal');
const internalRootIndexPath = join(rootDir, 'packages/internal-sdk/src/index.ts');

function parseNamedExports(source: string, fromPath: string): string[] {
  const normalized = source.replace(/\r\n/g, '\n');
  const escapedFromPath = fromPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`export\\s*\\{([\\s\\S]*?)\\}\\s*from\\s*['"]${escapedFromPath}['"]`, 'g');
  const exports: string[] = [];
  let match: RegExpExecArray | null = null;

  while ((match = regex.exec(normalized)) !== null) {
    const content = match[1];
    const names = content
      .split(',')
      .map(part => part.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .map(part => part.replace(/^type\s+/, '').trim())
      .filter(name => name !== 'Options');
    exports.push(...names);
  }

  return exports;
}

function main() {
  const failures: string[] = [];

  if (!existsSync(publicIndexPath)) {
    failures.push(`Missing public index file: ${publicIndexPath}`);
  }

  if (!existsSync(internalRootIndexPath)) {
    failures.push(`Missing internal root index: ${internalRootIndexPath}`);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Boundary check failed: ${failure}`);
    }
    process.exit(1);
  }

  const publicIndex = readFileSync(publicIndexPath, 'utf8');
  if (/export\s+\*\s+from\s+['"]\.\/types\.gen['"]/.test(publicIndex)) {
    failures.push('Public index must not re-export all generated types via `export * from \'./types.gen\'`.');
  }

  const publicOperations = new Set(parseNamedExports(publicIndex, './sdk.gen'));
  const internalOperations = new Set<string>();
  const internalFiles = existsSync(internalGroupsDir)
    ? readdirSync(internalGroupsDir).filter(file => file.endsWith('.gen.ts'))
    : [];

  for (const file of internalFiles) {
    const filePath = join(internalGroupsDir, file);
    const source = readFileSync(filePath, 'utf8');
    for (const operationName of parseNamedExports(source, '../sdk.gen')) {
      internalOperations.add(operationName);
    }
  }

  const leakedOperations = [...internalOperations].filter(name => publicOperations.has(name));
  if (leakedOperations.length > 0) {
    failures.push(
      `Public SDK exports internal operations: ${leakedOperations.sort().join(', ')}`,
    );
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(`Boundary check failed: ${failure}`);
    }
    process.exit(1);
  }

  console.log('Boundary check passed.');
}

main();
