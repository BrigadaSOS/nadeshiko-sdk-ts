#!/usr/bin/env bun
/**
 * Post-generation script for Nadeshiko SDK
 *
 * This script runs after openapi-ts to:
 * 1. Generate the client factory (createNadeshikoClient)
 * 2. Separate public and internal endpoints
 * 3. Create internal namespace exports organized by tag group
 */

import { copyFileSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { parse } from 'yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SDK_TYPE = process.env.SDK_TYPE || 'public';
const ROOT_DIR = join(__dirname, '..');
const GENERATED_DIR = join(ROOT_DIR, 'generated', SDK_TYPE);

const OPENAPI_SPEC_SOURCE = process.env.OPENAPI_SPEC_PATH;
if (!OPENAPI_SPEC_SOURCE) {
  console.error('OPENAPI_SPEC_PATH is required. Set it in .env or pass as env var.');
  process.exit(1);
}

type EndpointInfo = {
  operationId: string;
  tag: string;
  path: string;
  method: string;
  isInternal: boolean;
  auth: EndpointAuthInfo;
};

type OpenApiSecurityScheme = {
  type?: string;
  in?: string;
  scheme?: string;
};

type OpenApiSecurityRequirement = Record<string, unknown>;

type EndpointAuthInfo = {
  allowsApiKey: boolean;
  allowsSession: boolean;
  allowsUnauthenticated: boolean;
};

/**
 * Convert operationId to generated type prefix.
 * Example: search => Search, getQueueStats => GetQueueStats
 */
function operationTypePrefix(operationId: string): string {
  return `${operationId.charAt(0).toUpperCase()}${operationId.slice(1)}`;
}

/**
 * Build operation type exports for public/internal index files.
 */
function getAvailableGeneratedTypeNames(): Set<string> {
  const typesFilePath = join(GENERATED_DIR, 'types.gen.ts');
  const source = readFileSync(typesFilePath, 'utf-8');
  const names = new Set<string>();

  for (const match of source.matchAll(/export\s+type\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(/export\s+interface\s+([A-Za-z0-9_]+)/g)) {
    names.add(match[1]);
  }

  return names;
}

function getOperationTypeExports(operationIds: string[], availableTypeNames: Set<string>): string[] {
  const suffixes = ['Data', 'Errors', 'Error', 'Responses', 'Response'] as const;
  return operationIds.flatMap(operationId => {
    const prefix = operationTypePrefix(operationId);
    return suffixes
      .map(suffix => `${prefix}${suffix}`)
      .filter(typeName => availableTypeNames.has(typeName));
  });
}

/**
 * Get the group name for a tag (used for internal namespace organization)
 */
function getGroupName(tag: string): string {
  const normalized = tag
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  return normalized || 'default';
}

function normalizeSecurity(value: unknown): OpenApiSecurityRequirement[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((entry) => entry && typeof entry === 'object') as OpenApiSecurityRequirement[];
}

function getAuthSchemeKind(
  schemeName: string,
  securitySchemes: Record<string, OpenApiSecurityScheme>,
): 'apiKey' | 'session' | 'unknown' {
  const scheme = securitySchemes[schemeName];
  if (!scheme) {
    return 'unknown';
  }

  if (scheme.type === 'apiKey') {
    return scheme.in === 'cookie' ? 'session' : 'apiKey';
  }

  if (scheme.type === 'http') {
    const httpScheme = (scheme.scheme || '').toLowerCase();
    if (httpScheme === 'bearer') {
      return 'apiKey';
    }
  }

  return 'unknown';
}

function resolveEndpointAuthInfo(
  security: OpenApiSecurityRequirement[] | undefined,
  securitySchemes: Record<string, OpenApiSecurityScheme>,
): EndpointAuthInfo {
  if (!security || security.length === 0) {
    return {
      allowsApiKey: false,
      allowsSession: false,
      allowsUnauthenticated: true,
    };
  }

  let allowsApiKey = false;
  let allowsSession = false;
  let allowsUnauthenticated = false;

  for (const requirement of security) {
    const schemeNames = Object.keys(requirement);
    if (schemeNames.length === 0) {
      allowsUnauthenticated = true;
      continue;
    }

    for (const schemeName of schemeNames) {
      const schemeKind = getAuthSchemeKind(schemeName, securitySchemes);
      if (schemeKind === 'apiKey') {
        allowsApiKey = true;
      } else if (schemeKind === 'session') {
        allowsSession = true;
      }
    }
  }

  return {
    allowsApiKey,
    allowsSession,
    allowsUnauthenticated,
  };
}

/**
 * Get absolute path for the OpenAPI spec
 */
function getOpenApiSpecPath(): string {
  if (OPENAPI_SPEC_SOURCE.startsWith('http://') || OPENAPI_SPEC_SOURCE.startsWith('https://')) {
    return OPENAPI_SPEC_SOURCE;
  }
  // Convert to absolute path
  return OPENAPI_SPEC_SOURCE.startsWith('/')
    ? OPENAPI_SPEC_SOURCE
    : join(ROOT_DIR, OPENAPI_SPEC_SOURCE);
}

/**
 * Load OpenAPI spec from either a URL or local file path
 */
async function loadOpenApiSpec(): Promise<any> {
  const specPath = getOpenApiSpecPath();
  if (specPath.startsWith('http://') || specPath.startsWith('https://')) {
    // Fetch from URL
    console.log(`Fetching OpenAPI spec from: ${specPath}`);
    const response = await fetch(specPath);
    if (!response.ok) {
      throw new Error(`Failed to fetch OpenAPI spec: ${response.statusText}`);
    }
    const text = await response.text();
    return parse(text);
  } else {
    // Read from local file path
    console.log(`Reading OpenAPI spec from: ${specPath}`);
    return parse(readFileSync(specPath, 'utf-8'));
  }
}

/**
 * Parse the OpenAPI spec and categorize endpoints
 */
async function parseOpenApiSpec(): Promise<{
  public: EndpointInfo[];
  internal: EndpointInfo[];
  internalByGroup: Record<string, string[]>;
}> {
  const spec = await loadOpenApiSpec();
  const securitySchemes = (spec.components?.securitySchemes || {}) as Record<string, OpenApiSecurityScheme>;
  const globalSecurity = normalizeSecurity(spec.security);
  const publicEndpoints: EndpointInfo[] = [];
  const internalEndpoints: EndpointInfo[] = [];
  const internalByGroup: Record<string, string[]> = {};

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem as any)) {
      if (method === 'parameters' || method === '$ref') continue;
      const operationObj = operation as Record<string, any>;
      if (!operationObj || !operationObj.operationId) continue;

      const pathItemObj = pathItem as any;
      const tags = Array.isArray(operationObj.tags) && operationObj.tags.length > 0
        ? operationObj.tags.filter((value: unknown): value is string => typeof value === 'string' && value.length > 0)
        : ['Search'];
      const tag = tags[0] || 'Search';
      const isInternal = Boolean(operationObj['x-internal']);
      const security = normalizeSecurity(operationObj.security)
        ?? normalizeSecurity(pathItemObj.security)
        ?? globalSecurity;
      const groupName = getGroupName(tag);

      const endpointInfo: EndpointInfo = {
        operationId: operationObj.operationId,
        tag,
        path,
        method,
        isInternal,
        auth: resolveEndpointAuthInfo(security, securitySchemes),
      };

      if (isInternal) {
        internalEndpoints.push(endpointInfo);
        if (!internalByGroup[groupName]) {
          internalByGroup[groupName] = [];
        }
        internalByGroup[groupName].push(endpointInfo.operationId);
      } else {
        publicEndpoints.push(endpointInfo);
      }
    }
  }

  return { public: publicEndpoints, internal: internalEndpoints, internalByGroup };
}

/**
 * Generate the client factory file
 */
function generateClientFactory(endpoints: EndpointInfo[], authMode: 'apiKeyOnly' | 'hybrid', availableTypeNames: Set<string>): string {
  const operationIds = endpoints.map(e => e.operationId);
  const sdkImports = operationIds.join(', ');

  // Build the return type with overloaded call signatures per method:
  //   • throwOnError: false  → union return (caller must check data vs error)
  //   • default / true       → clean Promise<{ data }> (throws on error)
  const returnTypeParts = operationIds.map(fn => {
    const prefix = operationTypePrefix(fn);
    const hasData = availableTypeNames.has(`${prefix}Data`);
    const hasResponse = availableTypeNames.has(`${prefix}Response`);
    if (hasData && hasResponse) {
      const errorType = availableTypeNames.has(`${prefix}Errors`)
        ? `Types.${prefix}Errors`
        : 'unknown';
      const success = `{ data: Types.${prefix}Response; response: Response; request: Request }`;
      return `    ${fn}: {
      (options: Options<Types.${prefix}Data, boolean> & { throwOnError: false }): Promise<${success} | { error: ${errorType}; response: Response; request: Request }>;
      (options?: Options<Types.${prefix}Data, boolean>): Promise<${success}>;
    };`;
    }
    return `    ${fn}: typeof ${fn};`;
  });

  const returnType = `export type NadeshikoClient = {
    client: Client;
${returnTypeParts.join('\n')}
  };`;

  // Build the bound functions return
  const boundFunctions = operationIds.map(fn => {
    return `    ${fn}: (options?: any) => ${fn}({ throwOnError: true, ...options, client: clientInstance }),`;
  }).join('\n');

  const authImports = authMode === 'hybrid'
    ? `import type { Auth } from './core/auth.gen';\n`
    : '';
  const authTypeHelpers = `type ApiKeyProvider = string | (() => string | undefined | Promise<string | undefined>);`;
  const authConfig = authMode === 'hybrid'
    ? `export interface NadeshikoConfig {
  /**
   * API key for Bearer token authentication.
   * Used for API key protected endpoints.
   */
  apiKey?: ApiKeyProvider;
  /**
   * A function that returns the session token for cookie-based authentication.
   * Used for session-protected endpoints (e.g. /v1/user/* and /v1/collections/*).
   * Defaults to reading the \`nadeshiko.session_token\` cookie from \`document.cookie\`.
   */
  sessionToken?: () => string | undefined | Promise<string | undefined>;
  /** Base URL of the Nadeshiko API. Accepts \`'LOCAL'\`, \`'DEVELOPMENT'\`, \`'PRODUCTION'\`, or a custom URL string. */
  baseURL?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
  /** @deprecated Use \`baseURL\` instead */
  baseUrl?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
  /** Retry configuration for failed requests. Retries on network errors and 408/429/5xx responses. */
  retryOptions?: RetryOptions;
}`
    : `export interface NadeshikoConfig {
  /**
   * API key for Bearer token authentication.
   * Public SDK only supports API key authentication.
   */
  apiKey?: ApiKeyProvider;
  /** Base URL of the Nadeshiko API. Accepts \`'LOCAL'\`, \`'DEVELOPMENT'\`, \`'PRODUCTION'\`, or a custom URL string. */
  baseURL?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
  /** @deprecated Use \`baseURL\` instead */
  baseUrl?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
  /** Retry configuration for failed requests. Retries on network errors and 408/429/5xx responses. */
  retryOptions?: RetryOptions;
}`;
  const sessionTokenHelper = authMode === 'hybrid'
    ? `const defaultSessionTokenGetter = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\\s*)nadeshiko\\.session_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
};
`
    : '';
  const authResolverConfig = authMode === 'hybrid'
    ? `  const getSessionToken = config.sessionToken ?? defaultSessionTokenGetter;
`
    : '';
  const authResolverFn = authMode === 'hybrid'
    ? `    auth: (auth: Auth) => {
      if (auth.in === 'cookie') {
        return getSessionToken();
      }
      return getApiKey();
    },`
    : `    auth: () => getApiKey(),`;

  return `// This file is auto-generated by scripts/generate.ts

import { createClient as createApiClient, createConfig, type Client } from './client';
${authImports}import type { ClientOptions } from './types.gen';
import type * as Types from './types.gen';
import { ${sdkImports}, type Options } from './sdk.gen';
import { withRetry, type RetryOptions } from './retry';
import { NadeshikoError, type NadeshikoProblemDetails } from './errors';

${authTypeHelpers}

${authConfig}

const environments = {
  LOCAL: 'http://localhost:5000/api',
  DEVELOPMENT: 'https://api-dev.nadeshiko.co',
  PRODUCTION: 'https://api.nadeshiko.co',
  PROXY: '',
} as const;

${returnType}

${sessionTokenHelper}

export function createNadeshikoClient(config: NadeshikoConfig): NadeshikoClient {
  const rawBaseUrl = config.baseURL ?? config.baseUrl;
  const baseUrl = rawBaseUrl === undefined
    ? environments.PRODUCTION
    : (rawBaseUrl in environments
        ? environments[rawBaseUrl as keyof typeof environments]
        : rawBaseUrl);

  const getApiKey = async (): Promise<string | undefined> => {
    if (typeof config.apiKey === 'function') {
      return await config.apiKey();
    }
    return config.apiKey;
  };

${authResolverConfig}
  const clientInstance = createApiClient(createConfig<ClientOptions>({
    baseUrl,
    fetch: withRetry(globalThis.fetch, config.retryOptions) as typeof fetch,
${authResolverFn}
  }));

  clientInstance.interceptors.error.use((error) => {
    if (error && typeof error === 'object' && 'code' in error && typeof (error as any).code === 'string') {
      return new NadeshikoError(error as NadeshikoProblemDetails);
    }
    return error;
  });

  return {
    client: clientInstance,
${boundFunctions}
  } as NadeshikoClient;
}

`;
}

/**
 * Generate errors.ts with a NadeshikoErrorCode union derived from the generated error types.
 */
function generateErrorsFile(availableTypeNames: Set<string>): string {
  const present = [...availableTypeNames].filter(name => /^Error\d+$/.test(name));

  const imports = present.length > 0
    ? `import type { ${present.join(', ')} } from './types.gen';\n\n`
    : '';
  const codeUnion = present.length > 0
    ? present.map(t => `${t}['code']`).join(' | ')
    : 'string';

  return `// This file is auto-generated by scripts/generate.ts
${imports}/** Union of all known API error codes. */
export type NadeshikoErrorCode = ${codeUnion};

export interface NadeshikoProblemDetails {
  code: NadeshikoErrorCode;
  title: string;
  detail: string;
  type?: string;
  /** Trace ID for this specific error occurrence — include when reporting issues */
  instance?: string;
  status: number;
  /** Per-field validation messages, present when \`code\` is \`'VALIDATION_FAILED'\` */
  errors?: Record<string, string>;
}

/**
 * Thrown by the SDK when the API returns a non-2xx response.
 *
 * All fields from the RFC 7807 Problem Details response body are
 * available directly on the error instance.
 *
 * @example
 * \`\`\`ts
 * import { NadeshikoError } from '@brigadasos/nadeshiko-sdk';
 *
 * try {
 *   const { data } = await client.search({ body: { query: { search: '猫' } } });
 * } catch (err) {
 *   if (err instanceof NadeshikoError) {
 *     console.error(err.code);    // 'RATE_LIMIT_EXCEEDED'
 *     console.error(err.status);  // 429
 *     console.error(err.traceId); // trace ID for support
 *   }
 * }
 * \`\`\`
 */
export class NadeshikoError extends Error {
  readonly code: NadeshikoErrorCode;
  readonly title: string;
  readonly detail: string;
  readonly type?: string;
  readonly status: number;
  /** Trace ID from \`instance\` field — include when reporting issues */
  readonly traceId?: string;
  /** Per-field validation messages, present when \`code === 'VALIDATION_FAILED'\` */
  readonly errors?: Record<string, string>;

  constructor(body: NadeshikoProblemDetails) {
    super(body.detail || body.title || \`API error \${body.status}\`);
    this.name = 'NadeshikoError';
    this.code = body.code;
    this.title = body.title;
    this.detail = body.detail;
    this.type = body.type;
    this.status = body.status;
    this.traceId = body.instance;
    this.errors = body.errors;
  }
}
`;
}

/**
 * Generate internal namespace file with grouped exports
 */
function generateInternalNamespace(internalByGroup: Record<string, string[]>): string {
  // Create internal namespaces with direct imports.
  const directExports = Object.entries(internalByGroup)
    .map(([groupName]) => {
      return `export * as ${groupName} from './internal/${groupName}.gen';`;
    })
    .join('\n');

  return `// This file is auto-generated by scripts/generate.ts
// Internal endpoints - organized by tag group (like Python SDK's internal modules)

${directExports}
`;
}

/**
 * Generate group-specific internal files
 */
function generateInternalGroupFiles(internalByGroup: Record<string, string[]>): Array<{ name: string; content: string }> {
  return Object.entries(internalByGroup).map(([groupName, endpoints]) => {
    const exports = endpoints.join(', ');
    return {
      name: `internal/${groupName}.gen.ts`,
      content: `// This file is auto-generated by scripts/generate.ts
// Internal endpoints for ${groupName.toUpperCase()} - for application use only

export { ${exports} } from '../sdk.gen';
`,
    };
  });
}

/**
 * Generate the public index file
 * NOTE: Public SDK exposes only API key-capable operations.
 */
function generatePublicIndex(publicEndpoints: EndpointInfo[], availableTypeNames: Set<string>): string {
  const publicOperationIds = publicEndpoints.map(e => e.operationId);
  const exports = publicOperationIds.join(', ');
  const typeExports = getOperationTypeExports(publicOperationIds, availableTypeNames)
    .map(name => `  ${name}`)
    .join(',\n');

  // Common entity types useful to consumers (filter to what exists in this build)
  const entityTypes = [
    'Segment', 'Media', 'Episode', 'Series', 'Character', 'Seiyuu',
    'PaginationInfo', 'OpaqueCursorPagination',
  ].filter(t => availableTypeNames.has(t));
  const entityExports = entityTypes.map(t => `  ${t}`).join(',\n');

  return `// This file is auto-generated by scripts/generate.ts
// Public SDK exposes only API key-authenticated endpoints

export { ${exports}, type Options } from './sdk.gen';
export type {
${typeExports}
} from './types.gen';

// Common entity types
export type {
${entityExports}
} from './types.gen';

// Re-export client factory
export { createNadeshikoClient, type NadeshikoClient, type NadeshikoConfig } from './nadeshiko.gen';

// Re-export singleton client
export { client } from './client.gen';

export type { Client, Config } from './client';

// Re-export helpers
export { paginate, type PaginationMeta } from './paginate';
export { withRetry, type RetryOptions } from './retry';
export { NadeshikoError, type NadeshikoErrorCode, type NadeshikoProblemDetails } from './errors';
`;
}

/**
 * Generate the internal index file.
 * NOTE: Internal SDK exposes all endpoint operations and all generated types.
 */
function generateInternalIndex(allEndpoints: EndpointInfo[], hasInternalGroups: boolean): string {
  const operationIds = allEndpoints.map(e => e.operationId);
  const exports = operationIds.join(', ');
  const internalGroupExports = hasInternalGroups
    ? `// Re-export grouped internal namespaces
export * from './internal.gen';

`
    : '';

  return `// This file is auto-generated by scripts/generate.ts
// Internal SDK for backend services - includes public + internal endpoints

export { ${exports}, type Options } from './sdk.gen';

// Re-export client factory
export { createNadeshikoClient, type NadeshikoClient, type NadeshikoConfig } from './nadeshiko.gen';

// Re-export singleton client
export { client } from './client.gen';

${internalGroupExports}// Re-export all generated types
export * from './types.gen';
export type { Client, Config } from './client';

// Re-export helpers
export { paginate, type PaginationMeta } from './paginate';
export { withRetry, type RetryOptions } from './retry';
export { NadeshikoError, type NadeshikoErrorCode, type NadeshikoProblemDetails } from './errors';
`;
}

// Main execution
async function main() {
  try {
    if (SDK_TYPE !== 'public' && SDK_TYPE !== 'internal') {
      throw new Error(`Invalid SDK_TYPE "${SDK_TYPE}". Expected "public" or "internal".`);
    }

    // First run openapi-ts to generate all endpoints
    console.log(`Running openapi-ts for ${SDK_TYPE} SDK...`);
    rmSync(GENERATED_DIR, { recursive: true, force: true });
    const { spawn } = await import('child_process');
    const specPath = getOpenApiSpecPath();
    await new Promise<void>((resolve, reject) => {
      // Use CLI arguments to pass the input source and output directory
      const proc = spawn('bunx', ['openapi-ts', '-i', specPath, '-o', GENERATED_DIR], { stdio: 'inherit' });
      proc.on('close', (code) => code === 0 ? resolve() : reject(new Error(`openapi-ts exited with code ${code}`)));
    });

    // Copy hand-written helpers into the generated directory
    copyFileSync(join(ROOT_DIR, 'src', 'retry.ts'), join(GENERATED_DIR, 'retry.ts'));
    copyFileSync(join(ROOT_DIR, 'src', 'paginate.ts'), join(GENERATED_DIR, 'paginate.ts'));
    console.log('✓ Copied src/retry.ts and src/paginate.ts into generated dir');

    // Parse the spec to get endpoint categorization
    console.log('Parsing OpenAPI spec...');
    const { public: publicEndpoints, internal: internalEndpoints, internalByGroup } = await parseOpenApiSpec();
    const apiKeyPublicEndpoints = publicEndpoints.filter((endpoint) => endpoint.auth.allowsApiKey);
    const sessionPublicEndpoints = publicEndpoints.filter((endpoint) => endpoint.auth.allowsSession);

    console.log(`Found ${publicEndpoints.length} public endpoints, ${internalEndpoints.length} internal endpoints`);
    console.log(
      `Public auth split: ${apiKeyPublicEndpoints.length} API key-capable, ${sessionPublicEndpoints.length} session-capable`,
    );
    console.log(`SDK type: ${SDK_TYPE}`);
    const availableTypeNames = getAvailableGeneratedTypeNames();

    // Generate errors.ts with a typed NadeshikoErrorCode union
    const errorsContent = generateErrorsFile(availableTypeNames);
    writeFileSync(join(GENERATED_DIR, 'errors.ts'), errorsContent);
    console.log('✓ Generated errors.ts with NadeshikoErrorCode union');

    if (SDK_TYPE === 'internal') {
      console.log(`Internal groups: ${Object.keys(internalByGroup).join(', ')}`);

      // For internal SDK, include both public and internal endpoints
      const allEndpoints = [...publicEndpoints, ...internalEndpoints];
      const clientFactoryContent = generateClientFactory(allEndpoints, 'hybrid', availableTypeNames);
      writeFileSync(join(GENERATED_DIR, 'nadeshiko.gen.ts'), clientFactoryContent);
      console.log(`✓ Generated nadeshiko.gen.ts with ${allEndpoints.length} total endpoints`);

      // Generate internal group files
      if (Object.keys(internalByGroup).length > 0) {
        const groupFiles = generateInternalGroupFiles(internalByGroup);
        const internalDir = join(GENERATED_DIR, 'internal');
        await import('fs').then(fs => fs.promises.mkdir(internalDir, { recursive: true }));
        for (const file of groupFiles) {
          const groupName = file.name.split('/')[1].replace('.gen.ts', '');
          writeFileSync(join(GENERATED_DIR, file.name), file.content);
          console.log(`✓ Generated ${file.name} with ${internalByGroup[groupName].length} endpoints`);
        }

        // Generate internal namespace index
        const internalNamespaceContent = generateInternalNamespace(internalByGroup);
        writeFileSync(join(GENERATED_DIR, 'internal.gen.ts'), internalNamespaceContent);
        console.log(`✓ Generated internal.gen.ts`);
      }

      // Generate internal package index
      const internalIndexContent = generateInternalIndex(allEndpoints, Object.keys(internalByGroup).length > 0);
      writeFileSync(join(GENERATED_DIR, 'index.ts'), internalIndexContent);
      console.log(`✓ Generated index.ts (internal)`);
    } else {
      // For public SDK, only include public endpoints that support API key auth
      console.log(`Skipping ${internalEndpoints.length} internal endpoints (public SDK build)`);
      console.log(
        `Skipping ${publicEndpoints.length - apiKeyPublicEndpoints.length} public endpoints without API key auth`,
      );

      const clientFactoryContent = generateClientFactory(apiKeyPublicEndpoints, 'apiKeyOnly', availableTypeNames);
      writeFileSync(join(GENERATED_DIR, 'nadeshiko.gen.ts'), clientFactoryContent);
      console.log(`✓ Generated nadeshiko.gen.ts with ${apiKeyPublicEndpoints.length} public API key endpoints`);

      // Generate public package index
      const publicIndexContent = generatePublicIndex(apiKeyPublicEndpoints, availableTypeNames);
      writeFileSync(join(GENERATED_DIR, 'index.ts'), publicIndexContent);
      console.log(`✓ Generated index.ts (public)`);
    }

    console.log('Done!');
  } catch (error) {
    console.error('Error in generation script:', error);
    process.exit(1);
  }
}

main();
