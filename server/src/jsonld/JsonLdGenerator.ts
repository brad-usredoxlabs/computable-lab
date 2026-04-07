/**
 * JsonLdGenerator — Convert RecordEnvelopes to JSON-LD documents.
 * 
 * CRITICAL: All JSON-LD fields (@id, @type, @context) are DERIVED.
 * This generator must be deterministic: same input → same output.
 */

import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import type {
  JsonLdConfig,
  JsonLdDocument,
  JsonLdResult,
  JsonLdContext,
} from './types.js';
import { deriveId, inferKindFromRecordId, refToIdObject, isIdLike } from './IdDeriver.js';
import { buildContext, buildContextFromSchema } from './ContextBuilder.js';

/**
 * Default configuration for JSON-LD generation.
 */
const DEFAULT_CONFIG: JsonLdConfig = {
  namespace: 'https://computable-lab.com/',
  vocab: 'https://computable-lab.com/vocab/',
  embedReferences: true,
  includeContext: true,
};

/**
 * Property names that typically contain record references.
 */
const REF_PROPERTY_PATTERNS = [
  /Id$/,           // studyId, experimentId, etc.
  /Ids$/,          // claimIds, materialIds, etc.
  /Ref$/,          // parentRef, sourceRef
  /Refs$/,         // parentRefs, sourceRefs
];

/**
 * Properties to exclude from JSON-LD output.
 */
const EXCLUDED_PROPERTIES = new Set([
  '$schema',
  'schemaId',
]);

/**
 * JsonLdGenerator — Main class for JSON-LD generation.
 */
export class JsonLdGenerator {
  private readonly config: JsonLdConfig;
  private readonly schemaCache: Map<string, Record<string, unknown>> = new Map();
  
  constructor(config: Partial<JsonLdConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  /**
   * Generate JSON-LD from a RecordEnvelope.
   * 
   * @param envelope - The record envelope
   * @param schema - Optional schema for enhanced context
   * @returns JsonLdResult with document or error
   */
  generate(
    envelope: RecordEnvelope,
    schema?: Record<string, unknown>
  ): JsonLdResult {
    try {
      const document = this.buildDocument(envelope, schema);
      return {
        success: true,
        document,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
  
  /**
   * Generate JSON-LD from multiple envelopes.
   * 
   * @param envelopes - Array of record envelopes
   * @returns Array of JsonLdDocuments
   */
  generateBatch(envelopes: RecordEnvelope[]): JsonLdDocument[] {
    const documents: JsonLdDocument[] = [];
    
    for (const envelope of envelopes) {
      const result = this.generate(envelope);
      if (result.success && result.document) {
        documents.push(result.document);
      }
    }
    
    return documents;
  }
  
  /**
   * Build the JSON-LD document from an envelope.
   */
  private buildDocument(
    envelope: RecordEnvelope,
    schema?: Record<string, unknown>
  ): JsonLdDocument {
    const payload = envelope.payload as Record<string, unknown>;
    
    // Extract kind
    const kind = (payload.kind as string) || envelope.meta?.kind;
    if (!kind) {
      throw new Error('Cannot generate JSON-LD: kind not found');
    }
    
    // Derive @id
    const id = deriveId({
      namespace: this.config.namespace,
      kind,
      recordId: envelope.recordId,
    });
    
    // Derive @type
    const type = this.deriveType(kind, payload);
    
    // Build @context
    const context = this.buildContextForRecord(kind, schema);
    
    // Transform payload
    const properties = this.transformPayload(payload);
    
    // Build document
    const document: JsonLdDocument = {
      '@id': id,
      '@type': type,
      ...properties,
    };
    
    // Add context if configured
    if (this.config.includeContext && context) {
      document['@context'] = context;
    }
    
    return document;
  }
  
  /**
   * Derive @type from kind and payload.
   */
  private deriveType(kind: string, payload: Record<string, unknown>): string {
    // Check for explicit @type in payload (shouldn't happen per rules, but handle)
    if (payload['@type'] && typeof payload['@type'] === 'string') {
      return payload['@type'];
    }
    
    // Convert kind to PascalCase for type
    return this.kindToType(kind);
  }
  
  /**
   * Convert kind slug to PascalCase type name.
   */
  private kindToType(kind: string): string {
    return kind
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
  
  /**
   * Build context for a specific record kind.
   */
  private buildContextForRecord(
    _kind: string,
    schema?: Record<string, unknown>
  ): JsonLdContext | undefined {
    if (!this.config.includeContext) {
      return undefined;
    }
    
    if (schema) {
      return buildContextFromSchema(
        schema as { $id?: string; title?: string; properties?: Record<string, unknown> },
        this.config
      );
    }
    
    return buildContext(this.config);
  }
  
  /**
   * Transform payload properties for JSON-LD output.
   */
  private transformPayload(
    payload: Record<string, unknown>
  ): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(payload)) {
      // Skip excluded properties
      if (EXCLUDED_PROPERTIES.has(key)) {
        continue;
      }
      
      // Skip @-prefixed properties (JSON-LD keywords)
      if (key.startsWith('@')) {
        continue;
      }
      
      // Skip recordId (already in @id)
      if (key === 'recordId' || key === 'id') {
        continue;
      }
      
      // Skip kind (already in @type)
      if (key === 'kind') {
        continue;
      }
      
      // Transform the value
      result[key] = this.transformValue(key, value);
    }
    
    return result;
  }
  
  /**
   * Transform a single value, handling references.
   */
  private transformValue(
    key: string,
    value: unknown
  ): unknown {
    // Null/undefined pass through
    if (value === null || value === undefined) {
      return value;
    }
    
    // Check if this is a reference property
    const isRefProperty = this.isReferenceProperty(key);
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.transformArrayItem(key, item, isRefProperty));
    }
    
    // Handle reference strings
    if (isRefProperty && typeof value === 'string' && this.config.embedReferences) {
      return this.transformReference(value);
    }
    
    // Handle nested objects
    if (typeof value === 'object') {
      return this.transformNestedObject(value as Record<string, unknown>);
    }
    
    return value;
  }
  
  /**
   * Check if a property name looks like a reference.
   */
  private isReferenceProperty(name: string): boolean {
    return REF_PROPERTY_PATTERNS.some(pattern => pattern.test(name));
  }
  
  /**
   * Transform an array item.
   */
  private transformArrayItem(
    _key: string,
    item: unknown,
    isRefProperty: boolean
  ): unknown {
    // Reference array
    if (isRefProperty && typeof item === 'string' && this.config.embedReferences) {
      return this.transformReference(item);
    }
    
    // Nested object array
    if (typeof item === 'object' && item !== null) {
      return this.transformNestedObject(item as Record<string, unknown>);
    }
    
    return item;
  }
  
  /**
   * Transform a reference string to an @id object.
   */
  private transformReference(ref: string): { '@id': string } {
    return refToIdObject(ref, this.config.namespace);
  }
  
  /**
   * Transform a nested object.
   */
  private transformNestedObject(obj: Record<string, unknown>): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Check for id-like properties in nested objects
      if ((key === 'id' || key === 'recordId') && typeof value === 'string') {
        // If the object has an ID, it might be a reference
        if (isIdLike(value)) {
          result['@id'] = value;
        } else {
          // Try to derive an @id
          const kind = inferKindFromRecordId(value);
          if (kind) {
            result['@id'] = deriveId({
              namespace: this.config.namespace,
              kind,
              recordId: value,
            });
          } else {
            result[key] = value;
          }
        }
        continue;
      }
      
      // Recursively transform
      result[key] = this.transformValue(key, value);
    }
    
    return result;
  }
  
  /**
   * Register a schema for enhanced JSON-LD generation.
   */
  registerSchema(schemaId: string, schema: Record<string, unknown>): void {
    this.schemaCache.set(schemaId, schema);
  }
  
  /**
   * Get the configuration.
   */
  getConfig(): JsonLdConfig {
    return { ...this.config };
  }
}

/**
 * Create a new JsonLdGenerator instance.
 */
export function createJsonLdGenerator(config?: Partial<JsonLdConfig>): JsonLdGenerator {
  return new JsonLdGenerator(config);
}

/**
 * Quick conversion function for simple cases.
 */
export function toJsonLd(
  envelope: RecordEnvelope,
  config?: Partial<JsonLdConfig>
): JsonLdDocument | null {
  const generator = new JsonLdGenerator(config);
  const result = generator.generate(envelope);
  return result.success ? result.document ?? null : null;
}
