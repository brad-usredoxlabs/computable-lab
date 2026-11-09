/**
 * L2-TERM-1 fix-1 (UC-D4) — kindBadgeLabel tier-word pin.
 *
 * A kind='material' row in this picker is a workspace-LOCAL concept record
 * (apiClient.searchMaterials, category 'concept-only') — it must badge with
 * the shared vocabulary map's local tier word, never 'Ontology' (which the
 * resolver surface reserves for true ontology hits). Same entity, one local
 * term everywhere — the UC-D4 "two terms, one entity" contradiction is the
 * regression this pin guards.
 */
import { describe, expect, it } from 'vitest'
import { kindBadgeLabel } from './MaterialPicker'
import { VOCABULARY_BADGE } from '../../shared/taptab/slashMenu/tokens'

describe('kindBadgeLabel (L2-TERM-1 fix-1, UC-D4)', () => {
  it('a local concept row (kind "material") badges "Local" — never "Ontology"', () => {
    expect(kindBadgeLabel('material')).toBe('Local')
    expect(kindBadgeLabel('material')).not.toBe('Ontology')
  })

  it('reads the tier word from the shared map, not a re-spelled string', () => {
    expect(kindBadgeLabel('material')).toBe(VOCABULARY_BADGE.local)
    expect(kindBadgeLabel('material')).not.toBe(VOCABULARY_BADGE.ontology)
  })

  it('keeps the other kind labels unchanged', () => {
    expect(kindBadgeLabel('material-spec')).toBe('Saved Stock')
    expect(kindBadgeLabel('vendor-product')).toBe('Vendor Reagent')
    expect(kindBadgeLabel('material-instance')).toBe('Prepared Tube/Plate')
    expect(kindBadgeLabel('aliquot')).toBe('Prepared Tube/Plate')
    expect(kindBadgeLabel('term')).toBe('Term')
    expect(kindBadgeLabel(undefined)).toBe('Record')
    expect(kindBadgeLabel('some-other-kind')).toBe('some-other-kind')
  })
})
