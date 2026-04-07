/**
 * Event Graph Validation Library.
 * 
 * Validates events for consistency, volume constraints, and required fields.
 */

import type { WellId } from '../../types/plate'
import type { Labware } from '../../types/labware'
import type { 
  PlateEvent,
  AddMaterialDetails,
  TransferDetails,
  WashDetails,
  IncubateDetails,
} from '../../types/events'
import { getAddMaterialRef, normalizeTransferDetails } from '../../types/events'
import type { MacroProgram } from '../../types/macroProgram'
import { computeLabwareStates, getWellState, type LabwareStates, type WellComputedState } from './eventGraph'
import { compileMacroProgram } from './macroPrograms'
import {
  getSerialDilutionFinalTargetLabwareId,
  getSerialDilutionPathLabwareId,
  isSerialDilutionV2CurrentlyCompilable,
  normalizeSerialDilutionParams,
} from '../../editor/lib/serialDilutionPlan'
import {
  concentrationToCanonicalBase,
  formatConcentration,
  type CompositionEntryValue,
  type ConcentrationValue,
} from '../../types/material'

/**
 * Validation error severity
 */
export type ValidationSeverity = 'error' | 'warning' | 'info'

/**
 * A validation error or warning
 */
export interface ValidationError {
  /** Unique ID for this error */
  id: string
  /** The event that caused the error (if applicable) */
  eventId?: string
  /** The well that has the error (if applicable) */
  wellId?: WellId
  /** The labware that has the error (if applicable) */
  labwareId?: string
  /** Error severity */
  severity: ValidationSeverity
  /** Error code for programmatic handling */
  code: ValidationCode
  /** Human-readable error message */
  message: string
  /** Additional details */
  details?: Record<string, unknown>
}

/**
 * Validation error codes
 */
export type ValidationCode =
  // Volume errors
  | 'NEGATIVE_VOLUME'
  | 'OVERFILL'
  | 'INSUFFICIENT_SOURCE_VOLUME'
  | 'ZERO_VOLUME_OPERATION'
  // Reference errors
  | 'MISSING_LABWARE_REF'
  | 'INVALID_LABWARE_REF'
  | 'INVALID_WELL_REF'
  | 'MISSING_WELLS'
  // Required field errors
  | 'MISSING_REQUIRED_FIELD'
  | 'MISSING_SOURCE_WELLS'
  | 'MISSING_DEST_WELLS'
  | 'INVALID_MACRO_PROGRAM'
  // Logic errors
  | 'OPERATION_ON_HARVESTED_WELL'
  | 'EMPTY_EVENT_GRAPH'
  // Warnings
  | 'LOW_VOLUME_WARNING'
  | 'HIGH_EVAPORATION_RISK'
  | 'MISSING_MATERIAL_REF'
  | 'UNKNOWN_SOURCE_CONCENTRATION'
  | 'DUPLICATE_EVENT_ID'

/**
 * Validation options
 */
export interface ValidationOptions {
  /** Skip warnings and only report errors */
  errorsOnly?: boolean
  /** Custom max volume override per labware */
  customMaxVolumes?: Map<string, number>
  /** Minimum recommended volume (defaults to geometry.minVolume_uL) */
  minVolumeWarningThreshold?: number
}

/**
 * Validation result
 */
export interface ValidationResult {
  /** Whether validation passed (no errors) */
  valid: boolean
  /** All validation errors and warnings */
  errors: ValidationError[]
  /** Just errors (no warnings) */
  errorCount: number
  /** Just warnings */
  warningCount: number
  /** Computed state at time of validation */
  computedStates?: LabwareStates
}

let errorIdCounter = 0
function generateErrorId(): string {
  return `val-${++errorIdCounter}`
}

/**
 * Validate required fields on an event
 */
function validateRequiredFields(event: PlateEvent): ValidationError[] {
  const errors: ValidationError[] = []
  const details = event.details as Record<string, unknown>
  
  // All events should have either labwareId or source/dest labwareIds
  if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
    const transferDetails = details as TransferDetails
    const normalized = normalizeTransferDetails(transferDetails)
    if (!normalized.sourceLabwareId && !details.labwareId) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'warning',
        code: 'MISSING_LABWARE_REF',
        message: 'Transfer event missing source labware reference',
      })
    }
    if (normalized.sourceWells.length === 0) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'error',
        code: 'MISSING_SOURCE_WELLS',
        message: 'Transfer event missing source wells',
      })
    }
    const discardToWaste = Boolean((transferDetails as TransferDetails).discard_to_waste)
    if (!discardToWaste && normalized.destWells.length === 0) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'error',
        code: 'MISSING_DEST_WELLS',
        message: 'Transfer event missing destination wells',
      })
    }
  } else if (event.event_type === 'macro_program') {
    const program = details.program as MacroProgram | undefined
    if (!program || !program.kind) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'error',
        code: 'INVALID_MACRO_PROGRAM',
        message: 'Macro program event missing details.program.kind',
      })
    } else if (program.kind === 'serial_dilution') {
      const normalized = normalizeSerialDilutionParams(program.params)
      const manualSetup = Boolean(normalized.preparation.manualSetup)
      if (normalized.lanes.length === 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution macro has no lanes',
        })
      }
      for (const lane of normalized.lanes) {
        if (!lane.targetLabwareId) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: `Serial dilution lane ${lane.laneId} missing target labware ID`,
          })
        }
        if (lane.path.length < 2) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: `Serial dilution lane ${lane.laneId} requires at least 2 wells`,
          })
        }
        if (!lane.startSource?.kind) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: `Serial dilution lane ${lane.laneId} missing start source`,
          })
        }
        if (lane.startSource.kind === 'existing_well' && (!lane.startSource.labwareId || !lane.startSource.wellId)) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: `Serial dilution lane ${lane.laneId} requires explicit source labware and start well`,
          })
        }
      }
      if (normalized.dilution.factor <= 1) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution factor must be greater than 1',
        })
      }
      if (normalized.dilution.resolvedTransferVolume_uL <= 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution macro requires a positive transfer volume',
        })
      }
      if (normalized.dilution.resolvedPrefillVolume_uL < 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution macro has a negative resolved prefill volume',
        })
      }
      if (!normalized.preparation.topWellMode || !normalized.preparation.receivingWellMode) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution macro requires explicit preparation modes',
        })
      }
      if (!normalized.endPolicy) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution macro requires explicit last-well handling',
        })
      }
      if (!manualSetup && normalized.diluent.mode === 'material_ref' && !normalized.diluent.materialRef) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'MISSING_MATERIAL_REF',
          message: 'Serial dilution macro requires a real diluent material reference',
        })
      }
      if (!manualSetup && normalized.solventPolicy?.mode && normalized.solventPolicy.mode !== 'ignore' && !normalized.solventPolicy.matchedDiluentRef) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: normalized.solventPolicy.mode === 'enforce_constant_vehicle' ? 'error' : 'warning',
          code: 'MISSING_MATERIAL_REF',
          message: 'Serial dilution solvent policy is set but no matched diluent ref is defined',
        })
      }
      if (normalized.mode === 'prepare_then_transfer') {
        if (!normalized.preparation.transferIntoTargetAfterPreparation) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: 'Prepare-then-transfer serial dilution must enable final delivery into target wells',
          })
        }
        if (!normalized.preparation.deliveryVolume_uL || normalized.preparation.deliveryVolume_uL <= 0) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: 'Prepare-then-transfer serial dilution requires a positive delivery volume',
          })
        }
      }
      const laneLengths = new Set<number>()
      const occupiedPathWells = new Set<string>()
      const occupiedFinalTargetWells = new Set<string>()
      for (const lane of normalized.lanes) {
        laneLengths.add(lane.path.length)
        const pathLabwareId = getSerialDilutionPathLabwareId(normalized, lane)
        for (const wellId of lane.path) {
          const key = `${pathLabwareId}:${wellId}`
          if (occupiedPathWells.has(key)) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              severity: 'warning',
              code: 'INVALID_MACRO_PROGRAM',
              message: `Serial dilution lane ${lane.laneId} overlaps another lane at ${wellId}`,
            })
            break
          }
          occupiedPathWells.add(key)
        }
        if (normalized.mode === 'prepare_then_transfer') {
          if (!lane.sourceLabwareId) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              severity: 'error',
              code: 'INVALID_MACRO_PROGRAM',
              message: `Prepare-then-transfer lane ${lane.laneId} requires a source/prep labware`,
            })
          }
          if (!lane.finalTargets || lane.finalTargets.length !== lane.path.length) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              severity: 'error',
              code: 'INVALID_MACRO_PROGRAM',
              message: `Prepare-then-transfer lane ${lane.laneId} requires one final target well per dilution step`,
            })
          }
          const finalTargetLabwareId = getSerialDilutionFinalTargetLabwareId(normalized, lane)
          for (const wellId of lane.finalTargets || []) {
            const key = `${finalTargetLabwareId}:${wellId}`
            if (occupiedFinalTargetWells.has(key)) {
              errors.push({
                id: generateErrorId(),
                eventId: event.eventId,
                severity: 'warning',
                code: 'INVALID_MACRO_PROGRAM',
                message: `Final target well ${wellId} is assigned more than once in this serial dilution`,
              })
              break
            }
            occupiedFinalTargetWells.add(key)
          }
        }
      }
      if (normalized.replicates?.mode && laneLengths.size > 1) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Replicate serial dilution lanes do not all have the same length',
        })
      }
      if (!isSerialDilutionV2CurrentlyCompilable(normalized)) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Serial dilution is structurally valid but still underdetermined for expansion',
        })
      }
    } else if (program.kind === 'quadrant_replicate') {
      if (!program.params.sourceLabwareId || !program.params.targetLabwareId) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Quadrant macro missing source/target labware IDs',
        })
      }
      if (!program.params.sourceWells || program.params.sourceWells.length === 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Quadrant macro has no source wells',
        })
      }
      if (!program.params.volume_uL || program.params.volume_uL <= 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'ZERO_VOLUME_OPERATION',
          message: 'Quadrant macro has zero transfer volume',
        })
      }
    } else if (program.kind === 'spacing_transition_transfer') {
      if (!program.params.sourceLabwareId || !program.params.targetLabwareId) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Spacing transition macro missing source/target labware IDs',
        })
      }
      if (!program.params.sourceWells || program.params.sourceWells.length === 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Spacing transition macro has no source wells',
        })
      }
      if (!program.params.targetWells || program.params.targetWells.length === 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Spacing transition macro has no target wells',
        })
      }
      if (!program.params.volume_uL || program.params.volume_uL <= 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'ZERO_VOLUME_OPERATION',
          message: 'Spacing transition macro has zero transfer volume',
        })
      }
    } else if (program.kind === 'transfer_vignette') {
      if (!program.params.sourceLabwareId) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Transfer program missing source labware ID',
        })
      }
      if (!program.params.sourceWells || program.params.sourceWells.length === 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'error',
          code: 'INVALID_MACRO_PROGRAM',
          message: 'Transfer program has no source wells',
        })
      }
      if (!program.params.discardToWaste) {
        if (!program.params.targetLabwareId) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: 'Transfer program missing target labware ID',
          })
        }
        if (!program.params.targetWells || program.params.targetWells.length === 0) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: 'error',
            code: 'INVALID_MACRO_PROGRAM',
            message: 'Transfer program has no target wells',
          })
        }
      }
      if (!program.params.volume || program.params.volume.value <= 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'ZERO_VOLUME_OPERATION',
          message: 'Transfer program has zero transfer volume',
        })
      }
    }
  } else {
    // Non-transfer events
    if (!details.labwareId) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'warning',
        code: 'MISSING_LABWARE_REF',
        message: `${event.event_type} event missing labware reference`,
      })
    }
    
    const wells = details.wells as WellId[] | undefined
    if (!wells || wells.length === 0) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'error',
        code: 'MISSING_WELLS',
        message: `${event.event_type} event has no wells specified`,
      })
    }
  }
  
  // Event-specific validations
  switch (event.event_type) {
    case 'add_material': {
      const addDetails = details as AddMaterialDetails
      if (!getAddMaterialRef(addDetails)) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'MISSING_MATERIAL_REF',
          message: 'Add material event missing material reference',
        })
      }
      const hasVolume = Boolean(addDetails.volume && addDetails.volume.value > 0)
      const hasCount = typeof addDetails.count === 'number' && addDetails.count > 0
      if (!hasVolume && !hasCount) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'ZERO_VOLUME_OPERATION',
          message: 'Add material event has no positive volume or count specified',
        })
      }
      break
    }
    
    case 'transfer':
    case 'multi_dispense': {
      const transferDetails = details as TransferDetails
      if (!transferDetails.volume || transferDetails.volume.value <= 0) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'ZERO_VOLUME_OPERATION',
          message: 'Transfer event has zero or no volume specified',
        })
      }
      break
    }
    
    case 'wash': {
      const washDetails = details as WashDetails
      if (!washDetails.buffer_ref) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'info',
          code: 'MISSING_MATERIAL_REF',
          message: 'Wash event missing buffer reference',
        })
      }
      break
    }
    
    case 'incubate': {
      const incubateDetails = details as IncubateDetails
      if (!incubateDetails.duration && !incubateDetails.temperature) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          severity: 'warning',
          code: 'MISSING_REQUIRED_FIELD',
          message: 'Incubate event missing duration and temperature',
        })
      }
      break
    }
  }
  
  return errors
}

/**
 * Validate labware references exist
 */
function validateLabwareReferences(
  event: PlateEvent,
  labwares: Map<string, Labware>
): ValidationError[] {
  const errors: ValidationError[] = []
  const details = event.details as Record<string, unknown>
  
  const checkLabwareRef = (labwareId: string | undefined, context: string) => {
    if (labwareId && !labwares.has(labwareId)) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        labwareId,
        severity: 'error',
        code: 'INVALID_LABWARE_REF',
        message: `${context} references non-existent labware: ${labwareId}`,
      })
    }
  }
  
  if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
    const transferDetails = details as TransferDetails
    const normalized = normalizeTransferDetails(transferDetails)
    checkLabwareRef(normalized.sourceLabwareId, 'Source')
    checkLabwareRef(normalized.destLabwareId, 'Destination')
  } else if (event.event_type === 'macro_program') {
    const program = details.program as MacroProgram | undefined
    if (program?.kind === 'serial_dilution') {
      const normalized = normalizeSerialDilutionParams(program.params)
      for (const lane of normalized.lanes) {
        checkLabwareRef(getSerialDilutionPathLabwareId(normalized, lane), 'Serial dilution path')
        checkLabwareRef(getSerialDilutionFinalTargetLabwareId(normalized, lane), 'Serial dilution final target')
        checkLabwareRef(lane.sourceLabwareId, 'Serial dilution source')
        checkLabwareRef(lane.startSource.labwareId, 'Serial dilution start source')
      }
    }
    if (program?.kind === 'quadrant_replicate') {
      checkLabwareRef(program.params.sourceLabwareId, 'Quadrant source')
      checkLabwareRef(program.params.targetLabwareId, 'Quadrant target')
    }
    if (program?.kind === 'spacing_transition_transfer') {
      checkLabwareRef(program.params.sourceLabwareId, 'Spacing transition source')
      checkLabwareRef(program.params.targetLabwareId, 'Spacing transition target')
    }
  } else {
    checkLabwareRef(details.labwareId as string | undefined, 'Event')
  }
  
  return errors
}

function vehicleRelevantRole(role: string | undefined): boolean {
  return role === 'solvent' || role === 'buffer_component' || role === 'additive'
}

function solventProfileFromComposition(entries: CompositionEntryValue[] | undefined): Map<string, CompositionEntryValue> {
  const profile = new Map<string, CompositionEntryValue>()
  for (const entry of entries || []) {
    if (!vehicleRelevantRole(entry.role)) continue
    profile.set(`${entry.componentRef.kind}:${entry.componentRef.id}`, entry)
  }
  return profile
}

function solventProfileFromWellState(state: WellComputedState): Map<string, CompositionEntryValue> {
  const profile = new Map<string, CompositionEntryValue>()
  for (const material of state.materials) {
    if (!vehicleRelevantRole(material.role)) continue
    const componentRef = {
      kind: 'record' as const,
      id: material.materialRef,
      type: 'material',
      label: material.materialRef,
    }
    profile.set(`${componentRef.kind}:${componentRef.id}`, {
      componentRef,
      role: material.role as CompositionEntryValue['role'],
      ...(material.concentration ? { concentration: material.concentration } : {}),
    })
  }
  return profile
}

function concentrationsComparable(
  expected: ConcentrationValue | undefined,
  observed: ConcentrationValue | undefined,
  tolerance = 0.05,
): boolean {
  if (!expected || !observed) return true
  const expectedBase = concentrationToCanonicalBase(expected)
  const observedBase = concentrationToCanonicalBase(observed)
  if (expectedBase === undefined || observedBase === undefined) return true
  const baseline = Math.max(Math.abs(expectedBase), 1e-12)
  return Math.abs(expectedBase - observedBase) / baseline <= tolerance
}

function desiredVehicleComponents(normalized: ReturnType<typeof normalizeSerialDilutionParams>): CompositionEntryValue[] {
  if (normalized.solventPolicy?.targetComponents?.length) return normalized.solventPolicy.targetComponents
  if (normalized.diluent.compositionSnapshot?.length) return normalized.diluent.compositionSnapshot
  return []
}

function compareVehicleProfile(args: {
  desired: CompositionEntryValue[]
  observed: Map<string, CompositionEntryValue>
  eventId: string
  labwareId: string
  wellId: WellId
  severity: ValidationSeverity
  contextLabel: string
}): ValidationError[] {
  const errors: ValidationError[] = []
  const expectedProfile = solventProfileFromComposition(args.desired)
  for (const [key, expected] of expectedProfile) {
    const observed = args.observed.get(key)
    if (!observed) {
      errors.push({
        id: generateErrorId(),
        eventId: args.eventId,
        labwareId: args.labwareId,
        wellId: args.wellId,
        severity: args.severity,
        code: 'INVALID_MACRO_PROGRAM',
        message: `${args.contextLabel} is missing expected vehicle component ${expected.componentRef.label || expected.componentRef.id}`,
      })
      continue
    }
    if (!concentrationsComparable(expected.concentration, observed.concentration)) {
      errors.push({
        id: generateErrorId(),
        eventId: args.eventId,
        labwareId: args.labwareId,
        wellId: args.wellId,
        severity: args.severity,
        code: 'INVALID_MACRO_PROGRAM',
        message: `${args.contextLabel} has ${expected.componentRef.label || expected.componentRef.id} at ${formatConcentration(observed.concentration) || 'unknown'}, expected ${formatConcentration(expected.concentration) || 'matching vehicle'}`,
      })
    }
  }
  return errors
}

function validateSerialDilutionSetupAssumptions(
  events: PlateEvent[],
  labwares: Map<string, Labware>,
): ValidationError[] {
  const errors: ValidationError[] = []

  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.event_type !== 'macro_program') continue
    const program = (event.details as { program?: MacroProgram }).program
    if (program?.kind !== 'serial_dilution') continue

    const normalized = normalizeSerialDilutionParams(program.params)
    if (normalized.preparation.manualSetup) continue
    const priorStates = computeLabwareStates(events.slice(0, index), labwares)
    const desiredVehicle = desiredVehicleComponents(normalized)
    const enforceSeverity: ValidationSeverity = normalized.solventPolicy?.mode === 'enforce_constant_vehicle' ? 'error' : 'warning'

    if (
      normalized.solventPolicy?.mode === 'enforce_constant_vehicle'
      && normalized.solventPolicy.matchedDiluentRef
      && normalized.diluent.materialRef
      && normalized.solventPolicy.matchedDiluentRef.id !== normalized.diluent.materialRef.id
    ) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'warning',
        code: 'INVALID_MACRO_PROGRAM',
        message: 'Serial dilution enforces constant vehicle, but the matched diluent differs from the selected diluent',
      })
    }

    if (normalized.solventPolicy?.mode !== 'ignore' && desiredVehicle.length === 0) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: enforceSeverity,
        code: 'INVALID_MACRO_PROGRAM',
        message: 'Serial dilution solvent policy is set, but no composition-aware vehicle profile is available',
      })
    }

    if (
      normalized.solventPolicy?.mode !== 'ignore'
      && normalized.preparation.receivingWellMode === 'generate'
      && desiredVehicle.length > 0
      && normalized.diluent.compositionSnapshot?.length
    ) {
      const generatedProfile = solventProfileFromComposition(normalized.diluent.compositionSnapshot)
      const desiredProfile = solventProfileFromComposition(desiredVehicle)
      for (const [key, expected] of desiredProfile) {
        const observed = generatedProfile.get(key)
        if (!observed || !concentrationsComparable(expected.concentration, observed.concentration)) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            severity: enforceSeverity,
            code: 'INVALID_MACRO_PROGRAM',
            message: `Generated serial dilution prefill does not match the requested vehicle for ${expected.componentRef.label || expected.componentRef.id}`,
          })
          break
        }
      }
    }

    for (const lane of normalized.lanes) {
      const pathLabwareId = getSerialDilutionPathLabwareId(normalized, lane)
      const firstWell = lane.path[0]
      if (!pathLabwareId || !firstWell) continue

      if (normalized.preparation.receivingWellMode === 'external') {
        for (const wellId of lane.path.slice(1)) {
          const state = getWellState(priorStates, pathLabwareId, wellId)
          if (state.volume_uL + 1e-6 < normalized.dilution.resolvedPrefillVolume_uL) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              labwareId: pathLabwareId,
              wellId,
              severity: 'warning',
              code: 'INVALID_MACRO_PROGRAM',
              message: `Serial dilution assumes ${wellId} is prefilled, but prior volume is only ${state.volume_uL.toFixed(1)} µL`,
              details: {
                requiredVolume_uL: normalized.dilution.resolvedPrefillVolume_uL,
                observedVolume_uL: state.volume_uL,
              },
            })
            continue
          }
          if (normalized.solventPolicy?.mode !== 'ignore' && desiredVehicle.length > 0) {
            errors.push(...compareVehicleProfile({
              desired: desiredVehicle,
              observed: solventProfileFromWellState(state),
              eventId: event.eventId,
              labwareId: pathLabwareId,
              wellId,
              severity: enforceSeverity,
              contextLabel: `Serial dilution receiving well ${wellId}`,
            }))
          }
        }
      }

      if (normalized.preparation.topWellMode === 'external' && lane.startSource.kind === 'existing_well' && lane.startSource.labwareId && lane.startSource.wellId) {
        const startState = getWellState(priorStates, lane.startSource.labwareId, lane.startSource.wellId)
        const requiredVolume_uL = normalized.dilution.resolvedTopWellStartVolume_uL
        if (startState.volume_uL + 1e-6 < requiredVolume_uL) {
          errors.push({
            id: generateErrorId(),
            eventId: event.eventId,
            labwareId: lane.startSource.labwareId,
            wellId: lane.startSource.wellId,
            severity: 'warning',
            code: 'INSUFFICIENT_SOURCE_VOLUME',
            message: `Serial dilution assumes ${lane.startSource.wellId} already contains ${requiredVolume_uL.toFixed(1)} µL, but prior volume is ${startState.volume_uL.toFixed(1)} µL`,
            details: {
              requiredVolume_uL,
              observedVolume_uL: startState.volume_uL,
            },
          })
        }
        if (normalized.solventPolicy?.mode !== 'ignore' && desiredVehicle.length > 0) {
          errors.push(...compareVehicleProfile({
            desired: desiredVehicle,
            observed: solventProfileFromWellState(startState),
            eventId: event.eventId,
            labwareId: lane.startSource.labwareId,
            wellId: lane.startSource.wellId,
            severity: enforceSeverity,
            contextLabel: `Serial dilution start well ${lane.startSource.wellId}`,
          }))
        }
      }

      if (
        normalized.solventPolicy?.mode !== 'ignore'
        && normalized.preparation.topWellMode === 'generate'
        && lane.startSource.kind === 'material_source'
        && lane.startSource.compositionSnapshot?.length
        && desiredVehicle.length > 0
      ) {
        const expectedProfile = solventProfileFromComposition(desiredVehicle)
        const generatedProfile = solventProfileFromComposition(lane.startSource.compositionSnapshot)
        for (const [key, expected] of expectedProfile) {
          const observed = generatedProfile.get(key)
          if (observed && !concentrationsComparable(expected.concentration, observed.concentration, 0.25)) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              severity: 'warning',
              code: 'INVALID_MACRO_PROGRAM',
              message: `Starting stock contains ${expected.componentRef.label || expected.componentRef.id} at a different concentration than the requested matched vehicle`,
            })
            break
          }
          if (!observed && expected.role === 'solvent') break
        }
      }
    }
  }

  return errors
}

/**
 * Validate volume constraints after applying events
 */
function validateVolumeConstraints(
  _events: PlateEvent[],
  labwares: Map<string, Labware>,
  states: LabwareStates,
  options: ValidationOptions
): ValidationError[] {
  const errors: ValidationError[] = []
  
  // Check each well in each labware
  for (const [labwareId, labwareState] of states) {
    const labware = labwares.get(labwareId)
    if (!labware) continue
    
    const maxVolume = options.customMaxVolumes?.get(labwareId) || labware.geometry.maxVolume_uL
    const minVolume = options.minVolumeWarningThreshold || labware.geometry.minVolume_uL
    
    for (const [wellId, wellState] of labwareState) {
      // Check for negative volume (should not happen with correct computation)
      if (wellState.volume_uL < 0) {
        errors.push({
          id: generateErrorId(),
          labwareId,
          wellId,
          eventId: wellState.lastEventId || undefined,
          severity: 'error',
          code: 'NEGATIVE_VOLUME',
          message: `Well ${wellId} has negative volume (${wellState.volume_uL.toFixed(1)} µL)`,
          details: { volume: wellState.volume_uL },
        })
      }
      
      // Check for overfill
      if (wellState.volume_uL > maxVolume) {
        errors.push({
          id: generateErrorId(),
          labwareId,
          wellId,
          eventId: wellState.lastEventId || undefined,
          severity: 'error',
          code: 'OVERFILL',
          message: `Well ${wellId} exceeds max volume (${wellState.volume_uL.toFixed(1)} µL > ${maxVolume} µL)`,
          details: { 
            volume: wellState.volume_uL,
            maxVolume,
            excess: wellState.volume_uL - maxVolume,
          },
        })
      }
      
      // Low volume warning (but not empty - empty is fine)
      if (!options.errorsOnly && wellState.volume_uL > 0 && wellState.volume_uL < minVolume && !wellState.harvested) {
        errors.push({
          id: generateErrorId(),
          labwareId,
          wellId,
          eventId: wellState.lastEventId || undefined,
          severity: 'warning',
          code: 'LOW_VOLUME_WARNING',
          message: `Well ${wellId} has low volume (${wellState.volume_uL.toFixed(1)} µL < ${minVolume} µL min)`,
          details: { volume: wellState.volume_uL, minVolume },
        })
      }
    }
  }
  
  return errors
}

type ValidationTransferEdge = {
  sourceWellId: WellId
  destWellId?: WellId
  transferVolume_uL: number
}

function convertDeadVolumeToUL(
  deadVolume: TransferDetails['dead_volume'] | undefined,
  totalTransferVolume_uL: number,
): number {
  if (!deadVolume || deadVolume.value <= 0) return 0
  if (deadVolume.unit === '%') return (deadVolume.value / 100) * totalTransferVolume_uL
  if (deadVolume.unit === 'mL') return deadVolume.value * 1000
  return deadVolume.value
}

function buildTransferEdges(details: TransferDetails): ValidationTransferEdge[] {
  const normalized = normalizeTransferDetails(details)
  const mappedEdges = (normalized.mapping || [])
    .filter((edge): edge is NonNullable<typeof normalized.mapping>[number] => Boolean(edge?.source_well))
    .map((edge) => ({
      sourceWellId: edge.source_well,
      ...(edge.target_well ? { destWellId: edge.target_well } : {}),
      transferVolume_uL: edge.volume_uL ?? normalized.volume?.value ?? 0,
    }))

  if (mappedEdges.length > 0) return mappedEdges

  const sourceWells = normalized.sourceWells
  const destWells = normalized.destWells
  const transferVolume_uL = normalized.volume?.value || 0

  if (sourceWells.length === 0) return []
  if (destWells.length === 0) {
    return sourceWells.map((sourceWellId) => ({ sourceWellId, transferVolume_uL }))
  }

  const isParallelDistribution = sourceWells.length > 1
    && destWells.length > sourceWells.length
    && destWells.length % sourceWells.length === 0

  if (isParallelDistribution) {
    const destsPerSource = destWells.length / sourceWells.length
    const edges: ValidationTransferEdge[] = []
    for (let sourceIndex = 0; sourceIndex < sourceWells.length; sourceIndex++) {
      for (let destIndex = 0; destIndex < destsPerSource; destIndex++) {
        const mappedDestIndex = sourceIndex + (destIndex * sourceWells.length)
        const destWellId = destWells[mappedDestIndex]
        if (!destWellId) continue
        edges.push({
          sourceWellId: sourceWells[sourceIndex]!,
          destWellId,
          transferVolume_uL,
        })
      }
    }
    return edges
  }

  if (sourceWells.length === 1 && destWells.length >= 1) {
    return destWells.map((destWellId) => ({
      sourceWellId: sourceWells[0]!,
      destWellId,
      transferVolume_uL,
    }))
  }

  if (sourceWells.length === destWells.length) {
    return sourceWells.map((sourceWellId, index) => ({
      sourceWellId,
      destWellId: destWells[index],
      transferVolume_uL,
    }))
  }

  if (sourceWells.length > 1 && destWells.length === 1) {
    return sourceWells.map((sourceWellId) => ({
      sourceWellId,
      destWellId: destWells[0]!,
      transferVolume_uL,
    }))
  }

  return [
    ...sourceWells.map((sourceWellId) => ({
      sourceWellId,
      transferVolume_uL,
    })),
    ...destWells.map((destWellId) => ({
      sourceWellId: sourceWells[0]!,
      destWellId,
      transferVolume_uL,
    })),
  ]
}

/**
 * Validate transfer has sufficient source volume
 */
function validateTransferVolumes(
  events: PlateEvent[],
  labwares: Map<string, Labware>
): ValidationError[] {
  const errors: ValidationError[] = []
  
  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.event_type !== 'transfer' && event.event_type !== 'multi_dispense') continue

    const details = event.details as Record<string, unknown>
    const transferDetails = details as TransferDetails
    const normalized = normalizeTransferDetails(transferDetails)
    const sourceLabwareId = normalized.sourceLabwareId || (details.labwareId as string | undefined)
    if (!sourceLabwareId) continue

    const transferEdges = buildTransferEdges(transferDetails)
    const transferCountBySource = new Map<WellId, number>()
    const transferVolumeBySource = new Map<WellId, number>()

    for (const edge of transferEdges) {
      transferCountBySource.set(edge.sourceWellId, (transferCountBySource.get(edge.sourceWellId) || 0) + 1)
      transferVolumeBySource.set(
        edge.sourceWellId,
        (transferVolumeBySource.get(edge.sourceWellId) || 0) + edge.transferVolume_uL,
      )
    }

    const priorStates = computeLabwareStates(events.slice(0, index), labwares)
    for (const [wellId, transferredVolume_uL] of transferVolumeBySource) {
      const deadVolume_uL = convertDeadVolumeToUL(normalized.deadVolume, transferredVolume_uL)
      const aspirationCount = event.event_type === 'multi_dispense'
        ? 1
        : transferCountBySource.get(wellId) || 0
      const requiredVolume_uL = transferredVolume_uL + (deadVolume_uL * aspirationCount)
      const sourceState = getWellState(priorStates, sourceLabwareId, wellId)

      if (sourceState.volume_uL < requiredVolume_uL) {
        errors.push({
          id: generateErrorId(),
          eventId: event.eventId,
          labwareId: sourceLabwareId,
          wellId,
          severity: 'error',
          code: 'INSUFFICIENT_SOURCE_VOLUME',
          message: `Transfer from ${wellId}: insufficient volume (${sourceState.volume_uL.toFixed(1)} µL < ${requiredVolume_uL.toFixed(1)} µL needed)`,
          details: {
            available: sourceState.volume_uL,
            needed: requiredVolume_uL,
            transferVolume_uL: transferredVolume_uL,
            deadVolume_uL: deadVolume_uL * aspirationCount,
          },
        })
      }
    }
  }
  
  return errors
}

/**
 * Check for operations on harvested wells
 */
function validateHarvestedWells(
  events: PlateEvent[],
  _labwares: Map<string, Labware>
): ValidationError[] {
  const errors: ValidationError[] = []
  
  // Track harvested wells
  const harvestedWells: Map<string, Set<WellId>> = new Map()
  
  for (const event of events) {
    const details = event.details as Record<string, unknown>
    const labwareId = details.labwareId as string
    const wells = details.wells as WellId[] | undefined
    
    // Check if any wells in this event are harvested
    if (labwareId && wells && event.event_type !== 'harvest') {
      const harvested = harvestedWells.get(labwareId)
      if (harvested) {
        for (const wellId of wells) {
          if (harvested.has(wellId)) {
            errors.push({
              id: generateErrorId(),
              eventId: event.eventId,
              labwareId,
              wellId,
              severity: 'error',
              code: 'OPERATION_ON_HARVESTED_WELL',
              message: `Cannot perform ${event.event_type} on harvested well ${wellId}`,
            })
          }
        }
      }
    }
    
    // Track harvests
    if (event.event_type === 'harvest' && labwareId && wells) {
      const harvested = harvestedWells.get(labwareId) || new Set()
      for (const wellId of wells) {
        harvested.add(wellId)
      }
      harvestedWells.set(labwareId, harvested)
    }
  }
  
  return errors
}

/**
 * Check for duplicate event IDs
 */
function validateUniqueEventIds(events: PlateEvent[]): ValidationError[] {
  const errors: ValidationError[] = []
  const seenIds = new Set<string>()
  
  for (const event of events) {
    if (seenIds.has(event.eventId)) {
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        severity: 'error',
        code: 'DUPLICATE_EVENT_ID',
        message: `Duplicate event ID: ${event.eventId}`,
      })
    }
    seenIds.add(event.eventId)
  }
  
  return errors
}

function validateUnknownSourceConcentrations(
  events: PlateEvent[],
  labwares: Map<string, Labware>,
  options: ValidationOptions,
): ValidationError[] {
  if (options.errorsOnly) return []

  const errors: ValidationError[] = []

  for (let index = 0; index < events.length; index++) {
    const event = events[index]
    if (event.event_type !== 'transfer' && event.event_type !== 'multi_dispense') continue

    const details = event.details as Record<string, unknown>
    const transferDetails = details as TransferDetails
    const normalized = normalizeTransferDetails(transferDetails)
    const sourceLabwareId = normalized.sourceLabwareId || (details.labwareId as string | undefined)
    if (!sourceLabwareId) continue

    const priorStates = computeLabwareStates(events.slice(0, index), labwares)
    for (const wellId of normalized.sourceWells) {
      const state = getWellState(priorStates, sourceLabwareId, wellId)
      if (!state.components.some((component) => component.concentrationUnknown)) continue
      errors.push({
        id: generateErrorId(),
        eventId: event.eventId,
        labwareId: sourceLabwareId,
        wellId,
        severity: 'warning',
        code: 'UNKNOWN_SOURCE_CONCENTRATION',
        message: `Transfer from ${wellId} uses source material with unknown concentration`,
      })
    }
  }

  return errors
}

function expandEventsForValidation(
  events: PlateEvent[],
  labwares: Map<string, Labware>
): PlateEvent[] {
  const out: PlateEvent[] = []
  for (const event of events) {
    if (event.event_type === 'macro_program') {
      const expanded = compileMacroProgram(event, labwares)
      if (expanded.length > 0) {
        out.push(...expanded)
        continue
      }
    }
    out.push(event)
  }
  return out
}

/**
 * Validate an event graph
 */
export function validateEventGraph(
  events: PlateEvent[],
  labwares: Map<string, Labware>,
  options: ValidationOptions = {}
): ValidationResult {
  const allErrors: ValidationError[] = []
  const expandedEvents = expandEventsForValidation(events, labwares)
  
  // Check for empty graph
  if (events.length === 0) {
    // Not necessarily an error, just info
    if (!options.errorsOnly) {
      allErrors.push({
        id: generateErrorId(),
        severity: 'info',
        code: 'EMPTY_EVENT_GRAPH',
        message: 'Event graph is empty',
      })
    }
  }
  
  // Validate each event
  for (const event of events) {
    allErrors.push(...validateRequiredFields(event))
    allErrors.push(...validateLabwareReferences(event, labwares))
  }
  
  // Validate unique event IDs
  allErrors.push(...validateUniqueEventIds(events))
  
  // Validate harvest operations
  allErrors.push(...validateHarvestedWells(expandedEvents, labwares))
  allErrors.push(...validateSerialDilutionSetupAssumptions(events, labwares))
  
  // Validate transfer volumes
  allErrors.push(...validateTransferVolumes(expandedEvents, labwares))
  allErrors.push(...validateUnknownSourceConcentrations(expandedEvents, labwares, options))
  
  // Compute final state and validate volumes
  const computedStates = computeLabwareStates(expandedEvents, labwares)
  allErrors.push(...validateVolumeConstraints(expandedEvents, labwares, computedStates, options))
  
  // Filter if errorsOnly
  const filteredErrors = options.errorsOnly 
    ? allErrors.filter(e => e.severity === 'error')
    : allErrors
  
  // Count by severity
  const errorCount = filteredErrors.filter(e => e.severity === 'error').length
  const warningCount = filteredErrors.filter(e => e.severity === 'warning').length
  
  return {
    valid: errorCount === 0,
    errors: filteredErrors,
    errorCount,
    warningCount,
    computedStates,
  }
}

/**
 * Get validation errors for a specific event
 */
export function getEventErrors(
  result: ValidationResult,
  eventId: string
): ValidationError[] {
  return result.errors.filter(e => e.eventId === eventId)
}

/**
 * Get validation errors for a specific well
 */
export function getWellErrors(
  result: ValidationResult,
  labwareId: string,
  wellId: WellId
): ValidationError[] {
  return result.errors.filter(e => e.labwareId === labwareId && e.wellId === wellId)
}

/**
 * Format a validation error for display
 */
export function formatValidationError(error: ValidationError): string {
  const prefix = error.severity === 'error' ? '❌' : error.severity === 'warning' ? '⚠️' : 'ℹ️'
  return `${prefix} ${error.message}`
}
