/**
 * Recover what an invented field legitimately carries.
 *
 * Models habitually wrap material data in a top-level `materials: [...]` array
 * that no schema accepts (observed 2026-09-20, every run):
 *
 *   { "verb": "add_material",
 *     "details": { "wells": [...], "material_ref": { "kind": "local", "label": "HepG2 cells" } },
 *     "materials": [ { "slot": "target", "role": "cells", "count": 10000,
 *                      "ref": { "mint": { "label": "HepG2 cells", "domain": "cell_line" } } } ] }
 *
 * Naming the field (draftArgDiagnostics) tells the biologist something was
 * dropped, but dropping is the real damage: the DOSE lived in there. With the
 * count lost, a named concept looked quantity-less and the harness asked the
 * biologist for "a volume and a concentration" they had already given as
 * "10,000 cells".
 *
 * So: the canonical field name is not negotiable, but the CONTENT is real. Move
 * what the invented field carries into the canonical place, keep the minted
 * reference a mint (so the identity question still gets asked), and say so.
 */
type Dict = Record<string, unknown>;

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Canonical per-event quantity keys, with the invented-field aliases that feed them. */
const QUANTITY_KEYS = ['count', 'volume', 'concentration', 'concentration_range', 'composition_snapshot'] as const;

/** Is this value a real quantity (not an empty placeholder)? */
function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value as Dict).length > 0;
  return true;
}

/** Normalize an invented entry's ref into the canonical material_ref shape. */
function canonicalRefFromEntry(entry: Dict): Dict | null {
  const ref = asDict(entry['ref']) ?? asDict(entry['material_ref']) ?? null;
  const curie = asString(entry['curie']) || asString(entry['ontologyId']);
  if (!ref) {
    if (curie) return { kind: 'ontology', id: curie };
    return null;
  }
  const mint = asDict(ref['mint']);
  if (mint) {
    const label = asString(mint['label']) || asString(mint['name']);
    if (!label) return null;
    // Keep the canonical minted form the rest of the pipeline understands
    // (`kind: draft`, `mint:<label>`), so the identity question is still asked.
    const out: Dict = { kind: 'draft', id: `mint:${label}`, label };
    const domain = asString(mint['domain']);
    if (domain) out['domain'] = domain;
    return out;
  }
  const id = asString(ref['id']) || asString(ref['curie']);
  if (id) {
    return {
      kind: asString(ref['kind']) || (id.includes(':') ? 'ontology' : 'record'),
      id,
      ...(asString(ref['label']) ? { label: asString(ref['label']) } : {}),
    };
  }
  return null;
}

export interface InventedFieldRecovery {
  events: unknown[];
  notes: string[];
}

/**
 * Move count/volume/concentration and the material reference out of an invented
 * `materials: [...]` array (top-level or inside `details`) into the event's
 * canonical `details`. Never overwrites a value the draft already declares.
 */
export function recoverInventedMaterialFields<T>(events: readonly T[]): InventedFieldRecovery {
  const notes: string[] = [];
  const out = events.map((ev) => {
    const e = asDict(ev);
    if (!e) return ev;
    const details = asDict(e['details']);
    if (!details) return ev;
    const invented = Array.isArray(e['materials'])
      ? (e['materials'] as unknown[])
      : Array.isArray(details['materials'])
        ? (details['materials'] as unknown[])
        : [];
    if (invented.length === 0) return ev;

    const next: Dict = { ...details };
    const recovered: string[] = [];
    for (const raw of invented) {
      const entry = asDict(raw);
      if (!entry) continue;
      for (const key of QUANTITY_KEYS) {
        if (hasValue(next[key])) continue;
        const value = entry[key];
        if (hasValue(value)) {
          next[key] = value;
          recovered.push(`${key} ${JSON.stringify(value)}`);
        }
      }
      const ref = canonicalRefFromEntry(entry);
      if (ref) {
        const existingField = ['material_ref', 'material_spec_ref', 'material_instance_ref', 'aliquot_ref', 'vendor_product_ref']
          .find((field) => hasValue(next[field]));
        if (!existingField) {
          next['material_ref'] = ref;
          recovered.push(`material ${asString(ref['label']) || asString(ref['id'])}`);
        } else {
          // Never overwrite what the draft itself declared — but FILL IN what the
          // declared ref lacks. `domain` is the important one: it selects the
          // per-type material rules (a cell_line concept owes a count, not a
          // concentration), and the model often states it only in the invented
          // field (observed: `domain: "cell_line"` alongside `kind: "local"`).
          const existing = asDict(next[existingField]);
          if (existing) {
            const filled: Dict = { ...existing };
            for (const key of ['domain', 'id', 'type'] as const) {
              if (!hasValue(filled[key]) && hasValue(ref[key])) filled[key] = ref[key];
            }
            if (Object.keys(filled).length !== Object.keys(existing).length) {
              next[existingField] = filled;
              recovered.push(`${existingField} gained ${Object.keys(filled).filter((k) => !(k in existing)).join(', ')}`);
            }
          }
        }
      }
    }
    if (recovered.length === 0) return ev;
    notes.push(
      `I read the material data from the \`materials\` field the model invented (${recovered.join(', ')}) ` +
        'and applied it to the event’s own details.',
    );
    return { ...e, details: next } as T;
  });
  return { events: out, notes };
}
