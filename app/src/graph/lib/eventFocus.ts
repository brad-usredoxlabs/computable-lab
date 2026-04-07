import type { PlateEvent, TransferDetails } from '../../types/events'
import { normalizeTransferDetails } from '../../types/events'
import type { Labware } from '../../types/labware'
import { computeLabwareStates } from './eventGraph'
import type { WellId } from '../../types/plate'
import type { MacroProgram } from '../../types/macroProgram'
import {
  getSerialDilutionFinalTargetLabwareId,
  getSerialDilutionPathLabwareId,
  normalizeSerialDilutionParams,
} from '../../editor/lib/serialDilutionPlan'

export interface EventFocusTarget {
  labwareId: string
  wells: WellId[]
}

function mergeFocusTarget(
  targets: Map<string, Set<WellId>>,
  labwareId: string | undefined,
  wells: WellId[] | undefined
): void {
  if (!labwareId || !wells || wells.length === 0) return
  const next = targets.get(labwareId) || new Set<WellId>()
  for (const wellId of wells) {
    next.add(wellId)
  }
  targets.set(labwareId, next)
}

export function getEventFocusTargets(
  event: PlateEvent,
  labwares?: Map<string, Labware>
): EventFocusTarget[] {
  const targets = new Map<string, Set<WellId>>()
  const details = event.details as Record<string, unknown>

  mergeFocusTarget(
    targets,
    typeof details.labwareId === 'string' ? details.labwareId : undefined,
    Array.isArray(details.wells) ? (details.wells as WellId[]) : undefined
  )

  if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
    const normalized = normalizeTransferDetails(event.details as TransferDetails)
    mergeFocusTarget(targets, normalized.sourceLabwareId, normalized.sourceWells)
    mergeFocusTarget(targets, normalized.destLabwareId, normalized.destWells)
  }

  if (event.event_type === 'macro_program') {
    const program = details.program as MacroProgram | undefined
    if (program?.kind === 'serial_dilution') {
      const normalized = normalizeSerialDilutionParams(program.params)
      for (const lane of normalized.lanes) {
        mergeFocusTarget(
          targets,
          getSerialDilutionPathLabwareId(normalized, lane) || (typeof details.labwareId === 'string' ? details.labwareId : undefined),
          lane.path,
        )
        if (lane.finalTargets?.length) {
          mergeFocusTarget(
            targets,
            getSerialDilutionFinalTargetLabwareId(normalized, lane),
            lane.finalTargets,
          )
        }
      }
    }

    if (program?.kind === 'quadrant_replicate') {
      mergeFocusTarget(targets, program.params.sourceLabwareId, program.params.sourceWells)
      if (labwares) {
        const targetState = computeLabwareStates([event], labwares).get(program.params.targetLabwareId)
        mergeFocusTarget(
          targets,
          program.params.targetLabwareId,
          targetState ? Array.from(targetState.keys()) as WellId[] : []
        )
      }
    }

    if (program?.kind === 'spacing_transition_transfer') {
      mergeFocusTarget(targets, program.params.sourceLabwareId, program.params.sourceWells)
      mergeFocusTarget(targets, program.params.targetLabwareId, program.params.targetWells)
    }

    if (program?.kind === 'transfer_vignette') {
      mergeFocusTarget(targets, program.params.sourceLabwareId, program.params.sourceWells)
      mergeFocusTarget(targets, program.params.targetLabwareId, program.params.targetWells)
    }
  }

  return Array.from(targets.entries()).map(([labwareId, wells]) => ({
    labwareId,
    wells: Array.from(wells),
  }))
}
