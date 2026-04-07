import type { MeasurementContextRecord } from '../../shared/api/client'
import { parseReadoutContextMetadata, summarizeQcControls } from '../lib/readoutMetadata'

export interface MeasurementContextListProps {
  contexts: MeasurementContextRecord[]
  activeContextId: string | null
  assignmentCounts: Record<string, Record<string, number>>
  onSelect: (contextId: string) => void
}

function summarizeReadouts(context: MeasurementContextRecord): string {
  return context.readout_def_refs.map((ref) => ref.label || ref.id).join(', ')
}

export function MeasurementContextList({
  contexts,
  activeContextId,
  assignmentCounts,
  onSelect,
}: MeasurementContextListProps) {
  if (contexts.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        No measurement contexts yet. Start with a read setup for this plate.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {contexts.map((context) => {
        const isActive = context.id === activeContextId
        const counts = assignmentCounts[context.id] || {}
        const metadata = parseReadoutContextMetadata(context)
        return (
          <button
            key={context.id}
            type="button"
            onClick={() => onSelect(context.id)}
            className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
              isActive ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{context.name}</div>
                <div className="mt-1 text-xs text-slate-600">
                  {(context.assay_def_ref?.label || 'Custom measurement')} · {context.instrument_ref.label || context.instrument_ref.id}
                </div>
                <div className="mt-1 text-xs text-slate-500">{summarizeReadouts(context)}</div>
                {metadata.readEventIds.length > 0 ? (
                  <div className="mt-1 text-xs text-slate-500">Read events: {metadata.readEventIds.join(', ')}</div>
                ) : null}
                {context.timepoint ? <div className="mt-1 text-xs text-slate-500">Timepoint: {context.timepoint}</div> : null}
                {context.series_id ? <div className="mt-1 text-xs text-slate-500">Series: {context.series_id}</div> : null}
                {metadata.qcControlIds.length > 0 ? (
                  <div className="mt-1 text-xs text-slate-500">QC: {summarizeQcControls(metadata.qcControlIds)}</div>
                ) : null}
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {typeof context.measurement_count === 'number' ? (
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {context.measurement_count} linked read{context.measurement_count === 1 ? '' : 's'}
                  </span>
                ) : null}
                {Object.entries(counts).slice(0, 4).map(([role, count]) => (
                  <span key={role} className="rounded-full bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 ring-1 ring-slate-200">
                    {count} {role.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
