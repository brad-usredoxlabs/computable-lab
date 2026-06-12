import { useEffect } from 'react'
import type { EventEditorPreview } from '../EventEditorContext'
import { LABWARE_TYPE_LABELS } from '../../types/labware'

interface ProposedGraphModalProps {
  preview: EventEditorPreview
  onClose: () => void
}

/**
 * Read-only inspector for the staged AI preview — the proposed event graph
 * before Accept. Mostly a debugging aid: the deck ghosts show *where* changes
 * land, but not always the full per-event detail (refs, volumes, provenance).
 * Renders a readable per-event breakdown plus a raw-JSON dump of the whole
 * preview payload.
 */
export function ProposedGraphModal({ preview, onClose }: ProposedGraphModalProps) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const { previewPlacements: placements, previewEvents: events } = preview

  const rawJson = JSON.stringify(
    {
      events: preview.previewEvents,
      labwares: preview.previewLabwares,
      placements: preview.previewPlacements,
      ontologyBindings: preview.ontologyBindings ?? [],
      labwareRequirements: preview.labwareRequirements ?? [],
      sourcePrompt: preview.sourcePrompt ?? null,
    },
    null,
    2,
  )

  return (
    <div className="ee-dialog__scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ee-dialog proposed-graph" onClick={(e) => e.stopPropagation()}>
        <header className="ee-dialog__header">
          <span className="ee-dialog__title">Proposed changes</span>
          <span className="ee-dialog__context">
            {placements.length} labware · {events.length} event{events.length === 1 ? '' : 's'}
          </span>
          <button className="ee-dialog__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ee-dialog__body proposed-graph__body">
          {placements.length > 0 ? (
            <section className="proposed-graph__section">
              <h4 className="proposed-graph__heading">New labware</h4>
              <ul className="proposed-graph__lw-list">
                {placements.map((p) => {
                  const lw = preview.previewLabwares[p.labwareId]
                  const where =
                    p.location.kind === 'slot' ? `slot ${p.location.slotId}` : 'lawn'
                  return (
                    <li key={p.placementId} className="proposed-graph__lw">
                      <span className="proposed-graph__lw-name">{lw?.name ?? p.labwareId}</span>
                      <span className="proposed-graph__muted">
                        {lw ? LABWARE_TYPE_LABELS[lw.labwareType] : 'unknown type'} · {where} ·{' '}
                        {p.orientation}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          <section className="proposed-graph__section">
            <h4 className="proposed-graph__heading">Events</h4>
            {events.length === 0 ? (
              <p className="proposed-graph__muted">No events proposed.</p>
            ) : (
              <ol className="proposed-graph__events">
                {events.map((ev, i) => (
                  <li key={i} className="proposed-graph__event">
                    <span className="proposed-graph__event-type">{ev.event_type}</span>
                    <pre className="proposed-graph__json">
                      {JSON.stringify(ev.details ?? {}, null, 2)}
                    </pre>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <details className="proposed-graph__raw">
            <summary>Raw JSON</summary>
            <pre className="proposed-graph__json">{rawJson}</pre>
          </details>
        </div>
      </div>
    </div>
  )
}
