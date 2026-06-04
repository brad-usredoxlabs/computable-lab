import { apiClient } from '../shared/api/client'
import { normalizeEventGraphEventsForSave } from '../editor/lib/serialDilutionPlan'
import type { Labware } from '../types/labware'
import type { PlateEvent } from '../types/events'
import type { EventEditorPlacement, LabwareOrientation, PlacementLocation } from './types'

export interface EventEditorLayoutSnapshot {
  surface: 'event-editor/v1'
  placements: EventEditorPlacement[]
}

export interface AcceptedEventGraphPayload {
  events: PlateEvent[]
  labwares: Labware[]
  runId?: string
  name: string
  links?: { runId?: string }
  status: 'inbox' | 'filed'
  editorLayout: EventEditorLayoutSnapshot
}

export interface SavedEventGraphCommit {
  sha: string
  message: string
  timestamp: string
}

export interface PersistAcceptedEventGraphResult {
  eventGraphId: string
  commit?: SavedEventGraphCommit
}

export interface PersistAcceptedEventGraphInput {
  eventGraphId: string | null
  runId: string | null
  events: PlateEvent[]
  labwares: Record<string, Labware>
  placements: EventEditorPlacement[]
}

interface LoadEventGraphResult {
  id: string
  events?: unknown[]
  labwares?: unknown[]
  runId?: string
  name?: string
  editorLayout?: unknown
  deckLayout?: unknown
}

interface SaveEventGraphResult {
  record?: { id?: string; recordId?: string }
  commit?: SavedEventGraphCommit
  validation?: {
    valid?: boolean
    errors?: Array<{ path?: string; message?: string }>
  }
}

type SaveEventGraphFn = (
  eventGraphId: string | null,
  payload: AcceptedEventGraphPayload,
) => Promise<SaveEventGraphResult>

type LoadEventGraphFn = (eventGraphId: string) => Promise<LoadEventGraphResult>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOrientation(value: unknown): value is LabwareOrientation {
  return value === 'portrait' || value === 'landscape'
}

function parseLocation(value: unknown): PlacementLocation | null {
  if (!isRecord(value)) return null
  if (value.kind === 'slot' && typeof value.slotId === 'string') {
    return { kind: 'slot', slotId: value.slotId }
  }
  if (value.kind === 'lawn' && typeof value.xMm === 'number' && typeof value.yMm === 'number') {
    return { kind: 'lawn', xMm: value.xMm, yMm: value.yMm }
  }
  return null
}

function parseEditorLayoutPlacements(value: unknown): EventEditorPlacement[] {
  if (!isRecord(value) || !Array.isArray(value.placements)) return []
  return value.placements.flatMap((entry): EventEditorPlacement[] => {
    if (!isRecord(entry)) return []
    const location = parseLocation(entry.location)
    if (!location) return []
    if (typeof entry.placementId !== 'string' || typeof entry.labwareId !== 'string') return []
    if (!isOrientation(entry.orientation)) return []
    return [{
      placementId: entry.placementId,
      labwareId: entry.labwareId,
      location,
      orientation: entry.orientation,
    }]
  })
}

function parseDeckLayoutPlacements(value: unknown): EventEditorPlacement[] {
  if (!isRecord(value) || !Array.isArray(value.placements)) return []
  const orientations = isRecord(value.labwareOrientations) ? value.labwareOrientations : {}
  return value.placements.flatMap((entry): EventEditorPlacement[] => {
    if (!isRecord(entry) || typeof entry.labwareId !== 'string' || typeof entry.slotId !== 'string') return []
    const orientation = orientations[entry.labwareId]
    return [{
      placementId: `pl-${entry.labwareId}`,
      labwareId: entry.labwareId,
      location: { kind: 'slot', slotId: entry.slotId },
      orientation: isOrientation(orientation) ? orientation : 'portrait',
    }]
  })
}

function labwareRecord(labwares: unknown[] | undefined): Record<string, Labware> {
  const out: Record<string, Labware> = {}
  for (const item of labwares ?? []) {
    if (!isRecord(item) || typeof item.labwareId !== 'string') continue
    out[item.labwareId] = item as unknown as Labware
  }
  return out
}

export function buildEditorLayoutSnapshot(placements: EventEditorPlacement[]): EventEditorLayoutSnapshot {
  return {
    surface: 'event-editor/v1',
    placements: placements.map((placement) => ({
      placementId: placement.placementId,
      labwareId: placement.labwareId,
      location: { ...placement.location },
      orientation: placement.orientation,
    })),
  }
}

export function hydrateEventEditorGraph(graph: LoadEventGraphResult): {
  eventGraphId: string
  runId: string | null
  events: PlateEvent[]
  labwares: Record<string, Labware>
  placements: EventEditorPlacement[]
} {
  const editorPlacements = parseEditorLayoutPlacements(graph.editorLayout)
  return {
    eventGraphId: graph.id,
    runId: graph.runId ?? null,
    events: Array.isArray(graph.events) ? graph.events as PlateEvent[] : [],
    labwares: labwareRecord(graph.labwares),
    placements: editorPlacements.length > 0 ? editorPlacements : parseDeckLayoutPlacements(graph.deckLayout),
  }
}

export function buildAcceptedEventGraphPayload(input: Omit<PersistAcceptedEventGraphInput, 'eventGraphId'>): AcceptedEventGraphPayload {
  const runId = input.runId || undefined
  return {
    events: normalizeEventGraphEventsForSave(input.events),
    labwares: Object.values(input.labwares),
    runId,
    name: runId ? `Event Graph for ${runId}` : 'Event Editor Draft',
    ...(runId ? { links: { runId } } : {}),
    status: runId ? 'filed' : 'inbox',
    editorLayout: buildEditorLayoutSnapshot(input.placements),
  }
}

export function assertSavedEventGraphValid(result: SaveEventGraphResult): void {
  if (result.validation?.valid !== false) return
  const message = result.validation.errors
    ?.map((error) => [error.path, error.message].filter(Boolean).join(': '))
    .filter(Boolean)
    .join('; ')
  throw new Error(message ? `Event graph validation failed: ${message}` : 'Event graph validation failed')
}

export function extractSavedEventGraphId(
  result: SaveEventGraphResult,
  fallback: string | null,
): string {
  const savedId = result.record?.id || result.record?.recordId || fallback
  if (!savedId) throw new Error('Event graph save succeeded but no record ID was returned')
  return savedId
}

export async function persistAcceptedEventGraph(
  input: PersistAcceptedEventGraphInput,
  saveEventGraph: SaveEventGraphFn = apiClient.saveEventGraph,
): Promise<PersistAcceptedEventGraphResult> {
  const payload = buildAcceptedEventGraphPayload(input)
  const result = await saveEventGraph(input.eventGraphId, payload)
  assertSavedEventGraphValid(result)
  return {
    eventGraphId: extractSavedEventGraphId(result, input.eventGraphId),
    ...(result.commit ? { commit: result.commit } : {}),
  }
}

export async function loadAcceptedEventGraph(
  eventGraphId: string,
  loadEventGraph: LoadEventGraphFn = apiClient.loadEventGraph,
): Promise<ReturnType<typeof hydrateEventEditorGraph>> {
  const graph = await loadEventGraph(eventGraphId)
  return hydrateEventEditorGraph(graph)
}
