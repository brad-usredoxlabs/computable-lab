/**
 * RecordEnvelope — Canonical container for all records.
 * 
 * CRITICAL: recordId is the canonical identity, NOT payload fields.
 * Code MUST NOT assume record payload contains id, createdAt, updatedAt, createdBy.
 * Code MUST NOT copy/smuggle those fields between payload and envelope.
 * 
 * If metadata exists, it lives in RecordEnvelope.meta and is either:
 * - provided explicitly by the caller/context, or
 * - derived deterministically from repo state / event graph (never from time/random).
 */

/**
 * Envelope metadata populated from repository state.
 * All fields are optional and derived from repo/context.
 */
export interface RecordMeta {
  /** ISO 8601 timestamp of record creation (from repo) */
  createdAt?: string;
  /** User or agent identifier who created the record (from repo) */
  createdBy?: string;
  /** ISO 8601 timestamp of last modification (from repo) */
  updatedAt?: string;
  /** Git commit SHA of last modification */
  commitSha?: string;
  /** Repository path where record is stored */
  path?: string;
  /** Content SHA (blob hash) for cache invalidation */
  contentSha?: string;
  /** Record kind/type (from payload) */
  kind?: string;
}

/**
 * RecordEnvelope — The canonical wrapper for all computable-lab records.
 * 
 * @typeParam T - The payload type (defaults to unknown for generic use)
 */
export interface RecordEnvelope<T = unknown> {
  /** 
   * Canonical record identity (e.g., "STU-000003", "EXP-000123").
   * This is the ONLY authoritative identity for the record.
   */
  recordId: string;
  
  /**
   * URI of the governing schema (e.g., "https://computable-lab.com/schema/computable-lab/study.schema.yaml").
   * Used to determine which schema to validate against.
   */
  schemaId: string;
  
  /**
   * The record payload (schema-validated data).
   * This is the actual record content, validated against the schema.
   */
  payload: T;
  
  /**
   * Optional metadata populated from repository state.
   * MUST NOT be confused with payload fields.
   */
  meta?: RecordMeta;
}

/**
 * Extract recordId from a payload based on common patterns.
 * Records use either `recordId` or `id` as their identifier field.
 * 
 * @param payload - The record payload
 * @returns The recordId if found, undefined otherwise
 */
export function extractRecordId(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  
  const obj = payload as Record<string, unknown>;
  
  // Try recordId first (preferred for most records)
  if (typeof obj['recordId'] === 'string' && obj['recordId'].length > 0) {
    return obj['recordId'];
  }
  
  // Fall back to id (used by some records like material, claim)
  if (typeof obj['id'] === 'string' && obj['id'].length > 0) {
    return obj['id'];
  }
  
  return undefined;
}

/**
 * Extract the kind/type discriminator from a payload.
 * All records have a `kind` field that identifies the record type.
 * 
 * @param payload - The record payload
 * @returns The kind if found, undefined otherwise
 */
export function extractKind(payload: unknown): string | undefined {
  if (payload === null || typeof payload !== 'object') {
    return undefined;
  }
  
  const obj = payload as Record<string, unknown>;
  
  if (typeof obj['kind'] === 'string' && obj['kind'].length > 0) {
    return obj['kind'];
  }
  
  return undefined;
}

/**
 * Create a RecordEnvelope from a payload and schemaId.
 * Extracts recordId from the payload automatically.
 * 
 * @param payload - The record payload
 * @param schemaId - The governing schema URI
 * @param meta - Optional metadata
 * @returns A RecordEnvelope or null if recordId cannot be extracted
 */
export function createEnvelope<T>(
  payload: T,
  schemaId: string,
  meta?: RecordMeta
): RecordEnvelope<T> | null {
  const recordId = extractRecordId(payload);
  
  if (recordId === undefined) {
    return null;
  }
  
  return {
    recordId,
    schemaId,
    payload,
    ...(meta !== undefined ? { meta } : {}),
  };
}
