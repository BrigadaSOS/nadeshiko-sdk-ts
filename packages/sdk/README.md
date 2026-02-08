# @brigadasos/nadeshiko-sdk

TypeScript SDK for the Nadeshiko API (public endpoints only).

## Installation

```bash
bun add @brigadasos/nadeshiko-sdk
```

## Usage

The client sends your API key as `Authorization: Bearer <apiKey>`.

```typescript
import { createClient, search, fetchMediaInfo } from '@brigadasos/nadeshiko-sdk';

// Create a client
const client = createClient({
  apiKey: 'your-api-key',
  baseUrl: 'PRODUCTION' // or 'LOCAL', 'DEVELOPMENT', or custom URL
});

// Search for sentences
const result = await search({
  client,
  body: { query: '彼女', limit: 10 }
});

// Fetch media info
const media = await fetchMediaInfo({
  client,
  params: { mediaId: 123 }
});
```

CommonJS:

```javascript
const { createClient, search, fetchMediaInfo } = require('@brigadasos/nadeshiko-sdk');
```

## Environment

Pre-configured environments:

- `LOCAL`: `http://localhost:5000/api`
- `DEVELOPMENT`: `https://api.dev.brigadasos.xyz/api`
- `PRODUCTION`: `https://api.brigadasos.xyz/api`

## Available Endpoints

This SDK includes public endpoints only:
- Search: `search`, `searchMultiple`, `fetchSentenceContext`, `fetchMediaInfo`
- Media: `mediaIndex`, `mediaShow`, `episodeIndex`, `episodeShow`, `segmentShow`, `segmentShowByUuid`
- Characters: `characterShow`
- Seiyuu: `seiyuuShow`
- Lists: `listIndex`, `listShow`

## Error Handling

All methods return `{ data?, error? }`:

```typescript
const result = await search({ client, body: { query: '彼女' } });

if (result.error) {
  console.error(result.error.code, result.error.detail);
} else {
  console.log(result.data);
}
```

## License

MIT
