#!/usr/bin/env bun
/**
 * Post-generation script for Nadeshiko SDK
 *
 * This script runs after openapi-ts to:
 * 1. Generate the client factory (createNadeshikoClient)
 * 2. Separate public and internal endpoints
 * 3. Create internal namespace exports organized by tag group
 */

import { readFileSync, writeFileSync, rmSync } from 'fs';
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
  method: string;
  isInternal: boolean;
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
  return tag.toLowerCase();
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
  const publicEndpoints: EndpointInfo[] = [];
  const internalEndpoints: EndpointInfo[] = [];
  const internalByGroup: Record<string, string[]> = {};

  for (const [path, pathItem] of Object.entries(spec.paths)) {
    for (const [method, operation] of Object.entries(pathItem as any)) {
      if (method === 'parameters' || method === '$ref') continue;
      if (!operation || !operation.operationId) continue;

      const tags = (operation as any).tags || ['Search'];
      const tag = tags[0] || 'Search';
      const isInternal = Boolean((operation as any)['x-internal']);
      const groupName = getGroupName(tag);

      const endpointInfo: EndpointInfo = {
        operationId: (operation as any).operationId,
        tag,
        method,
        isInternal,
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
function generateClientFactory(publicEndpoints: EndpointInfo[]): string {
  const publicOperationIds = publicEndpoints.map(e => e.operationId);
  const sdkImports = publicOperationIds.join(', ');

  // Build the return type with all public SDK methods
  const returnTypeParts = publicOperationIds.map(fn => {
    return `    ${fn}: typeof ${fn};`;
  });

  const returnType = `export type NadeshikoClient = {
    client: Client;
${returnTypeParts.join('\n')}
  };`;

  // Build the bound functions return
  const boundFunctions = publicOperationIds.map(fn => {
    return `    ${fn}: (options?: any) => ${fn}({ ...options, client: clientInstance }),`;
  }).join('\n');

  return `// This file is auto-generated by scripts/generate.ts

import { createClient as createApiClient, createConfig, type Client } from './client';
import type { Auth } from './core/auth.gen';
import type { ClientOptions } from './types.gen';
import { ${sdkImports} } from './sdk.gen';

export interface NadeshikoConfig {
  /**
   * API key for Bearer token authentication.
   * Used for server-side access and endpoints requiring API key scope.
   */
  apiKey?: string;
  /**
   * A function that returns the session token for cookie-based authentication.
   * Used for user-specific endpoints (e.g. /v1/user/*).
   * Defaults to reading the \`nadeshiko.session_token\` cookie from \`document.cookie\`.
   */
  sessionToken?: () => string | undefined | Promise<string | undefined>;
  baseUrl?: 'LOCAL' | 'DEVELOPMENT' | 'PRODUCTION' | string;
}

const environments = {
  LOCAL: 'http://localhost:5000/api',
  DEVELOPMENT: 'https://api.dev.brigadasos.xyz/api',
  PRODUCTION: 'https://api.brigadasos.xyz/api',
} as const;

${returnType}

const defaultSessionTokenGetter = (): string | undefined => {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\\s*)nadeshiko\\.session_token=([^;]*)/);
  return match ? decodeURIComponent(match[1]) : undefined;
};

export function createNadeshikoClient(config: NadeshikoConfig): NadeshikoClient {
  const baseUrl = config.baseUrl
    ? (config.baseUrl in environments
        ? environments[config.baseUrl as keyof typeof environments]
        : config.baseUrl)
    : environments.PRODUCTION;

  const getSessionToken = config.sessionToken ?? defaultSessionTokenGetter;

  const clientInstance = createApiClient(createConfig<ClientOptions>({
    baseUrl,
    auth: (auth: Auth) => {
      if (auth.in === 'cookie') {
        return getSessionToken();
      }
      return config.apiKey;
    },
  }));

  return {
    client: clientInstance,
${boundFunctions}
  };
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
 * NOTE: This is a public SDK for frontend use - internal endpoints are NOT exposed
 */
function generatePublicIndex(publicEndpoints: EndpointInfo[], availableTypeNames: Set<string>): string {
  const publicOperationIds = publicEndpoints.map(e => e.operationId);
  const exports = publicOperationIds.join(', ');
  const typeExports = getOperationTypeExports(publicOperationIds, availableTypeNames)
    .map(name => `  ${name}`)
    .join(',\n');

  return `// This file is auto-generated by scripts/generate.ts
// Public SDK for frontend use - internal endpoints are NOT included

export { ${exports}, type Options } from './sdk.gen';
export type {
${typeExports}
} from './types.gen';

// Re-export client factory
export { createClient, type NadeshikoClient, type NadeshikoConfig } from './nadeshiko.gen';

// Re-export singleton client
export { client } from './client.gen';

export type { Client, Config } from './client';
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
export { createClient, type NadeshikoClient, type NadeshikoConfig } from './nadeshiko.gen';

// Re-export singleton client
export { client } from './client.gen';

${internalGroupExports}// Re-export all generated types
export * from './types.gen';
export type { Client, Config } from './client';
`;
}

// Main execution
async function main() {
  try {
    if (SDK_TYPE !== 'public' && SDK_TYPE !== 'internal' && SDK_TYPE !== 'dev') {
      throw new Error(`Invalid SDK_TYPE "${SDK_TYPE}". Expected "public", "internal", or "dev".`);
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

    // Parse the spec to get endpoint categorization
    console.log('Parsing OpenAPI spec...');
    const { public: publicEndpoints, internal: internalEndpoints, internalByGroup } = await parseOpenApiSpec();

    console.log(`Found ${publicEndpoints.length} public endpoints, ${internalEndpoints.length} internal endpoints`);
    console.log(`SDK type: ${SDK_TYPE}`);
    const availableTypeNames = getAvailableGeneratedTypeNames();

    if (SDK_TYPE === 'internal' || SDK_TYPE === 'dev') {
      console.log(`Internal groups: ${Object.keys(internalByGroup).join(', ')}`);

      // For internal SDK, include both public and internal endpoints
      const allEndpoints = [...publicEndpoints, ...internalEndpoints];
      const clientFactoryContent = generateClientFactory(allEndpoints);
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
      // For public SDK, only include public endpoints
      console.log(`Skipping ${internalEndpoints.length} internal endpoints (public SDK build)`);

      const clientFactoryContent = generateClientFactory(publicEndpoints);
      writeFileSync(join(GENERATED_DIR, 'nadeshiko.gen.ts'), clientFactoryContent);
      console.log(`✓ Generated nadeshiko.gen.ts with ${publicEndpoints.length} public endpoints`);

      // Generate public package index
      const publicIndexContent = generatePublicIndex(publicEndpoints, availableTypeNames);
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
