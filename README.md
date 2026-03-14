# Nadeshiko SDK

TypeScript SDK for the [Nadeshiko API](https://nadeshiko.co).

## Install

```bash
# npm / pnpm / bun
npm add @brigadasos/nadeshiko-sdk
pnpm add @brigadasos/nadeshiko-sdk
bun add @brigadasos/nadeshiko-sdk
```

Install the internal build (includes session-authenticated endpoints) via the `internal` dist-tag:

```bash
bun add @brigadasos/nadeshiko-sdk@internal
```

## Quick start

```typescript
import { createNadeshikoClient } from '@brigadasos/nadeshiko-sdk';

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
});

const { data } = await client.search({ body: { query: { search: '彼女' } } });
console.log(data.segments);
```

Errors throw by default. Wrap calls you want to handle explicitly in `try/catch`.

## Authentication

### API key (server-to-server)

Use an API key for public endpoints. The key is sent as `Authorization: Bearer <apiKey>`.

```typescript
import { createNadeshikoClient } from '@brigadasos/nadeshiko-sdk';

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseURL: 'PRODUCTION', // 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | custom URL
});
```

### Session token (user-authenticated endpoints, internal build only)

The public package exposes only API-key-capable endpoints.
For session-authenticated endpoints (`/v1/user/*`, `/v1/collections/*`), use the internal build.

Pass a `sessionToken` getter that returns the value of the `nadeshiko.session_token` cookie — called fresh on every request.

**Nuxt / Nitro server routes:**

```typescript
// server/utils/nadeshiko.ts
import { createNadeshikoClient } from '@brigadasos/nadeshiko-sdk';
import type { H3Event } from 'h3';

export function useNadeshikoClient(event: H3Event) {
  return createNadeshikoClient({
    sessionToken: () => getCookie(event, 'nadeshiko.session_token'),
  });
}
```

```typescript
// server/api/preferences.get.ts
export default defineEventHandler(async (event) => {
  const client = useNadeshikoClient(event);
  return client.getUserPreferences();
});
```

**Browser note:** if your session cookie is `HttpOnly`, use same-origin proxy routes and let the browser attach cookies automatically.

## Error handling

Errors throw a `NadeshikoError` — a proper `Error` subclass with all RFC 7807 Problem Details fields available directly.

```typescript
import { createNadeshikoClient, NadeshikoError } from '@brigadasos/nadeshiko-sdk';

const client = createNadeshikoClient({ apiKey: process.env.NADESHIKO_API_KEY! });

try {
  const { data } = await client.search({ body: { query: { search: '食べる' } } });
  console.log(data.segments);
} catch (err) {
  if (err instanceof NadeshikoError) {
    switch (err.code) {
      // 400 — Bad Request
      case 'VALIDATION_FAILED':
        console.error('Validation failed:', err.detail);
        for (const [field, msg] of Object.entries(err.errors ?? {})) {
          console.error(`  ${field}: ${msg}`);
        }
        break;
      case 'INVALID_JSON':
      case 'INVALID_REQUEST':
        console.error('Bad request:', err.detail);
        break;

      // 401 — Unauthorized
      case 'AUTH_CREDENTIALS_REQUIRED':
        console.error('Missing API key');
        break;
      case 'AUTH_CREDENTIALS_INVALID':
        console.error('API key is invalid');
        break;
      case 'AUTH_CREDENTIALS_EXPIRED':
        console.error('Token has expired, re-authenticate');
        break;

      // 403 — Forbidden
      case 'ACCESS_DENIED':
      case 'INSUFFICIENT_PERMISSIONS':
        console.error('Access denied');
        break;

      // 429 — Too Many Requests
      case 'RATE_LIMIT_EXCEEDED':
        console.error('Rate limit hit, slow down');
        break;
      case 'QUOTA_EXCEEDED':
        console.error('Monthly quota exhausted');
        break;

      // 500 — Internal Server Error
      case 'INTERNAL_SERVER_EXCEPTION':
        // err.traceId is the instance field — include when reporting issues
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
| `traceId` | `string \| undefined` | Trace ID for this error — include when reporting issues |
| `errors` | `Record<string, string> \| undefined` | Per-field messages (`VALIDATION_FAILED` only) |

### Opt out of throwing per-call

If you need the old `{ data, error }` return shape for a specific call, pass `throwOnError: false`:

```typescript
const result = await client.search({
  throwOnError: false,
  body: { query: { search: '猫' } },
});

if (result.error) {
  console.error(result.error);
} else {
  console.log(result.data.segments);
}
```

## Retry and timeout

The client retries automatically on network errors and `408 / 429 / 500 / 502 / 503 / 504` responses. `429` responses with a `Retry-After` header are respected. Configure via `retryOptions`:

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

Use `paginate()` to iterate through all pages without manual cursor tracking:

```typescript
import { createNadeshikoClient, paginate } from '@brigadasos/nadeshiko-sdk';

const client = createNadeshikoClient({ apiKey: process.env.NADESHIKO_API_KEY! });

for await (const segment of paginate(
  (opts) => client.search(opts),
  { body: { query: { search: '猫' } } },
  (data) => ({ items: data.segments, pagination: data.pagination }),
)) {
  console.log(segment.textJa.content);
}
```

`paginate()` works with any endpoint that returns `{ pagination: { hasMore, cursor } }`:

```typescript
// Browse all media
for await (const media of paginate(
  (opts) => client.listMedia(opts),
  {},
  (data) => ({ items: data.media, pagination: data.pagination }),
)) {
  console.log(media.nameEn);
}
```

See [`examples/examples.ts`](examples/examples.ts) for more usage patterns.
