import { useEffect, useMemo, useState } from 'react'
import { apiClient, type AssayDefinition, type InstrumentDefinition, type MaterialRefInput, type MeasurementContextRecord, type ReadoutDefinition } from '../../shared/api/client'
import { buildReadoutContextTags, buildReadoutNotes, parseReadoutNotes, summarizeQcControls } from '../lib/readoutMetadata'

export interface MeasurementSetupPanelProps {
  sourceRef: MaterialRefInput
  selectedWellCount: number
  selectedWells?: string[]
  onCreated: (measurementContextId: string) => void
  activeContext?: MeasurementContextRecord | null
  readEvents?: Array<{ eventId: string; label: string }>
  activeReadEventId?: string | null
  onReadEventChange?: (readEventId: string | null) => void
  suggestedInstrumentType?: InstrumentDefinition['instrument_type']
  qcOptions?: Array<{ id: string; label: string; description: string }>
  onSelectedQcControlsChange?: (ids: string[]) => void
}

function toRecordRef(id: string, type: string, label?: string): MaterialRefInput {
  return { kind: 'record', id, type, ...(label ? { label } : {}) }
}

export function MeasurementSetupPanel({
  sourceRef,
  selectedWellCount,
  selectedWells = [],
  onCreated,
  activeContext = null,
  readEvents = [],
  activeReadEventId = null,
  onReadEventChange,
  suggestedInstrumentType = 'plate_reader',
  qcOptions = [],
  onSelectedQcControlsChange,
}: MeasurementSetupPanelProps) {
  const [instruments, setInstruments] = useState<InstrumentDefinition[]>([])
  const [assays, setAssays] = useState<AssayDefinition[]>([])
  const [readouts, setReadouts] = useState<ReadoutDefinition[]>([])
  const [instrumentType, setInstrumentType] = useState<InstrumentDefinition['instrument_type']>('plate_reader')
  const [instrumentId, setInstrumentId] = useState('')
  const [assayId, setAssayId] = useState('')
  const [readoutIds, setReadoutIds] = useState<string[]>([])
  const [seriesId, setSeriesId] = useState('')
  const [contextName, setContextName] = useState('')
  const [generalNotes, setGeneralNotes] = useState('')
  const [expectationNotes, setExpectationNotes] = useState('')
  const [qcNotes, setQcNotes] = useState('')
  const [qcAssignments, setQcAssignments] = useState<Record<string, string[]>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [instrumentResponse, assayResponse, readoutResponse] = await Promise.all([
        apiClient.listSemanticsInstruments(),
        apiClient.listSemanticsAssays(),
        apiClient.listSemanticsReadouts(),
      ])
      setInstruments(instrumentResponse.items)
      setAssays(assayResponse.items)
      setReadouts(readoutResponse.items)
    })().catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to load measurement setup options')
    })
  }, [])

  useEffect(() => {
    if (activeContext) return
    setInstrumentType(suggestedInstrumentType)
  }, [activeContext, suggestedInstrumentType])

  const filteredInstruments = useMemo(
    () => instruments.filter((item) => item.instrument_type === instrumentType),
    [instruments, instrumentType],
  )
  const filteredReadouts = useMemo(
    () => readouts.filter((item) => item.instrument_type === instrumentType),
    [readouts, instrumentType],
  )
  const filteredAssays = useMemo(
    () => assays.filter((item) => item.instrument_type === instrumentType),
    [assays, instrumentType],
  )

  useEffect(() => {
    if (!filteredInstruments.some((item) => item.id === instrumentId)) {
      setInstrumentId(filteredInstruments[0]?.id || '')
    }
  }, [filteredInstruments, instrumentId])

  const selectedAssay = useMemo(() => assays.find((item) => item.id === assayId) || null, [assays, assayId])
  const selectedReadEvent = useMemo(
    () => readEvents.find((item) => item.eventId === activeReadEventId) || null,
    [readEvents, activeReadEventId],
  )

  useEffect(() => {
    if (!activeContext) {
      setContextName('')
      setSeriesId('')
      setGeneralNotes('')
      setExpectationNotes('')
      setQcNotes('')
      setQcAssignments({})
      return
    }
    const parsedNotes = parseReadoutNotes(activeContext.notes)
    const activeInstrument = instruments.find((item) => item.id === activeContext.instrument_ref.id)
    setContextName(activeContext.name || '')
    setSeriesId(activeContext.series_id || '')
    setGeneralNotes(parsedNotes.generalNotes)
    setExpectationNotes(parsedNotes.expectationNotes)
    setQcNotes(parsedNotes.qcNotes)
    setQcAssignments(parsedNotes.qcAssignments)
    if (activeInstrument) {
      setInstrumentType(activeInstrument.instrument_type)
    }
    setInstrumentId(activeContext.instrument_ref.id)
    setAssayId(activeContext.assay_def_ref?.id || '')
    setReadoutIds(activeContext.readout_def_refs.map((item) => item.id))
  }, [activeContext, instruments])

  useEffect(() => {
    if (!selectedAssay) return
    if (selectedAssay.instrument_type !== instrumentType) {
      setInstrumentType(selectedAssay.instrument_type)
    }
    setReadoutIds(selectedAssay.readout_def_refs.map((ref) => ref.id))
  }, [selectedAssay])

  useEffect(() => {
    setReadoutIds((current) => current.filter((id) => filteredReadouts.some((item) => item.id === id)))
  }, [filteredReadouts])

  const toggleReadout = (id: string) => {
    setReadoutIds((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }

  const effectiveQcControlIds = useMemo(
    () => Object.entries(qcAssignments).filter(([, wells]) => wells.length > 0).map(([id]) => id),
    [qcAssignments],
  )

  const assignSelectedWellsToQc = (qcId: string) => {
    if (selectedWells.length === 0) return
    const nextAssignments = {
      ...qcAssignments,
      [qcId]: Array.from(new Set(selectedWells)),
    }
    setQcAssignments(nextAssignments)
    onSelectedQcControlsChange?.(Object.keys(nextAssignments).filter((id) => (nextAssignments[id] || []).length > 0))
  }

  const clearQcAssignment = (qcId: string) => {
    const nextAssignments = {
      ...qcAssignments,
      [qcId]: [],
    }
    setQcAssignments(nextAssignments)
    onSelectedQcControlsChange?.(Object.keys(nextAssignments).filter((id) => (nextAssignments[id] || []).length > 0))
  }

  const handleSubmit = async () => {
    const instrument = instruments.find((item) => item.id === instrumentId)
    const selectedReadouts = readouts.filter((item) => readoutIds.includes(item.id))
    if (!instrument || selectedReadouts.length === 0) {
      setError('Instrument and at least one readout are required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const generatedName = [
        selectedReadEvent?.label,
        selectedAssay?.name || selectedReadouts.map((item) => item.name).join(', '),
      ].filter(Boolean).join(' · ')
      const qcSummary = summarizeQcControls(effectiveQcControlIds)
      const notesValue = buildReadoutNotes({
        generalNotes: [
          generalNotes.trim() || null,
          selectedReadEvent ? `Read event: ${selectedReadEvent.label}` : null,
          effectiveQcControlIds.length > 0 ? `QC controls: ${qcSummary}` : null,
        ].filter(Boolean).join('\n'),
        expectationNotes,
        qcNotes,
        qcAssignments,
      })
      const payload = {
        kind: 'measurement-context' as const,
        id: activeContext?.id || undefined,
        name: contextName.trim() || generatedName || undefined,
        title: contextName.trim() || generatedName || undefined,
        source_ref: sourceRef,
        instrument_ref: toRecordRef(instrument.id, 'instrument-definition', instrument.name),
        assay_def_ref: selectedAssay ? toRecordRef(selectedAssay.id, 'assay-definition', selectedAssay.name) : undefined,
        readout_def_refs: selectedReadouts.map((item) => toRecordRef(item.id, 'readout-definition', item.name)),
        series_id: seriesId.trim() || undefined,
        notes: notesValue,
        tags: buildReadoutContextTags({
          existingTags: activeContext?.tags,
          readEventId: activeReadEventId,
          qcControlIds: effectiveQcControlIds,
        }),
      }
      if (activeContext) {
        await apiClient.updateRecord(activeContext.id, payload)
        onCreated(activeContext.id)
      } else {
        const response = await apiClient.createMeasurementContext({
          name: payload.name,
          sourceRef,
          instrumentRef: payload.instrument_ref,
          assayDefRef: payload.assay_def_ref,
          readoutDefRefs: payload.readout_def_refs,
          seriesId: payload.series_id,
          notes: payload.notes,
          tags: payload.tags,
        })
        onCreated(response.measurementContextId)
      }
      setSeriesId('')
      setContextName('')
      setGeneralNotes('')
      setExpectationNotes('')
      setQcNotes('')
      setQcAssignments({})
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${activeContext ? 'update' : 'create'} measurement context`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-slate-900">Readout Setup</h3>
        <p className="mt-1 text-xs text-slate-600">
          Define how this plate will be read by an instrument. One biological plate can support many readout contexts.
          {selectedWellCount > 0 ? ` ${selectedWellCount} well${selectedWellCount === 1 ? '' : 's'} currently selected.` : ''}
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-xs font-medium text-slate-700">
          Context Name
          <input
            value={contextName}
            onChange={(e) => setContextName(e.target.value)}
            placeholder="Optional readout context name"
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
          />
        </label>

        {readEvents.length > 0 ? (
          <label className="text-xs font-medium text-slate-700">
            Planned Read Event
            <select
              value={activeReadEventId || ''}
              onChange={(e) => onReadEventChange?.(e.target.value || null)}
              className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            >
              <option value="">Any planned read event</option>
              {readEvents.map((event) => (
                <option key={event.eventId} value={event.eventId}>{event.label}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="text-xs font-medium text-slate-700">
          Instrument Type
          <select value={instrumentType} onChange={(e) => setInstrumentType(e.target.value as InstrumentDefinition['instrument_type'])} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="plate_reader">Plate Reader</option>
            <option value="qpcr">qPCR</option>
            <option value="gc_ms">GC-MS</option>
            <option value="lc_ms">LC-MS</option>
            <option value="microscopy">Microscopy</option>
            <option value="other">Other</option>
          </select>
        </label>

        <label className="text-xs font-medium text-slate-700">
          Assay
          <select value={assayId} onChange={(e) => setAssayId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            <option value="">Custom measurement</option>
            {filteredAssays.map((assay) => (
              <option key={assay.id} value={assay.id}>{assay.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-slate-700">
          Instrument
          <select value={instrumentId} onChange={(e) => setInstrumentId(e.target.value)} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm">
            {filteredInstruments.map((instrument) => (
              <option key={instrument.id} value={instrument.id}>{instrument.name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs font-medium text-slate-700">
          Series ID
          <input value={seriesId} onChange={(e) => setSeriesId(e.target.value)} placeholder="Optional repeated-read series" className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-slate-700">Readouts</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {filteredReadouts.map((readout) => {
            const active = readoutIds.includes(readout.id)
            return (
              <button
                key={readout.id}
                type="button"
                onClick={() => toggleReadout(readout.id)}
                className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition-colors ${
                  active ? 'bg-blue-600 text-white ring-blue-600' : 'bg-white text-slate-700 ring-slate-300 hover:bg-slate-50'
                }`}
              >
                {readout.name}
              </button>
            )
          })}
        </div>
      </div>

      {qcOptions.length > 0 ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-medium text-slate-700">QC Control Wells</div>
          <div className="mt-1 text-[11px] text-slate-500">
            Select wells on the plate, then assign them as assay-specific controls here.
          </div>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {qcOptions.map((option) => {
              const assignedWells = qcAssignments[option.id] || []
              return (
                <div key={option.id} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  <strong>{option.label}</strong>
                  <span className="mt-1 block text-slate-500">{option.description}</span>
                  <div className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] text-slate-600">
                    {assignedWells.length > 0 ? `Assigned wells: ${assignedWells.join(', ')}` : 'No wells assigned yet'}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => assignSelectedWellsToQc(option.id)}
                      disabled={selectedWells.length === 0}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Assign Selected Wells
                    </button>
                    <button
                      type="button"
                      onClick={() => clearQcAssignment(option.id)}
                      disabled={assignedWells.length === 0}
                      className="rounded-md border border-slate-300 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {selectedAssay?.panel_targets?.length ? (
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-medium text-slate-700">Panel Targets</div>
          <div className="mt-2 space-y-1 text-xs text-slate-600">
            {selectedAssay.panel_targets.map((target) => (
              <div key={`${target.name}-${target.readout_def_ref.id}`}>
                <span className="font-medium text-slate-800">{target.name}</span>
                {' · '}
                {target.readout_def_ref.label || target.readout_def_ref.id}
                {' · '}
                {target.panel_role.replace(/_/g, ' ')}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <label className="mt-3 block text-xs font-medium text-slate-700">
        Readout Notes
        <textarea value={generalNotes} onChange={(e) => setGeneralNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm" placeholder="Optional assay setup note" />
      </label>

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <label className="block text-xs font-medium text-slate-700">
          Expected Signal Behavior
          <textarea
            value={expectationNotes}
            onChange={(e) => setExpectationNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Describe how positive controls, vehicle controls, or treatment groups should behave in this readout."
          />
        </label>
        <label className="block text-xs font-medium text-slate-700">
          QC Notes
          <textarea
            value={qcNotes}
            onChange={(e) => setQcNotes(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
            placeholder="Document blanks, no-dye controls, internal standards, or other assay-specific QC expectations."
          />
        </label>
      </div>

      {error ? <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => void handleSubmit()} disabled={saving} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {saving ? 'Saving...' : activeContext ? 'Update Readout Context' : 'Create Readout Context'}
        </button>
      </div>
    </div>
  )
}
