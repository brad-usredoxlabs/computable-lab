/**
 * QMS-6E D3b — the ref value-emission contract.
 * EDITOR-9 — the same contract generalized to every widget on the save path.
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
const REF_VALUE_WIDGETS = new Set(['ref', 'record-ref'])

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

/**
 * Widget types whose stored value is a composite container (array/object).
 * For these, an EMPTY container is a real value — an emptied list is the
 * user's intent, not an unset slot — so it must NOT be omitted.
 */
const COMPOSITE_VALUE_WIDGETS = new Set(['array', 'reflist', 'multiselect', 'chips', 'object'])

/** True when the widget's stored value is a composite container. */
export function isCompositeValueWidget(widget: unknown): boolean {
  return typeof widget === 'string' && COMPOSITE_VALUE_WIDGETS.has(widget)
}

/**
 * EDITOR-9 — the ONE shared omission decision for the save serializer.
 *
 * The backend enforces exactOptionalPropertyTypes: a slot declared optional
 * is valid when it is ABSENT or holds a value of the declared type — never
 * `''` or `null`. The editor's widgets carry "no value" as null (FieldRow's
 * attr default, an untouched slot) or as `''` (a cleared text/number/date
 * input). Writing either into the payload 422s with
 * "Expected type: string" (Brad's person save: /organizationId, /contact/phone)
 * or "Expected type: array" for a container slot.
 *
 * So: a widget holding its unset value (null/undefined — any widget, since
 * TipTap fills absent attrs with the node default null) emits NOTHING, and a
 * scalar holding `''` emits NOTHING. The serializer omits the path and deletes
 * any stale base-payload value there. Composite containers keep their EMPTY
 * value (`[]`, `{}`) — an emptied list is the user's intent, not an unset
 * slot. `false` and `0` are values, not empties. A REQUIRED field left empty
 * is omitted too: the server's required-check is the correct, desired
 * validation error — the client must not fabricate a requiredness check.
 */
export function isEmptyFieldValue(value: unknown, widget: unknown): boolean {
  if (value === null || value === undefined) return true
  if (isRefWidget(widget)) return isDisplayOnlyRefValue(value)
  if (isCompositeValueWidget(widget)) return false
  return value === ''
}
