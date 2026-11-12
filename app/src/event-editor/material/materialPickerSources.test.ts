// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { isOntologyPickerCandidate } from './useMaterialSearch'
import type { ResolveCandidate } from '../../shared/api/client'

function cand(curie: string, source: ResolveCandidate['source']): ResolveCandidate {
  return { curie, label: 'plate', namespace: 'LWO', tier: 3, level: 'concept', score: 0.9, source }
}

describe('isOntologyPickerCandidate', () => {
  it('keeps a local-obo row that carries a CURIE (on-box local-ontology tier)', () => {
    expect(isOntologyPickerCandidate(cand('LWO:0000100', 'local-obo'))).toBe(true)
  })

  it('keeps oak and ols4 rows with a CURIE (existing behaviour must not regress)', () => {
    expect(isOntologyPickerCandidate(cand('CHEBI:16236', 'oak'))).toBe(true)
    expect(isOntologyPickerCandidate(cand('X:1', 'ols4'))).toBe(true)
  })

  it('drops a local-obo row without a CURIE (the CURIE requirement survives)', () => {
    expect(isOntologyPickerCandidate(cand('', 'local-obo'))).toBe(false)
  })

  it('drops a local-record row even with a CURIE (local rows stay in their own section, not duplicated)', () => {
    expect(isOntologyPickerCandidate(cand('local:MAT-1', 'local-record'))).toBe(false)
  })
})
