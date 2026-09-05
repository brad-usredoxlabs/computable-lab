import { useCallback, useMemo, useState } from 'react'
import type { EventEditorPreview } from '../EventEditorContext'
import { LABWARE_TYPE_LABELS } from '../../types/labware'
import type { DraftOntologyBinding } from '../../types/ai'
import type { TermDecision } from './acceptedOntologyBindings'
import { useResolveOntology } from '../../editor/hooks/useResolveOntology'

interface ProposedGraphModalProps {
  preview: EventEditorPreview
  onClose: () => void
  /**
   * The user's sign-off decisions for the AI-proposed ontology terms, keyed by
   * the binding's CURIE. Held by the parent (PreviewActionBar) so Accept can
   * enforce the gate; the modal mutates it via onDecisionsChange.
   */
  termDecisions?: Record<string, TermDecision>
  onDecisionsChange?: (decisions: Record<string, TermDecision>) => void
}

/**
 * A proposed ontology term that requires the scientist's sign-off. Minted /
 * requiresReview / draftOnly bindings need an explicit approve-or-replace
 * decision; existing-local-match bindings are trusted and shown read-only.
 */
function bindingNeedsDecision(b: DraftOntologyBinding): boolean {
  return Boolean(b.minted || b.requiresReview || b.draftOnly)
}

/** Inline resolver for replacing one term — debounced spine-backed typeahead. */
function ReplacePicker({
  initialLabel,
  onPick,
  onCancel,
}: {
  initialLabel: string
  onPick: (c: { curie: string; label: string; recordId?: string }) => void
  onCancel: () => void
}) {
  const [query, setQuery] = useState(initialLabel)
  const { results, loading } = useResolveOntology({ query, enabled: query.trim().length >= 2 })

  const pick = (curie: string, label: string, recordId?: string) => {
    onPick({ curie, label, recordId })
  }

  return (
    <div className="proposed-graph__term-replace" data-testid="term-replace-picker">
      <input
        className="proposed-graph__term-replace-input"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={`Search ontology for a replacement for “${initialLabel}”…`}
        autoFocus
        data-testid="term-replace-input"
      />
      {loading ? (
        <span className="proposed-graph__muted">Searching…</span>
      ) : results.length === 0 ? (
        <span className="proposed-graph__muted">
          No matches — pick below to mint a local term for “{query.trim() || initialLabel}”.
        </span>
      ) : (
        <ul className="proposed-graph__term-replace-results" data-testid="term-replace-results">
          {results.slice(0, 6).map((c) => {
            const isLocal = c.source === 'canonical-term' || c.source === 'local-record'
            return (
              <li key={c.curie}>
                <button
                  type="button"
                  className="proposed-graph__term-result"
                  onClick={() => pick(c.curie, c.label, isLocal ? c.curie : undefined)}
                  data-testid={`term-replace-result-${c.curie}`}
                >
                  <span className="proposed-graph__term-result-label">{c.label}</span>
                  <span className="proposed-graph__muted">
                    {c.curie} · {isLocal ? 'local' : c.namespace}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="proposed-graph__term-replace-actions">
        {/* Mint the query as a brand-new local term when no ontology hit is right. */}
        <button
          type="button"
          className="proposed-graph__btn proposed-graph__btn--ghost"
          onClick={() => {
            const label = query.trim() || initialLabel
            if (label) onPick({ curie: `local:${label.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}`, label })
          }}
          data-testid="term-replace-mint"
        >
          Mint local “{query.trim() || initialLabel}”
        </button>
        <button
          type="button"
          className="proposed-graph__btn proposed-graph__btn--ghost"
          onClick={onCancel}
          data-testid="term-replace-cancel"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export function ProposedGraphModal({
  preview,
  onClose,
  termDecisions = {},
  onDecisionsChange,
}: ProposedGraphModalProps) {
  const { previewPlacements: placements, previewEvents: events } = preview

  const bindings = preview.ontologyBindings ?? []
  const decisionNeeded = useMemo(() => bindings.filter(bindingNeedsDecision), [bindings])
  const readOnly = useMemo(
    () => bindings.filter((b) => !bindingNeedsDecision(b)),
    [bindings],
  )

  const [replacingCurie, setReplacingCurie] = useState<string | null>(null)

  const setDecision = useCallback((curie: string, decision: TermDecision) => {
    if (!onDecisionsChange) return
    onDecisionsChange({ ...termDecisions, [curie]: decision })
  }, [onDecisionsChange, termDecisions])

  const approveAll = useCallback(() => {
    if (!onDecisionsChange) return
    const next = { ...termDecisions }
    for (const b of decisionNeeded) next[b.curie] = { status: 'approved' }
    onDecisionsChange(next)
  }, [termDecisions, decisionNeeded, onDecisionsChange])

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

  const pendingCount = decisionNeeded.filter((b) => !termDecisions[b.curie]).length
  const resolvedCount = decisionNeeded.length - pendingCount

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
          {decisionNeeded.length > 0 ? (
            <section className="proposed-graph__section" data-testid="term-review-section">
              <div className="proposed-graph__review-head">
                <h4 className="proposed-graph__heading">Review ontology terms</h4>
                <span className="proposed-graph__review-progress" data-testid="term-review-progress">
                  {resolvedCount}/{decisionNeeded.length} decided
                </span>
                {pendingCount > 0 ? (
                  <button
                    type="button"
                    className="proposed-graph__btn proposed-graph__btn--ghost"
                    onClick={approveAll}
                    data-testid="term-approve-all"
                  >
                    Approve all
                  </button>
                ) : null}
              </div>
              <p className="proposed-graph__muted">
                The AI proposed ontology terms for new material. Sign off that each is right, or
                replace it, before accepting.
              </p>
              <ul className="proposed-graph__terms" data-testid="term-review-list">
                {decisionNeeded.map((b) => {
                  const decision = termDecisions[b.curie]
                  const status = !decision
                    ? 'pending'
                    : decision.status === 'approved'
                      ? 'approved'
                      : 'replaced'
                  return (
                    <li
                      key={b.curie}
                      className={`proposed-graph__term proposed-graph__term--${status}`}
                      data-testid={`term-row-${b.curie}`}
                    >
                      <div className="proposed-graph__term-main">
                        <span className="proposed-graph__term-label">{b.label}</span>
                        <span className="proposed-graph__muted">{b.curie}</span>
                        <span
                          className="proposed-graph__term-badge"
                          data-testid={`term-badge-${b.curie}`}
                        >
                          {status === 'pending' && 'needs decision'}
                          {status === 'approved' && 'approved'}
                          {status === 'replaced' &&
                            `replaced → ${decision && decision.status === 'replaced' ? decision.curie : ''}`}
                        </span>
                      </div>

                      {replacingCurie === b.curie ? (
                        <ReplacePicker
                          initialLabel={b.label}
                          onPick={(c) => {
                            setDecision(b.curie, { status: 'replaced', ...c })
                            setReplacingCurie(null)
                          }}
                          onCancel={() => setReplacingCurie(null)}
                        />
                      ) : (
                        <div className="proposed-graph__term-actions">
                          {status !== 'approved' ? (
                            <button
                              type="button"
                              className="proposed-graph__btn"
                              onClick={() => setDecision(b.curie, { status: 'approved' })}
                              data-testid={`term-approve-${b.curie}`}
                            >
                              Approve
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="proposed-graph__btn proposed-graph__btn--ghost"
                            onClick={() => setReplacingCurie(b.curie)}
                            data-testid={`term-replace-${b.curie}`}
                          >
                            Replace…
                          </button>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {readOnly.length > 0 ? (
            <section className="proposed-graph__section" data-testid="term-context-section">
              <h4 className="proposed-graph__heading">Ontology terms (already local)</h4>
              <ul className="proposed-graph__terms proposed-graph__terms--readonly">
                {readOnly.map((b) => (
                  <li key={b.curie} className="proposed-graph__term">
                    <div className="proposed-graph__term-main">
                      <span className="proposed-graph__term-label">{b.label}</span>
                      <span className="proposed-graph__muted">{b.curie}</span>
                      <span className="proposed-graph__term-badge proposed-graph__term-badge--ok">
                        local
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

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