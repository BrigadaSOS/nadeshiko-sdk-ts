import {
  search as searchImpl,
  searchMultiple as searchMultipleImpl,
  searchHealthCheck as searchHealthCheckImpl,
  fetchSentenceContext as fetchSentenceContextImpl,
  fetchMediaInfo as fetchMediaInfoImpl,
} from './generated';

import { client } from './generated/client.gen';

import type {
  SearchData,
  SearchMultipleData,
  SearchHealthCheckData,
  FetchSentenceContextData,
  FetchMediaInfoData,
} from './generated/types.gen';

import type { Options } from './generated/sdk.gen';

/**
 * Nadeshiko SDK
 *
 * @example
 * ```typescript
 * import Nadeshiko from 'nadeshiko-sdk-ts';
 *
 * Nadeshiko.configure({
 *   apiKey: 'your-api-key',
 *   baseUrl: 'PRODUCTION',
 * });
 *
 * const result = await Nadeshiko.search({
 *   body: { query: '彼女', limit: 10 }
 * });
 * ```
 */
const Nadeshiko = {
  configure(config: {
    apiKey: string;
    baseUrl?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
  }): void {
    const environments = {
      LOCAL: 'http://localhost:5000/api',
      DEVELOPMENT: 'https://api.dev.brigadasos.xyz/api',
      PRODUCTION: 'https://api.brigadasos.xyz/api',
    } as const;

    const baseUrl = config.baseUrl
      ? (config.baseUrl in environments
          ? environments[config.baseUrl as keyof typeof environments]
          : config.baseUrl)
      : environments.PRODUCTION;

    client.setConfig({
      baseUrl,
      headers: {
        'X-API-Key': config.apiKey,
      },
    });
  },

  search: <ThrowOnError extends boolean = false>(
    options?: Options<SearchData, ThrowOnError>
  ) => searchImpl<ThrowOnError>(options),

  searchMultiple: <ThrowOnError extends boolean = false>(
    options: Options<SearchMultipleData, ThrowOnError>
  ) => searchMultipleImpl<ThrowOnError>(options),

  searchHealthCheck: <ThrowOnError extends boolean = false>(
    options?: Options<SearchHealthCheckData, ThrowOnError>
  ) => searchHealthCheckImpl<ThrowOnError>(options),

  fetchSentenceContext: <ThrowOnError extends boolean = false>(
    options: Options<FetchSentenceContextData, ThrowOnError>
  ) => fetchSentenceContextImpl<ThrowOnError>(options),

  fetchMediaInfo: <ThrowOnError extends boolean = false>(
    options?: Options<FetchMediaInfoData, ThrowOnError>
  ) => fetchMediaInfoImpl<ThrowOnError>(options),

  client,
} as const;

export default Nadeshiko;
