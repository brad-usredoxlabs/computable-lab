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
import { createEquipmentFromRequirement } from '../../../types/equipmentRequirement'
import type { Equipment } from '../../../types/equipment'
import { equipmentFootprintMm, labwareFootprintMm } from '../../../types/labwareFootprint'
import type { AiActiveDeckScope, AiEquipmentRequirement, AiLabwareAddition, AiLabwareRequirement } from '../../../types/ai'
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
  /** Bench equipment the draft wants placed on the bench (never a deck slot). */
  equipmentRequirements?: AiEquipmentRequirement[]
  existingLabwares: Record<string, Labware>
  activeDeckScope?: AiActiveDeckScope
  existingPlacements?: EventEditorPlacement[]
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

// Physical tile footprint (mm) — resolved per-labware via
// types/labwareFootprint.ts (stamped → definition → pitch derivation →
// legacy SBS fallback; matches LawnSurface.tsx). Labware tiles render at
// fixed pixel size, but positions are in real-world mm.
const LAWN_FALLBACK_STEP_W_MM = 127
const LAWN_FALLBACK_STEP_H_MM = 85
// Minimum gap between adjacent lawn tiles (mm) so new items don't land on
// existing ones when the AI omits explicit positions.
const LAWN_GAP_MM = 16

/** Footprint of a labware as it will sit on a lawn surface (orientation-aware). */
function lawnTileFootprint(labware: Labware): { wMm: number; hMm: number } {
  const addr = labware.addressing
  const portrait = addr && addr.rows && addr.columns && addr.rows > addr.columns
  const fp = labwareFootprintMm(labware, portrait ? 'portrait' : 'landscape')
  return { wMm: fp.length, hMm: fp.width }
}

/** Resolve the footprint of an EXISTING lawn placement, if its labware is known. */
function existingFootprintFor(
  placement: EventEditorPlacement,
  labwaresById: Record<string, Labware>,
): { wMm: number; hMm: number } {
  const labware = labwaresById[placement.labwareId]
  if (labware) {
    const fp = labwareFootprintMm(labware, placement.orientation === 'portrait' ? 'portrait' : 'landscape')
    return { wMm: fp.length, hMm: fp.width }
  }
  // No labware payload for this placement — legacy landscape tile as a safe
  // over-estimate.
  return { wMm: LAWN_FALLBACK_STEP_W_MM, hMm: LAWN_FALLBACK_STEP_H_MM }
}

/**
 * Compute a non-overlapping lawn position for a new labware.
 * Scans existing lawn placements plus placements we've already positioned
 * in this batch, then returns the next free grid slot. Occupied rects and the
 * candidate grid both use RESOLVED physical footprints (see labwareFootprint).
 */
function nextLawnPosition(
  footprint: { wMm: number; hMm: number },
  existing: EventEditorPlacement[],
  placed: Array<{ x: number; y: number; w: number; h: number }>,
  labwaresById: Record<string, Labware>,
): { kind: 'lawn'; xMm: number; yMm: number } {
  const { wMm, hMm } = footprint

  // Collect all occupied rectangles (existing + items we already placed).
  const occupied: Array<{ x: number; y: number; w: number; h: number }> = []

  for (const p of existing) {
    if (p.location.kind === 'lawn') {
      const fp = existingFootprintFor(p, labwaresById)
      occupied.push({
        x: p.location.xMm,
        y: p.location.yMm,
        w: fp.wMm,
        h: fp.hMm,
      })
    }
  }
  for (const r of placed) {
    occupied.push(r)
  }

  // Simple grid search: try positions in a regular grid until we find one
  // that doesn't overlap any existing tile.
  const startX = LAWN_GAP_MM
  const startY = LAWN_GAP_MM
  for (let col = 0; col < 20; col += 1) {
    for (let row = 0; row < 20; row += 1) {
      const x = startX + col * (wMm + LAWN_GAP_MM)
      const y = startY + row * (hMm + LAWN_GAP_MM)
      const candidate = { x, y, w: wMm, h: hMm }
      const overlap = occupied.some((o) => {
        return (
          candidate.x < o.x + o.w &&
          candidate.x + candidate.w > o.x &&
          candidate.y < o.y + o.h &&
          candidate.y + candidate.h > o.y
        )
      })
      if (!overlap) {
        return { kind: 'lawn', xMm: x, yMm: y }
      }
    }
  }
  // Fallback: last resort position (shouldn't happen in practice).
  return { kind: 'lawn', xMm: LAWN_FALLBACK_STEP_W_MM + LAWN_GAP_MM + placed.length * (LAWN_FALLBACK_STEP_W_MM + LAWN_GAP_MM), yMm: LAWN_FALLBACK_STEP_H_MM + LAWN_GAP_MM }
}

export function buildPreviewFromDraft({
  platform,
  variant,
  events,
  labwareAdditions,
  labwareRequirements,
  equipmentRequirements = [],
  existingLabwares,
  activeDeckScope,
  existingPlacements = [],
}: BuildPreviewArgs): BuildPreviewResult {
  const previewLabwares: Record<string, Labware> = {}
  const previewEquipments: Record<string, Equipment> = {}
  const allocatedLabwares: Labware[] = Object.values(existingLabwares)
  const previewPlacements: EventEditorPlacement[] = []
  const skips: string[] = []
  // Track lawn rectangles we've placed in this batch for collision avoidance.
  const lawnPlaced: Array<{ x: number; y: number; w: number; h: number }> = []

  // A misfiled equipment request must never collapse into labware (the silent
  // `tubeset_24` fallback in labwareRequirement.ts). Equipment kinds, `EQP-`
  // instances and `EQC-` classes all belong in `equipmentRequirements`.
  const isEquipmentToken = (token: string | undefined): boolean =>
    !!token && (/^equipment:/i.test(token) || /^EQ[PC]-/i.test(token))
  const usableLabwareRequirements = labwareRequirements.filter((requirement) => {
    if (!isEquipmentToken(requirement.classCurie)) return true
    skips.push(
      `${requirement.classCurie}: bench equipment, not labware — it belongs in equipmentRequirements`,
    )
    return false
  })

  const proposedLabware = [
    ...usableLabwareRequirements.map((requirement) => ({
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
    let location: PlacementLocation
    if (slotId) {
      location = { kind: 'slot', slotId }
    } else if (implicitSingleSlot) {
      location = { kind: 'slot', slotId: implicitSingleSlot }
    } else {
      location = nextLawnPosition(lawnTileFootprint(labware), existingPlacements, lawnPlaced, existingLabwares)
      const { wMm, hMm } = lawnTileFootprint(labware)
      lawnPlaced.push({ x: location.xMm, y: location.yMm, w: wMm, h: hMm })
    }

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

  // Bench equipment: minted as Equipment (never labware geometry) and placed on
  // the bench. Equipment is bench-only by construction — a deck slot is not a
  // valid destination even under a locked run scope, because the reducer refuses
  // to slot-promote equipment (EventEditorContext place_equipment guard).
  for (const requirement of equipmentRequirements) {
    const label = requirement.handle ?? requirement.recordId ?? requirement.classCurie ?? 'equipment'
    const token = requirement.classCurie ?? requirement.recordId
    if (!token) {
      skips.push(`${label}: no equipment record or class given`)
      continue
    }
    const equipment = createEquipmentFromRequirement(token, requirement.handle, requirement.settings)
    const footprint = equipmentFootprintMm(equipment, 'landscape')
    const lawnRect = { wMm: footprint.length, hMm: footprint.width }
    const location = nextLawnPosition(lawnRect, existingPlacements, lawnPlaced, existingLabwares)
    lawnPlaced.push({ x: location.xMm, y: location.yMm, w: lawnRect.wMm, h: lawnRect.hMm })
    previewEquipments[equipment.equipmentId] = equipment
    previewPlacements.push({
      placementId: nextPreviewPlacementId(),
      entityKind: 'equipment',
      equipmentId: equipment.equipmentId,
      // Existing id-based consumers (focus, removal, persisted records) key off
      // labwareId, so the equipment id travels in both fields.
      labwareId: equipment.equipmentId,
      location,
      orientation: 'landscape',
    })
  }

  return {
    preview: {
      previewLabwares,
      previewEquipments,
      previewPlacements,
      // Expand any compact well ranges the AI emitted ("A1:H12") into literal
      // wells, so committed events keep the existing per-well format.
      previewEvents: events.map(expandEventWells),
    },
    skips,
  }
}
