/**
 * IdDeriver — Deterministic @id generation for JSON-LD.
 * 
 * CRITICAL: @id is ALWAYS derived, never authored.
 * The derivation must be deterministic: same inputs → same output.
 * 
 * Pattern: {namespace}/{kind}/{recordId}
 * Example: https://computable-lab.com/study/STU-000001
 */

import type { IdDerivationOptions } from './types.js';

/**
 * Derive a canonical @id from record identity.
 * 
 * @param options - Derivation options (namespace, kind, recordId)
 * @returns The derived @id URI
 */
export function deriveId(options: IdDerivationOptions): string {
  const { namespace, kind, recordId } = options;
  
  // Validate inputs
  if (!namespace || namespace.trim().length === 0) {
    throw new Error('namespace is required for @id derivation');
  }
  
  if (!kind || kind.trim().length === 0) {
    throw new Error('kind is required for @id derivation');
  }
  
  if (!recordId || recordId.trim().length === 0) {
    throw new Error('recordId is required for @id derivation');
  }
  
  // Normalize namespace (ensure trailing slash)
  const normalizedNamespace = namespace.endsWith('/')
    ? namespace
    : `${namespace}/`;
  
  // Normalize kind (lowercase, no spaces)
  const normalizedKind = kind.toLowerCase().replace(/\s+/g, '-');
  
  // Build @id
  return `${normalizedNamespace}${normalizedKind}/${recordId}`;
}

/**
 * Derive @id from a RecordEnvelope.
 * 
 * @param envelope - The record envelope
 * @param namespace - The base namespace
 * @returns The derived @id URI
 */
export function deriveIdFromEnvelope(
  envelope: { recordId: string; payload: unknown; meta?: { kind?: string } },
  namespace: string
): string {
  // Extract kind from payload or meta
  const payload = envelope.payload as Record<string, unknown>;
  const kind = (payload.kind as string) || envelope.meta?.kind;
  
  if (!kind) {
    throw new Error('Cannot derive @id: kind not found in envelope');
  }
  
  return deriveId({
    namespace,
    kind,
    recordId: envelope.recordId,
  });
}

/**
 * Parse components from a derived @id.
 * 
 * @param id - The @id URI
 * @param namespace - The expected namespace
 * @returns Parsed components or null if doesn't match pattern
 */
export function parseId(
  id: string,
  namespace: string
): { kind: string; recordId: string } | null {
  // Normalize namespace
  const normalizedNamespace = namespace.endsWith('/')
    ? namespace
    : `${namespace}/`;
  
  // Check if id starts with namespace
  if (!id.startsWith(normalizedNamespace)) {
    return null;
  }
  
  // Extract the path after namespace
  const path = id.slice(normalizedNamespace.length);
  
  // Split into kind/recordId
  const slashIndex = path.indexOf('/');
  if (slashIndex === -1) {
    return null;
  }
  
  const kind = path.slice(0, slashIndex);
  const recordId = path.slice(slashIndex + 1);
  
  if (!kind || !recordId) {
    return null;
  }
  
  return { kind, recordId };
}

/**
 * Check if a string looks like a valid @id URI.
 * 
 * @param value - The value to check
 * @returns true if it looks like a URI
 */
export function isIdLike(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  
  // Basic URI check (starts with scheme://)
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

/**
 * Convert a reference value to an @id object.
 * 
 * @param ref - The reference value (recordId or @id URI)
 * @param namespace - The base namespace
 * @param refKind - The expected kind of the referenced record
 * @returns An object with @id property
 */
export function refToIdObject(
  ref: string,
  namespace: string,
  refKind?: string
): { '@id': string } {
  // If already a full URI, use as-is
  if (isIdLike(ref)) {
    return { '@id': ref };
  }
  
  // If we have a kind, derive the full @id
  if (refKind) {
    return {
      '@id': deriveId({
        namespace,
        kind: refKind,
        recordId: ref,
      }),
    };
  }
  
  // If ref looks like it has a prefix (e.g., STU-, EXP-), try to infer kind
  const inferredKind = inferKindFromRecordId(ref);
  if (inferredKind) {
    return {
      '@id': deriveId({
        namespace,
        kind: inferredKind,
        recordId: ref,
      }),
    };
  }
  
  // Fall back to using ref as local identifier
  return { '@id': ref };
}

/**
 * Infer record kind from a record ID prefix.
 * 
 * @param recordId - The record ID
 * @returns Inferred kind or undefined
 */
export function inferKindFromRecordId(recordId: string): string | undefined {
  const prefixMap: Record<string, string> = {
    'STU-': 'study',
    'EXP-': 'experiment',
    'RUN-': 'run',
    'PRO-': 'protocol',
    'MAT-': 'material',
    'INS-': 'instrument',
    'LW-': 'labware',
    'LWI-': 'labware-instance',
    'CLM-': 'claim',
    'AST-': 'assertion',
    'EVD-': 'evidence',
    'NAR-': 'narrative',
    'TML-': 'timeline',
    'WCX-': 'well-context',
  };
  
  for (const [prefix, kind] of Object.entries(prefixMap)) {
    if (recordId.startsWith(prefix)) {
      return kind;
    }
  }
  
  return undefined;
}

/**
 * Generate a blank node identifier.
 * Used for anonymous/embedded objects without persistent identity.
 * 
 * @param hint - Optional hint for the identifier
 * @returns A blank node identifier
 */
export function generateBlankNodeId(hint?: string): string {
  const suffix = hint 
    ? hint.replace(/[^a-zA-Z0-9]/g, '_')
    : Math.random().toString(36).slice(2, 10);
  
  return `_:${suffix}`;
}
