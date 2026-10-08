import type { LabwareCategory } from '../../types/labware'

/**
 * Pure model for the unified "Add to deck" dialog.
 *
 * Splits the static labware catalog into a `plates` tab (there are a dozen-plus
 * plate types) and a `labware` tab (tubes, reservoirs, tip racks, glassware),
 * then merges cross-source search hits (catalog defaults + lab-definitions
 * first, then Exa vendor hits, then ontology/resolve hits) in a stable order.
 */

export type AddDeckTab = 'plates' | 'labware' | 'equipment'

/**
 * Tokenize a deck-search query like the backend does
 * (server/src/api/labwareDefinitionSearch.ts fold + every): lowercase, fold the
 * × glyph to x and word-joining punctuation (`-`, `_`, en/em dash) to spaces,
 * split on whitespace. Catalog labels use the glyph ("(5×16)") and compound
 * words ("80-Tube", "Bench Rack —"); a raw substring match on the user's
 * "5x16" / "tube rack" would hide the most common bench rack (spec decision 4).
 */
export function tokenizeLabwareQuery(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[×]/g, 'x')
    .replace(/[-_–—]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

/** True when every query token appears in the label (empty query matches all). */
export function labwareRowMatches(query: string, label: string): boolean {
  const tokens = tokenizeLabwareQuery(query)
  if (tokens.length === 0) return true
  const hay = tokenizeLabwareQuery(label).join(' ')
  return tokens.every((token) => hay.includes(token))
}

export interface AddDeckSourceItem {
  /** Stable key for dedupe across sources. */
  key: string
  source: 'catalog' | 'lab-db' | 'exa' | 'ontology'
  label: string
  kind: 'labware' | 'instrument'
}

/** Plates get their own tab because there are far more plate types than any
 *  other labware family; everything else (reservoirs/tubes/tip racks/glassware)
 *  lives on the `labware` tab. `instrument` is never plate — see below for the
 *  equipment routing. */
export function isPlateCategory(cat: LabwareCategory): boolean {
  return cat === 'plate'
}

/** Reorder cross-source hits: catalog + lab-db ("defaults and what the lab
 *  has") first, then exa, then ontology. Within a tier, keep input order.
 *  Dedupe by `key`, keeping the first (highest-priority) occurrence. */
export function mergeAndRankDeckSources(bundles: {
  catalog: AddDeckSourceItem[]
  labDb: AddDeckSourceItem[]
  exa: AddDeckSourceItem[]
  ontology: AddDeckSourceItem[]
}): AddDeckSourceItem[] {
  const seen = new Set<string>()
  const out: AddDeckSourceItem[] = []
  for (const list of [bundles.catalog, bundles.labDb, bundles.exa, bundles.ontology]) {
    for (const item of list) {
      if (seen.has(item.key)) continue
      seen.add(item.key)
      out.push(item)
    }
  }
  return out
}

/** Which tabs offer which kinds of row. Equipment rows are `instrument`-kind;
 *  plate/labware rows are `labware`-kind. */
export const TAB_KINDS: Record<AddDeckTab, 'labware' | 'instrument'> = {
  plates: 'labware',
  labware: 'labware',
  equipment: 'instrument',
}