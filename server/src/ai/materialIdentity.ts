/**
 * "Which material is this?" must be asked ONCE per material, however many wells
 * or events the model used to say it.
 *
 * Brad's report (2026-09-20): he selected A2:H2 and typed "Add 100ul of 1mM
 * clofibrate to the selected wells." The model drafted one event per well, and
 * the gate asked a separate question for each — one offering to mint a
 * formulation for A2, others finding saved formulations for B2…H2 — and his
 * single answer bound only the first event.
 *
 * A range of wells receiving the same material is ONE lab act. To group them the
 * pipeline needs a stable *identity* for the material an event is talking about,
 * independent of how the ref happens to be shaped (a minted ref has no id; a
 * repaired ref is a clean record ref; sometimes the material is only in the
 * note). This module is that identity, and both the gate and the binding read it
 * so they can never disagree about what counts as "the same material".
 */

type Dict = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Normalize a name for comparison: case, whitespace, and trailing punctuation. */
export function normalizeMaterialName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.;,]+$/, '');
}

/** Every name a draft ref might be carrying (label, name, `mint:` id, nested mint). */
export function refNames(ref: Dict | null | undefined): string[] {
  if (!ref || typeof ref !== 'object') return [];
  const out: string[] = [];
  const push = (value: unknown) => {
    const text = asString(value);
    if (text) out.push(normalizeMaterialName(text));
  };
  push(ref.label);
  push(ref.name);
  const id = asString(ref.id);
  if (id.startsWith('mint:')) push(id.slice('mint:'.length));
  const mint = ref.mint;
  if (mint && typeof mint === 'object' && !Array.isArray(mint)) {
    push((mint as Dict).label);
    push((mint as Dict).name);
  }
  return [...new Set(out)];
}

/** Well tokens are positional, not part of the material's identity. */
function stripWellTokens(text: string): string {
  return text.replace(/\b[A-Ha-h](?:[1-9]|1[0-2])\b/g, ' ').replace(/\s+/g, ' ').trim();
}

const MATERIAL_REF_FIELDS = [
  'material_spec_ref',
  'material_instance_ref',
  'aliquot_ref',
  'vendor_product_ref',
  'material_ref',
] as const;

export interface EventMaterialIdentity {
  /** Group key: equal keys mean "the same material" for clarification purposes. */
  key: string;
  /** The most human label found (for the question), or ''. */
  label: string;
  /**
   * True when the event NAMES its material itself (a ref's label, a mint, …).
   *
   * Only an explicit signal may be used to fan an answer out across wells: a
   * selection does NOT imply that every well receives the same addition — a
   * "serial dilution down this column" is a range with the same material and a
   * DIFFERENT amount per well. The note/labware fallbacks exist to group the
   * QUESTION, never to extend an answer's reach.
   */
  explicit: boolean;
}

/**
 * The material identity of a drafted `add_material` event.
 *
 * Order: any ref's names (they are the most specific signal) → the event's note
 * with well tokens stripped (the "material only survives in a note" case) →
 * a labware-scoped fallback so several unnamed wells on the same plate still
 * group into ONE question.
 */
export function eventMaterialIdentity(event: Dict | null | undefined): EventMaterialIdentity {
  const details = (event && typeof event === 'object' ? (event.details as Dict) : null) ?? {};
  for (const field of MATERIAL_REF_FIELDS) {
    const ref = details[field];
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) continue;
    const names = refNames(ref as Dict);
    if (names.length > 0) return { key: names[0]!, label: names[0]!, explicit: true };
  }
  const note = stripWellTokens(asString(details.note));
  if (note) {
    const normalized = normalizeMaterialName(note);
    return { key: normalized, label: normalized, explicit: false };
  }
  const labwareId = asString(details.labwareId);
  return { key: labwareId ? `labware:${labwareId}` : 'unnamed', label: '', explicit: false };
}
