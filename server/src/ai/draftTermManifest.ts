/**
 * The draft's TERM MANIFEST — what each term matched, and where it appeared.
 *
 * Brad's request (2026-09-20): under the proposal, a panel where the biologist can
 * see, per term, whether it matched a LOCAL term, an ONTOLOGY term or a VENDOR
 * item — then search, edit, accept, or clarify it. Nothing computed that before:
 * a draft's terms are spread across five ref fields and four kinds, so the client
 * had no way to say "this one is unmatched" without re-deriving the rules.
 *
 * This module is the single classification of that fact. It is pure: it reads the
 * draft's own events and the labware/equipment requirement arrays, and nothing else.
 *
 * It covers the three kinds a step can add:
 *   - MATERIAL terms (from event details refs) — local-record / ontology / vendor / minted
 *   - LABWARE terms (from labwareAdditions[] and labwareRequirements[])
 *   - EQUIPMENT terms (from equipmentRequirements[])
 * Each carries a `kind` so the review panel can group rows and scope its search to
 * the right resolver (material / labware / equipment).
 */

type Dict = Record<string, unknown>;

/** The five fields a material reference can arrive in. */
const MATERIAL_REF_FIELDS = [
  'material_spec_ref',
  'material_instance_ref',
  'aliquot_ref',
  'vendor_product_ref',
  'material_ref',
] as const;

export type TermSource = 'local-record' | 'ontology' | 'vendor-product' | 'minted';

export type TermKind = 'material' | 'labware' | 'equipment';

export interface DraftTermUse {
  /** The spelling the draft used. */
  label: string;
  source: TermSource;
  /** The id the draft referenced (record id, CURIE, mint id, catalog key). */
  id: string;
  /** Which details field carried it. */
  field: string;
  /** Which event (index into the draft's events). */
  eventIndex: number;
  kind: TermKind;
  vendor?: string;
  catalogNumber?: string;
}

/** The whole draft a manifest is built from (events + the requirement arrays). */
export interface DraftTermInput {
  events?: readonly unknown[];
  labwareRequirements?: ReadonlyArray<{ classCurie?: string; handle?: string; reason?: string }>;
  labwareAdditions?: ReadonlyArray<{ recordId?: string; reason?: string }>;
  equipmentRequirements?: ReadonlyArray<{ recordId?: string; classCurie?: string; handle?: string; reason?: string }>;
}

function asDict(value: unknown): Dict | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Dict) : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "PREFIX:rest" — an ontology-style identifier rather than a local record id. */
function isCurieShaped(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9]*:\S+$/.test(value) && !value.toLowerCase().startsWith('mint:');
}

function classify(field: string, ref: Dict): TermSource {
  const kind = asString(ref['kind']).toLowerCase();
  const id = asString(ref['id']);
  // `{mint:{label}}` carries neither kind nor id — the shape small models emit,
  // and missing it here would label an unmatched term as an existing record.
  if (kind === 'draft' || id.toLowerCase().startsWith('mint:') || asDict(ref['mint'])) return 'minted';
  if (field === 'vendor_product_ref' || asString(ref['vendor']) || asString(ref['catalogNumber'])) {
    return 'vendor-product';
  }
  if (kind === 'ontology' || isCurieShaped(id)) return 'ontology';
  return 'local-record';
}

function labelOf(ref: Dict): string {
  const mint = asDict(ref['mint']);
  const label = asString(ref['label']) || asString(ref['name']);
  if (label) return label;
  if (mint) return asString(mint['label']) || asString(mint['name']);
  const id = asString(ref['id']);
  return id.startsWith('mint:') ? id.slice('mint:'.length).trim() : id;
}

/**
 * Every term the draft uses, deduped by `label|source|kind` so a material going into
 * forty wells is ONE row in the panel (its wells are the draft's business, not the
 * term's). The `kind` is part of the key so a material and a labware that share a
 * label are NEVER collapsed — the provenance hierarchy must not be flattened.
 */
function isDraftTermInput(value: unknown): value is DraftTermInput {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export function draftTermManifest(input: DraftTermInput | readonly unknown[] | undefined): DraftTermUse[] {
  const source: DraftTermInput = isDraftTermInput(input)
    ? input
    : Array.isArray(input)
      ? { events: input }
      : {};
  const out: DraftTermUse[] = [];
  const seen = new Set<string>();
  if (Array.isArray(source.events)) {
    source.events.forEach((rawEvent, eventIndex) => {
      const event = asDict(rawEvent);
      const details = event ? asDict(event['details']) : null;
      if (!details) return;
      for (const field of MATERIAL_REF_FIELDS) {
        const ref = asDict(details[field]);
        if (!ref) continue;
        const label = labelOf(ref);
        const id = asString(ref['id']);
        if (!label && !id) continue;
        const termSource = classify(field, ref);
        const key = `${label}|${termSource}|${id}|material`;
        if (seen.has(key)) continue;
        seen.add(key);
        const vendor = asString(ref['vendor']) || asString(asDict(ref['mint'])?.['vendor']);
        const catalogNumber = asString(ref['catalogNumber']) || asString(ref['catalog_number']);
        out.push({
          label: label || id,
          source: termSource,
          id: id || label,
          field,
          eventIndex,
          kind: 'material',
          ...(vendor ? { vendor } : {}),
          ...(catalogNumber ? { catalogNumber } : {}),
        });
      }
    });
  }

  const pushReq = (row: Omit<DraftTermUse, 'eventIndex'> & { eventIndex?: number }) => {
    const key = `${row.label}|${row.source}|${row.id}|${row.kind}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ eventIndex: 0, ...row });
  };

  // Labware additions are concrete records the lab owns → local-record.
  for (const req of source.labwareAdditions ?? []) {
    const id = asString((req as Dict)['recordId']);
    if (!id) continue;
    pushReq({ label: id, source: 'local-record', id, field: 'labwareAdditions', kind: 'labware' });
  }

  // Labware requirements are requested classes (a definition), not yet inventory → ontology.
  for (const req of source.labwareRequirements ?? []) {
    const curie = asString((req as Dict)['classCurie']);
    if (!curie) continue;
    const label = asString((req as Dict)['handle']) || curie;
    pushReq({
      label,
      source: isCurieShaped(curie) ? 'ontology' : 'minted',
      id: curie,
      field: 'labwareRequirements',
      kind: 'labware',
    });
  }

  // Equipment with a recordId the lab owns → local-record; a generic classCurie → ontology.
  for (const req of source.equipmentRequirements ?? []) {
    const recordId = asString((req as Dict)['recordId']);
    const curie = asString((req as Dict)['classCurie']);
    const label = asString((req as Dict)['handle']) || recordId || curie;
    if (!recordId && !curie) continue;
    pushReq({
      label,
      source: recordId ? 'local-record' : isCurieShaped(curie) ? 'ontology' : 'minted',
      id: recordId || curie,
      field: 'equipmentRequirements',
      kind: 'equipment',
    });
  }

  return out;
}

/** The terms a draft proposes that the lab does not have yet (the panel's job list). */
export function proposedTerms(manifest: readonly DraftTermUse[]): DraftTermUse[] {
  return manifest.filter((term) => term.source === 'minted');
}
