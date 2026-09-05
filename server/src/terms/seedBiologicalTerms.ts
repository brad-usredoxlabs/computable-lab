/**
 * SeedBiologicalTerms — inclusive identity spine for biological types & culture
 * systems (Phase A1 of the biological-types plan).
 *
 * The lab's organism / strain / culture-condition VOCABULARY is declared in
 * schema/registry/biological-types/biological-types.yaml (DATA, single source
 * of truth). This module ONLY materializes those declarations as canonical
 * `term` records — it decides nothing; it conforms data to the term schema.
 *
 * Each term resolves as its OWN referenceable TERM in the resolve spine's
 * tier-0 term provider. Re-running reuses existing terms (idempotent).
 */
import type { RecordStore } from '../store/types.js';
import {
  ensureTermForLabel,
  TERM_SCHEMA_ID,
} from './EnsureTerm.js';
import {
  loadDefaultBiologicalTypesRegistry,
  type BiologicalTypesRegistry,
  type BiologicalOrganismSeed,
} from '../ontology/biologicalTypes.js';

export interface SeedResult {
  terms: number; // species + cell lines minted
  strains: number;
  conditions: number;
  /** speciesTermLabel → term id, so strains can reference their species. */
  speciesTerms: Map<string, string>;
}

async function countNewTermIds(store: RecordStore): Promise<Set<string>> {
  const preExisting = await store.list({ schemaId: TERM_SCHEMA_ID });
  return new Set(preExisting.map((e) => e.recordId));
}

function ensureSpecies(store: RecordStore, seed: BiologicalOrganismSeed, preIds: Set<string>, result: SeedResult): Promise<string> {
  const namespace = seed.curie?.split(':')[0];
  return ensureTermForLabel(store, seed.label, 'organism', {
    source: 'human',
    ...(seed.aliases.length > 0 ? { aliases: seed.aliases } : {}),
    ...(seed.curie
      ? { linkouts: [{ kind: 'ontology', curie: seed.curie, ...(namespace ? { namespace } : {}), label: seed.curie }] }
      : {}),
    ...(seed.domain ? { domain: seed.domain } : {}),
  }).then((env) => {
    if (!preIds.has(env.recordId)) result.terms += 1;
    return env.recordId;
  });
}

/**
 * Seed the inclusive biology identity spine from the declarative registry.
 * Idempotent: re-running reuses existing terms (ensureTermForLabel dedups by
 * normalized alias, and the deterministic TERM id matches the registry's).
 */
export async function seedBiologicalTerms(
  store: RecordStore,
  schemaDir: string,
): Promise<SeedResult> {
  const registry = loadDefaultBiologicalTypesRegistry(schemaDir);
  return seedBiologicalTermsFromRegistry(store, registry);
}

/** Pure seeding path from an already-loaded registry (used by tests). */
export async function seedBiologicalTermsFromRegistry(
  store: RecordStore,
  registry: BiologicalTypesRegistry,
): Promise<SeedResult> {
  const preIds = await countNewTermIds(store);
  const result: SeedResult = { terms: 0, strains: 0, conditions: 0, speciesTerms: new Map() };

  // Species + cell lines first so strains can reference them.
  const organisms = registry.organisms();
  const strains = registry.strains();
  const conditions = registry.conditions();
  for (const seed of organisms) {
    const termId = await ensureSpecies(store, seed, preIds, result);
    result.speciesTerms.set(seed.label, termId);
  }

  // Strains: kind organism + strain_of → species term ref.
  for (const st of strains) {
    const speciesTermId = result.speciesTerms.get(st.species);
    if (!speciesTermId) continue;
    const env = await ensureTermForLabel(store, st.label, 'organism', {
      source: 'human',
      ...(st.aliases.length > 0 ? { aliases: st.aliases } : {}),
      strain: st.strain,
      strain_of: { kind: 'record', id: speciesTermId, type: 'term', label: st.species },
    });
    if (!preIds.has(env.recordId)) result.strains += 1;
  }

  // Conditions: kind condition.
  for (const c of conditions) {
    const env = await ensureTermForLabel(store, c.label, 'condition', {
      source: 'human',
      ...(c.aliases.length > 0 ? { aliases: c.aliases } : {}),
    });
    if (!preIds.has(env.recordId)) result.conditions += 1;
  }

  return result;
}