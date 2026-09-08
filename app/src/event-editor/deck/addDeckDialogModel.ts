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