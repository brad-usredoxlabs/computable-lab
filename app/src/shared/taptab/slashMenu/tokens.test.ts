import { describe, expect, it } from 'vitest'
import { mentionToToken, mentionBadge, badgeStyles } from './tokens'
import type { SlashMention } from './types'

describe('mentionToToken', () => {
  it('material', () => {
    const m: SlashMention = {
      type: 'material',
      entityKind: 'material',
      id: 'MAT-1',
      label: 'Tris',
    }
    expect(mentionToToken(m)).toBe('[[material:MAT-1|Tris]]')
  })

  it('material-spec', () => {
    const m: SlashMention = {
      type: 'material',
      entityKind: 'material-spec',
      id: 'spec-1',
      label: 'Buffer mix',
    }
    expect(mentionToToken(m)).toBe('[[material-spec:spec-1|Buffer mix]]')
  })

  it('aliquot', () => {
    const m: SlashMention = {
      type: 'material',
      entityKind: 'aliquot',
      id: 'aliq-1',
      label: 'Stock A',
    }
    expect(mentionToToken(m)).toBe('[[aliquot:aliq-1|Stock A]]')
  })

  it('material-instance', () => {
    const m: SlashMention = {
      type: 'material',
      entityKind: 'material-instance',
      id: 'MINST-1',
      label: 'HepG2 P12',
    }
    expect(mentionToToken(m)).toBe('[[material-instance:MINST-1|HepG2 P12]]')
  })

  it('vendor-product', () => {
    const m: SlashMention = {
      type: 'material',
      entityKind: 'vendor-product',
      id: 'VP-1',
      label: 'CellROX Deep Red',
    }
    expect(mentionToToken(m)).toBe('[[vendor-product:VP-1|CellROX Deep Red]]')
  })

  it('labware', () => {
    const m: SlashMention = { type: 'labware', id: 'lbw-1', label: '96 well' }
    expect(mentionToToken(m)).toBe('[[labware:lbw-1|96 well]]')
  })

  it('equipment', () => {
    const m: SlashMention = { type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' }
    expect(mentionToToken(m)).toBe('[[equipment:EQP-CENTRIFUGE|Benchtop centrifuge]]')
  })

  it('protocol', () => {
    const m: SlashMention = {
      type: 'protocol',
      entityKind: 'protocol',
      id: 'PROT-1',
      label: 'qPCR',
    }
    expect(mentionToToken(m)).toBe('[[protocol:PROT-1|qPCR]]')
  })

  it('graph-component', () => {
    const m: SlashMention = {
      type: 'protocol',
      entityKind: 'graph-component',
      id: 'GC-1',
      label: 'Plate read',
    }
    expect(mentionToToken(m)).toBe('[[graph-component:GC-1|Plate read]]')
  })

  it('source selection', () => {
    const m: SlashMention = {
      type: 'selection',
      selectionKind: 'source',
      labwareId: 'lbw-1',
      wells: ['A1', 'A2', 'A3'],
      label: 'Source plate A1-A3',
    }
    expect(mentionToToken(m)).toBe(
      '[[selection:source|lbw-1|A1,A2,A3|Source plate A1-A3]]',
    )
  })

  it('target with empty wells', () => {
    const m: SlashMention = {
      type: 'selection',
      selectionKind: 'target',
      labwareId: 'lbw-2',
      wells: [],
      label: 'Empty',
    }
    expect(mentionToToken(m)).toBe('[[selection:target|lbw-2||Empty]]')
  })
})

describe('mentionBadge', () => {
  it('material → Concept', () => {
    expect(
      mentionBadge({ type: 'material', entityKind: 'material', id: 'x', label: 'x' }),
    ).toBe('Concept')
  })
  it('material-spec → Formulation', () => {
    expect(
      mentionBadge({
        type: 'material',
        entityKind: 'material-spec',
        id: 'x',
        label: 'x',
      }),
    ).toBe('Formulation')
  })
  it('aliquot → Instance', () => {
    expect(
      mentionBadge({ type: 'material', entityKind: 'aliquot', id: 'x', label: 'x' }),
    ).toBe('Instance')
  })
  it('material-instance → Instance', () => {
    expect(
      mentionBadge({ type: 'material', entityKind: 'material-instance', id: 'x', label: 'x' }),
    ).toBe('Instance')
  })
  it('vendor-product → Vendor', () => {
    expect(
      mentionBadge({ type: 'material', entityKind: 'vendor-product', id: 'x', label: 'x' }),
    ).toBe('Vendor')
  })
  it('labware', () => {
    expect(mentionBadge({ type: 'labware', id: 'x', label: 'x' })).toBe('Labware')
  })
  it('equipment', () => {
    expect(mentionBadge({ type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' })).toBe('Equipment')
  })
  it('protocol vs graph-component', () => {
    expect(
      mentionBadge({ type: 'protocol', entityKind: 'protocol', id: 'x', label: 'x' }),
    ).toBe('Protocol')
    expect(
      mentionBadge({
        type: 'protocol',
        entityKind: 'graph-component',
        id: 'x',
        label: 'x',
      }),
    ).toBe('Component')
  })
  it('selection source/target', () => {
    expect(
      mentionBadge({
        type: 'selection',
        selectionKind: 'source',
        labwareId: 'x',
        wells: [],
        label: 'x',
      }),
    ).toBe('Source')
    expect(
      mentionBadge({
        type: 'selection',
        selectionKind: 'target',
        labwareId: 'x',
        wells: [],
        label: 'x',
      }),
    ).toBe('Target')
  })
})

describe('badgeStyles', () => {
  it('returns distinct colours per known badge', () => {
    const seen = new Set<string>()
    for (const badge of ['Formulation', 'Instance', 'Concept', 'Labware', 'Equipment', 'Source', 'Target', 'Protocol', 'Component']) {
      const css = badgeStyles(badge)
      seen.add(css.background)
    }
    expect(seen.size).toBeGreaterThan(5)
  })
  it('falls back to a neutral palette for unknown badges', () => {
    const css = badgeStyles('Unknown')
    expect(css.background).toBe('#e5e7eb')
  })
})
