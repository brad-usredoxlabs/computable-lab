/**
 * A proposed INSTRUMENT must render as equipment, not as labware.
 *
 * The reported defect (2026-09-19): the AI proposed "the lab's Benchmark
 * Incu-Mixer"; the review pane looked the placement up in `previewLabwares`,
 * found nothing, and printed "unknown type" for a tile that was the only thing in
 * the draft. The equipment lives in its own bucket (it has no wells and no
 * labwareType), so the pane shows it in its own section.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { EventEditorPreview } from '../EventEditorContext'
import type { Equipment } from '../../types/equipment'
import type { PlateEvent } from '../../types/events'
import { ProposedGraphModal } from './ProposedGraphModal'

function equipment(overrides: Partial<Equipment> = {}): Equipment {
  return {
    equipmentId: 'eqp:CL:heater_shaker:mu93l702:g6dcqa',
    name: 'Incu-Mixer',
    instrumentKind: 'heater_shaker',
    equipmentClassRef: { kind: 'ontology', id: 'CL:heater_shaker', namespace: 'CL', label: 'Heater-shaker' },
    settings: { temperature_c: 37 },
    ...overrides,
  }
}

const equipmentId = 'eqp:CL:heater_shaker:mu93l702:g6dcqa'

function previewWithEquipment(eq: Equipment | null): EventEditorPreview {
  return {
    previewLabwares: {},
    previewEquipments: eq ? { [equipmentId]: eq } : {},
    previewPlacements: [
      {
        placementId: 'pl-preview-1',
        entityKind: 'equipment',
        equipmentId,
        labwareId: equipmentId,
        location: { kind: 'lawn', xMm: 16, yMm: 304 },
        orientation: 'landscape',
      },
    ],
    previewEvents: [] as PlateEvent[],
  }
}

afterEach(() => cleanup())

describe('ProposedGraphModal — proposed equipment', () => {
  it('lists a proposed instrument in its own section, with its settings', () => {
    render(<ProposedGraphModal preview={previewWithEquipment(equipment())} onClose={() => undefined} />)
    expect(screen.getByTestId('proposed-equipment-section')).toBeTruthy()
    const row = screen.getByTestId('proposed-equipment-row')
    expect(row.textContent).toContain('Incu-Mixer')
    expect(row.textContent).toContain('temperature c 37')
    // On the bench, and never dressed up as labware.
    expect(row.textContent).toContain('bench')
    expect(row.textContent).not.toContain('unknown type')
  })

  it('never prints "unknown type" for equipment, even when the entity is missing', () => {
    render(<ProposedGraphModal preview={previewWithEquipment(null)} onClose={() => undefined} />)
    const row = screen.getByTestId('proposed-equipment-row')
    // Falls back to the id — the honest "we cannot resolve this" answer, not a
    // labware lookup miss.
    expect(row.textContent).toContain(equipmentId)
    expect(row.textContent).not.toContain('unknown type')
  })

  it('marks a proposal as new, with its attribution', () => {
    render(
      <ProposedGraphModal
        preview={previewWithEquipment(
          equipment({ proposedRecord: true, attribution: 'exa:https://vendor.example/incu-mixer' }),
        )}
        onClose={() => undefined}
      />,
    )
    const row = screen.getByTestId('proposed-equipment-row')
    expect(row.textContent).toContain('will be created')
    expect(row.textContent).toContain('exa:https://vendor.example/incu-mixer')
  })

  it('says so when a proposal has no source', () => {
    render(
      <ProposedGraphModal
        preview={previewWithEquipment(equipment({ proposedRecord: true }))}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByTestId('proposed-equipment-row').textContent).toContain('no source stated')
  })

  // The third intent (create_record): authored records are listed as PROPOSALS, and
  // an ungrounded one says so instead of looking like evidence.
  it('lists new records for all three kinds, with their attribution', () => {
    render(
      <ProposedGraphModal
        preview={{
          ...previewWithEquipment(null),
          previewPlacements: [],
          recordCreations: [
            { kind: 'equipment', name: 'Benchmark Incu-Mixer MP4', source: 'exa:https://vendor.example/mp4' },
            { kind: 'material', name: 'fenofibrate', domain: 'chemical', source: 'user-description' },
            { kind: 'labware', name: '96-well low-binding plate', labwareType: 'plate' },
          ],
        }}
        onClose={() => undefined}
      />,
    )
    expect(screen.getByTestId('proposed-records-section')).toBeTruthy()
    const rows = screen.getAllByTestId('proposed-record-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('Benchmark Incu-Mixer MP4')
    expect(rows[0]?.textContent).toContain('exa:https://vendor.example/mp4')
    // A material has no bench position, and an unsourced proposal says so.
    expect(rows[1]?.textContent).toContain('no bench position')
    expect(rows[2]?.textContent).toContain('no source stated')
  })

  it('keeps equipment out of the labware list', () => {
    render(<ProposedGraphModal preview={previewWithEquipment(equipment())} onClose={() => undefined} />)
    expect(screen.queryByText('New labware')).toBeNull()
  })
})
