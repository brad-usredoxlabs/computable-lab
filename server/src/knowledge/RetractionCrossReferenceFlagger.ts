/**
 * RetractionCrossReferenceFlagger
 *
 * Finds live (non-retracted) records that reference retracted claims or assertions.
 * This produces diagnostics for the compiler without cascading retraction.
 *
 * Phase 1: status-only retraction (no cascade).
 * Phase 2: cascade retraction (not implemented here).
 */

export interface RecordLike {
  kind: string;
  id?: string;
  recordId?: string;
  status?: string;
  [key: string]: unknown;
}

export interface RetractionFlag {
  referencing_record_id: string;
  referencing_record_kind: string;
  retracted_target_id: string;
  retracted_target_kind: string;
  field_path: string; // e.g. "evidence_ref[0]" or "roles[1].role_ref"
}

/**
 * A reference object shape: {kind: 'record', id: string, type: string}
 */
interface RefObject {
  kind: 'record';
  id: string;
  type: string;
}

/**
 * Type guard to check if a value is a ref object.
 */
function isRefObject(value: unknown): value is RefObject {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    obj.kind === 'record' &&
    typeof obj.id === 'string' &&
    typeof obj.type === 'string'
  );
}

/**
 * Check if a record is retracted (claim or assertion with status: 'retracted').
 */
function isRetracted(record: RecordLike): boolean {
  return (
    (record.kind === 'claim' || record.kind === 'assertion') &&
    record.status === 'retracted'
  );
}

/**
 * Get the record ID, preferring `id` over `recordId`, with fallback to '<unknown>'.
 */
function getRecordId(record: RecordLike): string {
  return record.id ?? record.recordId ?? '<unknown>';
}

/**
 * Map ref type to the kind it should match.
 * type: 'claim' -> matches kind: 'claim'
 * type: 'assertion' -> matches kind: 'assertion'
 */
function typeToKind(refType: string): string | null {
  if (refType === 'claim' || refType === 'assertion') {
    return refType;
  }
  return null;
}

/**
 * Recursively walk a value and collect all ref objects found.
 * Uses a seen-set to prevent infinite loops on cyclic structures.
 *
 * @param value - The value to traverse
 * @param path - Current field path (e.g., "foo.bar[0]")
 * @param seen - Set of object references already visited
 * @returns Array of {ref, path} tuples
 */
function findRefsInValue(
  value: unknown,
  path: string,
  seen: Set<object>
): Array<{ ref: RefObject; path: string }> {
  const results: Array<{ ref: RefObject; path: string }> = [];

  // Guard against cycles
  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return results;
    }
    seen.add(value);
  }

  if (isRefObject(value)) {
    results.push({ ref: value, path });
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      const childResults = findRefsInValue(value[i], childPath, seen);
      results.push(...childResults);
    }
  } else if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      const childPath = path ? `${path}.${key}` : key;
      const childResults = findRefsInValue(obj[key], childPath, seen);
      results.push(...childResults);
    }
  }

  return results;
}

/**
 * Flag all references from live records to retracted claims/assertions.
 *
 * @param records - Array of records to scan
 * @returns Array of RetractionFlag objects
 */
export function flagRetractionReferences(
  records: ReadonlyArray<RecordLike>
): RetractionFlag[] {
  const flags: RetractionFlag[] = [];
  const seenFlagSet = new Set<string>(); // To prevent duplicate flags

  // Step 1: Build index of retracted targets
  const retractedIndex = new Map<string, { id: string; kind: string }>();
  for (const record of records) {
    if (isRetracted(record)) {
      const id = getRecordId(record);
      if (id !== '<unknown>') {
        retractedIndex.set(id, { id, kind: record.kind });
      }
    }
  }

  // Step 2: For each non-retracted record, find references to retracted targets
  for (const record of records) {
    // Skip retracted records (they can reference other retracted records without flagging)
    if (isRetracted(record)) {
      continue;
    }

    const referrerId = getRecordId(record);
    const referrerKind = record.kind;

    // Walk the entire record looking for ref objects
    const refs = findRefsInValue(record, '', new Set<object>());

    for (const { ref, path } of refs) {
      // Check if this ref points to a retracted target
      const targetId = ref.id;
      const refType = ref.type;
      const expectedKind = typeToKind(refType);

      // Skip if type doesn't map to a valid kind
      if (expectedKind === null) {
        continue;
      }

      const target = retractedIndex.get(targetId);
      if (!target) {
        continue; // Not a retracted target
      }

      // Check if the target's actual kind matches what the ref expects
      if (target.kind !== expectedKind) {
        continue; // Type/kind mismatch - ignore
      }

      // Create a unique key for this flag to prevent duplicates
      const flagKey = `${referrerId}|${referrerKind}|${targetId}|${target.kind}|${path}`;
      if (seenFlagSet.has(flagKey)) {
        continue; // Already flagged this exact combination
      }
      seenFlagSet.add(flagKey);

      flags.push({
        referencing_record_id: referrerId,
        referencing_record_kind: referrerKind,
        retracted_target_id: targetId,
        retracted_target_kind: target.kind,
        field_path: path,
      });
    }
  }

  return flags;
}
