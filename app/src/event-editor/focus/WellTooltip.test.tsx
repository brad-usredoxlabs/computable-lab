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
})
