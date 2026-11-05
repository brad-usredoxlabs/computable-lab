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
 */
import { getLabwareDefinitionRegistry } from '../registry/LabwareDefinitionRegistry.js';
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
}

export interface LabwareDefinitionSearchOptions {
  store?: Pick<RecordStore, 'list'> | null | undefined;
  q?: string | undefined;
  limit?: number | undefined;
}

const fold = (s: string): string =>
  s.toLowerCase().replace(/[×]/g, 'x').replace(/[-_]+/g, ' ');

/** Minimal structural shape we can read defensively from either source. */
interface DefinitionLike {
  id?: unknown;
  recordId?: unknown;
  display_name?: unknown;
  topology?: unknown;
  capacity?: unknown;
  render_hints?: unknown;
  physical_geometry?: unknown;
  legacy_labware_types?: unknown;
}

function toHit(def: DefinitionLike, fallbackRecordId?: string): LabwareDefinitionSearchHit | null {
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
  if (id) hit.definitionId = id;
  if (def.topology) hit.topology = def.topology as NonNullable<LabwareDefinitionSearchHit['topology']>;
  if (def.capacity) hit.capacity = def.capacity as NonNullable<LabwareDefinitionSearchHit['capacity']>;
  if (def.render_hints)
    hit.render_hints = def.render_hints as NonNullable<LabwareDefinitionSearchHit['render_hints']>;
  if (def.physical_geometry)
    hit.physical_geometry = def.physical_geometry as NonNullable<LabwareDefinitionSearchHit['physical_geometry']>;
  if (Array.isArray(def.legacy_labware_types))
    hit.legacy_labware_types = def.legacy_labware_types as string[];
  return hit;
}

export async function searchLabwareDefinitions(
  options: LabwareDefinitionSearchOptions,
): Promise<{ hits: LabwareDefinitionSearchHit[]; total: number }> {
  const rawQ = (options.q ?? '').trim().toLowerCase();
  const limit = Math.min(Math.max(options.limit ?? 12, 1), 50);

  // Source 1: vendored registry dir (preferred copy on id collision).
  const registryCandidates: DefinitionLike[] = getLabwareDefinitionRegistry().list() as unknown as DefinitionLike[];

  // Source 2: record-store labware-definition records (seeded + lab-authored).
  let recordCandidates: DefinitionLike[] = [];
  if (options.store) {
    try {
      const envelopes = await options.store.list({ kind: 'labware-definition' });
      recordCandidates = envelopes
        .map((env) => (env.payload ?? {}) as DefinitionLike)
        .filter((p) => p && typeof p === 'object');
    } catch {
      // A broken record store must not blank the vendored tier.
      recordCandidates = [];
    }
  }

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
    .map((def) => toHit(def))
    .filter((h): h is LabwareDefinitionSearchHit => h !== null);

  return { hits, total: matches.length };
}
