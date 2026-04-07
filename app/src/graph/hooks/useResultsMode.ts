import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  type MeasurementContextRecord,
  type MeasurementParserValidationResult,
  type MeasurementRecordPayload,
  type RunWorkspaceResponse,
} from '../../shared/api/client'
import type { PlateEvent, ReadDetails } from '../../types/events'
import type { WellId } from '../../types/plate'
import { isBiologyContext, parseReadoutContextMetadata, parseReadoutNotes, summarizeQcControls } from '../lib/readoutMetadata'

const PARSER_OPTIONS = [
  { value: 'generic_csv', label: 'Generic CSV' },
  { value: 'gemini_csv', label: 'Gemini CSV' },
  { value: 'abi7500_csv', label: 'ABI 7500 CSV' },
  { value: 'agilent6890_csv_stub', label: 'Agilent 6890 CSV' },
  { value: 'metrohm761_csv_stub', label: 'Metrohm 761 CSV' },
] as const

export interface ResultsReadEventSummary {
  eventId: string
  label: string
  instrument?: string
  labwareId?: string
}

export interface ResultsWellDetail {
  well: string
  value: number
  metric: string
  channelId?: string
  unit?: string
}

export interface ResultsQcFinding {
  id: string
  title: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  details: string
  roleType?: string
}

export interface ResultsExpectationCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail' | 'info'
  expectedBehavior: string
  details: string
}

export interface UseResultsModeResult {
  parserOptions: Array<{ value: string; label: string }>
  readEvents: ResultsReadEventSummary[]
  activeReadEventId: string | null
  setActiveReadEventId: (eventId: string | null) => void
  measurementContexts: RunWorkspaceResponse['measurementContexts']
  activeContextId: string | null
  setActiveContextId: (contextId: string | null) => void
  activeContext: RunWorkspaceResponse['measurementContexts'][number] | null
  activeContextLabel: string | null
  measurements: RunWorkspaceResponse['measurements']
  activeMeasurementId: string | null
  setActiveMeasurementId: (measurementId: string | null) => void
  activeMeasurement: RunWorkspaceResponse['measurements'][number] | null
  availableMetrics: string[]
  activeMetric: string | null
  setActiveMetric: (metric: string | null) => void
  availableChannels: string[]
  activeChannelId: string | null
  setActiveChannelId: (channelId: string | null) => void
  timepoint: string
  setTimepoint: (timepoint: string) => void
  rawDataPath: string
  setRawDataPath: (path: string) => void
  uploadFile: (file: File) => Promise<void>
  uploading: boolean
  uploadedFileName: string | null
  parserId: string
  setParserId: (parserId: string) => void
  preview: MeasurementParserValidationResult | null
  previewRows: ResultsWellDetail[]
  activeRows: ResultsWellDetail[]
  selectedWellDetails: ResultsWellDetail[]
  sourceWellContents: Map<WellId, { color?: string }>
  targetWellContents: Map<WellId, { color?: string }>
  measurementSummary: string
  qcFindings: ResultsQcFinding[]
  expectationChecks: ResultsExpectationCheck[]
  readoutExpectationNotes: string
  readoutQcNotes: string
  draftingEvidence: boolean
  draftEvidenceMessage: string | null
  loading: boolean
  validating: boolean
  ingesting: boolean
  error: string | null
  refresh: () => Promise<void>
  validate: () => Promise<void>
  ingest: () => Promise<void>
  draftEvidence: () => Promise<void>
}

function toMeasurementContextEnvelope(
  context: MeasurementContextRecord,
): RunWorkspaceResponse['measurementContexts'][number] {
  return {
    recordId: context.id,
    schemaId: 'measurement-context',
    payload: context,
    meta: {
      kind: 'measurement-context',
    },
  }
}

function readRows(payload: MeasurementRecordPayload | MeasurementParserValidationResult | null): ResultsWellDetail[] {
  if (!payload || !Array.isArray(payload.data)) return []
  return payload.data
    .filter((row): row is ResultsWellDetail => typeof row?.well === 'string' && typeof row?.metric === 'string' && typeof row?.value === 'number')
    .map((row) => ({
      well: row.well,
      metric: row.metric,
      value: row.value,
      channelId: row.channelId,
      unit: row.unit,
    }))
}

function eventLabel(event: PlateEvent): string {
  const details = event.details as ReadDetails
  const assay = typeof details.assay_ref === 'string' ? details.assay_ref : undefined
  const instrument = typeof details.instrument === 'string' ? details.instrument : undefined
  return [event.eventId, assay, instrument].filter(Boolean).join(' · ')
}

function measurementLabwareId(
  measurement: RunWorkspaceResponse['measurements'][number] | null,
  activeContext: RunWorkspaceResponse['measurementContexts'][number] | null,
): string | null {
  const measurementLabware = measurement?.payload.labwareInstanceRef?.id
  if (measurementLabware) return measurementLabware
  const contextSource = activeContext?.payload.source_ref?.id
  return contextSource || null
}

function colorForValue(value: number, min: number, max: number): string {
  if (!Number.isFinite(value)) return '#ffffff'
  if (min === max) return '#0ea5e9'
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)))
  const hue = 220 - ratio * 170
  const lightness = 95 - ratio * 42
  return `hsl(${hue} 82% ${lightness}%)`
}

function buildWellMap(
  rows: ResultsWellDetail[],
  metric: string | null,
  channelId: string | null,
): Map<WellId, { color?: string }> {
  const filtered = rows.filter((row) =>
    (!metric || row.metric === metric) && (!channelId || row.channelId === channelId),
  )
  if (filtered.length === 0) return new Map()

  const aggregated = new Map<string, number[]>()
  for (const row of filtered) {
    const current = aggregated.get(row.well) ?? []
    current.push(row.value)
    aggregated.set(row.well, current)
  }

  const averagedEntries = Array.from(aggregated.entries()).map(([well, values]) => ({
    well,
    value: values.reduce((sum, item) => sum + item, 0) / values.length,
  }))
  const min = Math.min(...averagedEntries.map((entry) => entry.value))
  const max = Math.max(...averagedEntries.map((entry) => entry.value))

  return new Map(
    averagedEntries.map((entry) => [entry.well as WellId, { color: colorForValue(entry.value, min, max) }]),
  )
}

function splitWellRef(subjectId: string): string | null {
  const parts = subjectId.split('#')
  return parts.length === 2 ? parts[1] : null
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function makeId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10)
  return `${prefix}-${rand}`.toUpperCase()
}

function qcStatusRank(status: ResultsQcFinding['status']): number {
  switch (status) {
    case 'fail':
      return 3
    case 'warn':
      return 2
    case 'pass':
      return 1
    default:
      return 0
  }
}

export function useResultsMode(args: {
  runId?: string | null
  eventGraphId?: string | null
  events: PlateEvent[]
  sourceLabwareId?: string
  targetLabwareId?: string
  selectedWells: string[]
  preferredReadEventId?: string | null
  preferredContextId?: string | null
}): UseResultsModeResult {
  const { runId, eventGraphId, events, sourceLabwareId, targetLabwareId, selectedWells, preferredReadEventId = null, preferredContextId = null } = args
  const [workspace, setWorkspace] = useState<RunWorkspaceResponse | null>(null)
  const [liveMeasurementContexts, setLiveMeasurementContexts] = useState<RunWorkspaceResponse['measurementContexts']>([])
  const [activeReadEventId, setActiveReadEventId] = useState<string | null>(null)
  const [activeContextId, setActiveContextId] = useState<string | null>(null)
  const [activeMeasurementId, setActiveMeasurementId] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<string | null>(null)
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [timepoint, setTimepoint] = useState('')
  const [rawDataPath, setRawDataPath] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [parserId, setParserId] = useState<string>('generic_csv')
  const [preview, setPreview] = useState<MeasurementParserValidationResult | null>(null)
  const [draftingEvidence, setDraftingEvidence] = useState(false)
  const [draftEvidenceMessage, setDraftEvidenceMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [validating, setValidating] = useState(false)
  const [ingesting, setIngesting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    const sourceRefs = Array.from(new Set([sourceLabwareId, targetLabwareId].filter((value): value is string => Boolean(value))))
    try {
      const [workspaceResult, liveContextsResult] = await Promise.allSettled([
        runId ? apiClient.getRunWorkspace(runId) : Promise.resolve(null),
        Promise.all(sourceRefs.map((sourceRef) => apiClient.listMeasurementContexts(sourceRef))),
      ])

      if (workspaceResult.status === 'fulfilled') {
        setWorkspace(workspaceResult.value)
      } else {
        setWorkspace(null)
      }

      const liveContextResponses = liveContextsResult.status === 'fulfilled'
        ? liveContextsResult.value
        : []
      const mergedLiveContexts = liveContextResponses
        .flatMap((response) => response.items)
        .filter((context) => !isBiologyContext(context))
        .reduce<RunWorkspaceResponse['measurementContexts']>((acc, context) => {
          if (acc.some((item) => item.recordId === context.id || item.payload.id === context.id)) return acc
          acc.push(toMeasurementContextEnvelope(context))
          return acc
        }, [])
      setLiveMeasurementContexts(mergedLiveContexts)

      if (workspaceResult.status === 'rejected' && liveContextsResult.status === 'rejected') {
        throw new Error('Failed to load run results and readout contexts')
      }
      if (liveContextsResult.status === 'rejected') {
        throw new Error('Failed to load readout contexts for the active plate')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load run results')
    } finally {
      setLoading(false)
    }
  }, [runId, sourceLabwareId, targetLabwareId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const readEvents = useMemo<ResultsReadEventSummary[]>(() => (
    events
      .filter((event) => event.event_type === 'read')
      .map((event) => {
        const details = event.details as ReadDetails
        return {
          eventId: event.eventId,
          label: eventLabel(event),
          instrument: details.instrument,
          labwareId: details.labwareId,
        }
      })
  ), [events])

  useEffect(() => {
    if (readEvents.length === 0) {
      setActiveReadEventId(null)
      return
    }
    if (preferredReadEventId && readEvents.some((event) => event.eventId === preferredReadEventId) && activeReadEventId !== preferredReadEventId) {
      setActiveReadEventId(preferredReadEventId)
      return
    }
    if (activeReadEventId && readEvents.some((event) => event.eventId === activeReadEventId)) return
    setActiveReadEventId(readEvents[0]?.eventId ?? null)
  }, [activeReadEventId, preferredReadEventId, readEvents])

  const measurementContexts = useMemo(() => {
    const mergedItems = [...(workspace?.measurementContexts ?? [])]
    for (const context of liveMeasurementContexts) {
      if (mergedItems.some((item) => item.recordId === context.recordId || item.payload.id === context.payload.id)) continue
      mergedItems.push(context)
    }
    const items = mergedItems.filter((context) => !isBiologyContext(context.payload))
    const labwareScoped = (!sourceLabwareId && !targetLabwareId)
      ? items
      : items.filter((context) => {
      const sourceRefId = context.payload.source_ref?.id
      return sourceRefId === sourceLabwareId || sourceRefId === targetLabwareId
    })
    if (!activeReadEventId) return labwareScoped
    const readScoped = labwareScoped.filter((context) => {
      const metadata = parseReadoutContextMetadata(context.payload)
      return metadata.readEventIds.length === 0 || metadata.readEventIds.includes(activeReadEventId)
    })
    return readScoped.length > 0 ? readScoped : labwareScoped
  }, [workspace?.measurementContexts, liveMeasurementContexts, sourceLabwareId, targetLabwareId, activeReadEventId])

  useEffect(() => {
    if (measurementContexts.length === 0) {
      setActiveContextId(null)
      return
    }
    const preferredContext = preferredContextId
      ? measurementContexts.find((context) => context.recordId === preferredContextId || context.payload.id === preferredContextId) ?? null
      : null
    if (preferredContext && activeContextId !== preferredContext.recordId) {
      setActiveContextId(preferredContext.recordId)
      return
    }
    if (activeContextId && measurementContexts.some((context) => context.recordId === activeContextId)) return
    setActiveContextId(measurementContexts[0]?.recordId ?? null)
  }, [activeContextId, measurementContexts, preferredContextId])

  const measurements = useMemo(() => {
    const items = workspace?.measurements ?? []
    return items.filter((measurement) => {
      const matchesRead = !activeReadEventId || measurement.payload.readEventRef === activeReadEventId
      const matchesContext = !activeContextId || measurement.payload.measurementContextRef?.id === activeContextId
      return matchesRead && matchesContext
    })
  }, [workspace?.measurements, activeContextId, activeReadEventId])

  useEffect(() => {
    if (measurements.length === 0) {
      setActiveMeasurementId(null)
      return
    }
    if (activeMeasurementId && measurements.some((measurement) => measurement.recordId === activeMeasurementId)) return
    setActiveMeasurementId(measurements[measurements.length - 1]?.recordId ?? null)
  }, [activeMeasurementId, measurements])

  const activeContext = useMemo(
    () => measurementContexts.find((context) => context.recordId === activeContextId) ?? null,
    [measurementContexts, activeContextId],
  )
  const activeContextLabel = activeContext?.payload.name || null

  const activeMeasurement = useMemo(
    () => measurements.find((measurement) => measurement.recordId === activeMeasurementId) ?? null,
    [measurements, activeMeasurementId],
  )
  const biologyAssignments = useMemo(
    () => {
      if (!workspace) return []
      const biologyContextIds = workspace.measurementContexts
        .filter((context) => isBiologyContext(context.payload))
        .map((context) => context.recordId)
      return biologyContextIds.flatMap((contextId) => workspace.wellRoleAssignmentsByContext?.[contextId] ?? [])
    },
    [workspace],
  )
  const activeAssignments = useMemo(() => {
    const scopedAssignments = activeContextId ? (workspace?.wellRoleAssignmentsByContext?.[activeContextId] ?? []) : []
    const combined = [...biologyAssignments, ...scopedAssignments]
    return combined.filter((assignment, index) => combined.findIndex((item) => item.recordId === assignment.recordId) === index)
  }, [activeContextId, biologyAssignments, workspace?.wellRoleAssignmentsByContext])
  const activeContextMetadata = useMemo(
    () => parseReadoutContextMetadata(activeContext?.payload || { tags: [] }),
    [activeContext],
  )
  useEffect(() => {
    const contextReadEventId = activeContextMetadata.readEventIds[0]
    if (!contextReadEventId) return
    if (contextReadEventId === activeReadEventId) return
    if (!readEvents.some((event) => event.eventId === contextReadEventId)) return
    setActiveReadEventId(contextReadEventId)
  }, [activeContextMetadata.readEventIds, activeReadEventId, readEvents])
  const parsedReadoutNotes = useMemo(
    () => parseReadoutNotes(activeContext?.payload.notes),
    [activeContext?.payload.notes],
  )

  const rowSource = useMemo(() => {
    if (preview?.data?.length) return readRows(preview)
    return readRows(activeMeasurement?.payload ?? null)
  }, [activeMeasurement?.payload, preview])

  const availableMetrics = useMemo(
    () => Array.from(new Set(rowSource.map((row) => row.metric))),
    [rowSource],
  )
  const availableChannels = useMemo(
    () => Array.from(new Set(rowSource.map((row) => row.channelId).filter((value): value is string => Boolean(value)))),
    [rowSource],
  )
  const scopedRows = useMemo(
    () => rowSource.filter((row) =>
      (!activeMetric || row.metric === activeMetric) && (!activeChannelId || row.channelId === activeChannelId),
    ),
    [activeChannelId, activeMetric, rowSource],
  )
  const valuesByWell = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const row of scopedRows) {
      const current = map.get(row.well) ?? []
      current.push(row.value)
      map.set(row.well, current)
    }
    return map
  }, [scopedRows])
  const observedMax = useMemo(
    () => scopedRows.length > 0 ? Math.max(...scopedRows.map((row) => row.value)) : null,
    [scopedRows],
  )
  const baselineMean = useMemo(() => {
    const priorityRoleTypes = ['vehicle_control', 'negative_control', 'blank', 'reference']
    for (const roleType of priorityRoleTypes) {
      const wells = activeAssignments
        .filter((assignment) => assignment.payload.role_type === roleType)
        .flatMap((assignment) => assignment.payload.subject_refs.map((subject) => splitWellRef(subject.id)).filter(Boolean) as string[])
      const values = wells.flatMap((well) => valuesByWell.get(well) ?? [])
      const mean = average(values)
      if (mean !== null) return mean
    }
    return observedMax !== null ? Math.min(...scopedRows.map((row) => row.value)) : null
  }, [activeAssignments, observedMax, scopedRows, valuesByWell])

  useEffect(() => {
    if (!availableMetrics.length) {
      setActiveMetric(null)
      return
    }
    if (activeMetric && availableMetrics.includes(activeMetric)) return
    setActiveMetric(availableMetrics[0] ?? null)
  }, [activeMetric, availableMetrics])

  useEffect(() => {
    if (!availableChannels.length) {
      setActiveChannelId(null)
      return
    }
    if (activeChannelId && availableChannels.includes(activeChannelId)) return
    setActiveChannelId(availableChannels[0] ?? null)
  }, [activeChannelId, availableChannels])

  const validate = useCallback(async () => {
    if (!rawDataPath.trim()) {
      setError('Enter a repository path for the raw result file.')
      return
    }
    setValidating(true)
    setError(null)
    try {
      const response = await apiClient.validateMeasurementParser({
        parserId,
        path: rawDataPath.trim(),
      })
      setPreview(response.result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to validate parser output')
    } finally {
      setValidating(false)
    }
  }, [parserId, rawDataPath])

  const uploadFile = useCallback(async (file: File) => {
    setUploading(true)
    setError(null)
    try {
      const buffer = await file.arrayBuffer()
      const bytes = new Uint8Array(buffer)
      let binary = ''
      const chunkSize = 0x8000
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
      }
      const contentBase64 = btoa(binary)
      const response = await apiClient.uploadRawMeasurementFile({
        ...(runId ? { runId } : {}),
        fileName: file.name,
        contentBase64,
      })
      setRawDataPath(response.path)
      setUploadedFileName(response.fileName)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload measurement file')
    } finally {
      setUploading(false)
    }
  }, [runId])

  const ingest = useCallback(async () => {
    if (!rawDataPath.trim()) {
      setError('Enter a repository path for the raw result file.')
      return
    }
    if (!runId || !eventGraphId) {
      setError('Run context is missing.')
      return
    }
    setIngesting(true)
    setError(null)
    try {
      const measurementContext = activeContext
      const measurementLabwareId = measurementContext?.payload.source_ref?.id || targetLabwareId || sourceLabwareId
      const response = await apiClient.ingestMeasurement({
        ...(measurementContext?.payload.instrument_ref ? { instrumentRef: measurementContext.payload.instrument_ref } : {}),
        ...(measurementLabwareId ? { labwareInstanceRef: { kind: 'record', id: measurementLabwareId, type: 'labware' } } : {}),
        eventGraphRef: { kind: 'record', id: eventGraphId, type: 'event-graph' },
        ...(measurementContext ? { measurementContextRef: { kind: 'record', id: measurementContext.recordId, type: 'measurement-context', label: measurementContext.payload.name } } : {}),
        ...(activeReadEventId ? { readEventRef: activeReadEventId } : {}),
        ...(timepoint.trim() ? { timepoint: timepoint.trim() } : {}),
        parserId,
        rawData: { path: rawDataPath.trim() },
      })
      if (!response.success || !response.recordId) {
        throw new Error('Measurement ingest did not return a record id.')
      }
      await refresh()
      setActiveMeasurementId(response.recordId)
      setPreview(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to ingest measurement')
    } finally {
      setIngesting(false)
    }
  }, [activeContext, activeReadEventId, eventGraphId, parserId, rawDataPath, refresh, runId, sourceLabwareId, targetLabwareId, timepoint])

  const activeLabwareId = measurementLabwareId(activeMeasurement, activeContext)
  const sourceWellContents = useMemo(() => {
    if (activeLabwareId && activeLabwareId === sourceLabwareId) {
      return buildWellMap(rowSource, activeMetric, activeChannelId)
    }
    return new Map<WellId, { color?: string }>()
  }, [activeChannelId, activeLabwareId, activeMetric, rowSource, sourceLabwareId])

  const targetWellContents = useMemo(() => {
    if (activeLabwareId && activeLabwareId === targetLabwareId) {
      return buildWellMap(rowSource, activeMetric, activeChannelId)
    }
    if (!activeLabwareId && targetLabwareId) {
      return buildWellMap(rowSource, activeMetric, activeChannelId)
    }
    return new Map<WellId, { color?: string }>()
  }, [activeChannelId, activeLabwareId, activeMetric, rowSource, targetLabwareId])

  const selectedWellDetails = useMemo(() => {
    const filterSet = new Set(selectedWells)
    const scoped = filterSet.size > 0
      ? rowSource.filter((row) => filterSet.has(row.well))
      : rowSource
    return scoped.filter((row) =>
      (!activeMetric || row.metric === activeMetric) && (!activeChannelId || row.channelId === activeChannelId),
    )
  }, [activeChannelId, activeMetric, rowSource, selectedWells])

  const qcFindings = useMemo<ResultsQcFinding[]>(() => {
    if (!activeContext) return []
    const findings: ResultsQcFinding[] = []
    const selectedQcIds = activeContextMetadata.qcControlIds
    for (const qcId of selectedQcIds) {
      let roleTypes: string[] = []
      if (qcId === 'blank_background' || qcId === 'blank_injection') roleTypes = ['blank']
      if (qcId === 'no_dye_control') roleTypes = ['blank', 'negative_control']
      if (qcId === 'no_template_control') roleTypes = ['no_template_control']
      if (qcId === 'housekeeping_control') roleTypes = ['housekeeping_control', 'reference']
      if (qcId === 'internal_standard') roleTypes = ['internal_standard', 'standard', 'qc_sample']
      const matchedAssignments = activeAssignments.filter((assignment) => roleTypes.includes(assignment.payload.role_type))
      if (matchedAssignments.length === 0) {
        findings.push({
          id: `qc-${qcId}`,
          title: qcId.replace(/_/g, ' '),
          status: 'warn',
          details: 'No wells are assigned to this QC control in the active readout context.',
        })
        continue
      }
      const values = matchedAssignments.flatMap((assignment) =>
        assignment.payload.subject_refs.flatMap((subject) => {
          const well = splitWellRef(subject.id)
          return well ? (valuesByWell.get(well) ?? []) : []
        }),
      )
      if (values.length === 0) {
        findings.push({
          id: `qc-${qcId}`,
          title: qcId.replace(/_/g, ' '),
          status: 'warn',
          details: 'QC wells are assigned, but no values are available for the current metric/channel filter.',
          roleType: matchedAssignments[0]?.payload.role_type,
        })
        continue
      }
      const mean = average(values) ?? 0
      let status: ResultsQcFinding['status'] = 'info'
      let details = `Observed mean ${mean.toFixed(3)} across ${values.length} value${values.length === 1 ? '' : 's'}.`
      if (qcId === 'blank_background' || qcId === 'blank_injection' || qcId === 'no_dye_control' || qcId === 'no_template_control') {
        const max = observedMax ?? mean
        const ratio = max === 0 ? 0 : mean / max
        status = ratio <= 0.2 ? 'pass' : ratio <= 0.5 ? 'warn' : 'fail'
        details = `Low-signal QC observed mean ${mean.toFixed(3)} (${(ratio * 100).toFixed(0)}% of max signal ${max.toFixed(3)}).`
      } else if (qcId === 'housekeeping_control' || qcId === 'internal_standard') {
        const avg = average(values) ?? 0
        const variance = values.length > 1
          ? values.reduce((sum, value) => sum + ((value - avg) ** 2), 0) / values.length
          : 0
        const stdev = Math.sqrt(variance)
        const cv = avg === 0 ? 0 : stdev / avg
        status = values.length < 2 ? 'info' : cv <= 0.2 ? 'pass' : cv <= 0.35 ? 'warn' : 'fail'
        details = values.length < 2
          ? `Observed mean ${avg.toFixed(3)}. Add replicate QC wells for a stability check.`
          : `Observed mean ${avg.toFixed(3)} with CV ${(cv * 100).toFixed(1)}% across ${values.length} values.`
      }
      findings.push({
        id: `qc-${qcId}`,
        title: qcId.replace(/_/g, ' '),
        status,
        details,
        roleType: matchedAssignments[0]?.payload.role_type,
      })
    }
    return findings.sort((a, b) => qcStatusRank(b.status) - qcStatusRank(a.status))
  }, [activeAssignments, activeContext, activeContextMetadata.qcControlIds, observedMax, valuesByWell])

  const expectationChecks = useMemo<ResultsExpectationCheck[]>(() => {
    if (!activeContext) return []
    const checks: ResultsExpectationCheck[] = []
    for (const assignment of activeAssignments) {
      const expected = assignment.payload.expected_behavior
      if (!expected || expected === 'none') continue
      const values = assignment.payload.subject_refs.flatMap((subject) => {
        const well = splitWellRef(subject.id)
        return well ? (valuesByWell.get(well) ?? []) : []
      })
      if (values.length === 0) {
        checks.push({
          id: `expect-${assignment.recordId}`,
          label: assignment.payload.role_type.replace(/_/g, ' '),
          status: 'warn',
          expectedBehavior: expected,
          details: 'No values available for the current metric/channel filter.',
        })
        continue
      }
      const mean = average(values) ?? 0
      const baseline = baselineMean ?? mean
      let status: ResultsExpectationCheck['status'] = 'info'
      if (expected === 'increase') status = mean > baseline * 1.15 ? 'pass' : mean > baseline * 1.02 ? 'warn' : 'fail'
      if (expected === 'decrease') status = mean < baseline * 0.85 ? 'pass' : mean < baseline * 0.98 ? 'warn' : 'fail'
      if (expected === 'present') status = mean > baseline * 1.05 ? 'pass' : 'warn'
      if (expected === 'absent') status = mean <= baseline * 1.1 ? 'pass' : 'fail'
      if (expected === 'stable') status = Math.abs(mean - baseline) <= Math.max(Math.abs(baseline) * 0.15, 1e-9) ? 'pass' : 'warn'
      if (expected === 'range') status = 'info'
      checks.push({
        id: `expect-${assignment.recordId}`,
        label: assignment.payload.role_type.replace(/_/g, ' '),
        status,
        expectedBehavior: expected,
        details: `Observed mean ${mean.toFixed(3)}${baselineMean !== null ? ` against baseline ${baseline.toFixed(3)}` : ''}.`,
      })
    }
    return checks.sort((a, b) => qcStatusRank(b.status) - qcStatusRank(a.status))
  }, [activeAssignments, activeContext, baselineMean, valuesByWell])

  const measurementSummary = preview
    ? `${preview.rows} rows parsed from ${preview.path}`
    : activeMeasurement
      ? `${activeMeasurement.payload.data?.length ?? 0} rows in ${activeMeasurement.recordId}`
      : 'No validated or published measurement selected.'

  const draftEvidence = useCallback(async () => {
    if (!activeMeasurement || !activeContext) {
      setDraftEvidenceMessage('Select a published measurement and readout context first.')
      return
    }
    setDraftingEvidence(true)
    setDraftEvidenceMessage(null)
    try {
      const claimId = makeId('CLM')
      const assertionId = makeId('ASN')
      const evidenceId = makeId('EVD')
      const readoutRef = activeContext.payload.readout_def_refs[0] || { kind: 'record', id: activeContext.recordId, type: 'measurement-context', label: activeContext.payload.name }
      const measurementRef = { kind: 'record' as const, id: activeMeasurement.recordId, type: 'measurement', label: activeMeasurement.recordId }
      const contextRef = { kind: 'record' as const, id: activeContext.recordId, type: 'measurement-context', label: activeContext.payload.name }
      const predicateRef = { kind: 'ontology' as const, id: 'computable-lab:supports-readout', label: 'supports readout' }
      const claimStatement = `${activeMeasurement.recordId} supports ${readoutRef.label || readoutRef.id} in ${activeContext.payload.name}`
      const claim = {
        kind: 'claim',
        id: claimId,
        statement: claimStatement,
        subject: measurementRef,
        predicate: predicateRef,
        object: readoutRef,
        title: claimStatement,
      }
      const assertionStatement = `${claimStatement}. QC: ${qcFindings.length ? qcFindings.map((finding) => `${finding.title}=${finding.status}`).join('; ') : 'no explicit QC findings'}. Expectations: ${expectationChecks.length ? expectationChecks.map((check) => `${check.label}=${check.status}`).join('; ') : 'no explicit expectation checks'}.`
      const assertion = {
        kind: 'assertion',
        id: assertionId,
        claim_ref: { kind: 'record', id: claimId, type: 'claim' },
        statement: assertionStatement,
        scope: {},
        confidence: qcFindings.some((finding) => finding.status === 'fail') ? 2 : 3,
        evidence_refs: [{ kind: 'record', id: evidenceId, type: 'evidence' }],
      }
      const evidence = {
        kind: 'evidence',
        id: evidenceId,
        supports: [{ kind: 'record', id: assertionId, type: 'assertion' }],
        title: `Evidence draft for ${activeMeasurement.recordId}`,
        description: parsedReadoutNotes.expectationNotes || undefined,
        sources: [
          { type: 'result', ref: measurementRef, notes: measurementSummary },
          { type: 'context', ref: contextRef, notes: `Readout context with QC controls: ${summarizeQcControls(activeContextMetadata.qcControlIds)}` },
          ...(eventGraphId ? [{ type: 'event_graph' as const, ref: { kind: 'record' as const, id: eventGraphId, type: 'event-graph' } }] : []),
          ...(activeReadEventId ? [{ type: 'event' as const, ref: { kind: 'record' as const, id: activeReadEventId, type: 'event' } }] : []),
        ],
        quality: {
          origin: 'results-mode-draft',
          qcFindings,
          expectationChecks,
          qcNotes: parsedReadoutNotes.qcNotes || undefined,
          expectationNotes: parsedReadoutNotes.expectationNotes || undefined,
        },
      }
      const result = await apiClient.saveKnowledgeRecords([
        { id: claimId, record: claim },
        { id: assertionId, record: assertion },
        { id: evidenceId, record: evidence },
      ])
      if (!result.success) {
        throw new Error(result.failed[0]?.error || 'Failed to save evidence draft')
      }
      setDraftEvidenceMessage(`Saved draft claim ${claimId}, assertion ${assertionId}, and evidence ${evidenceId}.`)
      await refresh()
    } catch (err) {
      setDraftEvidenceMessage(err instanceof Error ? err.message : 'Failed to draft evidence')
    } finally {
      setDraftingEvidence(false)
    }
  }, [
    activeContext,
    activeContextMetadata.qcControlIds,
    activeMeasurement,
    activeReadEventId,
    eventGraphId,
    expectationChecks,
    measurementSummary,
    parsedReadoutNotes.expectationNotes,
    parsedReadoutNotes.qcNotes,
    qcFindings,
    refresh,
  ])

  return {
    parserOptions: PARSER_OPTIONS.map((option) => ({ ...option })),
    readEvents,
    activeReadEventId,
    setActiveReadEventId,
    measurementContexts,
    activeContextId,
    setActiveContextId,
    activeContext,
    activeContextLabel,
    measurements,
    activeMeasurementId,
    setActiveMeasurementId,
    activeMeasurement,
    availableMetrics,
    activeMetric,
    setActiveMetric,
    availableChannels,
    activeChannelId,
    setActiveChannelId,
    timepoint,
    setTimepoint,
    rawDataPath,
    setRawDataPath,
    uploadFile,
    uploading,
    uploadedFileName,
    parserId,
    setParserId,
    preview,
    previewRows: preview?.preview ? readRows({ ...preview, data: preview.preview }) : [],
    activeRows: scopedRows,
    selectedWellDetails,
    sourceWellContents,
    targetWellContents,
    measurementSummary,
    qcFindings,
    expectationChecks,
    readoutExpectationNotes: parsedReadoutNotes.expectationNotes,
    readoutQcNotes: parsedReadoutNotes.qcNotes,
    draftingEvidence,
    draftEvidenceMessage,
    loading,
    validating,
    ingesting,
    error,
    refresh,
    validate,
    ingest,
    draftEvidence,
  }
}
