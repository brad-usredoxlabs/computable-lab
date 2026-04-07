/**
 * Types for plate events - UI representation of kernel event schemas.
 * These mirror the kernel's plate-event.schema.yaml structure.
 */

import type { WellId } from './plate'
import type { Ref } from './ref'
import type { MacroProgram } from './macroProgram'
import type { CompositionEntryValue, ConcentrationValue } from './material'

/**
 * Event type discriminator - matches kernel schema enum
 */
export type EventType =
  | 'add_material'
  | 'transfer'
  | 'multi_dispense'
  | 'mix'
  | 'wash'
  | 'incubate'
  | 'read'
  | 'harvest'
  | 'macro_program'
  | 'serial_dilution'
  | 'other'

/**
 * Event type display names
 */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  add_material: 'Add Material',
  transfer: 'Transfer',
  multi_dispense: 'Multi-Dispense',
  mix: 'Mix',
  wash: 'Wash',
  incubate: 'Incubate',
  read: 'Read',
  harvest: 'Harvest',
  macro_program: '⚙ Macro Program',
  serial_dilution: '⚙ Serial Dilution',
  other: 'Other',
}

/**
 * Event type icons (emoji for now, could be SVG later)
 */
export const EVENT_TYPE_ICONS: Record<EventType, string> = {
  add_material: '💧',
  transfer: '↔️',
  multi_dispense: '⬇️⬇️',
  mix: '🔄',
  wash: '🚿',
  incubate: '🌡️',
  read: '📊',
  harvest: '🧪',
  macro_program: '🧩',
  serial_dilution: '⚙️',
  other: '📝',
}

/**
 * Event type colors
 */
export const EVENT_TYPE_COLORS: Record<EventType, string> = {
  add_material: '#339af0',
  transfer: '#be4bdb',
  multi_dispense: '#7950f2',
  mix: '#20c997',
  wash: '#74c0fc',
  incubate: '#f59f00',
  read: '#ff6b6b',
  harvest: '#40c057',
  macro_program: '#5f3dc4',
  serial_dilution: '#845ef7',
  other: '#868e96',
}

/**
 * Base details shared by all event types
 */
interface BaseEventDetails {
  /** Labware this event applies to (for multi-labware support) */
  labwareId?: string
  /** Wells affected by this event */
  wells?: WellId[]
}

/**
 * Add material event details
 */
export interface AddMaterialDetails extends BaseEventDetails {
  material_ref?: string | Ref
  material_spec_ref?: string | Ref
  aliquot_ref?: string | Ref
  material_instance_ref?: string | Ref
  vendor_product_ref?: string | Ref
  volume?: { value: number; unit: string }
  concentration?: ConcentrationValue
  composition_snapshot?: CompositionEntryValue[]
  count?: number
  note?: string
  instance_lot?: {
    vendor?: string
    catalog_number?: string
    lot_number?: string
  }
}

/**
 * Transfer event details
 */
export interface TransferDetails extends BaseEventDetails {
  /** Source labware for cross-labware transfers */
  source_labwareId?: string
  source_wells?: WellId[]
  /** Destination labware for cross-labware transfers */
  dest_labwareId?: string
  dest_wells?: WellId[]
  volume?: { value: number; unit: string }
  /** Dead volume / overage - extra liquid aspirated and discarded (for multi-dispense accuracy) */
  dead_volume?: {
    value: number
    /** 'uL', 'mL', or '%' (percentage of total transfer volume) */
    unit: 'uL' | 'mL' | '%'
  }
  /** If true, source volume is aspirated and discarded (no destination wells required) */
  discard_to_waste?: boolean
  /** Canonical transfer endpoint shape (schema-aligned) */
  source?: {
    labwareInstanceId?: string | Ref
    wells?: WellId[]
  }
  /** Canonical transfer endpoint shape (schema-aligned) */
  target?: {
    labwareInstanceId?: string | Ref
    wells?: WellId[]
  }
  /** Optional explicit source->target mapping */
  mapping?: Array<{
    source_well: WellId
    target_well: WellId
    volume_uL?: number
  }>
  /** Optional lineage inputs (aliquot from upstream context) */
  inputs?: Array<{
    contextRef: string | Ref
    amount?: { value: number; unit: string }
  }>
  /** Optional execution-oriented hints for downstream planning/robot compilers. */
  execution_hints?: {
    tip_policy?: 'inherit' | 'new_tip_each_transfer' | 'new_tip_each_source' | 'reuse_within_batch'
    aspirate_height_mm?: number
    dispense_height_mm?: number
    air_gap?: {
      value: number
      unit: 'uL' | 'mL'
    }
    pre_mix?: {
      enabled?: boolean
      cycles?: number
      volume?: { value: number; unit: string }
    }
    post_mix?: {
      enabled?: boolean
      cycles?: number
      volume?: { value: number; unit: string }
    }
    touch_tip_after_aspirate?: boolean
    touch_tip_after_dispense?: boolean
    blowout?: boolean
  }
}

/**
 * Mix event details
 */
export interface MixDetails extends BaseEventDetails {
  mix_count?: number
  speed?: string
}

/**
 * Wash event details
 */
export interface WashDetails extends BaseEventDetails {
  buffer_ref?: string
  volume?: { value: number; unit: string }
  cycles?: number
}

/**
 * Incubate event details
 */
export interface IncubateDetails extends BaseEventDetails {
  duration?: string // ISO duration
  temperature?: { value: number; unit: string }
}

/**
 * Read event details
 */
export interface ReadDetails extends BaseEventDetails {
  assay_ref?: string
  instrument?: string
  parameters?: Record<string, unknown>
}

/**
 * Harvest event details
 */
export interface HarvestDetails extends BaseEventDetails {
  method?: string
  destination?: string
}

/**
 * Other event details (freeform)
 */
export interface OtherDetails extends BaseEventDetails {
  description?: string
}

/**
 * Macro program event details (compound event compiled to primitives for replay).
 */
export interface MacroProgramDetails extends BaseEventDetails {
  program?: MacroProgram
}

/**
 * Union type for all event details
 */
export type EventDetails =
  | AddMaterialDetails
  | TransferDetails
  | MixDetails
  | WashDetails
  | IncubateDetails
  | ReadDetails
  | HarvestDetails
  | MacroProgramDetails
  | OtherDetails

/**
 * PlateEvent - A single event in the event graph
 */
export interface PlateEvent {
  eventId: string
  event_type: EventType
  at?: string       // ISO datetime - actual execution time
  t_offset?: string // ISO duration - planned offset from run start
  notes?: string
  details: EventDetails
}

function serialDilutionPathsForRead(program: MacroProgram): WellId[] {
  if (program.kind !== 'serial_dilution') return []
  const params = program.params as unknown as Record<string, unknown>
  if (Array.isArray(params.lanes)) {
    return params.lanes.flatMap((lane) => {
      if (!lane || typeof lane !== 'object') return []
      const path = (lane as { path?: unknown }).path
      const finalTargets = (lane as { finalTargets?: unknown }).finalTargets
      return [
        ...(Array.isArray(path) ? path.filter((well): well is WellId => typeof well === 'string') : []),
        ...(Array.isArray(finalTargets) ? finalTargets.filter((well): well is WellId => typeof well === 'string') : []),
      ]
    })
  }
  const pathSpec = params.pathSpec as { addresses?: unknown } | undefined
  return Array.isArray(pathSpec?.addresses)
    ? pathSpec.addresses.filter((well): well is WellId => typeof well === 'string')
    : []
}

/**
 * Get affected wells from an event
 */
export function getAffectedWells(event: PlateEvent): WellId[] {
  const details = event.details
  const wells: WellId[] = []

  if ('wells' in details && details.wells) {
    wells.push(...details.wells)
  }
  if ('source_wells' in details && details.source_wells) {
    wells.push(...details.source_wells)
  }
  if ('dest_wells' in details && details.dest_wells) {
    wells.push(...details.dest_wells)
  }
  if ('source' in details && details.source?.wells) {
    wells.push(...details.source.wells)
  }
  if ('target' in details && details.target?.wells) {
    wells.push(...details.target.wells)
  }
  if ('mapping' in details && Array.isArray(details.mapping)) {
    for (const edge of details.mapping) {
      if (edge?.source_well) wells.push(edge.source_well)
      if (edge?.target_well) wells.push(edge.target_well)
    }
  }
  if (event.event_type === 'macro_program') {
    const program = (details as MacroProgramDetails).program
    if (program?.kind === 'serial_dilution') {
      wells.push(...serialDilutionPathsForRead(program))
    }
    if (program?.kind === 'quadrant_replicate') {
      wells.push(...program.params.sourceWells)
    }
    if (program?.kind === 'spacing_transition_transfer') {
      wells.push(...program.params.sourceWells)
      wells.push(...program.params.targetWells)
    }
    if (program?.kind === 'transfer_vignette') {
      wells.push(...program.params.sourceWells)
      wells.push(...program.params.targetWells)
    }
  }

  return [...new Set(wells)] // Deduplicate
}

/**
 * Normalized transfer details used by UI + replay regardless of wire shape.
 */
export interface NormalizedTransferDetails {
  sourceLabwareId?: string
  destLabwareId?: string
  sourceWells: WellId[]
  destWells: WellId[]
  volume?: { value: number; unit: string }
  deadVolume?: { value: number; unit: 'uL' | 'mL' | '%' }
  discardToWaste?: boolean
  mapping?: Array<{ source_well: WellId; target_well: WellId; volume_uL?: number }>
  inputs?: Array<{ contextRef: string | Ref; amount?: { value: number; unit: string } }>
  executionHints?: TransferDetails['execution_hints']
}

function refId(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && value !== null && 'id' in value) {
    const id = (value as { id?: unknown }).id
    return typeof id === 'string' ? id : undefined
  }
  return undefined
}

/**
 * Resolve transfer details from legacy (source_wells) or canonical (source/target) shape.
 */
export function normalizeTransferDetails(details: TransferDetails): NormalizedTransferDetails {
  const mappedSourceWells = (details.mapping || [])
    .map((edge) => edge.source_well)
    .filter((wellId): wellId is WellId => typeof wellId === 'string')
  const mappedDestWells = (details.mapping || [])
    .map((edge) => edge.target_well)
    .filter((wellId): wellId is WellId => typeof wellId === 'string')
  const sourceLabwareId = details.source_labwareId || refId(details.source?.labwareInstanceId)
  const destLabwareId = details.dest_labwareId || refId(details.target?.labwareInstanceId)
  const sourceWells = details.source_wells || details.source?.wells || mappedSourceWells
  const destWells = details.dest_wells || details.target?.wells || mappedDestWells

  return {
    sourceLabwareId,
    destLabwareId,
    sourceWells: [...new Set(sourceWells)],
    destWells: [...new Set(destWells)],
    volume: details.volume,
    deadVolume: details.dead_volume,
    discardToWaste: details.discard_to_waste,
    mapping: details.mapping,
    inputs: details.inputs,
    executionHints: details.execution_hints,
  }
}

/**
 * Serialize normalized transfer details to both canonical and legacy fields.
 * This keeps older UI/replay paths working while writing schema-aligned fields.
 */
export function serializeTransferDetails(
  normalized: NormalizedTransferDetails,
  base: TransferDetails = {}
): TransferDetails {
  const source = normalized.sourceLabwareId || normalized.sourceWells.length > 0
    ? {
        labwareInstanceId: normalized.sourceLabwareId,
        wells: normalized.sourceWells,
      }
    : undefined
  const target = normalized.destLabwareId || normalized.destWells.length > 0
    ? {
        labwareInstanceId: normalized.destLabwareId,
        wells: normalized.destWells,
      }
    : undefined

  return {
    ...base,
    source_labwareId: normalized.sourceLabwareId,
    dest_labwareId: normalized.destLabwareId,
    source_wells: normalized.sourceWells,
    dest_wells: normalized.destWells,
    volume: normalized.volume,
    dead_volume: normalized.deadVolume,
    discard_to_waste: normalized.discardToWaste,
    source,
    target,
    mapping: normalized.mapping,
    inputs: normalized.inputs,
    execution_hints: normalized.executionHints,
  }
}

/**
 * Ensure transfer details include canonical source/target shape.
 */
export function withCanonicalTransferDetails(details: TransferDetails): TransferDetails {
  return serializeTransferDetails(normalizeTransferDetails(details), details)
}

/**
 * Extract a display label from a ref field (could be string or Ref object)
 */
export function getRefLabel(ref: string | { label?: string; id?: string } | undefined): string {
  if (!ref) return ''
  if (typeof ref === 'string') return ref
  // Handle Ref object
  return ref.label || ref.id || ''
}

export function getAddMaterialRef(details: AddMaterialDetails): string | Ref | undefined {
  return details.aliquot_ref || details.material_instance_ref || details.material_spec_ref || details.vendor_product_ref || details.material_ref
}

export function parseMaterialLikeRef(ref: string | Ref | undefined): Ref | null {
  if (!ref) return null
  if (typeof ref === 'object' && 'kind' in ref) return ref as Ref
  if (typeof ref === 'string') {
    if (ref.includes(':')) {
      const [namespace] = ref.split(':')
      const knownNamespaces = ['CHEBI', 'CL', 'UBERON', 'GO', 'OBI', 'UO', 'NCBITAXON']
      if (knownNamespaces.includes(namespace.toUpperCase())) {
        return {
          kind: 'ontology',
          id: ref,
          namespace: namespace.toUpperCase(),
          label: ref,
        }
      }
    }
    return { kind: 'record', id: ref, type: 'material', label: ref }
  }
  return null
}

export function applyAddMaterialSelection(details: AddMaterialDetails, ref: Ref | null): AddMaterialDetails {
  const currentRef = parseMaterialLikeRef(getAddMaterialRef(details))
  const isSameRef = Boolean(
    currentRef
    && ref
    && currentRef.kind === ref.kind
    && currentRef.id === ref.id
    && (currentRef.kind === 'record' ? currentRef.type : undefined) === (ref.kind === 'record' ? ref.type : undefined)
  )
  if (!ref) {
    return {
      ...details,
      material_ref: undefined,
      material_spec_ref: undefined,
      aliquot_ref: undefined,
      material_instance_ref: undefined,
      vendor_product_ref: undefined,
      concentration: undefined,
      composition_snapshot: undefined,
      count: undefined,
      instance_lot: undefined,
    }
  }
  const next: AddMaterialDetails = {
    ...details,
    material_ref: ref,
    material_spec_ref: undefined,
    aliquot_ref: undefined,
    material_instance_ref: undefined,
    vendor_product_ref: undefined,
    ...(isSameRef ? {} : { concentration: undefined, composition_snapshot: undefined, count: undefined }),
    ...(ref.kind === 'record' && ref.type === 'material-spec' ? {} : { instance_lot: undefined }),
  }
  if (ref.kind === 'record' && ref.type === 'material-spec') {
    next.material_spec_ref = ref
  }
  if (ref.kind === 'record' && ref.type === 'aliquot') {
    next.aliquot_ref = ref
  }
  if (ref.kind === 'record' && ref.type === 'material-instance') {
    next.material_instance_ref = ref
  }
  if (ref.kind === 'record' && ref.type === 'vendor-product') {
    next.vendor_product_ref = ref
  }
  return next
}

/**
 * Get a human-readable summary of an event
 */
export function getEventSummary(event: PlateEvent): string {
  const wells = getAffectedWells(event)
  const wellCount = wells.length
  const wellPreview = wellCount > 1 && wellCount <= 6 ? wells.join(', ') : ''
  const wellStr = wellCount === 0
    ? ''
    : wellCount === 1
      ? `(${wells[0]})`
      : wellPreview
        ? `(${wellPreview})`
        : `(${wellCount} wells)`

  switch (event.event_type) {
    case 'add_material': {
      const d = event.details as AddMaterialDetails
      const vol = d.volume ? `${d.volume.value} ${d.volume.unit}` : ''
      const count = typeof d.count === 'number' && Number.isFinite(d.count) ? `${d.count}` : ''
      const materialLabel = getRefLabel(getAddMaterialRef(d) as string | { label?: string; id?: string } | undefined)
      const amount = vol || count
      return `Add ${materialLabel || 'material'} ${amount} ${wellStr}`.trim()
    }
    case 'transfer': {
      const d = event.details as TransferDetails
      return `Transfer ${d.volume ? `${d.volume.value} ${d.volume.unit}` : ''} ${wellStr}`.trim()
    }
    case 'mix': {
      const d = event.details as MixDetails
      return `Mix ${d.mix_count ? `${d.mix_count}x` : ''} ${wellStr}`.trim()
    }
    case 'wash': {
      const d = event.details as WashDetails
      return `Wash ${d.cycles ? `${d.cycles}x` : ''} ${wellStr}`.trim()
    }
    case 'incubate': {
      const d = event.details as IncubateDetails
      const temp = d.temperature ? `at ${d.temperature.value}${d.temperature.unit}` : ''
      return `Incubate ${d.duration || ''} ${temp} ${wellStr}`.trim()
    }
    case 'read': {
      const d = event.details as ReadDetails
      return `Read ${d.assay_ref || ''} ${wellStr}`.trim()
    }
    case 'harvest': {
      const d = event.details as HarvestDetails
      return `Harvest ${d.method || ''} ${wellStr}`.trim()
    }
    case 'macro_program': {
      const d = event.details as MacroProgramDetails
      if (d.program?.kind === 'transfer_vignette') {
        const label = typeof d.program.template_ref === 'object' && d.program.template_ref !== null && 'label' in d.program.template_ref
          ? d.program.template_ref.label || d.program.template_ref.id
          : d.program.template_ref?.id
        return `${label || 'Transfer Program'} ${wellStr}`.trim()
      }
      const programKind = d.program?.kind || 'macro'
      return `Macro ${programKind.replace(/_/g, ' ')} ${wellStr}`.trim()
    }
    case 'other': {
      const d = event.details as OtherDetails
      return d.description || 'Other event'
    }
    default:
      return EVENT_TYPE_LABELS[event.event_type]
  }
}

/**
 * Sort events by time (t_offset or at)
 */
export function sortEventsByTime(events: PlateEvent[]): PlateEvent[] {
  return [...events].sort((a, b) => {
    // Prefer t_offset for sorting, fallback to at
    const aTime = a.t_offset || a.at || ''
    const bTime = b.t_offset || b.at || ''
    return aTime.localeCompare(bTime)
  })
}

/**
 * Generate a unique event ID
 */
export function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
}

/**
 * Create an empty event of a given type
 */
export function createEmptyEvent(eventType: EventType): PlateEvent {
  return {
    eventId: generateEventId(),
    event_type: eventType,
    t_offset: 'PT0M',
    details: (eventType === 'transfer' || eventType === 'multi_dispense')
      ? { source_wells: [], dest_wells: [] }
      : { wells: [] },
  }
}
