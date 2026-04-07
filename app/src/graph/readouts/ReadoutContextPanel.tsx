import type { MaterialRefInput, MeasurementContextRecord } from '../../shared/api/client'
import { parseReadoutNotes, summarizeQcControls } from '../lib/readoutMetadata'
import { MeasurementContextList } from '../semantic/MeasurementContextList'
import { MeasurementSetupPanel } from '../semantic/MeasurementSetupPanel'

interface ReadoutContextPanelProps {
  sourceRef: MaterialRefInput
  selectedWellCount: number
  selectedWells: string[]
  readEvents: Array<{ eventId: string; label: string }>
  activeReadEventId: string | null
  activeReadEventLabel?: string | null
  suggestedInstrumentType: 'plate_reader' | 'qpcr' | 'gc_ms' | 'lc_ms' | 'microscopy' | 'other'
  onReadEventChange: (readEventId: string | null) => void
  qcOptions: Array<{ id: string; label: string; description: string }>
  onSelectedQcControlsChange: (ids: string[]) => void
  contexts: MeasurementContextRecord[]
  activeContextId: string | null
  activeContext: MeasurementContextRecord | null
  activeContextMetadata: { readEventIds: string[]; qcControlIds: string[] }
  assignmentCounts: Record<string, Record<string, number>>
  onSelectContext: (contextId: string | null) => void
  onContextCreated: (contextId: string) => void
  onRefresh: () => Promise<void>
}

function summarizeAssignments(assignments: Record<string, number> | undefined): string {
  if (!assignments || Object.keys(assignments).length === 0) return 'No biological roles linked yet.'
  return Object.entries(assignments)
    .slice(0, 4)
    .map(([role, count]) => `${count} ${role.replace(/_/g, ' ')}`)
    .join(' · ')
}

export function ReadoutContextPanel({
  sourceRef,
  selectedWellCount,
  selectedWells,
  readEvents,
  activeReadEventId,
  activeReadEventLabel,
  suggestedInstrumentType,
  onReadEventChange,
  qcOptions,
  onSelectedQcControlsChange,
  contexts,
  activeContextId,
  activeContext,
  activeContextMetadata,
  assignmentCounts,
  onSelectContext,
  onContextCreated,
  onRefresh,
}: ReadoutContextPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[1.1fr_1fr]">
        <MeasurementSetupPanel
          sourceRef={sourceRef}
          selectedWellCount={selectedWellCount}
          selectedWells={selectedWells}
          onCreated={onContextCreated}
          activeContext={activeContext}
          readEvents={readEvents}
          activeReadEventId={activeReadEventId}
          onReadEventChange={onReadEventChange}
          suggestedInstrumentType={suggestedInstrumentType}
          qcOptions={qcOptions}
          onSelectedQcControlsChange={onSelectedQcControlsChange}
        />
        <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Readout Contexts</h3>
              <p className="mt-1 text-xs text-slate-600">Choose how this biology will be read: plate reader channels, qPCR panels, GC-MS features, and more.</p>
            </div>
            <button type="button" className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50" onClick={() => void onRefresh()}>
              Refresh
            </button>
          </div>
          <MeasurementContextList
            contexts={contexts}
            activeContextId={activeContextId}
            assignmentCounts={assignmentCounts}
            onSelect={onSelectContext}
          />
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">Readout Summary</div>
        {activeReadEventLabel ? (
          <div className="mt-2 text-xs text-slate-600">
            Planned read event: <strong>{activeReadEventLabel}</strong>
          </div>
        ) : null}
        {activeContext ? (
          <>
            {(() => {
              const parsedNotes = parseReadoutNotes(activeContext.notes)
              return (
                <>
            <div className="mt-2 text-sm text-slate-800">
              <span className="font-medium">{activeContext.assay_def_ref?.label || 'Custom readout'}</span>
              {' · '}
              {activeContext.instrument_ref.label || activeContext.instrument_ref.id}
              {' · '}
              {activeContext.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              {typeof activeContext.measurement_count === 'number'
                ? `${activeContext.measurement_count} linked measurement read${activeContext.measurement_count === 1 ? '' : 's'}`
                : 'No linked reads yet'}
              {activeContext.series_id ? ` · Series ${activeContext.series_id}` : ''}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              {summarizeAssignments(assignmentCounts[activeContext.id])}
            </div>
            <div className="mt-2 text-xs text-slate-600">
              QC controls: {summarizeQcControls(activeContextMetadata.qcControlIds)}
            </div>
            {Object.keys(parsedNotes.qcAssignments).length > 0 ? (
              <div className="mt-2 space-y-1 text-xs text-slate-600">
                {Object.entries(parsedNotes.qcAssignments).map(([qcId, wells]) => (
                  wells.length > 0 ? (
                    <div key={qcId}>
                      <span className="font-medium">
                        {qcOptions.find((option) => option.id === qcId)?.label || qcId.replace(/_/g, ' ')}
                      </span>
                      : {wells.join(', ')}
                    </div>
                  ) : null
                ))}
              </div>
            ) : null}
            {parsedNotes.expectationNotes ? (
              <div className="mt-2 text-xs text-slate-600">
                Expectations: {parsedNotes.expectationNotes}
              </div>
            ) : null}
            {parsedNotes.qcNotes ? (
              <div className="mt-2 text-xs text-slate-600">
                QC notes: {parsedNotes.qcNotes}
              </div>
            ) : null}
                </>
              )
            })()}
          </>
        ) : (
          <div className="mt-2 text-sm text-slate-600">
            Create or select a readout context to define how this plate will be measured.
          </div>
        )}
        <div className="mt-2 text-xs text-slate-500">
          Suggested instrument family for this read: {suggestedInstrumentType.replace(/_/g, ' ')}.
        </div>
      </div>
    </div>
  )
}
