import { getDeckSlotLockedOrientation } from '../../shared/lib/platformRegistry'
import type {
  PlatformManifest,
  PlatformSlotManifest,
  PlatformVariantManifest,
} from '../../types/platformRegistry'
import { getLabwareAllowedOrientations } from '../../types/labware'
import type { Labware } from '../../types/labware'
import type {
  LabwareOrientation,
  PlacementLocation,
  PlacementValidationResult,
} from '../types'

interface ValidatePlacementInput {
  platform: PlatformManifest
  variant: PlatformVariantManifest
  location: PlacementLocation
  labware: Labware
  desiredOrientation?: LabwareOrientation
}

/**
 * Validate a labware placement. Returns:
 *   ok: false (with errors) when the placement is impossible (unknown slot,
 *     orientation lock the labware can't satisfy, hard compatibility rule, …)
 *   ok: true with forcedOrientation when the slot has a locked orientation —
 *     caller should use that orientation rather than desiredOrientation.
 *
 * Compatibility-rule evaluation is currently a no-op; the schema for
 * labware-compatibility-rule exists (`schema/workflow/labware-compatibility-rule.schema.yaml`)
 * but no records of that kind have been seen in the wild yet. When they
 * appear, fetch them via apiClient and plug them in here.
 */
export function validatePlacement(input: ValidatePlacementInput): PlacementValidationResult {
  const { variant, location, labware, desiredOrientation } = input

  if (location.kind === 'lawn') {
    return {
      ok: true,
      forcedOrientation: null,
      errors: [],
      warnings: [],
    }
  }

  const slot = variant.slots.find((entry: PlatformSlotManifest) => entry.id === location.slotId)
  if (!slot) {
    return {
      ok: false,
      forcedOrientation: null,
      errors: [`Slot "${location.slotId}" does not exist on ${variant.title}.`],
      warnings: [],
    }
  }

  if (slot.kind === 'trash' || slot.reachable === false) {
    return {
      ok: false,
      forcedOrientation: null,
      errors: [`Slot "${slot.id}" (${slot.label ?? slot.kind}) cannot hold labware.`],
      warnings: [],
    }
  }

  const lockedOrientation = getDeckSlotLockedOrientation(slot)
  const allowed = getLabwareAllowedOrientations(labware)

  if (lockedOrientation) {
    if (!allowed.includes(lockedOrientation)) {
      return {
        ok: false,
        forcedOrientation: null,
        errors: [
          `Slot ${slot.id} requires ${lockedOrientation} orientation, but ${labware.name} cannot rotate to ${lockedOrientation}.`,
        ],
        warnings: [],
      }
    }
    return {
      ok: true,
      forcedOrientation: lockedOrientation,
      errors: [],
      warnings: [],
    }
  }

  if (desiredOrientation && !allowed.includes(desiredOrientation)) {
    return {
      ok: false,
      forcedOrientation: null,
      errors: [
        `${labware.name} does not support ${desiredOrientation} orientation (allowed: ${allowed.join(', ') || 'unknown'}).`,
      ],
      warnings: [],
    }
  }

  return {
    ok: true,
    forcedOrientation: null,
    errors: [],
    warnings: [],
  }
}

/**
 * Pick the orientation the caller should use after validatePlacement passes,
 * preferring (in order): the slot's forced orientation, the desired
 * orientation, the labware's first allowed orientation, then 'landscape'.
 */
export function resolveOrientation(
  validation: PlacementValidationResult,
  desired: LabwareOrientation | undefined,
  labware: Labware,
): LabwareOrientation {
  if (validation.forcedOrientation) return validation.forcedOrientation
  if (desired) return desired
  const allowed = getLabwareAllowedOrientations(labware)
  if (allowed.length > 0) return allowed[0] as LabwareOrientation
  return 'landscape'
}
