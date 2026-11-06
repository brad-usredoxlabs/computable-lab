import * as fs from 'fs'
import * as path from 'path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { computeLabwareStates } from '../../graph/lib/eventGraph'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { WellTooltip } from './WellTooltip'

afterEach(() => {
  cleanup()
})

// SH-QA-4 mixture fixture (tally F1 repro data — labels are fixtures, not policy).
const mixtureEvent = (labwareId: string): PlateEvent => ({
  eventId: 'evt-mixture',
  event_type: 'add_material',
  details: {
    labwareId,
    wells: ['A1'],
    volume: { value: 100, unit: 'uL' },
    count: 50000,
    counter_density: { value: 500, unit: 'cells/uL' },
    composition_snapshot: [
      { componentRef: { kind: 'ontology', id: 'CHEBI:15338', namespace: 'CHEBI', label: 'DMEM' }, role: 'solvent', source: '50% of the mixture' },
      { componentRef: { kind: 'ontology', id: 'CHEBI:15338', namespace: 'CHEBI', label: 'Thermo trypsin-EDTA' }, role: 'additive', source: '50% of the mixture' },
      { componentRef: { kind: 'ontology', id: 'FOODON:00003661', namespace: 'FOODON', label: 'FBS' }, role: 'buffer_component', source: '10% of the mixture' },
      { componentRef: { kind: 'record', id: 'rec-cellline-hepg2', label: 'HepG2' }, role: 'cells', source: '50% of the mixture' },
    ],
  },
})

const singleEvent = (labwareId: string): PlateEvent => ({
  eventId: 'evt-single',
  event_type: 'add_material',
  details: {
    labwareId,
    wells: ['A1'],
    material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' },
    volume: { value: 100, unit: 'uL' },
    concentration: { value: 1, unit: 'mM' },
  },
})

function renderTooltip(build: (labwareId: string) => PlateEvent) {
  const labware = createLabware('plate_96', 'tt-plate')
  const events = [build(labware.labwareId)]
  const states = computeLabwareStates(events, new Map([[labware.labwareId, labware]]))
  const state = states.get(labware.labwareId)?.get('A1')
  if (!state) throw new Error('A1 state missing')
  return render(<WellTooltip wellId="A1" state={state} clientX={10} clientY={10} />)
}

describe('WellTooltip (event-editor focus)', () => {
  // SH-QA-4 T4 (RED): the mixture's 100.0 µL is asserted ONCE (the header).
  // No composition row may repeat it; the cells row shows count + density and
  // the fraction instead of a volume.
  it('mixture well: exactly one volume assertion (header); composition rows show fraction/role, cells row count+density', () => {
    const { container } = renderTooltip(mixtureEvent)

    // Exactly one header volume, the well total.
    const headerVols = Array.from(container.querySelectorAll('.well-tooltip__volume'))
    expect(headerVols.length).toBe(1)
    expect(headerVols[0]?.textContent).toBe('100.0 µL')

    // F1 guard: NO material row repeats the carrier volume.
    const volCells = Array.from(container.querySelectorAll('.well-tooltip__material-vol'))
    expect(volCells.length).toBe(4)
    for (const cell of volCells) {
      expect(cell.textContent, 'composition row must not claim a volume').not.toBe('100.0 µL')
    }

    // Fractions surfaced on the rows (generic parse of the source strings).
    const fractions = volCells.map((cell) => cell.textContent)
    expect(fractions).toContain('50%')
    expect(fractions).toContain('10%')

    // Cells row: count + density side by side, no volume.
    const rows = Array.from(container.querySelectorAll('.well-tooltip__material'))
    const cellsRow = rows.find((row) => row.textContent?.includes('HepG2'))
    expect(cellsRow).toBeTruthy()
    expect(cellsRow?.querySelector('.well-tooltip__material-conc')?.textContent).toContain('50,000 count')
    expect(cellsRow?.querySelector('.well-tooltip__material-conc')?.textContent).toContain('500 cells/uL')
    expect(cellsRow?.querySelector('.well-tooltip__material-vol')?.textContent).not.toBe('100.0 µL')
  })

  // SH-QA-4 T5 (GREEN pin): single-material tooltip row stays exactly as today.
  it('pin: single-material add still shows its per-row volume', () => {
    const { container } = renderTooltip(singleEvent)

    const volCell = container.querySelector('.well-tooltip__material-vol')
    expect(volCell?.textContent).toBe('100.0 µL')
    const concCell = container.querySelector('.well-tooltip__material-conc')
    expect(concCell?.textContent).toBe('1 mM')
  })

  // D2: truncated cells expose their full text via title attributes so the
  // concentration and mixture-share are recoverable even when ellipsis clips.
  it('conc and vol cells carry title matching their text content', () => {
    const { container } = renderTooltip(mixtureEvent)

    const concCells = Array.from(container.querySelectorAll('.well-tooltip__material-conc'))
    const volCells  = Array.from(container.querySelectorAll('.well-tooltip__material-vol'))

    for (const cell of concCells) {
      expect(cell.getAttribute('title')).toBe(cell.textContent)
    }
    for (const cell of volCells) {
      expect(cell.getAttribute('title')).toBe(cell.textContent)
    }
  })

  // CELLRATE-1 (RED-first): the post-fix compiled shape — a rate-only event
  // (counter_density declared, NO count). The cells row keeps the declared
  // rate AND shows the per-well total LABELED derived with the operands
  // readable; the header stays the single volume assertion.
  it('rate-only cells row: declared rate kept, per-well total shown labeled derived (20,000/well = 200/uL x 100 uL)', () => {
    const { container } = renderTooltip((labwareId) => ({
      eventId: 'evt-rate-only',
      event_type: 'add_material',
      details: {
        labwareId,
        wells: ['A1'],
        volume: { value: 100, unit: 'uL' },
        counter_density: { value: 200, unit: 'cells/uL', basis: 'count_per_volume' },
        composition_snapshot: [
          { componentRef: { kind: 'record', id: 'rec-dmem', label: 'DMEM' }, role: 'buffer_component', source: '100% of the mixture' },
          { componentRef: { kind: 'record', id: 'rec-hepg2', label: 'HepG2' }, role: 'cells' },
        ],
      },
    }))

    const rows = Array.from(container.querySelectorAll('.well-tooltip__material'))
    const cellsRow = rows.find((row) => row.textContent?.includes('HepG2'))
    expect(cellsRow).toBeTruthy()
    const concCell = cellsRow?.querySelector('.well-tooltip__material-conc')?.textContent ?? ''
    // The declared rate stays visible...
    expect(concCell).toContain('200 cells/uL')
    // ...and the per-well total is shown LABELED derived, operands readable.
    expect(concCell).toContain('20,000/well = 200/uL x 100 uL (derived)')
    // No bare ambiguous number: the row never shows a lone "200".
    expect(concCell).not.toMatch(/(^|·)\s*200\s*(·|$)/)
    // SH-QA-4 unchanged: the header is the only volume assertion.
    const headerVols = Array.from(container.querySelectorAll('.well-tooltip__volume'))
    expect(headerVols.length).toBe(1)
    const volCells = Array.from(container.querySelectorAll('.well-tooltip__material-vol'))
    for (const cell of volCells) {
      expect(cell.textContent, 'composition row must not claim a volume').not.toBe('100.0 µL')
    }
  })

  // L2-VACUOUS-PINS-DEBT u3: diluted multi-entry composition snapshot — the
  // clofibrate row must show the LADDERED value (3.268 uM, from convention rung
  // uM/perBase:1000000) and NEVER the raw declared-unit literal (0.003268 mM).
  // This pin flips RED when WellTooltip.tsx:83 is changed to formatComputedConcentration.
  it('diluted multi-entry: clofibrate row shows laddered 3.268 uM, not raw 0.003268 mM', () => {
    const { container } = (() => {
      const labware = createLabware('plate_96', 'tt-plate')
      const events: PlateEvent[] = [
        {
          eventId: 'evt-clofibrate',
          event_type: 'add_material',
          details: {
            labwareId: labware.labwareId,
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' },
            volume: { value: 1, unit: 'uL' },
            concentration: { value: 1, unit: 'mM' },
          },
        },
        {
          eventId: 'evt-water',
          event_type: 'add_material',
          details: {
            labwareId: labware.labwareId,
            wells: ['A1'],
            material_ref: { kind: 'ontology', id: 'CHEBI:787', namespace: 'CHEBI', label: 'water' },
            volume: { value: 305, unit: 'uL' },
          },
        },
      ]
      const states = computeLabwareStates(events, new Map([[labware.labwareId, labware]]))
      const state = states.get(labware.labwareId)?.get('A1')
      if (!state) throw new Error('A1 state missing')
      return render(<WellTooltip wellId="A1" state={state} clientX={10} clientY={10} />)
    })()

    const rows = Array.from(container.querySelectorAll('.well-tooltip__material'))
    const clofibrateRow = rows.find((row) => row.textContent?.includes('clofibrate'))
    expect(clofibrateRow).toBeTruthy()
    const concCell = clofibrateRow?.querySelector('.well-tooltip__material-conc')?.textContent
    // LADDERED value from convention: 0.003268 mM -> 3.268 uM
    expect(concCell).toBe('3.268 uM')
    // Raw declared-unit literal must NOT appear
    expect(concCell).not.toContain('0.003268 mM')
  })

  // u5css RED pin: CSS declarations must NOT clip conc/vol cells and MUST wrap.
  // Reads eventEditor.css directly, strips comments, extracts rule bodies,
  // and asserts declaration-level properties (not raw text that a comment could satisfy).
  it('u5css pin: conc and vol cells wrap (no ellipsis, white-space: normal, overflow-wrap: anywhere)', () => {
    const cssPath = path.resolve(__dirname, '../styles/eventEditor.css')
    const raw = fs.readFileSync(cssPath, 'utf8')
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

    function ruleBody(selector: string): string {
      const re = new RegExp(selector + '\\s*\\{([^}]*)\\}', 's')
      const m = re.exec(css)
      expect(m, 'selector ' + selector + ' not found in CSS').toBeTruthy()
      return m![1]
    }

    const tooltipBody = ruleBody('\\.event-editor \\.well-tooltip')
    expect(tooltipBody).toContain('pointer-events: none')

    const concBody = ruleBody('\\.event-editor \\.well-tooltip__material-conc')
    expect(concBody).not.toContain('text-overflow: ellipsis')
    expect(concBody).toContain('white-space: normal')
    expect(concBody).toContain('overflow-wrap: anywhere')

    const volBody = ruleBody('\\.event-editor \\.well-tooltip__material-vol')
    expect(volBody).not.toContain('text-overflow: ellipsis')
    expect(volBody).toContain('white-space: normal')
    expect(volBody).toContain('overflow-wrap: anywhere')
  })
})
