#!/usr/bin/env bun

import { appendFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function fail(message: string): never {
  console.error(`npm check failed: ${message}`);
  process.exit(1);
}

function writeOutput(name: string, value: string): void {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    console.log(`${name}=${value}`);
    return;
  }

  const delimiter = `EOF_${name}_${Date.now()}`;
  appendFileSync(outputPath, `${name}<<${delimiter}\n${value}\n${delimiter}\n`);
}

function main(): void {
  const packageName = process.argv[2];
  const version = process.argv[3];
  if (!packageName || !version) {
    fail('Usage: bun run scripts/release/check-npm-version.ts <packageName> <version>');
  }

  try {
    const output = execSync(`npm view ${packageName}@${version} version --json`, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        npm_config_cache: process.env.npm_config_cache || '/tmp/npm-cache',
      },
    }).trim();

    let exists = false;
    let publishedVersion = '';

    if (output) {
      const parsed = JSON.parse(output) as string | string[];
      if (Array.isArray(parsed)) {
        exists = parsed.includes(version);
        publishedVersion = parsed.join(',');
      } else if (typeof parsed === 'string') {
        exists = parsed === version;
        publishedVersion = parsed;
      }
    }

    console.log(`npm lookup ${packageName}@${version}: exists=${exists}`);
    writeOutput('exists', String(exists));
    writeOutput('published_version', publishedVersion);
  } catch (error) {
    const stderr = String((error as { stderr?: string }).stderr ?? '');
    const notFound = stderr.includes('E404') || stderr.includes('404');

    if (notFound) {
      console.log(`npm lookup ${packageName}@${version}: exists=false`);
      writeOutput('exists', 'false');
      writeOutput('published_version', '');
      return;
    }

    fail(stderr || String(error));
  }
}

main();
