import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  apiClient,
  type InstrumentDefinition,
  type MeasurementContextRecord,
} from '../../shared/api/client'
import type { PlateEvent, ReadDetails } from '../../types/events'
import {
  READOUT_QC_OPTIONS,
  defaultQcControlsForInstrumentType,
  inferInstrumentTypeFromRead,
  isBiologyContext,
  parseReadoutContextMetadata,
} from '../lib/readoutMetadata'

export interface ReadoutEventSummary {
  eventId: string
  label: string
  assayRef?: string
  instrument?: string
  labwareId?: string
  instrumentType: InstrumentDefinition['instrument_type']
}

export interface UseReadoutsModeResult {
  contexts: MeasurementContextRecord[]
  activeContextId: string | null
  setActiveContextId: (contextId: string | null) => void
  activeContext: MeasurementContextRecord | null
  activeContextMetadata: { readEventIds: string[]; qcControlIds: string[] }
  readEvents: ReadoutEventSummary[]
  activeReadEventId: string | null
  setActiveReadEventId: (eventId: string | null) => void
  activeReadEvent: ReadoutEventSummary | null
  suggestedInstrumentType: InstrumentDefinition['instrument_type']
  qcOptions: typeof READOUT_QC_OPTIONS
  selectedQcControlIds: string[]
  setSelectedQcControlIds: (ids: string[]) => void
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

function eventLabel(event: PlateEvent): string {
  const details = event.details as ReadDetails
  return [event.eventId, details.assay_ref, details.instrument].filter(Boolean).join(' · ')
}

function contextMatchesReadEvent(context: MeasurementContextRecord, readEventId: string | null): boolean {
  if (!readEventId) return true
  const metadata = parseReadoutContextMetadata(context)
  return metadata.readEventIds.length === 0 || metadata.readEventIds.includes(readEventId)
}

export function useReadoutsMode(args: {
  sourceLabwareId?: string
  events: PlateEvent[]
}): UseReadoutsModeResult {
  const { sourceLabwareId, events } = args
  const [contexts, setContexts] = useState<MeasurementContextRecord[]>([])
  const [activeContextId, setActiveContextId] = useState<string | null>(null)
  const [activeReadEventId, setActiveReadEventId] = useState<string | null>(null)
  const [selectedQcControlIds, setSelectedQcControlIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!sourceLabwareId) {
      setContexts([])
      setActiveContextId(null)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const contextResponse = await apiClient.listMeasurementContexts(sourceLabwareId)
      setContexts(contextResponse.items.filter((context) => !isBiologyContext(context)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load readout contexts')
    } finally {
      setLoading(false)
    }
  }, [sourceLabwareId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const readEvents = useMemo<ReadoutEventSummary[]>(() => (
    events
      .filter((event) => event.event_type === 'read')
      .map((event) => {
        const details = event.details as ReadDetails
        return {
          eventId: event.eventId,
          label: eventLabel(event),
          assayRef: details.assay_ref,
          instrument: details.instrument,
          labwareId: details.labwareId,
          instrumentType: inferInstrumentTypeFromRead({
            instrument: details.instrument,
            assayRef: details.assay_ref,
          }),
        }
      })
  ), [events])

  useEffect(() => {
    if (readEvents.length === 0) {
      setActiveReadEventId(null)
      return
    }
    if (activeReadEventId && readEvents.some((event) => event.eventId === activeReadEventId)) return
    setActiveReadEventId(readEvents[0]?.eventId ?? null)
  }, [activeReadEventId, readEvents])

  const visibleContexts = useMemo(
    () => contexts.filter((context) => contextMatchesReadEvent(context, activeReadEventId)),
    [contexts, activeReadEventId],
  )

  useEffect(() => {
    if (visibleContexts.length === 0) {
      setActiveContextId(null)
      return
    }
    if (activeContextId && visibleContexts.some((context) => context.id === activeContextId)) return
    const exactMatch = activeReadEventId
      ? visibleContexts.find((context) => parseReadoutContextMetadata(context).readEventIds.includes(activeReadEventId))
      : null
    setActiveContextId(exactMatch?.id || visibleContexts[0]?.id || null)
  }, [activeContextId, activeReadEventId, visibleContexts])

  const activeContext = useMemo(
    () => visibleContexts.find((context) => context.id === activeContextId) || null,
    [visibleContexts, activeContextId],
  )
  const activeContextMetadata = useMemo(
    () => parseReadoutContextMetadata(activeContext || { tags: [] }),
    [activeContext],
  )
  const activeReadEvent = useMemo(
    () => readEvents.find((event) => event.eventId === activeReadEventId) || null,
    [readEvents, activeReadEventId],
  )
  const suggestedInstrumentType = activeReadEvent?.instrumentType || 'plate_reader'

  useEffect(() => {
    if (activeContextMetadata.readEventIds.length === 0) return
    const preferredReadEventId = activeContextMetadata.readEventIds[0]
    if (!preferredReadEventId || preferredReadEventId === activeReadEventId) return
    if (!readEvents.some((event) => event.eventId === preferredReadEventId)) return
    setActiveReadEventId(preferredReadEventId)
  }, [activeContextMetadata.readEventIds, activeReadEventId, readEvents])

  useEffect(() => {
    if (activeContext) {
      setSelectedQcControlIds(activeContextMetadata.qcControlIds)
      return
    }
    setSelectedQcControlIds(defaultQcControlsForInstrumentType(suggestedInstrumentType))
  }, [activeContext, activeContextMetadata.qcControlIds, suggestedInstrumentType])

  return {
    contexts: visibleContexts,
    activeContextId,
    setActiveContextId,
    activeContext,
    activeContextMetadata,
    readEvents,
    activeReadEventId,
    setActiveReadEventId,
    activeReadEvent,
    suggestedInstrumentType,
    qcOptions: READOUT_QC_OPTIONS,
    selectedQcControlIds,
    setSelectedQcControlIds,
    loading,
    error,
    refresh,
  }
}
