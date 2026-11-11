/**
 * referenceCascade — cascade-vs-refuse policy for record deletion.
 *
 * Reads a YAML declaration file (schema/store/reference-cascade.yaml) that
 * maps (referrerKind, pointer) → cascade | refuse. The walker scans every
 * record's payload for objects with { kind: 'record', id: <targetId> } —
 * recursive, no field names, no kind names hardcoded in TypeScript.
 *
 * The declaration file is the seam: cascade-vs-refuse is a property of the
 * REFERENCE, so it must be data (not a TypeScript list of kind names).
 *
 * Revision references (revisionRef) are explicitly excluded so a record's
 * own revisions never report as referrers.
 */

import { readFileSync } from 'node:fs';
import * as yaml from 'js-yaml';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A loaded cascade policy rule: which (referrerKind, pointer) pairs
 * cascade on deletion vs refuse.
 */
export interface CascadeRule {
  /** The kind of record that holds the reference (e.g. 'access-policy') */
  referrerKind: string;
  /** Map of pointer field paths → 'cascade' | 'refuse' */
  pointers: Record<string, 'cascade' | 'refuse'>;
}

/**
 * Parsed cascade policy, keyed by (referrerKind, pointer).
 */
export type CascadePolicy = Map<string, Map<string, 'cascade' | 'refuse'>>;

/**
 * A referrer found by the walker: the record that references the target,
 * plus the path to the referencing field in the payload.
 */
export interface ReferrerInfo {
  /** The referrer's recordId */
  recordId: string;
  /** The payload kind of the referrer */
  kind: string;
  /** Dot-path to the field holding the ref (e.g. 'resourceRef', 'links.studyId') */
  pointer: string;
}

// ---------------------------------------------------------------------------
// Policy loader
// ---------------------------------------------------------------------------

/**
 * Load the cascade policy from a YAML file.
 *
 * @param yamlPath — Absolute path to the YAML declaration file
 * @returns CascadePolicy map, or empty map if the file is missing/invalid
 */
export function loadCascadePolicy(yamlPath: string): CascadePolicy {
  const policy = new Map<string, Map<string, 'cascade' | 'refuse'>>();

  try {
    const content = readFileSync(yamlPath, 'utf-8');
    const data = yaml.load(content) as Record<string, unknown> | null;
    if (!data || typeof data !== 'object' || !data.rules) return policy;

    const rules = Array.isArray(data.rules) ? data.rules : [];
    for (const rule of rules) {
      if (!rule || typeof rule !== 'object') continue;
      const referrerKind = (rule as Record<string, unknown>).referrerKind as string;
      if (typeof referrerKind !== 'string') continue;
      const pointers = (rule as Record<string, unknown>).pointers as Record<string, string> | undefined;
      if (!pointers || typeof pointers !== 'object') continue;

      const pointerMap = new Map<string, 'cascade' | 'refuse'>();
      for (const [pointer, value] of Object.entries(pointers)) {
        if (value === 'cascade' || value === 'refuse') {
          pointerMap.set(pointer, value);
        }
      }
      if (pointerMap.size > 0) {
        policy.set(referrerKind, pointerMap);
      }
    }
  } catch {
    // File missing or invalid — empty policy (all refuse)
  }

  return policy;
}

// ---------------------------------------------------------------------------
// Walker — findReferrers
// ---------------------------------------------------------------------------

/**
 * Recursively scan a payload for any object with { kind: 'record', id: <targetId> }.
 * Returns the dot-path(s) to those fields.
 *
 * Does NOT follow revisionRef — a record's own revisions must not report as
 * referrers.
 */
function findRecordRefsInValue(
  value: unknown,
  targetId: string,
  currentPath: string
): string[] {
  const results: string[] = [];

  if (value == null || typeof value !== 'object') return results;

  // Skip revisionRef to avoid self-referencing through revision history
  if (currentPath === 'revisionRef') return results;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const childPath = `${currentPath}[${i}]`;
      results.push(...findRecordRefsInValue(value[i], targetId, childPath));
    }
  } else {
    const obj = value as Record<string, unknown>;
    // Check if this object is a record ref with the target id
    if (obj.kind === 'record' && obj.id === targetId) {
      results.push(currentPath);
    } else {
      for (const [key, val] of Object.entries(obj)) {
        const childPath = currentPath ? `${currentPath}.${key}` : key;
        results.push(...findRecordRefsInValue(val, targetId, childPath));
      }
    }
  }

  return results;
}

/**
 * Scan all records for references to the target record.
 *
 * @param records — All records in the store
 * @param targetId — The record being deleted
 * @returns Array of ReferrerInfo for every record that references targetId
 */
export function findReferrers(
  records: RecordEnvelope[],
  targetId: string
): ReferrerInfo[] {
  const referrers: ReferrerInfo[] = [];

  for (const envelope of records) {
    const payload = envelope.payload;
    if (payload == null || typeof payload !== 'object') continue;

    // Skip the target record itself
    if (envelope.recordId === targetId) continue;

    const pointers = findRecordRefsInValue(payload, targetId, '');
    if (pointers.length > 0) {
      for (const pointer of pointers) {
        referrers.push({
          recordId: envelope.recordId,
          kind: (envelope.meta?.kind ?? String((payload as Record<string, unknown>).kind ?? 'unknown')) as string,
          pointer,
        });
      }
    }
  }

  return referrers;
}

// ---------------------------------------------------------------------------
// Resolve cascade vs refuse for a given referrer
// ---------------------------------------------------------------------------

/**
 * Given the cascade policy and a referrer, determine whether deletion
 * cascades or refuses.
 *
 * Default: refuse (anything not explicitly declared as cascade).
 *
 * Special rule: access-policy records whose resourceRef points to the target
 * are ALWAYS cascade — this is criterion (a). The policy file declares this,
 * but the code also enforces it as a fallback for robustness.
 */
export function resolveDeleteAction(
  policy: CascadePolicy,
  referrer: ReferrerInfo
): 'cascade' | 'refuse' {
  const kindRules = policy.get(referrer.kind);
  if (kindRules) {
    const pointerAction = kindRules.get(referrer.pointer);
    if (pointerAction) return pointerAction;
  }

  // Fallback: access-policy with resourceRef always cascade (criterion a)
  if (referrer.kind === 'access-policy' && referrer.pointer === 'resourceRef') {
    return 'cascade';
  }

  return 'refuse';
}
