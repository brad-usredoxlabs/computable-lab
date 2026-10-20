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
})

// ── CHANGES-UI-1 (A): composition rows must enumerate the COMPONENTS ────────
// The 2026-10-20 defect: a minted mixture rendered ONLY its blob label
// ("Trypsin-EDTA + DMEM + FBS + HepG2 cells") — the biologist could not see
// what the mixture is actually made of, even though AddMaterialDetails carries
// composition_snapshot (types/events.ts:145-160). The row must read like the
// well tooltip: `<component label> as <role>` per entry, roles verbatim from
// the snapshot data (no vocabulary hardcoded here).
describe('changesFromDraftEvents — composition_snapshot enumerates components with roles (CHANGES-UI-1 A)', () => {
  const mixture = {
    event_type: 'add_material',
    details: {
      labwareId: 'plate1',
      wells: ['A1', 'A2'],
      material_ref: {
        kind: 'record',
        id: 'MAT-MINT-1',
        mint: { label: 'Trypsin-EDTA + DMEM + FBS + HepG2 cells' },
      },
      composition_snapshot: [
        { componentRef: { kind: 'record', id: 'MAT-1', label: 'Trypsin-EDTA' }, role: 'media' },
        { componentRef: { kind: 'record', id: 'MAT-2', label: 'DMEM' }, role: 'base_medium' },
        { componentRef: { kind: 'record', id: 'MAT-3', label: 'FBS' }, role: 'supplement' },
        { componentRef: { kind: 'record', id: 'MAT-4', label: 'HepG2 cells' }, role: 'cells' },
      ],
    },
  }

  it('renders ALL FOUR component labels with their roles', () => {
    const d = changesFromDraftEvents([mixture])[0]!.description
    expect(d).toContain('Trypsin-EDTA as media')
    expect(d).toContain('DMEM as base_medium')
    expect(d).toContain('FBS as supplement')
    expect(d).toContain('HepG2 cells as cells')
  })

  it('the blob mint label rides as the mixture name BEFORE the components, never instead of them', () => {
    const d = changesFromDraftEvents([mixture])[0]!.description
    const blobIdx = d.indexOf('Trypsin-EDTA + DMEM + FBS + HepG2 cells')
    expect(blobIdx).toBeGreaterThanOrEqual(0)
    expect(d.indexOf('Trypsin-EDTA as media')).toBeGreaterThan(blobIdx)
  })

  it('accepts the snake_case component_ref the parse accepts, and falls back label→id', () => {
    const snake = {
      event_type: 'add_material',
      details: {
        wells: ['A1'],
        composition_snapshot: [{ component_ref: { kind: 'record', id: 'MAT-9' }, role: 'solute' }],
      },
    }
    expect(changesFromDraftEvents([snake])[0]!.description).toContain('MAT-9 as solute')
  })

  it('skips an entry with no usable label AND no id; falls back to today when the snapshot yields nothing', () => {
    const junk = {
      event_type: 'add_material',
      details: {
        wells: ['A1'],
        material_ref: { kind: 'record', id: 'M1', label: 'Serum' },
        composition_snapshot: [{ role: 'other' }, {}],
      },
    }
    const d = changesFromDraftEvents([junk])[0]!.description
    expect(d).toContain('Serum')
    expect(d).not.toContain('as other')
  })
})

// ── CHANGES-UI-1 (B): numeric amounts must not drop ─────────────────────────
// asString(volume['value']) returns '' for numbers, so the compiler's common
// `{value: number, unit}` emitted " uL" (or nothing). Finite numbers render;
// non-finite/non-number values render NOTHING (no orphan unit, no "undefined").
describe('changesFromDraftEvents — numeric amounts render (CHANGES-UI-1 B)', () => {
  it('renders a numeric volume: {value:100,unit:"uL"} → "100 uL"', () => {
    const e = {
      event_type: 'add_material',
      details: { wells: ['A1'], material_ref: { kind: 'record', id: 'M1', label: 'DMEM' }, volume: { value: 100, unit: 'uL' } },
    }
    expect(changesFromDraftEvents([e])[0]!.description).toContain('100 uL')
  })

  it('renders a numeric concentration: {value:0.5,unit:"% (v/v)"} → "0.5 % (v/v)"', () => {
    const e = {
      event_type: 'add_material',
      details: { wells: ['A1'], material_ref: { kind: 'record', id: 'M2', label: 'Clofibrate' }, concentration: { value: 0.5, unit: '% (v/v)' } },
    }
    expect(changesFromDraftEvents([e])[0]!.description).toContain('0.5 % (v/v)')
  })

  it('renders NOTHING for a non-finite value — no orphan unit, no "undefined", no "NaN"', () => {
    const e = { event_type: 'add_material', details: { wells: ['A1'], volume: { value: NaN, unit: 'uL' } } }
    const d = changesFromDraftEvents([e])[0]!.description
    expect(d).not.toContain('uL')
    expect(d).not.toContain('NaN')
    expect(d).not.toContain('undefined')
  })

  it('keeps the existing string path working', () => {
    const e = { event_type: 'add_material', details: { wells: ['A1'], volume: { value: 'about 100', unit: 'uL' } } }
    expect(changesFromDraftEvents([e])[0]!.description).toContain('about 100 uL')
  })
})

// ── CHANGES-UI-1 (C): a requirement ghost's raw handle must read human ──────
// details.labwareId IS `req:<classCurie>:<t36>:<rand>` (labwareRequirement.ts:126)
// and was printed verbatim. Humanize from the handle itself; an optional
// resolver map (labwareId→label) wins when supplied.
describe('changesFromDraftEvents — labware handles read human (CHANGES-UI-1 C)', () => {
  const ghost = {
    event_type: 'add_material',
    details: { wells: ['A1'], labwareId: 'req:CL:96_well_plate:mu9azzva:if7jwo' },
  }

  it('humanizes a req: handle: shows the CURIE term, never the random tails', () => {
    const d = changesFromDraftEvents([ghost])[0]!.description
    expect(d).toContain('96_well_plate')
    expect(d).not.toContain('mu9azzva')
    expect(d).not.toContain('if7jwo')
    expect(d).toContain('req:CL:96_well_plate…')
  })

  it('leaves plain human ids alone (plate1 → "on plate1")', () => {
    const e = { event_type: 'add_material', details: { wells: ['A1'], labwareId: 'plate1' } }
    expect(changesFromDraftEvents([e])[0]!.description).toContain('on plate1')
  })

  it('prefers a resolver-map label when one is supplied', () => {
    const labels = new Map<string, string>([['req:CL:96_well_plate:mu9azzva:if7jwo', 'Plate for assay']])
    expect(changesFromDraftEvents([ghost], labels)[0]!.description).toContain('on Plate for assay')
  })
})
