import { describe, expect, it } from 'vitest'
import { rankOntologyCandidates } from './useMaterialSearch'
import type { ResolveCandidate } from '../../shared/api/client'

function cand(label: string, score: number): ResolveCandidate {
  return { curie: `X:${label}`, label, namespace: 'CHEBI', tier: 3, level: 'concept', score, source: 'ols4' }
}

describe('rankOntologyCandidates', () => {
  it('puts the exact match first even when a derivative scored higher', () => {
    const out = rankOntologyCandidates(
      [cand('isopropanol dehydrogenase', 0.9), cand('isopropanol', 0.5), cand('isopropanolamine', 0.7)],
      'isopropanol',
    )
    expect(out.map((c) => c.label)[0]).toBe('isopropanol')
  })

  it('orders prefix matches by shortest label first', () => {
    const out = rankOntologyCandidates(
      [cand('isopropanol dehydrogenase', 0.9), cand('isopropanolamine', 0.9), cand('isopropanol', 0.1)],
      'isopropanol',
    )
    expect(out.map((c) => c.label)).toEqual(['isopropanol', 'isopropanolamine', 'isopropanol dehydrogenase'])
  })

  it('ranks exact > prefix > substring > other', () => {
    const out = rankOntologyCandidates(
      [
        cand('contains isopropanol somewhere', 0.9), // substring
        cand('propan-2-ol', 0.95),                   // other (synonym, no substring)
        cand('isopropanol stock', 0.2),              // prefix
        cand('isopropanol', 0.1),                    // exact
      ],
      'isopropanol',
    )
    expect(out.map((c) => c.label)).toEqual([
      'isopropanol',
      'isopropanol stock',
      'contains isopropanol somewhere',
      'propan-2-ol',
    ])
  })

  it('is case-insensitive for the exact/prefix test', () => {
    const out = rankOntologyCandidates([cand('Isopropanol dehydrogenase', 0.9), cand('Isopropanol', 0.1)], 'isopropanol')
    expect(out[0]!.label).toBe('Isopropanol')
  })
})
