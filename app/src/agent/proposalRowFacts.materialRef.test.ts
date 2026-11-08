/**
 * L2-PROMPT2-RESOLVE-OR-AUTHOR-1 / unit u6d4 — RED-GREEN pins for the
 * material_ref fallback arm.
 *
 * The authored leg carries `material_ref` (object with `label`) instead of
 * `details.material` (string). The formatter must fall back to
 * `material_ref.label` when `details.material` is absent, so an authored
 * add_material row shows its material instead of a bare "add_material" with
 * an empty material cell.
 *
 * Evidence: brgate-ROAUTH-g2-l2t3225-report.md:D4, shot 03-D-preview.png.
 */
import { describe, expect, it } from 'vitest'
import { proposalRowFact } from './proposalRowFacts'

describe('proposalRowFact — material_ref fallback for authored events', () => {
  it('renders material from material_ref.label when details.material is absent', () => {
    const event = {
      eventId: 'e1',
      kind: 'add_material',
      details: {
        wells: ['F3'],
        volumeUl: 1,
        material_ref: {
          kind: 'record',
          type: 'material-spec',
          id: 'MSP-DRAFT-TEST-1',
          label: '1 mM clofibrate in DMSO',
        },
      },
    }
    const fact = proposalRowFact(event)
    expect(fact).not.toBeNull()
    expect(fact!.text).toContain('1 mM clofibrate in DMSO')
    expect(fact!.text).toContain('F3')
    expect(fact!.text).toContain('1 uL')
    expect(fact!.carried.has('material')).toBe(true)
  })

  it('details.material string takes precedence over material_ref', () => {
    const event = {
      eventId: 'e2',
      kind: 'add_material',
      details: {
        well: 'A1',
        volumeUl: 50,
        material: 'DMEM',
        material_ref: {
          kind: 'record',
          type: 'material-spec',
          id: 'MSP-other',
          label: 'Other material',
        },
      },
    }
    const fact = proposalRowFact(event)
    expect(fact).not.toBeNull()
    expect(fact!.text).toBe('A1 ← 50 uL DMEM')
    expect(fact!.text).not.toContain('Other material')
  })

  it('material_ref without label yields no material part', () => {
    const event = {
      eventId: 'e3',
      kind: 'add_material',
      details: {
        wells: ['B1'],
        volumeUl: 25,
        material_ref: {
          kind: 'record',
          type: 'material-spec',
          id: 'MSP-nolabel',
          label: '',
        },
      },
    }
    const fact = proposalRowFact(event)
    expect(fact).not.toBeNull()
    expect(fact!.text).toBe('B1 ← 25 uL')
    expect(fact!.carried.has('material')).toBe(false)
  })

  it('material_ref that is not an object yields no material part', () => {
    const event = {
      eventId: 'e4',
      kind: 'add_material',
      details: {
        wells: ['C1'],
        volumeUl: 10,
        material_ref: 'MSP-some-id',
      },
    }
    const fact = proposalRowFact(event)
    expect(fact).not.toBeNull()
    expect(fact!.text).toBe('C1 ← 10 uL')
    expect(fact!.carried.has('material')).toBe(false)
  })

  it('record id appends when material_ref.label matches the map', () => {
    const idMap = new Map([['1 mM clofibrate in DMSO', 'MSP-DRAFT-TEST-1']])
    const event = {
      eventId: 'e5',
      kind: 'add_material',
      details: {
        wells: ['F3'],
        volumeUl: 1,
        material_ref: {
          kind: 'record',
          type: 'material-spec',
          id: 'MSP-DRAFT-TEST-1',
          label: '1 mM clofibrate in DMSO',
        },
      },
    }
    const fact = proposalRowFact(event, idMap)
    expect(fact).not.toBeNull()
    expect(fact!.text).toBe('F3 ← 1 uL 1 mM clofibrate in DMSO (MSP-DRAFT-TEST-1)')
  })
})
