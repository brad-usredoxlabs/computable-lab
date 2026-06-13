/**
 * Turn an AI draft result into an EventEditorPreview so the workspace deck
 * ghosts proposed labware/events and the floating Accept bar can commit or
 * discard them — the same behavior the standalone event-editor dock has.
 * Mirrors the dock's buildPreviewFromDraft (cla-lab-ai-overlay) using the
 * host's own placement/labware utilities.
 */

import type { EventEditorPreview } from '../../EventEditorContext'
import type { EventEditorPlacement, PlacementLocation } from '../../types'
import type { PlateEvent } from '../../../types/events'
import { expandEventWells } from '../../lib/wellRange'
import {
  labwareDefinitionRecordToPayload,
  labwareRecordToEditorLabware,
  type Labware,
  type LabwareRecordPayload,
} from '../../../types/labware'
import { createLabwareFromRequirement } from '../../../types/labwareRequirement'
import type { AiActiveDeckScope, AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
import type { PlatformManifest, PlatformVariantManifest } from '../../../types/platformRegistry'
import { assignVisibleLabwareHandle } from '../../labwareHandles'
import { resolveOrientation, validatePlacement } from '../../lib/placementRules'

function labwareRecordFallbackPayload(recordId: string): LabwareRecordPayload {
  const label = recordId
    .replace(/^lbw-/, '')
    .replace(/^def:/, '')
    .replace(/[/:@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const haystack = `${recordId} ${label}`.toLowerCase()
  const format = haystack.includes('384')
    ? { rows: 16, cols: 24, wellCount: 384 }
    : haystack.includes('reservoir') && haystack.includes('12')
      ? { rows: 1, cols: 12, wellCount: 12 }
      : haystack.includes('reservoir') && haystack.includes('8')
        ? { rows: 1, cols: 8, wellCount: 8 }
        : haystack.includes('tube')
          ? { rows: 1, cols: 1, wellCount: 1 }
          : { rows: 8, cols: 12, wellCount: 96 }
  const labwareType = haystack.includes('reservoir')
    ? 'reservoir'
    : haystack.includes('deep')
      ? 'deepwell'
      : haystack.includes('tube')
        ? 'tube'
        : 'plate'

  return {
    kind: 'labware',
    recordId,
    name: label || recordId,
    labwareType,
    format,
  }
}

function labwarePayloadForAddition(addition: AiLabwareAddition): LabwareRecordPayload {
  return labwareDefinitionRecordToPayload(addition.recordId)
    ?? labwareRecordFallbackPayload(addition.recordId)
}

function normalizeDeckSlot(slot: string | undefined): string | null {
  if (!slot) return null
  const normalized = slot.trim().toUpperCase()
  return /^[A-Z][0-9]+$/.test(normalized) ? normalized : null
}

let previewPlacementCounter = 0
function nextPreviewPlacementId(): string {
  previewPlacementCounter += 1
  return `pl-preview-${Date.now().toString(36)}-${previewPlacementCounter.toString(36)}`
}

export interface BuildPreviewArgs {
  platform: PlatformManifest | null | undefined
  variant: PlatformVariantManifest | null | undefined
  events: PlateEvent[]
  labwareAdditions: AiLabwareAddition[]
  labwareRequirements: AiLabwareRequirement[]
  existingLabwares: Record<string, Labware>
  activeDeckScope?: AiActiveDeckScope
}

export interface BuildPreviewResult {
  preview: EventEditorPreview
  skips: string[]
}

function scopeAllowsPreviewPlacement(location: PlacementLocation, scope?: AiActiveDeckScope): boolean {
  if (!scope?.locked) return true
  if (location.kind === 'lawn') return scope.allowedSurfaces.includes('lawn')
  return scope.allowedSurfaces.includes('slot') && scope.allowedSlots.includes(location.slotId)
}

function scopeSkipReason(label: string, location: PlacementLocation, scope: AiActiveDeckScope): string {
  const requested = location.kind === 'lawn' ? 'lawn' : 'slot ' + location.slotId
  const slots = scope.allowedSlots.length > 0 ? scope.allowedSlots.join(', ') : 'none'
  return label + ': requested ' + requested + ', but run ' + (scope.runId ?? '')
    + ' is locked to ' + scope.platformId + '/' + scope.variantId + ' (allowed slots: ' + slots + ')'
}

export function buildPreviewFromDraft({
  platform,
  variant,
  events,
  labwareAdditions,
  labwareRequirements,
  existingLabwares,
  activeDeckScope,
}: BuildPreviewArgs): BuildPreviewResult {
  const previewLabwares: Record<string, Labware> = {}
  const allocatedLabwares: Labware[] = Object.values(existingLabwares)
  const previewPlacements: EventEditorPlacement[] = []
  const skips: string[] = []

  const proposedLabware = [
    ...labwareRequirements.map((requirement) => ({
      label: requirement.classCurie,
      deckSlot: requirement.deckSlot,
      labware: createLabwareFromRequirement(requirement),
    })),
    ...labwareAdditions.map((addition) => ({
      label: addition.recordId,
      deckSlot: addition.deckSlot,
      labware: labwareRecordToEditorLabware(labwarePayloadForAddition(addition)),
    })),
  ]

  for (let index = 0; index < proposedLabware.length; index += 1) {
    const proposal = proposedLabware[index]!
    const labware = assignVisibleLabwareHandle(proposal.labware, allocatedLabwares)
    allocatedLabwares.push(labware)
    const slotId = normalizeDeckSlot(proposal.deckSlot)
    const implicitSingleSlot = !slotId
      && activeDeckScope?.locked
      && !activeDeckScope.allowedSurfaces.includes('lawn')
      && activeDeckScope.allowedSlots.length === 1
        ? activeDeckScope.allowedSlots[0]
        : null
    const location: PlacementLocation = slotId
      ? { kind: 'slot', slotId }
      : implicitSingleSlot
        ? { kind: 'slot', slotId: implicitSingleSlot }
        : { kind: 'lawn', xMm: 20 + index * 24, yMm: 20 + index * 18 }

    if (!platform || !variant) {
      skips.push(`${proposal.label}: deck not loaded`)
      continue
    }

    if (activeDeckScope && !scopeAllowsPreviewPlacement(location, activeDeckScope)) {
      skips.push(scopeSkipReason(proposal.label, location, activeDeckScope))
      continue
    }

    const validation = validatePlacement({ platform, variant, location, labware })
    if (!validation.ok) {
      skips.push(`${proposal.label}: ${validation.errors.join(' ')}`)
      continue
    }
    const orientation = resolveOrientation(validation, undefined, labware)
    previewLabwares[labware.labwareId] = labware
    previewPlacements.push({
      placementId: nextPreviewPlacementId(),
      labwareId: labware.labwareId,
      location,
      orientation,
    })
  }

  return {
    preview: {
      previewLabwares,
      previewPlacements,
      // Expand any compact well ranges the AI emitted ("A1:H12") into literal
      // wells, so committed events keep the existing per-well format.
      previewEvents: events.map(expandEventWells),
    },
    skips,
  }
}
