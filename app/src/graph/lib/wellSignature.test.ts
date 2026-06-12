import { describe, it, expect } from 'vitest'
import type { WellComputedState } from './eventGraph'
import { getMaterialsSummary } from './eventGraph'
import {
  wellCompositionSignature,
  buildCompositionStyles,
  buildCompositionLegend,
} from './wellSignature'

function well(partial: Partial<WellComputedState>): WellComputedState {
  return {
    volume_uL: 0,
    components: [],
    materials: [],
    eventHistory: [],
    lastEventId: null,
    harvested: false,
    incubations: [],
    ...partial,
  }
}

function material(materialRef: string, value: number, unit: string) {
  return {
    materialRef,
    volume_uL: 100,
    concentration: { value, unit },
    sourceEventId: 'evt-' + Math.round(value), // distinct per call; must NOT affect signature
  }
}

describe('wellCompositionSignature', () => {
  it('is null for an empty well', () => {
    expect(wellCompositionSignature(well({}))).toBeNull()
    expect(wellCompositionSignature(null)).toBeNull()
  })

  it('matches for replicates regardless of source event id', () => {
    const a = well({ volume_uL: 100, materials: [material('CHEBI:clofibrate', 1, 'mM')] })
    const b = well({ volume_uL: 200, materials: [material('CHEBI:clofibrate', 1, 'mM')] })
    expect(wellCompositionSignature(a)).toBe(wellCompositionSignature(b))
  })

  it('differs when concentration differs', () => {
    const a = well({ volume_uL: 100, materials: [material('CHEBI:clofibrate', 1, 'mM')] })
    const b = well({ volume_uL: 100, materials: [material('CHEBI:clofibrate', 10, 'mM')] })
    expect(wellCompositionSignature(a)).not.toBe(wellCompositionSignature(b))
  })

  it('differs when material differs', () => {
    const a = well({ volume_uL: 100, materials: [material('CHEBI:clofibrate', 1, 'mM')] })
    const b = well({ volume_uL: 100, materials: [material('CHEBI:fenofibrate', 1, 'mM')] })
    expect(wellCompositionSignature(a)).not.toBe(wellCompositionSignature(b))
  })

  it('is order-independent across multiple materials', () => {
    const a = well({
      volume_uL: 100,
      materials: [material('A', 1, 'mM'), material('B', 2, 'uM')],
    })
    const b = well({
      volume_uL: 100,
      materials: [material('B', 2, 'uM'), material('A', 1, 'mM')],
    })
    expect(wellCompositionSignature(a)).toBe(wellCompositionSignature(b))
  })
})

describe('buildCompositionStyles', () => {
  const states: Record<string, WellComputedState> = {
    A1: well({ volume_uL: 100, materials: [material('clofibrate', 1, 'mM')] }),
    A2: well({ volume_uL: 100, materials: [material('clofibrate', 1, 'mM')] }), // replicate of A1
    A3: well({ volume_uL: 100, materials: [material('fenofibrate', 1, 'mM')] }), // distinct
    A4: well({}), // empty
  }
  const sigOf = (wellId: string) => wellCompositionSignature(states[wellId])

  it('gives replicates the same fill and distinct conditions different fills', () => {
    const styles = buildCompositionStyles(['A1', 'A2', 'A3', 'A4'], sigOf, new Set())
    expect(styles.get('A1')!.fill).toBe(styles.get('A2')!.fill)
    expect(styles.get('A1')!.fill).not.toBe(styles.get('A3')!.fill)
    expect(styles.has('A4')).toBe(false) // empty well gets no hue
  })

  it('renders grouped wells more vividly than ungrouped replicates', () => {
    const grouped = buildCompositionStyles(['A1', 'A2'], sigOf, new Set(['A1']))
    expect(grouped.get('A1')!.fill).not.toBe(grouped.get('A2')!.fill)
  })
})

describe('buildCompositionLegend', () => {
  const states: Record<string, WellComputedState> = {
    A1: well({ volume_uL: 100, materials: [material('clofibrate', 1, 'mM')] }),
    A2: well({ volume_uL: 100, materials: [material('clofibrate', 1, 'mM')] }),
    A3: well({ volume_uL: 100, materials: [material('fenofibrate', 1, 'mM')] }),
    A4: well({}),
  }
  const sigOf = (id: string) => wellCompositionSignature(states[id])
  const labelOf = (id: string) => getMaterialsSummary(states[id])

  it('produces one entry per distinct composition with replicate wells grouped', () => {
    const legend = buildCompositionLegend(['A1', 'A2', 'A3', 'A4'], sigOf, labelOf, new Set())
    expect(legend).toHaveLength(2) // clofibrate + fenofibrate; empty A4 excluded
    const clof = legend.find((e) => e.label.includes('clofibrate'))!
    expect(clof.wells).toEqual(['A1', 'A2'])
    expect(legend[0]!.fill).not.toBe(legend[1]!.fill)
  })

  it('matches the colors emitted by buildCompositionStyles', () => {
    const order = ['A1', 'A2', 'A3']
    const styles = buildCompositionStyles(order, sigOf, new Set())
    const legend = buildCompositionLegend(order, sigOf, labelOf, new Set())
    const clof = legend.find((e) => e.label.includes('clofibrate'))!
    expect(clof.fill).toBe(styles.get('A1')!.fill)
  })
})
