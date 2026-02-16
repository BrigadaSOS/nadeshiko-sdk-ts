# Nadeshiko SDK

TypeScript SDK for the [Nadeshiko API](https://nadeshiko.co).

## Install

```bash
bun add @brigadasos/nadeshiko-sdk
```

Install the internal build (includes internal endpoints) via the `internal` dist-tag:

```bash
bun add @brigadasos/nadeshiko-sdk@internal
```

## Use the public SDK

The client sends your API key as `Authorization: Bearer <apiKey>`.

```typescript
import { createClient, searchSegments } from '@brigadasos/nadeshiko-sdk';

const client = createClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseUrl: 'PRODUCTION',
});

const result = await searchSegments({
  client,
  body: { query: '彼女' },
});

if (result.error) {
  console.error(result.error.code, result.error.detail);
} else {
  console.log(result.data);
}
```

### Error handling

Every response returns a discriminated union with either `data` or `error`. The `error` object follows the [RFC 7807](https://tools.ietf.org/html/rfc7807) Problem Details format, so you always get a machine-readable `code` and a human-readable `detail`.

```typescript
import { createClient, searchSegments } from '@brigadasos/nadeshiko-sdk';

const client = createClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseUrl: 'PRODUCTION',
});

const result = await searchSegments({
  client,
  body: { query: '食べる' },
});

if (result.error) {
  switch (result.error.code) {
    // 400 — Bad Request
    case 'VALIDATION_FAILED':
      console.error('Validation failed:', result.error.detail);
      for (const [field, msg] of Object.entries(result.error.errors ?? {})) {
        console.error(`  ${field}: ${msg}`);
      }
      break;
    case 'INVALID_JSON':
      console.error('Malformed JSON body:', result.error.detail);
      break;
    case 'INVALID_REQUEST':
      console.error('Invalid request:', result.error.detail);
      break;

    // 401 — Unauthorized
    case 'AUTH_CREDENTIALS_REQUIRED':
      console.error('Missing API key or session token');
      break;
    case 'AUTH_CREDENTIALS_INVALID':
      console.error('API key is invalid');
      break;
    case 'AUTH_CREDENTIALS_EXPIRED':
      console.error('Token has expired, re-authenticate');
      break;
    case 'EMAIL_NOT_VERIFIED':
      console.error('Email verification required');
      break;

    // 403 — Forbidden
    case 'ACCESS_DENIED':
      console.error('Access denied');
      break;
    case 'INSUFFICIENT_PERMISSIONS':
      console.error('API key lacks the required scope');
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
      console.error('Server error, trace ID:', result.error.instance);
      break;
  }
  return;
}

// result.data is fully typed as SearchResponse
for (const hit of result.data.results ?? []) {
  console.log(hit.segment.ja.content, '—', hit.media.nameEn);
}
```

### `throwOnError` mode

If you prefer exceptions over checking `.error`, pass `throwOnError: true`. The call will throw on any non-2xx response, and the return type narrows to just `{ data }`.

```typescript
try {
  const { data } = await searchSegments({
    client,
    throwOnError: true,
    body: { query: '彼女' },
  });

  console.log(data.results);
} catch (error) {
  console.error('Request failed:', error);
}
```

See [`examples/examples.ts`](examples/examples.ts) for more usage patterns.
