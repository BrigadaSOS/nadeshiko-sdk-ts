/**
 * Nadeshiko SDK usage examples.
 *
 * These snippets are for reference only — they are NOT meant to be executed
 * as-is. Copy the parts you need into your own project.
 */

import {
  createNadeshikoClient,
  NadeshikoError,
} from '@brigadasos/nadeshiko-sdk';

// Client setup

const client = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  baseURL: 'PRODUCTION', // 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | custom URL
});

// With retry + timeout + custom headers
const clientWithRetry = createNadeshikoClient({
  apiKey: process.env.NADESHIKO_API_KEY!,
  headers: { 'User-Agent': 'MyApp/1.0' },
  retryOptions: {
    maxRetries: 3,
    timeout: 10_000,
  },
});

// Basic search — body fields passed directly

async function basicSearch() {
  const data = await client.search({
    query: { search: '食べる' },
  });

  for (const segment of data.segments) {
    console.log(segment.textJa.content);
    console.log(segment.textEn.content);
    console.log(`${segment.mediaPublicId} EP ${segment.episode}`);
  }
}

// Search with filters

async function filteredSearch() {
  const data = await client.search({
    query: { search: 'おはよう', exactMatch: true },
    take: 5,
    sort: { mode: 'ASC' },
    filters: {
      category: ['ANIME'],
      contentRating: ['SAFE'],
      segmentLengthChars: { min: 3, max: 30 },
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
  const data = await client.search({
    query: { search: 'ありがとう' },
    filters: {
      media: {
        include: [
          { mediaPublicId: 'abc', episodes: [1, 2, 3] },
          { mediaPublicId: 'xyz', episodes: [5] },
        ],
      },
    },
  });

  console.log(data.segments.length, 'results');
}

// Search multiple words at once

async function multiWordSearch() {
  const data = await client.searchWords({
    query: { words: ['猫', '犬', '鳥'] },
  });

  for (const entry of data.results) {
    console.log(`${entry.word}: ${entry.matchCount} occurrences across ${entry.media.length} media`);
  }
}

// Find media by name (autocomplete-style search)

async function findMedia() {
  const data = await client.searchMedia({
    query: 'steins',
    take: 5,
  });

  for (const media of data.media) {
    console.log(`[${media.mediaPublicId}] ${media.nameEn}`);
  }
}

// Get corpus statistics overview (powers the /stats page)

async function statsOverview() {
  const data = await client.getStatsOverview();

  console.log(`Total segments: ${data.totalSegments}`);
  console.log(`Total media: ${data.totalMedia}`);
}

// Get current user profile and quota

async function currentUser() {
  const data = await client.getMe();

  console.log(`User: ${data.user.username} (${data.user.role})`);
  console.log(`Quota used: ${data.quota.used} / ${data.quota.limit}`);
}

// Excluded media — hide media from search results

async function excludedMedia() {
  // List currently excluded media
  const list = await client.listExcludedMedia();
  console.log(`Excluding ${list.excludedMedia.length} media`);

  // Exclude a media entry
  await client.addExcludedMedia({ mediaPublicId: 'some-public-id' });

  // Re-include it
  await client.removeExcludedMedia('some-public-id');
}

// Get search filter stats

async function searchStats() {
  const data = await client.getSearchStats({
    query: { search: '学校' },
    filters: { category: ['ANIME'] },
  });

  for (const cat of data.categories) {
    console.log(`${cat.category}: ${cat.count} hits`);
  }
}

// Get a single media — string shorthand or flat params

async function getMediaDetails() {
  // Shorthand: pass the ID directly
  const data = await client.getMedia('some-public-id');

  // Equivalent flat form:
  // const data = await client.getMedia({ mediaPublicId: 'some-public-id' });

  console.log(data.nameEn, data.nameJa);
  console.log(`Episodes: ${data.episodeCount}, Segments: ${data.segmentCount}`);
}

// Get segment context — string shorthand

async function segmentContext() {
  const data = await client.getSegmentContext('some-segment-uuid');

  for (const segment of data.segments) {
    console.log(`[${segment.startTimeMs}ms] ${segment.textJa.content}`);
  }
}

// Browse media catalog — query params at top level

async function browseMediaCatalog() {
  const data = await client.listMedia({
    search: 'naruto',
    category: 'ANIME',
    take: 20,
  });

  for (const media of data.media) {
    console.log(`[${media.mediaPublicId}] ${media.nameEn} (${media.airingStatus})`);
    console.log(`  Genres: ${media.genres.join(', ')}`);
    console.log(`  Episodes: ${media.episodeCount}`);
  }
}

// Get episode — path params at top level

async function getEpisodeDetails() {
  const data = await client.getEpisode({
    mediaPublicId: 'some-media-id',
    episodeNumber: 5,
  });

  console.log(data.titleEn);
}

// Access media URLs

async function mediaUrls() {
  const data = await client.search({
    query: { search: '桜' },
  });

  for (const segment of data.segments) {
    console.log('Image:', segment.urls.imageUrl);
    console.log('Audio:', segment.urls.audioUrl);
    console.log('Video:', segment.urls.videoUrl);
  }
}

// Morpheme / token analysis

async function morphemeAnalysis() {
  const data = await client.search({
    query: { search: '彼女は毎日学校に行く' },
  });

  const segment = data.segments[0];
  const tokens = segment?.textJa?.tokens;
  if (!tokens) return;

  for (const m of tokens) {
    console.log(`${m.s} [${m.r}] — ${m.p} (dict: ${m.d})`);
  }
}

// Paginated search — built-in auto-pagination

async function paginatedSearch() {
  for await (const segment of client.search.paginate({
    query: { search: '猫' },
    take: 20,
  })) {
    console.log(segment.textJa.content);
  }
}

// Browse all media with pagination

async function paginatedMediaBrowse() {
  for await (const media of client.listMedia.paginate({
    category: 'ANIME',
  })) {
    console.log(media.nameEn);
  }
}

// Manual cursor pagination

async function manualPagination() {
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
}

// Error handling

async function errorHandling() {
  try {
    const data = await client.search({
      query: { search: 'test' },
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
          console.error('Server error, trace ID:', err.traceId);
          break;
        default:
          console.error(`[${err.status}] ${err.code}: ${err.detail}`);
      }
    } else {
      throw err;
    }
  }
}

// Opt out of throwing for a single call

async function optOutOfThrowing() {
  const result = await client.search({
    throwOnError: false,
    query: { search: '猫' },
  });

  if ('error' in result) {
    console.error('Search failed:', result.error);
  } else {
    console.log(result.data.segments.length, 'results');
  }
}
