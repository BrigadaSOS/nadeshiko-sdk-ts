#!/usr/bin/env bun

import { appendFileSync, readFileSync } from 'node:fs';

type RawPayload = {
  version?: unknown;
  release_tag?: unknown;
  prerelease?: unknown;
  spec_url?: unknown;
  backend_sha?: unknown;
  backend_repo?: unknown;
  force?: unknown;
};

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

function parseBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const normalized = toStringValue(value).toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return undefined;
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
    version: process.env.INPUT_VERSION,
    release_tag: process.env.INPUT_RELEASE_TAG,
    prerelease: process.env.INPUT_PRERELEASE,
    spec_url: process.env.INPUT_SPEC_URL,
    backend_sha: process.env.INPUT_BACKEND_SHA,
    backend_repo: process.env.INPUT_BACKEND_REPO,
    force: process.env.INPUT_FORCE,
  };
}

function normalizeReleaseTag(rawReleaseTag: string, version: string): string {
  const fromRef = rawReleaseTag.startsWith('refs/tags/')
    ? rawReleaseTag.replace('refs/tags/', '')
    : rawReleaseTag;
  const candidate = fromRef || `v${version}`;
  return candidate.startsWith('v') ? candidate : `v${candidate}`;
}

function getPreReleaseIdentifier(version: string): string {
  const prereleasePart = version.split('-')[1] ?? '';
  const identifier = prereleasePart.split('.')[0]?.toLowerCase() ?? '';
  return identifier;
}

function getDistTag(isPrerelease: boolean, version: string): string {
  if (!isPrerelease) return 'latest';
  const identifier = getPreReleaseIdentifier(version);
  if (identifier === 'alpha' || identifier === 'beta' || identifier === 'rc') {
    return identifier;
  }
  return 'next';
}

function main(): void {
  const rawPayload = getPayload();

  let version = toStringValue(rawPayload.version);
  const releaseTagCandidate = toStringValue(rawPayload.release_tag);
  if (!version && releaseTagCandidate) {
    version = releaseTagCandidate.replace(/^refs\/tags\//, '').replace(/^v/, '');
  }
  if (!version) fail('`version` is required.');

  if (!SEMVER_REGEX.test(version)) {
    fail(`\`version\` must be semver compatible. Received: "${version}"`);
  }

  const releaseTag = normalizeReleaseTag(releaseTagCandidate, version);
  if (releaseTag.replace(/^v/, '') !== version) {
    fail(`release_tag (${releaseTag}) must match version (${version}).`);
  }

  const specUrl = toStringValue(rawPayload.spec_url);
  if (!specUrl) fail('`spec_url` is required.');
  try {
    new URL(specUrl);
  } catch {
    fail(`\`spec_url\` must be a valid URL. Received: "${specUrl}"`);
  }

  const backendSha = toStringValue(rawPayload.backend_sha);
  if (!backendSha) fail('`backend_sha` is required.');

  const backendRepo = toStringValue(rawPayload.backend_repo);
  if (!backendRepo) fail('`backend_repo` is required.');

  const prereleaseFromVersion = version.includes('-');
  const prereleaseFromPayload = parseBoolean(rawPayload.prerelease);
  if (prereleaseFromPayload != null && prereleaseFromPayload !== prereleaseFromVersion) {
    fail(
      `prerelease flag (${prereleaseFromPayload}) does not match version (${version}).`,
    );
  }
  const prerelease = prereleaseFromPayload ?? prereleaseFromVersion;

  const force = parseBoolean(rawPayload.force) ?? false;
  const distTag = getDistTag(prerelease, version);
  const prereleaseIdentifier = prerelease ? getPreReleaseIdentifier(version) : '';

  console.log(`Release payload OK: ${releaseTag} (${distTag}) from ${backendRepo}@${backendSha}`);
  const isReleasePinned =
    specUrl.includes('/releases/download/') || specUrl.includes(`/${releaseTag}/`);
  const isTemporaryMainV2 =
    specUrl ===
    'https://raw.githubusercontent.com/BrigadaSOS/Nadeshiko/main-v2/backend/docs/generated/openapi.yaml';

  if (!isReleasePinned && !isTemporaryMainV2) {
    console.log(
      'Warning: spec_url does not look release-pinned. Prefer immutable release asset URLs.',
    );
  }

  writeOutput('version', version);
  writeOutput('release_tag', releaseTag);
  writeOutput('prerelease', String(prerelease));
  writeOutput('prerelease_identifier', prereleaseIdentifier);
  writeOutput('dist_tag', distTag);
  writeOutput('spec_url', specUrl);
  writeOutput('backend_sha', backendSha);
  writeOutput('backend_repo', backendRepo);
  writeOutput('force', String(force));
}

main();
