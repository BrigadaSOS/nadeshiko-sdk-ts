# @brigadasos/nadeshiko-internal-sdk

**INTERNAL SDK** - Not published to npm. For internal use only.

This SDK includes ALL endpoints (public + internal) and is intended for use in internal services like:
- media-sub-splitter
- Background workers
- Admin tools

## Installation

Local development (using file path):

```bash
cd /path/to/your/service
bun add file:../nadeshiko-sdk-ts/packages/internal-sdk
```

## Usage

The client sends your API key as `Authorization: Bearer <apiKey>`.

```typescript
import { createClient, reindexElasticsearch, getQueueStats } from '@brigadasos/nadeshiko-internal-sdk';

const client = createClient({
  apiKey: process.env.INTERNAL_API_KEY!,
  baseUrl: 'LOCAL' // or 'DEVELOPMENT' or 'PRODUCTION'
});

// Reindex database
await reindexElasticsearch({
  client,
  body: { mediaIds: [123, 456] }
});

// Get queue stats
const stats = await getQueueStats({
  client,
  params: { queueName: 'segments' }
});

// Optional grouped namespace import
import { admin } from '@brigadasos/nadeshiko-internal-sdk';
await admin.retryQueueJobs({
  client,
  body: { queueName: 'segments', jobIds: [42] }
});
```

CommonJS:

```javascript
const { createClient, reindexElasticsearch } = require('@brigadasos/nadeshiko-internal-sdk');
```

## Available Endpoints

This SDK includes ALL endpoints:
- **Public**: Search, Media, Characters, Seiyuu, Lists (GET only)
- **Admin**: Reindexing, Queue management
- **Auth**: User authentication (if needed)

## Security

⚠️ This SDK includes internal endpoints that should NEVER be exposed to the frontend. Do not publish this package to npm.

## Development

Generate SDK from local backend:

```bash
cd /path/to/nadeshiko-sdk-ts
bun run generate:local:internal
```

Build SDK:

```bash
bun run build:internal
```
