/**
 * NamespaceLoader — Load namespace configuration from repository.
 * 
 * Supports loading namespace config from:
 * 1. Repository's `.computable-lab/namespace.yaml`
 * 2. Repository configuration (fallback)
 * 
 * The namespace determines how @id values are derived.
 */

import { parse as parseYaml } from 'yaml';
import type { RepoAdapter } from '../repo/types.js';
import type { NamespaceConfig, RepositoryConfig, JsonLdConfig as AppJsonLdConfig } from '../config/types.js';
import type { JsonLdConfig } from './types.js';

/**
 * Repository namespace configuration file structure.
 * Located at `.computable-lab/namespace.yaml`
 */
export interface RepoNamespaceConfig {
  /** Base URI for @id derivation */
  baseUri: string;
  /** Prefix for display purposes */
  prefix: string;
  /** Optional vocabulary namespace */
  vocab?: string;
  /** Optional prefix mappings for JSON-LD context */
  prefixes?: Record<string, string>;
  /** Optional custom context URL */
  customContextUrl?: string;
}

/**
 * Default namespace config path.
 */
export const NAMESPACE_CONFIG_PATH = '.computable-lab/namespace.yaml';

/**
 * Default fallback namespace (for local development).
 */
export const DEFAULT_NAMESPACE: NamespaceConfig = {
  baseUri: 'http://localhost:3000/records/',
  prefix: 'local',
};

/**
 * Load namespace configuration from a repository.
 * 
 * Tries to load from `.computable-lab/namespace.yaml` first,
 * falls back to the provided repository config.
 * 
 * @param repoAdapter - The repository adapter
 * @param repoConfig - The repository configuration
 * @returns Resolved namespace configuration
 */
export async function loadNamespaceFromRepo(
  repoAdapter: RepoAdapter,
  repoConfig: RepositoryConfig
): Promise<RepoNamespaceConfig> {
  // Try to load from repository
  try {
    const file = await repoAdapter.getFile(NAMESPACE_CONFIG_PATH);
    
    if (file) {
      const parsed = parseYaml(file.content) as Partial<RepoNamespaceConfig>;
      
      if (parsed.baseUri && parsed.prefix) {
        const result: RepoNamespaceConfig = {
          baseUri: parsed.baseUri,
          prefix: parsed.prefix,
        };
        if (parsed.vocab) result.vocab = parsed.vocab;
        if (parsed.prefixes) result.prefixes = parsed.prefixes;
        if (parsed.customContextUrl) result.customContextUrl = parsed.customContextUrl;
        return result;
      }
    }
  } catch (err) {
    // Fall through to config-based namespace
    console.debug(`No namespace.yaml found in repo, using config: ${err}`);
  }
  
  // Fall back to repository configuration
  return {
    baseUri: repoConfig.namespace.baseUri,
    prefix: repoConfig.namespace.prefix,
  };
}

/**
 * Build JsonLdConfig from namespace and repository config.
 * 
 * This creates the configuration used by IdDeriver and JsonLdGenerator.
 * 
 * @param namespaceConfig - The namespace configuration
 * @param appJsonLdConfig - Optional app-level JSON-LD config
 * @returns JsonLdConfig for JSON-LD generation
 */
export function buildJsonLdConfig(
  namespaceConfig: RepoNamespaceConfig,
  _appJsonLdConfig?: AppJsonLdConfig
): JsonLdConfig {
  const config: JsonLdConfig = {
    namespace: namespaceConfig.baseUri,
    embedReferences: true,
    includeContext: true,
  };
  if (namespaceConfig.vocab) config.vocab = namespaceConfig.vocab;
  if (namespaceConfig.prefixes) config.prefixes = namespaceConfig.prefixes;
  return config;
}

/**
 * Derive @id from record identity using namespace config.
 * 
 * This is a convenience wrapper around IdDeriver.deriveId
 * that uses the repository's namespace configuration.
 * 
 * Pattern: {baseUri}{recordType}/{recordId}
 * Example: https://mylab.org/records/studies/STU-0001
 * 
 * @param recordId - The canonical record ID (e.g., "STU-0001")
 * @param schemaId - The schema ID (e.g., "studies/study")
 * @param namespace - The namespace configuration
 * @returns The derived @id URI
 */
export function deriveRecordId(
  recordId: string,
  schemaId: string,
  namespace: NamespaceConfig | RepoNamespaceConfig
): string {
  // Extract record type from schema ID
  // "studies/study" -> "studies"
  // "knowledge/assertion" -> "knowledge"
  const recordType = getRecordTypeFromSchemaId(schemaId);
  
  // Normalize baseUri (ensure trailing slash)
  const baseUri = namespace.baseUri.endsWith('/')
    ? namespace.baseUri
    : `${namespace.baseUri}/`;
  
  // Build @id: {baseUri}{recordType}/{recordId}
  return `${baseUri}${recordType}/${recordId}`;
}

/**
 * Extract record type from schema ID.
 * 
 * @param schemaId - The schema ID (e.g., "studies/study")
 * @returns The record type (e.g., "studies")
 */
export function getRecordTypeFromSchemaId(schemaId: string): string {
  // Split on first '/' and take the first part
  const slashIndex = schemaId.indexOf('/');
  if (slashIndex === -1) {
    return schemaId;
  }
  return schemaId.slice(0, slashIndex);
}

/**
 * Parse a derived @id back into components.
 * 
 * @param id - The @id URI
 * @param namespace - The namespace configuration
 * @returns Parsed components or null if doesn't match
 */
export function parseRecordId(
  id: string,
  namespace: NamespaceConfig | RepoNamespaceConfig
): { recordType: string; recordId: string } | null {
  // Normalize baseUri
  const baseUri = namespace.baseUri.endsWith('/')
    ? namespace.baseUri
    : `${namespace.baseUri}/`;
  
  // Check if id starts with baseUri
  if (!id.startsWith(baseUri)) {
    return null;
  }
  
  // Extract path after baseUri
  const path = id.slice(baseUri.length);
  
  // Split into recordType/recordId
  const slashIndex = path.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  
  const recordType = path.slice(0, slashIndex);
  const recordId = path.slice(slashIndex + 1);
  
  if (!recordType || !recordId) {
    return null;
  }
  
  return { recordType, recordId };
}

/**
 * Check if a value looks like a valid @id URI.
 * 
 * @param value - The value to check
 * @returns true if it looks like a URI
 */
export function isValidUri(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return /^https?:\/\//i.test(value);
}

/**
 * Convert a reference to an @id object.
 * 
 * If the reference is already a full URI, returns it as-is.
 * Otherwise, derives the @id from the reference and namespace.
 * 
 * @param ref - The reference (recordId or @id URI)
 * @param schemaId - The schema ID of the referenced record
 * @param namespace - The namespace configuration
 * @returns An object with @id property
 */
export function refToId(
  ref: string,
  schemaId: string,
  namespace: NamespaceConfig | RepoNamespaceConfig
): { '@id': string } {
  // If already a valid URI, use as-is
  if (isValidUri(ref)) {
    return { '@id': ref };
  }
  
  // Derive the @id
  return {
    '@id': deriveRecordId(ref, schemaId, namespace),
  };
}

/**
 * Namespace context for record operations.
 * 
 * This is passed to record operations that need namespace info.
 */
export interface NamespaceContext {
  /** The namespace configuration */
  namespace: NamespaceConfig | RepoNamespaceConfig;
  /** The JSON-LD configuration */
  jsonLdConfig: JsonLdConfig;
}

/**
 * Create a namespace context from repository configuration.
 * 
 * @param namespaceConfig - The namespace configuration
 * @returns NamespaceContext for record operations
 */
export function createNamespaceContext(
  namespaceConfig: RepoNamespaceConfig
): NamespaceContext {
  return {
    namespace: namespaceConfig,
    jsonLdConfig: buildJsonLdConfig(namespaceConfig),
  };
}
