/**
 * LabwareEventEditor - Multi-labware event graph editor page.
 * 
 * Layout:
 * - Top: Labware selector bar
 * - Middle: EventRibbon (horizontal pills + form)
 * - Bottom: Source/Target labware side-by-side (with well tooltips)
 * - Below: Well context panel (selected wells event history)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { apiClient, type TemplateLabwareBinding, type TemplateOutputArtifact } from '../shared/api/client'
import {
  createUpstreamRunForInput,
  getRunMethod,
  promoteRunOutput,
  useExistingPlateForInput,
  type RunMethodSummaryResponse,
  type TemplateInputResolution,
} from '../shared/api/treeClient'
import { LabwareEditorProvider, useLabwareEditor, type LabwareEditorState } from './context/LabwareEditorContext'
import { DualLabwarePane } from './labware/DualLabwarePane'
import { DeckVisualizationPanel, type DeckPlacement } from './labware/DeckVisualizationPanel'
import { EventRibbon } from './events/ribbon'
import { WellContextPanelV2, type SelectedWell } from './wellcontext/WellContextPanelV2'
import type { SelectedTool } from './tools'
import { VocabPackSelector } from './events/VocabPackSelector'
import { RoleAssignmentPanel } from './semantic'
import { useRegisterAiChat } from '../shared/context/AiPanelContext'
import { RefPicker, type Ref } from '../shared/ref'
import { ReadoutContextPanel } from './readouts/ReadoutContextPanel'
import { usePlatformRegistry } from '../shared/hooks/usePlatformRegistry'
import { useToolConstraints } from './hooks/useToolConstraints'
import { useAiChat } from '../shared/hooks/useAiChat'
import { useLabwareAiContext } from './hooks/useLabwareAiContext'
import { useBiologyMode } from './hooks/useBiologyMode'
import { useReadoutsMode } from './hooks/useReadoutsMode'
import { useResultsMode } from './hooks/useResultsMode'
import { useEditorMode } from './hooks/useEditorMode'
import type { PlateEvent, TransferDetails } from '../types/events'
import { getEventSummary, normalizeTransferDetails, withCanonicalTransferDetails } from '../types/events'
import type { WellId } from '../types/plate'
import type { MacroProgram } from '../types/macroProgram'
import type { Labware, LabwareType, LabwareRecordPayload } from '../types/labware'
import { getLabwareDefaultOrientation, getLabwareWellIds, isTipRackType, normalizeLabwareWithDefinition } from '../types/labware'
import type { LabwareOrientation } from './labware/LabwareCanvas'
import { flatSelection, infoMessage, validResult, warningMessage, type SelectionExpansion } from './tools'
import { createGridViewTransform, getCanonicalPitchMm, resolveEffectiveLinearAxisForLabware, resolveOrientationForLabware } from './lib/labwareView'
import { getEventFocusTargets } from './lib/eventFocus'
import { buildLabwareEditorFixture, type LabwareEditorFixtureName } from './fixtures/labwareEditorFixtures'
import type { ValidationMessage } from './tools'
import { ApiError } from '../shared/api/errors'
import { buildTemplateSnapshot } from './lib/templateSnapshot'
import { materializedTemplateToState } from './lib/templateLoader'
import { computeLabwareStates, getWellState } from './lib/eventGraph'
import {
  getSerialDilutionFinalTargetLabwareId,
  getSerialDilutionPathLabwareId,
  normalizeEventGraphEventsForSave,
  normalizeSerialDilutionParams,
} from '../editor/lib/serialDilutionPlan'
import {
  allowedPlatformsForVocab,
  artifactRoleForPlatform,
  compilerFamilyForPlatform,
  defaultVariantForPlatform,
  getDeckSlotLockedOrientation,
  getPlatformManifest,
  getVariantManifest,
  isRobotExecutionPlatform,
  platformLabel,
  type MethodVocabId,
} from '../shared/lib/platformRegistry'
import { LoadTemplateModal } from './templates/LoadTemplateModal'
import { runTipTracking } from './lib/tipTracking'
import { resolvePipetteChannelAxis, resolvePipetteLabwareCompatibility, type CompatibilityTargetPlatform, type MappingMode } from './lib/labwareCompatibility'
import { validateEventGraph as runEventGraphValidation } from './lib/eventValidation'
import { ASSIST_PIPETTE_MODELS } from './lib/assistPipetteRegistry'
import {
  getDefinitionAliasForPlatform,
  getLabwareDefinitionById,
  getLabwareDefinitionByLegacyType,
  resolveDefinitionMultichannelSourceMode,
} from '../types/labwareDefinition'
import type { EditorMode } from '../types/editorMode'
import { EditorModeHeader } from './editor-mode/EditorModeHeader'
import { EditorBottomDrawer, type EditorBottomDrawerTab } from './editor-mode/EditorBottomDrawer'
import { EditorModeShell } from './editor-mode/EditorModeShell'
import { BiologyModeView } from './editor-mode/biology/BiologyModeView'
import { PlanModeView } from './editor-mode/plan/PlanModeView'
import { ReadoutsModeView } from './editor-mode/readouts/ReadoutsModeView'
import { ResultsModeView } from './editor-mode/results/ResultsModeView'
import { LabwareOverlayHost } from './labware/LabwareOverlayHost'

interface LabwareEventEditorContentProps {
  initialEventGraphId?: string | null
  runId?: string | null
  studyId?: string | null
  experimentId?: string | null
  fixtureName?: LabwareEditorFixtureName | null
  planningEnabled?: boolean
  templateIds?: string[]
  forceNew?: boolean
  prefillMaterials?: Ref[]
  onMethodNameChange?: (name: string) => void
  draftStorageKey?: string | null
  editorMode: EditorMode
  onEditorModeChange: (mode: EditorMode) => void
  drawerOpen: boolean
  onDrawerOpenChange: (open: boolean) => void
  drawerTab: string
  onDrawerTabChange: (tabId: string) => void
  headerTitle: string
}

type ToolPhase = 'idle' | 'aspirate' | 'aspirate_selected' | 'dispense'

interface ToolSessionState {
  phase: ToolPhase
  aspirateSpacingText: string
  dispenseSpacingText: string
  activeChannelIndicesText: string
}

interface ToolSessionUiState {
  tone: 'info' | 'warning'
  text: string
}

type XmlArtifactEventMetadata = {
  kind: 'xml_artifact'
  robotPlanId: string
  targetPlatform: 'integra_assist'
  executionPlanId: string
  executionPlanRecordId: string
  planFingerprint: string
  generatedAt: string
  role: string
}

const TEMPLATE_EXPERIMENT_TYPE_OPTIONS = [
  'qPCR',
  'plate_reader',
  'cell_plating',
  'microscopy',
  'sample_prep',
  'other',
] as const

const SPACING_PRESETS = [
  { value: '13.5', label: '13.5 mm (tubesets)' },
  { value: '9', label: '9 mm (96-well / strip tubes)' },
  { value: '4.5', label: '4.5 mm (384-well)' },
] as const

type SerializedLabwareEditorDraft = {
  version: 2
  savedAt: number
  historyPolicy: 'snapshot-only'
  multiTabPolicy: 'last-write-wins'
  editorState: {
    labwares: Labware[]
    activeLabwareId: string | null
    selections: Array<{
      labwareId: string
      selectedWells: WellId[]
      highlightedWells: WellId[]
      lastClickedWell: WellId | null
    }>
    labwarePoses: Array<{
      labwareId: string
      orientation: 'portrait' | 'landscape'
    }>
    events: PlateEvent[]
    selectedEventId: string | null
    editingEventId: string | null
    isDirty: boolean
    sourceLabwareId: string | null
    targetLabwareId: string | null
  }
  contextMethodName: string
  selectedVocabPackId: string
  playbackPosition?: number
  deckPlatform: string
  deckVariant: string
  deckPlacements: DeckPlacement[]
  executionTargetPlatform: 'opentrons_ot2' | 'opentrons_flex' | 'integra_assist'
  manualPipettingMode: boolean
  selectedTool: SelectedTool | null
  loadedTemplateSourceId: string | null
  loadedTemplateBindings: TemplateLabwareBinding[]
  loadedTemplateOutputs: TemplateOutputArtifact[]
  contextInitialized: boolean
  contextVocabChoice: MethodVocabId
  contextPlatformChoice: string
}

const DEFAULT_EDITOR_VOCAB_ID: MethodVocabId = 'liquid-handling/v1'
const DEFAULT_EDITOR_PLATFORM = 'manual'
const DEFAULT_EDITOR_DECK_VARIANT = 'manual_collapsed'
const LABWARE_EDITOR_DRAFT_TTL_MS = 1000 * 60 * 60 * 24 * 7
const LABWARE_EDITOR_DRAFT_WRITE_DELAY_MS = 250

type LabwareEditorDraftSnapshot = Omit<
  SerializedLabwareEditorDraft,
  'version' | 'savedAt' | 'historyPolicy' | 'multiTabPolicy'
>

function clearPersistedLabwareEditorDraft(storageKey: string | null | undefined): void {
  if (!storageKey) return
  try {
    globalThis.localStorage?.removeItem(storageKey)
  } catch {
    // Ignore localStorage errors so the editor still opens deterministically.
  }
}

function extractDraftSnapshot(draft: SerializedLabwareEditorDraft): LabwareEditorDraftSnapshot {
  return {
    editorState: draft.editorState,
    contextMethodName: draft.contextMethodName,
    selectedVocabPackId: draft.selectedVocabPackId,
    ...(typeof draft.playbackPosition === 'number' ? { playbackPosition: draft.playbackPosition } : {}),
    deckPlatform: draft.deckPlatform,
    deckVariant: draft.deckVariant,
    deckPlacements: draft.deckPlacements,
    executionTargetPlatform: draft.executionTargetPlatform,
    manualPipettingMode: draft.manualPipettingMode,
    selectedTool: draft.selectedTool,
    loadedTemplateSourceId: draft.loadedTemplateSourceId,
    loadedTemplateBindings: draft.loadedTemplateBindings,
    loadedTemplateOutputs: draft.loadedTemplateOutputs,
    contextInitialized: draft.contextInitialized,
    contextVocabChoice: draft.contextVocabChoice,
    contextPlatformChoice: draft.contextPlatformChoice,
  }
}

function loadPersistedLabwareEditorDraft(storageKey: string): SerializedLabwareEditorDraft | null {
  try {
    const raw = globalThis.localStorage?.getItem(storageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SerializedLabwareEditorDraft>
    // Local drafts only take precedence when the payload is current and internally consistent.
    // Anything malformed, expired, or written with incompatible persistence rules gets deleted so
    // the editor deterministically falls back to route/server state instead of partially restoring.
    if (parsed.version !== 2) {
      clearPersistedLabwareEditorDraft(storageKey)
      return null
    }
    if (typeof parsed.savedAt !== 'number' || !Number.isFinite(parsed.savedAt)) {
      clearPersistedLabwareEditorDraft(storageKey)
      return null
    }
    if (Date.now() - parsed.savedAt > LABWARE_EDITOR_DRAFT_TTL_MS) {
      clearPersistedLabwareEditorDraft(storageKey)
      return null
    }
    if (parsed.historyPolicy !== 'snapshot-only' || parsed.multiTabPolicy !== 'last-write-wins') {
      clearPersistedLabwareEditorDraft(storageKey)
      return null
    }
    if (!parsed.editorState || typeof parsed.editorState !== 'object') {
      clearPersistedLabwareEditorDraft(storageKey)
      return null
    }
    return parsed as SerializedLabwareEditorDraft
  } catch {
    clearPersistedLabwareEditorDraft(storageKey)
    return null
  }
}

function isSelectedToolAllowed(
  tool: SelectedTool,
  allowedToolTypeIds: string[],
): boolean {
  if (allowedToolTypeIds.includes(tool.toolTypeId)) return true
  if (allowedToolTypeIds.includes(tool.toolType.toolTypeId)) return true
  if (tool.assistPipetteModel) {
    if (allowedToolTypeIds.includes(tool.assistPipetteModel.id)) return true
    if (allowedToolTypeIds.includes(tool.assistPipetteModel.baseToolTypeId)) return true
  }
  return false
}

function serializeEditorState(state: LabwareEditorState): SerializedLabwareEditorDraft['editorState'] {
  return {
    labwares: Array.from(state.labwares.values()),
    activeLabwareId: state.activeLabwareId,
    selections: Array.from(state.selections.entries()).map(([labwareId, selection]) => ({
      labwareId,
      selectedWells: Array.from(selection.selectedWells),
      highlightedWells: Array.from(selection.highlightedWells),
      lastClickedWell: selection.lastClickedWell,
    })),
    labwarePoses: Array.from(state.labwarePoses.entries()).map(([labwareId, pose]) => ({
      labwareId,
      orientation: pose.orientation,
    })),
    events: state.events,
    selectedEventId: state.selectedEventId,
    editingEventId: state.editingEventId,
    isDirty: state.isDirty,
    sourceLabwareId: state.sourceLabwareId,
    targetLabwareId: state.targetLabwareId,
  }
}

function deserializeEditorState(
  serialized: SerializedLabwareEditorDraft['editorState']
): Partial<LabwareEditorState> {
  const labwares = new Map<string, Labware>(
    (serialized.labwares || []).map((labware) => [labware.labwareId, normalizeLabwareWithDefinition(labware)])
  )
  const selections = new Map(
    (serialized.selections || []).map((selection) => [
      selection.labwareId,
      {
        selectedWells: new Set(selection.selectedWells || []),
        highlightedWells: new Set(selection.highlightedWells || []),
        lastClickedWell: selection.lastClickedWell || null,
      },
    ])
  )
  const labwarePoses = new Map(
    (serialized.labwarePoses || []).map((pose) => [pose.labwareId, { orientation: pose.orientation }])
  )
  return {
    labwares,
    activeLabwareId: serialized.activeLabwareId,
    selections,
    labwarePoses,
    events: serialized.events || [],
    selectedEventId: serialized.selectedEventId,
    editingEventId: serialized.editingEventId,
    isDirty: serialized.isDirty,
    sourceLabwareId: serialized.sourceLabwareId,
    targetLabwareId: serialized.targetLabwareId,
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }
  const objectValue = value as Record<string, unknown>
  const keys = Object.keys(objectValue).sort((a, b) => a.localeCompare(b))
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`).join(',')}}`
}

function parseXmlArtifactEventMetadata(event: PlateEvent | undefined): XmlArtifactEventMetadata | null {
  if (!event || event.event_type !== 'other' || !event.details || typeof event.details !== 'object') return null
  const details = event.details as Record<string, unknown>
  const metadata = details.metadata
  if (!metadata || typeof metadata !== 'object') return null
  const candidate = metadata as Record<string, unknown>
  if (candidate.kind !== 'xml_artifact') return null
  if (candidate.targetPlatform !== 'integra_assist') return null
  if (
    typeof candidate.robotPlanId !== 'string'
    || typeof candidate.executionPlanId !== 'string'
    || typeof candidate.executionPlanRecordId !== 'string'
    || typeof candidate.planFingerprint !== 'string'
    || typeof candidate.generatedAt !== 'string'
    || typeof candidate.role !== 'string'
  ) {
    return null
  }
  return {
    kind: 'xml_artifact',
    robotPlanId: candidate.robotPlanId,
    targetPlatform: 'integra_assist',
    executionPlanId: candidate.executionPlanId,
    executionPlanRecordId: candidate.executionPlanRecordId,
    planFingerprint: candidate.planFingerprint,
    generatedAt: candidate.generatedAt,
    role: candidate.role,
  }
}


function tipTypeFromLabwareType(labwareType: string): string {
  const table: Record<string, string> = {
    tiprack_ot2_20: 'opentrons_20',
    tiprack_ot2_200: 'opentrons_200',
    tiprack_ot2_300: 'opentrons_300',
    tiprack_ot2_1000: 'opentrons_1000',
    tiprack_flex_50: 'opentrons_flex_50',
    tiprack_flex_200: 'opentrons_flex_200',
    tiprack_flex_1000: 'opentrons_flex_1000',
    tiprack_assist_12_5_384: 'assist_12_5_384',
    tiprack_assist_125_384: 'assist_125_384',
    tiprack_assist_300: 'assist_300',
    tiprack_assist_1250: 'assist_1250',
  }
  return table[labwareType] || labwareType
}

function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}

function parseActiveChannelIndices(raw: string, channelCount: number): number[] {
  const fallback = Array.from({ length: channelCount }, (_, i) => i)
  const trimmed = raw.trim()
  if (!trimmed) return fallback

  const indices: number[] = []
  const tokens = trimmed.split(/[,\s]+/).map((t) => t.trim()).filter(Boolean)
  for (const token of tokens) {
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/)
    if (rangeMatch) {
      const start = parseInt(rangeMatch[1], 10)
      const end = parseInt(rangeMatch[2], 10)
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue
      const step = start <= end ? 1 : -1
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        if (n >= 0 && n < channelCount) indices.push(n)
      }
      continue
    }

    const value = parseInt(token, 10)
    if (Number.isFinite(value) && value >= 0 && value < channelCount) {
      indices.push(value)
    }
  }

  const uniqueSorted = Array.from(new Set(indices)).sort((a, b) => a - b)
  return uniqueSorted.length > 0 ? uniqueSorted : fallback
}

function parseNumberOr(raw: string, fallback: number): number {
  const n = parseFloat(raw)
  return Number.isFinite(n) ? n : fallback
}

function toExecutionPlanId(raw: string): string {
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length >= 6 ? normalized : `PLAN-${normalized.padEnd(1, '0')}`.padEnd(6, '0')
}

function toExecutionEnvironmentId(raw: string): string {
  const normalized = raw
    .toUpperCase()
    .replace(/[^A-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
  return normalized.length >= 6 ? normalized : `ENV-${normalized || '0001'}`.padEnd(6, '0')
}

function normalizeOrientationForLabware(
  labware: Labware,
  orientation?: LabwareOrientation
): 'portrait' | 'landscape' {
  if (!orientation || orientation === 'auto') {
    return getLabwareDefaultOrientation(labware)
  }
  return orientation
}

function expandPipetteClick(
  click: WellId,
  labware: Labware,
  channelCount: number,
  spacingMm: number,
  activeChannelIndices: number[],
  orientation: LabwareOrientation = 'landscape',
  mappingMode: MappingMode = 'per_channel',
  pipetteAxis: 'x' | 'y' = 'y',
  effectiveLinearAxis?: 'x' | 'y'
): WellId[] {
  if (labware.addressing.type === 'linear') {
    // Some reservoirs intentionally use one source trough for multichannel aspiration.
    if (mappingMode === 'single_source_multichannel') {
      return [click]
    }
    const linearOrientation = normalizeOrientationForLabware(labware, orientation)
    const axis = effectiveLinearAxis || resolveEffectiveLinearAxisForLabware(labware, linearOrientation)
    if (axis !== pipetteAxis) {
      return [click]
    }

    const labels = labware.addressing.linearLabels || []
    const anchorIndex = labels.indexOf(click)
    if (anchorIndex < 0) return [click]

    const pitch = getCanonicalPitchMm(labware)
    const stride = Math.max(1, Math.round(spacingMm / pitch))
    const active = activeChannelIndices.length > 0 ? activeChannelIndices : Array.from({ length: channelCount }, (_, i) => i)
    const minActive = Math.min(...active)
    const maxActive = Math.max(...active)

    const minBaseIndex = Math.max(0, -minActive * stride)
    const maxBaseIndex = Math.max(0, labels.length - 1 - maxActive * stride)
    const baseIndex = Math.min(Math.max(anchorIndex, minBaseIndex), maxBaseIndex)
    const wells: WellId[] = []

    for (let i = 0; i < channelCount; i++) {
      const index = baseIndex + i * stride
      if (index < 0 || index >= labels.length) continue
      wells.push(labels[index] as WellId)
    }

    return active.map((i) => wells[i]).filter((w): w is WellId => Boolean(w))
  }

  if (labware.addressing.type !== 'grid') return [click]
  const resolvedOrientation = resolveOrientationForLabware(labware, normalizeOrientationForLabware(labware, orientation))
  const view = createGridViewTransform(labware, resolvedOrientation)
  const anchor = view.canonicalToDisplay(click)
  if (!anchor) return [click]

  const pitch = getCanonicalPitchMm(labware)
  const stride = Math.max(1, Math.round(spacingMm / pitch))
  const displayRows = view.displayRows
  const displayCols = view.displayCols
  const active = activeChannelIndices.length > 0 ? activeChannelIndices : Array.from({ length: channelCount }, (_, i) => i)
  const minActive = Math.min(...active)
  const maxActive = Math.max(...active)

  // Fit the multichannel pattern in-bounds so clicks near edges still select a full feasible set.
  const minBaseRow = Math.max(0, -minActive * stride)
  const maxBaseRow = Math.max(0, displayRows - 1 - maxActive * stride)
  const baseRow = Math.min(Math.max(anchor.row, minBaseRow), maxBaseRow)
  const wells: WellId[] = []

  for (let i = 0; i < channelCount; i++) {
    const dr = baseRow + i * stride
    const dc = anchor.col
    if (dr < 0 || dc < 0 || dr >= displayRows || dc >= displayCols) continue
    const canonical = view.displayToCanonical(dr, dc)
    if (canonical) wells.push(canonical)
  }

  return active.map((i) => wells[i]).filter((w): w is WellId => Boolean(w))
}

function formatSaveError(err: unknown): string {
  if (ApiError.isApiError(err)) {
    const base = `${err.message} (HTTP ${err.status})`
    if (err.validation && !err.validation.valid && err.validation.errors.length > 0) {
      const details = err.validation.errors.map((e) => `${e.path}: ${e.message}`).join('; ')
      return `${base}. ${details}`
    }
    return base
  }
  return err instanceof Error ? err.message : 'Save failed'
}

function getLabwareWellSet(labware: Labware): Set<WellId> {
  if (labware.addressing.type === 'grid') {
    const rows = labware.addressing.rowLabels || Array.from({ length: labware.addressing.rows || 8 }, (_, i) => String.fromCharCode(65 + i))
    const cols = labware.addressing.columnLabels || Array.from({ length: labware.addressing.columns || 12 }, (_, i) => String(i + 1))
    return new Set(rows.flatMap((r) => cols.map((c) => `${r}${c}` as WellId)))
  }
  if (labware.addressing.type === 'linear') {
    return new Set((labware.addressing.linearLabels || []).map((w) => w as WellId))
  }
  return new Set(['1' as WellId])
}

function parseTemplateMetadataFromRecord(record: { payload?: unknown } | null | undefined): {
  experimentTypes: string[]
  outputs: TemplateOutputArtifact[]
} {
  const payload = record?.payload
  if (!payload || typeof payload !== 'object') {
    return { experimentTypes: [], outputs: [] }
  }
  const template = (payload as Record<string, unknown>).template
  const insertionHints = template && typeof template === 'object'
    ? ((template as Record<string, unknown>).insertionHints as Record<string, unknown> | undefined)
    : undefined
  const experimentTypes = Array.isArray(insertionHints?.experimentTypes)
    ? insertionHints.experimentTypes.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : []
  const outputs = Array.isArray(insertionHints?.outputArtifacts)
    ? insertionHints.outputArtifacts
        .map((value) => (value && typeof value === 'object' ? value as Record<string, unknown> : null))
        .filter((value): value is Record<string, unknown> => Boolean(value))
        .map((value) => ({
          outputId: typeof value.outputId === 'string' ? value.outputId : '',
          label: typeof value.label === 'string' ? value.label : '',
          kind: 'plate-snapshot' as const,
          sourceLabwareId: typeof value.sourceLabwareId === 'string' ? value.sourceLabwareId : '',
        }))
        .filter((value) => value.outputId && value.label && value.sourceLabwareId)
    : []
  return { experimentTypes, outputs }
}

function validateEventGraphBeforeSave(events: PlateEvent[], labwares: Map<string, Labware>): string | null {
  const assertWellIds = (event: PlateEvent, field: string, labwareId: string | undefined, wells: WellId[] | undefined): string | null => {
    if (!labwareId || !wells || wells.length === 0) return null
    const labware = labwares.get(labwareId)
    if (!labware) return `Event ${event.eventId} references missing labware '${labwareId}' for ${field}.`
    const validWells = getLabwareWellSet(labware)
    const invalid = wells.find((well) => !validWells.has(well))
    if (invalid) {
      return `Event ${event.eventId} has invalid well '${invalid}' in ${field} for labware '${labwareId}'.`
    }
    return null
  }

  for (const event of events) {
    const details = event.details as Record<string, unknown>
    const genericWells = (details.wells as WellId[] | undefined) || []
    const genericLabwareId = details.labwareId as string | undefined
    const genericError = assertWellIds(event, 'details.wells', genericLabwareId, genericWells)
    if (genericError) return genericError

    if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
      const normalized = normalizeTransferDetails(event.details as TransferDetails)
      const sourceError = assertWellIds(event, 'details.source_wells', normalized.sourceLabwareId, normalized.sourceWells)
      if (sourceError) return sourceError
      const targetError = assertWellIds(event, 'details.dest_wells', normalized.destLabwareId, normalized.destWells)
      if (targetError) return targetError
    }

    if (event.event_type === 'macro_program') {
      const program = details.program as MacroProgram | undefined
      if (program?.kind === 'spacing_transition_transfer') {
        const sourceError = assertWellIds(event, 'program.params.sourceWells', program.params.sourceLabwareId, program.params.sourceWells)
        if (sourceError) return sourceError
        const targetError = assertWellIds(event, 'program.params.targetWells', program.params.targetLabwareId, program.params.targetWells)
        if (targetError) return targetError
      }
      if (program?.kind === 'quadrant_replicate') {
        const sourceError = assertWellIds(event, 'program.params.sourceWells', program.params.sourceLabwareId, program.params.sourceWells)
        if (sourceError) return sourceError
      }
      if (program?.kind === 'serial_dilution') {
        const normalized = normalizeSerialDilutionParams(program.params)
        for (const lane of normalized.lanes) {
          const pathError = assertWellIds(event, 'program.params.lanes[].path', getSerialDilutionPathLabwareId(normalized, lane), lane.path)
          if (pathError) return pathError
          if (lane.finalTargets?.length) {
            const finalTargetError = assertWellIds(
              event,
              'program.params.lanes[].finalTargets',
              getSerialDilutionFinalTargetLabwareId(normalized, lane),
              lane.finalTargets,
            )
            if (finalTargetError) return finalTargetError
          }
        }
      }
    }
  }

  return null
}

/**
 * Main editor content (inside provider)
 */
function LabwareEventEditorContent({ 
  initialEventGraphId,
  runId,
  studyId,
  experimentId,
  fixtureName,
  planningEnabled = false,
  templateIds = [],
  forceNew = false,
  prefillMaterials = [],
  onMethodNameChange,
  draftStorageKey = null,
  editorMode,
  onEditorModeChange,
  drawerOpen,
  onDrawerOpenChange,
  drawerTab,
  onDrawerTabChange,
  headerTitle,
}: LabwareEventEditorContentProps) {
  const {
    state,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
    highlightWells,
    clearHighlight,
    clearSelection,
    addEvent,
    addLabware,
    addLabwareFromRecord,
    removeLabware,
    updateEvent,
    deleteEvent,
    selectEvent,
    editEvent,
    setSourceLabware,
    setTargetLabware,
    getLabwareOrientation,
    setLabwareOrientation,
    dispatch,
  } = useLabwareEditor()
  const navigate = useNavigate()

  const [selectionActionPanel, setSelectionActionPanel] = useState<null | 'state' | 'prepared-material' | 'plate-snapshot' | 'formulation'>(null)
  const [materialOutputBusy, setMaterialOutputBusy] = useState(false)
  const [materialOutputMode, setMaterialOutputMode] = useState<'prepared-material' | 'biological-material' | 'derived-material'>('derived-material')
  const [materialOutputName, setMaterialOutputName] = useState('')
  const [materialOutputRef, setMaterialOutputRef] = useState<Ref | null>(null)
  const [materialOutputNotice, setMaterialOutputNotice] = useState<string | null>(null)
  const [plateSnapshotBusy, setPlateSnapshotBusy] = useState(false)
  const [plateSnapshotTitle, setPlateSnapshotTitle] = useState('')
  const [plateSnapshotNotice, setPlateSnapshotNotice] = useState<string | null>(null)
  const [formulationBusy, setFormulationBusy] = useState(false)
  const [formulationName, setFormulationName] = useState('')
  const [formulationRef, setFormulationRef] = useState<Ref | null>(null)
  const [formulationNotice, setFormulationNotice] = useState<string | null>(null)
  
  // Selected tool state
  const [selectedTool, setSelectedTool] = useState<SelectedTool | null>(null)
  const [toolSession, setToolSession] = useState<ToolSessionState>({
    phase: 'idle',
    aspirateSpacingText: '9',
    dispenseSpacingText: '9',
    activeChannelIndicesText: '',
  })
  const [toolSessionMessage, setToolSessionMessage] = useState<ToolSessionUiState | null>(null)
  const [fixtureLoaded, setFixtureLoaded] = useState(false)
  
  // Vocab pack state
  const [selectedVocabPackId, setSelectedVocabPackId] = useState<string>(DEFAULT_EDITOR_VOCAB_ID)
  
  // Save state
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState<string | null>(null)
  const [eventGraphId, setEventGraphId] = useState<string | null>(initialEventGraphId || null)
  const [_loadError, setLoadError] = useState<string | null>(null)
  const [_isLoading, setIsLoading] = useState(!!initialEventGraphId)
  const [loadAttempted, setLoadAttempted] = useState(false)
  const [executionPlanRecordId, setExecutionPlanRecordId] = useState<string>('')
  const [executionPlanId, setExecutionPlanId] = useState<string>('')
  const [executionEnvironmentRef, setExecutionEnvironmentRef] = useState<string>('')
  const [executionTargetPlatform, setExecutionTargetPlatform] = useState<'opentrons_ot2' | 'opentrons_flex' | 'integra_assist'>('opentrons_ot2')
  const [executionBusy, setExecutionBusy] = useState(false)
  const [executionNotice, setExecutionNotice] = useState<string | null>(null)
  const [executionIssues, setExecutionIssues] = useState<Array<{ severity: 'error' | 'warning'; code: string; path: string; message: string }>>([])
  const [assistEmitterDefault] = useState<'default' | 'local' | 'pyalab'>(() => {
    const value = globalThis.localStorage?.getItem('cl.assistEmitterDefault') ?? 'default'
    return value === 'local' || value === 'pyalab' ? value : 'default'
  })
  const [assistEmitterOverride] = useState<'default' | 'local' | 'pyalab'>('default')
  const [playbackPosition, setPlaybackPosition] = useState<number | undefined>(undefined)
  const [deckPlatform, setDeckPlatform] = useState<string>(DEFAULT_EDITOR_PLATFORM)
  const [deckVariant, setDeckVariant] = useState<string>(DEFAULT_EDITOR_DECK_VARIANT)
  const [deckPlacements, setDeckPlacements] = useState<DeckPlacement[]>([])
  const [templateModalOpen, setTemplateModalOpen] = useState(false)
  const [templateAnchorLabwareId, setTemplateAnchorLabwareId] = useState<string | null>(null)
  const [templateName, setTemplateName] = useState('')
  const [templateNotes, setTemplateNotes] = useState('')
  const [templateVersion, setTemplateVersion] = useState('v1')
  const [templateExperimentTypes, setTemplateExperimentTypes] = useState<string[]>([])
  const [templateOutputDrafts, setTemplateOutputDrafts] = useState<Array<{ sourceLabwareId: string; label: string; enabled: boolean }>>([])
  const [templateSaving, setTemplateSaving] = useState(false)
  const [templateSaveError, setTemplateSaveError] = useState<string | null>(null)
  const [loadTemplateModalOpen, setLoadTemplateModalOpen] = useState(false)
  const [templateLoadAttempted, setTemplateLoadAttempted] = useState(false)
  const [manualPipettingMode, setManualPipettingMode] = useState(true)
  const [runMethodLockedPlatform, setRunMethodLockedPlatform] = useState<string | null>(null)
  const [runMethodLockedVocabId, setRunMethodLockedVocabId] = useState<string | null>(null)
  const [runMethodLockedDeckVariant, setRunMethodLockedDeckVariant] = useState<string | null>(null)
  const [runMethodSourceTemplateId, setRunMethodSourceTemplateId] = useState<string | null>(null)
  const [runMethodSummary, setRunMethodSummary] = useState<RunMethodSummaryResponse | null>(null)
  const [availablePreparedPlates, setAvailablePreparedPlates] = useState<Array<{ id: string; label: string }>>([])
  const [inputResolutionDrafts, setInputResolutionDrafts] = useState<Record<string, string>>({})
  const [loadedTemplateSourceId, setLoadedTemplateSourceId] = useState<string | null>(null)
  const [loadedTemplateBindings, setLoadedTemplateBindings] = useState<TemplateLabwareBinding[]>([])
  const [loadedTemplateOutputs, setLoadedTemplateOutputs] = useState<TemplateOutputArtifact[]>([])
  const [contextModalOpen, setContextModalOpen] = useState(false)
  const [contextStep, setContextStep] = useState<1 | 2>(1)
  const [contextVocabChoice, setContextVocabChoice] = useState<MethodVocabId>(DEFAULT_EDITOR_VOCAB_ID)
  const [contextPlatformChoice, setContextPlatformChoice] = useState<string>(DEFAULT_EDITOR_PLATFORM)
  const [contextInitialized, setContextInitialized] = useState(false)
  const [contextMethodName, setContextMethodName] = useState('')
  const canPersistDraft = !fixtureName && Boolean(draftStorageKey)
  const [draftRestoreAttempted, setDraftRestoreAttempted] = useState(false)
  const previousDeckPlacementSlotsRef = useRef<Map<string, string>>(new Map())
  const previousDeckProfileKeyRef = useRef<string>('')
  const pendingDraftWriteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingDraftJsonRef = useRef<string | null>(null)
  const pendingDraftStableRef = useRef<string | null>(null)
  const lastPersistedDraftStableRef = useRef<string | null>(null)
  const draftBaselineRef = useRef<{ stable: string; source: 'persisted' | 'route' } | null>(null)
  const restoredSelectedToolRef = useRef<SelectedTool | null>(null)

  function buildLoadedEditorState(labwares: Map<string, Labware>, events: PlateEvent[]) {
    const ids = Array.from(labwares.keys())
    const first = ids[0] || null
    const second = ids[1] || first
    const normalizedEvents = normalizeEventGraphEventsForSave(events)
    return {
      labwares,
      events: normalizedEvents,
      activeLabwareId: first,
      sourceLabwareId: first,
      targetLabwareId: second,
      selections: new Map(),
      selectedEventId: null,
      editingEventId: null,
    }
  }

  const applySerializedDraft = useCallback((draft: SerializedLabwareEditorDraft) => {
    dispatch({
      type: 'LOAD_STATE',
      state: deserializeEditorState(draft.editorState),
    })
    setContextMethodName(draft.contextMethodName || '')
    onMethodNameChange?.(draft.contextMethodName || '')
    const restoredDeckPlatform = draft.deckPlatform || DEFAULT_EDITOR_PLATFORM
    setSelectedVocabPackId(draft.selectedVocabPackId || DEFAULT_EDITOR_VOCAB_ID)
    setPlaybackPosition(typeof draft.playbackPosition === 'number' ? draft.playbackPosition : undefined)
    setDeckPlatform(restoredDeckPlatform)
    setDeckVariant(draft.deckVariant || DEFAULT_EDITOR_DECK_VARIANT)
    setDeckPlacements(Array.isArray(draft.deckPlacements) ? draft.deckPlacements : [])
    setExecutionTargetPlatform(draft.executionTargetPlatform || 'opentrons_ot2')
    setManualPipettingMode(draft.manualPipettingMode === true || restoredDeckPlatform === DEFAULT_EDITOR_PLATFORM)
    restoredSelectedToolRef.current = draft.selectedTool || null
    setSelectedTool(draft.selectedTool || null)
    setLoadedTemplateSourceId(draft.loadedTemplateSourceId || null)
    setLoadedTemplateBindings(Array.isArray(draft.loadedTemplateBindings) ? draft.loadedTemplateBindings : [])
    setLoadedTemplateOutputs(Array.isArray(draft.loadedTemplateOutputs) ? draft.loadedTemplateOutputs : [])
    setContextInitialized(draft.contextInitialized === true)
    setContextVocabChoice(draft.contextVocabChoice || DEFAULT_EDITOR_VOCAB_ID)
    setContextPlatformChoice(draft.contextPlatformChoice || DEFAULT_EDITOR_PLATFORM)
    setLoadAttempted(true)
    setIsLoading(false)
    setLoadError(null)
    lastPersistedDraftStableRef.current = stableStringify(extractDraftSnapshot(draft))
  }, [dispatch, onMethodNameChange])

  const flushPendingDraftWrite = useCallback(() => {
    if (!draftStorageKey || !pendingDraftJsonRef.current || !pendingDraftStableRef.current) return
    try {
      globalThis.localStorage?.setItem(draftStorageKey, pendingDraftJsonRef.current)
      lastPersistedDraftStableRef.current = pendingDraftStableRef.current
    } catch {
      // Ignore localStorage write failures and keep the editor usable.
    } finally {
      pendingDraftJsonRef.current = null
      pendingDraftStableRef.current = null
    }
  }, [draftStorageKey])

  const clearPendingDraftWrite = useCallback(() => {
    if (pendingDraftWriteTimerRef.current) {
      clearTimeout(pendingDraftWriteTimerRef.current)
      pendingDraftWriteTimerRef.current = null
    }
    pendingDraftJsonRef.current = null
    pendingDraftStableRef.current = null
  }, [])

  useEffect(() => {
    if (forceNew) {
      clearPendingDraftWrite()
      clearPersistedLabwareEditorDraft(draftStorageKey)
      lastPersistedDraftStableRef.current = null
      draftBaselineRef.current = null
      setDraftRestoreAttempted(true)
      return
    }
    if (!canPersistDraft || !draftStorageKey || draftRestoreAttempted) return
    setDraftRestoreAttempted(true)
    const persistedDraft = loadPersistedLabwareEditorDraft(draftStorageKey)
    if (!persistedDraft) return
    applySerializedDraft(persistedDraft)
  }, [applySerializedDraft, canPersistDraft, clearPendingDraftWrite, draftRestoreAttempted, draftStorageKey, forceNew])

  // AI chat state
  const labwareAiContext = useLabwareAiContext({
    vocabPackId: selectedVocabPackId,
    editorMode,
    deckPlatform,
    deckVariant,
    deckPlacements: deckPlacements.map((placement) => ({
      slotId: placement.slotId,
      ...(placement.labwareId ? { labwareId: placement.labwareId } : {}),
      ...(placement.moduleId ? { moduleId: placement.moduleId } : {}),
    })),
    manualPipettingMode,
  })
  const aiChat = useAiChat({
    aiContext: labwareAiContext,
    onAcceptEvent: addEvent,
    onAddLabwareFromRecord: (record) => {
      addLabwareFromRecord(record as unknown as LabwareRecordPayload);
    },
  })
  useRegisterAiChat(aiChat)
  const { platforms, loading: platformsLoading } = usePlatformRegistry()
  const deckPlatformManifest = useMemo(
    () => getPlatformManifest(platforms, deckPlatform),
    [deckPlatform, platforms]
  )
  const allowedPlatforms = useMemo(
    () => allowedPlatformsForVocab(platforms, contextVocabChoice),
    [contextVocabChoice, platforms]
  )
  const executionCompilerFamily = useMemo(
    () => compilerFamilyForPlatform(platforms, executionTargetPlatform),
    [executionTargetPlatform, platforms]
  )
  const allowedToolTypeIds = deckPlatformManifest?.toolTypeIds?.length
    ? deckPlatformManifest.toolTypeIds
    : deckPlatform === 'integra_assist'
      ? ASSIST_PIPETTE_MODELS.map((model) => model.id)
      : ['pipette_1ch', 'pipette_8ch_fixed', 'pipette_12ch']

  const loadTemplateMetadata = useCallback(async (templateId: string | null) => {
    if (!templateId) {
      setLoadedTemplateOutputs([])
      return
    }
    try {
      const response = await apiClient.getComponent(templateId)
      const metadata = parseTemplateMetadataFromRecord(response.component)
      setLoadedTemplateOutputs(metadata.outputs)
    } catch {
      setLoadedTemplateOutputs([])
    }
  }, [])

  const resetEditorForNewMethod = useCallback(() => {
    dispatch({ type: 'RESET_EDITOR' })
    setFixtureLoaded(false)
    setSelectedTool(null)
    setToolSession({
      phase: 'idle',
      aspirateSpacingText: '9',
      dispenseSpacingText: '9',
      activeChannelIndicesText: '',
    })
    setToolSessionMessage(null)
    restoredSelectedToolRef.current = null
    setSelectedVocabPackId(DEFAULT_EDITOR_VOCAB_ID)
    setSaveState('idle')
    setSaveError(null)
    setEventGraphId(null)
    setLoadError(null)
    setIsLoading(false)
    setLoadAttempted(true)
    setExecutionPlanRecordId('')
    setExecutionPlanId('')
    setExecutionEnvironmentRef('')
    setExecutionNotice(null)
    setExecutionIssues([])
    setPlaybackPosition(undefined)
    setDeckPlatform(DEFAULT_EDITOR_PLATFORM)
    setDeckVariant(DEFAULT_EDITOR_DECK_VARIANT)
    setDeckPlacements([])
    setTemplateModalOpen(false)
    setTemplateAnchorLabwareId(null)
    setTemplateName('')
    setTemplateNotes('')
    setTemplateVersion('v1')
    setTemplateExperimentTypes([])
    setTemplateOutputDrafts([])
    setTemplateSaving(false)
    setTemplateSaveError(null)
    setLoadTemplateModalOpen(false)
    setTemplateLoadAttempted(false)
    setManualPipettingMode(true)
    setRunMethodLockedPlatform(null)
    setRunMethodLockedVocabId(null)
    setRunMethodLockedDeckVariant(null)
    setRunMethodSourceTemplateId(null)
    setRunMethodSummary(null)
    setAvailablePreparedPlates([])
    setInputResolutionDrafts({})
    setLoadedTemplateSourceId(null)
    setLoadedTemplateBindings([])
    setLoadedTemplateOutputs([])
    setContextModalOpen(false)
    setContextStep(1)
    setContextVocabChoice(DEFAULT_EDITOR_VOCAB_ID)
    setContextPlatformChoice(DEFAULT_EDITOR_PLATFORM)
    setContextInitialized(false)
    setContextMethodName('')
    onMethodNameChange?.('')
    clearPendingDraftWrite()
    clearPersistedLabwareEditorDraft(draftStorageKey)
    lastPersistedDraftStableRef.current = null
    draftBaselineRef.current = null
  }, [clearPendingDraftWrite, dispatch, draftStorageKey, onMethodNameChange])

  const handleNewMethod = useCallback(() => {
    const hasWorkToClear = (
      state.isDirty
      || state.labwares.size > 0
      || state.events.length > 0
      || deckPlacements.some((placement) => Boolean(placement.labwareId || placement.moduleId))
      || Boolean(contextMethodName.trim())
      || Boolean(loadedTemplateSourceId)
    )
    if (hasWorkToClear) {
      const confirmed = window.confirm('You will lose unsaved work. Start a new method?')
      if (!confirmed) return
    }
    if (forceNew) {
      resetEditorForNewMethod()
      return
    }
    navigate('/labware-editor?new=1')
  }, [
    contextMethodName,
    deckPlacements,
    forceNew,
    loadedTemplateSourceId,
    navigate,
    resetEditorForNewMethod,
    state.events.length,
    state.isDirty,
    state.labwares.size,
  ])

  const refreshRunMethodSummary = useCallback(async () => {
    if (!runId) {
      setRunMethodSummary(null)
      return
    }
    try {
      const summary = await getRunMethod(runId)
      setRunMethodSummary(summary)
    } catch {
      setRunMethodSummary(null)
    }
  }, [runId])

  useEffect(() => {
    if (!runId) return
    let active = true
    void apiClient.searchLibrary({ types: ['plate_snapshot'], limit: 500 }).then((response) => {
      if (!active) return
      setAvailablePreparedPlates((response.results || []).map((item) => ({ id: item.id, label: item.label })))
    }).catch(() => {
      if (!active) return
      setAvailablePreparedPlates([])
    })
    return () => {
      active = false
    }
  }, [runId])

  useEffect(() => {
    if (manualPipettingMode) {
      setDeckPlatform('manual')
      return
    }
    setDeckPlatform(executionTargetPlatform)
  }, [executionTargetPlatform, manualPipettingMode])

  useEffect(() => {
    void refreshRunMethodSummary()
  }, [refreshRunMethodSummary])

  useEffect(() => {
    if (!forceNew) return
    resetEditorForNewMethod()
  }, [forceNew, resetEditorForNewMethod])

  const buildDraftSnapshot = useCallback((): LabwareEditorDraftSnapshot => ({
    editorState: serializeEditorState(state),
    contextMethodName,
    selectedVocabPackId,
    ...(typeof playbackPosition === 'number' ? { playbackPosition } : {}),
    deckPlatform,
    deckVariant,
    deckPlacements,
    executionTargetPlatform,
    manualPipettingMode,
    selectedTool,
    loadedTemplateSourceId,
    loadedTemplateBindings,
    loadedTemplateOutputs,
    contextInitialized,
    contextVocabChoice,
    contextPlatformChoice,
  }), [
    contextInitialized,
    contextMethodName,
    contextPlatformChoice,
    contextVocabChoice,
    deckPlacements,
    deckPlatform,
    deckVariant,
    executionTargetPlatform,
    loadedTemplateBindings,
    loadedTemplateOutputs,
    loadedTemplateSourceId,
    manualPipettingMode,
    playbackPosition,
    selectedTool,
    selectedVocabPackId,
    state,
  ])

  useEffect(() => {
    if (!canPersistDraft || !draftRestoreAttempted || !loadAttempted) return
    if (draftBaselineRef.current) return
    const stableSnapshot = stableStringify(buildDraftSnapshot())
    draftBaselineRef.current = {
      stable: stableSnapshot,
      source: lastPersistedDraftStableRef.current === stableSnapshot ? 'persisted' : 'route',
    }
  }, [buildDraftSnapshot, canPersistDraft, draftRestoreAttempted, loadAttempted])

  useEffect(() => {
    if (!canPersistDraft || !draftStorageKey) return
    const handlePageHide = () => {
      if (pendingDraftWriteTimerRef.current) {
        clearTimeout(pendingDraftWriteTimerRef.current)
        pendingDraftWriteTimerRef.current = null
      }
      flushPendingDraftWrite()
    }
    globalThis.addEventListener?.('pagehide', handlePageHide)
    return () => {
      handlePageHide()
      globalThis.removeEventListener?.('pagehide', handlePageHide)
    }
  }, [canPersistDraft, draftStorageKey, flushPendingDraftWrite])

  useEffect(() => {
    const fallback = defaultVariantForPlatform(platforms, deckPlatform)
    const isKnownVariant = Boolean(getVariantManifest(platforms, deckPlatform, deckVariant))
    if (!isKnownVariant && fallback) {
      setDeckVariant(fallback)
    }
  }, [deckPlatform, deckVariant, platforms])

  useEffect(() => {
    const allowedIds = allowedPlatforms.map((entry) => entry.id)
    if (!allowedIds.includes(contextPlatformChoice)) {
      setContextPlatformChoice(allowedIds[0] || 'manual')
    }
  }, [allowedPlatforms, contextPlatformChoice])

  useEffect(() => {
    globalThis.localStorage?.setItem('cl.assistEmitterDefault', assistEmitterDefault)
  }, [assistEmitterDefault])

  useEffect(() => {
    const isOpentrons = executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'
    if (!isOpentrons) return
    for (const lw of state.labwares.values()) {
      if (!isTipRackType(lw.labwareType)) continue
      if (getLabwareOrientation(lw.labwareId) !== 'landscape') {
        setLabwareOrientation(lw.labwareId, 'landscape')
      }
    }
  }, [executionTargetPlatform, getLabwareOrientation, setLabwareOrientation, state.labwares])

  useEffect(() => {
    const profile = getVariantManifest(platforms, deckPlatform, deckVariant)
    if (!profile) return

    const nextPlacementSlots = new Map<string, string>()
    for (const placement of deckPlacements) {
      if (!placement.labwareId || placement.slotId.startsWith('bench:')) continue
      nextPlacementSlots.set(placement.labwareId, placement.slotId)
    }

    const profileKey = `${deckPlatform}:${deckVariant}`
    const profileChanged = previousDeckProfileKeyRef.current !== profileKey

    for (const [labwareId, slotId] of nextPlacementSlots.entries()) {
      const previousSlotId = previousDeckPlacementSlotsRef.current.get(labwareId)
      if (!profileChanged && previousSlotId === slotId) continue

      const labware = state.labwares.get(labwareId)
      if (!labware || labware.addressing.type !== 'grid') continue

      const slot = profile.slots.find((entry) => entry.id === slotId)
      const lockedOrientation = slot ? getDeckSlotLockedOrientation(slot) : null
      const preferredOrientation = lockedOrientation
        ?? (deckPlatform === 'integra_assist' ? 'landscape' : getLabwareDefaultOrientation(labware))

      if (getLabwareOrientation(labwareId) !== preferredOrientation) {
        setLabwareOrientation(labwareId, preferredOrientation)
      }
    }

    previousDeckPlacementSlotsRef.current = nextPlacementSlots
    previousDeckProfileKeyRef.current = profileKey
  }, [deckPlacements, deckPlatform, deckVariant, getLabwareOrientation, platforms, setLabwareOrientation, state.labwares])

  useEffect(() => {
    if (!selectedTool) {
      if (restoredSelectedToolRef.current && isSelectedToolAllowed(restoredSelectedToolRef.current, allowedToolTypeIds)) {
        setSelectedTool(restoredSelectedToolRef.current)
        restoredSelectedToolRef.current = null
      }
      return
    }
    if (!isSelectedToolAllowed(selectedTool, allowedToolTypeIds)) {
      setSelectedTool(null)
      return
    }
    restoredSelectedToolRef.current = null
  }, [allowedToolTypeIds, selectedTool])

  useEffect(() => {
    if (!canPersistDraft || !draftStorageKey || !draftRestoreAttempted || !loadAttempted) return
    const draftBaseline = draftBaselineRef.current
    if (!draftBaseline) return
    const snapshot = buildDraftSnapshot()
    const nextStableDraft = stableStringify(snapshot)
    if (draftBaseline.source === 'route' && nextStableDraft === draftBaseline.stable) {
      clearPendingDraftWrite()
      clearPersistedLabwareEditorDraft(draftStorageKey)
      lastPersistedDraftStableRef.current = null
      return
    }
    if (nextStableDraft === lastPersistedDraftStableRef.current) return
    const draft: SerializedLabwareEditorDraft = {
      version: 2,
      savedAt: Date.now(),
      historyPolicy: 'snapshot-only',
      multiTabPolicy: 'last-write-wins',
      ...snapshot,
    }
    pendingDraftJsonRef.current = JSON.stringify(draft)
    pendingDraftStableRef.current = nextStableDraft
    if (pendingDraftWriteTimerRef.current) {
      clearTimeout(pendingDraftWriteTimerRef.current)
    }
    pendingDraftWriteTimerRef.current = setTimeout(() => {
      flushPendingDraftWrite()
      pendingDraftWriteTimerRef.current = null
    }, LABWARE_EDITOR_DRAFT_WRITE_DELAY_MS)
  }, [
    canPersistDraft,
    contextInitialized,
    contextMethodName,
    contextPlatformChoice,
    contextVocabChoice,
    deckPlacements,
    deckPlatform,
    deckVariant,
    draftRestoreAttempted,
      draftStorageKey,
      executionTargetPlatform,
      loadedTemplateBindings,
      loadedTemplateOutputs,
      loadedTemplateSourceId,
      loadAttempted,
      manualPipettingMode,
      playbackPosition,
      selectedTool,
      selectedVocabPackId,
      state,
      clearPendingDraftWrite,
      buildDraftSnapshot,
      flushPendingDraftWrite,
    ])
  
  // Load event graph by direct ID, or active run method when opening from run context.
  useEffect(() => {
    if (fixtureName) return
    if (platformsLoading) return
    if (loadAttempted) return
    if (forceNew && !initialEventGraphId && !runId) {
      setLoadAttempted(true)
      setIsLoading(false)
      setLoadError(null)
      return
    }

    const loadById = async (graphId: string) => {
      const data = await apiClient.loadEventGraph(graphId)
      const labwares = (data.labwares || []) as Labware[]
      const normalizedLabwares = new Map<string, Labware>()
      for (const labware of labwares) {
        normalizedLabwares.set(labware.labwareId, normalizeLabwareWithDefinition(labware))
      }
      const events = (data.events || []) as PlateEvent[]
      dispatch({
        type: 'LOAD_STATE',
        state: buildLoadedEditorState(normalizedLabwares, events),
      })
      const rawMethodContext = (data as Record<string, unknown>).methodContext as Record<string, unknown> | undefined
      const rawTemplateContext = (data as Record<string, unknown>).templateContext as Record<string, unknown> | undefined
      const platform = rawMethodContext?.platform
      const vocabId = rawMethodContext?.vocabId
      const lockedDeckVariant = rawMethodContext?.deckVariant
      const hasValidPlatform = typeof platform === 'string' && Boolean(getPlatformManifest(platforms, platform))
      const hasValidVocab = vocabId === 'liquid-handling/v1' || vocabId === 'animal-handling/v1'
      const shouldLockContext = rawMethodContext?.locked === true || Boolean(runId)
      if (hasValidPlatform && hasValidVocab) {
        const resolvedDeckVariant = typeof lockedDeckVariant === 'string'
          ? lockedDeckVariant
          : defaultVariantForPlatform(platforms, platform)
        setSelectedVocabPackId(vocabId)
        setContextVocabChoice(vocabId)
        setContextPlatformChoice(platform)
        if (shouldLockContext) {
          setRunMethodLockedPlatform(platform)
          setRunMethodLockedVocabId(vocabId)
          setRunMethodLockedDeckVariant(resolvedDeckVariant)
        } else {
          setRunMethodLockedPlatform(null)
          setRunMethodLockedVocabId(null)
          setRunMethodLockedDeckVariant(null)
        }
        setDeckVariant(resolvedDeckVariant)
        setDeckPlatform(platform)
        if (platform === DEFAULT_EDITOR_PLATFORM) {
          setManualPipettingMode(true)
        } else if (isRobotExecutionPlatform(platform)) {
          setManualPipettingMode(false)
          setExecutionTargetPlatform(platform)
        } else {
          setManualPipettingMode(true)
        }
        setContextInitialized(true)
      } else {
        setRunMethodLockedPlatform(null)
        setRunMethodLockedVocabId(null)
        setRunMethodLockedDeckVariant(null)
      }
      const sourceTemplateId = typeof rawMethodContext?.sourceTemplateId === 'string'
        ? rawMethodContext.sourceTemplateId
        : (typeof rawTemplateContext?.sourceTemplateId === 'string' ? rawTemplateContext.sourceTemplateId : null)
      setRunMethodSourceTemplateId(typeof rawMethodContext?.sourceTemplateId === 'string' ? rawMethodContext.sourceTemplateId : null)
      setLoadedTemplateSourceId(sourceTemplateId)
      const bindingSource = Array.isArray(rawMethodContext?.templateBindings)
        ? rawMethodContext?.templateBindings
        : (Array.isArray(rawTemplateContext?.templateBindings) ? rawTemplateContext.templateBindings : [])
      setLoadedTemplateBindings(bindingSource as TemplateLabwareBinding[])
      await loadTemplateMetadata(sourceTemplateId)
      const rawDeckLayout = (data as Record<string, unknown>).deckLayout as Record<string, unknown> | undefined
      if (rawDeckLayout && Array.isArray(rawDeckLayout.placements)) {
        const placements: DeckPlacement[] = rawDeckLayout.placements
          .map((p) => p as Record<string, unknown>)
          .map((p) => ({
            slotId: typeof p.slotId === 'string' ? p.slotId : '',
            ...(typeof p.labwareId === 'string' ? { labwareId: p.labwareId } : {}),
            ...(typeof p.moduleId === 'string' ? { moduleId: p.moduleId } : {}),
          }))
          .filter((p) => p.slotId.length > 0)
        setDeckPlacements(placements)
      }
      setEventGraphId(graphId)
    }

    setIsLoading(true)
    setLoadError(null)
    setLoadAttempted(true)
    ;(async () => {
      try {
        if (initialEventGraphId) {
          await loadById(initialEventGraphId)
          return
        }
        if (runId) {
          const method = await getRunMethod(runId)
          setRunMethodSummary(method)
          if (method.hasMethod && method.methodEventGraphId) {
            await loadById(method.methodEventGraphId)
            return
          }
        }
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : 'Failed to load event graph')
      } finally {
        setIsLoading(false)
      }
    })()
  }, [buildLoadedEditorState, fixtureName, platformsLoading, loadAttempted, initialEventGraphId, runId, forceNew, dispatch, loadTemplateMetadata, platforms])

  useEffect(() => {
    if (!fixtureName || fixtureLoaded) return
    dispatch({ type: 'LOAD_STATE', state: buildLabwareEditorFixture(fixtureName) })
    setFixtureLoaded(true)
  }, [dispatch, fixtureLoaded, fixtureName])

  useEffect(() => {
    if (templateLoadAttempted) return
    if (templateIds.length === 0) return
    if (fixtureName) return
    setTemplateLoadAttempted(true)
    ;(async () => {
      try {
        let merged: ReturnType<typeof materializedTemplateToState> | null = null
        for (let i = 0; i < templateIds.length; i += 1) {
          const materialized = await apiClient.materializeTemplate(templateIds[i], [])
          merged = materializedTemplateToState(materialized, {
            mergedWith: merged || {
              labwares: state.labwares,
              events: state.events,
              deckPlacements,
            },
          })
        }
        if (!merged) return
        dispatch({
          type: 'LOAD_STATE',
          state: buildLoadedEditorState(merged.labwares, merged.events),
        })
        if (templateIds.length === 1) {
          setLoadedTemplateSourceId(templateIds[0])
          setLoadedTemplateBindings([])
          await loadTemplateMetadata(templateIds[0])
        } else {
          setLoadedTemplateSourceId(null)
          setLoadedTemplateBindings([])
          setLoadedTemplateOutputs([])
        }
        if (merged.deckPlatform) {
          setDeckPlatform(merged.deckPlatform)
          if (isRobotExecutionPlatform(merged.deckPlatform)) {
            setExecutionTargetPlatform(merged.deckPlatform)
            setManualPipettingMode(false)
          } else {
            setManualPipettingMode(true)
          }
        }
        if (merged.deckVariant) setDeckVariant(merged.deckVariant)
        setDeckPlacements(merged.deckPlacements)
        setExecutionNotice(`Loaded ${templateIds.length} template${templateIds.length === 1 ? '' : 's'} into editor.`)
      } catch (err) {
        setExecutionNotice(err instanceof Error ? err.message : 'Failed to load template into editor')
      }
    })()
  }, [buildLoadedEditorState, deckPlacements, dispatch, fixtureName, loadTemplateMetadata, state.events, state.labwares, templateIds, templateLoadAttempted])

  const applyEditorContextSelection = useCallback((
    vocabId: MethodVocabId,
    platform: string,
    options?: { lock?: boolean; deckVariantOverride?: string | null }
  ) => {
    const lock = options?.lock === true
    const allowed = allowedPlatformsForVocab(platforms, vocabId)
    const allowedIds = allowed.map((entry) => entry.id)
    const resolvedPlatform = allowedIds.includes(platform) ? platform : (allowedIds[0] || DEFAULT_EDITOR_PLATFORM)
    const resolvedDeckVariant = options?.deckVariantOverride || defaultVariantForPlatform(platforms, resolvedPlatform)
    setSelectedVocabPackId(vocabId)
    setContextVocabChoice(vocabId)
    setContextPlatformChoice(resolvedPlatform)
    if (lock) {
      setRunMethodLockedVocabId(vocabId)
      setRunMethodLockedPlatform(resolvedPlatform)
      setRunMethodLockedDeckVariant(resolvedDeckVariant)
    } else {
      setRunMethodLockedVocabId(null)
      setRunMethodLockedPlatform(null)
      setRunMethodLockedDeckVariant(null)
    }
    setDeckVariant(resolvedDeckVariant)
    setDeckPlatform(resolvedPlatform)
    if (resolvedPlatform === 'manual') {
      setManualPipettingMode(true)
    } else if (isRobotExecutionPlatform(resolvedPlatform)) {
      setManualPipettingMode(false)
      setExecutionTargetPlatform(resolvedPlatform)
    } else {
      setManualPipettingMode(true)
    }
  }, [platforms])

  useEffect(() => {
    if (platformsLoading) return
    if (contextInitialized) return
    if (fixtureName) {
      setContextInitialized(true)
      return
    }
    if (!loadAttempted) return
    if (runMethodLockedPlatform && runMethodLockedVocabId) {
      setContextInitialized(true)
      return
    }

    let cancelled = false
    ;(async () => {
      if (runId) {
        try {
          const method = await getRunMethod(runId)
          setRunMethodSummary(method)
          if (cancelled) return
          if (method.methodPlatform && method.methodVocabId) {
            applyEditorContextSelection(method.methodVocabId, method.methodPlatform, { lock: true })
            setContextInitialized(true)
            return
          }
        } catch {
          // fall through to explicit context picker
        }
      }

      if (cancelled) return
      const startingVocab: MethodVocabId
        = selectedVocabPackId === 'animal-handling/v1' ? 'animal-handling/v1' : DEFAULT_EDITOR_VOCAB_ID
      const allowed = allowedPlatformsForVocab(platforms, startingVocab)
      const allowedIds = allowed.map((entry) => entry.id)
      const startingPlatform = allowedIds.includes(DEFAULT_EDITOR_PLATFORM)
        ? DEFAULT_EDITOR_PLATFORM
        : allowedIds.includes(deckPlatform)
          ? deckPlatform
          : (allowedIds[0] || DEFAULT_EDITOR_PLATFORM)
      applyEditorContextSelection(startingVocab, startingPlatform)
      setContextStep(1)
      setContextModalOpen(false)
      setContextInitialized(true)
    })()

    return () => {
      cancelled = true
    }
  }, [
    applyEditorContextSelection,
    contextInitialized,
    deckPlatform,
    fixtureName,
    loadAttempted,
    runId,
    runMethodLockedPlatform,
    runMethodLockedVocabId,
    selectedVocabPackId,
    platforms,
    platformsLoading,
  ])

  const handleVocabPackChange = useCallback((packId: string) => {
    if (packId !== 'liquid-handling/v1' && packId !== 'animal-handling/v1') return
    applyEditorContextSelection(packId, deckPlatform)
  }, [applyEditorContextSelection, deckPlatform])
  
  // Tool constraint system
  const { expandClick, selectTool } = useToolConstraints()
  
  // Connect selected tool to constraint system
  useEffect(() => {
    if (selectedTool) {
      // Map tool ID to constrained tool ID
      // The ToolSelector uses toolTypeId, we need to map to constrained tool ID
      const constrainedToolId = selectedTool.toolType.toolTypeId
      selectTool(constrainedToolId)
    } else {
      selectTool(null)
    }
  }, [selectedTool, selectTool])

  useEffect(() => {
    const count = selectedTool?.toolType.channelCount || 0
    if (count <= 1) {
      setToolSession({
        phase: 'idle',
        aspirateSpacingText: '9',
        dispenseSpacingText: '9',
        activeChannelIndicesText: '',
      })
      setToolSessionMessage(null)
      return
    }
    setToolSession((prev) => ({
      ...prev,
      phase: 'aspirate',
      aspirateSpacingText: '9',
      dispenseSpacingText: '9',
      activeChannelIndicesText: prev.activeChannelIndicesText || Array.from({ length: count }, (_, i) => String(i)).join(','),
    }))
    setToolSessionMessage({
      tone: 'info',
      text: 'Aspirate phase active. Click source wells in the source pane.',
    })
  }, [selectedTool?.toolType.toolTypeId])

  // Highlight wells when event is selected
  useEffect(() => {
    clearHighlight()
    if (state.selectedEventId) {
      const event = state.events.find((e) => e.eventId === state.selectedEventId)
      if (event) {
        const focusTargets = getEventFocusTargets(event, state.labwares)
        for (const target of focusTargets) {
          highlightWells(target.labwareId, target.wells)
        }
      }
    }
  }, [state.selectedEventId, state.events, state.labwares, highlightWells, clearHighlight])

  // Get selected wells from source labware
  const getSourceWells = useCallback((): WellId[] => {
    if (sourceSelection && sourceSelection.selectedWells.size > 0) {
      return Array.from(sourceSelection.selectedWells)
    }
    return []
  }, [sourceSelection])

  // Get selected wells from target labware
  const getTargetWells = useCallback((): WellId[] => {
    if (targetSelection && targetSelection.selectedWells.size > 0) {
      return Array.from(targetSelection.selectedWells)
    }
    return []
  }, [targetSelection])

  // Selection counts
  const sourceSelectionCount = sourceSelection?.selectedWells.size || 0
  const targetSelectionCount = targetSelection?.selectedWells.size || 0
  const selectedWellCount = sourceSelectionCount + targetSelectionCount
  const focusedEvent = useMemo(
    () => state.events.find((event) => event.eventId === state.selectedEventId) || null,
    [state.events, state.selectedEventId]
  )
  const editingEvent = useMemo(
    () => state.events.find((event) => event.eventId === state.editingEventId) || null,
    [state.events, state.editingEventId]
  )
  const focusedEventSummary = focusedEvent ? getEventSummary(focusedEvent) : null
  const editingEventSummary = editingEvent ? getEventSummary(editingEvent) : null

  useEffect(() => {
    if (toolSession.phase === 'aspirate' && sourceSelectionCount > 0) {
      setToolSession((prev) => ({ ...prev, phase: 'aspirate_selected' }))
      setToolSessionMessage({
        tone: 'info',
        text: 'Source wells captured. You can now click target wells directly or switch to dispense.',
      })
    }
  }, [toolSession.phase, sourceSelectionCount])

  useEffect(() => {
    if (!selectedTool?.toolType.toolTypeId.includes('pipette') || (selectedTool.toolType.channelCount || 0) <= 1) {
      return
    }
    if (toolSession.phase === 'dispense') {
      setToolSessionMessage({
        tone: 'info',
        text: targetSelectionCount > 0
          ? 'Target wells captured. Review spacing and commit the transfer.'
          : 'Dispense phase active. Click target wells in the target pane.',
      })
    }
  }, [selectedTool, targetSelectionCount, toolSession.phase])

  // Combine selected wells for context panel
  const selectedWellsForContext: SelectedWell[] = useMemo(() => {
    const result: SelectedWell[] = []
    if (sourceLabware && sourceSelection) {
      for (const wellId of sourceSelection.selectedWells) {
        result.push({ labwareId: sourceLabware.labwareId, wellId })
      }
    }
    if (targetLabware && targetSelection) {
      for (const wellId of targetSelection.selectedWells) {
        result.push({ labwareId: targetLabware.labwareId, wellId })
      }
    }
    return result
  }, [sourceLabware, targetLabware, sourceSelection, targetSelection])

  const createContextRecordsFromSelection = useCallback(async () => {
    const labwareStates = computeLabwareStates(state.events, state.labwares)
    const created: Array<{ contextId: string; labwareId: string; wellId: string }> = []
    for (const selected of selectedWellsForContext) {
      const wellState = getWellState(labwareStates, selected.labwareId, selected.wellId)
      const contextId = `CTX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
      const contents = wellState.materials.map((material) => ({
        material_ref: { kind: 'record' as const, id: material.materialRef, type: 'material', label: material.materialRef },
        volume: { value: Number(material.volume_uL.toFixed(3)), unit: 'uL' },
        ...(material.concentration ? { concentration: material.concentration } : {}),
      }))
      const contextPayload: Record<string, unknown> = {
        id: contextId,
        subject_ref: { kind: 'record', id: `${selected.labwareId}:${selected.wellId}`, type: 'well', label: `${selected.labwareId} ${selected.wellId}` },
        ...(eventGraphId ? { event_graph_ref: { kind: 'record', id: eventGraphId, type: 'event_graph', label: eventGraphId } } : {}),
        ...(contents.length > 0 ? { contents } : {}),
        total_volume: { value: Number(wellState.volume_uL.toFixed(3)), unit: 'uL' },
        properties: {
          harvested: wellState.harvested,
          incubation_count: wellState.incubations.length,
          source_event_count: wellState.eventHistory.length,
        },
        notes: `Derived from ${selected.labwareId} ${selected.wellId}`,
      }
      await apiClient.createRecord('computable-lab/context', contextPayload)
      created.push({ contextId, labwareId: selected.labwareId, wellId: selected.wellId })
    }
    return created
  }, [eventGraphId, selectedWellsForContext, state.events, state.labwares])

  const handlePromoteMaterialOutput = useCallback(async () => {
    if (selectedWellsForContext.length === 0) return
    setMaterialOutputBusy(true)
    setMaterialOutputNotice(null)
    try {
      const contexts = await createContextRecordsFromSelection()
      const response = await apiClient.promoteMaterialFromContext({
        sourceContextIds: contexts.map((entry) => entry.contextId),
        outputMode: materialOutputMode,
        ...(materialOutputName.trim() ? { name: materialOutputName.trim() } : {}),
        ...(materialOutputRef ? { materialRef: materialOutputRef } : {}),
      })
      setMaterialOutputNotice(`Created reusable material ${response.materialInstanceId}${response.derivationId ? ` via ${response.derivationId}` : ''}.`)
      setSelectionActionPanel(null)
    } catch (err) {
      setMaterialOutputNotice(err instanceof Error ? err.message : 'Failed to promote material output')
    } finally {
      setMaterialOutputBusy(false)
    }
  }, [createContextRecordsFromSelection, materialOutputMode, materialOutputName, materialOutputRef, selectedWellsForContext.length])
  const handleSavePlateSnapshot = useCallback(async () => {
    if (selectedWellsForContext.length === 0) return
    const labwareIds = new Set(selectedWellsForContext.map((selected) => selected.labwareId))
    if (labwareIds.size !== 1) {
      setPlateSnapshotNotice('Plate snapshots require selected wells from exactly one plate.')
      return
    }
    setPlateSnapshotBusy(true)
    setPlateSnapshotNotice(null)
    try {
      const contexts = await createContextRecordsFromSelection()
      const labwareId = contexts[0]?.labwareId
      const response = await apiClient.promoteContext({
        sourceContextIds: contexts.map((entry) => entry.contextId),
        outputKind: 'plate-snapshot',
        ...(plateSnapshotTitle.trim() ? { title: plateSnapshotTitle.trim() } : { title: `Plate Snapshot ${labwareId}` }),
        ...(eventGraphId ? { sourceEventGraphRef: { kind: 'record', id: eventGraphId, type: 'event_graph', label: eventGraphId } } : {}),
        ...(labwareId ? { labwareRef: { kind: 'record', id: labwareId, type: 'labware', label: labwareId } } : {}),
        wellMappings: contexts.map((entry) => ({
          well: entry.wellId,
          contextId: entry.contextId,
        })),
      })
      if (!response.success || !response.outputRecordId) {
        throw new Error(response.error || 'Failed to save plate snapshot')
      }
      setPlateSnapshotNotice(`Created plate snapshot ${response.outputRecordId}.`)
      setPlateSnapshotTitle('')
      setSelectionActionPanel(null)
    } catch (err) {
      setPlateSnapshotNotice(err instanceof Error ? err.message : 'Failed to save plate snapshot')
    } finally {
      setPlateSnapshotBusy(false)
    }
  }, [createContextRecordsFromSelection, eventGraphId, plateSnapshotTitle, selectedWellsForContext])
  const handleSaveAsFormulation = useCallback(async () => {
    if (selectedWellsForContext.length !== 1) {
      setFormulationNotice('Save As Formulation currently supports exactly one selected well.')
      return
    }
    const labwareStates = computeLabwareStates(state.events, state.labwares)
    const selected = selectedWellsForContext[0]
    const wellState = getWellState(labwareStates, selected.labwareId, selected.wellId)
    if (wellState.materials.length === 0 || wellState.volume_uL <= 0) {
      setFormulationNotice('The selected well has no material state to save as a formulation.')
      return
    }
    setFormulationBusy(true)
    setFormulationNotice(null)
    try {
      const recipeName = formulationName.trim() || `${selected.labwareId} ${selected.wellId} Formulation`
      const payload = {
        ...(formulationRef ? {
          outputSpec: {
            name: recipeName,
            ...(formulationRef.kind === 'record' ? { materialRefId: formulationRef.id } : {}),
            notes: `Derived from ${selected.labwareId} ${selected.wellId}`,
          },
        } : {
          outputSpec: {
            name: recipeName,
            notes: `Derived from ${selected.labwareId} ${selected.wellId}`,
          },
        }),
        recipe: {
          name: recipeName,
          inputRoles: wellState.materials.map((material, index) => ({
            roleId: `ingredient_${index + 1}`,
            roleType: 'ingredient',
            required: true,
            materialRefId: material.materialRef,
            measureMode: 'fixed_amount' as const,
            sourceState: 'liquid' as const,
            requiredAmount: {
              value: Number(material.volume_uL.toFixed(3)),
              unit: 'uL',
            },
            ...(material.concentration ? { targetContribution: material.concentration } : {}),
            constraints: [],
          })),
          steps: [
            {
              order: 1,
              instruction: `Combine ingredients as captured from ${selected.labwareId} ${selected.wellId}.`,
            },
          ],
          batch: {
            defaultOutputQuantity: {
              value: Number(wellState.volume_uL.toFixed(3)),
              unit: 'uL',
            },
          },
          scale: {
            defaultBatchVolume: {
              value: Number(wellState.volume_uL.toFixed(3)),
              unit: 'uL',
            },
          },
        },
      }
      const result = await apiClient.createFormulation(payload)
      setFormulationNotice(`Created formulation ${result.recipeId}.`)
      setFormulationName('')
      setSelectionActionPanel(null)
    } catch (err) {
      setFormulationNotice(err instanceof Error ? err.message : 'Failed to save formulation')
    } finally {
      setFormulationBusy(false)
    }
  }, [formulationName, formulationRef, selectedWellsForContext, state.events, state.labwares])
  useEffect(() => {
    if (selectedWellsForContext.length === 0) {
      setSelectionActionPanel(null)
    }
  }, [selectedWellsForContext.length])

  const toolChannelCount = selectedTool?.toolType.channelCount || 0
  const isMultichannelSession = Boolean(selectedTool?.toolType.toolTypeId.includes('pipette') && toolChannelCount > 1)
  const isAdjustableSpacingTool = Boolean(selectedTool?.toolType.toolTypeId.includes('_adjustable'))
  const activeChannelIndices = useMemo(
    () => parseActiveChannelIndices(toolSession.activeChannelIndicesText, toolChannelCount),
    [toolSession.activeChannelIndicesText, toolChannelCount]
  )
  const aspirateSpacingMm = isAdjustableSpacingTool
    ? parseNumberOr(toolSession.aspirateSpacingText, 9)
    : 9
  const dispenseSpacingMm = isAdjustableSpacingTool
    ? parseNumberOr(toolSession.dispenseSpacingText, aspirateSpacingMm)
    : 9
  const toolSessionSummary = useMemo(() => {
    if (!isMultichannelSession) return null
    return {
      phaseLabel: toolSession.phase === 'aspirate_selected' ? 'ready to dispense' : toolSession.phase,
      sourceText: formatCount(sourceSelectionCount, 'source well'),
      targetText: formatCount(targetSelectionCount, 'target well'),
      channelsText: formatCount(activeChannelIndices.length, 'channel'),
      aspirateText: `${aspirateSpacingMm} mm`,
      dispenseText: `${dispenseSpacingMm} mm`,
    }
  }, [
    activeChannelIndices.length,
    aspirateSpacingMm,
    dispenseSpacingMm,
    isAdjustableSpacingTool,
    isMultichannelSession,
    sourceSelectionCount,
    targetSelectionCount,
    toolSession.phase,
  ])
  const labwareDiagnostics = useMemo(() => {
    const entries: Array<{
      pane: 'source' | 'target'
      name: string
      definitionId: string
      addressing: string
      axis: string
      effectiveAxis: string
      pipetteAxis: string
      orientation: string
      sourceMode: string
      mappingMode: string
      warnings: string[]
    }> = []
    const platformForCompatibility: CompatibilityTargetPlatform = manualPipettingMode ? 'manual' : executionTargetPlatform
    const isMultichannelPipette = Boolean(selectedTool?.toolTypeId.includes('pipette') && (selectedTool?.toolType.channelCount || 0) > 1)
    const candidates: Array<{ pane: 'source' | 'target'; labware: Labware | null }> = [
      { pane: 'source', labware: sourceLabware },
      { pane: 'target', labware: targetLabware },
    ]
    for (const item of candidates) {
      if (!item.labware) continue
      const labware = item.labware
      const definition = getLabwareDefinitionById(labware.definitionId) || getLabwareDefinitionByLegacyType(labware.labwareType)
      const sourceMode = definition ? resolveDefinitionMultichannelSourceMode(definition) : 'n/a'
      const orientation = getLabwareOrientation(labware.labwareId)
      const compatibility = resolvePipetteLabwareCompatibility({
        labware,
        tool: selectedTool,
        spacingMm: item.pane === 'source' ? aspirateSpacingMm : dispenseSpacingMm,
        role: item.pane,
        orientation,
        platform: platformForCompatibility,
      })
      entries.push({
        pane: item.pane,
        name: labware.name,
        definitionId: definition?.id || '(legacy)',
        addressing: labware.addressing.type,
        axis: labware.addressing.type === 'linear' ? (labware.linearAxis || 'x') : 'n/a',
        effectiveAxis: labware.addressing.type === 'linear' ? (compatibility.effectiveLinearAxis || resolveEffectiveLinearAxisForLabware(labware, orientation)) : 'n/a',
        pipetteAxis: isMultichannelPipette ? (compatibility.pipetteAxis || resolvePipetteChannelAxis(selectedTool, platformForCompatibility)) : 'n/a',
        orientation,
        sourceMode: labware.addressing.type === 'linear' ? sourceMode : 'n/a',
        mappingMode: labware.addressing.type === 'linear' ? compatibility.mode : 'n/a',
        warnings: labware.definitionWarnings || [],
      })
    }
    return entries
  }, [getLabwareOrientation, sourceLabware, targetLabware, manualPipettingMode, executionTargetPlatform, selectedTool, aspirateSpacingMm, dispenseSpacingMm])
  const hasGenericOrFallbackLabware = useMemo(
    () => Array.from(state.labwares.values()).some((lw) => lw.definitionSource === 'legacy_fallback' || lw.definitionSource === 'unmapped'),
    [state.labwares]
  )
  const shouldShowSelectionWorkspace = selectedWellCount > 0
  const shouldShowEditorStateBanner = Boolean(focusedEvent || editingEvent || shouldShowSelectionWorkspace)
  const appliedEvents = useMemo(() => {
    if (typeof playbackPosition !== 'number') return state.events
    return state.events.slice(0, Math.max(0, Math.min(state.events.length, playbackPosition)))
  }, [playbackPosition, state.events])
  const computedLabwareStates = useMemo(() => computeLabwareStates(state.events, state.labwares), [state.events, state.labwares])

  const placedLabwareIds = useMemo(() => {
    const ids = new Set<string>()
    for (const placement of deckPlacements) {
      if (!placement.slotId.startsWith('bench:') && placement.labwareId) ids.add(placement.labwareId)
    }
    return ids
  }, [deckPlacements])

  const placedTipRacks = useMemo(() => (
    Array.from(state.labwares.values()).filter((lw) => isTipRackType(lw.labwareType) && placedLabwareIds.has(lw.labwareId))
  ), [placedLabwareIds, state.labwares])
  const canRotateLabwareInPane = useCallback((labwareId: string): boolean => {
    const labware = state.labwares.get(labwareId)
    if (!labware) return false
    if (labware.addressing.type !== 'grid') return false
    if (labware.orientationPolicy === 'fixed_columns') return false
    if ((executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex') && isTipRackType(labware.labwareType)) return false

    const placement = deckPlacements.find((entry) => entry.labwareId === labwareId)
    if (!placement) return true

    const profile = getVariantManifest(platforms, deckPlatform, deckVariant)
    const slot = profile?.slots.find((entry) => entry.id === placement.slotId)
    if (slot && getDeckSlotLockedOrientation(slot)) return false

    return true
  }, [deckPlacements, deckPlatform, deckVariant, executionTargetPlatform, platforms, state.labwares])
  const getRotateDisabledReason = useCallback((labwareId: string): string | null => {
    const labware = state.labwares.get(labwareId)
    if (!labware) return 'Labware unavailable.'
    if (labware.addressing.type !== 'grid') return 'This labware cannot be rotated.'
    if (labware.orientationPolicy === 'fixed_columns') return 'This labware has a fixed orientation.'
    if ((executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex') && isTipRackType(labware.labwareType)) {
      return 'Tip racks are fixed in landscape on this platform.'
    }

    const placement = deckPlacements.find((entry) => entry.labwareId === labwareId)
    if (!placement) return null

    const profile = getVariantManifest(platforms, deckPlatform, deckVariant)
    const slot = profile?.slots.find((entry) => entry.id === placement.slotId)
    const locked = slot ? getDeckSlotLockedOrientation(slot) : null
    if (locked) return `Slot ${slot?.id || placement.slotId} is locked to ${locked} orientation.`

    return null
  }, [deckPlacements, deckPlatform, deckVariant, executionTargetPlatform, platforms, state.labwares])

  const tipTracking = useMemo(() => runTipTracking({
    events: appliedEvents,
    tipRacks: placedTipRacks,
    channels: Math.max(1, selectedTool?.toolType.channelCount || 1),
    isOpentrons: executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex',
    manualMode: manualPipettingMode,
  }), [appliedEvents, executionTargetPlatform, manualPipettingMode, placedTipRacks, selectedTool?.toolType.channelCount])

  const openTemplateModal = useCallback((anchorLabwareId: string | null) => {
    setTemplateAnchorLabwareId(anchorLabwareId)
    setTemplateName('')
    setTemplateNotes('')
    setTemplateVersion('v1')
    setTemplateExperimentTypes([])
    setTemplateOutputDrafts(
      Array.from(state.labwares.values()).map((labware) => ({
        sourceLabwareId: labware.labwareId,
        label: labware.name,
        enabled: anchorLabwareId === labware.labwareId,
      }))
    )
    setTemplateSaveError(null)
    setTemplateModalOpen(true)
  }, [state.labwares])

  const applyLoadedTemplate = useCallback(async (
    templateId: string,
    bindings: TemplateLabwareBinding[] = [],
    options?: { replace?: boolean; notice?: string }
  ) => {
    const materialized = await apiClient.materializeTemplate(templateId, bindings)
    setLoadedTemplateSourceId(templateId)
    setLoadedTemplateBindings(bindings)
    setLoadedTemplateOutputs(materialized.outputs || [])
    setRunMethodSourceTemplateId(null)
    const mergedState = options?.replace === false
      ? materializedTemplateToState(materialized, {
          mergedWith: {
            labwares: state.labwares,
            events: state.events,
            deckPlacements,
          },
        })
      : materializedTemplateToState(materialized)

    dispatch({
      type: 'LOAD_STATE',
      state: buildLoadedEditorState(mergedState.labwares, mergedState.events),
    })
    if (mergedState.deckPlatform) {
      setDeckPlatform(mergedState.deckPlatform)
      if (isRobotExecutionPlatform(mergedState.deckPlatform)) {
        setExecutionTargetPlatform(mergedState.deckPlatform)
        setManualPipettingMode(false)
      } else {
        setManualPipettingMode(true)
      }
    }
    if (mergedState.deckVariant) setDeckVariant(mergedState.deckVariant)
    setDeckPlacements(mergedState.deckPlacements)
      setExecutionNotice(options?.notice || mergedState.notice)
  }, [deckPlacements, dispatch, state.events, state.labwares])

  const handleChangeDeckPlacement = useCallback((slotId: string, patch: { labwareId?: string; moduleId?: string }) => {
    setDeckPlacements((prev) => {
      const map = new Map(prev.map((item) => [item.slotId, item]))
      const current = map.get(slotId) || { slotId }
      const next = { ...current, ...patch }
      if (!next.labwareId && !next.moduleId) {
        map.delete(slotId)
      } else {
        map.set(slotId, next)
      }
      return Array.from(map.values())
    })
  }, [])

  // Handle add event (with auto-population)
  const handleAddEvent = useCallback((event: PlateEvent) => {
    // Auto-populate labwareId for most events
    if (sourceLabware) {
      if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
        event.details = {
          ...event.details,
          source_labwareId: sourceLabware.labwareId,
        }
        if (targetLabware) {
          event.details = {
            ...event.details,
            dest_labwareId: targetLabware.labwareId,
          }
        }
        event.details = withCanonicalTransferDetails(event.details as TransferDetails)
      } else if (event.event_type === 'macro_program') {
        const details = event.details as Record<string, unknown>
        const program = details.program as MacroProgram | undefined
        if (program?.kind === 'serial_dilution') {
          const normalized = normalizeSerialDilutionParams(program.params)
          const needsRewrite = normalized.lanes.some((lane) => !lane.targetLabwareId || lane.targetLabwareId === 'source')
          if (needsRewrite) {
            event.details = {
              ...details,
              labwareId: sourceLabware.labwareId,
              program: {
                ...program,
                params: {
                  ...normalized,
                  lanes: normalized.lanes.map((lane) => ({
                    ...lane,
                    targetLabwareId: lane.targetLabwareId && lane.targetLabwareId !== 'source'
                      ? lane.targetLabwareId
                      : sourceLabware.labwareId,
                    sourceLabwareId: lane.sourceLabwareId && lane.sourceLabwareId !== 'source'
                      ? lane.sourceLabwareId
                      : (normalized.mode === 'prepare_then_transfer' || normalized.mode === 'source_to_target'
                        ? sourceLabware.labwareId
                        : lane.sourceLabwareId),
                    startSource: lane.startSource.kind === 'existing_well'
                      ? {
                          ...lane.startSource,
                          labwareId: lane.startSource.labwareId && lane.startSource.labwareId !== 'source'
                            ? lane.startSource.labwareId
                            : sourceLabware.labwareId,
                        }
                      : lane.startSource,
                  })),
                },
              },
            }
          }
        } else if (program?.kind === 'quadrant_replicate') {
          event.details = {
            ...details,
            program: {
              ...program,
              params: {
                ...program.params,
                sourceLabwareId: program.params.sourceLabwareId || sourceLabware.labwareId,
                targetLabwareId: program.params.targetLabwareId || targetLabware?.labwareId || '',
              },
            },
          }
        } else if (program?.kind === 'spacing_transition_transfer') {
          event.details = {
            ...details,
            program: {
              ...program,
              params: {
                ...program.params,
                sourceLabwareId: program.params.sourceLabwareId || sourceLabware.labwareId,
                targetLabwareId: program.params.targetLabwareId || targetLabware?.labwareId || '',
              },
            },
          }
        } else {
          event.details = {
            ...event.details,
            labwareId: sourceLabware.labwareId,
          }
        }
      } else {
        event.details = {
          ...event.details,
          labwareId: sourceLabware.labwareId,
        }
      }
    }
    addEvent(event)
  }, [sourceLabware, targetLabware, addEvent])

  const commitToolSessionTransfer = useCallback(() => {
    if (!selectedTool?.toolType.channelCount || selectedTool.toolType.channelCount <= 1) return
    if (!sourceLabware || !targetLabware) return
    const sourceWells = Array.from(sourceSelection?.selectedWells || [])
    const targetWells = Array.from(targetSelection?.selectedWells || [])
    if (sourceWells.length === 0 || targetWells.length === 0) return

    const activeIndices = parseActiveChannelIndices(toolSession.activeChannelIndicesText, selectedTool.toolType.channelCount)
    const transferEvent: PlateEvent = {
      eventId: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      event_type: 'transfer',
      t_offset: 'PT0M',
      details: {
        source_labwareId: sourceLabware.labwareId,
        dest_labwareId: targetLabware.labwareId,
        source_wells: sourceWells,
        dest_wells: targetWells,
        volume: { value: 10, unit: 'uL' },
        source: { labwareInstanceId: sourceLabware.labwareId, wells: sourceWells },
        target: { labwareInstanceId: targetLabware.labwareId, wells: targetWells },
        mapping: sourceWells.slice(0, Math.min(sourceWells.length, targetWells.length)).map((sourceWell, idx) => ({
          source_well: sourceWell,
          target_well: targetWells[idx],
          volume_uL: 10,
        })),
        // Retain tool-shape hints for execution planners/compilers.
        channels: activeIndices.length,
        activeChannels: activeIndices,
        spacing_at_aspirate_mm: aspirateSpacingMm,
        spacing_at_dispense_mm: dispenseSpacingMm,
      } as PlateEvent['details'],
    }
    handleAddEvent(transferEvent)
    if (sourceLabware) clearHighlight()
    if (sourceLabware) clearSelection(sourceLabware.labwareId)
    if (targetLabware) clearSelection(targetLabware.labwareId)
    setToolSession((prev) => ({ ...prev, phase: 'idle' }))
    setToolSessionMessage({
      tone: 'info',
      text: `Committed transfer from ${sourceWells.length} source wells to ${targetWells.length} target wells.`,
    })
  }, [
    selectedTool,
    sourceLabware,
    targetLabware,
    sourceSelection,
    targetSelection,
    toolSession.activeChannelIndicesText,
    aspirateSpacingMm,
    dispenseSpacingMm,
    handleAddEvent,
    clearHighlight,
    clearSelection,
  ])

  const resetToolSession = useCallback(() => {
    if (sourceLabware) clearSelection(sourceLabware.labwareId)
    if (targetLabware) clearSelection(targetLabware.labwareId)
    setToolSession((prev) => ({ ...prev, phase: 'aspirate' }))
    setToolSessionMessage({
      tone: 'info',
      text: 'Session reset. Click source wells in the source pane to begin again.',
    })
  }, [clearSelection, sourceLabware, targetLabware])

  const cancelToolSession = useCallback(() => {
    if (sourceLabware) clearSelection(sourceLabware.labwareId)
    if (targetLabware) clearSelection(targetLabware.labwareId)
    setToolSession((prev) => ({ ...prev, phase: 'idle' }))
    setToolSessionMessage({
      tone: 'info',
      text: 'Session cancelled. Selections were cleared and no transfer was committed.',
    })
  }, [clearSelection, sourceLabware, targetLabware])

  const handleToolSessionValidation = useCallback((messages: ValidationMessage[]) => {
    const primary = messages[0]
    if (!primary) return
    setToolSessionMessage({
      tone: primary.type === 'error' || primary.type === 'warning' ? 'warning' : 'info',
      text: primary.message,
    })
  }, [])

  const beginAspiratePhase = useCallback(() => {
    if (sourceLabware) clearSelection(sourceLabware.labwareId)
    setToolSession((prev) => ({ ...prev, phase: 'aspirate' }))
    setToolSessionMessage({
      tone: 'info',
      text: 'Aspirate phase active. Click source wells in the source pane.',
    })
  }, [clearSelection, sourceLabware])

  const beginDispensePhase = useCallback(() => {
    if (sourceSelectionCount === 0) {
      setToolSessionMessage({
        tone: 'warning',
        text: 'Select source wells in aspirate phase before switching to dispense.',
      })
      return
    }
    if (targetLabware) clearSelection(targetLabware.labwareId)
    setToolSession((prev) => ({ ...prev, phase: 'dispense' }))
    setToolSessionMessage({
      tone: 'info',
      text: 'Dispense phase active. Click target wells in the target pane.',
    })
  }, [clearSelection, sourceSelectionCount, targetLabware])

  const canCommitToolSession =
    toolSession.phase === 'dispense' &&
    sourceSelectionCount > 0 &&
    targetSelectionCount > 0

  const sessionAwareExpander = useCallback(
    (click: WellId, labware: Labware, context: 'source' | 'target', orientation?: LabwareOrientation): SelectionExpansion | null => {
      const channelCount = selectedTool?.toolType.channelCount || 0
      if (!selectedTool || selectedTool.toolTypeId.includes('pipette') === false || channelCount <= 1) {
        return expandClick(click, labware, context, orientation)
      }
      const activeIndices = parseActiveChannelIndices(toolSession.activeChannelIndicesText, channelCount)
      const spacing = context === 'source' ? aspirateSpacingMm : dispenseSpacingMm
      const platformForCompatibility: CompatibilityTargetPlatform = manualPipettingMode ? 'manual' : executionTargetPlatform
      const compatibility = resolvePipetteLabwareCompatibility({
        labware,
        tool: selectedTool,
        spacingMm: spacing,
        role: context,
        orientation: normalizeOrientationForLabware(labware, orientation),
        platform: platformForCompatibility,
      })
      const effectiveMappingMode: MappingMode = compatibility.mode === 'invalid' ? 'per_channel' : compatibility.mode
      const wells = expandPipetteClick(
        click,
        labware,
        channelCount,
        spacing,
        activeIndices,
        orientation,
        effectiveMappingMode,
        compatibility.pipetteAxis || resolvePipetteChannelAxis(selectedTool, platformForCompatibility),
        compatibility.effectiveLinearAxis
      )
      return {
        original: click,
        selection: flatSelection(wells),
        strategyId: 'session_pipette_spacing',
        validation: validResult([
          infoMessage('PIPETTE_SESSION', `${channelCount}ch @ ${spacing}mm`, wells),
          ...compatibility.issues.map((issue) => warningMessage(issue.code, issue.message, wells)),
        ]),
      }
    },
    [selectedTool, toolSession.activeChannelIndicesText, aspirateSpacingMm, dispenseSpacingMm, toolSession.phase, expandClick, manualPipettingMode, executionTargetPlatform]
  )

  // Handle select event
  const handleSelectEvent = useCallback((eventId: string | null) => {
    editEvent(null)
    selectEvent(eventId)
  }, [editEvent, selectEvent])

  // Handle clicking event in context panel
  const handleContextEventClick = useCallback((eventId: string) => {
    editEvent(null)
    selectEvent(eventId)
  }, [editEvent, selectEvent])

  const handleClearEventFocus = useCallback(() => {
    editEvent(null)
    selectEvent(null)
  }, [editEvent, selectEvent])

  const buildEventGraphSavePayload = useCallback((events: PlateEvent[]) => {
    const labwaresArray = Array.from(state.labwares.values())
    const normalizedEvents = normalizeEventGraphEventsForSave(events)
    const sourceTemplateId = runMethodSourceTemplateId || loadedTemplateSourceId
    const basePayload: Record<string, unknown> = {
      events: normalizedEvents,
      labwares: labwaresArray,
      name: `Event Graph ${new Date().toLocaleString()}`,
      runId: runId || undefined,
      links: {
        runId: runId || undefined,
        studyId: studyId || undefined,
        experimentId: experimentId || undefined,
      },
      status: runId ? 'filed' : 'inbox',
    }
    if (runMethodLockedPlatform) {
      const placements = deckPlacements.map((placement) => ({ ...placement }))
      const labwareOrientations = Object.fromEntries(
        Array.from(state.labwares.values()).map((lw) => [lw.labwareId, getLabwareOrientation(lw.labwareId)])
      )
      basePayload.methodContext = {
        ...(runId ? { runId } : {}),
        ...(sourceTemplateId ? { sourceTemplateId } : {}),
        vocabId: runMethodLockedVocabId || selectedVocabPackId,
        platform: runMethodLockedPlatform,
        deckVariant: runMethodLockedDeckVariant || deckVariant,
        locked: true,
        ...(loadedTemplateBindings.length > 0 ? { templateBindings: loadedTemplateBindings } : {}),
      }
      basePayload.deckLayout = {
        placements,
        labwareOrientations,
      }
    } else if (sourceTemplateId || loadedTemplateBindings.length > 0) {
      basePayload.templateContext = {
        ...(sourceTemplateId ? { sourceTemplateId } : {}),
        ...(loadedTemplateBindings.length > 0 ? { templateBindings: loadedTemplateBindings } : {}),
      }
    }
    return basePayload
  }, [deckPlacements, deckVariant, experimentId, getLabwareOrientation, loadedTemplateBindings, loadedTemplateSourceId, runId, runMethodLockedDeckVariant, runMethodLockedPlatform, runMethodLockedVocabId, runMethodSourceTemplateId, selectedVocabPackId, state.labwares, studyId])

  // Handle save and commit/push to git
  const handleSaveAndPush = useCallback(async () => {
    if (saveState === 'saving') return
    
    setSaveState('saving')
    setSaveError(null)
    
    try {
      const preflightError = validateEventGraphBeforeSave(state.events, state.labwares)
      if (preflightError) {
        throw new Error(preflightError)
      }
      const graphValidation = runEventGraphValidation(state.events, state.labwares, { errorsOnly: false })
      const overfillErrors = graphValidation.errors.filter((item) => item.severity === 'error' && item.code === 'OVERFILL')
      if (overfillErrors.length > 0) {
        throw new Error(`Volume validation failed: ${overfillErrors[0]?.message || 'One or more wells exceed capacity.'}`)
      }

      // 1. Save event graph to server
      const saveResult = await apiClient.saveEventGraph(eventGraphId, buildEventGraphSavePayload(state.events) as any)
      
      // Track the ID for future updates
      const savedId = (saveResult.record as { id?: string })?.id
      if (savedId) {
        setEventGraphId(savedId)
      }
      
      // 2. Commit and push to git
      const commitMessage = eventGraphId 
        ? `Update event graph ${eventGraphId}` 
        : `Create event graph ${savedId || 'new'}`
      
      const gitResult = await apiClient.commitAndPush(commitMessage)
      
      if (gitResult.success) {
        setSaveState('success')
        // Reset to idle after showing success briefly
        setTimeout(() => setSaveState('idle'), 2000)
      } else {
        // Save succeeded but git failed - show warning but not error
        console.warn('Git commit/push failed:', gitResult.error)
        setSaveState('success')
        setTimeout(() => setSaveState('idle'), 2000)
      }
    } catch (err) {
      console.error('Save & Push failed:', err)
      setSaveState('error')
      setSaveError(formatSaveError(err))
    }
  }, [saveState, eventGraphId, state.events, buildEventGraphSavePayload])

  useEffect(() => {
    if (executionPlanRecordId) return
    const seed = eventGraphId || `EVG-${Date.now().toString(36)}`
    setExecutionPlanRecordId(`EPL-${seed.replace(/[^A-Za-z0-9]/g, '').slice(0, 10) || '000001'}`)
  }, [executionPlanRecordId, eventGraphId])

  useEffect(() => {
    if (executionPlanId) return
    const seed = eventGraphId || `EVG-${Date.now().toString(36)}`
    setExecutionPlanId(toExecutionPlanId(`PLAN-${seed.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || '0001'}`))
  }, [executionPlanId, eventGraphId])

  useEffect(() => {
    if (executionEnvironmentRef) return
    const seed = eventGraphId || `EVG-${Date.now().toString(36)}`
    setExecutionEnvironmentRef(toExecutionEnvironmentId(`ENV-${seed.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) || '0001'}`))
  }, [executionEnvironmentRef, eventGraphId])

  const ensureEventGraphSaved = useCallback(async (): Promise<string> => {
    if (eventGraphId) return eventGraphId
    const saveResult = await apiClient.saveEventGraph(null, buildEventGraphSavePayload(state.events) as any)
    const savedId = (saveResult.record as { id?: string; recordId?: string } | undefined)?.id
      || (saveResult.record as { id?: string; recordId?: string } | undefined)?.recordId
      || (saveResult.record as { recordId?: string } | undefined)?.recordId
    if (!savedId) {
      throw new Error('Event graph save succeeded but no record ID was returned')
    }
    setEventGraphId(savedId)
    return savedId
  }, [eventGraphId, state.events, buildEventGraphSavePayload])

  const saveEventGraphSnapshot = useCallback(async (events: PlateEvent[]): Promise<string> => {
    const preflightError = validateEventGraphBeforeSave(events, state.labwares)
    if (preflightError) {
      throw new Error(preflightError)
    }
    const saveResult = await apiClient.saveEventGraph(eventGraphId || null, buildEventGraphSavePayload(events) as any)
    const savedId = (saveResult.record as { id?: string; recordId?: string } | undefined)?.id
      || (saveResult.record as { id?: string; recordId?: string } | undefined)?.recordId
      || eventGraphId
    if (!savedId) {
      throw new Error('Event graph save succeeded but no record ID was returned')
    }
    if (!eventGraphId || eventGraphId !== savedId) {
      setEventGraphId(savedId)
    }
    return savedId
  }, [eventGraphId, buildEventGraphSavePayload])

  const buildExecutionPlanPayload = useCallback((resolvedEventGraphId: string): Record<string, unknown> => {
    const labwares = Array.from(state.labwares.values())
    const robotDeckPlacements = deckPlacements.filter((p) => !p.slotId.startsWith('bench:'))
    const labwareById = new Map(labwares.map((lw) => [lw.labwareId, lw] as const))
    const occupied = new Map<string, string>()
    for (const placement of robotDeckPlacements) {
      if (!placement.labwareId) continue
      occupied.set(placement.slotId, placement.labwareId)
    }
    const labwarePlacements = Array.from(occupied.entries())
      .map(([slot, labwareId]) => ({ slot, lw: labwareById.get(labwareId) }))
      .filter((item): item is { slot: string; lw: Labware } => Boolean(item.lw))
      .filter(({ lw }) => !isTipRackType(lw.labwareType))
      .map(({ slot, lw }) => {
      const orientation = getLabwareOrientation(lw.labwareId)
      const definition = getLabwareDefinitionById(lw.definitionId) || getLabwareDefinitionByLegacyType(lw.labwareType)
      const platformKey = executionTargetPlatform === 'integra_assist'
        ? 'integra_assist_plus'
        : executionTargetPlatform
      const platformAlias = getDefinitionAliasForPlatform(definition, platformKey)
      const labwareIdForPlan = platformAlias || definition?.id || lw.definitionId || lw.labwareType || lw.labwareId
      return {
        labware_ref: lw.labwareId,
        labware_id: labwareIdForPlan,
        slot_id: slot,
        orientation: orientation === 'portrait' ? 'rot90' : 'default',
      }
    })
    const targetPlatform = executionTargetPlatform
    const wasteSlot = targetPlatform === 'opentrons_ot2' ? '12' : targetPlatform === 'opentrons_flex' ? 'A3' : 'WASTE'
    const deckTipPlacements = robotDeckPlacements
      .filter((p) => p.labwareId)
      .map((p) => ({ placement: p, labware: state.labwares.get(p.labwareId as string) }))
      .filter((item): item is { placement: DeckPlacement; labware: Labware } => Boolean(item.labware && isTipRackType(item.labware.labwareType)))
    const tiprackMappings = deckTipPlacements.map(({ placement, labware }, idx) => {
      const tiprackId = `TIPRACK_${idx + 1}`
      const tracking = tipTracking.racks.find((r) => r.labwareId === labware.labwareId)
      return {
        tiprack_id: tiprackId,
        slot_id: placement.slotId,
        tip_type: tipTypeFromLabwareType(labware.labwareType),
        ...(tracking?.nextTipWell ? { starting_tip: tracking.nextTipWell } : {}),
        ...(tracking?.nextTipWell ? { next_tip_well: tracking.nextTipWell } : {}),
        ...(typeof tracking?.consumedCount === 'number' ? { consumed_count: tracking.consumedCount } : {}),
        ...(typeof tracking?.depleted === 'boolean' ? { depleted: tracking.depleted } : {}),
        _tracking: tracking,
      }
    })
    const ensureDefaultTiprack = tiprackMappings.length > 0
      ? tiprackMappings
      : [{
        tiprack_id: 'TIPRACK_1',
        slot_id: targetPlatform === 'opentrons_flex' ? 'B1' : '3',
        tip_type: 'opentrons_300',
        _tracking: undefined,
      }]
    const tipLifecycleActions = appliedEvents.flatMap((event, idx) => {
      if (event.event_type === 'add_material') return []
      const stepLabel = event.eventId || `event-${idx + 1}`
      const eventType = event.event_type || 'other'
      const defaultTiprackId = ensureDefaultTiprack[0]?.tiprack_id || 'TIPRACK_1'
      return [
        {
          action_id: `TIP-LIFECYCLE-${idx + 1}-PICK`,
          kind: 'note' as const,
          message: `${stepLabel}: pick up tips before ${eventType}.`,
          target_tiprack_id: defaultTiprackId,
        },
        {
          action_id: `TIP-LIFECYCLE-${idx + 1}-DO`,
          kind: 'note' as const,
          message: `${stepLabel}: execute ${eventType}.`,
          target_tiprack_id: defaultTiprackId,
        },
        {
          action_id: `TIP-LIFECYCLE-${idx + 1}-DROP`,
          kind: 'note' as const,
          message: `${stepLabel}: eject tips to waste after ${eventType}.`,
          target_tiprack_id: defaultTiprackId,
        },
      ]
    })
    const runtimeActions = ensureDefaultTiprack
      .filter((rack) => Boolean(rack._tracking?.depleted))
      .map((rack, idx) => ({
        action_id: `TIP-RELOAD-${idx + 1}`,
        kind: 'pause_for_tip_reload',
        message: `Reload tips for ${rack.tiprack_id} at slot ${rack.slot_id} and continue.`,
        target_tiprack_id: rack.tiprack_id,
      }))
    if (!tipTracking.valid && !manualPipettingMode) {
      runtimeActions.push({
        action_id: `TIP-RELOAD-${runtimeActions.length + 1}`,
        kind: 'pause_for_tip_reload',
        message: `Tip preflight indicates insufficient tips (required ${tipTracking.requiredTips}, available ${tipTracking.availableTips}). Reload or add tip racks before continuing.`,
        target_tiprack_id: ensureDefaultTiprack[0]?.tiprack_id || 'TIPRACK_1',
      })
    }
    if (!manualPipettingMode && runtimeActions.length === 0) {
      runtimeActions.push({
        action_id: 'TIP-RELOAD-DEFAULT',
        kind: 'pause_for_tip_reload',
        message: 'Pause for tip rack reload when prompted by operator/runtime.',
        target_tiprack_id: ensureDefaultTiprack[0]?.tiprack_id || 'TIPRACK_1',
      })
    }
    runtimeActions.push(...tipLifecycleActions)
    const serializedTipracks = ensureDefaultTiprack.map((rack) => {
      const { _tracking, ...rest } = rack
      return rest
    })
    return {
      kind: 'execution-plan',
      recordId: executionPlanRecordId,
      type: 'execution_plan',
      id: toExecutionPlanId(executionPlanId),
      version: '1.0.0',
      event_graph_ref: resolvedEventGraphId,
      execution_environment_ref: executionEnvironmentRef.trim(),
      placements: {
        labware: labwarePlacements,
        tipracks: serializedTipracks,
        waste: { slot_id: wasteSlot, labware_id: 'trash' },
      },
      tool_bindings: {
        primary_liquid_handler: {
          tool_id: selectedTool?.toolTypeId || 'generic_pipette',
          mount: 'left',
          default_tip_type: serializedTipracks[0]?.tip_type || 'opentrons_300',
        },
      },
      strategy: {
        tip_policy: 'new_tip_each_transfer',
        channelization: 'multi_channel_prefer',
        batching: 'group_by_source',
      },
      tip_management: {
        mode: manualPipettingMode ? 'manual' : 'robot',
        replacement_policy: 'full_rack_default',
        pause_on_depletion: !manualPipettingMode && runtimeActions.some((action) => action.kind === 'pause_for_tip_reload'),
        racks: serializedTipracks.map((rack) => ({
          tiprack_id: rack.tiprack_id,
          ...(typeof rack.next_tip_well === 'string' ? { next_tip_well: rack.next_tip_well } : {}),
          ...(typeof rack.consumed_count === 'number' ? { consumed_count: rack.consumed_count } : {}),
          ...(typeof rack.depleted === 'boolean' ? { depleted: rack.depleted } : {}),
        })),
        runtime_actions: runtimeActions,
      },
    }
  }, [appliedEvents, deckPlacements, executionEnvironmentRef, executionPlanId, executionPlanRecordId, executionTargetPlatform, getLabwareOrientation, manualPipettingMode, selectedTool?.toolTypeId, state.labwares, tipTracking.availableTips, tipTracking.racks, tipTracking.requiredTips, tipTracking.valid])

  const buildExecutionEnvironmentPayload = useCallback((): Record<string, unknown> => {
    const ref = executionEnvironmentRef.trim()
    const envId = toExecutionEnvironmentId(ref)
    const profile = getVariantManifest(platforms, deckPlatform, deckVariant)
    if (!profile) {
      throw new Error(`Deck variant "${deckVariant}" is not defined for platform "${deckPlatform}".`)
    }
    const robotFamily = executionTargetPlatform === 'integra_assist'
      ? 'integra_assist_plus'
      : executionTargetPlatform
    const runtimeTargets = executionTargetPlatform === 'integra_assist'
      ? ['pyalab', 'pylabrobot']
      : ['opentrons_api', 'pylabrobot']
    const slotTypeFromKind = (kind: 'standard' | 'trash' | 'module' | 'special') => {
      if (kind === 'trash') return 'trash'
      if (kind === 'module') return 'heater'
      if (kind === 'special') return 'special'
      return 'standard'
    }
    const deckSlots = profile.slots.map((slot) => ({
      slot_id: slot.id,
      slot_type: slotTypeFromKind(slot.kind),
      compatible_footprints: slot.kind === 'trash' ? ['trash'] : ['sbs', 'sbs_plate', 'reservoir', 'tube'],
      ...(slot.label ? { notes: slot.label } : {}),
    }))
    const labwares = Array.from(state.labwares.values())
    const robotDeckPlacements = deckPlacements.filter((p) => !p.slotId.startsWith('bench:') && p.labwareId)
    const placedLabwareIds = new Set(robotDeckPlacements.map((p) => p.labwareId as string))
    const tipTypesInUse = labwares
      .filter((lw) => isTipRackType(lw.labwareType) && placedLabwareIds.has(lw.labwareId))
      .map((lw) => tipTypeFromLabwareType(lw.labwareType))
    const uniqueTipTypesInUse = Array.from(new Set(tipTypesInUse))
    const primaryTool = selectedTool
      ? {
          tool_id: selectedTool.toolTypeId,
          tool_type: 'pipette',
          channels: selectedTool.toolType.channelCount || 1,
          mount: 'left',
          ...(selectedTool.toolType.volumeRange
            ? {
                volume_min_ul: selectedTool.toolType.volumeRange.min_uL,
                volume_max_ul: selectedTool.toolType.volumeRange.max_uL,
              }
            : {}),
          ...(uniqueTipTypesInUse.length > 0 ? { tip_types: uniqueTipTypesInUse } : {}),
        }
      : {
          tool_id: 'generic_pipette',
          tool_type: 'pipette',
          channels: 1,
          mount: 'left',
          ...(uniqueTipTypesInUse.length > 0 ? { tip_types: uniqueTipTypesInUse } : {}),
        }
    const registryDefs = labwares
      .filter((lw) => placedLabwareIds.has(lw.labwareId))
      .flatMap((lw) => {
      const definition = getLabwareDefinitionById(lw.definitionId) || getLabwareDefinitionByLegacyType(lw.labwareType)
      const platformKey = executionTargetPlatform === 'integra_assist'
        ? 'integra_assist_plus'
        : executionTargetPlatform
      const platformAlias = getDefinitionAliasForPlatform(definition, platformKey)
      const labwareIdForPlan = platformAlias || definition?.id || lw.definitionId || lw.labwareType || lw.labwareId
      const rows: Array<{
        labware_id: string
        footprint: string
        definition_ref: string
        vendor?: string
        version: string
      }> = []
      rows.push({
        labware_id: labwareIdForPlan,
        footprint: lw.layoutFamily || 'sbs',
        definition_ref: definition?.id || lw.definitionId || lw.labwareType,
        ...(definition?.vendor ? { vendor: definition.vendor } : {}),
        version: 'v1',
      })
      if (labwareIdForPlan !== lw.labwareId) {
        rows.push({
          labware_id: lw.labwareId,
          footprint: lw.layoutFamily || 'sbs',
          definition_ref: definition?.id || lw.definitionId || lw.labwareType,
          ...(definition?.vendor ? { vendor: definition.vendor } : {}),
          version: 'v1',
        })
      }
      return rows
    })
    const dedupedRegistryDefs = Array.from(new Map(registryDefs.map((row) => [row.labware_id, row])).values())
    const definitions = dedupedRegistryDefs.length > 0
      ? dedupedRegistryDefs
      : [{
          labware_id: 'generic_labware',
          footprint: 'sbs',
          definition_ref: 'generic/sbs_labware@v1',
          version: 'v1',
        }]
    return {
      kind: 'execution-environment',
      recordId: ref,
      type: 'execution_environment',
      id: envId,
      version: '1.0.0',
      robot: {
        family: robotFamily,
        model: profile.title,
        runtime_targets: runtimeTargets,
      },
      deck: {
        deck_id: profile.id,
        slots: deckSlots,
      },
      tools: [primaryTool],
      labware_registry: {
        definitions,
      },
    }
  }, [deckPlacements, deckPlatform, deckVariant, executionEnvironmentRef, executionTargetPlatform, platforms, selectedTool, state.labwares])

  const ensureExecutionEnvironmentSaved = useCallback(async (): Promise<string> => {
    const ref = executionEnvironmentRef.trim()
    if (!ref) throw new Error('Execution environment reference is required.')
    const payload = buildExecutionEnvironmentPayload()
    await apiClient.saveExecutionEnvironment(ref, payload)
    return ref
  }, [buildExecutionEnvironmentPayload, executionEnvironmentRef])

  const tipAndDeckPreflightIssues = useMemo(() => {
    const issues: Array<{ severity: 'error' | 'warning'; code: string; path: string; message: string }> = []
    for (const lw of state.labwares.values()) {
      if (lw.definitionSource === 'unmapped') {
        issues.push({
          severity: 'warning',
          code: 'LABWARE_DEFINITION_UNMAPPED',
          path: `event_graph.labwares.${lw.labwareId}`,
          message: `Labware ${lw.name} is not mapped to a canonical labware definition yet; using legacy geometry.`,
        })
      } else if (!lw.definitionId || lw.definitionSource === 'legacy_fallback') {
        issues.push({
          severity: 'warning',
          code: 'LABWARE_DEFINITION_FALLBACK',
          path: `event_graph.labwares.${lw.labwareId}`,
          message: `Labware ${lw.name} is using legacy fallback metadata.`,
        })
      }
      for (const warning of lw.definitionWarnings || []) {
        issues.push({
          severity: 'warning',
          code: 'LABWARE_DEFINITION_METADATA',
          path: `event_graph.labwares.${lw.labwareId}`,
          message: warning,
        })
      }
    }
    if (!tipTracking.valid) {
      for (const message of tipTracking.errors) {
        issues.push({ severity: 'error', code: 'TIP_PRECHECK', path: 'placements.tipracks', message })
      }
    }
    const isOpentrons = executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'
    const bySlot = new Map(deckPlacements.map((p) => [p.slotId, p]))
    const profile = getVariantManifest(platforms, deckPlatform, deckVariant)
    if (!profile) {
      issues.push({
        severity: 'error',
        code: 'DECK_VARIANT_UNKNOWN',
        path: 'deck.variant',
        message: `Deck variant "${deckVariant}" is not defined for platform "${deckPlatform}".`,
      })
      return issues
    }
    if (executionTargetPlatform === 'integra_assist') {
      const tipSlotId = 'A'
      const tipSlot = bySlot.get(tipSlotId)
      if (!tipSlot?.labwareId) {
        issues.push({
          severity: 'error',
          code: 'ASSIST_TIP_SLOT_REQUIRED',
          path: `deck.slot.${tipSlotId}`,
          message: 'Assist Plus requires a tip rack in leftmost slot A.',
        })
      } else {
        const lw = state.labwares.get(tipSlot.labwareId)
        if (lw && !isTipRackType(lw.labwareType)) {
          issues.push({
            severity: 'error',
            code: 'ASSIST_TIP_SLOT_TYPE',
            path: `deck.slot.${tipSlotId}`,
            message: 'Assist Plus slot A must contain a tip rack.',
          })
        }
      }
    }
    for (const slot of profile.slots) {
      const locked = getDeckSlotLockedOrientation(slot)
      if (!locked) continue
      const placement = bySlot.get(slot.id)
      if (!placement?.labwareId) continue
      const orientation = getLabwareOrientation(placement.labwareId)
      if (orientation !== locked) {
        issues.push({
          severity: 'error',
          code: 'SLOT_ORIENTATION_LOCKED',
          path: `deck.slot.${slot.id}`,
          message: `Slot ${slot.id} is locked to ${locked} orientation.`,
        })
      }
    }
    const isMultichannelPipette = Boolean(selectedTool?.toolTypeId.includes('pipette') && (selectedTool?.toolType.channelCount || 0) > 1)
    if (isMultichannelPipette) {
      const platformForCompatibility: CompatibilityTargetPlatform = manualPipettingMode ? 'manual' : executionTargetPlatform
      for (const placement of deckPlacements) {
        if (!placement.labwareId) continue
        const lw = state.labwares.get(placement.labwareId)
        if (!lw || lw.addressing.type !== 'linear') continue
        const orientation = getLabwareOrientation(lw.labwareId)
        const compatibility = resolvePipetteLabwareCompatibility({
          labware: lw,
          tool: selectedTool,
          spacingMm: aspirateSpacingMm,
          role: 'source',
          orientation,
          platform: platformForCompatibility,
        })
        if (compatibility.issues.some((issue) => issue.code === 'LINEAR_AXIS_MISMATCH')) {
          issues.push({
            severity: 'warning',
            code: 'LINEAR_AXIS_MISMATCH',
            path: `deck.slot.${placement.slotId}`,
            message: `${lw.name} orientation (${orientation}) is not aligned to multichannel axis; source clicks will use single-well mode.`,
          })
        }
      }
    }
    if (isOpentrons) {
      for (const placement of deckPlacements) {
        if (!placement.labwareId) continue
        const lw = state.labwares.get(placement.labwareId)
        if (!lw || !isTipRackType(lw.labwareType)) continue
        if (getLabwareOrientation(lw.labwareId) !== 'landscape') {
          issues.push({
            severity: 'warning',
            code: 'OPENTRONS_TIP_LANDSCAPE',
            path: `deck.slot.${placement.slotId}`,
            message: `Tip rack ${lw.name} orientation forced to landscape on Opentrons.`,
          })
        }
      }
    }
    const graphValidation = runEventGraphValidation(state.events, state.labwares, { errorsOnly: false })
    for (const item of graphValidation.errors) {
      if (item.severity !== 'warning') continue
      const path = item.eventId ? `event_graph.events.${item.eventId}` : 'event_graph'
      issues.push({
        severity: 'warning',
        code: item.code,
        path,
        message: item.message,
      })
    }
    return issues
  }, [deckPlacements, deckPlatform, deckVariant, executionTargetPlatform, getLabwareOrientation, manualPipettingMode, platforms, selectedTool, state.events, state.labwares, tipTracking.errors, tipTracking.valid, aspirateSpacingMm])

  const handleDownloadXmlFromDeck = useCallback(async () => {
    if (!planningEnabled) return
    setExecutionBusy(true)
    setExecutionNotice(null)
    try {
      if (!executionPlanRecordId.trim()) {
        throw new Error('Execution plan record ID is required.')
      }
      if (!executionPlanId.trim()) {
        throw new Error('Execution plan ID is required.')
      }
      if (!executionEnvironmentRef.trim()) {
        throw new Error('Execution environment reference is required.')
      }
      if (tipAndDeckPreflightIssues.some((issue) => issue.severity === 'error')) {
        setExecutionIssues(tipAndDeckPreflightIssues)
        throw new Error('Tip/deck preflight failed. Resolve errors before emit.')
      }
      const resolvedEventGraphId = await ensureEventGraphSaved()
      await ensureExecutionEnvironmentSaved()
      const payload = buildExecutionPlanPayload(resolvedEventGraphId)
      const effectiveAssistEmitter = assistEmitterOverride === 'default' ? assistEmitterDefault : assistEmitterOverride
      const emitterLabel = executionCompilerFamily === 'assist_plus'
        ? effectiveAssistEmitter
        : 'n/a'
      const artifactRole = artifactRoleForPlatform(platforms, executionTargetPlatform)
      if (!artifactRole) {
        throw new Error(`No artifact role available for platform ${executionTargetPlatform}.`)
      }
      const planFingerprint = stableStringify({
        targetPlatform: executionTargetPlatform,
        executionPlanRecordId: executionPlanRecordId.trim(),
        executionPlanId: executionPlanId.trim(),
        payload,
        emitter: emitterLabel,
      })
      await apiClient.saveExecutionPlan(executionPlanRecordId, payload)
      const validation = await apiClient.validateExecutionPlan(executionPlanRecordId)
      setExecutionIssues([...(validation.validation.issues || []), ...tipAndDeckPreflightIssues.filter((issue) => issue.severity === 'warning')])
      if (!validation.validation.valid) {
        throw new Error(`Execution plan has ${validation.validation.issues.length} issue(s). Fix validation errors before emit.`)
      }
      const lastEvent = state.events[state.events.length - 1]
      const lastXmlArtifact = parseXmlArtifactEventMetadata(lastEvent)
      const role = artifactRole
      const shouldReuseExistingArtifact =
        executionCompilerFamily === 'assist_plus'
        && Boolean(lastXmlArtifact)
        && lastXmlArtifact?.executionPlanRecordId === executionPlanRecordId.trim()
        && lastXmlArtifact?.executionPlanId === executionPlanId.trim()
        && lastXmlArtifact?.planFingerprint === planFingerprint
        && lastXmlArtifact?.role === role
      let robotPlanId: string
      if (shouldReuseExistingArtifact && lastXmlArtifact) {
        robotPlanId = lastXmlArtifact.robotPlanId
      } else {
        const result = await apiClient.emitExecutionPlan(
          executionPlanRecordId,
          executionTargetPlatform,
          executionCompilerFamily === 'assist_plus'
            ? { assistEmitter: effectiveAssistEmitter }
            : undefined
        )
        robotPlanId = result.robotPlanId
        if (executionCompilerFamily === 'assist_plus') {
          const generatedAt = new Date().toISOString()
          const xmlEvent: PlateEvent = {
            eventId: `evt-xml-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
            event_type: 'other',
            at: generatedAt,
            t_offset: 'PT0M',
            notes: `Generated Assist Plus XML artifact from execution plan ${executionPlanId.trim()} (${executionPlanRecordId.trim()}).`,
            details: {
              description: `Generated Assist Plus XML (robot plan ${robotPlanId}).`,
              notes: `Emitter: ${effectiveAssistEmitter}`,
              metadata: {
                kind: 'xml_artifact',
                robotPlanId,
                targetPlatform: 'integra_assist',
                executionPlanId: executionPlanId.trim(),
                executionPlanRecordId: executionPlanRecordId.trim(),
                planFingerprint,
                generatedAt,
                role,
              } as XmlArtifactEventMetadata,
            } as PlateEvent['details'],
          }
          addEvent(xmlEvent)
          await saveEventGraphSnapshot([...state.events, xmlEvent])
        }
      }
      const url = apiClient.getRobotPlanArtifactUrl(robotPlanId, role)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.target = '_blank'
      anchor.rel = 'noreferrer'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      if (shouldReuseExistingArtifact) {
        setExecutionNotice(`Downloaded existing artifact from robot plan ${robotPlanId}.`)
      } else {
        setExecutionNotice(`Generated and downloaded artifact from robot plan ${robotPlanId}.`)
      }
    } catch (err) {
      setExecutionNotice(err instanceof Error ? err.message : 'Failed to download XML')
    } finally {
      setExecutionBusy(false)
    }
  }, [
    planningEnabled,
    executionPlanRecordId,
    executionPlanId,
    executionEnvironmentRef,
    tipAndDeckPreflightIssues,
    ensureEventGraphSaved,
    ensureExecutionEnvironmentSaved,
    buildExecutionPlanPayload,
    addEvent,
    assistEmitterDefault,
    assistEmitterOverride,
    executionCompilerFamily,
    executionTargetPlatform,
    executionPlanId,
    platforms,
    state.events,
    saveEventGraphSnapshot,
  ])

  const latestXmlArtifact = useMemo(() => {
    for (let i = state.events.length - 1; i >= 0; i -= 1) {
      const parsed = parseXmlArtifactEventMetadata(state.events[i])
      if (parsed) return parsed
    }
    return null
  }, [state.events])

  const lastXmlLabel = useMemo(() => {
    if (!latestXmlArtifact) return undefined
    const stamp = new Date(latestXmlArtifact.generatedAt)
    const when = Number.isNaN(stamp.getTime())
      ? latestXmlArtifact.generatedAt
      : stamp.toLocaleString()
    return `Last XML: ${latestXmlArtifact.robotPlanId} at ${when}`
  }, [latestXmlArtifact])

  const lastXmlUrl = useMemo(() => {
    if (!latestXmlArtifact) return undefined
    return apiClient.getRobotPlanArtifactUrl(latestXmlArtifact.robotPlanId, latestXmlArtifact.role)
  }, [latestXmlArtifact])

  const handleSaveTemplate = useCallback(async () => {
    if (!templateName.trim()) {
      setExecutionNotice('Template name is required.')
      return
    }
    setTemplateSaving(true)
    setTemplateSaveError(null)
    setExecutionNotice(null)
    try {
      const snapshot = buildTemplateSnapshot({
        title: templateName.trim(),
        version: templateVersion.trim() || 'v1',
        notes: templateNotes.trim() || undefined,
        events: appliedEvents,
        labwares: state.labwares,
        playbackPosition,
        anchorLabwareId: templateAnchorLabwareId || undefined,
        eventGraphId,
      })
      const rememberedPlacements = deckPlacements.filter((p) => p.labwareId && snapshot.closure.labwareIds.includes(p.labwareId))
      const outputArtifacts = templateOutputDrafts
        .filter((draft) => draft.enabled && snapshot.closure.labwareIds.includes(draft.sourceLabwareId) && draft.label.trim())
        .map((draft) => ({
          outputId: `out-${draft.sourceLabwareId}`,
          label: draft.label.trim(),
          kind: 'plate-snapshot' as const,
          sourceLabwareId: draft.sourceLabwareId,
        }))
      await apiClient.createComponent({
        title: snapshot.title,
        description: snapshot.notes || 'Template saved from labware editor',
        tags: ['template', 'event_graph_template'],
        notes: `Version: ${snapshot.version}`,
        template: {
          source: {
            kind: snapshot.sourceEventGraphId ? 'event-graph-ref' : 'inline',
            ...(snapshot.sourceEventGraphId ? { eventGraphId: snapshot.sourceEventGraphId } : {}),
            eventIds: snapshot.closure.eventIds,
            labwareIds: snapshot.closure.labwareIds,
          },
          insertionHints: {
            version: snapshot.version,
            ...(snapshot.sourceEventGraphId ? { sourceEventGraphId: snapshot.sourceEventGraphId } : {}),
            playbackPosition: snapshot.playbackPosition,
            anchorLabwareId: snapshot.anchorLabwareId,
            ...(templateExperimentTypes.length > 0 ? { experimentTypes: templateExperimentTypes } : {}),
            ...(outputArtifacts.length > 0 ? { outputArtifacts } : {}),
            closure: snapshot.closure,
            events: snapshot.events,
            labwares: snapshot.labwares,
            deck: {
              platform: deckPlatform,
              variant: deckVariant,
              placements: rememberedPlacements,
            },
          },
        },
      })
      setTemplateModalOpen(false)
      setExecutionNotice(`Template "${snapshot.title}" saved.`)
    } catch (err) {
      const message = formatSaveError(err)
      setTemplateSaveError(message)
      setExecutionNotice(message)
    } finally {
      setTemplateSaving(false)
    }
  }, [
    appliedEvents,
    deckPlacements,
    deckPlatform,
    deckVariant,
    eventGraphId,
    playbackPosition,
    state.labwares,
    templateAnchorLabwareId,
    templateExperimentTypes,
    templateName,
    templateNotes,
    templateOutputDrafts,
    templateVersion,
  ])

  const handlePromoteTemplateOutput = useCallback(async (output: TemplateOutputArtifact) => {
    const labware = state.labwares.get(output.sourceLabwareId)
    if (!labware) {
      setExecutionNotice(`Output labware ${output.sourceLabwareId} is not loaded in the editor.`)
      return
    }
    if (!eventGraphId) {
      setExecutionNotice('Save the event graph before promoting a template output.')
      return
    }
    setExecutionBusy(true)
    setExecutionNotice(null)
    try {
      const contextIds: string[] = []
      const mappings: Array<{ well: string; contextId: string }> = []
      for (const well of Array.from(getLabwareWellSet(labware))) {
        const wellState = getWellState(computedLabwareStates, labware.labwareId, well)
        if (!wellState || wellState.materials.length === 0) continue
        const contextId = `CTX-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
        const contents = wellState.materials.map((material) => ({
          material_ref: {
            kind: 'record',
            id: material.materialSpecRef || material.aliquotRef || material.materialRef,
            type: material.materialSpecRef ? 'material-spec' : material.aliquotRef ? 'aliquot' : 'material',
            label: material.materialRef,
          },
          ...(material.volume_uL > 0 ? { volume: { value: Number(material.volume_uL.toFixed(3)), unit: 'uL' } } : {}),
          ...(material.concentration ? { concentration: material.concentration } : {}),
          ...(typeof material.count === 'number' ? { count: material.count } : {}),
        }))
        await apiClient.createRecord('computable-lab/context', {
          id: contextId,
          subject_ref: {
            kind: 'record',
            id: `${labware.labwareId}:${well}`,
            type: 'well',
            label: `${labware.name} ${well}`,
          },
          event_graph_ref: {
            kind: 'record',
            id: eventGraphId,
            type: 'event_graph',
            label: eventGraphId,
          },
          contents,
          total_volume: { value: Number(wellState.volume_uL.toFixed(3)), unit: 'uL' },
          notes: `Promoted from template output ${output.label}`,
          tags: ['template_output', `labware:${labware.labwareId}`],
        })
        contextIds.push(contextId)
        mappings.push({ well, contextId })
      }
      if (contextIds.length === 0) {
        throw new Error(`No populated wells found in ${labware.name}.`)
      }
      if (runId) {
        const promoted = await apiClient.promoteContext({
          sourceContextIds: contextIds,
          outputKind: 'plate-snapshot',
          title: output.label,
          sourceEventGraphRef: { kind: 'record', id: eventGraphId, type: 'event_graph', label: eventGraphId },
          labwareRef: { kind: 'record', id: labware.labwareId, type: 'labware', label: labware.name },
          wellMappings: mappings,
          tags: ['template_output', `template:${loadedTemplateSourceId || 'editor'}`],
        })
        if (!promoted.success || !promoted.outputRecordId) {
          throw new Error(promoted.error || 'Failed to promote template output')
        }
        const response = await promoteRunOutput(runId, output.outputId, {
          snapshotId: promoted.outputRecordId,
          sourceContextIds: contextIds,
          title: output.label,
          sourceEventGraphRef: { kind: 'record', id: eventGraphId, type: 'event_graph', label: eventGraphId },
          labwareRef: { kind: 'record', id: labware.labwareId, type: 'labware', label: labware.name },
          wellMappings: mappings,
          tags: ['template_output', `template:${loadedTemplateSourceId || 'editor'}`],
        })
        setExecutionNotice(`Promoted template output "${output.label}" to prepared plate ${response.snapshotId}.`)
        await refreshRunMethodSummary()
      } else {
        const response = await apiClient.promoteContext({
          sourceContextIds: contextIds,
          outputKind: 'plate-snapshot',
          title: output.label,
          sourceEventGraphRef: { kind: 'record', id: eventGraphId, type: 'event_graph', label: eventGraphId },
          labwareRef: { kind: 'record', id: labware.labwareId, type: 'labware', label: labware.name },
          wellMappings: mappings,
          tags: ['template_output', `template:${loadedTemplateSourceId || 'editor'}`],
        })
        if (!response.success || !response.outputRecordId) {
          throw new Error(response.error || 'Failed to promote template output')
        }
        setExecutionNotice(`Promoted template output "${output.label}" to plate snapshot ${response.outputRecordId}.`)
      }
    } catch (err) {
      setExecutionNotice(err instanceof Error ? err.message : 'Failed to promote template output')
    } finally {
      setExecutionBusy(false)
    }
  }, [computedLabwareStates, eventGraphId, loadedTemplateSourceId, refreshRunMethodSummary, runId, state.labwares])

  const handleCreateUpstreamRunNow = useCallback(async (resolution: Extract<TemplateInputResolution, { kind: 'upstream-run' }>) => {
    if (!runId) return
    setExecutionBusy(true)
    setExecutionNotice(null)
    try {
      const created = await createUpstreamRunForInput(runId, resolution.templateLabwareId, {
        title: `${resolution.slotLabel} Source Run`,
      })
      await refreshRunMethodSummary()
      setExecutionNotice(`Created upstream run ${created.runId} for ${resolution.slotLabel}.`)
    } catch (err) {
      setExecutionNotice(err instanceof Error ? err.message : 'Failed to create upstream run')
    } finally {
      setExecutionBusy(false)
    }
  }, [refreshRunMethodSummary, runId])

  const handleUseExistingPreparedPlate = useCallback(async (resolution: TemplateInputResolution) => {
    if (!runId) return
    const snapshotId = inputResolutionDrafts[resolution.templateLabwareId]
    if (!snapshotId) {
      setExecutionNotice(`Select a prepared plate for ${resolution.slotLabel}.`)
      return
    }
    setExecutionBusy(true)
    setExecutionNotice(null)
    try {
      await useExistingPlateForInput(runId, resolution.templateLabwareId, snapshotId)
      await refreshRunMethodSummary()
      setExecutionNotice(`Resolved ${resolution.slotLabel} using prepared plate ${snapshotId}.`)
    } catch (err) {
      setExecutionNotice(err instanceof Error ? err.message : 'Failed to resolve protocol input')
    } finally {
      setExecutionBusy(false)
    }
  }, [inputResolutionDrafts, refreshRunMethodSummary, runId])

  const handleConfirmEditorContext = useCallback(() => {
    applyEditorContextSelection(contextVocabChoice, contextPlatformChoice, { lock: true })
    onMethodNameChange?.(contextMethodName.trim())
    setContextModalOpen(false)
    setExecutionNotice(`Method context locked: ${contextVocabChoice} / ${platformLabel(platforms, contextPlatformChoice)}.`)
  }, [applyEditorContextSelection, contextMethodName, contextPlatformChoice, contextVocabChoice, onMethodNameChange, platforms])

  const editorBackHref = runId ? `/runs/${encodeURIComponent(runId)}` : undefined
  const biologyLabwareId = sourceLabware?.labwareId ?? targetLabware?.labwareId ?? null
  const readoutsMode = useReadoutsMode({
    sourceLabwareId: biologyLabwareId ?? undefined,
    events: state.events,
  })
  const biologyMode = useBiologyMode({
    sourceLabwareId: biologyLabwareId ?? undefined,
    targetLabwareId: targetLabware?.labwareId,
  })
  const biologySelectedWells = useMemo(() => {
    if (sourceLabware?.labwareId === biologyLabwareId) {
      return Array.from(sourceSelection?.selectedWells || [])
    }
    if (targetLabware?.labwareId === biologyLabwareId) {
      return Array.from(targetSelection?.selectedWells || [])
    }
    return []
  }, [biologyLabwareId, sourceLabware?.labwareId, sourceSelection?.selectedWells, targetLabware?.labwareId, targetSelection?.selectedWells])
  const biologySourceRef = useMemo(() => (
    biologyLabwareId
      ? { kind: 'record' as const, id: biologyLabwareId, type: 'labware', label: `Plate ${biologyLabwareId}` }
      : null
  ), [biologyLabwareId])
  const biologySourceWellContents = useMemo(() => new Map(
    biologyMode.leftOverlayEntries.map((entry) => [entry.wellId as WellId, { color: entry.color }]),
  ), [biologyMode.leftOverlayEntries])
  const biologyTargetWellContents = useMemo(() => new Map(
    biologyMode.rightOverlayEntries.map((entry) => [entry.wellId as WellId, { color: entry.color }]),
  ), [biologyMode.rightOverlayEntries])
  const resultsSelectedWells = useMemo(() => {
    const targetWells = Array.from(targetSelection?.selectedWells || [])
    if (targetWells.length > 0) return targetWells
    return Array.from(sourceSelection?.selectedWells || [])
  }, [sourceSelection?.selectedWells, targetSelection?.selectedWells])
  const resultsMode = useResultsMode({
    runId,
    eventGraphId,
    events: state.events,
    sourceLabwareId: sourceLabware?.labwareId,
    targetLabwareId: targetLabware?.labwareId,
    selectedWells: resultsSelectedWells,
    preferredReadEventId: readoutsMode.activeReadEventId,
    preferredContextId: readoutsMode.activeContext?.id || null,
  })
  const resultsHeaderSubtitle = resultsMode.activeMeasurement
    ? `Reviewing ${resultsMode.activeMeasurement.recordId} on the planned plate geometry. Filter by read event, context, metric, and channel without leaving the canvas.`
    : readoutsMode.activeContext
      ? `Results are scoped from ${readoutsMode.activeContext.name}. Validate parser output and publish reviewed measurements against the selected readout context.`
      : 'Bind raw result files to a planned read event, validate parser output, and publish reviewed measurements on the same plate geometry.'
  const readoutsHeaderSubtitle = readoutsMode.activeContext
    ? `Managing readouts for ${readoutsMode.activeContext.name}. Keep one biological plate meaning map while binding multiple instruments and channels to planned read events.`
    : 'Create and select readout contexts that describe how this biology will be measured across plate readers, qPCR, GC-MS, and other instruments.'
  const resultsSourceWellContents = resultsMode.sourceWellContents.size > 0
    ? resultsMode.sourceWellContents
    : biologySourceWellContents
  const resultsTargetWellContents = resultsMode.targetWellContents.size > 0
    ? resultsMode.targetWellContents
    : biologyTargetWellContents
  const biologyHeaderSubtitle = biologyMode.activeContext
    ? 'Assign biological meaning directly onto wells. Roles, groups, and expected behavior are now managed independently of readout setup.'
    : biologyMode.creatingContext
      ? 'Preparing the biology layer for this plate.'
      : 'Assign biological meaning directly onto wells. Roles, groups, and expected behavior are now managed independently of readout setup.'

  const sourceTooltipMeta = useMemo(() => {
    const entries = new Map<WellId, { biology?: string[]; readouts?: string[]; results?: string[] }>()
    const sourceId = sourceLabware?.labwareId
    if (!sourceId) return entries

    for (const [subjectId, summaries] of Object.entries(biologyMode.assignmentsByWell)) {
      const [labwareId, wellId] = subjectId.split('#')
      if (labwareId !== sourceId || !wellId) continue
      entries.set(wellId as WellId, {
        ...(entries.get(wellId as WellId) || {}),
        biology: summaries.map((summary) => {
          if (summary.biologicalIntent) return `${summary.label} · ${summary.biologicalIntent}`
          if (summary.expectedBehavior) return `${summary.label} · ${summary.expectedBehavior}`
          return summary.label
        }),
      })
    }

    const readoutSummaries = readoutsMode.contexts
      .filter((context) => context.source_ref?.id === sourceId)
      .map((context) => `${context.name}: ${context.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}`)
    if (readoutSummaries.length > 0) {
      for (const wellId of getLabwareWellIds(sourceLabware)) {
        entries.set(wellId, {
          ...(entries.get(wellId) || {}),
          readouts: readoutSummaries,
        })
      }
    }

    const resultLines = new Map<string, string[]>()
    for (const row of resultsMode.activeRows) {
      const lines = resultLines.get(row.well) ?? []
      lines.push(`${row.metric}${row.channelId ? `/${row.channelId}` : ''}: ${row.value.toFixed(3)}${row.unit ? ` ${row.unit}` : ''}`)
      resultLines.set(row.well, lines)
    }
    const resultLabwareId = resultsMode.activeMeasurement?.payload.labwareInstanceRef?.id || resultsMode.activeContext?.payload.source_ref?.id
    if (resultLabwareId === sourceId) {
      for (const [wellId, lines] of resultLines.entries()) {
        entries.set(wellId as WellId, {
          ...(entries.get(wellId as WellId) || {}),
          results: lines,
        })
      }
    }

    return entries
  }, [
    biologyMode.assignmentsByWell,
    readoutsMode.contexts,
    resultsMode.activeContext?.payload.source_ref?.id,
    resultsMode.activeMeasurement?.payload.labwareInstanceRef?.id,
    resultsMode.activeRows,
    sourceLabware,
  ])

  const targetTooltipMeta = useMemo(() => {
    const entries = new Map<WellId, { biology?: string[]; readouts?: string[]; results?: string[] }>()
    const targetId = targetLabware?.labwareId
    if (!targetId) return entries

    for (const [subjectId, summaries] of Object.entries(biologyMode.assignmentsByWell)) {
      const [labwareId, wellId] = subjectId.split('#')
      if (labwareId !== targetId || !wellId) continue
      entries.set(wellId as WellId, {
        ...(entries.get(wellId as WellId) || {}),
        biology: summaries.map((summary) => {
          if (summary.biologicalIntent) return `${summary.label} · ${summary.biologicalIntent}`
          if (summary.expectedBehavior) return `${summary.label} · ${summary.expectedBehavior}`
          return summary.label
        }),
      })
    }

    const readoutSummaries = readoutsMode.contexts
      .filter((context) => context.source_ref?.id === targetId)
      .map((context) => `${context.name}: ${context.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}`)
    if (readoutSummaries.length > 0) {
      for (const wellId of getLabwareWellIds(targetLabware)) {
        entries.set(wellId, {
          ...(entries.get(wellId) || {}),
          readouts: readoutSummaries,
        })
      }
    }

    const resultLines = new Map<string, string[]>()
    for (const row of resultsMode.activeRows) {
      const lines = resultLines.get(row.well) ?? []
      lines.push(`${row.metric}${row.channelId ? `/${row.channelId}` : ''}: ${row.value.toFixed(3)}${row.unit ? ` ${row.unit}` : ''}`)
      resultLines.set(row.well, lines)
    }
    const resultLabwareId = resultsMode.activeMeasurement?.payload.labwareInstanceRef?.id || resultsMode.activeContext?.payload.source_ref?.id
    if (resultLabwareId === targetId) {
      for (const [wellId, lines] of resultLines.entries()) {
        entries.set(wellId as WellId, {
          ...(entries.get(wellId as WellId) || {}),
          results: lines,
        })
      }
    }

    return entries
  }, [
    biologyMode.assignmentsByWell,
    readoutsMode.contexts,
    resultsMode.activeContext?.payload.source_ref?.id,
    resultsMode.activeMeasurement?.payload.labwareInstanceRef?.id,
    resultsMode.activeRows,
    targetLabware,
  ])
  const saveBiologyGroup = useCallback(async (name: string, wells: string[]) => {
    if (!biologySourceRef) throw new Error('Select a labware before saving a biology group')
    await apiClient.createWellGroup({
      name,
      sourceRef: biologySourceRef,
      wellIds: wells,
    })
    await biologyMode.refresh()
  }, [biologyMode, biologySourceRef])
  const handleBiologyAssignmentCreated = useCallback(() => {
    void biologyMode.refresh()
  }, [biologyMode])
  const handleReadoutContextCreated = useCallback((contextId: string) => {
    readoutsMode.setActiveContextId(contextId)
    void readoutsMode.refresh()
    void biologyMode.refresh()
    void resultsMode.refresh()
  }, [biologyMode, readoutsMode, resultsMode.refresh])
  useEffect(() => {
    if (editorMode !== 'results') return
    void resultsMode.refresh()
  }, [editorMode, resultsMode.refresh])
  const openBiologyDrawerTab = useCallback((tabId: string) => {
    onDrawerOpenChange(true)
    onDrawerTabChange(tabId)
  }, [onDrawerOpenChange, onDrawerTabChange])
  const biologyLabware = sourceLabware?.labwareId === biologyLabwareId
    ? sourceLabware
    : targetLabware?.labwareId === biologyLabwareId
      ? targetLabware
      : null
  const biologyAssignedWellCount = useMemo(() => {
    if (!biologyLabwareId) return 0
    const wellIds = new Set<string>()
    for (const subjectId of Object.keys(biologyMode.assignmentsByWell)) {
      const [labwareId, wellId] = subjectId.split('#')
      if (labwareId === biologyLabwareId && wellId) {
        wellIds.add(wellId)
      }
    }
    return wellIds.size
  }, [biologyLabwareId, biologyMode.assignmentsByWell])
  const biologyTotalWellCount = biologyLabware ? getLabwareWellIds(biologyLabware).length : 0
  const modeDrawerTabs: EditorBottomDrawerTab[] = editorMode === 'biology'
    ? [
        {
          id: 'assign',
          label: 'Assign',
          content: (
            biologyLabwareId ? (
              <RoleAssignmentPanel
                labwareId={biologyLabwareId}
                selectedWells={biologySelectedWells}
                activeContext={biologyMode.activeContext}
                assignments={biologyMode.allAssignments}
                wellGroups={biologyMode.wellGroups}
                onSaveGroup={saveBiologyGroup}
                onAssignmentCreated={handleBiologyAssignmentCreated}
                title="Biological Roles"
                description="Assign biological roles like positive controls, vehicle controls, treatment groups, and standards directly onto the selected wells."
                emptyMessage={biologyMode.creatingContext ? 'Preparing the biology layer for this plate…' : 'Select a labware to begin assigning biological roles.'}
                hideContextSummary
              />
            ) : (
              <div>
                <h3>Assign Biology</h3>
                <p>Select a labware to stage biological meaning on the same plate geometry.</p>
              </div>
            )
          ),
        },
        {
          id: 'missing',
          label: 'Missing Biology',
          content: (
            <div>
              <h3>Missing Biology</h3>
              {biologyMode.error ? <p>{biologyMode.error}</p> : null}
              <p>{biologyMode.wellGroups.length} saved groups · {biologyMode.totalAssignmentCount} biological assignments across this plate.</p>
              <p>
                {biologyTotalWellCount > 0
                  ? `${biologyAssignedWellCount} of ${biologyTotalWellCount} wells on the active plate have at least one biological assignment. ${Math.max(0, biologyTotalWellCount - biologyAssignedWellCount)} remain unlabeled.`
                  : 'Select a plate to review missing biological assignments.'}
              </p>
              <p>Use this checklist to find unlabeled wells before moving on to readouts or results.</p>
              <div className="results-mode-actions">
                <button type="button" className="mode-drawer-button mode-drawer-button--primary" onClick={() => openBiologyDrawerTab('assign')}>
                  Open Biology Assignment Form
                </button>
                <button type="button" className="mode-drawer-button" onClick={() => void biologyMode.refresh()}>
                  Refresh Biology State
                </button>
              </div>
            </div>
          ),
        },
      ]
      : editorMode === 'readouts'
        ? [
            {
              id: 'contexts',
              label: 'Contexts',
              content: (
                biologySourceRef ? (
                  <ReadoutContextPanel
                    sourceRef={biologySourceRef}
                    selectedWellCount={biologySelectedWells.length}
                    selectedWells={biologySelectedWells}
                    readEvents={readoutsMode.readEvents.map((event) => ({ eventId: event.eventId, label: event.label }))}
                    activeReadEventId={readoutsMode.activeReadEventId}
                    activeReadEventLabel={readoutsMode.activeReadEvent?.label || null}
                    suggestedInstrumentType={readoutsMode.suggestedInstrumentType}
                    onReadEventChange={readoutsMode.setActiveReadEventId}
                    qcOptions={readoutsMode.qcOptions.filter((option) => option.instrumentTypes.includes(readoutsMode.suggestedInstrumentType))}
                    onSelectedQcControlsChange={readoutsMode.setSelectedQcControlIds}
                    contexts={readoutsMode.contexts}
                    activeContextId={readoutsMode.activeContextId}
                    activeContext={readoutsMode.activeContext}
                    activeContextMetadata={readoutsMode.activeContextMetadata}
                    assignmentCounts={biologyMode.assignmentCounts}
                    onSelectContext={readoutsMode.setActiveContextId}
                    onContextCreated={handleReadoutContextCreated}
                    onRefresh={readoutsMode.refresh}
                  />
                ) : (
                  <div>
                    <h3>Readout Contexts</h3>
                    <p>Select a labware to create or review readout contexts for this run.</p>
                  </div>
                )
              ),
            },
            {
              id: 'expectations',
              label: 'Expectations',
              content: (
                <div>
                  <h3>Readout Expectations</h3>
                  {readoutsMode.activeContext ? (
                    <>
                      <p>
                        Active context: <strong>{readoutsMode.activeContext.name}</strong>
                        {' · '}
                        {readoutsMode.activeContext.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}
                      </p>
                      <p>Use Biology mode to define the underlying biological controls. Use Readouts mode to bind that biology to a planned read event, selected channels, and assay-specific QC controls.</p>
                    </>
                  ) : (
                    <p>Select a readout context to review expected signal behavior and assay-specific QC expectations.</p>
                  )}
                </div>
              ),
            },
            {
              id: 'coverage',
              label: 'Coverage',
              content: (
                <div>
                  <h3>Readout Coverage</h3>
                  {readoutsMode.error ? <p>{readoutsMode.error}</p> : null}
                  <p>{readoutsMode.contexts.length} readout contexts available for the current plate and active read-event scope.</p>
                  <p>{biologyMode.totalAssignmentCount} biological role links are currently available to reuse across readout contexts for this plate.</p>
                </div>
              ),
            },
          ]
      : editorMode === 'results'
      ? [
          {
            id: 'queue',
            label: 'Attach',
            content: (
              <div className="results-mode-drawer">
                <div className="results-mode-preview">
                  <h3>Attach Results To A Readout</h3>
                  <p>
                    {resultsMode.measurementContexts.length > 0
                      ? 'Choose the readout you defined in Readouts, then upload the corresponding instrument export.'
                      : 'Create a readout in Readouts mode first so this result file has a clear assay and channel context.'}
                  </p>
                  {resultsMode.activeContextLabel ? (
                    <p>
                      Active readout: <strong>{resultsMode.activeContextLabel}</strong>
                    </p>
                  ) : null}
                  {resultsMode.measurementContexts.length === 0 ? (
                    <div className="results-mode-actions">
                      <button
                        type="button"
                        className="mode-drawer-button"
                        onClick={() => onEditorModeChange('readouts')}
                      >
                        Go To Readouts
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="results-mode-drawer__grid">
                  <label className="results-mode-field">
                    <span>Readout</span>
                    <select
                      value={resultsMode.activeContextId ?? ''}
                      onChange={(e) => resultsMode.setActiveContextId(e.target.value || null)}
                    >
                      <option value="">
                        {resultsMode.measurementContexts.length > 0 ? 'Select a readout' : 'No readouts defined yet'}
                      </option>
                      {resultsMode.measurementContexts.map((context) => (
                        <option key={context.recordId} value={context.recordId}>
                          {context.payload.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="results-mode-field">
                    <span>Planned Read Event</span>
                    <select
                      value={resultsMode.activeReadEventId ?? ''}
                      onChange={(e) => resultsMode.setActiveReadEventId(e.target.value || null)}
                    >
                      <option value="">
                        {resultsMode.readEvents.length > 0 ? 'Select a planned read event' : 'No planned read events'}
                      </option>
                      {resultsMode.readEvents.map((readEvent) => (
                        <option key={readEvent.eventId} value={readEvent.eventId}>
                          {readEvent.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="results-mode-field">
                    <span>Timepoint</span>
                    <input
                      value={resultsMode.timepoint}
                      onChange={(e) => resultsMode.setTimepoint(e.target.value)}
                      placeholder="e.g. 24 h"
                    />
                  </label>
                  <label className="results-mode-field">
                    <span>Parser</span>
                    <select
                      value={resultsMode.parserId}
                      onChange={(e) => resultsMode.setParserId(e.target.value)}
                    >
                      {resultsMode.parserOptions.map((parser) => (
                        <option key={parser.value} value={parser.value}>
                          {parser.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="results-mode-field results-mode-field--wide">
                    <span>Raw Data File</span>
                    <input
                      type="file"
                      accept=".csv,.tsv,.txt,.json,.xml"
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        void resultsMode.uploadFile(file)
                        e.target.value = ''
                      }}
                    />
                    <span className="results-mode-field__hint">
                      Upload text-based instrument exports directly into the repo-backed inbox, or paste a repo path below.
                    </span>
                    {resultsMode.uploadedFileName ? (
                      <span className="results-mode-field__hint">
                        Uploaded: <strong>{resultsMode.uploadedFileName}</strong>
                      </span>
                    ) : null}
                  </label>
                  <label className="results-mode-field results-mode-field--wide">
                    <span>Raw Data Path</span>
                    <input
                      value={resultsMode.rawDataPath}
                      onChange={(e) => resultsMode.setRawDataPath(e.target.value)}
                      placeholder="data/instruments/run-17/readout.csv"
                    />
                  </label>
                </div>
                <div className="results-mode-actions">
                  {resultsMode.uploading ? (
                    <span className="results-mode-field__hint">Uploading file…</span>
                  ) : null}
                  <button type="button" className="mode-drawer-button" onClick={() => void resultsMode.validate()} disabled={resultsMode.validating || resultsMode.ingesting}>
                    {resultsMode.validating ? 'Validating…' : 'Validate Parser'}
                  </button>
                  <button type="button" className="mode-drawer-button mode-drawer-button--primary" onClick={() => void resultsMode.ingest()} disabled={resultsMode.ingesting || resultsMode.validating}>
                    {resultsMode.ingesting ? 'Publishing…' : 'Publish Measurement'}
                  </button>
                  <button type="button" className="mode-drawer-button" onClick={() => void resultsMode.refresh()} disabled={resultsMode.loading}>
                    Refresh Results
                  </button>
                </div>
                <div className="results-mode-summary">
                  <strong>Run-linked review</strong>
                  <p>{resultsMode.measurementSummary}</p>
                  <p>{resultsMode.readEvents.length} planned reads · {resultsMode.measurementContexts.length} readouts · {resultsMode.measurements.length} published measurements in scope.</p>
                </div>
              </div>
            ),
          },
          {
            id: 'inspector',
            label: 'Inspector',
            content: (
              <div className="results-mode-drawer">
                <div className="results-mode-drawer__grid">
                  <label className="results-mode-field">
                    <span>Measurement</span>
                    <select
                      value={resultsMode.activeMeasurementId ?? ''}
                      onChange={(e) => resultsMode.setActiveMeasurementId(e.target.value || null)}
                    >
                      <option value="">Select measurement</option>
                      {resultsMode.measurements.map((measurement) => (
                        <option key={measurement.recordId} value={measurement.recordId}>
                          {measurement.recordId} · {measurement.payload.parserInfo?.parserId || 'unknown parser'}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="results-mode-field">
                    <span>Metric</span>
                    <select
                      value={resultsMode.activeMetric ?? ''}
                      onChange={(e) => resultsMode.setActiveMetric(e.target.value || null)}
                    >
                      <option value="">All metrics</option>
                      {resultsMode.availableMetrics.map((metric) => (
                        <option key={metric} value={metric}>
                          {metric}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="results-mode-field">
                    <span>Channel</span>
                    <select
                      value={resultsMode.activeChannelId ?? ''}
                      onChange={(e) => resultsMode.setActiveChannelId(e.target.value || null)}
                    >
                      <option value="">All channels</option>
                      {resultsMode.availableChannels.map((channelId) => (
                        <option key={channelId} value={channelId}>
                          {channelId}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="results-mode-preview">
                  <h3>Selected Wells</h3>
                  {resultsMode.selectedWellDetails.length === 0 ? (
                    <p>Select wells on the plate to inspect published or validated result rows.</p>
                  ) : (
                    <div className="results-mode-table">
                      <div className="results-mode-table__header">
                        <span>Well</span>
                        <span>Metric</span>
                        <span>Channel</span>
                        <span>Value</span>
                      </div>
                      {resultsMode.selectedWellDetails.slice(0, 16).map((row, index) => (
                        <div key={`${row.well}-${row.metric}-${row.channelId || 'none'}-${index}`} className="results-mode-table__row">
                          <span>{row.well}</span>
                          <span>{row.metric}</span>
                          <span>{row.channelId || 'default'}</span>
                          <span>{row.value}{row.unit ? ` ${row.unit}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {resultsMode.previewRows.length > 0 && (
                  <div className="results-mode-preview">
                    <h3>Parser Preview</h3>
                    <div className="results-mode-table">
                      <div className="results-mode-table__header">
                        <span>Well</span>
                        <span>Metric</span>
                        <span>Channel</span>
                        <span>Value</span>
                      </div>
                      {resultsMode.previewRows.map((row, index) => (
                        <div key={`${row.well}-${row.metric}-${row.channelId || 'none'}-${index}`} className="results-mode-table__row">
                          <span>{row.well}</span>
                          <span>{row.metric}</span>
                          <span>{row.channelId || 'default'}</span>
                          <span>{row.value}{row.unit ? ` ${row.unit}` : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ),
          },
          {
            id: 'diagnostics',
            label: 'Review',
            content: (
              <div className="results-mode-drawer">
                <h3>Results Diagnostics</h3>
                {resultsMode.error ? <p>{resultsMode.error}</p> : null}
                {resultsMode.activeContext ? (
                  <div className="results-mode-preview">
                    <h3>Readout Context</h3>
                    <p>
                      <strong>{resultsMode.activeContext.payload.name}</strong>
                      {' · '}
                      {resultsMode.activeContext.payload.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}
                    </p>
                    {resultsMode.readoutExpectationNotes ? <p>Expectations: {resultsMode.readoutExpectationNotes}</p> : null}
                    {resultsMode.readoutQcNotes ? <p>QC notes: {resultsMode.readoutQcNotes}</p> : null}
                  </div>
                ) : null}
                <div className="results-mode-preview">
                  <h3>QC Findings</h3>
                  {resultsMode.qcFindings.length === 0 ? (
                    <p>No explicit QC findings yet. Select a readout context with QC controls or inspect a different metric/channel.</p>
                  ) : (
                    <div className="results-mode-list">
                      {resultsMode.qcFindings.map((finding) => (
                        <div key={finding.id} className={`results-mode-list__item results-mode-list__item--${finding.status}`}>
                          <strong>{finding.title}</strong>
                          <span>{finding.status.toUpperCase()}</span>
                          <p>{finding.details}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="results-mode-preview">
                  <h3>Expectation Checks</h3>
                  {resultsMode.expectationChecks.length === 0 ? (
                    <p>No assignment-level expectation checks are defined for this readout context yet.</p>
                  ) : (
                    <div className="results-mode-list">
                      {resultsMode.expectationChecks.map((check) => (
                        <div key={check.id} className={`results-mode-list__item results-mode-list__item--${check.status}`}>
                          <strong>{check.label}</strong>
                          <span>{check.expectedBehavior.replace(/_/g, ' ')}</span>
                          <p>{check.details}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <p>
                  {resultsMode.readEvents.length === 0
                    ? 'No planned read events are defined on this method yet.'
                    : `${resultsMode.readEvents.length} read events available for binding.`}
                </p>
                <p>
                  {resultsMode.measurementContexts.length === 0
                    ? 'No measurement contexts are attached to the visible labwares yet.'
                    : `${resultsMode.measurementContexts.length} measurement contexts are available for result publication.`}
                </p>
                <p>
                  {resultsMode.preview
                    ? `Validated ${resultsMode.preview.rows} rows across ${resultsMode.preview.shape?.wells ?? 'unknown'} wells using ${resultsMode.preview.parserId}.`
                    : 'Validate parser output before publish to review plate coverage and metric alignment.'}
                </p>
              </div>
            ),
          },
          {
            id: 'evidence',
            label: 'Evidence',
            content: (
              <div className="results-mode-drawer">
                <h3>Draft Evidence</h3>
                <p>Generate a first-pass claim, assertion, and evidence bundle from the selected measurement, readout context, QC findings, and expectation checks.</p>
                <div className="results-mode-actions">
                  <button
                    type="button"
                    className="mode-drawer-button mode-drawer-button--primary"
                    onClick={() => void resultsMode.draftEvidence()}
                    disabled={resultsMode.draftingEvidence || !resultsMode.activeMeasurement || !resultsMode.activeContext}
                  >
                    {resultsMode.draftingEvidence ? 'Drafting…' : 'Draft Evidence'}
                  </button>
                </div>
                {resultsMode.draftEvidenceMessage ? (
                  <div className="results-mode-preview">
                    <p>{resultsMode.draftEvidenceMessage}</p>
                  </div>
                ) : null}
                <div className="results-mode-preview">
                  <h3>Draft Summary</h3>
                  <p>
                    {resultsMode.activeMeasurement
                      ? `${resultsMode.activeMeasurement.recordId} · ${resultsMode.qcFindings.length} QC findings · ${resultsMode.expectationChecks.length} expectation checks`
                      : 'Select a published measurement to stage an evidence draft.'}
                  </p>
                </div>
              </div>
            ),
          },
      ]
      : []

  const planDeck = (
    <>
      <DeckVisualizationPanel
        platform={deckPlatform}
        variant={deckVariant}
        platforms={platforms}
        labwares={Array.from(state.labwares.values())}
        placements={deckPlacements}
        selectedTool={selectedTool}
        onToolChange={setSelectedTool}
        allowedToolTypeIds={allowedToolTypeIds}
        allowedPlatformIds={allowedPlatforms.map((platform) => platform.id)}
        assistPipetteModels={deckPlatform === 'integra_assist' ? ASSIST_PIPETTE_MODELS : undefined}
        onAddLabware={(labwareType: LabwareType, name?: string) => addLabware(labwareType, name)}
        onRemoveLabware={removeLabware}
        getLabwareOrientation={getLabwareOrientation}
        setLabwareOrientation={setLabwareOrientation}
        onPlatformChange={(platform) => {
          if (runMethodLockedPlatform && platform !== runMethodLockedPlatform) {
            setExecutionNotice(`This run-attached method is locked to ${runMethodLockedPlatform}.`)
            return
          }
          setDeckPlatform(platform)
          setContextPlatformChoice(platform)
          if (isRobotExecutionPlatform(platform)) {
            setExecutionTargetPlatform(platform)
            setManualPipettingMode(false)
          } else {
            setManualPipettingMode(true)
          }
        }}
        onVariantChange={(variant) => {
          if (runMethodLockedDeckVariant && variant !== runMethodLockedDeckVariant) {
            setExecutionNotice(`This run-attached method deck is locked to ${runMethodLockedDeckVariant}.`)
            return
          }
          setDeckVariant(variant)
        }}
        onChangePlacement={handleChangeDeckPlacement}
        onSetSourceLabware={setSourceLabware}
        onSetTargetLabware={setTargetLabware}
        currentSourceLabwareId={sourceLabware?.labwareId || null}
        currentTargetLabwareId={targetLabware?.labwareId || null}
        onDownloadXml={planningEnabled ? handleDownloadXmlFromDeck : undefined}
        downloadXmlDisabled={executionBusy || executionCompilerFamily !== 'assist_plus'}
        downloadXmlBusy={executionBusy}
        lastXmlLabel={lastXmlLabel}
        lastXmlUrl={lastXmlUrl}
        hidePlatformSelector={Boolean(runMethodLockedPlatform)}
        hideDeckVariantSelector={Boolean(runMethodLockedDeckVariant)}
      />
      {runMethodLockedPlatform && (
        <div className="deck-execution-notice">
          Method locked to <strong>{runMethodLockedPlatform}</strong>
          {runMethodLockedDeckVariant ? <> / <strong>{runMethodLockedDeckVariant}</strong></> : null}
          {runMethodLockedVocabId ? <> / <strong>{runMethodLockedVocabId}</strong></> : null}
          {runMethodSourceTemplateId ? <> (template: {runMethodSourceTemplateId})</> : null}.
        </div>
      )}
      {planningEnabled && executionNotice && (
        <div className="deck-execution-notice">{executionNotice}</div>
      )}
      {loadedTemplateOutputs.length > 0 && (
        <div className="template-output-bar">
          <span className="template-output-bar__label">Declared Outputs</span>
          {loadedTemplateOutputs.map((output) => (
            <button
              key={output.outputId}
              className="template-output-bar__button"
              onClick={() => void handlePromoteTemplateOutput(output)}
              disabled={executionBusy}
              title={`Promote ${output.label} to a plate snapshot`}
            >
              Promote {output.label}
            </button>
          ))}
        </div>
      )}
      {isMultichannelSession && (
        <div className="deck-tool-session">
          <div className="toolbar-session">
            <button className={`session-btn ${toolSession.phase === 'aspirate' || toolSession.phase === 'aspirate_selected' ? 'active' : ''}`} onClick={beginAspiratePhase}>1) Aspirate</button>
            {isAdjustableSpacingTool ? (
              <label>
                Asp mm
                <select value={toolSession.aspirateSpacingText} onChange={(e) => setToolSession((p) => ({ ...p, aspirateSpacingText: e.target.value }))}>
                  {SPACING_PRESETS.map((preset) => (
                    <option key={`asp-${preset.value}`} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="toolbar-session-fixed">Asp 9 mm (fixed)</span>
            )}
            <button className={`session-btn ${toolSession.phase === 'dispense' ? 'active' : ''}`} onClick={beginDispensePhase}>2) Dispense</button>
            {isAdjustableSpacingTool ? (
              <label>
                Disp mm
                <select value={toolSession.dispenseSpacingText} onChange={(e) => setToolSession((p) => ({ ...p, dispenseSpacingText: e.target.value }))}>
                  {SPACING_PRESETS.map((preset) => (
                    <option key={`disp-${preset.value}`} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="toolbar-session-fixed">Disp 9 mm (fixed)</span>
            )}
            <label>
              Channels
              <input value={toolSession.activeChannelIndicesText} onChange={(e) => setToolSession((p) => ({ ...p, activeChannelIndicesText: e.target.value }))} />
            </label>
            <button className="session-btn" onClick={resetToolSession}>Reset</button>
            <button className="session-btn" onClick={cancelToolSession}>Cancel</button>
            <button className="session-btn commit" onClick={commitToolSessionTransfer} disabled={!canCommitToolSession}>3) Commit</button>
            {toolSessionSummary && (
              <div className="toolbar-session-summary" data-testid="tool-session-summary">
                <span className="toolbar-session-summary__phase">{toolSessionSummary.phaseLabel}</span>
                <span>{toolSessionSummary.sourceText}</span>
                <span>{toolSessionSummary.targetText}</span>
                <span>{toolSessionSummary.channelsText}</span>
                <span>Asp {toolSessionSummary.aspirateText}</span>
                <span>Disp {toolSessionSummary.dispenseText}</span>
              </div>
            )}
            {toolSessionMessage && (
              <div className={`toolbar-session-status toolbar-session-status--${toolSessionMessage.tone}`}>
                {toolSessionMessage.text}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )

  const sourceOverlay = editorMode === 'biology'
    ? (
          <LabwareOverlayHost
            title="Biology Layer"
          subtitle={`${biologyMode.totalAssignmentCount} biological role assignments on this plate. Use the left pane as the reference surface for controls, treatment groups, and biological role assignment.`}
          accent="amber"
        />
      )
    : editorMode === 'readouts'
      ? (
          <LabwareOverlayHost
            title="Biology Reference"
            subtitle={readoutsMode.activeContext
              ? `Reference biology for ${readoutsMode.activeContext.name}`
              : 'The left pane remains the biological reference map while you define instrument and channel mappings.'}
            accent="amber"
          />
        )
    : editorMode === 'results'
      ? (
          <LabwareOverlayHost
            title="Expected Plate"
            subtitle={resultsMode.activeReadEventId
              ? `Expected context for ${resultsMode.readEvents.find((event) => event.eventId === resultsMode.activeReadEventId)?.label || resultsMode.activeReadEventId}`
              : 'The left pane remains the planned or expected plate state for readout review.'}
            accent="blue"
          />
        )
      : null

  const targetOverlay = editorMode === 'biology'
    ? (
          <LabwareOverlayHost
            title="Biological Target"
          subtitle="The right pane mirrors biological meaning on the same plate geometry so roles and groups stay visible while you edit."
          accent="amber"
        />
      )
    : editorMode === 'readouts'
      ? (
          <LabwareOverlayHost
            title="Readout Mapping"
            subtitle={readoutsMode.activeContext
              ? `Define assay context for ${readoutsMode.activeContext.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}`
              : 'The right pane is reserved for read-event, assay, and channel mapping overlays.'}
            accent="blue"
          />
        )
    : editorMode === 'results'
      ? (
          <LabwareOverlayHost
            title="Observed Results"
            subtitle={resultsMode.activeMeasurement
              ? `${resultsMode.activeMeasurement.recordId} · ${resultsMode.activeMeasurement.payload.parserInfo?.parserId || 'measurement'}`
              : resultsMode.preview
                ? `${resultsMode.preview.rows} validated rows ready for publish`
                : 'The right pane is reserved for observed values, alignment review, and heatmap overlays.'}
            accent="violet"
          />
        )
      : null

  return (
    <div className="labware-event-editor-v2">
      <EditorModeShell
        header={(
          <EditorModeHeader
            title={headerTitle}
            subtitle={
              editorMode === 'biology'
                ? biologyHeaderSubtitle
                : editorMode === 'readouts'
                  ? readoutsHeaderSubtitle
                  : editorMode === 'results'
                    ? resultsHeaderSubtitle
                    : 'Keep the same deck, source pane, target pane, and ribbon, while shifting the active editing layer from planning to biology to readouts to results.'
            }
            mode={editorMode}
            onModeChange={onEditorModeChange}
            backHref={editorBackHref}
            saveState={saveState}
            onToggleDrawer={() => onDrawerOpenChange(!drawerOpen)}
            showDrawerToggle={editorMode !== 'plan'}
          />
        )}
        drawer={modeDrawerTabs.length > 0 ? (
          <EditorBottomDrawer
            open={drawerOpen}
            tabs={modeDrawerTabs}
            activeTab={drawerTab}
            onTabChange={onDrawerTabChange}
            onToggleOpen={() => onDrawerOpenChange(!drawerOpen)}
          />
        ) : null}
      >
      {/* Top: minimal global controls */}
      <div className="labware-event-editor-v2__toolbar">
        <div className="toolbar-vocab">
          {runMethodLockedVocabId ? (
            <>
              <span className="toolbar-label">Vocab:</span>
              <span className="save-id" title="Run-attached method vocabulary is locked">
                {runMethodLockedVocabId}
              </span>
            </>
          ) : (
            <>
              <span className="toolbar-label">Vocab:</span>
              <VocabPackSelector value={selectedVocabPackId} onChange={handleVocabPackChange} />
            </>
          )}
        </div>
        <div className="toolbar-divider" />
        <div className="toolbar-divider" />
        <div className="toolbar-save">
          <button
            className="template-global-button"
            onClick={handleNewMethod}
            title="Start a new method with default editor context"
          >
            New Method
          </button>
          <button
            className="template-global-button"
            onClick={() => setLoadTemplateModalOpen(true)}
            title="Load a saved template into the editor or instantiate it into a run"
          >
            Load Template
          </button>
          <button
            className="template-global-button"
            onClick={() => openTemplateModal(null)}
            disabled={state.events.length === 0 || state.labwares.size === 0}
            title="Save current timeline snapshot as template"
          >
            Save as Template
          </button>
          <button
            className={`save-button ${saveState}`}
            onClick={handleSaveAndPush}
            disabled={saveState === 'saving' || state.events.length === 0}
            title={saveError || 'Save event graph and push to git'}
          >
            {saveState === 'saving' && '⏳ Saving...'}
            {saveState === 'success' && '✅ Saved!'}
            {saveState === 'error' && '❌ Error'}
            {saveState === 'idle' && '💾 Save & Push'}
          </button>
          {eventGraphId && (
            <span className="save-id" title={`Event Graph ID: ${eventGraphId}`}>
              {eventGraphId.substring(0, 10)}...
            </span>
          )}
          {saveState === 'error' && saveError && (
            <div className="save-error-message" role="alert" title={saveError}>
              {saveError}
            </div>
          )}
        </div>
      </div>
      {hasGenericOrFallbackLabware && (
        <div className="labware-definition-banner">
          Using generic/fallback labware definitions for at least one container. Capacity and mapping checks may be approximate.
        </div>
      )}
      {runId && runMethodSummary && (
        <div className="protocol-io-panel">
          <div className="protocol-io-panel__section">
            <div className="protocol-io-panel__title">Protocol Inputs</div>
            {runMethodSummary.templateInputResolutions.length === 0 ? (
              <div className="protocol-io-panel__empty">No protocol inputs configured.</div>
            ) : (
              runMethodSummary.templateInputResolutions.map((resolution) => (
                <div key={resolution.templateLabwareId} className="protocol-io-item">
                  <div className="protocol-io-item__meta">
                    <strong>{resolution.slotLabel}</strong>
                    <span>
                      {resolution.kind === 'existing-snapshot'
                        ? `Prepared plate ${resolution.snapshotId}`
                        : resolution.status === 'resolved'
                          ? `Resolved from run ${resolution.upstreamRunId || 'planned'} / ${resolution.producedSnapshotId || 'prepared plate pending'}`
                          : resolution.status === 'run_created'
                            ? `Waiting for output from run ${resolution.upstreamRunId || 'planned'}`
                            : `Will be created from protocol ${resolution.upstreamTemplateId}`}
                    </span>
                  </div>
                  <div className="protocol-io-item__actions">
                    {resolution.kind === 'upstream-run' && resolution.status === 'planned' && (
                      <button type="button" onClick={() => void handleCreateUpstreamRunNow(resolution)} disabled={executionBusy}>
                        Create Upstream Run Now
                      </button>
                    )}
                    {resolution.status !== 'resolved' && (
                      <>
                        <select
                          value={inputResolutionDrafts[resolution.templateLabwareId] || ''}
                          onChange={(e) => setInputResolutionDrafts((prev) => ({ ...prev, [resolution.templateLabwareId]: e.target.value }))}
                          disabled={executionBusy}
                        >
                          <option value="">Use existing prepared plate...</option>
                          {availablePreparedPlates.map((snapshot) => (
                            <option key={snapshot.id} value={snapshot.id}>{snapshot.label}</option>
                          ))}
                        </select>
                        <button type="button" onClick={() => void handleUseExistingPreparedPlate(resolution)} disabled={executionBusy}>
                          Use Existing Prepared Plate
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="protocol-io-panel__section">
            <div className="protocol-io-panel__title">Declared Outputs</div>
            {runMethodSummary.runOutputs.length === 0 ? (
              <div className="protocol-io-panel__empty">No declared outputs.</div>
            ) : (
              runMethodSummary.runOutputs.map((output) => (
                <div key={output.outputId} className="protocol-io-item">
                  <div className="protocol-io-item__meta">
                    <strong>{output.label}</strong>
                    <span>{output.status === 'produced' ? `Produced as ${output.snapshotId}` : 'Not yet promoted to a prepared plate'}</span>
                  </div>
                  {output.status !== 'produced' && (
                    <div className="protocol-io-item__actions">
                      <button
                        type="button"
                        onClick={() => {
                          const templateOutput = loadedTemplateOutputs.find((entry) => entry.outputId === output.outputId)
                          if (templateOutput) void handlePromoteTemplateOutput(templateOutput)
                        }}
                        disabled={executionBusy || !loadedTemplateOutputs.some((entry) => entry.outputId === output.outputId)}
                      >
                        Promote to Prepared Plate
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
      {editorMode === 'plan' ? (
        <PlanModeView
          deck={planDeck}
          ribbon={(
            <div className="labware-event-editor-v2__ribbon">
              <EventRibbon
                events={state.events}
                selectedEventId={state.selectedEventId}
                editingEventId={state.editingEventId}
                onSelectEvent={handleSelectEvent}
                onEditEvent={editEvent}
                onAddEvent={handleAddEvent}
                onUpdateEvent={updateEvent}
                onDeleteEvent={deleteEvent}
                sourceSelectionCount={sourceSelectionCount}
                targetSelectionCount={targetSelectionCount}
                getSourceWells={getSourceWells}
                getTargetWells={getTargetWells}
                sourceLabwareId={sourceLabware?.labwareId}
                sourceLabwareRows={sourceLabware?.addressing.rows || sourceLabware?.addressing.rowLabels?.length}
                sourceLabwareCols={
                  sourceLabware?.addressing.columns
                  || sourceLabware?.addressing.columnLabels?.length
                  || sourceLabware?.addressing.linearLabels?.length
                }
                targetLabwareId={targetLabware?.labwareId}
                targetLabwareRows={targetLabware?.addressing.rows || targetLabware?.addressing.rowLabels?.length}
                targetLabwareCols={
                  targetLabware?.addressing.columns
                  || targetLabware?.addressing.columnLabels?.length
                  || targetLabware?.addressing.linearLabels?.length
                }
                sourceOrientation={sourceLabware ? getLabwareOrientation(sourceLabware.labwareId) : undefined}
                targetOrientation={targetLabware ? getLabwareOrientation(targetLabware.labwareId) : undefined}
                sourceMaxVolumeUL={sourceLabware?.geometry.maxVolume_uL}
                targetMaxVolumeUL={targetLabware?.geometry.maxVolume_uL}
                vocabPackId={selectedVocabPackId}
                onPlaybackPositionChange={setPlaybackPosition}
                prefillMaterials={prefillMaterials}
              />
            </div>
          )}
          panes={(
            <div className="labware-event-editor-v2__panes">
              <DualLabwarePane
                mode={editorMode}
                events={state.events}
                playbackPosition={playbackPosition}
                toolExpander={sessionAwareExpander}
                previewEvents={aiChat.previewEvents}
                onValidation={handleToolSessionValidation}
                lockLandscapeTipracks={executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'}
                canRotateLabware={canRotateLabwareInPane}
                getRotateDisabledReason={getRotateDisabledReason}
                sourceTooltipMeta={sourceTooltipMeta}
                targetTooltipMeta={targetTooltipMeta}
              />
            </div>
          )}
          supplemental={(
            <>
              {labwareDiagnostics.length > 0 && (
                <div className="labware-diagnostics">
                  <div className="labware-diagnostics__title">Labware Mapping Diagnostics</div>
                  {labwareDiagnostics.map((item) => (
                    <div key={item.pane} className="labware-diagnostics__row">
                      <span className="labware-diagnostics__pane">{item.pane.toUpperCase()}</span>
                      <span>{item.name}</span>
                      <span>{item.definitionId}</span>
                      <span>addr:{item.addressing}</span>
                      <span>axis:{item.axis}</span>
                      <span>eff:{item.effectiveAxis}</span>
                      <span>pip:{item.pipetteAxis}</span>
                      <span>orientation:{item.orientation}</span>
                      <span>source:{item.sourceMode}</span>
                      <span>map:{item.mappingMode}</span>
                      {item.warnings.length > 0 && (
                        <span className="labware-diagnostics__warn">{item.warnings[0]}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {shouldShowEditorStateBanner && (
                <div className="labware-event-editor-v2__state-banner" data-testid="editor-state-banner">
                  {focusedEvent && (
                    <div className="editor-state-pill editor-state-pill--focus">
                      <span className="editor-state-pill__label">Focused Event</span>
                      <span className="editor-state-pill__value" title={focusedEventSummary || undefined}>
                        {focusedEventSummary}
                      </span>
                    </div>
                  )}
                  {editingEvent && (
                    <div className="editor-state-pill editor-state-pill--edit">
                      <span className="editor-state-pill__label">Editing</span>
                      <span className="editor-state-pill__value" title={editingEventSummary || undefined}>
                        {editingEventSummary}
                      </span>
                    </div>
                  )}
                  {shouldShowSelectionWorkspace && (
                    <div className="editor-state-pill editor-state-pill--selection">
                      <span className="editor-state-pill__label">Selected Wells</span>
                      <span className="editor-state-pill__value">{formatCount(selectedWellCount, 'well')}</span>
                    </div>
                  )}
                  <div className="editor-state-banner__spacer" />
                  {shouldShowSelectionWorkspace && (
                    <button className="editor-state-action" type="button" onClick={() => clearSelection()}>
                      Clear Wells
                    </button>
                  )}
                  {focusedEvent && (
                    <button className="editor-state-action" type="button" onClick={handleClearEventFocus}>
                      Clear Focus
                    </button>
                  )}
                </div>
              )}

              {focusedEvent && !shouldShowSelectionWorkspace && (
                <div className="labware-event-editor-v2__selection-hint" data-testid="selection-workspace-hint">
                  Lower panels stay scoped to manual well selection. Focused event highlights remain visible in the panes and ribbon.
                </div>
              )}

              {planningEnabled && executionIssues.length > 0 && (
                <div className="execution-issues execution-issues--inline">
                  {executionIssues.slice(0, 4).map((issue, idx) => (
                    <div key={`${issue.code}-${idx}`} className={`execution-issue execution-issue--${issue.severity}`}>
                      <strong>{issue.code}</strong> {issue.message}
                    </div>
                  ))}
                </div>
              )}

              {selectedWellsForContext.length > 0 && (
                <div className="labware-event-editor-v2__selection-actions">
                  <div className="selection-actions-strip">
                    <div className="selection-actions-strip__summary">
                      {selectedWellsForContext.length} selected well{selectedWellsForContext.length !== 1 ? 's' : ''}
                    </div>
                    <button type="button" className="selection-actions-strip__button" onClick={() => onEditorModeChange('biology')}>
                      Biology
                    </button>
                    <button type="button" className="selection-actions-strip__button" onClick={() => onEditorModeChange('readouts')}>
                      Readouts
                    </button>
                    <button type="button" className={`selection-actions-strip__button ${selectionActionPanel === 'state' ? 'is-active' : ''}`} onClick={() => setSelectionActionPanel(selectionActionPanel === 'state' ? null : 'state')}>
                      View State
                    </button>
                    <button type="button" className={`selection-actions-strip__button ${selectionActionPanel === 'prepared-material' ? 'is-active' : ''}`} onClick={() => setSelectionActionPanel(selectionActionPanel === 'prepared-material' ? null : 'prepared-material')}>
                      Save As Prepared Material
                    </button>
                    <button type="button" className={`selection-actions-strip__button ${selectionActionPanel === 'plate-snapshot' ? 'is-active' : ''}`} onClick={() => setSelectionActionPanel(selectionActionPanel === 'plate-snapshot' ? null : 'plate-snapshot')}>
                      Save Plate Snapshot
                    </button>
                    <button
                      type="button"
                      className={`selection-actions-strip__button ${selectionActionPanel === 'formulation' ? 'is-active' : ''}`}
                      onClick={() => setSelectionActionPanel(selectionActionPanel === 'formulation' ? null : 'formulation')}
                      disabled={selectedWellsForContext.length !== 1}
                      title={selectedWellsForContext.length === 1 ? 'Save the selected well as a formulation' : 'Select exactly one well to save it as a formulation'}
                    >
                      Save As Formulation
                    </button>
                  </div>
                  {selectionActionPanel ? (
                    <div className="selection-actions-panel">
                      {selectionActionPanel === 'state' ? (
                        <WellContextPanelV2
                          selectedWells={selectedWellsForContext}
                          events={state.events}
                          labwares={state.labwares}
                          onEventClick={handleContextEventClick}
                          showValidation={true}
                          compact={selectedWellsForContext.length > 4}
                        />
                      ) : selectionActionPanel === 'prepared-material' ? (
                        <div className="reuse-section">
                          <h3 className="text-sm font-semibold text-slate-900">Save As Prepared Material</h3>
                          <div className="row">
                            <label>Material Type</label>
                            <select value={materialOutputMode} onChange={(e) => setMaterialOutputMode(e.target.value as 'prepared-material' | 'biological-material' | 'derived-material')} disabled={materialOutputBusy}>
                              <option value="prepared-material">Prepared Material</option>
                              <option value="biological-material">Biological Material</option>
                              <option value="derived-material">Derived Material</option>
                            </select>
                          </div>
                          <div className="row">
                            <label>Name (optional)</label>
                            <input value={materialOutputName} onChange={(e) => setMaterialOutputName(e.target.value)} disabled={materialOutputBusy} placeholder="Conditioned media, harvested cells, prepared source..." />
                          </div>
                          <RefPicker value={materialOutputRef} onChange={setMaterialOutputRef} olsOntologies={['chebi', 'cl', 'go']} label="Material Ref (optional)" placeholder="Search material ontology terms..." disabled={materialOutputBusy} />
                          <button onClick={handlePromoteMaterialOutput} disabled={materialOutputBusy || selectedWellsForContext.length === 0}>
                            {materialOutputBusy ? 'Working...' : 'Save As Prepared Material'}
                          </button>
                          {materialOutputNotice && <div className="formulations-banner formulations-banner--notice">{materialOutputNotice}</div>}
                        </div>
                      ) : selectionActionPanel === 'plate-snapshot' ? (
                        <div className="reuse-section">
                          <h3 className="text-sm font-semibold text-slate-900">Save Plate Snapshot</h3>
                          <div className="row">
                            <label>Snapshot Title (optional)</label>
                            <input value={plateSnapshotTitle} onChange={(e) => setPlateSnapshotTitle(e.target.value)} disabled={plateSnapshotBusy} placeholder="Plate snapshot title" />
                          </div>
                          <button onClick={handleSavePlateSnapshot} disabled={plateSnapshotBusy || selectedWellsForContext.length === 0}>
                            {plateSnapshotBusy ? 'Working...' : 'Save Plate Snapshot'}
                          </button>
                          {plateSnapshotNotice && <div className="formulations-banner formulations-banner--notice">{plateSnapshotNotice}</div>}
                        </div>
                      ) : (
                        <div className="reuse-section">
                          <h3 className="text-sm font-semibold text-slate-900">Save As Formulation</h3>
                          <div className="row">
                            <label>Formulation Name (optional)</label>
                            <input value={formulationName} onChange={(e) => setFormulationName(e.target.value)} disabled={formulationBusy} placeholder="FIRE stock, media mix, staining mix..." />
                          </div>
                          <RefPicker value={formulationRef} onChange={setFormulationRef} olsOntologies={['chebi', 'cl', 'go']} label="Represents Material (optional)" placeholder="Search material ontology terms..." disabled={formulationBusy} />
                          <button onClick={handleSaveAsFormulation} disabled={formulationBusy || selectedWellsForContext.length !== 1}>
                            {formulationBusy ? 'Working...' : 'Save As Formulation'}
                          </button>
                          <div className="text-xs text-slate-500">
                            {selectedWellsForContext.length === 1
                              ? 'Creates a reusable formulation from the current contents of the selected well.'
                              : 'Select exactly one well to save it as a formulation.'}
                          </div>
                          {formulationNotice && <div className="formulations-banner formulations-banner--notice">{formulationNotice}</div>}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </>
          )}
        />
      ) : editorMode === 'biology' ? (
        <BiologyModeView
          deck={null}
          badges={[
            `${biologyMode.wellGroups.length} groups`,
            `${biologyMode.totalAssignmentCount} biological assignments`,
            `${readoutsMode.contexts.length} linked readouts`,
          ]}
          selectedWellCount={biologySelectedWells.length}
          activeContextName={biologyMode.activeContext ? 'Biology layer' : null}
          onAssignBiology={() => openBiologyDrawerTab('assign')}
          onGroupWells={() => openBiologyDrawerTab('assign')}
          onExpectedBiology={() => openBiologyDrawerTab('missing')}
          panes={(
            <div className="labware-event-editor-v2__panes">
              <DualLabwarePane
                mode={editorMode}
                events={state.events}
                playbackPosition={playbackPosition}
                toolExpander={sessionAwareExpander}
                previewEvents={aiChat.previewEvents}
                onValidation={handleToolSessionValidation}
                lockLandscapeTipracks={executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'}
                canRotateLabware={canRotateLabwareInPane}
                getRotateDisabledReason={getRotateDisabledReason}
                leftOverlay={sourceOverlay}
                rightOverlay={targetOverlay}
                sourceWellContentsOverride={biologySourceWellContents}
                targetWellContentsOverride={biologyTargetWellContents}
                sourceTooltipMeta={sourceTooltipMeta}
                targetTooltipMeta={targetTooltipMeta}
              />
            </div>
          )}
        />
      ) : editorMode === 'readouts' ? (
        <ReadoutsModeView
          deck={null}
          badges={[
            `${readoutsMode.readEvents.length} planned reads`,
            `${readoutsMode.contexts.length} readout contexts`,
            `${readoutsMode.selectedQcControlIds.length} QC controls`,
          ]}
          panes={(
            <div className="labware-event-editor-v2__panes">
              <DualLabwarePane
                mode={editorMode}
                events={state.events}
                playbackPosition={playbackPosition}
                toolExpander={sessionAwareExpander}
                previewEvents={aiChat.previewEvents}
                onValidation={handleToolSessionValidation}
                lockLandscapeTipracks={executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'}
                canRotateLabware={canRotateLabwareInPane}
                getRotateDisabledReason={getRotateDisabledReason}
                leftOverlay={sourceOverlay}
                rightOverlay={targetOverlay}
                sourceWellContentsOverride={biologySourceWellContents}
                targetWellContentsOverride={biologyTargetWellContents}
                sourceTooltipMeta={sourceTooltipMeta}
                targetTooltipMeta={targetTooltipMeta}
              />
            </div>
          )}
        />
      ) : (
        <ResultsModeView
          deck={null}
          badges={[
            `${resultsMode.readEvents.length} planned reads`,
            `${resultsMode.measurementContexts.length} contexts`,
            `${resultsMode.measurements.length} measurements`,
          ]}
          panes={(
            <div className="labware-event-editor-v2__panes">
              <DualLabwarePane
                mode={editorMode}
                events={state.events}
                playbackPosition={playbackPosition}
                toolExpander={sessionAwareExpander}
                previewEvents={aiChat.previewEvents}
                onValidation={handleToolSessionValidation}
                lockLandscapeTipracks={executionTargetPlatform === 'opentrons_ot2' || executionTargetPlatform === 'opentrons_flex'}
                canRotateLabware={canRotateLabwareInPane}
                getRotateDisabledReason={getRotateDisabledReason}
                leftOverlay={sourceOverlay}
                rightOverlay={targetOverlay}
                sourceWellContentsOverride={resultsSourceWellContents}
                targetWellContentsOverride={resultsTargetWellContents}
                sourceTooltipMeta={sourceTooltipMeta}
                targetTooltipMeta={targetTooltipMeta}
              />
            </div>
          )}
        />
      )}
      </EditorModeShell>

      {contextModalOpen && (
        <div className="context-lock-modal-backdrop">
          <div className="context-lock-modal" role="dialog" aria-modal="true" aria-label="Choose method context">
            <h3>Choose Method Context</h3>
            <p>This method stays locked to one vocabulary and one platform while you edit it.</p>
            {contextStep === 1 ? (
              <>
                <div className="context-lock-options">
                  <label className={`context-lock-option ${contextVocabChoice === 'liquid-handling/v1' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="context-vocab"
                      checked={contextVocabChoice === 'liquid-handling/v1'}
                      onChange={() => setContextVocabChoice('liquid-handling/v1')}
                    />
                    <span>
                      <strong>Liquid handling</strong>
                      <small>Deck-based pipetting workflows</small>
                    </span>
                  </label>
                  <label className={`context-lock-option ${contextVocabChoice === 'animal-handling/v1' ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="context-vocab"
                      checked={contextVocabChoice === 'animal-handling/v1'}
                      onChange={() => setContextVocabChoice('animal-handling/v1')}
                    />
                    <span>
                      <strong>Cell and animal handling</strong>
                      <small>Manual workflows only</small>
                    </span>
                  </label>
                </div>
                <div className="context-lock-actions">
                  <button className="save" onClick={() => setContextStep(2)}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <label>
                  Name (optional)
                  <input
                    value={contextMethodName}
                    onChange={(e) => setContextMethodName(e.target.value)}
                    placeholder="e.g. qPCR setup method"
                  />
                </label>
                <label>
                  Platform
                  <select value={contextPlatformChoice} onChange={(e) => setContextPlatformChoice(e.target.value)} disabled={platformsLoading}>
                    {allowedPlatforms.map((platform) => (
                      <option key={platform.id} value={platform.id}>
                        {platform.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="context-lock-actions">
                  <button className="cancel" onClick={() => setContextStep(1)}>Back</button>
                  <button className="save" onClick={handleConfirmEditorContext}>Start Editing</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {templateModalOpen && (
        <div className="template-modal-backdrop" onClick={() => setTemplateModalOpen(false)}>
          <div className="template-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Save Template</h3>
            <p>Snapshot is saved from the currently selected timeline position.</p>
            <label>
              Name
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. qPCR setup plate"
                autoFocus
              />
            </label>
            <label>
              Notes (optional)
              <textarea
                value={templateNotes}
                onChange={(e) => setTemplateNotes(e.target.value)}
                rows={3}
                placeholder="Short notes for future users"
              />
            </label>
            <label>
              Version
              <input value={templateVersion} onChange={(e) => setTemplateVersion(e.target.value)} placeholder="v1" />
            </label>
            <div className="template-metadata-block">
              <div className="template-picker-detail__label">Experiment Types</div>
              <div className="template-chip-grid">
                {TEMPLATE_EXPERIMENT_TYPE_OPTIONS.map((option) => {
                  const active = templateExperimentTypes.includes(option)
                  return (
                    <button
                      key={option}
                      type="button"
                      className={`template-chip ${active ? 'active' : ''}`}
                      onClick={() => setTemplateExperimentTypes((prev) => active ? prev.filter((value) => value !== option) : [...prev, option])}
                    >
                      {option}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="template-metadata-block">
              <div className="template-picker-detail__label">Declared Outputs</div>
              <div className="template-output-drafts">
                {templateOutputDrafts.map((draft) => (
                  <label key={draft.sourceLabwareId} className="template-output-draft">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(e) => setTemplateOutputDrafts((prev) => prev.map((item) => item.sourceLabwareId === draft.sourceLabwareId ? { ...item, enabled: e.target.checked } : item))}
                    />
                    <span className="template-output-draft__labware">{state.labwares.get(draft.sourceLabwareId)?.name || draft.sourceLabwareId}</span>
                    <input
                      value={draft.label}
                      onChange={(e) => setTemplateOutputDrafts((prev) => prev.map((item) => item.sourceLabwareId === draft.sourceLabwareId ? { ...item, label: e.target.value } : item))}
                      placeholder="Output label"
                      disabled={!draft.enabled}
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="template-modal-actions">
              <button className="cancel" onClick={() => setTemplateModalOpen(false)} disabled={templateSaving}>Cancel</button>
              <button className="save" onClick={handleSaveTemplate} disabled={templateSaving || !templateName.trim()}>
                {templateSaving ? 'Saving...' : 'Save Template'}
              </button>
            </div>
            {templateSaveError && <div className="template-modal-error">{templateSaveError}</div>}
          </div>
        </div>
      )}

      <LoadTemplateModal
        isOpen={loadTemplateModalOpen}
        onClose={() => setLoadTemplateModalOpen(false)}
        onLoadTemplate={async (templateId, bindings) => {
          if (state.isDirty && state.events.length > 0) {
            const confirmed = window.confirm('Replace the current method with the selected template?')
            if (!confirmed) return
          }
          await applyLoadedTemplate(templateId, bindings, { replace: true })
        }}
      />

      <style>{`
        .labware-event-editor-v2 {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-height: 600px;
        }

        .labware-event-editor-v2__toolbar {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.5rem 0.75rem;
          background: #f8f9fa;
          border: 1px solid #dee2e6;
          border-radius: 8px;
          flex-shrink: 0;
          flex-wrap: wrap;
        }
        .deck-tool-session {
          border: 1px solid #d0d7de;
          border-radius: 8px;
          background: #f8fafc;
          padding: 0.45rem 0.6rem;
        }

        .labware-event-editor-v2__state-banner {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.75rem;
          border: 1px solid #d0d7de;
          border-radius: 8px;
          background: linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%);
          flex-wrap: wrap;
        }

        .editor-state-pill {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.35rem 0.6rem;
          border-radius: 999px;
          background: white;
          border: 1px solid #d0d7de;
          min-width: 0;
        }

        .editor-state-pill--focus {
          border-color: #b197fc;
        }

        .editor-state-pill--edit {
          border-color: #74c0fc;
        }

        .editor-state-pill--selection {
          border-color: #8ce99a;
        }

        .editor-state-pill__label {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          color: #495057;
        }

        .editor-state-pill__value {
          font-size: 0.82rem;
          color: #212529;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 22rem;
        }

        .editor-state-banner__spacer {
          flex: 1 1 auto;
        }

        .editor-state-action {
          height: 30px;
          padding: 0 0.7rem;
          border-radius: 999px;
          border: 1px solid #adb5bd;
          background: white;
          cursor: pointer;
        }

        .labware-event-editor-v2__selection-hint {
          padding: 0.65rem 0.75rem;
          border-radius: 8px;
          border: 1px dashed #adb5bd;
          background: #f8f9fa;
          color: #495057;
          font-size: 0.85rem;
        }

        .toolbar-vocab {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-shrink: 0;
        }

        .toolbar-label {
          font-size: 0.85rem;
          font-weight: 600;
          color: #495057;
        }

        .toolbar-divider {
          width: 1px;
          height: 24px;
          background: #dee2e6;
        }
        .toolbar-session {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        .toolbar-session label {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.75rem;
          color: #495057;
        }
        .toolbar-session input,
        .toolbar-session select {
          width: 64px;
          height: 26px;
          border: 1px solid #ced4da;
          border-radius: 4px;
          padding: 0 0.35rem;
          font-size: 0.75rem;
        }
        .toolbar-session select {
          width: 170px;
        }
        .toolbar-session-fixed {
          font-size: 0.74rem;
          color: #475569;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 999px;
          padding: 0.2rem 0.5rem;
          white-space: nowrap;
        }
        .session-btn {
          height: 28px;
          border: 1px solid #ced4da;
          border-radius: 5px;
          background: white;
          font-size: 0.75rem;
          font-weight: 600;
          color: #495057;
          padding: 0 0.45rem;
          cursor: pointer;
        }
        .session-btn.active {
          background: #e7f5ff;
          border-color: #74c0fc;
          color: #1971c2;
        }
        .session-btn.commit {
          background: #2f9e44;
          border-color: #2f9e44;
          color: white;
        }
        .session-btn.commit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .toolbar-session-status {
          font-size: 0.78rem;
          padding: 0.3rem 0.55rem;
          border-radius: 999px;
          max-width: 420px;
        }

        .toolbar-session-summary {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.25rem 0.6rem;
          border-radius: 999px;
          background: #edf2ff;
          color: #364fc7;
          font-size: 0.8rem;
          border: 1px solid #bac8ff;
          flex-wrap: wrap;
        }

        .toolbar-session-summary__phase {
          font-weight: 700;
          text-transform: uppercase;
        }

        .toolbar-session-status--info {
          color: #1c3d5a;
          background: #e7f5ff;
          border: 1px solid #a5d8ff;
        }
        .toolbar-session-status--warning {
          color: #5f3b00;
          background: #fff3bf;
          border: 1px solid #ffe066;
        }

        .ai-button {
          padding: 0.4rem 0.75rem;
          border: 1px solid #be4bdb;
          border-radius: 6px;
          background: white;
          color: #be4bdb;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ai-button:hover {
          background: #f3d9fa;
        }

        .ai-button--active {
          background: #be4bdb;
          color: white;
        }

        .ai-button--active:hover {
          background: #9c36b5;
        }

        .toolbar-save {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          margin-left: auto;
        }

        .template-global-button {
          padding: 0.4rem 0.75rem;
          border: 1px solid #364fc7;
          border-radius: 6px;
          background: white;
          color: #364fc7;
          font-size: 0.85rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s;
        }

        .template-global-button:hover:not(:disabled) {
          background: #edf2ff;
        }

        .template-global-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .save-button {
          padding: 0.4rem 0.75rem;
          border: 1px solid #339af0;
          border-radius: 6px;
          background: #339af0;
          color: white;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .save-button:hover:not(:disabled) {
          background: #228be6;
          border-color: #228be6;
        }

        .save-button:disabled {
          background: #adb5bd;
          border-color: #adb5bd;
          cursor: not-allowed;
        }

        .save-button.saving {
          background: #fab005;
          border-color: #fab005;
        }

        .save-button.success {
          background: #40c057;
          border-color: #40c057;
        }

        .save-button.error {
          background: #fa5252;
          border-color: #fa5252;
        }

        .save-id {
          font-size: 0.7rem;
          color: #868e96;
          font-family: monospace;
        }

        .save-error-message {
          margin-top: 0.35rem;
          max-width: 360px;
          font-size: 0.72rem;
          color: #c92a2a;
          line-height: 1.35;
          white-space: normal;
          word-break: break-word;
        }
        .labware-definition-banner {
          margin-top: 0.25rem;
          padding: 0.4rem 0.65rem;
          border-radius: 8px;
          border: 1px solid #fde68a;
          background: #fffbeb;
          color: #92400e;
          font-size: 0.76rem;
          font-weight: 500;
        }

        .labware-event-editor-v2__panes {
          flex: 1;
          min-height: 350px;
        }
        .labware-diagnostics {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #f8fafc;
          padding: 10px 12px;
          display: grid;
          gap: 6px;
        }
        .labware-diagnostics__title {
          font-size: 12px;
          font-weight: 700;
          color: #334155;
          text-transform: uppercase;
          letter-spacing: 0.04em;
        }
        .labware-diagnostics__row {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          font-size: 12px;
          color: #334155;
          align-items: center;
        }
        .labware-diagnostics__pane {
          font-weight: 700;
          color: #1d4ed8;
        }
        .labware-diagnostics__warn {
          color: #92400e;
        }

        .labware-event-editor-v2__ribbon {
          flex-shrink: 0;
          width: 100%;
          border: 1px solid #cbd5e1;
          border-radius: 14px;
          background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
          box-shadow: 0 10px 28px rgba(15, 23, 42, 0.06);
          padding: 0.55rem 0.65rem 0.7rem;
        }

        .labware-event-editor-v2__semantic {
          flex-shrink: 0;
          background: #fff8e1;
          border: 1px solid #ffd54f;
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 0.35rem;
        }

        .labware-event-editor-v2__semantic.collapsed {
          max-height: 40px;
        }

        .semantic-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: #ffe082;
          border-bottom: 1px solid #ffd54f;
        }

        .semantic-panel-title {
          font-weight: 600;
          font-size: 0.85rem;
          color: #f57f17;
        }

        .panel-scope-note {
          font-size: 0.78rem;
          color: #6c757d;
          margin-left: auto;
          margin-right: 0.5rem;
        }

        .semantic-panel-toggle {
          padding: 0.25rem 0.5rem;
          border: none;
          background: none;
          color: #f57f17;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }

        .semantic-panel-toggle:hover {
          text-decoration: underline;
        }

        .semantic-panel-content {
          padding: 0.35rem 0.45rem;
        }

        .labware-event-editor-v2__context {
          flex-shrink: 0;
          background: #f8f9fa;
          border-radius: 8px;
          overflow: hidden;
        }

        .labware-event-editor-v2__context.collapsed {
          max-height: 40px;
        }

        .labware-event-editor-v2__reuse {
          flex-shrink: 0;
          background: #f1f3f5;
          border: 1px solid #ced4da;
          border-radius: 8px;
          overflow: hidden;
        }

        .labware-event-editor-v2__reuse.collapsed {
          max-height: 40px;
        }
        .labware-event-editor-v2__execution {
          flex-shrink: 0;
          background: #f1f3f5;
          border: 1px solid #adb5bd;
          border-radius: 8px;
          overflow: hidden;
        }
        .labware-event-editor-v2__execution.collapsed {
          max-height: 40px;
        }
        .execution-panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: #dee2e6;
          border-bottom: 1px solid #ced4da;
        }
        .execution-panel-title {
          font-weight: 600;
          font-size: 0.85rem;
          color: #343a40;
        }
        .execution-panel-toggle {
          padding: 0.25rem 0.5rem;
          border: none;
          background: none;
          color: #364fc7;
          font-size: 0.75rem;
          cursor: pointer;
        }
        .execution-panel-content {
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }
        .execution-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
          gap: 0.6rem;
        }
        .execution-grid label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.8rem;
          color: #495057;
        }
        .execution-grid input,
        .execution-grid select {
          height: 30px;
          border: 1px solid #ced4da;
          border-radius: 6px;
          padding: 0 0.5rem;
          font-size: 0.82rem;
        }
        .execution-actions {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .execution-tip-summary {
          font-size: 0.8rem;
          color: #334155;
          background: #f8fafc;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 0.4rem 0.55rem;
        }
        .execution-runtime-actions-preview {
          font-size: 0.8rem;
          color: #334155;
          background: #fff7ed;
          border: 1px solid #fed7aa;
          border-radius: 6px;
          padding: 0.45rem 0.6rem;
        }
        .execution-runtime-actions-preview strong {
          display: block;
          margin-bottom: 0.35rem;
        }
        .execution-runtime-actions-preview ul {
          margin: 0;
          padding-left: 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .execution-runtime-actions-preview__empty {
          color: #64748b;
        }
        .execution-actions button {
          height: 30px;
          border: 1px solid #495057;
          border-radius: 6px;
          background: white;
          color: #343a40;
          padding: 0 0.65rem;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .execution-actions button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .execution-notice {
          font-size: 0.82rem;
          color: #343a40;
          background: #e9ecef;
          border: 1px solid #ced4da;
          border-radius: 6px;
          padding: 0.45rem 0.6rem;
        }
        .execution-issues {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
        }
        .execution-issue {
          font-size: 0.78rem;
          border-radius: 6px;
          padding: 0.35rem 0.5rem;
        }
        .execution-issue--error {
          background: #fff5f5;
          border: 1px solid #ffc9c9;
          color: #c92a2a;
        }
        .execution-issue--warning {
          background: #fff9db;
          border: 1px solid #ffec99;
          color: #5f3b00;
        }

        .context-lock-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.52);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2600;
        }

        .context-lock-modal {
          width: min(520px, calc(100vw - 2rem));
          background: white;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          padding: 0.9rem;
          display: flex;
          flex-direction: column;
          gap: 0.7rem;
        }

        .context-lock-modal h3 {
          margin: 0;
          font-size: 1rem;
          color: #1e293b;
        }

        .context-lock-modal p {
          margin: 0;
          font-size: 0.82rem;
          color: #64748b;
        }

        .context-lock-modal label {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          font-size: 0.83rem;
          color: #334155;
        }

        .context-lock-modal input,
        .context-lock-modal select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.45rem 0.55rem;
          font-size: 0.84rem;
          font-family: inherit;
        }

        .context-lock-options {
          display: grid;
          gap: 0.55rem;
        }

        .context-lock-option {
          display: flex;
          align-items: flex-start;
          gap: 0.55rem;
          border: 1px solid #dbe4f0;
          border-radius: 8px;
          padding: 0.55rem 0.6rem;
          cursor: pointer;
          background: #f8fafc;
        }

        .context-lock-option.selected {
          border-color: #2563eb;
          background: #eff6ff;
        }

        .context-lock-option input {
          margin-top: 0.15rem;
        }

        .context-lock-option span {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
        }

        .context-lock-option small {
          color: #64748b;
          font-size: 0.74rem;
        }

        .context-lock-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .context-lock-actions button {
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0 0.8rem;
        }

        .context-lock-actions .save {
          border-color: #1d4ed8;
          background: #1d4ed8;
          color: white;
        }

        .template-modal-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(2, 6, 23, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2500;
        }

        .template-modal {
          width: min(500px, calc(100vw - 2rem));
          background: white;
          border-radius: 10px;
          border: 1px solid #cbd5e1;
          padding: 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .template-modal--wide {
          width: min(980px, calc(100vw - 2rem));
          max-height: min(82vh, 900px);
          overflow: auto;
        }

        .template-modal h3 {
          margin: 0;
          font-size: 1rem;
          color: #1e293b;
        }

        .template-modal p {
          margin: 0;
          font-size: 0.82rem;
          color: #64748b;
        }

        .template-modal label {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.8rem;
          color: #475569;
        }

        .template-modal input,
        .template-modal textarea,
        .template-modal select {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 0.45rem 0.55rem;
          font-size: 0.84rem;
          font-family: inherit;
        }

        .template-filter-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.5rem;
        }

        .template-filter-row:last-of-type {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .template-modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: 0.5rem;
        }

        .template-modal-error {
          border: 1px solid #fecaca;
          border-radius: 8px;
          padding: 0.5rem 0.6rem;
          background: #fef2f2;
          color: #991b1b;
          font-size: 0.8rem;
          line-height: 1.35;
          white-space: pre-wrap;
        }

        .template-modal-actions button {
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0 0.8rem;
        }

        .template-modal-actions .save {
          border-color: #1d4ed8;
          background: #1d4ed8;
          color: white;
        }

        .template-picker-grid {
          display: grid;
          grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
          gap: 0.75rem;
          min-height: 360px;
        }

        .template-picker-list {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          padding: 0.4rem;
          overflow: auto;
          background: #f8fafc;
        }

        .template-picker-item {
          border: 1px solid #dbe2ea;
          background: white;
          border-radius: 8px;
          padding: 0.55rem 0.65rem;
          text-align: left;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }

        .template-picker-item.active {
          border-color: #1d4ed8;
          box-shadow: 0 0 0 1px #1d4ed8 inset;
          background: #eff6ff;
        }

        .template-picker-item__title {
          font-weight: 600;
          color: #0f172a;
        }

        .template-picker-item__meta,
        .template-picker-detail__meta {
          font-size: 0.76rem;
          color: #64748b;
        }

        .template-picker-detail {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          padding: 0.75rem;
          background: white;
          overflow: auto;
        }

        .template-picker-detail__header p {
          margin-top: 0.35rem;
        }

        .template-picker-detail__block {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
          padding-top: 0.15rem;
          border-top: 1px solid #e2e8f0;
        }

        .template-picker-detail__label {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #475569;
        }

        .template-binding-list {
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }

        .template-binding-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 180px 1fr;
          gap: 0.45rem;
          align-items: center;
        }

        .template-binding-row__stack {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }

        .template-binding-row__heading {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          font-size: 0.8rem;
          color: #475569;
        }

        .template-picker-empty {
          color: #64748b;
          font-size: 0.84rem;
          padding: 0.75rem;
        }

        .template-metadata-block {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .template-chip-grid {
          display: flex;
          flex-wrap: wrap;
          gap: 0.4rem;
        }

        .template-chip {
          height: 30px;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          padding: 0 0.75rem;
          font-size: 0.78rem;
          cursor: pointer;
        }

        .template-chip.active {
          border-color: #1d4ed8;
          background: #dbeafe;
          color: #1d4ed8;
        }

        .template-output-drafts {
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .template-output-draft {
          display: grid !important;
          grid-template-columns: auto minmax(120px, 1fr) minmax(0, 1fr);
          align-items: center;
          gap: 0.5rem;
        }

        .template-output-draft__labware {
          font-size: 0.8rem;
          color: #334155;
        }

        .template-output-bar {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          background: #eff6ff;
          flex-wrap: wrap;
        }

        .template-output-bar__label {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #1d4ed8;
        }

        .template-output-bar__button {
          height: 30px;
          border-radius: 999px;
          border: 1px solid #93c5fd;
          background: white;
          color: #1d4ed8;
          padding: 0 0.75rem;
          font-size: 0.78rem;
          cursor: pointer;
        }

        .protocol-io-panel {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
          margin: 0.75rem 1rem 0;
        }

        .protocol-io-panel__section {
          border: 1px solid #dbe2ea;
          border-radius: 10px;
          background: #f8fafc;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .protocol-io-panel__title {
          font-size: 0.76rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #334155;
        }

        .protocol-io-panel__empty {
          color: #64748b;
          font-size: 0.82rem;
        }

        .protocol-io-item {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: white;
          padding: 0.6rem;
          display: flex;
          flex-direction: column;
          gap: 0.45rem;
        }

        .protocol-io-item__meta {
          display: flex;
          flex-direction: column;
          gap: 0.15rem;
          font-size: 0.8rem;
          color: #475569;
        }

        .protocol-io-item__actions {
          display: flex;
          flex-wrap: wrap;
          gap: 0.45rem;
          align-items: center;
        }

        .protocol-io-item__actions select,
        .protocol-io-item__actions button {
          height: 32px;
          border-radius: 8px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          padding: 0 0.7rem;
          font-size: 0.8rem;
        }

        .labware-event-editor-v2__selection-actions {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin: 0.9rem 1rem 0;
        }

        .selection-actions-strip {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.5rem;
          padding: 0.65rem 0.75rem;
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          background: rgba(248, 250, 252, 0.92);
        }

        .selection-actions-strip__summary {
          font-size: 0.78rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #334155;
          margin-right: 0.15rem;
        }

        .selection-actions-strip__button {
          height: 32px;
          border-radius: 999px;
          border: 1px solid #cbd5e1;
          background: white;
          color: #334155;
          padding: 0 0.8rem;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
        }

        .selection-actions-strip__button:hover:not(:disabled) {
          border-color: #93c5fd;
          background: #eff6ff;
          color: #1d4ed8;
        }

        .selection-actions-strip__button.is-active {
          border-color: #2563eb;
          background: #dbeafe;
          color: #1d4ed8;
        }

        .selection-actions-strip__button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .selection-actions-panel {
          border: 1px solid #dbe2ea;
          border-radius: 12px;
          background: white;
          padding: 0.85rem;
          box-shadow: 0 10px 30px rgba(15, 23, 42, 0.06);
        }
      `}</style>
    </div>
  )
}

/**
 * LabwareEventEditor page component
 */
export function LabwareEventEditor() {
  const params = useParams<{ runId?: string; mode?: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [methodDisplayName, setMethodDisplayName] = useState('')
  const eventGraphId = searchParams.get('id')
  const runId = params.runId ?? searchParams.get('runId')
  const studyId = searchParams.get('studyId')
  const experimentId = searchParams.get('experimentId')
  const fixtureName = searchParams.get('fixture') as LabwareEditorFixtureName | null
  const templateIds = (searchParams.get('templates') || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const planningParam = searchParams.get('planning')
  const planningEnabled = planningParam !== '0' && planningParam !== 'false'
  const forceNew = searchParams.get('new') === '1'
  const {
    mode: editorMode,
    setMode: setEditorMode,
    drawerOpen,
    setDrawerOpen,
    drawerTab,
    setDrawerTab,
  } = useEditorMode({
    routeMode: params.mode,
    searchMode: searchParams.get('mode'),
    storageKey: runId ? `semantic-eln.editor-mode:${runId}` : 'semantic-eln.editor-mode',
  })
  const parsePrefillIds = (key: string) => (searchParams.get(key) || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
  const prefillMaterials: Ref[] = [
    ...parsePrefillIds('prefillAliquotIds').map((id) => ({ kind: 'record' as const, id, type: 'aliquot', label: id })),
    ...parsePrefillIds('prefillMaterialInstanceIds').map((id) => ({ kind: 'record' as const, id, type: 'material-instance', label: id })),
    ...parsePrefillIds('prefillMaterialSpecIds').map((id) => ({ kind: 'record' as const, id, type: 'material-spec', label: id })),
    ...parsePrefillIds('prefillVendorProductIds').map((id) => ({ kind: 'record' as const, id, type: 'vendor-product', label: id })),
    ...parsePrefillIds('prefillMaterialIds').map((id) => ({ kind: 'record' as const, id, type: 'material', label: id })),
  ]
  const editorKey = [
    eventGraphId || 'new',
    runId || 'none',
    studyId || 'no-study',
    experimentId || 'no-experiment',
    forceNew ? 'force-new' : 'normal',
    templateIds.join(',') || 'no-templates',
    prefillMaterials.map((ref) => ref.kind === 'record' ? `${ref.type}:${ref.id}` : `${ref.kind}:${ref.id}`).join(',') || 'no-prefill',
  ].join(':')
  const draftStorageKey = `cl.labware-editor.draft:${editorKey}`
  useEffect(() => {
    if (forceNew || !eventGraphId) {
      setMethodDisplayName('')
    }
  }, [eventGraphId, forceNew, runId])
  const headerTitle = methodDisplayName.trim()
    ? methodDisplayName.trim()
    : (eventGraphId ? 'Edit Event Graph' : runId ? 'New Event Graph for Run' : 'New Event Graph')

  const handleEditorModeChange = useCallback((nextMode: EditorMode) => {
    setEditorMode(nextMode)
    const nextSearchParams = new URLSearchParams(searchParams)
    if (!params.runId) {
      if (nextMode === 'plan') nextSearchParams.delete('mode')
      else nextSearchParams.set('mode', nextMode)
    }
    const search = nextSearchParams.toString()
    if (params.runId) {
      navigate({
        pathname: `/runs/${encodeURIComponent(params.runId)}/editor/${nextMode}`,
        search: search ? `?${search}` : '',
      })
    } else {
      navigate({
        pathname: '/labware-editor',
        search: search ? `?${search}` : '',
      })
    }
  }, [navigate, params.runId, searchParams, setEditorMode])
  
  return (
    <div className="labware-event-editor-page">
      <header className="page-header">
        <div className="breadcrumb">
          <Link to="/browser">Browser</Link>
          <span className="breadcrumb-separator">/</span>
          <span>Labware Event Editor</span>
          {eventGraphId && (
            <>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-id">{eventGraphId.substring(0, 10)}...</span>
            </>
          )}
          {runId && (
            <>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-run" title={`Run: ${runId}`}>🔗 {runId.substring(0, 12)}...</span>
            </>
          )}
        </div>
        <h1>{headerTitle}</h1>
        <p>Create and manage events across multiple labwares with side-by-side source/target view.</p>
      </header>

      <LabwareEditorProvider key={editorKey}>
        <LabwareEventEditorContent 
          initialEventGraphId={eventGraphId} 
          runId={runId}
          studyId={studyId}
          experimentId={experimentId}
          fixtureName={fixtureName}
          planningEnabled={planningEnabled}
          templateIds={templateIds}
          forceNew={forceNew}
          prefillMaterials={prefillMaterials}
          onMethodNameChange={setMethodDisplayName}
          draftStorageKey={draftStorageKey}
          editorMode={editorMode}
          onEditorModeChange={handleEditorModeChange}
          drawerOpen={drawerOpen}
          onDrawerOpenChange={setDrawerOpen}
          drawerTab={drawerTab}
          onDrawerTabChange={setDrawerTab}
          headerTitle={headerTitle}
        />
      </LabwareEditorProvider>

      {editorMode === 'plan' && (
      <section className="instructions">
        <h2>How to Use</h2>
        <ul>
          <li><strong>Add labware:</strong> Click "+ Add" in the selector bar and choose a labware type</li>
          <li><strong>Assign panes:</strong> Click a labware pill to cycle: unassigned → source (blue) → target (green) → unassigned</li>
          <li><strong>Select wells:</strong> Click wells in the source/target panes (shift+click to add, ctrl+click to toggle)</li>
          <li><strong>Hover wells:</strong> Mouse over a well to see its contents (volume, materials, events)</li>
          <li><strong>Add event:</strong> Hover over the + button and choose event type</li>
          <li><strong>Edit event:</strong> Click an event pill to edit its details in the form row</li>
          <li><strong>Well context:</strong> Select wells to see detailed event history below</li>
        </ul>
      </section>
      )}

      <style>{`
        .labware-event-editor-page {
          max-width: 1400px;
          margin: 0 auto;
          padding: 1rem;
        }

        .page-header {
          margin-bottom: 1rem;
        }

        .page-header h1 {
          margin: 0.5rem 0;
        }

        .page-header p {
          color: #666;
          margin: 0;
        }

        .breadcrumb {
          font-size: 0.875rem;
          color: #666;
        }

        .breadcrumb a {
          color: #339af0;
          text-decoration: none;
        }

        .breadcrumb a:hover {
          text-decoration: underline;
        }

        .breadcrumb-separator {
          margin: 0 0.5rem;
        }

        .instructions {
          background: #f8f9fa;
          padding: 1rem;
          border-radius: 8px;
          margin-top: 1rem;
        }

        .instructions h2 {
          margin-top: 0;
          font-size: 1rem;
        }

        .instructions ul {
          margin: 0;
          padding-left: 1.5rem;
        }

        .instructions li {
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }

        .mode-drawer-button {
          border: 1px solid #d0d7de;
          background: #ffffff;
          color: #24292f;
          font-weight: 600;
          border-radius: 999px;
          padding: 0.55rem 0.9rem;
          cursor: pointer;
        }

        .mode-drawer-button--primary {
          background: #0969da;
          border-color: #0969da;
          color: #ffffff;
        }

        .results-mode-drawer {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .results-mode-drawer__grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.85rem;
        }

        .results-mode-field {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          color: #334155;
          font-size: 0.84rem;
          font-weight: 600;
        }

        .results-mode-field--wide {
          grid-column: 1 / -1;
        }

        .results-mode-field input,
        .results-mode-field select {
          border: 1px solid #d0d7de;
          border-radius: 10px;
          padding: 0.6rem 0.7rem;
          font: inherit;
          background: #ffffff;
          color: #0f172a;
        }

        .results-mode-actions {
          display: flex;
          gap: 0.65rem;
          flex-wrap: wrap;
        }

        .results-mode-summary,
        .results-mode-preview {
          border: 1px solid #d8dee4;
          border-radius: 14px;
          background: #f8fafc;
          padding: 0.9rem 1rem;
        }

        .results-mode-summary p,
        .results-mode-preview p {
          margin: 0.35rem 0 0;
          color: #475569;
        }

        .results-mode-preview h3 {
          margin: 0 0 0.75rem;
          color: #0f172a;
          font-size: 0.95rem;
        }

        .results-mode-table {
          display: grid;
          gap: 0.35rem;
        }

        .results-mode-table__header,
        .results-mode-table__row {
          display: grid;
          grid-template-columns: 90px 1fr 120px 120px;
          gap: 0.75rem;
          align-items: center;
        }

        .results-mode-table__header {
          font-size: 0.75rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #64748b;
        }

        .results-mode-table__row {
          padding: 0.5rem 0.65rem;
          border-radius: 10px;
          background: #ffffff;
          color: #0f172a;
          font-size: 0.84rem;
        }

        @media (max-width: 900px) {
          .results-mode-drawer__grid {
            grid-template-columns: 1fr;
          }

          .results-mode-table__header,
          .results-mode-table__row {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </div>
  )
}
