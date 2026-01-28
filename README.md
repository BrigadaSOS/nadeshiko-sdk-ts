> This repository is still in WIP and not ready for production use

# Nadeshiko SDK

TypeScript SDK for the [Nadeshiko API](https://nadeshiko.co)

## Quick Start

```typescript
import Nadeshiko from 'nadeshiko-sdk-ts';

// Configure your client once at app startup
Nadeshiko.configure({
  apiKey: 'your-api-key-here',
  baseUrl: 'PRODUCTION', // or 'LOCAL', 'DEVELOPMENT', or custom URL
});

// Use the namespaced methods (names match OpenAPI operationIds)
const result = await Nadeshiko.search({
  body: {
    query: '彼女',
    limit: 10,
  },
});

if (result.error) {
  console.error(result.error.code, result.error.detail);
} else {
  console.log(result.data.sentences);
}
```

## API Methods

All methods are namespaced under `Nadeshiko` and match the OpenAPI operationIds exactly:

You can check the full specification from the [OpenAPI spec page](https://nadeshiko.co/api/v1/docs).


## Error Handling

All methods return `{ data?, error? }`. Choose your style:

**Option 1: Check for errors**
```typescript
const result = await Nadeshiko.search({ body: { query: '彼女' } });

if (result.error) {
  // Error type is fully generated from OpenAPI spec
  console.error(result.error.code);    // e.g., 'RATE_LIMIT_EXCEEDED'
  console.error(result.error.title);   // e.g., 'Rate Limit Exceeded'
  console.error(result.error.detail);  // Detailed message
  console.error(result.error.status);  // HTTP status code
} else {
  console.log(result.data.sentences);
}
```

**Option 2: Let it throw**
```typescript
try {
  const result = await Nadeshiko.search({
    body: { query: '彼女' },
    throwOnError: true,
  });
  console.log(result.data.sentences);
} catch (error) {
  console.error(error);
}
```

In general, all SDK methods return typed errors generated from the OpenAPI spec:

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

Handle each error independently based on the error code returned by the API.

```typescript
import Nadeshiko from 'nadeshiko-sdk-ts';

const result = await Nadeshiko.search({ body: { query: '彼女' } });

if (result.error) {
  // All error fields are typed
  switch (result.error.code) {
    case 'RATE_LIMIT_EXCEEDED':
      console.log('Wait before retrying');
      break;
    case 'AUTH_CREDENTIALS_INVALID':
      console.log('Check your API key');
      break;
    case 'VALIDATION_FAILED':
      console.log('Field errors:', result.error.errors);
      break;
    default:
      console.log(result.error.detail);
  }
}
```

You can check the full list of errors codes for each endpoint from the [OpenAPI spec page](https://nadeshiko.co/api/v1/docs).

## TypeScript Support

All types are auto-generated from the OpenAPI spec.

```typescript
import type {
  SearchRequest,
  SearchResponse,
  Sentence,
  MediaInfoData,
} from 'nadeshiko-sdk-ts';

const request: SearchRequest = {
  query: '彼女',
  limit: 10,
};

const sentence: Sentence = {
  basic_info: { /* ... */ },
  segment_info: { /* ... */ },
  media_info: { /* ... */ },
};
```

## Examples

See `examples/example.ts` for more usage examples.

## References

- [Nadeshiko Website](https://nadeshiko.co)
- [API Documentation](https://nadeshiko.co/settings/api)
