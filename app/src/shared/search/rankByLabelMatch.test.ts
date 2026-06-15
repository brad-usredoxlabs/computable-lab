import { describe, expect, it } from 'vitest'
import { rankByLabelMatch, labelMatchTier } from './rankByLabelMatch'

describe('labelMatchTier', () => {
  it('classifies exact / prefix / substring / other (case-insensitive)', () => {
    expect(labelMatchTier('Isopropanol', 'isopropanol')).toBe(0)
    expect(labelMatchTier('isopropanol dehydrogenase', 'isopropanol')).toBe(1)
    expect(labelMatchTier('contains isopropanol here', 'isopropanol')).toBe(2)
    expect(labelMatchTier('propan-2-ol', 'isopropanol')).toBe(3)
    expect(labelMatchTier('anything', '')).toBe(3)
  })
})

describe('rankByLabelMatch', () => {
  it('ranks exact > prefix > substring > other, shortest first within a tier', () => {
    const items = [
      { label: 'isopropanol dehydrogenase' },
      { label: 'propan-2-ol' },
      { label: 'isopropanolamine' },
      { label: 'isopropanol' },
      { label: 'an isopropanol salt' },
    ]
    expect(rankByLabelMatch(items, (i) => i.label, 'isopropanol').map((i) => i.label)).toEqual([
      'isopropanol',                 // exact
      'isopropanolamine',            // prefix, len 16
      'isopropanol dehydrogenase',   // prefix, len 25
      'an isopropanol salt',         // substring
      'propan-2-ol',                 // other
    ])
  })

  it('is a stable sort — equal tier+length keeps input (score) order', () => {
    const items = [{ label: 'aaaa', id: 1 }, { label: 'bbbb', id: 2 }]
    expect(rankByLabelMatch(items, (i) => i.label, 'zzz').map((i) => i.id)).toEqual([1, 2])
  })
})
