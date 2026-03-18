#!/usr/bin/env bun

import { appendFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

type ReleaseChannel = 'internal' | 'stable';

type RawPayload = {
  release_channel?: unknown;
  backend_sha?: unknown;
};

type DerivedVersions = {
  specVersion: string;
  publicVersion: string;
  internalVersion: string;
  internalOnly: boolean;
};

const BACKEND_REPO = 'BrigadaSOS/Nadeshiko';
const SPEC_PATH = 'backend/docs/generated/openapi.yaml';

const SEMVER_REGEX =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function fail(message: string): never {
  console.error(`Payload validation failed: ${message}`);
  process.exit(1);
}

function toStringValue(value: unknown): string {
  if (value == null) return '';
  return String(value).trim();
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

function getPayload(): RawPayload {
  const eventName = process.env.GITHUB_EVENT_NAME ?? '';
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (eventPath) {
    const event = JSON.parse(readFileSync(eventPath, 'utf8')) as Record<string, unknown>;
    if (eventName === 'repository_dispatch') {
      return (event.client_payload ?? {}) as RawPayload;
    }
    if (eventName === 'workflow_dispatch') {
      return (event.inputs ?? {}) as RawPayload;
    }
  }

  // Local fallback for manual script testing.
  return {
    release_channel: process.env.INPUT_RELEASE_CHANNEL,
    backend_sha: process.env.INPUT_BACKEND_SHA,
  };
}

function resolveChannel(raw: unknown): ReleaseChannel {
  const value = toStringValue(raw).toLowerCase();
  if (value === 'internal' || value === 'dev') return 'internal';
  if (value === 'stable' || !value) return 'stable';
  fail(`\`release_channel\` must be "internal" or "stable". Received: "${value}"`);
}

async function loadSpecVersion(specUrl: string): Promise<string> {
  let source = '';
  if (specUrl.startsWith('file://')) {
    const filePath = fileURLToPath(specUrl);
    source = readFileSync(filePath, 'utf8');
  } else {
    const response = await fetch(specUrl);
    if (!response.ok) {
      fail(`Failed to fetch spec_url (${specUrl}): ${response.status} ${response.statusText}`);
    }
    source = await response.text();
  }

  const spec = parse(source) as { info?: { version?: unknown } };
  const specVersion = toStringValue(spec?.info?.version);
  if (!specVersion) {
    fail('OpenAPI spec is missing `info.version`.');
  }
  return specVersion;
}

function deriveVersions(specVersion: string, channel: ReleaseChannel, backendSha: string): DerivedVersions {
  // Extract base X.Y.Z (strip any prerelease from spec)
  const semverMatch = specVersion.match(SEMVER_REGEX);
  if (!semverMatch) {
    fail(`Spec info.version must be semver compatible. Received: "${specVersion}"`);
  }

  const buildMetadata = semverMatch?.[5] ?? '';
  if (buildMetadata) {
    fail(
      `Spec info.version must not include build metadata (+...). Received: "${specVersion}"`,
    );
  }

  const baseVersion = `${semverMatch[1]}.${semverMatch[2]}.${semverMatch[3]}`;

  if (channel === 'internal') {
    const shortSha = backendSha.slice(0, 7);
    return {
      specVersion,
      publicVersion: baseVersion,
      internalVersion: `${baseVersion}-internal.${shortSha}`,
      internalOnly: true,
    };
  }

  // Stable channel
  return {
    specVersion,
    publicVersion: baseVersion,
    internalVersion: `${baseVersion}-internal`,
    internalOnly: false,
  };
}

async function main(): Promise<void> {
  const rawPayload = getPayload();

  const channel = resolveChannel(rawPayload.release_channel);

  const backendSha = toStringValue(rawPayload.backend_sha);
  if (!backendSha) fail('`backend_sha` is required.');

  const specUrl = `https://raw.githubusercontent.com/${BACKEND_REPO}/${backendSha}/${SPEC_PATH}`;
  const backendRepo = BACKEND_REPO;

  const specVersion = await loadSpecVersion(specUrl);
  const derived = deriveVersions(specVersion, channel, backendSha);

  const releaseTag = channel === 'stable' ? `v${derived.specVersion}` : '';
  const prerelease = channel === 'internal';
  const distTag = channel === 'stable' ? 'latest' : 'internal';
  const internalDistTag = 'internal';

  console.log(
    `Release payload OK: channel=${channel} from ${backendRepo}@${backendSha} (spec=${derived.specVersion})`,
  );
  console.log(
    `Publish plan: public=${derived.publicVersion} internal=${derived.internalVersion} internal_only=${derived.internalOnly}`,
  );

  writeOutput('release_channel', channel);
  writeOutput('spec_version', derived.specVersion);
  writeOutput('public_version', derived.publicVersion);
  writeOutput('internal_version', derived.internalVersion);
  writeOutput('internal_only', String(derived.internalOnly));
  writeOutput('release_tag', releaseTag);
  writeOutput('prerelease', String(prerelease));
  writeOutput('dist_tag', distTag);
  writeOutput('internal_dist_tag', internalDistTag);
  writeOutput('spec_url', specUrl);
  writeOutput('backend_sha', backendSha);
  writeOutput('backend_repo', backendRepo);

}

main().catch((error) => {
  fail(String(error));
});
