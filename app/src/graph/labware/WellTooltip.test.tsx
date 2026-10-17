import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { computeLabwareStates } from '../lib/eventGraph'
import { createLabware } from '../../types/labware'
import type { PlateEvent } from '../../types/events'
import { WellTooltip } from './WellTooltip'

afterEach(() => {
  cleanup()
})

// SH-QA-4 OQ1 fold-in: the same fabricated carrier volume renders at this
// sibling site. Fixture data mirrors tally F1 (labels are fixtures, not policy).
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
  const labware = createLabware('plate_96', 'labware-tt')
  const events = [build(labware.labwareId)]
  const computedStates = computeLabwareStates(events, new Map([[labware.labwareId, labware]]))
  return render(
    <WellTooltip
      wellId="A1"
      labwareId={labware.labwareId}
      events={events}
      computedStates={computedStates}
    />,
  )
}

describe('graph/labware WellTooltip', () => {
  it('mixture well: material meta rows carry fraction/count/density, never the carrier volume', () => {
    const { container } = renderTooltip(mixtureEvent)

    const metas = Array.from(container.querySelectorAll('.well-tooltip__material-meta'))
    expect(metas.length).toBe(4)
    for (const meta of metas) {
      expect(meta.textContent, 'composition row must not claim a volume').not.toContain('100.0 µL')
    }
    expect(metas.some((meta) => meta.textContent?.includes('50%'))).toBe(true)
    expect(metas.some((meta) => meta.textContent?.includes('10%'))).toBe(true)
    const cellsMeta = metas.find((meta) => meta.textContent?.includes('50,000 count'))
    expect(cellsMeta).toBeTruthy()
    expect(cellsMeta?.textContent).toContain('500 cells/uL')
  })

  it('pin: single-material meta line stays byte-identical (conc · volume · count)', () => {
    const { container } = renderTooltip(singleEvent)

    const meta = container.querySelector('.well-tooltip__material-meta')
    expect(meta?.textContent).toBe('1 mM · 100.0 µL')
  })
})
