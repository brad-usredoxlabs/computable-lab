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
import { isEmptyRefFieldValue } from './refValue';

/**
 * Immutably remove the value at a dotted path. No-op when the path is absent.
 * Used for the ref value contract: a cleared ref must be DELETED, not written
 * as a typed empty.
 */
function deleteValueAtPath(
  obj: Record<string, unknown>,
  path: string,
): Record<string, unknown> {
  const parts = stripJsonPath(path).split('.')
  if (parts.length === 0 || parts.some((p) => p.length === 0)) return obj

  const result = { ...obj }
  let current = result
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]!
    const next = current[part]
    if (next === null || typeof next !== 'object' || Array.isArray(next)) return obj
    current[part] = { ...(next as Record<string, unknown>) }
    current = current[part] as Record<string, unknown>
  }
  delete current[parts[parts.length - 1]!]
  return result
}

/**
 * Recursively walks a TipTap document tree and extracts fieldRow path/value pairs.
 * @param nodes - Array of JSONContent nodes to walk
 * @param result - Accumulator object for extracted values
 * @returns The updated result object with extracted values
 */
function extractFieldRows(nodes: JSONContent[], result: Record<string, unknown>): Record<string, unknown> {
  for (const node of nodes) {
    if (!node) continue;

    // Check if this node is a fieldRow
    if (node.type === 'fieldRow' && node.attrs) {
      const path = node.attrs.path as string;
      const value = node.attrs.value as unknown;

      if (typeof path === 'string') {
        // Ref value contract (QMS-6E D3b): a structured ref that is unset is
        // ABSENT from the payload — writing null/''/'—' into a `type: object`
        // slot 422s. Absence is the true empty value for a ref; a cleared ref
        // must also delete any base-payload value at the same path.
        if (isEmptyRefFieldValue(value, node.attrs.widget)) {
          result = deleteValueAtPath(result, stripJsonPath(path));
          // Recursively process child nodes
          if (node.content && node.content.length > 0) {
            result = extractFieldRows(node.content, result);
          }
          continue;
        }
        // Use stripJsonPath to remove $. prefix, then set the value
        const cleanPath = stripJsonPath(path);
        // setValueAtPath returns a new object, so we need to capture it
        result = setValueAtPath(result, cleanPath, value);
      }
    }

    // Recursively process child nodes
    if (node.content && node.content.length > 0) {
      result = extractFieldRows(node.content, result);
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
    result = extractFieldRows(doc.content, result);
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
