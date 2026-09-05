import { describe, expect, it } from 'vitest'
import { visibleConceptMatches } from './MaterialPicker'
import type { MaterialSearchItem } from '../../shared/api/client'

function concept(recordId: string, title: string): MaterialSearchItem {
  return { recordId, kind: 'material', title, category: 'concept-only', subtitle: '' }
}

describe('visibleConceptMatches (local concept gating)', () => {
  const hepa = concept('MAT-heparg-cell-bsz7', 'HepaRG cell')
  const hepaPartial = concept('MAT-hepa2', 'HepaRG 2.0 timer')
  const dmso = concept('MAT-dmso', 'DMSO')

  it('always surfaces an exact-name local concept match even when ontology/higher-value results exist', () => {
    // The regression: searching "HepaRG" should show the just-created local record
    // even though the ontology resolver also returns remote HepaRG hits.
    const result = visibleConceptMatches([hepa, dmso], 'HepaRG', {
      showConcepts: false,
      hasHigherValueResults: true, // e.g. olsResults.length > 0
    })
    expect(result.map((r) => r.recordId)).toEqual(['MAT-heparg-cell-bsz7'])
  })

  it('matches a local concept by recordId substring (lowercase) even when the title differs', () => {
    const result = visibleConceptMatches([hepa], 'heparg', {
      showConcepts: false,
      hasHigherValueResults: true,
    })
    expect(result.map((r) => r.recordId)).toEqual(['MAT-heparg-cell-bsz7'])
  })

  it('collapses weak/partial concept matches when higher-value results exist', () => {
    const result = visibleConceptMatches([hepaPartial, dmso], 'HepaRG', {
      showConcepts: false,
      hasHigherValueResults: true,
    })
    expect(result).toEqual([])
  })

  it('shows weak concept matches when nothing higher-value exists', () => {
    const result = visibleConceptMatches([hepaPartial, dmso], 'HepaRG', {
      showConcepts: false,
      hasHigherValueResults: false, // no formulations/vendor/ontology hits
    })
    expect(result.map((r) => r.recordId)).toEqual(['MAT-hepa2', 'MAT-dmso'])
  })

  it('honours an explicit showConcepts expand', () => {
    const result = visibleConceptMatches([hepaPartial, dmso], 'HepaRG', {
      showConcepts: true,
      hasHigherValueResults: true,
    })
    expect(result.map((r) => r.recordId)).toEqual(['MAT-hepa2', 'MAT-dmso'])
  })
})