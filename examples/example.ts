/**
 * Nadeshiko SDK Example
 *
 * Shows all API methods using the namespace approach.
 */

import Nadeshiko from '../src';

// Configure once
Nadeshiko.configure({
  apiKey: process.env.NADESHIKO_API_KEY || 'your-api-key',
  baseUrl: 'PRODUCTION', // or 'LOCAL', 'DEVELOPMENT'
});

/**
 * Example 1: Search for sentences
 */
async function searchExample() {
  const result = await Nadeshiko.search({
    body: {
      query: '彼女',
      limit: 5,
    },
  });

  if (result.error) {
    console.error('Error:', result.error.code, result.error.detail);
    return;
  }

  console.log(`Found ${result.data.sentences?.length} sentences\n`);

  result.data.sentences?.forEach((sentence) => {
    console.log(`JP: ${sentence.segment_info.content_jp}`);
    console.log(`EN: ${sentence.segment_info.content_en}`);
    console.log(`From: ${sentence.basic_info.name_anime_en}\n`);
  });
}

/**
 * Example 2: Search multiple words
 */
async function searchMultipleExample() {
  const result = await Nadeshiko.searchMultiple({
    body: {
      words: ['彼女', '私'],
    },
  });

  if (result.error) {
    console.error('Error:', result.error);
    return;
  }

  result.data.results?.forEach((match) => {
    console.log(`${match.word}: ${match.total_matches} matches`);
  });
}

/**
 * Example 3: Fetch media info
 */
async function fetchMediaInfoExample() {
  const result = await Nadeshiko.fetchMediaInfo({
    query: {
      query: 'steins gate',
      type: 'anime',
    },
  });

  if (result.error) {
    console.error('Error:', result.error);
    return;
  }

  result.data.results?.forEach((media) => {
    console.log(`- ${media.english_name}`);
  });
}

// Run examples
async function main() {
  console.log('Nadeshiko SDK Examples\n');
  await searchExample();
  await searchMultipleExample();
  await fetchMediaInfoExample();
}

main();
