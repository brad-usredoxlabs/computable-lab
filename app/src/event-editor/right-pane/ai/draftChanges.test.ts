import { describe, expect, it } from 'vitest'
import { changesFromDraftEvents, describeWells } from './draftChanges'

/** The draft from the 2026-09-20 transcript (32 wells, cells, count in details). */
const draftEvent = {
  event_type: 'add_material',
  details: {
    labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo',
    wells: ['A2', 'A3', 'A4', 'A5', 'B2', 'B3', 'B4', 'B5'],
    material_ref: { kind: 'record', id: 'MAT-MESH-D056945', label: 'HepG2 Cell', type: 'material', domain: 'cell_line' },
    count: 10000,
  },
}

describe('changesFromDraftEvents — the Changes panel must never be blank over an Apply', () => {
  it('describes what the draft will add', () => {
    const changes = changesFromDraftEvents([draftEvent])
    expect(changes).toHaveLength(1)
    expect(changes[0]!.op).toBe('add')
    expect(changes[0]!.description).toContain('add_material')
    expect(changes[0]!.description).toContain('A2–B5 (8 wells)')
    expect(changes[0]!.description).toContain('HepG2 Cell')
    expect(changes[0]!.description).toContain('count 10,000')
    expect(changes[0]!.description).toContain('96_well_plate')
  })

  it('reads the material out of whichever ref field carried it', () => {
    const spec = {
      event_type: 'add_material',
      details: { wells: ['A1'], material_spec_ref: { kind: 'record', id: 'MSP-1', type: 'material-spec', label: '1 mM Clofibrate in DMSO' } },
    }
    expect(changesFromDraftEvents([spec])[0]!.description).toContain('1 mM Clofibrate in DMSO')
  })

  it('marks a minted material as unconfirmed rather than hiding it', () => {
    const minted = { event_type: 'add_material', details: { wells: ['A1'], material_ref: { mint: { label: 'HepG2 cells' } } } }
    expect(changesFromDraftEvents([minted])[0]!.description).toContain('new local term')
  })

  it('degrades gracefully for an event with almost nothing in it', () => {
    const bare = { event_type: 'mix', details: {} }
    const changes = changesFromDraftEvents([bare])
    expect(changes).toHaveLength(1)
    expect(changes[0]!.description).toBe('mix')
  })

  it('is empty only when there is genuinely nothing to describe', () => {
    expect(changesFromDraftEvents([])).toEqual([])
    expect(changesFromDraftEvents([null, 'nonsense'])).toEqual([])
  })

  it('names wells the way the question does', () => {
    expect(describeWells(['A2'])).toBe('A2')
    expect(describeWells([])).toBe('')
    expect(describeWells(['A2', 'B2', 'C2'])).toBe('A2–C2 (3 wells)')
  })

  // CELLRATE-1 (OQ-1 GO — tracked file): the changes row shows the per-well
  // total LABELED derived when a declared rate + volume are both present, and
  // says `absolute, unverified` for an ambiguous bare count — never a bare
  // ambiguous number, never an invented unit, never a silent multiplication.
  it('rate + volume: the row shows the derived per-well total with the derivation readable', () => {
    const rateDraft = {
      event_type: 'add_material',
      details: {
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'MAT-1', label: 'HepG2 cells' },
        volume: { value: 100, unit: 'uL' },
        counter_density: { value: 200, unit: 'cells/uL', basis: 'count_per_volume' },
      },
    }
    const description = changesFromDraftEvents([rateDraft])[0]!.description
    expect(description).toContain('20,000/well = 200/uL x 100 uL (derived)')
  })

  it('ambiguous bare count + volume: the row says absolute, unverified — no invented unit, no multiplication', () => {
    const bareDraft = {
      event_type: 'add_material',
      details: {
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'MAT-1', label: 'HepG2 cells' },
        count: 200,
        volume: { value: 100, unit: 'uL' },
      },
    }
    const description = changesFromDraftEvents([bareDraft])[0]!.description
    expect(description).toContain('200 · absolute, unverified')
    // The bare ambiguous number is replaced by the labeled reading.
    expect(description).not.toContain('count 200')
    // And the 100x disease is never reproduced in the display layer.
    expect(description).not.toContain('20,000')
  })
})
