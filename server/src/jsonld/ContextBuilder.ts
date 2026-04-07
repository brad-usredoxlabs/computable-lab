/**
 * ContextBuilder — Build @context from schema metadata.
 * 
 * The @context provides vocabulary mappings that enable JSON-LD
 * documents to be interpreted as linked data.
 */

import type { JsonLdContext, JsonLdConfig, ContextTerm } from './types.js';

/**
 * Default prefixes for common vocabularies.
 */
export const DEFAULT_PREFIXES: Record<string, string> = {
  schema: 'https://schema.org/',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  dc: 'http://purl.org/dc/elements/1.1/',
  dcterms: 'http://purl.org/dc/terms/',
  foaf: 'http://xmlns.com/foaf/0.1/',
  owl: 'http://www.w3.org/2002/07/owl#',
};

/**
 * Well-known type mappings for common property patterns.
 */
const TYPE_MAPPINGS: Record<string, string> = {
  // Date/time types
  createdAt: 'xsd:dateTime',
  updatedAt: 'xsd:dateTime',
  timestamp: 'xsd:dateTime',
  date: 'xsd:date',
  
  // Numeric types
  amount: 'xsd:decimal',
  quantity: 'xsd:decimal',
  count: 'xsd:integer',
  
  // Reference types
  url: '@id',
  uri: '@id',
};

/**
 * Build a @context object from configuration.
 * 
 * @param config - JSON-LD configuration
 * @returns The built context
 */
export function buildContext(config: JsonLdConfig): JsonLdContext {
  const context: JsonLdContext = {};
  
  // Add @vocab if provided
  if (config.vocab) {
    context['@vocab'] = config.vocab;
  }
  
  // Add default prefixes
  for (const [prefix, uri] of Object.entries(DEFAULT_PREFIXES)) {
    context[prefix] = uri;
  }
  
  // Add custom prefixes (override defaults if specified)
  if (config.prefixes) {
    for (const [prefix, uri] of Object.entries(config.prefixes)) {
      context[prefix] = uri;
    }
  }
  
  // Add the namespace as a prefix
  if (config.namespace) {
    context['clab'] = config.namespace.endsWith('/')
      ? config.namespace
      : `${config.namespace}/`;
  }
  
  return context;
}

/**
 * Build a @context from schema definition.
 * 
 * @param schema - JSON Schema object
 * @param config - JSON-LD configuration
 * @returns The built context
 */
export function buildContextFromSchema(
  schema: { $id?: string; title?: string; properties?: Record<string, unknown> },
  config: JsonLdConfig
): JsonLdContext {
  const context = buildContext(config);
  
  // Extract schema namespace from $id
  if (schema.$id) {
    const schemaBase = extractSchemaBase(schema.$id);
    if (schemaBase) {
      context['@base'] = schemaBase;
    }
  }
  
  // Add property type coercions based on schema
  if (schema.properties) {
    for (const [propName, propDef] of Object.entries(schema.properties)) {
      const term = buildTermForProperty(propName, propDef, config);
      if (term) {
        context[propName] = term;
      }
    }
  }
  
  return context;
}

/**
 * Extract the base namespace from a schema $id.
 * 
 * @param schemaId - The schema $id
 * @returns The base namespace or undefined
 */
function extractSchemaBase(schemaId: string): string | undefined {
  try {
    const url = new URL(schemaId);
    // Return up to the last slash
    const lastSlash = url.pathname.lastIndexOf('/');
    if (lastSlash > 0) {
      return `${url.origin}${url.pathname.slice(0, lastSlash + 1)}`;
    }
    return `${url.origin}/`;
  } catch {
    return undefined;
  }
}

/**
 * Build a context term for a property based on its schema definition.
 * 
 * @param propName - Property name
 * @param propDef - Property schema definition
 * @param config - JSON-LD configuration
 * @returns Context term or undefined
 */
function buildTermForProperty(
  propName: string,
  propDef: unknown,
  config: JsonLdConfig
): string | ContextTerm | undefined {
  if (typeof propDef !== 'object' || propDef === null) {
    return undefined;
  }
  
  const def = propDef as Record<string, unknown>;
  
  // Check for explicit JSON-LD annotation in schema
  if (def['x-jsonld']) {
    const annotation = def['x-jsonld'] as Record<string, unknown>;
    return buildTermFromAnnotation(propName, annotation, config);
  }
  
  // Check for $ref (likely a reference to another schema/record)
  if (def['$ref'] && config.embedReferences) {
    return {
      '@id': `clab:${propName}`,
      '@type': '@id',
    };
  }
  
  // Check for array of refs
  if (def.type === 'array' && def.items) {
    const items = def.items as Record<string, unknown>;
    if (items['$ref'] && config.embedReferences) {
      return {
        '@id': `clab:${propName}`,
        '@type': '@id',
        '@container': '@list',
      };
    }
  }
  
  // Check for well-known type mappings
  if (TYPE_MAPPINGS[propName]) {
    return {
      '@id': `clab:${propName}`,
      '@type': TYPE_MAPPINGS[propName],
    };
  }
  
  // Check for format hints
  if (def.format === 'date-time') {
    return {
      '@id': `clab:${propName}`,
      '@type': 'xsd:dateTime',
    };
  }
  
  if (def.format === 'date') {
    return {
      '@id': `clab:${propName}`,
      '@type': 'xsd:date',
    };
  }
  
  if (def.format === 'uri' || def.format === 'uri-reference') {
    return {
      '@id': `clab:${propName}`,
      '@type': '@id',
    };
  }
  
  return undefined;
}

/**
 * Build a context term from an explicit x-jsonld annotation.
 * 
 * @param propName - Property name
 * @param annotation - The x-jsonld annotation object
 * @param config - JSON-LD configuration
 * @returns Context term
 */
function buildTermFromAnnotation(
  propName: string,
  annotation: Record<string, unknown>,
  _config: JsonLdConfig
): string | ContextTerm {
  // If just a string IRI, use directly
  if (typeof annotation['@id'] === 'string' && Object.keys(annotation).length === 1) {
    return annotation['@id'];
  }
  
  const term: ContextTerm = {
    '@id': (annotation['@id'] as string) || `clab:${propName}`,
  };
  
  if (annotation['@type']) {
    term['@type'] = annotation['@type'] as string;
  }
  
  if (annotation['@container']) {
    term['@container'] = annotation['@container'] as '@list' | '@set' | '@language' | '@index';
  }
  
  return term;
}

/**
 * Merge multiple contexts into one.
 * 
 * @param contexts - Array of contexts to merge
 * @returns Merged context
 */
export function mergeContexts(...contexts: JsonLdContext[]): JsonLdContext {
  const result: JsonLdContext = {};
  
  for (const ctx of contexts) {
    for (const [key, value] of Object.entries(ctx)) {
      // Later contexts override earlier ones
      result[key] = value;
    }
  }
  
  return result;
}

/**
 * Create a context reference (URL) instead of inline context.
 * 
 * @param namespace - The namespace
 * @param kind - The record kind
 * @returns A context URL
 */
export function createContextReference(namespace: string, kind: string): string {
  const base = namespace.endsWith('/') ? namespace : `${namespace}/`;
  return `${base}context/${kind}.jsonld`;
}

/**
 * Simplify a context by removing unnecessary entries.
 * 
 * @param context - The context to simplify
 * @returns Simplified context
 */
export function simplifyContext(context: JsonLdContext): JsonLdContext {
  const simplified: JsonLdContext = {};
  
  for (const [key, value] of Object.entries(context)) {
    // Keep @vocab and @base
    if (key === '@vocab' || key === '@base') {
      simplified[key] = value;
      continue;
    }
    
    // Keep prefixes (simple string values that are URIs)
    if (typeof value === 'string' && value.includes('://')) {
      simplified[key] = value;
      continue;
    }
    
    // Keep complex terms
    if (typeof value === 'object' && value !== null) {
      simplified[key] = value;
    }
  }
  
  return simplified;
}
