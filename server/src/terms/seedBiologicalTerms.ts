/**
 * SeedBiologicalTerms — inclusive identity spine for biological types & culture
 * systems (Phase A1 of the biological-types plan).
 *
 * Idempotently ensures canonical `term` records for:
 *   - organism species (kind: organism, e.g. "C. elegans", "Mus musculus")
 *   - cell lines expressed as organism terms (kind: organism, domain: cell_line,
 *     e.g. "HepaRG")
 *   - organism strains (kind: organism, strain_of → species term) — the
 *     species→strain→substrain spine (D2)
 *   - culture conditions (kind: condition, e.g. "anoxic", "organ-on-a-chip")
 *
 * Each term resolves as its OWN referenceable TERM in the resolve spine's
 * tier-0 term provider. Re-running reuses existing terms (never duplicates).
 */
import type { RecordStore } from '../store/types.js';
import {
  ensureTermForLabel,
  TERM_SCHEMA_ID,
  type TermKind,
  type TermLinkout,
} from './EnsureTerm.js';

interface SpeciesSeed {
  label: string;
  aliases?: string[];
  curie?: string; // NCBITaxon CURIE for the ontology linkout
  domain?: string;
}

interface StrainSeed {
  label: string;
  strain: string;
  species: string; // species term label (must be seeded)
  aliases?: string[];
}

interface ConditionSeed {
  label: string;
  aliases?: string[];
}

/** Organism species (kind: organism). */
const SPECIES: SpeciesSeed[] = [
  { label: 'Caenorhabditis elegans', aliases: ['C. elegans', 'C elegans'], curie: 'NCBITaxon:6239' },
  { label: 'Mus musculus', aliases: ['mouse', 'house mouse'], curie: 'NCBITaxon:10090' },
  { label: 'Saccharomyces cerevisiae', aliases: ['yeast', 'S. cerevisiae', 'baker\'s yeast'], curie: 'NCBITaxon:4932' },
  { label: 'Escherichia coli', aliases: ['E. coli', 'E coli'], curie: 'NCBITaxon:562' },
];

/** Cell lines expressed as organism terms (domain: cell_line). */
const CELL_LINES: SpeciesSeed[] = [
  { label: 'HepaRG', aliases: ['HepaRG cell', 'HepaRG cells'], curie: 'CLO:0020273', domain: 'cell_line' },
];

/** Organism strains, each strain_of its species term (D2 two-level identity). */
const STRAINS: StrainSeed[] = [
  { label: 'C. elegans N2', strain: 'N2', species: 'Caenorhabditis elegans', aliases: ['N2', 'wild-type N2'] },
  { label: 'C57BL/6J', strain: 'C57BL/6J', species: 'Mus musculus', aliases: ['C57BL/6J mouse', 'B6'] },
  { label: 'BALB/c', strain: 'BALB/c', species: 'Mus musculus', aliases: ['BALB/c mouse'] },
  { label: 'NOD', strain: 'NOD', species: 'Mus musculus', aliases: ['NOD mouse', 'NOD/ShiLtJ'] },
  { label: 'E. coli K-12', strain: 'K-12', species: 'Escherichia coli', aliases: ['K-12', 'E. coli K12'] },
  { label: 'E. coli BL21', strain: 'BL21', species: 'Escherichia coli', aliases: ['BL21', 'BL21(DE3)'] },
];

/** Culture systems / conditions (kind: condition), ORTHOGONAL to type. */
const CONDITIONS: ConditionSeed[] = [
  { label: 'anoxic', aliases: ['anoxia', 'anaerobic'] },
  { label: 'hypoxic', aliases: ['hypoxia', 'low-oxygen'] },
  { label: 'hyperoxic', aliases: ['hyperoxia', 'high-oxygen'] },
  { label: 'tissue-culture-in-a-tube', aliases: ['tube culture', 'TC in a tube'] },
  { label: 'organ-on-a-chip', aliases: ['OoC', 'organ chip', 'microfluidic tissue culture'] },
  { label: '2D-plate', aliases: ['2D culture', 'monolayer plate', 'standard culture'] },
  { label: 'spheroid', aliases: ['3D spheroid', 'spheroid culture'] },
  { label: 'low-saline', aliases: ['hypotonic', 'low salt'] },
  { label: 'high-saline', aliases: ['hypertonic', 'high salt'] },
  { label: 'low-temp', aliases: ['cold', 'refrigerated culture'] },
  { label: 'high-temp', aliases: ['heat stress', 'elevated temperature'] },
  { label: 'high-microplastics', aliases: ['microplastic exposure', 'microplastics stressor'] },
];

function ncbiLinkout(curie: string): TermLinkout {
  const namespace = curie.split(':')[0];
  return {
    kind: 'ontology',
    curie,
    ...(namespace ? { namespace } : {}),
    label: curie,
  };
}

export interface SeedResult {
  terms: number; // species + cell lines minted
  strains: number;
  conditions: number;
  /** speciesTermLabel → term id, so callers can build strain_of refs. */
  speciesTerms: Map<string, string>;
}

async function countNewTermIds(store: RecordStore): Promise<Set<string>> {
  const preExisting = await store.list({ schemaId: TERM_SCHEMA_ID });
  return new Set(preExisting.map((e) => e.recordId));
}

/**
 * Seed the inclusive biology identity spine. Idempotent: re-running reuses the
 * same terms (ensureTermForLabel dedups by normalized alias).
 */
export async function seedBiologicalTerms(store: RecordStore): Promise<SeedResult> {
  const preIds = await countNewTermIds(store);
  const result: SeedResult = { terms: 0, strains: 0, conditions: 0, speciesTerms: new Map() };

  const mintSpecies = async (seed: SpeciesSeed): Promise<string> => {
    const kind: TermKind = 'organism';
    const env = await ensureTermForLabel(store, seed.label, kind, {
      source: 'human',
      ...(seed.aliases && seed.aliases.length > 0 ? { aliases: seed.aliases } : {}),
      ...(seed.curie ? { linkouts: [ncbiLinkout(seed.curie)] } : {}),
      ...(seed.domain ? { domain: seed.domain } : {}),
    });
    return env.recordId;
  };

  // Species + cell lines first so strains can reference them.
  for (const sp of [...SPECIES, ...CELL_LINES]) {
    const termId = await mintSpecies(sp);
    result.speciesTerms.set(sp.label, termId);
    if (!preIds.has(termId)) result.terms += 1;
  }

  // Strains: kind organism + strain_of → species term ref.
  for (const st of STRAINS) {
    const speciesTermId = result.speciesTerms.get(st.species);
    if (!speciesTermId) continue;
    const env = await ensureTermForLabel(store, st.label, 'organism', {
      source: 'human',
      ...(st.aliases && st.aliases.length > 0 ? { aliases: st.aliases } : {}),
      strain: st.strain,
      strain_of: { kind: 'record', id: speciesTermId, type: 'term', label: st.species },
    });
    if (!preIds.has(env.recordId)) result.strains += 1;
  }

  // Conditions: kind condition.
  for (const c of CONDITIONS) {
    const env = await ensureTermForLabel(store, c.label, 'condition', {
      source: 'human',
      ...(c.aliases && c.aliases.length > 0 ? { aliases: c.aliases } : {}),
    });
    if (!preIds.has(env.recordId)) result.conditions += 1;
  }

  return result;
}