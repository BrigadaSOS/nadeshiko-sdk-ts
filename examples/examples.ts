/**
 * Nadeshiko SDK usage examples.
 *
 * These snippets are for reference only — they are NOT meant to be executed
 * as-is. Copy the parts you need into your own project.
 */

import {
  createNadeshikoClient,
  searchSegments,
  searchWords,
  getSearchStats,
  getSegmentContext,
  browseMedia,
  mediaShow,
  getUserQuota,
  listIndex,
  listGetSegments,
  listAddSegment,
  listRemoveSegment,
  type SearchSegmentsResponse,
} from '@brigadasos/nadeshiko-sdk';

// ---------------------------------------------------------------------------
// Client setup
// ---------------------------------------------------------------------------

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseUrl: 'PRODUCTION', // 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | custom URL
});

// ---------------------------------------------------------------------------
// Basic search
// ---------------------------------------------------------------------------

async function basicSearch() {
  const result = await searchSegments({
    client,
    body: { query: '食べる' },
  });

  if (result.error) {
    console.error(result.error.code, result.error.detail);
    return;
  }

  for (const hit of result.data.results ?? []) {
    console.log(hit.segment.ja.content);
    console.log(hit.segment.en.content);
    console.log(hit.media.nameEn, `EP ${hit.segment.episodeNumber}`);
    console.log('---');
  }
}

// ---------------------------------------------------------------------------
// Search with filters
// ---------------------------------------------------------------------------

async function filteredSearch() {
  const result = await searchSegments({
    client,
    body: {
      query: 'おはよう',
      category: ['ANIME'],
      limit: 5,
      contentSort: 'ASC',        // shortest sentences first
      minLength: 3,
      maxLength: 30,
      exactMatch: true,           // exact phrase matching
      excludedMediaIds: [42, 99], // exclude specific media
    },
  });

  if (result.error) return;

  console.log(`Found ~${result.data.pagination?.estimatedTotalHits} results`);

  for (const hit of result.data.results ?? []) {
    console.log(hit.segment.ja.content);

    // Highlighted version (search terms wrapped in <em>)
    if (hit.segment.ja.highlight) {
      console.log('Highlight:', hit.segment.ja.highlight);
    }
  }
}

// ---------------------------------------------------------------------------
// Paginated search with cursor
// ---------------------------------------------------------------------------

async function paginatedSearch() {
  let cursor: number[] | undefined;
  let page = 0;

  do {
    const result = await searchSegments({
      client,
      body: {
        query: '猫',
        limit: 10,
        cursor,
      },
    });

    if (result.error) {
      console.error(result.error.detail);
      break;
    }

    page++;
    console.log(`Page ${page}:`);
    for (const hit of result.data.results ?? []) {
      console.log(` - ${hit.segment.ja.content}`);
    }

    cursor = result.data.cursor;
  } while (cursor);
}

// ---------------------------------------------------------------------------
// Search filtered to specific media + episodes
// ---------------------------------------------------------------------------

async function mediaFilteredSearch() {
  const result = await searchSegments({
    client,
    body: {
      query: 'ありがとう',
      media: [
        { mediaId: 123, episodes: [1, 2, 3] },
        { mediaId: 456, episodes: [5] },
      ],
    },
  });

  if (result.error) return;
  console.log(result.data.results?.length, 'results');
}

// ---------------------------------------------------------------------------
// Search multiple words at once
// ---------------------------------------------------------------------------

async function multiWordSearch() {
  const result = await searchWords({
    client,
    body: {
      words: ['猫', '犬', '鳥'],
      exactMatch: true,
    },
  });

  if (result.error) return;

  for (const match of result.data.results ?? []) {
    console.log(`${match.word}: ${match.matchCount} total matches, found in ${match.media?.length} media`);

    for (const m of match.media ?? []) {
      console.log(`  ${m.nameEn} — ${m.matchCount} hits`);
    }
  }
}

// ---------------------------------------------------------------------------
// Get search filter stats (for building UI filters)
// ---------------------------------------------------------------------------

async function searchStats() {
  const result = await getSearchStats({
    client,
    body: {
      query: '学校',
      category: ['ANIME'],
    },
  });

  if (result.error) return;

  // Category tab counts
  for (const cat of result.data.categories ?? []) {
    console.log(`${cat.category}: ${cat.count} hits`);
  }

  // Per-media breakdown
  for (const media of result.data.media ?? []) {
    console.log(`${media.nameEn}: ${media.segmentCount} segments`);
    for (const [ep, count] of Object.entries(media.episodeHits ?? {})) {
      console.log(`  EP ${ep}: ${count}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Get surrounding context for a segment
// ---------------------------------------------------------------------------

async function segmentContext() {
  const result = await getSegmentContext({
    client,
    body: {
      mediaId: 123,
      episodeNumber: 1,
      segmentPosition: 42,
      limit: 3, // 3 segments before + after
    },
  });

  if (result.error) return;

  for (const seg of result.data.segments) {
    console.log(`[${seg.segment.startTime}] ${seg.segment.ja.content}`);
  }
}

// ---------------------------------------------------------------------------
// Browse media catalog
// ---------------------------------------------------------------------------

async function browseMediaCatalog() {
  const result = await browseMedia({
    client,
    query: {
      query: 'naruto',
      type: 'anime',
      size: 20,
      cursor: 0,
    },
  });

  if (result.error) return;

  for (const media of result.data.media ?? []) {
    console.log(`[${media.id}] ${media.nameEn} (${media.airingStatus})`);
    console.log(`  Genres: ${media.genres?.join(', ')}`);
    console.log(`  Episodes: ${media.episodeCount}`);
  }
}

// ---------------------------------------------------------------------------
// Get a single media's details
// ---------------------------------------------------------------------------

async function getMediaDetails() {
  const result = await mediaShow({
    client,
    path: { id: 123 },
  });

  if (result.error) {
    if (result.error.status === 404) {
      console.error('Media not found');
    }
    return;
  }

  const media = result.data;
  console.log(media.nameEn, media.nameJa);
  console.log(`Category: ${media.category}`);
  console.log(`Episodes: ${media.episodeCount}`);
  console.log(`Segments: ${media.segmentCount}`);
}

// ---------------------------------------------------------------------------
// Check API quota
// ---------------------------------------------------------------------------

async function checkQuota() {
  const result = await getUserQuota({ client });

  if (result.error) return;

  const quota = result.data;
  console.log(`Plan: ${quota.plan}`);
  console.log(`Searches: ${quota.searchesUsed}/${quota.searchesLimit}`);
  console.log(`Resets at: ${quota.resetsAt}`);
}

// ---------------------------------------------------------------------------
// Working with lists
// ---------------------------------------------------------------------------

async function listExamples() {
  // Fetch all public lists
  const lists = await listIndex({
    client,
    query: { visibility: 'public', type: 'SEGMENT' },
  });

  if (lists.error) return;

  for (const list of lists.data ?? []) {
    console.log(`[${list.id}] ${list.name} — ${list.segmentCount} segments`);
  }

  // Get segments from a list
  const segments = await listGetSegments({
    client,
    path: { id: 1 },
  });

  if (!segments.error) {
    for (const item of segments.data.segments ?? []) {
      console.log(item.segment.ja.content);
    }
  }

  // Add a segment to a list
  const added = await listAddSegment({
    client,
    path: { id: 1 },
    body: {
      segmentUuid: 'abc-123-def',
      note: 'Great example sentence',
    },
  });

  if (added.error) {
    console.error('Failed to add segment:', added.error.detail);
  }

  // Remove a segment from a list
  const removed = await listRemoveSegment({
    client,
    path: { id: 1 },
    body: { segmentUuid: 'abc-123-def' },
  });

  if (removed.error) {
    console.error('Failed to remove segment:', removed.error.detail);
  }
}

// ---------------------------------------------------------------------------
// Working with morphemes (word-level analysis)
// ---------------------------------------------------------------------------

async function morphemeAnalysis() {
  const result = await searchSegments({
    client,
    body: { query: '彼女は毎日学校に行く' },
  });

  if (result.error) return;

  const firstHit = result.data.results?.[0];
  if (!firstHit?.segment.morphemes) return;

  for (const m of firstHit.segment.morphemes) {
    console.log(
      `${m.surface} [${m.reading}] — ${m.posShort} (base: ${m.baseform})`,
    );

    if (m.pitchAccentType.length > 0) {
      console.log(`  Pitch accent: ${m.pitchAccentType.join(', ')}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Error handling patterns
// ---------------------------------------------------------------------------

async function errorHandlingExhaustive() {
  const result = await searchSegments({
    client,
    body: { query: 'test' },
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

  console.log(result.data);
}

// ---------------------------------------------------------------------------
// throwOnError mode — exceptions instead of .error checks
// ---------------------------------------------------------------------------

async function throwOnErrorMode() {
  try {
    const { data } = await searchSegments({
      client,
      throwOnError: true,
      body: { query: '彼女' },
    });

    // data is typed as SearchResponse (never undefined)
    console.log(data.results?.length, 'results');
  } catch (error) {
    console.error('Request failed:', error);
  }
}

// ---------------------------------------------------------------------------
// Using the NadeshikoClient wrapper (methods bound to client)
// ---------------------------------------------------------------------------

async function nadeshikoClientWrapper() {
  const nadeshiko = createNadeshikoClient({
    apiKey: process.env.NADESHIKO_API_KEY!,
    baseUrl: 'PRODUCTION',
  });

  // Call methods directly — no need to pass `client` each time
  const result = await nadeshiko.searchSegments({
    body: { query: '友達' },
  });

  if (result.error) return;
  console.log(result.data.results?.length, 'results');

  // Other methods work the same way
  const quota = await nadeshiko.getUserQuota();
  if (!quota.error) {
    console.log(`Searches used: ${quota.data.searchesUsed}`);
  }
}

// ---------------------------------------------------------------------------
// Accessing media URLs (images, audio, video)
// ---------------------------------------------------------------------------

async function mediaUrls() {
  const result = await searchSegments({
    client,
    body: { query: '桜' },
  });

  if (result.error) return;

  for (const hit of result.data.results ?? []) {
    if (hit.urls.imageUrl) console.log('Image:', hit.urls.imageUrl);
    if (hit.urls.audioUrl) console.log('Audio:', hit.urls.audioUrl);
    if (hit.urls.videoUrl) console.log('Video:', hit.urls.videoUrl);
  }
}
