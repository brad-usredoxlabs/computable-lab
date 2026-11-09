/**
 * The ONE place that decides which `details` field carries which layer of a
 * material reference — and which layers are already *well-ready*.
 *
 * Why this module exists (observed failure, 2026-09-20): two fields could claim
 * the same material. The repair path wrote a grounded pick into
 * `details.material_ref`, while the gate only trusted `material_spec_ref` /
 * `aliquot_ref` / `material_instance_ref` / `vendor_product_ref`. So a perfectly
 * grounded material-spec was re-asked for forever ("I need a volume and a
 * concentration for '1 mM Clofibrate in DMSO'" — a label that IS a
 * concentration), and with a small model that never re-emitted the preferred
 * shape the clarification looped unboundedly.
 *
 * A ref's `type` names its LAYER (material-spec, aliquot, …). A ref's `kind`
 * says how it is expressed (record / ontology / draft) — do not confuse them:
 * `{kind:'record', type:'material-spec'}` is a formulation; `{kind:'ontology'}`
 * is a concept someone recalled from memory.
 *
 * Layers are a provenance hierarchy (concept < formulation < instance < aliquot)
 * and must never be collapsed: a bare concept is NOT a formulation, and a
 * formulation is NOT an instance. Both the gate
 * (`forceMaterialClarifications`) and the writer (`materialBinding`) read this
 * table so they can never disagree again.
 */

/** The material layers an `add_material` reference can point at. */
export type MaterialLayer =
  | 'material'
  | 'material-spec'
  | 'material-instance'
  | 'aliquot'
  | 'vendor-product';

/** ref.type (or an explicit layer) → the canonical add_material details field. */
export const MATERIAL_LAYER_FIELD: Record<MaterialLayer, string> = {
  'material-spec': 'material_spec_ref',
  'material-instance': 'material_instance_ref',
  aliquot: 'aliquot_ref',
  'vendor-product': 'vendor_product_ref',
  material: 'material_ref',
};

/** Every details field that can carry a material reference, most specific first. */
export const MATERIAL_REF_FIELDS: readonly string[] = [
  'aliquot_ref',
  'material_spec_ref',
  'material_instance_ref',
  'vendor_product_ref',
  'material_ref',
];

/**
 * Layers that are already ready to go into a well: a formulation fixes its own
 * concentration, an instance/aliquot fixes a measured quantity, a vendor product
 * carries a catalog identity. A bare `material` concept is NOT in this list —
 * it still needs a quantity (which is what accept-time materialization needs).
 */
export const WELL_READY_LAYERS: readonly MaterialLayer[] = [
  'material-spec',
  'material-instance',
  'aliquot',
  'vendor-product',
];

/** Tolerate the spellings that appear in drafts/records (snake and plural). */
const LAYER_ALIASES: Record<string, MaterialLayer> = {
  material: 'material',
  concept: 'material',
  'material-spec': 'material-spec',
  material_spec: 'material-spec',
  materialspec: 'material-spec',
  formulation: 'material-spec',
  'material-instance': 'material-instance',
  material_instance: 'material-instance',
  materialinstance: 'material-instance',
  instance: 'material-instance',
  aliquot: 'aliquot',
  'aliquots': 'aliquot',
  'vendor-product': 'vendor-product',
  vendor_product: 'vendor-product',
  vendorproduct: 'vendor-product',
  'vendor': 'vendor-product',
};

/** Normalize any ref type / layer spelling to a known layer ('material' when unknown). */
export function materialLayerOf(value: unknown): MaterialLayer {
  if (typeof value !== 'string') return 'material';
  const key = value.trim().toLowerCase();
  return LAYER_ALIASES[key] ?? 'material';
}

export function isWellReadyLayer(layer: MaterialLayer): boolean {
  return WELL_READY_LAYERS.includes(layer);
}

/**
 * The layer a material ref names. Reads `type` first (the record type), then
 * falls back to an explicit `layer`. A `kind` of 'ontology' means someone
 * recalled a CURIE from memory — that is a *concept* claim, never a formulation,
 * so it resolves to the 'material' layer.
 */
export function materialLayerOfRef(ref: Record<string, unknown> | null | undefined): MaterialLayer {
  if (!ref || typeof ref !== 'object') return 'material';
  const kind = typeof ref.kind === 'string' ? ref.kind.trim().toLowerCase() : '';
  if (kind === 'ontology' || kind === 'draft' || kind === 'local') return 'material';
  if (typeof ref.layer === 'string' && !ref.type) return materialLayerOf(ref.layer);
  return materialLayerOf(ref.type);
}

/** The details field a given ref belongs in (defaults to the bare-concept field). */
export function canonicalMaterialField(ref: Record<string, unknown> | null | undefined): string {
  return MATERIAL_LAYER_FIELD[materialLayerOfRef(ref)];
}

/** True when a ref is a usable reference at all: it must name an id. */
export function hasRefId(ref: Record<string, unknown> | null | undefined): boolean {
  return !!ref && typeof ref === 'object' && typeof ref.id === 'string' && ref.id.trim().length > 0;
}

/**
 * Is this ref already well-ready (formulation / instance / aliquot / vendor)?
 * Requires an id — a layer claim with no identity grounds nothing.
 */
export function isWellReadyRef(ref: Record<string, unknown> | null | undefined): boolean {
  return hasRefId(ref) && isWellReadyLayer(materialLayerOfRef(ref));
}
