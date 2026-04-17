/**
 * Tests for the generated createNadeshikoClient wrapper behavior.
 *
 * These tests import the built public SDK and use a mock HTTP server
 * to verify flat params, data unwrapping, throwOnError fallback, string shorthand,
 * auto-pagination, custom headers, and error wrapping.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { createNadeshikoClient, NadeshikoError } from '../generated/public';

let server: ReturnType<typeof Bun.serve>;
let baseURL: string;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeAll(() => {
  server = Bun.serve({
    port: 0,
    fetch(req) {
      const url = new URL(req.url);

      // Search endpoint (POST body-only)
      if (url.pathname === '/v1/search' && req.method === 'POST') {
        return req.json().then((body: any) => {
          const cursor = body.cursor;

          if (!cursor) {
            return jsonResponse({
              segments: [{ id: 1, textJa: { content: 'page1' } }],
              includes: { media: {} },
              pagination: { hasMore: true, cursor: 'cursor-2', estimatedTotalHits: 2 },
            });
          }
          if (cursor === 'cursor-2') {
            return jsonResponse({
              segments: [{ id: 2, textJa: { content: 'page2' } }],
              includes: { media: {} },
              pagination: { hasMore: false, cursor: null, estimatedTotalHits: 2 },
            });
          }
          return jsonResponse({ segments: [], includes: { media: {} }, pagination: { hasMore: false, cursor: null, estimatedTotalHits: 0 } });
        });
      }

      // Search stats (POST body-only, echoes custom header + user-agent)
      if (url.pathname === '/v1/search/stats' && req.method === 'POST') {
        const customHeader = req.headers.get('x-custom-header');
        const userAgent = req.headers.get('user-agent');
        return jsonResponse({
          categories: [{ category: 'ANIME', count: 42 }],
          media: [],
          _echoHeader: customHeader,
          _echoUserAgent: userAgent,
        });
      }

      // Media by ID (GET path + query)
      if (url.pathname.match(/^\/v1\/media\/[\w-]+$/) && req.method === 'GET') {
        const id = url.pathname.split('/').pop();
        return jsonResponse({ publicId: id, nameEn: 'Test Media', episodeCount: 12, segmentCount: 100 });
      }

      // Segment by UUID (GET path + query)
      if (url.pathname.match(/^\/v1\/media\/segments\/[\w-]+$/) && req.method === 'GET') {
        const uuid = url.pathname.split('/').pop();
        return jsonResponse({ publicId: uuid, textJa: { content: 'test' } });
      }

      // List media (GET query-only, paginated)
      if (url.pathname === '/v1/media' && req.method === 'GET') {
        return jsonResponse({
          media: [{ publicId: 'media-1', nameEn: 'Anime 1' }],
          pagination: { hasMore: false, cursor: null },
          stats: { totalMedia: 1, totalSegments: 100, totalEpisodes: 12 },
        });
      }

      // Get episode (GET path-only with 2 path params)
      if (url.pathname.match(/^\/v1\/media\/[\w-]+\/episodes\/\d+$/) && req.method === 'GET') {
        const parts = url.pathname.split('/');
        return jsonResponse({
          mediaId: parts[3],
          episodeNumber: Number(parts[5]),
          titleEn: 'Test Episode',
        });
      }

      return new Response('Not Found', { status: 404 });
    },
  });

  baseURL = `http://localhost:${server.port}`;
});

afterAll(() => {
  server.stop();
});

function makeClient(overrides?: Record<string, unknown>) {
  return createNadeshikoClient({
    apiKey: 'test-key',
    baseURL,
    retryOptions: { maxRetries: 0 },
    ...overrides,
  });
}

describe('flat params — body-only endpoints', () => {
  test('search: body fields passed directly at top level', async () => {
    const client = makeClient();
    // Flat: { query: { search: '猫' } } instead of { body: { query: { search: '猫' } } }
    const data = await client.search({ query: { search: '猫' } });

    expect(data.segments).toBeDefined();
    expect(data.segments[0].textJa.content).toBe('page1');
  });

  test('search: returns data directly, not envelope', async () => {
    const client = makeClient();
    const data = await client.search({ query: { search: '猫' } });

    expect((data as any).response).toBeUndefined();
    expect((data as any).request).toBeUndefined();
  });
});

describe('flat params — query-only endpoints', () => {
  test('listMedia: query fields passed directly at top level', async () => {
    const client = makeClient();
    // Flat: { search: 'naruto' } instead of { query: { search: 'naruto' } }
    const data = await client.listMedia({ search: 'naruto', category: 'ANIME' });

    expect(data.media).toBeDefined();
    expect(data.media[0].nameEn).toBe('Anime 1');
  });
});

describe('flat params — path-and-query endpoints', () => {
  test('getMedia: path + query fields merged at top level', async () => {
    const client = makeClient();
    // Flat: { mediaPublicId: 'test-id' } instead of { path: { mediaPublicId: 'test-id' } }
    const data = await client.getMedia({ mediaPublicId: 'test-id' });

    expect(data.publicId).toBe('test-id');
  });

  test('getEpisode: multiple path params at top level', async () => {
    const client = makeClient();
    // Flat: { mediaPublicId: 'abc', episodeNumber: 5 } instead of { path: { mediaPublicId: 'abc', episodeNumber: 5 } }
    const data = await client.getEpisode({ mediaPublicId: 'abc', episodeNumber: 5 });

    expect(data.mediaId).toBe('abc');
    expect(data.episodeNumber).toBe(5);
  });
});

describe('string shorthand', () => {
  test('getMedia accepts string ID', async () => {
    const client = makeClient();
    const data = await client.getMedia('test-media-id');

    expect(data.publicId).toBe('test-media-id');
  });

  test('getSegment accepts string UUID', async () => {
    const client = makeClient();
    const data = await client.getSegment('test-uuid');

    expect(data.publicId).toBe('test-uuid');
  });
});

describe('throwOnError: false', () => {
  test('returns full envelope when throwOnError: false', async () => {
    const client = makeClient();
    const result = await client.search({
      throwOnError: false,
      query: { search: '猫' },
    });

    if ('error' in result) {
      throw new Error('expected data, got error');
    }
    expect(result.data).toBeDefined();
    expect(result.data.segments).toBeDefined();
    expect(result.response).toBeDefined();
  });
});

describe('auto-pagination', () => {
  test('search.paginate yields items across pages', async () => {
    const client = makeClient();
    const items: any[] = [];

    // Flat params: { query: { search: '猫' } } instead of { body: { query: { search: '猫' } } }
    for await (const segment of client.search.paginate({
      query: { search: '猫' },
    })) {
      items.push(segment);
    }

    expect(items).toHaveLength(2);
    expect(items[0].textJa.content).toBe('page1');
    expect(items[1].textJa.content).toBe('page2');
  });

  test('listMedia.paginate yields items', async () => {
    const client = makeClient();
    const items: any[] = [];

    for await (const media of client.listMedia.paginate()) {
      items.push(media);
    }

    expect(items).toHaveLength(1);
    expect(items[0].nameEn).toBe('Anime 1');
  });
});

describe('custom headers', () => {
  test('sends configured headers with requests', async () => {
    const client = makeClient({
      headers: { 'X-Custom-Header': 'test-value' },
    });

    const data = await client.getSearchStats({
      query: { search: 'test' },
    });

    expect((data as any)._echoHeader).toBe('test-value');
  });

  test('sends default User-Agent header', async () => {
    const client = makeClient();

    const data = await client.getSearchStats({
      query: { search: 'test' },
    });

    expect((data as any)._echoUserAgent).toMatch(/^nadeshiko-sdk-ts\/\d+\.\d+\.\d+/);
  });

  test('user-provided User-Agent overrides default', async () => {
    const client = makeClient({
      headers: { 'User-Agent': 'MyApp/1.0' },
    });

    const data = await client.getSearchStats({
      query: { search: 'test' },
    });

    expect((data as any)._echoUserAgent).toBe('MyApp/1.0');
  });
});

describe('error handling', () => {
  test('NadeshikoError has correct fields', () => {
    const err = new NadeshikoError({
      code: 'VALIDATION_FAILED',
      title: 'Bad Request',
      detail: 'field is required',
      status: 400,
      instance: 'trace-123',
      errors: { name: 'is required' },
    });

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(NadeshikoError);
    expect(err.code).toBe('VALIDATION_FAILED');
    expect(err.status).toBe(400);
    expect(err.traceId).toBe('trace-123');
    expect(err.errors).toEqual({ name: 'is required' });
    expect(err.message).toBe('field is required');
    expect(err.name).toBe('NadeshikoError');
  });

  test('NadeshikoError with UNKNOWN_ERROR code', () => {
    const err = new NadeshikoError({
      code: 'UNKNOWN_ERROR' as any,
      title: 'Unexpected error',
      detail: 'Bad Gateway',
      status: 502,
    });

    expect(err.code).toBe('UNKNOWN_ERROR');
    expect(err.status).toBe(502);
  });
});
