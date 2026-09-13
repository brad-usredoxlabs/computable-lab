import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorState } from '../EventEditorContext'
import type { Equipment } from '../../types/equipment'
import { EMPTY_HISTORY } from '../editorHistory'
import { LabwareFocus } from './LabwareFocus'

const mocks = vi.hoisted(() => ({
  state: null as EventEditorState | null,
  setFocus: vi.fn(),
  openAddMaterial: vi.fn(),
  getRecord: vi.fn(),
  searchRecords: vi.fn(),
  updateEquipmentSettings: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: mocks.state,
    actions: { setFocus: mocks.setFocus, updateEquipmentSettings: mocks.updateEquipmentSettings },
  }),
}))

vi.mock('./FocusModalsProvider', () => ({
  useFocusModals: () => ({ openAddMaterial: mocks.openAddMaterial }),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: { getRecord: mocks.getRecord, searchRecords: mocks.searchRecords },
}))

function waterBath(equipmentId: string, name: string, temperature_c: number): Equipment {
  return {
    equipmentId,
    recordId: 'EQP-WATER-BATH',
    name,
    instrumentKind: 'water_bath',
    equipmentClassRef: { kind: 'record', type: 'equipment-class', id: 'EQC-WATER-BATH' },
    settings: { temperature_c },
  }
}

function makeState(overrides: Partial<EventEditorState> = {}): EventEditorState {
  return {
    loadState: 'ready',
    loadError: null,
    platforms: [],
    platformId: 'manual',
    variantId: 'manual_freeform',
    vocabPackId: 'liquid-handling/v1',
    toolTypeId: null,
    assistPipetteId: null,
    runId: null,
    eventGraphId: null,
    eventGraphSave: null,
    labwares: {},
    placements: [],
    focusPlacementId: null,
    selection: null,
    events: [],
    tipState: { kind: 'empty' },
    preview: null,
    graphLemurSource: null,
    runDeck: null,
    equipments: {},
    fixIt: {
      isOpen: false,
      seed: null,
      chat: [],
      streaming: false,
      stage: 'chatting',
      error: null,
      spec: null,
      applyStage: null,
      applyProgress: [],
      applyReasoning: '',
      applyResult: null,
      fixHistory: [],
      pendingRetryPrompt: null,
    },
    plateRail: {},
    history: EMPTY_HISTORY,
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  mocks.setFocus.mockReset()
  mocks.openAddMaterial.mockReset()
  mocks.getRecord.mockReset()
  mocks.searchRecords.mockReset()
  mocks.updateEquipmentSettings.mockReset()
  // Default: focus can always fetch the linked equipment-class (settings + accepts).
  mocks.getRecord.mockResolvedValue({
    payload: {
      kind: 'equipment-class',
      id: 'EQC-WATER-BATH',
      name: 'Water Bath',
      settingsDefinition: [{ key: 'temperature_c', label: 'Target temperature', valueType: 'number', unit: '°C' }],
      acceptsLabware: [],
    },
  })
  if (typeof (globalThis as Record<string, unknown>).ResizeObserver !== 'function') {
    ;(globalThis as Record<string, unknown>).ResizeObserver = class {
      observe() {}
      disconnect() {}
    }
  }
})

describe('LabwareFocus — first-class equipment tap', () => {
  it('focusing a placed equipment tile shows its capability pane, not a blank screen', async () => {
    const eq = waterBath('eqp-1', 'Water bath 1', 55)
    mocks.state = makeState({
      focusPlacementId: 'pl-eq',
      labwares: {}, // equipment is NOT in labwares — the null-focus bug
      equipments: { 'eqp-1': eq },
      placements: [{
        placementId: 'pl-eq',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10, surfaceId: 'primary' },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)

    // The capabilities pane renders (regression: previously returned null → blank).
    await waitFor(() => expect(screen.getByTestId('focus-equipment')).toBeTruthy())
    expect(screen.queryByTestId('well-grid')).toBeNull()
    // Identity + concrete setting.
    expect(screen.getByTestId('focus-equipment').textContent).toContain('Water bath 1')
    // The class record supplies the settings label/unit + accepted labware.
    expect(screen.getByTestId('focus-equipment').textContent).toContain('Target temperature')
    expect(screen.getByTestId('focus-equipment-settings')).toBeTruthy()
    expect(screen.getByTestId('focus-equipment-accepts')).toBeTruthy()
  })

  it('renders settings + accepts-labware from the linked equipment-class record', async () => {
    const eq = waterBath('eqp-1', 'Water bath 1', 55)
    mocks.state = makeState({
      focusPlacementId: 'pl-eq',
      labwares: {},
      equipments: { 'eqp-1': eq },
      placements: [{
        placementId: 'pl-eq',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })
    mocks.getRecord.mockResolvedValue({
      payload: {
        kind: 'equipment-class',
        id: 'EQC-WATER-BATH',
        name: 'Water Bath',
        settingsDefinition: [{ key: 'temperature_c', label: 'Target temperature', valueType: 'number', unit: '°C' }],
        acceptsLabware: [],
      },
    })

    render(<LabwareFocus />)
    await waitFor(() => expect(mocks.getRecord).toHaveBeenCalledWith('EQC-WATER-BATH'))
    const text = screen.getByTestId('focus-equipment').textContent ?? ''
    expect(text).toContain('Target temperature')
    expect(text).toContain('55 °C')
    // Same temperature text appears in the chip.
    expect(screen.getByTestId('focus-equipment-chip').textContent).toContain('55 °C')
  })

  it('Close exits the equipment focus back to the bench', async () => {
    const eq = waterBath('eqp-1', 'Water bath 1', 55)
    mocks.state = makeState({
      focusPlacementId: 'pl-eq',
      labwares: {},
      equipments: { 'eqp-1': eq },
      placements: [{
        placementId: 'pl-eq',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)
    await waitFor(() => expect(screen.getByTestId('focus-equipment')).toBeTruthy())
    screen.getByRole('button', { name: /close/i }).click()
    expect(mocks.setFocus).toHaveBeenCalledWith(null)
  })

  it('renders an editable settings control for a number setting', async () => {
    const eq = waterBath('eqp-1', 'Water bath 1', 55)
    mocks.state = makeState({
      focusPlacementId: 'pl-eq',
      labwares: {},
      equipments: { 'eqp-1': eq },
      placements: [{
        placementId: 'pl-eq',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)
    const input = await screen.findByTestId('equipment-setting-input-temperature_c')
    expect(input.getAttribute('type')).toBe('number')
    expect((input as HTMLInputElement).value).toBe('55')
    expect(screen.getByTestId('equipment-settings-save')).toBeTruthy()
  })

  it('save dispatches updateEquipmentSettings with the edited value', async () => {
    const eq = waterBath('eqp-1', 'Water bath 1', 55)
    mocks.state = makeState({
      focusPlacementId: 'pl-eq',
      labwares: {},
      equipments: { 'eqp-1': eq },
      placements: [{
        placementId: 'pl-eq',
        entityKind: 'equipment',
        equipmentId: 'eqp-1',
        labwareId: 'eqp-1',
        location: { kind: 'lawn', xMm: 10, yMm: 10 },
        orientation: 'landscape',
      }],
    })

    render(<LabwareFocus />)
    const input = await screen.findByTestId('equipment-setting-input-temperature_c')
    fireEvent.change(input, { target: { value: '62' } })
    fireEvent.click(screen.getByTestId('equipment-settings-save'))
    await waitFor(() =>
      expect(mocks.updateEquipmentSettings).toHaveBeenCalledWith('eqp-1', { temperature_c: 62 }))
    // The pane reflects the saved value (kept local or echoed back).
    expect((screen.getByTestId('equipment-setting-input-temperature_c') as HTMLInputElement).value).toBe('62')
  })
})