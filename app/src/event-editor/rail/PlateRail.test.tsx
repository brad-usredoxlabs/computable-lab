import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PlateRail } from './PlateRail'
import {
  createGroupDraft,
  DEFAULT_PLATE_RAIL_DRAFT,
  SEEDED_ROLE_DEFINITIONS,
  type PlateRailDraft,
} from './state'

const updatePlateRail = vi.fn()
let stubDraft: PlateRailDraft = DEFAULT_PLATE_RAIL_DRAFT
let stubPlacementId = 'pl-1'
let stubEvents: unknown[] = []

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: {
      events: stubEvents,
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
    stubEvents = []
  })
  afterEach(() => cleanup())

  it('renders biologist-facing sidecar sections without baked-in mechanism UI', () => {
    render(<PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Materials' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Groups' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Notes' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Read' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Hypothesis' })).toBeNull()
    expect(screen.queryByText(/PPAR/i)).toBeNull()
    expect(screen.queryByText(/MECH-/i)).toBeNull()
  })

  it('calls onAddMaterial with current selection when clicked', () => {
    const onAddMaterial = vi.fn()
    render(<PlateRail placementId="pl-1" selectedWells={['A1', 'A2', 'B1']} onAddMaterial={onAddMaterial} />)
    fireEvent.click(screen.getByRole('button', { name: /add material to 3 selected wells/i }))
    expect(onAddMaterial).toHaveBeenCalledWith(['A1', 'A2', 'B1'])
  })

  it('applies a quick positive-control role to selected wells in one click', () => {
    render(<PlateRail placementId="pl-1" selectedWells={['B2', 'B3']} onAddMaterial={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Positive control for ROS' }))

    // Quick-role buttons short-circuit the wizard; no dialog should open.
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(updatePlateRail).toHaveBeenCalledWith('pl-1', {
      knowledge: expect.objectContaining({ groups: expect.any(Array), roleDefinitions: expect.any(Array) }),
    })
    const groups = updatePlateRail.mock.calls[0][1].knowledge.groups
    expect(groups[0]).toMatchObject({
      name: 'Positive control for ROS',
      role: 'positive_control',
      wells: ['B2', 'B3'],
      expectedDirection: 'increased',
    })
    expect(groups[0].requiredMaterials.map((item: { label: string }) => item.label)).toContain('complex I inhibitor')
  })

  it('opens the wizard when "New group" is clicked', () => {
    render(<PlateRail placementId="pl-1" selectedWells={['B2', 'B3']} onAddMaterial={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'New group' }))
    expect(screen.getByRole('dialog', { name: 'New group wizard' })).toBeTruthy()
    expect(screen.getByText('Which group is this?')).toBeTruthy()
  })

  it('renders an existing group and reassigns it to the current selection', () => {
    const roleDefinition = SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-ros-negative-control')!
    const group = createGroupDraft({ roleDefinition, selectedWells: ['A1'] })
    stubDraft = {
      ...DEFAULT_PLATE_RAIL_DRAFT,
      knowledge: {
        ...DEFAULT_PLATE_RAIL_DRAFT.knowledge,
        groups: [group],
      },
    }
    render(<PlateRail placementId="pl-1" selectedWells={['C1', 'C2']} onAddMaterial={() => {}} />)
    expect(screen.getAllByText('Negative control for ROS').length).toBeGreaterThan(0)
    fireEvent.click(screen.getByRole('button', { name: /use selection/i }))
    expect(updatePlateRail).toHaveBeenCalledWith('pl-1', {
      knowledge: expect.objectContaining({ groups: expect.any(Array), roleDefinitions: expect.any(Array) }),
    })
    const groups = updatePlateRail.mock.calls[0][1].knowledge.groups
    expect(groups[0].wells).toEqual(['C1', 'C2'])
  })

  it('summarizes channels from assigned groups and flags missing controls', () => {
    const positive = createGroupDraft({
      roleDefinition: SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-ros-positive-control')!,
      selectedWells: ['A1'],
    })
    const sample = createGroupDraft({
      roleDefinition: SEEDED_ROLE_DEFINITIONS.find((role) => role.id === 'CR-sample')!,
      selectedWells: ['B1'],
    })
    stubDraft = {
      ...DEFAULT_PLATE_RAIL_DRAFT,
      knowledge: {
        ...DEFAULT_PLATE_RAIL_DRAFT.knowledge,
        groups: [positive, sample],
      },
    }
    render(<PlateRail placementId="pl-1" selectedWells={[]} onAddMaterial={() => {}} />)
    expect(screen.getAllByText(/CellROX Deep Red/).length).toBeGreaterThan(0)
    expect(screen.getByText('positive control set')).toBeTruthy()
    expect(screen.getByText('missing negative control')).toBeTruthy()
  })
})
