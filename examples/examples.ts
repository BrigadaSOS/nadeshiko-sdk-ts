/**
 * Nadeshiko SDK usage examples.
 *
 * These snippets are for reference only — they are NOT meant to be executed
 * as-is. Copy the parts you need into your own project.
 */

import {
  createNadeshikoClient,
  NadeshikoError,
  paginate,
} from '@brigadasos/nadeshiko-sdk';

// Client setup

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseURL: 'PRODUCTION', // 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | custom URL
});

// With retry + timeout configured
const clientWithRetry = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  retryOptions: {
    maxRetries: 3,
    timeout: 10_000,
  },
});

// Basic search

async function basicSearch() {
  const { data } = await client.search({
    body: { query: { search: '食べる' } },
  });

  for (const segment of data.segments) {
    console.log(segment.textJa.content);
    console.log(segment.textEn.content);
    console.log(`${segment.mediaPublicId} EP ${segment.episode}`);
  }
}

// Search with filters

async function filteredSearch() {
  const { data } = await client.search({
    body: {
      query: { search: 'おはよう', exactMatch: true },
      take: 5,
      sort: { mode: 'ASC' },
      filters: {
        category: ['ANIME'],
        contentRating: ['SAFE'],
        segmentLengthChars: { min: 3, max: 30 },
      },
    },
  });

  console.log(`~${data.pagination.estimatedTotalHits} results`);

  for (const segment of data.segments) {
    console.log(segment.textJa.content);
    if (segment.textJa.highlight) {
      console.log('Highlight:', segment.textJa.highlight);
    }
  }
}

// Search filtered to specific media + episodes

async function mediaFilteredSearch() {
  const { data } = await client.search({
    body: {
      query: { search: 'ありがとう' },
      filters: {
        media: {
          include: [
            { mediaId: 'abc', episodes: [1, 2, 3] },
            { mediaId: 'xyz', episodes: [5] },
          ],
        },
      },
    },
  });

  console.log(data.segments.length, 'results');
}

// Search multiple words at once

async function multiWordSearch() {
  const { data } = await client.searchWords({
    body: {
      words: ['猫', '犬', '鳥'],
    },
  });

  for (const entry of data.words) {
    console.log(`${entry.word}: ${entry.totalCount} total, in ${entry.mediaCount} media`);
  }
}

// Get search filter stats (for building UI filters)

async function searchStats() {
  const { data } = await client.getSearchStats({
    body: {
      query: { search: '学校' },
      filters: { category: ['ANIME'] },
    },
  });

  for (const cat of data.categories) {
    console.log(`${cat.category}: ${cat.count} hits`);
  }
}

// Get surrounding context for a segment

async function segmentContext() {
  const { data } = await client.getSegmentContext({
    query: {
      mediaPublicId: 'some-media-id',
      episode: 1,
      position: 42,
      limit: 3,
    },
  });

  for (const segment of data.segments) {
    console.log(`[${segment.startTimeMs}ms] ${segment.textJa.content}`);
  }
}

// Browse media catalog

async function browseMediaCatalog() {
  const { data } = await client.listMedia({
    query: { search: 'naruto', category: 'ANIME', take: 20 },
  });

  for (const media of data.media) {
    console.log(`[${media.publicId}] ${media.nameEn} (${media.airingStatus})`);
    console.log(`  Genres: ${media.genres.join(', ')}`);
    console.log(`  Episodes: ${media.episodeCount}`);
  }
}

// Get a single media's details

async function getMediaDetails() {
  const { data } = await client.getMedia({
    path: { mediaId: 'some-public-id' },
  });

  console.log(data.nameEn, data.nameJa);
  console.log(`Episodes: ${data.episodeCount}, Segments: ${data.segmentCount}`);
}

// Access media URLs (images, audio, video)

async function mediaUrls() {
  const { data } = await client.search({
    body: { query: { search: '桜' } },
  });

  for (const segment of data.segments) {
    console.log('Image:', segment.urls.imageUrl);
    console.log('Audio:', segment.urls.audioUrl);
    console.log('Video:', segment.urls.videoUrl);
  }
}

// Morpheme / pitch accent analysis

async function morphemeAnalysis() {
  const { data } = await client.search({
    body: { query: { search: '彼女は毎日学校に行く' } },
  });

  const segment = data.segments[0];
  if (!segment?.morphemes) return;

  for (const m of segment.morphemes) {
    console.log(`${m.surface} [${m.reading}] — ${m.posShort} (base: ${m.baseform})`);
    if (m.pitchAccentType.length > 0) {
      console.log(`  Pitch: ${m.pitchAccentType.join(', ')}`);
    }
  }
}

// Paginated search — iterate all results across pages

async function paginatedSearch() {
  for await (const segment of paginate(
    (opts) => client.search(opts),
    { body: { query: { search: '猫' }, take: 20 } },
    (data) => ({ items: data.segments, pagination: data.pagination }),
  )) {
    console.log(segment.textJa.content);
  }
}

// Browse all media with pagination

async function paginatedMediaBrowse() {
  for await (const media of paginate(
    (opts) => client.listMedia(opts),
    { query: { category: 'ANIME' } },
    (data) => ({ items: data.media, pagination: data.pagination }),
  )) {
    console.log(media.nameEn);
  }
}

// Manual cursor pagination (when you need page-by-page control)

async function manualPagination() {
  let cursor: string | undefined;

  do {
    const { data } = await client.search({
      body: { query: { search: '犬' }, take: 10, cursor },
    });

    for (const segment of data.segments) {
      console.log(segment.textJa.content);
    }

    cursor = data.pagination.hasMore ? data.pagination.cursor : undefined;
  } while (cursor);
}

// Error handling — NadeshikoError

async function errorHandling() {
  try {
    const { data } = await client.search({
      body: { query: { search: 'test' } },
    });
    console.log(data.segments.length, 'results');
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
          // Include err.traceId when reporting issues
          console.error('Server error, trace ID:', err.traceId);
          break;
        default:
          console.error(`[${err.status}] ${err.code}: ${err.detail}`);
      }
    } else {
      // Network error, timeout, etc.
      throw err;
    }
  }
}

// Opt out of throwing for a single call

async function optOutOfThrowing() {
  const result = await client.search({
    throwOnError: false,
    body: { query: { search: '猫' } },
  });

  if (result.error) {
    console.error('Search failed:', result.error);
  } else {
    console.log(result.data.segments.length, 'results');
  }
}
