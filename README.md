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
import { createClient, search } from '@brigadasos/nadeshiko-sdk';

const client = createClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseUrl: 'PRODUCTION',
});

const result = await search({
  client,
  body: { query: '彼女' },
});

if (result.error) {
  console.error(result.error.code, result.error.detail);
} else {
  console.log(result.data);
}
```
