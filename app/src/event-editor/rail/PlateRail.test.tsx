import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlateRail } from './PlateRail'
import { DEFAULT_PLATE_RAIL_DRAFT, type PlateRailDraft } from './state'

const updatePlateRail = vi.fn()
let stubDraft: PlateRailDraft = DEFAULT_PLATE_RAIL_DRAFT
let stubPlacementId = 'pl-1'

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      plateRail: { [stubPlacementId]: stubDraft },
    },
    actions: {
      updatePlateRail,
    },
  }),
}))

describe('PlateRail', () => {
  beforeEach(() => {
    updatePlateRail.mockReset()
    stubDraft = DEFAULT_PLATE_RAIL_DRAFT
    stubPlacementId = 'pl-1'
  })
  afterEach(() => cleanup())

  it('renders Materials, Knowledge, and Readout sections', () => {
    render(
      <PlateRail
        placementId="pl-1"
        selectedWells={[]}
        onAddMaterial={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Materials' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Knowledge' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Readout' })).toBeTruthy()
  })

  it('disables Add Material when no wells selected', () => {
    render(
      <PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />,
    )
    const btn = screen.getByRole('button', { name: /select wells/i })
    expect(btn.hasAttribute('disabled')).toBe(true)
  })

  it('calls onAddMaterial with current selection when clicked', () => {
    const onAddMaterial = vi.fn()
    render(
      <PlateRail
        placementId="pl-1"
        selectedWells={['A1', 'A2', 'B1']}
        onAddMaterial={onAddMaterial}
      />,
    )
    const btn = screen.getByRole('button', { name: /add material to 3 selected wells/i })
    fireEvent.click(btn)
    expect(onAddMaterial).toHaveBeenCalledWith(['A1', 'A2', 'B1'])
  })

  it('dispatches knowledge patches via updatePlateRail', () => {
    render(
      <PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />,
    )
    const contextInput = screen.getByPlaceholderText(/ROS positive control/i)
    fireEvent.change(contextInput, { target: { value: 'ROS positive control' } })
    expect(updatePlateRail).toHaveBeenCalledWith('pl-1', {
      knowledge: { contextLabel: 'ROS positive control' },
    })
  })

  it('anchors knowledge to current selection', () => {
    render(
      <PlateRail
        placementId="pl-1"
        selectedWells={['B2', 'B3']}
        onAddMaterial={() => {}}
      />,
    )
    const anchorBtn = screen.getByRole('button', { name: /anchor to selection/i })
    fireEvent.click(anchorBtn)
    expect(updatePlateRail).toHaveBeenCalledWith('pl-1', {
      knowledge: { wells: ['B2', 'B3'] },
    })
  })

  it('reports anchored well count from existing draft', () => {
    stubDraft = {
      ...DEFAULT_PLATE_RAIL_DRAFT,
      knowledge: { ...DEFAULT_PLATE_RAIL_DRAFT.knowledge, wells: ['A1', 'A2'] },
    }
    render(
      <PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />,
    )
    expect(screen.getByText('2 wells anchored')).toBeTruthy()
  })

  it('switches readout preset to custom and resets defaults when CellROX preset is reselected', () => {
    render(
      <PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />,
    )
    const presetSelect = screen.getByDisplayValue(/CellROX Deep Red/) as HTMLSelectElement
    fireEvent.change(presetSelect, { target: { value: 'custom' } })
    expect(updatePlateRail).toHaveBeenLastCalledWith('pl-1', {
      readout: { channelPreset: 'custom' },
    })

    fireEvent.change(presetSelect, { target: { value: 'cellrox-deep-red' } })
    expect(updatePlateRail).toHaveBeenLastCalledWith('pl-1', {
      readout: {
        channelPreset: 'cellrox-deep-red',
        excitationNm: 644,
        emissionNm: 665,
      },
    })
  })
})
