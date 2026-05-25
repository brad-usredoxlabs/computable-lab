import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Labware } from '../../types/labware'
import { createGroupDraft, DEFAULT_PLATE_RAIL_DRAFT, SEEDED_ROLE_DEFINITIONS } from './state'

const apiMocks = vi.hoisted(() => ({
  createRecord: vi.fn(),
  updateRecord: vi.fn(),
  executeInstrumentApplianceJob: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: apiMocks,
}))

import { ReadPlateModal } from './ReadPlateModal'

const labware: Labware = {
  labwareId: 'plate-1',
  labwareType: 'plate_96',
  name: 'Assay plate',
  addressing: { type: 'grid', rows: 8, columns: 12, rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] },
  geometry: { maxVolume_uL: 200, minVolume_uL: 20 },
}

describe('ReadPlateModal', () => {
  beforeEach(() => {
    apiMocks.createRecord.mockResolvedValue({ record: {}, validation: {}, lint: {} })
    apiMocks.updateRecord.mockResolvedValue({ record: {}, validation: {}, lint: {} })
    apiMocks.executeInstrumentApplianceJob.mockResolvedValue({ success: true, measurementId: 'MEAS-1', rawDataPath: 'records/inbox/read.csv' })
  })

  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('executes one simulated Gemini job for a channel and publishes evidence per anchored group', async () => {
    const positive = createGroupDraft({
      roleDefinition: SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-ros-positive-control'),
      selectedWells: ['A1'],
    })
    const negative = createGroupDraft({
      roleDefinition: SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-ros-negative-control'),
      selectedWells: ['B1'],
    })
    const rail = {
      'pl-1': {
        ...DEFAULT_PLATE_RAIL_DRAFT,
        knowledge: { ...DEFAULT_PLATE_RAIL_DRAFT.knowledge, groups: [positive, negative] },
      },
    }

    render(<ReadPlateModal isOpen placementId='pl-1' labware={labware} rail={rail} events={[]} onClose={() => {}} />)

    expect(screen.getByRole('dialog', { name: 'Read plate' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Execute read' }))

    await waitFor(() => expect(apiMocks.executeInstrumentApplianceJob).toHaveBeenCalledTimes(1))
    expect(apiMocks.executeInstrumentApplianceJob.mock.calls[0][0].request.parameters).toMatchObject({ simulate: true, mode: 'fluorescence', wavelengthNm: 665 })
    await waitFor(() => expect(screen.getByText(/Measurement: MEAS-1/)).toBeTruthy())
    expect(apiMocks.createRecord.mock.calls.filter((call) => String(call[0]).includes('evidence.schema')).length).toBe(2)
    expect(apiMocks.updateRecord).toHaveBeenCalledTimes(2)
  })

  it('allows a positive-control-only channel to execute', async () => {
    const positive = createGroupDraft({
      roleDefinition: SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-ros-positive-control'),
      selectedWells: ['A1'],
    })
    const rail = {
      'pl-1': {
        ...DEFAULT_PLATE_RAIL_DRAFT,
        knowledge: { ...DEFAULT_PLATE_RAIL_DRAFT.knowledge, groups: [positive] },
      },
    }

    render(<ReadPlateModal isOpen placementId='pl-1' labware={labware} rail={rail} events={[]} onClose={() => {}} />)

    expect(screen.getByText(/missing negative control/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Execute read' }))

    await waitFor(() => expect(apiMocks.executeInstrumentApplianceJob).toHaveBeenCalledTimes(1))
    expect(apiMocks.executeInstrumentApplianceJob.mock.calls[0][0].executionReadiness).toMatchObject({ status: 'ready', blockers: [] })
  })

})
