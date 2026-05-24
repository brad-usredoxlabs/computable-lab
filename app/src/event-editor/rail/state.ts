import type { WellId } from '../../types/plate'

/**
 * Draft state for the Phase 3 single-plate workflow rail. This is the
 * scaffolding the user fills in inside the focused plate view before
 * Phase 4 turns it into real `context`, `claim`, and `assertion` records
 * and Phase 5 binds the readout to an actual Gemini job.
 *
 * Held in `EventEditorContext` keyed by `placementId` so the rail
 * survives well-selection changes and closing/reopening the focus view
 * within the same editor session.
 */

export type RoleAssignment =
  | 'positive-control'
  | 'negative-control'
  | 'experimental'
  | 'untreated'

export interface KnowledgeDraft {
  contextLabel: string
  claimText: string
  role: RoleAssignment | null
  wells: WellId[]
}

export type ReadoutChannelPreset = 'cellrox-deep-red' | 'custom'

export interface ReadoutDraft {
  channelPreset: ReadoutChannelPreset
  excitationNm: number | null
  emissionNm: number | null
  instrumentLabel: string
}

export interface PlateRailDraft {
  knowledge: KnowledgeDraft
  readout: ReadoutDraft
}

export interface PlateRailPatch {
  knowledge?: Partial<KnowledgeDraft>
  readout?: Partial<ReadoutDraft>
}

export const CELLROX_DEEP_RED_EXCITATION_NM = 644
export const CELLROX_DEEP_RED_EMISSION_NM = 665

export const DEFAULT_PLATE_RAIL_DRAFT: PlateRailDraft = {
  knowledge: {
    contextLabel: '',
    claimText: '',
    role: null,
    wells: [],
  },
  readout: {
    channelPreset: 'cellrox-deep-red',
    excitationNm: CELLROX_DEEP_RED_EXCITATION_NM,
    emissionNm: CELLROX_DEEP_RED_EMISSION_NM,
    instrumentLabel: '',
  },
}

export function applyPlateRailPatch(
  draft: PlateRailDraft,
  patch: PlateRailPatch,
): PlateRailDraft {
  return {
    knowledge: patch.knowledge
      ? { ...draft.knowledge, ...patch.knowledge }
      : draft.knowledge,
    readout: patch.readout
      ? { ...draft.readout, ...patch.readout }
      : draft.readout,
  }
}

export function getPlateRailDraft(
  rail: Record<string, PlateRailDraft>,
  placementId: string,
): PlateRailDraft {
  return rail[placementId] ?? DEFAULT_PLATE_RAIL_DRAFT
}
