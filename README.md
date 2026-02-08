> This repository is still in WIP and not ready for production use

 # Nadeshiko SDK

TypeScript SDKs for the [Nadeshiko API](https://nadeshiko.co) - split into public and internal packages.

## Structure

```
nadeshiko-sdk-ts/
├── packages/
│   ├── sdk/              # Public SDK (@brigadasos/nadeshiko-sdk)
│   └── internal-sdk/     # Internal SDK (@brigadasos/nadeshiko-internal-sdk)
├── scripts/
│   └── generate.ts       # Shared generation script
└── package.json          # Root workspace config
```

## Quick Start

SDK clients send API keys via `Authorization: Bearer <apiKey>`.

**Frontend (Public SDK):**
```typescript
import { createClient, search } from '@brigadasos/nadeshiko-sdk';

const client = createClient({
  apiKey: 'your-api-key',
  baseUrl: 'PRODUCTION'
});

const result = await search({ client, body: { query: '彼女' } });
```

**JavaScript (CommonJS):**
```javascript
const { createClient, search } = require('@brigadasos/nadeshiko-sdk');

const client = createClient({
  apiKey: process.env.NADESHIKO_API_KEY,
  baseUrl: 'PRODUCTION'
});

search({ client, body: { query: '彼女' } }).then(console.log);
```

**Internal Service (Internal SDK):**
```typescript
import { createClient, reindexElasticsearch } from '@brigadasos/nadeshiko-internal-sdk';

const client = createClient({
  apiKey: process.env.INTERNAL_API_KEY!,
  baseUrl: 'LOCAL'
});

await reindexElasticsearch({ client, body: { mediaIds: [123] } });

// Optional grouped namespace
import { admin } from '@brigadasos/nadeshiko-internal-sdk';
await admin.reindexElasticsearch({ client, body: { mediaIds: [123] } });
```

## Development

### Generate SDKs

```bash
# Generate public SDK (from GitHub - once backend is pushed)
bun run generate

# Generate internal SDK (from GitHub)
bun run generate:internal

# Generate public SDK (from local backend)
bun run generate:local

# Generate internal SDK (from local backend)
bun run generate:local:internal
```

### Build

```bash
# Build all packages
bun run build

# Build public SDK only
bun run build:public

# Build internal SDK only
bun run build:internal
```

Both SDK packages emit:
- `dist/index.js` (ESM)
- `dist/index.cjs` (CommonJS)
- `dist/index.d.ts` + generated declarations

### Boundary Check

```bash
bun run check:boundaries
```

### Non-npm Distribution

`dist/` is not committed to git. To use SDK outputs without adding an npm dependency:

1. Download package tarballs from npm (`@brigadasos/nadeshiko-sdk`) and extract `dist/`.
2. Download `sdk-dist` artifacts from CI runs (contains both package `dist/` folders).
3. For internal usage, build locally and copy from `packages/internal-sdk/dist`.

### Automated Releases

This repo supports backend-driven SDK releases via `.github/workflows/release-from-backend.yml`.

Flow:
1. Backend publishes a GitHub release with a pinned OpenAPI spec asset URL.
2. Backend dispatches `backend_release` event to this repo.
3. SDK workflow generates, validates, builds, versions, publishes npm package, and creates matching GitHub release assets.

Event payload fields:
- `version` (semver without `v`)
- `release_tag` (with `v`)
- `prerelease` (`true` or `false`)
- `spec_url` (for now using `main-v2` OpenAPI URL)
- `backend_sha`
- `backend_repo`

Backend dispatch example is available at `docs/backend-dispatch-example.md`.

### Clean

```bash
bun run clean
```

## Error Handling

All SDK methods return typed errors generated from the OpenAPI spec:

```typescript
type Error = {
  code: string;      // e.g., 'RATE_LIMIT_EXCEEDED', 'AUTH_CREDENTIALS_INVALID'
  title: string;     // Short summary
  detail: string;    // Detailed explanation
  status: number;    // HTTP status code
  type?: string;     // URI to error documentation
  instance?: string; // Trace ID
  errors?: Record<string, string>; // Validation errors
};
```

## References

- [Nadeshiko Website](https://nadeshiko.co)
- [API Documentation](https://nadeshiko.co/api/v1/docs)
