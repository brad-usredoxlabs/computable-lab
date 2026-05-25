import { describe, expect, it } from 'vitest'
import {
  applyPlateRailPatch,
  createGroupDraft,
  DEFAULT_PLATE_RAIL_DRAFT,
  getPlateRailDraft,
} from './state'

describe('plate rail draft state', () => {
  it('defaults to an empty generic group setup and CellROX read', () => {
    expect(DEFAULT_PLATE_RAIL_DRAFT.knowledge.groups).toEqual([])
    expect(DEFAULT_PLATE_RAIL_DRAFT.knowledge.roleDefinitions.some((role) => role.name === 'Positive control for ROS')).toBe(true)
    expect(DEFAULT_PLATE_RAIL_DRAFT.protocol.title).toBe('')
    expect(DEFAULT_PLATE_RAIL_DRAFT.readout).toMatchObject({
      channelPreset: 'cellrox-deep-red',
      excitationNm: 644,
      emissionNm: 665,
    })
  })

  it('returns defaults when no draft exists for placement', () => {
    expect(getPlateRailDraft({}, 'pl-1')).toBe(DEFAULT_PLATE_RAIL_DRAFT)
  })

  it('creates a group draft from selected wells', () => {
    const roleDefinition = DEFAULT_PLATE_RAIL_DRAFT.knowledge.roleDefinitions.find((role) => role.name === 'Positive control for ROS')!
    const draft = createGroupDraft({ roleDefinition, selectedWells: ['B1', 'B2'] })
    expect(draft.name).toBe('Positive control for ROS')
    expect(draft.role).toBe('positive_control')
    expect(draft.wells).toEqual(['B1', 'B2'])
    expect(draft.channel.kind).toBe('custom')
    expect(draft.requiredMaterials.map((item) => item.label)).toContain('complex I inhibitor')
    expect(draft.expectedDirection).toBe('increased')
  })

  it('merges group patches without touching readout', () => {
    const group = createGroupDraft()
    const next = applyPlateRailPatch(DEFAULT_PLATE_RAIL_DRAFT, {
      knowledge: { groups: [group] },
    })
    expect(next.knowledge.groups).toHaveLength(1)
    expect(next.readout).toBe(DEFAULT_PLATE_RAIL_DRAFT.readout)
  })

  it('merges notes patches without touching groups', () => {
    const next = applyPlateRailPatch(DEFAULT_PLATE_RAIL_DRAFT, {
      protocol: { summary: 'Test rationale' },
    })
    expect(next.protocol.summary).toBe('Test rationale')
    expect(next.knowledge).toStrictEqual(DEFAULT_PLATE_RAIL_DRAFT.knowledge)
  })
})
