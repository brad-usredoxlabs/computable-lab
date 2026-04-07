import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { WellId } from '../../types/plate'
import type { Ref } from '../../types/ref'
import type { PathSpec } from '../../shared/expanders/types'
import type {
  SerialDilutionLane,
  SerialDilutionParams,
  SerialDilutionParamsLegacy,
  SerialDilutionParamsV2,
  SerialDilutionVolumesV2,
  SerialVolumeMode,
} from '../../types/macroProgram'

export type { SerialDilutionParams } from '../../types/macroProgram'

export interface SerialDilutionRow {
  wellId: WellId
  relativeConcentration: number
}

export interface SerialDilutionPlan {
  path: WellId[]
  transferVolume_uL: number
  diluentVolume_uL: number
  targetFinalVolume_uL: number
  dilutionFactor: number
  rows: SerialDilutionRow[]
}

function parseGridWell(address: string): { row: string; col: number } | null {
  const match = address.match(/^([A-Z]+)(\d+)$/)
  if (!match) return null
  return { row: match[1], col: parseInt(match[2], 10) }
}

function parseExplicitWellPath(value: unknown): WellId[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is WellId => typeof entry === 'string' && entry.trim().length > 0)
}

function makeLaneId(index: number): string {
  return `lane-${index + 1}`
}

function refFromLegacyDiluent(value: string | undefined): Ref | undefined {
  if (!value?.trim()) return undefined
  return {
    kind: 'record',
    id: value.trim(),
    type: 'material',
    label: value.trim(),
  }
}

export function isSerialDilutionParamsV2(
  value: SerialDilutionParams | undefined | null,
): value is SerialDilutionParamsV2 {
  return Boolean(
    value
    && typeof value === 'object'
    && 'version' in value
    && (value as { version?: unknown }).version === 2
    && Array.isArray((value as { lanes?: unknown }).lanes),
  )
}

export function isSerialDilutionParamsLegacy(
  value: SerialDilutionParams | undefined | null,
): value is SerialDilutionParamsLegacy {
  return Boolean(
    value
    && typeof value === 'object'
    && 'pathSpec' in value
    && !('version' in value),
  )
}

export function resolveSerialPath(pathSpec: PathSpec, labware?: Labware): WellId[] {
  if (pathSpec.addresses && pathSpec.addresses.length > 0) {
    return pathSpec.addresses as WellId[]
  }

  if (!labware) return []
  const start = parseGridWell(pathSpec.startAddress)
  if (!start || labware.addressing.type !== 'grid') return []

  const rows = labware.addressing.rowLabels || []
  const cols = labware.addressing.columnLabels || []
  const rowIdx0 = rows.indexOf(start.row)
  const colIdx0 = cols.indexOf(String(start.col))
  if (rowIdx0 < 0 || colIdx0 < 0) return []

  const points = Math.max(2, pathSpec.stepCount || 2)
  const out: WellId[] = []
  for (let i = 0; i < points; i++) {
    let r = rowIdx0
    let c = colIdx0
    switch (pathSpec.direction) {
      case 'right': c = colIdx0 + i; break
      case 'left': c = colIdx0 - i; break
      case 'down': r = rowIdx0 + i; break
      case 'up': r = rowIdx0 - i; break
    }
    if (r < 0 || r >= rows.length || c < 0 || c >= cols.length) break
    out.push(`${rows[r]}${cols[c]}` as WellId)
  }
  return out
}

export function deriveSerialVolumes(
  mode: SerialVolumeMode,
  dilutionFactor: number,
  transferVolume_uL?: number,
  targetFinalVolume_uL?: number,
): { transferVolume_uL: number; diluentVolume_uL: number; targetFinalVolume_uL: number } {
  const df = Math.max(1.0001, dilutionFactor)
  if (mode === 'from_final') {
    const finalV = Math.max(0, targetFinalVolume_uL || 0)
    const transferV = finalV / (df - 1)
    const diluentV = finalV
    return { transferVolume_uL: transferV, diluentVolume_uL: diluentV, targetFinalVolume_uL: finalV }
  }
  const transferV = Math.max(0, transferVolume_uL || 0)
  const diluentV = transferV * (df - 1)
  return { transferVolume_uL: transferV, diluentVolume_uL: diluentV, targetFinalVolume_uL: diluentV }
}

export function deriveSerialDilutionVolumesV2(args: {
  factor: number
  volumeModel: SerialVolumeMode
  transferVolume_uL?: number
  retainedVolume_uL?: number
}): SerialDilutionVolumesV2 {
  const derived = deriveSerialVolumes(
    args.volumeModel,
    Math.max(1.0001, args.factor),
    args.transferVolume_uL,
    args.retainedVolume_uL,
  )
  const retainedVolume_uL = args.volumeModel === 'from_final'
    ? Math.max(0, args.retainedVolume_uL || 0)
    : derived.targetFinalVolume_uL

  return {
    factor: Math.max(1.0001, args.factor),
    volumeModel: args.volumeModel,
    ...(args.volumeModel === 'from_transfer' ? { transferVolume_uL: derived.transferVolume_uL } : {}),
    ...(args.volumeModel === 'from_final' ? { retainedVolume_uL } : {}),
    resolvedTransferVolume_uL: derived.transferVolume_uL,
    resolvedPrefillVolume_uL: derived.diluentVolume_uL,
    resolvedTopWellStartVolume_uL: retainedVolume_uL + derived.transferVolume_uL,
  }
}

export function normalizeSerialDilutionParams(
  value: SerialDilutionParams,
  context?: {
    fallbackLabwareId?: string
    resolvePath?: (legacy: SerialDilutionParamsLegacy) => WellId[]
  },
): SerialDilutionParamsV2 {
  if (isSerialDilutionParamsV2(value)) return value

  const resolvedPath = context?.resolvePath?.(value)
    || parseExplicitWellPath(value.pathSpec.addresses)
    || []
  const fallbackPath = resolvedPath.length > 0
    ? resolvedPath
    : (value.pathSpec.startAddress ? [value.pathSpec.startAddress as WellId] : [])
  const targetLabwareId = value.pathSpec.containerId || context?.fallbackLabwareId || ''
  const firstWell = fallbackPath[0]

  return {
    version: 2,
    mode: 'in_place',
    lanes: [{
      laneId: makeLaneId(0),
      targetLabwareId,
      startSource: {
        kind: 'existing_well',
        ...(targetLabwareId ? { labwareId: targetLabwareId } : {}),
        ...(firstWell ? { wellId: firstWell } : {}),
      },
      path: fallbackPath,
    }],
    dilution: deriveSerialDilutionVolumesV2({
      factor: value.dilutionFactor,
      volumeModel: value.volumeMode,
      transferVolume_uL: value.transferVolume_uL,
      retainedVolume_uL: value.targetFinalVolume_uL,
    }),
    diluent: {
      mode: 'material_ref',
      ...(refFromLegacyDiluent(value.diluentMaterial_ref) ? { materialRef: refFromLegacyDiluent(value.diluentMaterial_ref) } : {}),
    },
    preparation: {
      topWellMode: value.normalizeStartWell ? 'generate' : 'external',
      receivingWellMode: 'generate',
    },
    mix: {
      cycles: value.mixCycles,
      volume_uL: value.mixVolume_uL,
    },
    tipPolicy: value.tipPolicy,
    endPolicy: value.endPolicy === 'discard_last_to_waste' ? 'discard_excess' : 'keep_last',
  }
}

export function buildLegacyPathSpecFromLane(
  lane: SerialDilutionLane | undefined,
): PathSpec {
  return {
    containerId: lane?.targetLabwareId || '',
    direction: 'right',
    startAddress: lane?.path[0] || lane?.startSource.wellId || 'A1',
    stepCount: Math.max(2, lane?.path.length || 2),
    ...(lane?.path?.length ? { addresses: lane.path } : {}),
  }
}

function getStartSourceRef(startSource: SerialDilutionLane['startSource']): Ref | undefined {
  if (startSource.materialRef) return startSource.materialRef
  if (startSource.materialSpecRef) return startSource.materialSpecRef
  if (startSource.vendorProductRef) return startSource.vendorProductRef
  return undefined
}

function buildAddMaterialRefFields(ref: Ref | undefined): Record<string, unknown> {
  if (!ref) return {}
  if (ref.kind !== 'record') return { material_ref: ref }
  if (ref.type === 'material-spec') return { material_ref: ref, material_spec_ref: ref }
  if (ref.type === 'vendor-product') return { material_ref: ref, vendor_product_ref: ref }
  return { material_ref: ref }
}

function getEffectiveDiluentRef(params: SerialDilutionParamsV2): Ref | undefined {
  if (params.solventPolicy?.mode === 'enforce_constant_vehicle' && params.solventPolicy.matchedDiluentRef) {
    return params.solventPolicy.matchedDiluentRef
  }
  return params.diluent.materialRef
}

function getEffectiveDiluentComposition(params: SerialDilutionParamsV2) {
  if (params.solventPolicy?.targetComponents?.length) return params.solventPolicy.targetComponents
  return params.diluent.compositionSnapshot
}

function getEffectiveDiluentConcentration(params: SerialDilutionParamsV2) {
  return params.diluent.concentration
}

export function getSerialDilutionPathLabwareId(
  params: SerialDilutionParamsV2,
  lane: SerialDilutionLane,
): string {
  if (params.mode === 'prepare_then_transfer') {
    return lane.sourceLabwareId || lane.targetLabwareId
  }
  return lane.targetLabwareId
}

export function getSerialDilutionFinalTargetLabwareId(
  params: SerialDilutionParamsV2,
  lane: SerialDilutionLane,
): string | undefined {
  if (params.mode === 'prepare_then_transfer') return lane.targetLabwareId
  return lane.targetLabwareId
}

export function isSerialDilutionV2CurrentlyCompilable(params: SerialDilutionParamsV2): boolean {
  if (params.lanes.length === 0) return false
  if (params.dilution.resolvedTransferVolume_uL <= 0) return false
  return params.lanes.every((lane) => {
    if (lane.path.length < 2) return false
    const pathLabwareId = getSerialDilutionPathLabwareId(params, lane)
    if (!pathLabwareId) return false
    if (params.mode === 'prepare_then_transfer') {
      if (!lane.finalTargets || lane.finalTargets.length !== lane.path.length) return false
      if (!lane.targetLabwareId) return false
      if (!params.preparation.transferIntoTargetAfterPreparation) return false
      if (!params.preparation.deliveryVolume_uL || params.preparation.deliveryVolume_uL <= 0) return false
    }
    if (params.mode === 'source_to_target' && lane.startSource.kind === 'existing_well' && !lane.startSource.labwareId) {
      return false
    }
    return true
  })
}

export function buildSerialPlan(params: SerialDilutionParamsV2, lane?: SerialDilutionLane): SerialDilutionPlan {
  const serialLane = lane || params.lanes[0]
  const path = serialLane?.path || []
  const dilutionFactor = params.dilution.factor
  const transferVolume_uL = params.dilution.resolvedTransferVolume_uL
  const diluentVolume_uL = params.dilution.resolvedPrefillVolume_uL
  const targetFinalVolume_uL = params.dilution.volumeModel === 'from_final'
    ? (params.dilution.retainedVolume_uL || params.dilution.resolvedPrefillVolume_uL)
    : params.dilution.resolvedPrefillVolume_uL

  const rows: SerialDilutionRow[] = path.map((wellId, i) => ({
    wellId,
    relativeConcentration: Math.pow(1 / dilutionFactor, i),
  }))

  return {
    path,
    transferVolume_uL,
    diluentVolume_uL,
    targetFinalVolume_uL,
    dilutionFactor,
    rows,
  }
}

function makeEventId(prefix: string, idx: number): string {
  return `${prefix}-sd-${idx}-${Math.random().toString(36).slice(2, 6)}`
}

export function expandSerialDilutionToPlateEvents(
  macroEvent: PlateEvent,
  params: SerialDilutionParamsV2,
  _labware?: Labware,
): PlateEvent[] {
  if (!isSerialDilutionV2CurrentlyCompilable(params)) return []
  const events: PlateEvent[] = []
  let idx = 0
  const groupNote = `serial:${macroEvent.eventId}`

  for (const lane of params.lanes) {
    const pathLabwareId = getSerialDilutionPathLabwareId(params, lane)
    const finalTargetLabwareId = getSerialDilutionFinalTargetLabwareId(params, lane)
    const plan = buildSerialPlan(params, lane)
    if (!pathLabwareId || plan.path.length < 2) continue

    const diluentRef = getEffectiveDiluentRef(params)
    const diluentComposition = getEffectiveDiluentComposition(params)
    const diluentConcentration = getEffectiveDiluentConcentration(params)
    const laneNote = `${groupNote}:${lane.laneId}`
    const destinationWells = plan.path.slice(1)

    if (params.preparation.receivingWellMode === 'generate' && destinationWells.length > 0 && plan.diluentVolume_uL > 0) {
      events.push({
        eventId: makeEventId(macroEvent.eventId, idx++),
        event_type: 'add_material',
        t_offset: macroEvent.t_offset,
        notes: `${laneNote} prefill diluent`,
        details: {
          labwareId: pathLabwareId,
          wells: destinationWells,
          ...buildAddMaterialRefFields(diluentRef),
          ...(diluentConcentration ? { concentration: diluentConcentration } : {}),
          ...(diluentComposition?.length ? { composition_snapshot: diluentComposition } : {}),
          volume: { value: plan.diluentVolume_uL, unit: 'uL' },
        },
      })
    }

    if (params.preparation.topWellMode === 'generate') {
      const firstWell = plan.path[0]
      const startSourceRef = getStartSourceRef(lane.startSource)
      const sameExistingWell = lane.startSource.kind === 'existing_well'
        && lane.startSource.labwareId === pathLabwareId
        && lane.startSource.wellId === firstWell

      if (sameExistingWell && plan.targetFinalVolume_uL > 0) {
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'add_material',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} normalize start well`,
          details: {
            labwareId: pathLabwareId,
            wells: [firstWell],
            ...buildAddMaterialRefFields(diluentRef),
            ...(diluentConcentration ? { concentration: diluentConcentration } : {}),
            ...(diluentComposition?.length ? { composition_snapshot: diluentComposition } : {}),
            volume: { value: plan.targetFinalVolume_uL, unit: 'uL' },
          },
        })
      } else if (lane.startSource.kind === 'existing_well' && lane.startSource.labwareId && lane.startSource.wellId) {
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'transfer',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} prepare top well from source`,
          details: {
            source_labwareId: lane.startSource.labwareId,
            dest_labwareId: pathLabwareId,
            source_wells: [lane.startSource.wellId],
            dest_wells: [firstWell],
            source: { labwareInstanceId: lane.startSource.labwareId, wells: [lane.startSource.wellId] },
            target: { labwareInstanceId: pathLabwareId, wells: [firstWell] },
            volume: { value: params.dilution.resolvedTopWellStartVolume_uL, unit: 'uL' },
            ...(params.executionHints ? { execution_hints: params.executionHints } : {}),
          },
        })
      } else if (lane.startSource.kind === 'material_source' && startSourceRef) {
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'add_material',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} create top well from material source`,
          details: {
            labwareId: pathLabwareId,
            wells: [firstWell],
            ...buildAddMaterialRefFields(startSourceRef),
            ...(lane.startSource.concentration ? { concentration: lane.startSource.concentration } : {}),
            ...(lane.startSource.compositionSnapshot?.length ? { composition_snapshot: lane.startSource.compositionSnapshot } : {}),
            volume: { value: params.dilution.resolvedTopWellStartVolume_uL, unit: 'uL' },
          },
        })
      } else if (lane.startSource.kind === 'generated_top_well' && diluentRef) {
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'add_material',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} generate top well`,
          details: {
            labwareId: pathLabwareId,
            wells: [firstWell],
            ...buildAddMaterialRefFields(diluentRef),
            ...(diluentConcentration ? { concentration: diluentConcentration } : {}),
            ...(diluentComposition?.length ? { composition_snapshot: diluentComposition } : {}),
            volume: { value: params.dilution.resolvedTopWellStartVolume_uL, unit: 'uL' },
          },
        })
      }
    }

    for (let i = 0; i < plan.path.length - 1; i++) {
      const source = plan.path[i]
      const dest = plan.path[i + 1]
      events.push({
        eventId: makeEventId(macroEvent.eventId, idx++),
        event_type: 'transfer',
        t_offset: macroEvent.t_offset,
        notes: `${laneNote} step ${i + 1}/${plan.path.length - 1}`,
        details: {
          source_labwareId: pathLabwareId,
          dest_labwareId: pathLabwareId,
          source_wells: [source],
          dest_wells: [dest],
          source: { labwareInstanceId: pathLabwareId, wells: [source] },
          target: { labwareInstanceId: pathLabwareId, wells: [dest] },
          volume: { value: plan.transferVolume_uL, unit: 'uL' },
          ...(params.executionHints ? { execution_hints: params.executionHints } : {}),
        },
      })

      if (params.mix.cycles > 0 && params.mix.volume_uL > 0) {
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'mix',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} mix ${dest}`,
          details: {
            labwareId: pathLabwareId,
            wells: [dest],
            mix_count: params.mix.cycles,
            speed: `${params.mix.volume_uL}uL`,
          },
        })
      }
    }

    if (params.endPolicy === 'discard_excess' && plan.targetFinalVolume_uL > 0) {
      const last = plan.path[plan.path.length - 1]
      events.push({
        eventId: makeEventId(macroEvent.eventId, idx++),
        event_type: 'transfer',
        t_offset: macroEvent.t_offset,
        notes: `${laneNote} discard last well to waste`,
        details: {
          source_labwareId: pathLabwareId,
          source_wells: [last],
          source: { labwareInstanceId: pathLabwareId, wells: [last] },
          dest_wells: [],
          discard_to_waste: true,
          volume: { value: plan.targetFinalVolume_uL, unit: 'uL' },
        },
      })
    }

    if (
      params.mode === 'prepare_then_transfer'
      && params.preparation.transferIntoTargetAfterPreparation
      && params.preparation.deliveryVolume_uL
      && params.preparation.deliveryVolume_uL > 0
      && finalTargetLabwareId
      && lane.finalTargets
      && lane.finalTargets.length === plan.path.length
    ) {
      const deliveryVolume_uL = params.preparation.deliveryVolume_uL
      lane.finalTargets.forEach((destWell, index) => {
        const sourceWell = plan.path[index]
        if (!sourceWell || !destWell) return
        events.push({
          eventId: makeEventId(macroEvent.eventId, idx++),
          event_type: 'transfer',
          t_offset: macroEvent.t_offset,
          notes: `${laneNote} deliver ${sourceWell} to ${destWell}`,
          details: {
            source_labwareId: pathLabwareId,
            dest_labwareId: finalTargetLabwareId,
            source_wells: [sourceWell],
            dest_wells: [destWell],
            source: { labwareInstanceId: pathLabwareId, wells: [sourceWell] },
            target: { labwareInstanceId: finalTargetLabwareId, wells: [destWell] },
            volume: { value: deliveryVolume_uL, unit: 'uL' },
            ...(params.executionHints ? { execution_hints: params.executionHints } : {}),
          },
        })
      })
    }
  }

  return events
}

export function normalizeSerialDilutionEventForSave(event: PlateEvent): PlateEvent {
  if (event.event_type !== 'macro_program') return event
  const details = event.details as Record<string, unknown>
  const program = details.program as { kind?: string; params?: SerialDilutionParams } | undefined
  if (program?.kind !== 'serial_dilution' || !program.params) return event

  const fallbackLabwareId = typeof details.labwareId === 'string' && details.labwareId.trim()
    ? details.labwareId.trim()
    : undefined
  const normalized = normalizeSerialDilutionParams(program.params, {
    ...(fallbackLabwareId ? { fallbackLabwareId } : {}),
  })

  return {
    ...event,
    details: {
      ...details,
      labwareId: normalized.lanes[0]?.targetLabwareId || fallbackLabwareId,
      serialDilutionParams: normalized,
      program: {
        ...program,
        params: normalized,
      },
    } as PlateEvent['details'],
  }
}

export function normalizeEventGraphEventsForSave(events: PlateEvent[]): PlateEvent[] {
  return events.map((event) => normalizeSerialDilutionEventForSave(event))
}
