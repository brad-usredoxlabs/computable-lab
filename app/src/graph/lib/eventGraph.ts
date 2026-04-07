/**
 * Event Graph State Computation Library.
 *
 * Computes the state of each well/slot after applying all events in the graph.
 * Tracks volumes, materials, and event history.
 */

import type { WellId } from '../../types/plate'
import type { Labware } from '../../types/labware'
import type {
  PlateEvent,
  AddMaterialDetails,
  TransferDetails,
  MixDetails,
  WashDetails,
  IncubateDetails,
  HarvestDetails,
} from '../../types/events'
import { getAddMaterialRef, getRefLabel, normalizeTransferDetails } from '../../types/events'
import {
  inferConcentrationBasis,
  normalizeConcentrationUnit,
  type ConcentrationBasis,
  type ConcentrationValue,
} from '../../types/material'
import { compileMacroProgram } from './macroPrograms'

export interface MaterialEntry {
  materialRef: string
  role?: string
  materialSpecRef?: string
  aliquotRef?: string
  materialInstanceRef?: string
  vendorProductRef?: string
  volume_uL: number
  concentration?: ConcentrationValue
  concentrationUnknown?: boolean
  count?: number
  sourceEventId: string
}

type CanonicalAmountKind = 'mol' | 'g' | 'U' | 'count' | 'uL' | 'ratio'

export interface WellComponentLedgerEntry {
  componentKey: string
  materialRef: string
  role?: string
  materialSpecRef?: string
  aliquotRef?: string
  materialInstanceRef?: string
  vendorProductRef?: string
  carrierVolume_uL: number
  concentrationUnit?: string
  concentrationBasis?: ConcentrationBasis
  canonicalAmountKind?: CanonicalAmountKind
  canonicalAmountValue?: number
  concentrationUnknown: boolean
  count?: number
  sourceEventId: string
}

export interface WellComputedState {
  volume_uL: number
  components: WellComponentLedgerEntry[]
  materials: MaterialEntry[]
  eventHistory: string[]
  lastEventId: string | null
  harvested: boolean
  incubations: Array<{
    duration?: string
    temperature?: { value: number; unit: string }
    eventId: string
  }>
}

type ConcentrationDescriptor = {
  basis?: ConcentrationBasis
  amountKind: CanonicalAmountKind
  baseVolume: 'L' | 'mL' | 'uL'
  toCanonicalPerBaseVolume: (value: number) => number
  fromCanonicalPerBaseVolume: (value: number) => number
}

const CONCENTRATION_DESCRIPTORS: Record<string, ConcentrationDescriptor> = {
  M: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
  mM: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-3,
    fromCanonicalPerBaseVolume: (value) => value / 1e-3,
  },
  uM: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-6,
    fromCanonicalPerBaseVolume: (value) => value / 1e-6,
  },
  nM: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-9,
    fromCanonicalPerBaseVolume: (value) => value / 1e-9,
  },
  pM: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-12,
    fromCanonicalPerBaseVolume: (value) => value / 1e-12,
  },
  fM: {
    basis: 'molar',
    amountKind: 'mol',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-15,
    fromCanonicalPerBaseVolume: (value) => value / 1e-15,
  },
  'g/L': {
    basis: 'mass_per_volume',
    amountKind: 'g',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
  'mg/mL': {
    basis: 'mass_per_volume',
    amountKind: 'g',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
  'ug/mL': {
    basis: 'mass_per_volume',
    amountKind: 'g',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-3,
    fromCanonicalPerBaseVolume: (value) => value / 1e-3,
  },
  'ng/mL': {
    basis: 'mass_per_volume',
    amountKind: 'g',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 1e-6,
    fromCanonicalPerBaseVolume: (value) => value / 1e-6,
  },
  'U/mL': {
    basis: 'activity_per_volume',
    amountKind: 'U',
    baseVolume: 'mL',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
  'U/uL': {
    basis: 'activity_per_volume',
    amountKind: 'U',
    baseVolume: 'mL',
    toCanonicalPerBaseVolume: (value) => value * 1000,
    fromCanonicalPerBaseVolume: (value) => value / 1000,
  },
  'cells/mL': {
    basis: 'count_per_volume',
    amountKind: 'count',
    baseVolume: 'mL',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
  'cells/uL': {
    basis: 'count_per_volume',
    amountKind: 'count',
    baseVolume: 'mL',
    toCanonicalPerBaseVolume: (value) => value * 1000,
    fromCanonicalPerBaseVolume: (value) => value / 1000,
  },
  '% v/v': {
    basis: 'volume_fraction',
    amountKind: 'uL',
    baseVolume: 'uL',
    toCanonicalPerBaseVolume: (value) => value / 100,
    fromCanonicalPerBaseVolume: (value) => value * 100,
  },
  '% w/v': {
    basis: 'mass_fraction',
    amountKind: 'g',
    baseVolume: 'L',
    toCanonicalPerBaseVolume: (value) => value * 10,
    fromCanonicalPerBaseVolume: (value) => value / 10,
  },
  '%': {
    amountKind: 'uL',
    baseVolume: 'uL',
    toCanonicalPerBaseVolume: (value) => value / 100,
    fromCanonicalPerBaseVolume: (value) => value * 100,
  },
  X: {
    amountKind: 'ratio',
    baseVolume: 'uL',
    toCanonicalPerBaseVolume: (value) => value,
    fromCanonicalPerBaseVolume: (value) => value,
  },
}

function createEmptyWellState(): WellComputedState {
  return {
    volume_uL: 0,
    components: [],
    materials: [],
    eventHistory: [],
    lastEventId: null,
    harvested: false,
    incubations: [],
  }
}

function cloneWellState(state: WellComputedState): WellComputedState {
  return {
    volume_uL: state.volume_uL,
    components: state.components.map((component) => ({ ...component })),
    materials: state.materials.map((material) => ({
      ...material,
      concentration: material.concentration ? { ...material.concentration } : undefined,
    })),
    eventHistory: [...state.eventHistory],
    lastEventId: state.lastEventId,
    harvested: state.harvested,
    incubations: state.incubations.map((incubation) => ({
      ...incubation,
      temperature: incubation.temperature ? { ...incubation.temperature } : undefined,
    })),
  }
}

function toBaseVolume(volume_uL: number, baseVolume: ConcentrationDescriptor['baseVolume']): number {
  if (baseVolume === 'L') return volume_uL / 1_000_000
  if (baseVolume === 'mL') return volume_uL / 1_000
  return volume_uL
}

function normalizeConcentration(concentration?: ConcentrationValue): ConcentrationValue | undefined {
  if (!concentration) return undefined
  const unit = normalizeConcentrationUnit(concentration.unit)
  return {
    ...concentration,
    unit,
    ...(concentration.basis || inferConcentrationBasis(unit)
      ? { basis: concentration.basis || inferConcentrationBasis(unit) }
      : {}),
  }
}

function getDescriptor(concentration?: ConcentrationValue): ConcentrationDescriptor | null {
  if (!concentration?.unit) return null
  return CONCENTRATION_DESCRIPTORS[normalizeConcentrationUnit(concentration.unit)] ?? null
}

function getRecordId(ref: string | { id?: string } | undefined): string | undefined {
  return typeof ref === 'string' ? ref : ref?.id
}

function addMaterialSourceKey(details: AddMaterialDetails, materialLabel: string): string {
  return getRecordId(details.aliquot_ref)
    || getRecordId(details.material_instance_ref)
    || getRecordId(details.material_spec_ref)
    || getRecordId(details.vendor_product_ref)
    || getRecordId(details.material_ref)
    || materialLabel
}

function createComponentKey(details: AddMaterialDetails, materialLabel: string, componentId?: string): string {
  const sourceKey = addMaterialSourceKey(details, materialLabel)
  return componentId ? `${sourceKey}::${componentId}` : sourceKey
}

function createLedgerEntry(
  event: PlateEvent,
  details: AddMaterialDetails,
  materialLabel: string,
  options?: {
    componentId?: string
    concentration?: ConcentrationValue
    role?: string
    count?: number
  },
): WellComponentLedgerEntry {
  const normalizedConcentration = normalizeConcentration(options?.concentration ?? details.concentration)
  const descriptor = getDescriptor(normalizedConcentration)
  const volume_uL = details.volume?.value || 0
  const canComputeAmount = Boolean(normalizedConcentration && descriptor && volume_uL > 0)
  const canonicalAmountValue = canComputeAmount
    ? descriptor!.toCanonicalPerBaseVolume(normalizedConcentration!.value) * toBaseVolume(volume_uL, descriptor!.baseVolume)
    : undefined

  return {
    componentKey: createComponentKey(details, materialLabel, options?.componentId),
    materialRef: materialLabel,
    ...(options?.role ? { role: options.role } : {}),
    ...(getRecordId(details.material_spec_ref) ? { materialSpecRef: getRecordId(details.material_spec_ref) } : {}),
    ...(getRecordId(details.aliquot_ref) ? { aliquotRef: getRecordId(details.aliquot_ref) } : {}),
    ...(getRecordId(details.material_instance_ref) ? { materialInstanceRef: getRecordId(details.material_instance_ref) } : {}),
    ...(getRecordId(details.vendor_product_ref) ? { vendorProductRef: getRecordId(details.vendor_product_ref) } : {}),
    carrierVolume_uL: volume_uL,
    ...(normalizedConcentration?.unit ? { concentrationUnit: normalizedConcentration.unit } : {}),
    ...(normalizedConcentration?.basis || descriptor?.basis
      ? { concentrationBasis: normalizedConcentration?.basis || descriptor?.basis }
      : {}),
    ...(descriptor?.amountKind ? { canonicalAmountKind: descriptor.amountKind } : {}),
    ...(canonicalAmountValue !== undefined ? { canonicalAmountValue } : {}),
    concentrationUnknown: Boolean(normalizedConcentration && !canComputeAmount),
    ...(typeof options?.count === 'number' ? { count: options.count } : {}),
    sourceEventId: event.eventId,
  }
}

function mergeLedgerEntry(entries: WellComponentLedgerEntry[], incoming: WellComponentLedgerEntry): WellComponentLedgerEntry[] {
  const existing = entries.find((entry) => entry.componentKey === incoming.componentKey)
  if (!existing) return [...entries, incoming]

  existing.carrierVolume_uL += incoming.carrierVolume_uL
  if (typeof incoming.count === 'number') {
    existing.count = (existing.count || 0) + incoming.count
  }

  const compatibleKnownAmount = (
    existing.canonicalAmountKind
    && incoming.canonicalAmountKind
    && existing.canonicalAmountKind === incoming.canonicalAmountKind
    && existing.concentrationUnit === incoming.concentrationUnit
  )

  if (
    compatibleKnownAmount
    && existing.canonicalAmountValue !== undefined
    && incoming.canonicalAmountValue !== undefined
  ) {
    existing.canonicalAmountValue += incoming.canonicalAmountValue
  } else if (
    incoming.canonicalAmountValue !== undefined
    && existing.canonicalAmountValue === undefined
    && !existing.concentrationUnknown
  ) {
    existing.canonicalAmountValue = incoming.canonicalAmountValue
    existing.canonicalAmountKind = incoming.canonicalAmountKind
    existing.concentrationUnit = incoming.concentrationUnit
    existing.concentrationBasis = incoming.concentrationBasis
  } else if (
    incoming.canonicalAmountValue !== undefined
    && existing.canonicalAmountValue !== undefined
    && !compatibleKnownAmount
  ) {
    existing.concentrationUnknown = true
  }

  existing.concentrationUnknown = existing.concentrationUnknown || incoming.concentrationUnknown
  return entries
}

function isMeaningfulComponent(component: WellComponentLedgerEntry): boolean {
  return component.carrierVolume_uL > 0.001
    || (component.canonicalAmountValue || 0) > 0
    || (component.count || 0) > 0
}

function transferLedgerEntries(sourceState: WellComputedState, transferVolume_uL: number): WellComponentLedgerEntry[] {
  if (transferVolume_uL <= 0 || sourceState.volume_uL <= 0) return []
  const fraction = Math.min(1, transferVolume_uL / sourceState.volume_uL)
  return sourceState.components
    .map((component) => ({
      ...component,
      carrierVolume_uL: component.carrierVolume_uL * fraction,
      ...(component.canonicalAmountValue !== undefined
        ? { canonicalAmountValue: component.canonicalAmountValue * fraction }
        : {}),
      ...(typeof component.count === 'number' ? { count: component.count * fraction } : {}),
    }))
    .filter(isMeaningfulComponent)
}

function deriveMaterialEntry(component: WellComponentLedgerEntry, totalVolume_uL: number): MaterialEntry {
  const descriptor = component.concentrationUnit ? CONCENTRATION_DESCRIPTORS[component.concentrationUnit] ?? null : null
  let concentration: ConcentrationValue | undefined

  if (
    !component.concentrationUnknown
    && descriptor
    && component.canonicalAmountValue !== undefined
    && totalVolume_uL > 0
  ) {
    const baseVolume = toBaseVolume(totalVolume_uL, descriptor.baseVolume)
    const canonicalPerBaseVolume = baseVolume > 0 ? component.canonicalAmountValue / baseVolume : 0
    concentration = {
      value: Number(descriptor.fromCanonicalPerBaseVolume(canonicalPerBaseVolume).toFixed(6)),
      unit: component.concentrationUnit!,
      ...(component.concentrationBasis ? { basis: component.concentrationBasis } : {}),
    }
  }

  return {
    materialRef: component.materialRef,
    ...(component.role ? { role: component.role } : {}),
    ...(component.materialSpecRef ? { materialSpecRef: component.materialSpecRef } : {}),
    ...(component.aliquotRef ? { aliquotRef: component.aliquotRef } : {}),
    ...(component.materialInstanceRef ? { materialInstanceRef: component.materialInstanceRef } : {}),
    ...(component.vendorProductRef ? { vendorProductRef: component.vendorProductRef } : {}),
    volume_uL: component.carrierVolume_uL,
    ...(concentration ? { concentration } : {}),
    ...(component.concentrationUnknown ? { concentrationUnknown: true } : {}),
    ...(typeof component.count === 'number' ? { count: component.count } : {}),
    sourceEventId: component.sourceEventId,
  }
}

function materialDisplayPriority(material: MaterialEntry): number {
  if (material.role === 'solute' || material.role === 'activity_source' || material.role === 'cells') return 0
  if (material.concentration || material.concentrationUnknown) return 1
  if (material.role === 'additive' || material.role === 'buffer_component') return 2
  if (material.role === 'solvent') return 3
  return 4
}

function syncDerivedMaterials(state: WellComputedState): WellComputedState {
  state.materials = state.components
    .map((component) => deriveMaterialEntry(component, state.volume_uL))
    .filter((material) => material.volume_uL > 0.001 || typeof material.count === 'number')
    .sort((a, b) =>
      materialDisplayPriority(a) - materialDisplayPriority(b)
      || a.materialRef.localeCompare(b.materialRef)
    )
  return state
}

function applyAddMaterial(state: WellComputedState, event: PlateEvent, details: AddMaterialDetails): WellComputedState {
  const newState = cloneWellState(state)
  const volume = details.volume?.value || 0

  newState.volume_uL += volume
  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  const materialLabel = getRefLabel(getAddMaterialRef(details) as string | { label?: string; id?: string } | undefined)
  const snapshot = Array.isArray(details.composition_snapshot) ? details.composition_snapshot : []
  if (snapshot.length > 0) {
    snapshot.forEach((entry, index) => {
      const componentLabel = entry.componentRef?.label || entry.componentRef?.id || materialLabel || `component_${index + 1}`
      const count = typeof details.count === 'number' && (entry.role === 'cells' || snapshot.length === 1) ? details.count : undefined
      newState.components = mergeLedgerEntry(newState.components, createLedgerEntry(event, details, componentLabel, {
        componentId: entry.componentRef?.id || `${index + 1}`,
        concentration: entry.concentration,
        role: entry.role,
        count,
      }))
    })
  } else if (materialLabel) {
    newState.components = mergeLedgerEntry(newState.components, createLedgerEntry(event, details, materialLabel, {
      count: typeof details.count === 'number' ? details.count : undefined,
    }))
  }

  return syncDerivedMaterials(newState)
}

function applyTransferSource(state: WellComputedState, event: PlateEvent, details: TransferDetails): WellComputedState {
  const newState = cloneWellState(state)
  const volume = details.volume?.value || 0

  newState.volume_uL = Math.max(0, newState.volume_uL - volume)
  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  if (volume > 0 && state.volume_uL > 0) {
    const fraction = Math.max(0, 1 - (volume / state.volume_uL))
    newState.components = newState.components
      .map((component) => ({
        ...component,
        carrierVolume_uL: component.carrierVolume_uL * fraction,
        ...(component.canonicalAmountValue !== undefined
          ? { canonicalAmountValue: component.canonicalAmountValue * fraction }
          : {}),
        ...(typeof component.count === 'number' ? { count: component.count * fraction } : {}),
      }))
      .filter(isMeaningfulComponent)
  }

  return syncDerivedMaterials(newState)
}

function applyTransferDest(
  state: WellComputedState,
  sourceState: WellComputedState,
  event: PlateEvent,
  details: TransferDetails,
): WellComputedState {
  const newState = cloneWellState(state)
  const volume = details.volume?.value || 0

  newState.volume_uL += volume
  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  if (volume > 0 && sourceState.volume_uL > 0) {
    for (const component of transferLedgerEntries(sourceState, volume)) {
      newState.components = mergeLedgerEntry(newState.components, {
        ...component,
        sourceEventId: event.eventId,
      })
    }
  }

  return syncDerivedMaterials(newState)
}

function applyWash(state: WellComputedState, event: PlateEvent, details: WashDetails): WellComputedState {
  const newState = cloneWellState(state)
  const washVolume = details.volume?.value || 0

  newState.components = newState.components.filter((component) =>
    component.materialRef.toLowerCase().includes('cell')
    || component.materialRef.toLowerCase().includes('bound'),
  )
  newState.volume_uL = washVolume

  if (details.buffer_ref && washVolume > 0) {
    newState.components = mergeLedgerEntry(newState.components, {
      componentKey: details.buffer_ref,
      materialRef: details.buffer_ref,
      carrierVolume_uL: washVolume,
      concentrationUnknown: false,
      sourceEventId: event.eventId,
    })
  }

  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  return syncDerivedMaterials(newState)
}

function applyIncubate(state: WellComputedState, event: PlateEvent, details: IncubateDetails): WellComputedState {
  const newState = cloneWellState(state)

  newState.incubations.push({
    duration: details.duration,
    temperature: details.temperature,
    eventId: event.eventId,
  })
  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  return syncDerivedMaterials(newState)
}

function applyHarvest(state: WellComputedState, event: PlateEvent, _details: HarvestDetails): WellComputedState {
  const newState = cloneWellState(state)

  newState.harvested = true
  newState.volume_uL = 0
  newState.components = []
  newState.materials = []
  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  return newState
}

function applyMix(state: WellComputedState, event: PlateEvent, _details: MixDetails): WellComputedState {
  const newState = cloneWellState(state)

  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  return syncDerivedMaterials(newState)
}

function applyGenericEvent(state: WellComputedState, event: PlateEvent): WellComputedState {
  const newState = cloneWellState(state)

  newState.eventHistory.push(event.eventId)
  newState.lastEventId = event.eventId

  return syncDerivedMaterials(newState)
}

export type LabwareStates = Map<string, Map<WellId, WellComputedState>>

type TransferEdge = {
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

function buildTransferEdges(normalized: ReturnType<typeof normalizeTransferDetails>): TransferEdge[] {
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
    const edges: TransferEdge[] = []
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

export function computeLabwareStates(events: PlateEvent[], labwares: Map<string, Labware>): LabwareStates {
  const eventsToProcess: PlateEvent[] = []
  for (const event of events) {
    if (event.event_type === 'macro_program') {
      const expanded = compileMacroProgram(event, labwares)
      if (expanded.length > 0) {
        eventsToProcess.push(...expanded)
        continue
      }
    }
    eventsToProcess.push(event)
  }

  const states: LabwareStates = new Map()
  for (const [labwareId] of labwares) {
    states.set(labwareId, new Map())
  }

  for (const event of eventsToProcess) {
    const details = event.details as Record<string, unknown>
    const labwareId = details.labwareId as string | undefined
    const eventType = event.event_type

    if (eventType === 'transfer' || eventType === 'multi_dispense') {
      const transferDetails = details as TransferDetails
      const normalized = normalizeTransferDetails(transferDetails)
      const sourceLabwareId = normalized.sourceLabwareId || labwareId
      const destLabwareId = normalized.destLabwareId || labwareId
      const transferEdges = buildTransferEdges(normalized)
      const sourceLabwareState = states.get(sourceLabwareId || '') || new Map()
      const destLabwareState = states.get(destLabwareId || '') || new Map()

      const transferCountBySource = new Map<WellId, number>()
      const transferVolumeBySource = new Map<WellId, number>()
      for (const edge of transferEdges) {
        transferCountBySource.set(edge.sourceWellId, (transferCountBySource.get(edge.sourceWellId) || 0) + 1)
        transferVolumeBySource.set(
          edge.sourceWellId,
          (transferVolumeBySource.get(edge.sourceWellId) || 0) + edge.transferVolume_uL,
        )
      }

      const sourceStatesBeforeTransfer = new Map<WellId, WellComputedState>()
      for (const [sourceWellId, transferredVolume_uL] of transferVolumeBySource) {
        const sourceState = sourceLabwareState.get(sourceWellId) || createEmptyWellState()
        sourceStatesBeforeTransfer.set(sourceWellId, sourceState)
        const totalRemovedVolume_uL = transferredVolume_uL + convertDeadVolumeToUL(
          normalized.deadVolume,
          transferredVolume_uL,
        ) * (
          eventType === 'multi_dispense'
            ? 1
            : transferCountBySource.get(sourceWellId) || 0
        )
        sourceLabwareState.set(sourceWellId, applyTransferSource(sourceState, event, {
          ...transferDetails,
          volume: { value: totalRemovedVolume_uL, unit: 'uL' },
        }))
      }

      for (const edge of transferEdges) {
        if (!edge.destWellId) continue
        const sourceState = sourceStatesBeforeTransfer.get(edge.sourceWellId) || createEmptyWellState()
        const destState = destLabwareState.get(edge.destWellId) || createEmptyWellState()
        destLabwareState.set(edge.destWellId, applyTransferDest(destState, sourceState, event, {
          ...transferDetails,
          volume: { value: edge.transferVolume_uL, unit: 'uL' },
        }))
      }

      if (sourceLabwareId) states.set(sourceLabwareId, sourceLabwareState)
      if (destLabwareId) states.set(destLabwareId, destLabwareState)
      continue
    }

    if (!labwareId) continue

    const labwareState = states.get(labwareId) || new Map()
    const wells = (details.wells as WellId[]) || []

    for (const wellId of wells) {
      const currentState = labwareState.get(wellId) || createEmptyWellState()
      let newState: WellComputedState

      switch (eventType) {
        case 'add_material':
          newState = applyAddMaterial(currentState, event, details as AddMaterialDetails)
          break
        case 'wash':
          newState = applyWash(currentState, event, details as WashDetails)
          break
        case 'incubate':
          newState = applyIncubate(currentState, event, details as IncubateDetails)
          break
        case 'harvest':
          newState = applyHarvest(currentState, event, details as HarvestDetails)
          break
        case 'mix':
          newState = applyMix(currentState, event, details as MixDetails)
          break
        case 'read':
        case 'other':
        default:
          newState = applyGenericEvent(currentState, event)
          break
      }

      labwareState.set(wellId, newState)
    }

    states.set(labwareId, labwareState)
  }

  return states
}

export function getWellState(states: LabwareStates, labwareId: string, wellId: WellId): WellComputedState {
  const labwareState = states.get(labwareId)
  if (!labwareState) return createEmptyWellState()
  return labwareState.get(wellId) || createEmptyWellState()
}

export function getWellEvents(events: PlateEvent[], labwareId: string, wellId: WellId): PlateEvent[] {
  return events.filter((event) => {
    const details = event.details as Record<string, unknown>

    if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
      const transferDetails = details as TransferDetails
      const normalized = normalizeTransferDetails(transferDetails)
      const sourceLabwareId = normalized.sourceLabwareId || details.labwareId
      const destLabwareId = normalized.destLabwareId || details.labwareId

      if (sourceLabwareId === labwareId && normalized.sourceWells.includes(wellId)) return true
      if (destLabwareId === labwareId && normalized.destWells.includes(wellId)) return true
      return false
    }

    if (details.labwareId !== labwareId) return false
    const wells = (details.wells as WellId[]) || []
    return wells.includes(wellId)
  })
}

export function formatVolume(volume_uL: number): string {
  if (volume_uL === 0) return '0 µL'
  if (volume_uL < 1) return `${(volume_uL * 1000).toFixed(1)} nL`
  if (volume_uL >= 1000) return `${(volume_uL / 1000).toFixed(2)} mL`
  return `${volume_uL.toFixed(1)} µL`
}

export function getMaterialsSummary(state: WellComputedState): string {
  if (state.materials.length === 0) return 'Empty'
  if (state.harvested) return 'Harvested'

  return state.materials
    .map((material) => {
      if (material.concentrationUnknown) return `${material.materialRef} @ unknown`
      if (material.concentration) return `${material.materialRef} @ ${material.concentration.value} ${material.concentration.unit}`
      if (typeof material.count === 'number') return `${material.materialRef} @ ${material.count.toFixed(0)} count`
      return material.materialRef
    })
    .slice(0, 3)
    .join(', ') + (state.materials.length > 3 ? ` +${state.materials.length - 3} more` : '')
}
