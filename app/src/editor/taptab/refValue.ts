/**
 * QMS-6E D3b — the ref value-emission contract.
 *
 * Ref-typed fields (`ref` widget) carry structured ref objects (datatypes/
 * ref.schema.yaml: `type: object`) or are ABSENT from the payload. A display
 * placeholder must never exist as a field VALUE, and a "cleared/never-set"
 * ref must not be written as a typed empty (`null`, `''`) — the strict server
 * schema rejects both with 422 "Expected type: object" (QMS-6B attempt-8
 * receipt, api/a-save-payload-replays.txt (b)).
 *
 * This module is the single source of truth used by the value-emission
 * boundary (FieldRow commit, projection document mapper) and the serializer:
 *   - the widget boundary normalizes a committed empty/placeholder ref to
 *     `null` ("no value"), never a glyph;
 *   - the serializer OMITS a ref field whose value is the true empty —
 *     absence is the true empty value for a ref.
 */

/** Widget types whose stored value is a structured ref (schema type: object). */
const REF_VALUE_WIDGETS = new Set(['ref'])

/** True when the widget's stored value must follow the ref value contract. */
export function isRefWidget(widget: unknown): boolean {
  return typeof widget === 'string' && REF_VALUE_WIDGETS.has(widget)
}

/**
 * Dash/whitespace-only strings are display decoration ('—' and friends), never
 * record values. Anything with real content — including a label that merely
 * starts with a dash separator — is kept.
 */
export function isDisplayOnlyRefValue(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return value.trim().length === 0 || /^[-\u2013\u2014]+$/.test(value.trim())
}

/**
 * Normalize a value committed by a ref widget to its TRUE form.
 * - placeholder/empty strings → null (the true empty; serializer omits it)
 * - null/undefined → null (unchanged semantics: "no value")
 * - anything else (structured ref, real string) passes through untouched
 * - non-ref widgets are returned unchanged (their empties are their own business)
 */
export function normalizeRefFieldValue(value: unknown, widget: unknown): unknown {
  if (!isRefWidget(widget)) return value
  if (value === null || value === undefined) return null
  if (isDisplayOnlyRefValue(value)) return null
  return value
}

/**
 * True when a ref-field's value represents "no value" and the field must be
 * ABSENT from the write payload (absence, not a typed empty, is the true
 * empty for a structured ref).
 */
export function isEmptyRefFieldValue(value: unknown, widget: unknown): boolean {
  return isRefWidget(widget) && (value === null || value === undefined || isDisplayOnlyRefValue(value))
}
