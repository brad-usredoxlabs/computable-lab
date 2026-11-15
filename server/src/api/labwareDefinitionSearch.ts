/**
 * Labware-definition search — the single read path behind
 * POST /labware-definitions/search (and the Add-to-deck dialog's lab-db tier).
 *
 * Spec: "Definition-Driven Labware Placement — Kill the Legacy-Enum Collapse"
 * (decision 2). Two definition locations are searched and unioned:
 *   1. schema/registry/labware-definitions/ — vendored definitions (RegistryLoader).
 *   2. record-store `labware-definition` records (seeded + lab-authored).
 * Hits are deduped on definition `id`; the registry-dir copy wins (vendored
 * definitions are read_only). Hits carry topology/capacity/render_hints/
 * physical_geometry so the client can construct an editor instance with its
 * topology intact — no second fetch, no legacy-enum collapse.
 *
 * Tokenization folds `×`→x (glyph labels like "(5×16)" match "5x16") plus the
 * existing hyphen/underscore fold; every query token must appear.
 *
 * The response also reports `storeTier`: a search that could not read source 2
 * (not wired, or `list()` threw) says so, so a registry-only list is never
 * presented as the lab's whole answer. A failed source still leaves the
 * vendored tier rendering — degraded, and labelled as degraded.
 */
import { getLabwareDefinitionRegistry } from '../registry/LabwareDefinitionRegistry.js';
import { lookupLabwareClass } from '../resolve/bindings/labwareTypeBinding.js';
import type { RecordStore } from '../store/types.js';

export interface LabwareDefinitionSearchHit {
  recordId: string;
  label: string;
  kind: 'labware-definition';
  /** Canonical definition id (may differ from recordId for vendored copies). */
  definitionId?: string;
  topology?: {
    addressing: 'grid' | 'linear' | 'single';
    rows?: number;
    columns?: number;
    linear_count?: number;
    linear_axis?: string;
    row_pitch_mm?: number;
    col_pitch_mm?: number;
    well_pitch_mm?: number;
    orientation_default?: string;
    orientation_allowed?: string[];
  };
  capacity?: { max_well_volume_uL: number; min_working_volume_uL?: number };
  render_hints?: { profile?: string; linear_well_style?: string };
  physical_geometry?: { overall_dimensions_mm?: { length?: number; width?: number; height?: number } };
  legacy_labware_types?: string[];
  /**
   * Whether this hit may be offered as THIS LAB'S lab stock (placeable from a
   * picker). Read from the DATA, never a hardcoded id list: offerable only when
   * the recordId exists in the store's labware-definition records AND the entry
   * does not declare `offerable: false`. A registry-tier hit not store-backed is
   * a catalogue reference — still visible, but not the lab's stock. ABSENT on a
   * server that predates this marker.
   */
  offerable?: boolean;
  /** Present exactly when `offerable` is false — the declared reason. */
  offer_reason?: string;
  /**
   * Ontology class for this definition's labware type, mapped by the shipped
   * bindings file. ABSENT (not null, not '') when the data maps the type to
   * null or has no entry — a definition with no anchor shows no anchor.
   */
  lwoClass?: string;
}

export interface LabwareDefinitionSearchOptions {
  store?: Pick<RecordStore, 'list'> | null | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

/**
 * Whether source 2 (the record store) was actually read. Discriminated so
 * `reason` exists exactly when the status says the tier is unavailable —
 * exactOptionalPropertyTypes forbids building `{ status, reason: undefined }`.
 */
export type LabwareDefinitionStoreTier =
  | { status: 'searched' }
  | { status: 'unavailable'; reason: string };

export interface LabwareDefinitionSearchResult {
  hits: LabwareDefinitionSearchHit[];
  total: number;
  storeTier: LabwareDefinitionStoreTier;
}

/** The offerability decision: `offer_reason` is present exactly when
 *  `offerable` is false (never both, never neither). */
type Offerability =
  | { offerable: true }
  | { offerable: false; offer_reason: string };

const fold = (s: string): string =>
  s.toLowerCase().replace(/[×]/g, 'x').replace(/[-_]+/g, ' ');

/** Minimal structural shape we can read defensively from either source. */
interface DefinitionLike {
  id?: unknown;
  recordId?: unknown;
  display_name?: unknown;
  /** Declared on the entry itself (e.g. the vendored registry YAML). */
  offerable?: unknown;
  topology?: unknown;
  capacity?: unknown;
  render_hints?: unknown;
  physical_geometry?: unknown;
  legacy_labware_types?: unknown;
}

function toHit(
  def: DefinitionLike,
  fallbackRecordId?: string,
  offerability?: Offerability,
): LabwareDefinitionSearchHit | null {
  const id = typeof def.id === 'string' && def.id.length > 0 ? def.id : undefined;
  const displayName = typeof def.display_name === 'string' ? def.display_name : undefined;
  const recordId =
    typeof def.recordId === 'string' && def.recordId.length > 0
      ? def.recordId
      : fallbackRecordId ?? id;
  if (!recordId || !displayName) return null;
  const hit: LabwareDefinitionSearchHit = {
    recordId,
    label: displayName,
    kind: 'labware-definition',
  };
  // Carried only when the caller computed it (the search path always does);
  // `offer_reason` rides exactly on the false branch (exactOptionalPropertyTypes).
  if (offerability) {
    hit.offerable = offerability.offerable;
    if (!offerability.offerable) hit.offer_reason = offerability.offer_reason;
  }
  if (id) hit.definitionId = id;
  if (def.topology) hit.topology = def.topology as NonNullable<LabwareDefinitionSearchHit['topology']>;
  if (def.capacity) hit.capacity = def.capacity as NonNullable<LabwareDefinitionSearchHit['capacity']>;
  if (def.render_hints)
    hit.render_hints = def.render_hints as NonNullable<LabwareDefinitionSearchHit['render_hints']>;
  if (def.physical_geometry)
    hit.physical_geometry = def.physical_geometry as NonNullable<LabwareDefinitionSearchHit['physical_geometry']>;
  if (Array.isArray(def.legacy_labware_types))
    hit.legacy_labware_types = def.legacy_labware_types as string[];
  // Anchor the hit on the FIRST legacy type only; the mapping is data (see
  // config/ontology-bindings.yaml). A null/unknown mapping leaves the key
  // absent — exactOptionalPropertyTypes forbids assigning undefined/null here.
  const anchorType = Array.isArray(def.legacy_labware_types) ? def.legacy_labware_types[0] : undefined;
  if (typeof anchorType === 'string') {
    const binding = lookupLabwareClass(anchorType);
    if (binding?.lwoClass) hit.lwoClass = binding.lwoClass;
  }
  return hit;
}

export async function searchLabwareDefinitions(
  options: LabwareDefinitionSearchOptions,
): Promise<LabwareDefinitionSearchResult> {
  const rawQ = (options.q ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  // Source 1: vendored registry dir (preferred copy on id collision).
  const registryCandidates: DefinitionLike[] = getLabwareDefinitionRegistry().list() as unknown as DefinitionLike[];

  // Source 2: record-store labware-definition records (seeded + lab-authored).
  // Whether that source was actually read is part of the answer: a caller that
  // passes no store (or a store that throws) gets a named status, never a
  // registry-only list that reads as complete.
  let recordCandidates: DefinitionLike[] = [];
  let storeTier: LabwareDefinitionStoreTier;
  if (!options.store) {
    storeTier = { status: 'unavailable', reason: 'no-store' };
  } else {
    try {
      const envelopes = await options.store.list({ kind: 'labware-definition' });
      // THE ENVELOPE OWNS THE IDENTITY (fixed 2026-11-14, measured: the deck
      // picker offered ZERO definitions and told the person the lab holds none
      // of its 41 labware-definition records). `RecordEnvelope.recordId` is the
      // ONLY authoritative identity (types/RecordEnvelope.ts:41-46); a
      // labware-definition PAYLOAD carries `id` ("generic/96_well_plate@v1") and
      // no recordId at all. Mapping payloads only therefore built an EMPTY
      // membership set below, so every hit was flagged "no record in the lab
      // store" — a false claim about the lab, and the reason nothing could be
      // placed from the picker. Carry the envelope's recordId onto the candidate.
      recordCandidates = envelopes
        .map((env) => {
          const payload = (env.payload ?? {}) as Record<string, unknown>;
          const envelopeId = typeof env.recordId === 'string' ? env.recordId : '';
          // The envelope wins: a payload-borne recordId that disagrees is a data
          // defect, and silently preferring either would hide it.
          return { ...payload, recordId: envelopeId } as DefinitionLike;
        })
        .filter((p) => typeof p.recordId === 'string' && p.recordId.length > 0);
      storeTier = { status: 'searched' };
    } catch (error) {
      // A broken record store must not blank the vendored tier — but it must
      // not be silent either: the response reports the tier as unavailable.
      recordCandidates = [];
      const reason =
        error instanceof Error ? error.message || error.name : String(error);
      storeTier = { status: 'unavailable', reason };
    }
  }

  // The store's own membership — the single authority for "is this entry lab stock".
  const storeRecordIds = new Set<string>(
    recordCandidates
      .map((p) => (typeof p.recordId === 'string' && p.recordId.length > 0 ? p.recordId : ''))
      .filter((rid) => rid.length > 0),
  );

  // Dedupe on definition id, registry copy wins; keep insertion order stable
  // (registry first, then record-store-only ids in store order).
  const seen = new Set<string>();
  const union: DefinitionLike[] = [];
  for (const def of registryCandidates) {
    const id = typeof def.id === 'string' ? def.id : `record:${String(def.recordId ?? '')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    union.push(def);
  }
  for (const def of recordCandidates) {
    const id = typeof def.id === 'string' ? def.id : `record:${String(def.recordId ?? '')}`;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    union.push(def);
  }

  const tokens = rawQ ? fold(rawQ).split(/\s+/).filter(Boolean) : [];
  const matches = tokens.length === 0
    ? union
    : union.filter((def) => {
        const hay = fold(
          `${String(def.display_name ?? '')} ${String(def.id ?? '')} ${String(def.recordId ?? '')}`,
        );
        return tokens.every((t) => hay.includes(t));
      });

  const hits = matches
    .slice(0, limit)
    .map((def) => {
      // Offerability (unit offerfilter, L2-P1-SEED-ENTRY-1), read from the
      // DATA, never a hardcoded id/alias list: offerable only when the recordId
      // is in the store's labware-definition records AND the entry does not
      // declare `offerable: false`. Registry-only (no store record) hits are
      // still returned — the reference tier is never silently deleted — but
      // flagged non-offerable so pickers never present them as the lab's stock.
      const rid = typeof def.recordId === 'string' && def.recordId.length > 0 ? def.recordId : '';
      const declaredOff = def.offerable === false;
      const offerability: Offerability =
        rid.length > 0 && storeRecordIds.has(rid) && !declaredOff
          ? { offerable: true }
          : {
              offerable: false,
              offer_reason: declaredOff
                ? 'entry declares offerable: false (declared non-stock)'
                : 'registry entry with no record in the lab store (not lab stock)',
            };
      return toHit(def, undefined, offerability);
    })
    .filter((h): h is LabwareDefinitionSearchHit => h !== null);

  return { hits, total: matches.length, storeTier };
}
