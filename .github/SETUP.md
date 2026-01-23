# SDK Automation Setup Guide

This document describes the automated SDK generation and publishing pipeline.

## Overview

The SDK is automatically generated from the backend OpenAPI specification and published to npm when changes are detected.

## Architecture

```
Backend OpenAPI change
  ↓
Sync OpenAPI Spec (daily/manual)
  ↓
Detect changes in vendored spec
  ↓
Regenerate SDK
  ↓
Version bump (patch/minor/major)
  ↓
Build + Test + Publish to npm
  ↓
Create GitHub release
```

## Setup Instructions

### 1. NPM Token Configuration

To enable automated publishing to npm, you need to set up an npm access token:

1. **Create npm account** (if you don't have one):
   - Go to https://www.npmjs.com/signup

2. **Generate access token**:
   - Log in to npm
   - Click on your profile → Access Tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token (you won't see it again!)

3. **Add token to GitHub Secrets**:
   - Go to your GitHub repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Paste your npm token
   - Click "Add secret"

### 2. Repository Permissions

Ensure the repository has the following permissions enabled:

- **Settings → Actions → General → Workflow permissions**:
  - ✅ Read and write permissions
  - ✅ Allow GitHub Actions to create and approve pull requests

### 3. First Publication

The first version must be published manually:

```bash
# Ensure you're logged in to npm
npm login

# Build the package
bun run build

# Verify package contents
npm pack --dry-run

# Publish to npm
npm publish --access public
```

After the first manual publish, all subsequent versions will be published automatically.

## Workflows

### Sync OpenAPI Spec

**File**: `.github/workflows/sync-spec.yml`

**Triggers**:
- Daily at 2 AM UTC (cron schedule)
- Manual trigger via GitHub Actions UI

**What it does**:
1. Fetches latest OpenAPI spec from backend repository
2. Compares with vendored spec in `openapi-spec/openapi.yaml`
3. Creates a PR if changes are detected

**Manual trigger**:
```bash
# Via GitHub UI: Actions → Sync OpenAPI Spec → Run workflow
```

### Publish SDK

**File**: `.github/workflows/publish-sdk.yml`

**Triggers**:
- Push to `main` branch (when `openapi-spec/openapi.yaml` changes)
- Manual trigger with version bump type selection

**What it does**:
1. Regenerates SDK from OpenAPI spec
2. Bumps version (patch/minor/major)
3. Updates CHANGELOG.md
4. Builds the package
5. Runs tests (when available)
6. Publishes to npm (auto for patch/minor, draft release for major)
7. Creates GitHub release
8. Pushes version tag

**Manual trigger**:
```bash
# Via GitHub UI: Actions → Publish SDK → Run workflow
# Select version bump type: patch, minor, or major
```

## Versioning Strategy

The SDK follows [Semantic Versioning](https://semver.org/):

- **PATCH** (1.0.0 → 1.0.1): Bug fixes, documentation updates, SDK wrapper improvements
  - Auto-published to npm
  - No breaking changes

- **MINOR** (1.0.0 → 1.1.0): New features, optional fields added
  - Auto-published to npm
  - Backward compatible

- **MAJOR** (1.0.0 → 2.0.0): Breaking changes
  - Creates draft release for manual review
  - Requires manual npm publish
  - Examples: endpoint removed, required field added, type changed

## Developer Workflow

### For SDK Maintainers

**Sync spec manually**:
1. Go to Actions → "Sync OpenAPI Spec" → Run workflow
2. Review and merge the created PR
3. Publishing will trigger automatically

**Override version bump**:
1. Go to Actions → "Publish SDK" → Run workflow
2. Select version bump type (patch/minor/major)

**Local development**:
```bash
# Copy latest spec from backend
cp ../Nadeshiko/backend/docs/generated/openapi.yaml openapi-spec/

# Regenerate SDK
bun run generate

# Build
bun run build

# Test locally
npm pack
npm install nadeshiko-sdk-ts-1.0.0.tgz -g

# Publish manually (if needed)
npm publish --access public
```

### For Backend Developers

No action required! The SDK will automatically update when OpenAPI spec changes are merged to the backend's main branch.

## Monitoring

### Check workflow status
- Go to Actions tab in GitHub
- Monitor "Sync OpenAPI Spec" and "Publish SDK" workflows

### Verify npm publication
```bash
# Check latest version on npm
npm view nadeshiko-sdk-ts

# Check all versions
npm view nadeshiko-sdk-ts versions
```

### Check GitHub releases
- Go to Releases tab in GitHub
- Latest releases are auto-generated with version tags

## Troubleshooting

### Workflow fails with "NPM_TOKEN not found"
- Ensure you've added the NPM_TOKEN secret (see Setup Instructions above)

### Workflow fails with permission errors
- Check repository permissions (Settings → Actions → General)
- Ensure workflow has write permissions

### Spec sync creates empty PRs
- Spec hasn't changed since last sync
- Workflow will skip PR creation

### Manual publish needed for major versions
- This is intentional for safety
- Review changes, then publish manually:
  ```bash
  npm publish --provenance --access public
  ```

### Build fails after spec update
- OpenAPI spec may have breaking changes
- Review generated code in `src/generated/`
- May need to update wrapper code in `src/config.ts`

## Future Improvements

- [ ] Implement breaking change detection from OpenAPI diff
- [ ] Add unit tests for client wrapper
- [ ] Configure automated testing in CI
- [ ] Add CHANGELOG auto-generation from commits
- [ ] Add npm provenance verification
- [ ] Implement spec validation before merge
- [ ] Add Slack/Discord notifications for releases
