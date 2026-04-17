# Nadeshiko SDK

TypeScript SDK for the [Nadeshiko API](https://nadeshiko.co). Full API reference at [nadeshiko.co/docs/api](https://nadeshiko.co/docs/api/index.html).

## Install

```bash
npm add @brigadasos/nadeshiko-sdk
```

## Quick start

```typescript
import { createNadeshikoClient } from '@brigadasos/nadeshiko-sdk';

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
});

const data = await client.search({ query: { search: '彼女' } });
console.log(data.segments);
// [
//   {
//     segmentPublicId: 'xK9mP2nQwR4t',
//     mediaPublicId: 'steins-gate',
//     episode: 1,
//     startTimeMs: 62340,
//     endTimeMs: 65180,
//     textJa: { content: '彼女に会いたい' },
//     textEn: { content: 'I want to see her' },
//     urls: {
//       imageUrl: 'https://...',
//       audioUrl: 'https://...',
//       videoUrl: 'https://...',
//     },
//   },
//   // ...
// ]
```

## Authentication

Pass your API key to `createNadeshikoClient`. It is sent as `Authorization: Bearer <apiKey>` on every request.

```typescript
const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseURL: 'PRODUCTION'
});
```

## Available endpoints

### Search
| Method | Description |
|---|---|
| `search(params?)` | Search segments by query, with filters and sorting |
| `getSearchStats(params?)` | Category counts and media list for filter UI |
| `searchWords(params)` | Look up multiple words and get match counts per media |
| `searchMedia(params)` | Find media by name (autocomplete) |

### Stats
| Method | Description |
|---|---|
| `getStatsOverview()` | Corpus-wide stats: segment count, media count, coverage tiers |

### Media
| Method | Description |
|---|---|
| `listMedia(params?)` | Browse the media catalog |
| `getMedia(id)` | Get a single media entry by public ID |
| `listEpisodes(params)` | List episodes for a media entry |
| `getEpisode(params)` | Get a single episode |
| `getSegment(id)` | Get a single segment by UUID |
| `getSegmentContext(id)` | Get segments surrounding a given segment |

### User
| Method | Description |
|---|---|
| `getMe()` | Current user profile and API quota |
| `listUserActivity(params?)` | Activity history (searches, plays, exports) |
| `getUserActivityHeatmap(params?)` | Daily activity counts for a heatmap |
| `getUserActivityStats(params?)` | Aggregate stats over a date range |
| `listExcludedMedia()` | Media hidden from search results |
| `addExcludedMedia(params)` | Hide a media entry from search results |
| `removeExcludedMedia(id)` | Un-hide a media entry |

### Collections
| Method | Description |
|---|---|
| `listCollections(params?)` | List your saved collections |
| `createCollection(params)` | Create a new collection |
| `getCollection(id)` | Get a collection and its segments |
| `deleteCollection(id)` | Delete a collection |
| `addSegmentToCollection(params)` | Add a segment to a collection |
| `searchCollectionSegments(params)` | Search within a collection |
| `removeSegmentFromCollection(params)` | Remove a segment from a collection |

## Error handling

Errors throw a `NadeshikoError`. A proper `Error` subclass with all RFC 7807 Problem Details fields.

```typescript
import { NadeshikoError } from '@brigadasos/nadeshiko-sdk';

try {
  const data = await client.search({ query: { search: '食べる' } });
  console.log(data.segments);
} catch (err) {
  if (err instanceof NadeshikoError) {
    switch (err.code) {
      case 'VALIDATION_FAILED':
        console.error('Validation failed:', err.detail);
        for (const [field, msg] of Object.entries(err.errors ?? {})) {
          console.error(`  ${field}: ${msg}`);
        }
        break;
      case 'AUTH_CREDENTIALS_REQUIRED':
      case 'AUTH_CREDENTIALS_INVALID':
        console.error('Authentication failed:', err.detail);
        break;
      case 'RATE_LIMIT_EXCEEDED':
        console.error('Rate limited — slow down');
        break;
      case 'QUOTA_EXCEEDED':
        console.error('Monthly quota exhausted');
        break;
      case 'INTERNAL_SERVER_EXCEPTION':
        console.error('Server error, trace ID:', err.traceId);
        break;
    }
  }
}
```

**`NadeshikoError` fields:**

| Field | Type | Description |
|---|---|---|
| `code` | `string` | Machine-readable error code |
| `title` | `string` | Short summary |
| `detail` | `string` | Human-readable explanation |
| `status` | `number` | HTTP status code |
| `traceId` | `string \| undefined` | Trace ID — include when reporting issues |
| `errors` | `Record<string, string> \| undefined` | Per-field messages (`VALIDATION_FAILED` only) |

### Opt out of throwing per-call

Pass `throwOnError: false` to get a `{ data, error }` result instead of throwing:

```typescript
const result = await client.search({
  throwOnError: false,
  query: { search: '猫' },
});

if ('error' in result) {
  console.error(result.error);
} else {
  console.log(result.data.segments);
}
```

## Retry and timeout

The client retries automatically on network errors and `408 / 429 / 500 / 502 / 503 / 504` responses. `429` responses with a `Retry-After` header are respected.

```typescript
const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  retryOptions: {
    maxRetries: 3,        // default: 2
    initialDelayMs: 1000, // default: 500 — doubles with each attempt
    maxDelayMs: 30_000,   // default: 30_000
    timeout: 10_000,      // per-attempt timeout in ms (default: none)
  },
});
```

## Pagination

Paginated endpoints have a `.paginate()` method that returns an async iterator over individual items:

```typescript
for await (const segment of client.search.paginate({
  query: { search: '猫' },
})) {
  console.log(segment.textJa.content);
}

for await (const media of client.listMedia.paginate()) {
  console.log(media.nameEn);
}
```

For manual page-by-page control, use the `cursor` field:

```typescript
let cursor: string | undefined;

do {
  const data = await client.search({
    query: { search: '犬' },
    take: 10,
    cursor,
  });

  for (const segment of data.segments) {
    console.log(segment.textJa.content);
  }

  cursor = data.pagination.hasMore ? data.pagination.cursor : undefined;
} while (cursor);
```

See [`examples/examples.ts`](examples/examples.ts) for more usage patterns.
