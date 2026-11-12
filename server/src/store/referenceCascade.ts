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
import { collectRefMatches } from './recordRefTraversal.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The declared onDelete action vocabulary — the item's two-value cascade/refuse
 * vocabulary, NOT a list of record kind names. One source of truth; the
 * CascadeAction type derives from it.
 */
export const CASCADE_ACTIONS = ['cascade', 'refuse'] as const;
export type CascadeAction = (typeof CASCADE_ACTIONS)[number];

/**
 * A loaded cascade policy rule: which (referrerKind, pointer) pairs
 * cascade on deletion vs refuse.
 */
export interface CascadeRule {
  /** The kind of record that holds the reference (e.g. 'access-policy') */
  referrerKind: string;
  /** Map of pointer field paths → CascadeAction */
  pointers: Record<string, CascadeAction>;
}

/**
 * Parsed cascade policy, keyed by (referrerKind, pointer).
 */
export type CascadePolicy = Map<string, Map<string, CascadeAction>>;

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

/**
 * A dangling reference: a pointer to a record id that does not exist in the store.
 */
export interface DanglingRef {
  /** The record holding the dangling reference */
  recordId: string;
  /** The payload kind of the referrer */
  kind: string;
  /** Dot-path to the field holding the ref */
  pointer: string;
  /** The target record id that is missing */
  targetId: string;
}

// ---------------------------------------------------------------------------
// Policy loader
// ---------------------------------------------------------------------------

/**
 * Load the cascade policy from a YAML file.
 *
 * Returns an empty (default-refuse) policy when the file is absent (ENOENT),
 * so workspaces without the cascade YAML file still boot — an empty Map
 * already implements fail-closed behavior (everything refuses).
 *
 * Throws on parse error, shape mismatch, or any I/O error other than ENOENT
 * — malformed content must still fail loudly.
 *
 * @param yamlPath — Absolute path to the YAML declaration file
 * @returns CascadePolicy map keyed by (referrerKind, pointer)
 */
export function loadCascadePolicy(yamlPath: string): CascadePolicy {
  // Read file — return empty policy on ENOENT; re-throw other errors
  let content: string;
  try {
    content = readFileSync(yamlPath, 'utf-8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return new Map();
    throw new Error(
      `Cascade policy file not found or unreadable: ${yamlPath} (${err instanceof Error ? err.message : String(err)})`
    );
  }

  // Parse YAML — throw on malformed content
  let data: unknown;
  try {
    data = yaml.load(content);
  } catch (err) {
    throw new Error(
      `Cascade policy YAML parse error in ${yamlPath}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!data || typeof data !== 'object' || !(data as Record<string, unknown>).rules) {
    throw new Error(`Cascade policy file missing 'rules' key: ${yamlPath}`);
  }

  const obj = data as Record<string, unknown>;
  if (!Array.isArray(obj.rules)) throw new Error(`${yamlPath}: rule[-] 'rules' must be an array, got ${typeof obj.rules}`);
  const policy = new Map<string, Map<string, CascadeAction>>();
  const rules: unknown[] = obj.rules;
  const bad = (i: number, problem: string): Error =>
    new Error(`${yamlPath}: rule[${i}] ${problem}`);
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    if (!rule || typeof rule !== 'object') {
      throw bad(i, `must be an object, got ${rule === null ? 'null' : typeof rule}`);
    }
    const referrerKind = (rule as Record<string, unknown>).referrerKind;
    if (typeof referrerKind !== 'string' || referrerKind.length === 0) {
      throw bad(i, `has invalid 'referrerKind' (expected a non-empty string)`);
    }
    const pointers = (rule as Record<string, unknown>).pointers;
    if (!pointers || typeof pointers !== 'object' || Array.isArray(pointers)) {
      throw bad(i, `has invalid 'pointers' (expected an object mapping pointer -> action)`);
    }

    const pointerMap = new Map<string, CascadeAction>();
    for (const [pointer, value] of Object.entries(pointers as Record<string, unknown>)) {
      if (!(CASCADE_ACTIONS as readonly string[]).includes(value as string)) {
        throw bad(i, `pointer '${pointer}' has onDelete '${String(value)}' (allowed: ${CASCADE_ACTIONS.join(' | ')})`);
      }
      pointerMap.set(pointer, value as CascadeAction);
    }
    if (pointerMap.size > 0) {
      policy.set(referrerKind, pointerMap);
    }
  }

  return policy;
}

// ---------------------------------------------------------------------------
// Walker — collectAllRecordRefs (generalised traversal)
// ---------------------------------------------------------------------------

/**
 * A raw record-reference found by the walker: pointer path and the target id.
 */
interface RawRef {
  pointer: string;
  targetId: string;
}

/**
 * Recursively scan a payload for every object with { kind: 'record', id }.
 * Returns all matching { pointer, targetId } pairs.
 *
 * Delegates to the shared traversal with this consumer's legacy policy: ref
 * objects only (no bare strings), stop at the matched ref object (no `.id`
 * child), and skip `revisionRef` at the top level — a record's own revisions
 * must not report as referrers or dangling references. The skip is top-key
 * only by design; a nested `x.revisionRef` is still scanned.
 */
function collectAllRecordRefs(
  value: unknown,
  currentPath: string,
): RawRef[] {
  return collectRefMatches(value, {
    initialPointer: currentPath,
    skipTopLevelKeys: ['revisionRef'],
    includeBareStrings: false,
    descendIntoRefObjects: false,
  }).map((match) => ({ pointer: match.pointer, targetId: match.targetId }));
}

/**
 * Recursively scan a payload for any object with { kind: 'record', id: <targetId> }.
 * Returns the dot-path(s) to those fields.
 *
 * Kept for backward compat — delegates to the generalised walker and filters.
 * Does NOT follow revisionRef.
 */
function findRecordRefsInValue(
  value: unknown,
  targetId: string,
  currentPath: string,
): string[] {
  const allRefs = collectAllRecordRefs(value, currentPath);
  return allRefs.filter((r) => r.targetId === targetId).map((r) => r.pointer);
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
// Dangling-reference sweep — criterion (d)
// ---------------------------------------------------------------------------

/**
 * Scan all records for references to target ids that do not exist.
 *
 * Builds an id set from the records, then reports every reference whose
 * targetId is absent. Results are sorted by (recordId, pointer) for
 * deterministic HTTP output.
 *
 * @param records — All records in the store
 * @returns Array of DanglingRef sorted by (recordId, pointer)
 */
export function findDanglingReferences(
  records: RecordEnvelope[],
): DanglingRef[] {
  const ids = new Set(
    records.map((e) => e.recordId),
  );
  const dangling: DanglingRef[] = [];

  for (const envelope of records) {
    const payload = envelope.payload;
    if (payload == null || typeof payload !== 'object') continue;

    const rawRefs = collectAllRecordRefs(payload, '');
    for (const ref of rawRefs) {
      if (!ids.has(ref.targetId)) {
        dangling.push({
          recordId: envelope.recordId,
          kind: (envelope.meta?.kind ?? String((payload as Record<string, unknown>).kind ?? 'unknown')) as string,
          pointer: ref.pointer,
          targetId: ref.targetId,
        });
      }
    }
  }

  // Deterministic sort: by recordId, then pointer
  dangling.sort((a, b) =>
    a.recordId < b.recordId ? -1 : a.recordId > b.recordId ? 1 : a.pointer < b.pointer ? -1 : a.pointer > b.pointer ? 1 : 0,
  );

  return dangling;
}

// ---------------------------------------------------------------------------
// Resolve cascade vs refuse for a given referrer
// ---------------------------------------------------------------------------

/**
 * Given the cascade policy and a referrer, determine whether deletion
 * cascades or refuses.
 *
 * Default: refuse (anything not explicitly declared as cascade).
 * The YAML declaration file is the sole authority — no kind names
 * are hardcoded in TypeScript.
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

  return 'refuse';
}
