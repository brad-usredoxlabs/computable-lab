import { describe, expect, it } from 'vitest'
import {
  applyPlateRailPatch,
  DEFAULT_PLATE_RAIL_DRAFT,
  getPlateRailDraft,
} from './state'

describe('plate rail draft state', () => {
  it('defaults to CellROX Deep Red Ex/Em 644/665', () => {
    expect(DEFAULT_PLATE_RAIL_DRAFT.readout).toMatchObject({
      channelPreset: 'cellrox-deep-red',
      excitationNm: 644,
      emissionNm: 665,
    })
  })

  it('returns defaults when no draft exists for placement', () => {
    expect(getPlateRailDraft({}, 'pl-1')).toBe(DEFAULT_PLATE_RAIL_DRAFT)
  })

  it('returns the stored draft when present', () => {
    const draft = {
      ...DEFAULT_PLATE_RAIL_DRAFT,
      knowledge: {
        ...DEFAULT_PLATE_RAIL_DRAFT.knowledge,
        contextLabel: 'ROS positive control',
      },
    }
    expect(getPlateRailDraft({ 'pl-1': draft }, 'pl-1')).toBe(draft)
  })

  it('merges knowledge patches without touching readout', () => {
    const next = applyPlateRailPatch(DEFAULT_PLATE_RAIL_DRAFT, {
      knowledge: { contextLabel: 'ROS positive control', role: 'positive-control' },
    })
    expect(next.knowledge.contextLabel).toBe('ROS positive control')
    expect(next.knowledge.role).toBe('positive-control')
    expect(next.knowledge.claimText).toBe(DEFAULT_PLATE_RAIL_DRAFT.knowledge.claimText)
    expect(next.readout).toBe(DEFAULT_PLATE_RAIL_DRAFT.readout)
  })

  it('merges readout patches without touching knowledge', () => {
    const next = applyPlateRailPatch(DEFAULT_PLATE_RAIL_DRAFT, {
      readout: { instrumentLabel: 'Gemini EM' },
    })
    expect(next.readout.instrumentLabel).toBe('Gemini EM')
    expect(next.readout.channelPreset).toBe('cellrox-deep-red')
    expect(next.knowledge).toBe(DEFAULT_PLATE_RAIL_DRAFT.knowledge)
  })
})
