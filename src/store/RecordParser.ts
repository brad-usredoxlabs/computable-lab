/**
 * RecordParser — Convert between YAML text and RecordEnvelope.
 * 
 * This module handles:
 * - Parsing YAML to extract payload and detect schema
 * - Serializing envelope payload back to YAML
 * - Extracting recordId and kind from payload
 * 
 * It has NO schema-specific logic. It looks for conventional fields
 * like 'kind', 'recordId', '$schema' but does NOT validate.
 */

import yaml from 'yaml';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

/**
 * Result of parsing a record file.
 */
export interface ParseResult {
  /** Whether parsing succeeded */
  success: boolean;
  /** The parsed envelope (if successful) */
  envelope?: RecordEnvelope;
  /** Error message (if failed) */
  error?: string;
}

/**
 * Options for serializing a record.
 */
export interface SerializeOptions {
  /** Include meta fields as YAML comments */
  includeMetaComments?: boolean;
  /** YAML indent (default: 2) */
  indent?: number;
  /** Line width for wrapping (default: 80) */
  lineWidth?: number;
}

/**
 * Conventional field names for extracting identity.
 */
const RECORD_ID_FIELDS = ['recordId', 'id'];
const KIND_FIELDS = ['kind', 'type', '@type'];
const SCHEMA_FIELDS = ['$schema', 'schemaId'];

/**
 * Extract a value from payload using multiple possible field names.
 */
function extractField(payload: unknown, fields: string[]): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  
  const obj = payload as Record<string, unknown>;
  
  for (const field of fields) {
    const value = obj[field];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  
  return undefined;
}

/**
 * Parse YAML content into a RecordEnvelope.
 * 
 * @param content - YAML string content
 * @param filePath - Optional file path (used for meta)
 * @returns ParseResult with envelope or error
 */
export function parseRecord(content: string, filePath?: string): ParseResult {
  try {
    // Parse YAML
    const payload = yaml.parse(content);
    
    if (payload === null || payload === undefined) {
      return {
        success: false,
        error: 'Empty or null YAML content',
      };
    }
    
    if (typeof payload !== 'object') {
      return {
        success: false,
        error: `Expected object, got ${typeof payload}`,
      };
    }
    
    // Extract identity fields
    const recordId = extractField(payload, RECORD_ID_FIELDS);
    const kind = extractField(payload, KIND_FIELDS);
    const schemaId = extractField(payload, SCHEMA_FIELDS);
    
    if (!recordId) {
      return {
        success: false,
        error: 'Missing recordId field (expected: recordId or id)',
      };
    }
    
    if (!schemaId) {
      return {
        success: false,
        error: 'Missing schema field (expected: $schema or schemaId)',
      };
    }
    
    // Build envelope
    const envelope: RecordEnvelope = {
      recordId,
      schemaId,
      payload,
      ...(kind !== undefined || filePath !== undefined ? {
        meta: {
          ...(kind !== undefined ? { kind } : {}),
          ...(filePath !== undefined ? { path: filePath } : {}),
        },
      } : {}),
    };
    
    return {
      success: true,
      envelope,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Serialize a RecordEnvelope to YAML.
 * 
 * Ensures the output YAML is self-describing by including:
 * - $schema (from envelope.schemaId)
 * - recordId (from envelope.recordId)
 * 
 * @param envelope - The envelope to serialize
 * @param options - Serialization options
 * @returns YAML string
 */
export function serializeRecord(
  envelope: RecordEnvelope, 
  options: SerializeOptions = {}
): string {
  const {
    includeMetaComments = false,
    indent = 2,
    lineWidth = 80,
  } = options;
  
  // Build payload with required identity fields
  // These fields must be in the file for it to be self-describing
  const payload = envelope.payload as Record<string, unknown>;
  
  // Remove any existing $schema/recordId from payload to avoid conflicts
  // Then add canonical values from envelope (envelope is authoritative)
  const { $schema: _s, recordId: _r, ...restPayload } = payload;
  
  const outputPayload = {
    // Ensure $schema and recordId are at the top (canonical from envelope)
    $schema: envelope.schemaId,
    recordId: envelope.recordId,
    // Spread the rest of the payload
    ...restPayload,
  };
  
  // Serialize to YAML string
  let output = yaml.stringify(outputPayload, {
    indent,
    lineWidth,
  });
  
  // Add meta comments if requested
  if (includeMetaComments && envelope.meta) {
    const comments: string[] = [];
    
    if (envelope.meta.path) {
      comments.push(`# Path: ${envelope.meta.path}`);
    }
    if (envelope.meta.commitSha) {
      comments.push(`# Commit: ${envelope.meta.commitSha}`);
    }
    if (envelope.meta.updatedAt) {
      comments.push(`# Updated: ${envelope.meta.updatedAt}`);
    }
    
    if (comments.length > 0) {
      output = comments.join('\n') + '\n' + output;
    }
  }
  
  return output;
}

/**
 * Extract recordId from YAML content without full parsing.
 * Useful for quick ID extraction.
 * 
 * @param content - YAML string content
 * @returns recordId or null
 */
export function extractRecordIdFromYaml(content: string): string | null {
  try {
    const payload = yaml.parse(content);
    return extractField(payload, RECORD_ID_FIELDS) ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract kind from YAML content without full parsing.
 * 
 * @param content - YAML string content
 * @returns kind or null
 */
export function extractKindFromYaml(content: string): string | null {
  try {
    const payload = yaml.parse(content);
    return extractField(payload, KIND_FIELDS) ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract schemaId from YAML content without full parsing.
 * 
 * @param content - YAML string content
 * @returns schemaId or null
 */
export function extractSchemaId(content: string): string | null {
  try {
    const payload = yaml.parse(content);
    return extractField(payload, SCHEMA_FIELDS) ?? null;
  } catch {
    return null;
  }
}

/**
 * Update specific fields in a YAML document while preserving structure.
 * Useful for updating timestamps, etc.
 * 
 * @param content - Original YAML content
 * @param updates - Fields to update
 * @returns Updated YAML content
 */
export function updateFields(
  content: string, 
  updates: Record<string, unknown>
): string {
  const doc = yaml.parseDocument(content);
  
  for (const [key, value] of Object.entries(updates)) {
    doc.set(key, value);
  }
  
  return doc.toString();
}

/**
 * Validate that YAML content is well-formed.
 * 
 * @param content - YAML string content
 * @returns true if valid YAML
 */
export function isValidYaml(content: string): boolean {
  try {
    yaml.parse(content);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get YAML parsing errors (if any).
 * 
 * @param content - YAML string content
 * @returns Array of error messages (empty if valid)
 */
export function getYamlErrors(content: string): string[] {
  try {
    const doc = yaml.parseDocument(content);
    return doc.errors.map(e => e.message);
  } catch (err) {
    return [err instanceof Error ? err.message : String(err)];
  }
}
