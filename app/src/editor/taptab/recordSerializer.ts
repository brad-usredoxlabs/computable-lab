/**
 * Record serializer for converting TipTap document JSON back to record format.
 * Extracts fieldRow path/value pairs and reconstructs the record using setValueAtPath.
 *
 * Supports composite widget types:
 * - array: values are arrays of primitives or objects
 * - object: values are nested objects
 * - reflist: values are arrays of structured reference entries
 * - multiselect: values are arrays of strings
 * - datetime: values are ISO date/datetime strings
 * - readonly: values are any type, rendered non-editable
 */

import type { JSONContent } from '@tiptap/core';
import { setValueAtPath, stripJsonPath } from '../../shared/lib/formHelpers';
import { isEmptyFieldValue } from './refValue';

/**
 * Immutably remove the value at a dotted path. No-op when the path is absent.
 * Used for the value-emission contract (QMS-6E refs, EDITOR-9 scalars): a
 * cleared field must be DELETED, not written as a typed empty. Intermediate
 * objects emptied by the deletion are pruned too — a residue `contact: {}`
 * after clearing `contact.email` + `contact.phone` is a container the user
 * never set; absence is its true state. Containers that still hold values
 * (siblings the user filled or fields outside this projection) are kept.
 */
function deleteValueAtPath(
  obj: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const parts = stripJsonPath(path).split('.')
  if (parts.length === 0 || parts.some((p) => p.length === 0)) return obj

  const result = { ...obj }
  // Cloned ancestors, shallowest first, with the key each sits under.
  const chain: Array<{ container: Record<string, unknown>; key: string }> = []
  let current = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    const next = current[part]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return obj
    current[part] = { ...(next as Record<string, unknown>) }
    current = current[part] as Record<string, unknown>
    chain.push({ container: current, key: part })
  }
  delete current[parts[parts.length - 1]!]

  // Prune emptied ancestors from the deepest upward; stop at the first
  // container that still holds a value.
  for (let i = chain.length - 1; i >= 0; i--) {
    const { container, key } = chain[i]!
    if (Object.keys(container).length > 0) break
    const holder = i === 0 ? result : chain[i - 1]!.container
    delete holder[key]
  }
  return result
}

/**
 * A path is a DISPLAY HINT when it walks an array with a WILDCARD segment
 * (`$.steps[*].intent.provenance`). Hints render data; they are not
 * addressable fields — there is no single value at that path. Writing one back
 * mints a literal `steps[*]` key in the payload (W2-8-FIX2 D1: the MEANT save
 * polluted candidates[0].draft with hint keys, violating the "preserve every
 * untouched field" contract). INDEXED paths (`$.lines[0].description`) are a
 * different, pre-existing convention (the budget surface) and stay untouched.
 */
const WILDCARD_SEGMENT = /\[\*\]/;

function isWildcardHintPath(path: string): boolean {
  return WILDCARD_SEGMENT.test(path)
}

/** Does the base payload actually carry a value at this dotted path? */
function hasValueAtPath(obj: unknown, parts: string[]): boolean {
  let current: unknown = obj
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return false
    if (!(part in (current as Record<string, unknown>))) return false
    const next = (current as Record<string, unknown>)[part]
    if (next === null || next === undefined) return false
    current = next
  }
  return true
}

/**
 * Recursively walks a TipTap document tree and extracts fieldRow path/value pairs.
 * @param nodes - Array of JSONContent nodes to walk
 * @param result - Accumulator object for extracted values
 * @param base - The original payload, consulted so an untouched/absent field
 *   never mints a new null key in the save payload
 * @returns The updated result object with extracted values
 */
function extractFieldRows(
  nodes: JSONContent[],
  result: Record<string, unknown>,
  base: Record<string, unknown>,
): Record<string, unknown> {
  for (const node of nodes) {
    if (!node) continue;

    // Check if this node is a fieldRow
    if (node.type === 'fieldRow' && node.attrs) {
      const path = node.attrs.path as string;
      const value = node.attrs.value as unknown;

      // A missing read-only display slot must not introduce null into an
      // optional non-nullable field (e.g. a run with no protocol version yet).
      if (node.attrs.readOnly && value == null) continue;

      if (typeof path === 'string' && !isWildcardHintPath(path)) {
        // Value-emission contract (QMS-6E D3b, generalized by EDITOR-9): a
        // widget holding its unset/empty value is ABSENT from the payload.
        // For a ref that meant null/''/'—' into a `type: object` slot 422s;
        // for a scalar optional it means null/'' into a `type: string` (or
        // number) slot 422s the same way (Brad's person save: /organizationId,
        // /contact/phone). Absence is the true empty value; a cleared field
        // must also delete any base-payload value at the same path, or the
        // clear silently un-clears. Required-but-empty is omitted too — the
        // server's required-check is the correct validation error.
        if (isEmptyFieldValue(value, node.attrs.widget)) {
          result = deleteValueAtPath(result, stripJsonPath(path));
          // Recursively process child nodes
          if (node.content && node.content.length > 0) {
            result = extractFieldRows(node.content, result, base);
          }
          continue;
        }
        // Use stripJsonPath to remove $. prefix, then set the value
        const cleanPath = stripJsonPath(path);
        // A fieldRow whose value was never populated (the node attribute
        // defaults to null) must not mint a key the payload never carried:
        // clearing an existing value still writes, an absent one stays absent.
        if (value === null && !hasValueAtPath(base, cleanPath.split('.'))) {
          // Nothing to serialize for this slot.
        } else {
          // setValueAtPath returns a new object, so we need to capture it
          result = setValueAtPath(result, cleanPath, value);
        }
      }
    }

    // Recursively process child nodes
    if (node.content && node.content.length > 0) {
      result = extractFieldRows(node.content, result, base);
    }
  }
  return result;
}

/**
 * Paths that are always system-owned. The client must never write these;
 * the server stamps createdBy/createdAt/updatedAt authoritatively on create
 * and update. Stripping here makes every TapTab save provenance-free.
 */
const SYSTEM_PROVENANCE_KEYS = new Set(['createdBy', 'createdAt', 'updatedAt']);

/** Remove system provenance keys from a serialized record (mutates + returns it). */
export function stripSystemProvenance(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of SYSTEM_PROVENANCE_KEYS) {
    delete payload[key];
  }
  return payload;
}

/**
 * Serializes a TipTap document JSON back into a record object.
 * Walks the doc tree, extracts each FieldRow's path and value,
 * and reconstructs the record using setValueAtPath.
 *
 * Handles composite widget types:
 * - array: preserves array structure (not collapsed to JSON string)
 * - object: preserves nested object structure
 * - reflist: preserves structured reference entries
 * - multiselect: preserves array of selected values
 *
 * @param doc - The TipTap document JSON (type: 'doc')
 * @param baseRecord - The original record to clone and modify
 * @returns A new record object with extracted values
 */
export function serializeDocument(
  doc: JSONContent,
  baseRecord: Record<string, unknown>,
): Record<string, unknown> {
  // Clone the base record to avoid mutation
  let result = structuredClone(baseRecord);

  // Start extraction from the document's content
  if (doc.content && doc.content.length > 0) {
    result = extractFieldRows(doc.content, result, baseRecord);
  }

  // System provenance is server-owned; never round-trip it through the client.
  return stripSystemProvenance(result);
}

/**
 * Compares two record objects to determine if they are different.
 * Uses JSON.stringify for deep comparison.
 *
 * @param original - The original record
 * @param current - The current record to compare against
 * @returns true if the records differ, false if they are identical
 */
export function isDirty(
  original: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return JSON.stringify(original) !== JSON.stringify(current);
}
