/**
 * ChatPreviewCard — the pane-side accept/reject surface for a staged deck
 * proposal (gap 2 of the universal-chat swap).
 *
 * The universal chat stages proposals as `previewEvents` / `previewLabwareAdditions`
 * and exposes `acceptPreview` / `rejectPreview` / `setPreviewEventState`, but no
 * pane ever rendered them: on a phone the deck (and its PreviewActionBar) is off
 * screen, so a staged proposal had no visible way to be applied or discarded.
 *
 * Rules kept from the deck-side flow:
 *  - nothing is applied until the scientist presses Apply (the staged preview is
 *    never auto-committed);
 *  - an unresolved ontology ref HARD-BLOCKS Apply — the pane says why instead of
 *    guessing a resolution (acceptPreviewWithResolutions is the only path that
 *    resolves, and it is not fabricated here);
 *  - dropping one event is local to that event: `setPreviewEventState(id,
 *    'rejected')`, the rest of the proposal stays staged.
 */
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import './ChatPreviewCard.css'

function eventLabel(event: { eventId: string; event_type?: string; stepId?: string }): string {
  const kind = event.event_type ?? 'event'
  return event.stepId ? `${kind} · ${event.stepId}` : kind
}

/**
 * L2-SUITE-A-uifix2 [B] — the human-readable detail line for a staged event,
 * derived declaratively from the event's `details` (a field descriptor, not a
 * per-verb if-chain). The re-gate: the mix's volume 75 / cycles 3 existed only
 * in the "View changes" raw-JSON modal, never on the proposal card (the spec's
 * P7 arm requires them on the card).
 *
 * Volume is honest to the two wire shapes the compile actually emits:
 *  - mix: `details.volume` is a PLAIN NUMBER (unit implied uL — the modal's
 *    `{"volume": 75, "cycles": 3, "labwareId": ...}`) → "75 uL";
 *  - add_material / transfer: `details.volume` is `{ value, unit }` → "100 uL".
 * Cycles ride the mix (`details.cycles`). No displayable field → null (a dead
 * empty line would be dead chrome).
 */
function eventDetailLine(event: { details?: unknown }): string | null {
  const details = event.details as Record<string, unknown> | undefined
  if (!details || typeof details !== 'object') return null
  const parts: string[] = []
  const volume = details.volume
  if (typeof volume === 'number' && Number.isFinite(volume)) {
    parts.push(`${volume} uL`)
  } else if (
    volume &&
    typeof volume === 'object' &&
    typeof (volume as { value?: unknown }).value === 'number'
  ) {
    const v = volume as { value: number; unit?: unknown }
    const unit = typeof v.unit === 'string' && v.unit.length > 0 ? v.unit : 'uL'
    parts.push(`${v.value} ${unit}`)
  }
  if (typeof details.cycles === 'number' && Number.isFinite(details.cycles)) {
    const cycles = details.cycles
    parts.push(`${cycles} cycle${cycles === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export function ChatPreviewCard({ chat }: { chat: UseAiChatReturn }) {
  if (!chat.hasPreview) return null

  const events = chat.previewEvents ?? []
  const labware = chat.previewLabwareAdditions ?? []
  const unresolved = chat.unresolvedRefs ?? []
  // L2-CHAT-1 regatefix2 D2: the labware count is the STAGED preview's truth
  // (the same data the deck bar reads) — chat.previewStagedLabwareCount —
  // not previewLabwareAdditions alone (the done result's additions: empty on
  // the shorthand path, the gate's "1 event · 0 new labware" misreport).
  // The ?? fallback keeps non-deck callers (no staged seam → the hook's own
  // additions-count fallback already lives in the hook) honest.
  const labwareCount = chat.previewStagedLabwareCount ?? labware.length

  return (
    <section className="chat-preview" data-testid="chat-preview" aria-label="Proposed deck changes">
      <header className="chat-preview__header">
        <span className="chat-preview__title">Proposed deck changes</span>
        <span className="chat-preview__counts">
          {events.length} event{events.length === 1 ? '' : 's'} · {labwareCount} new labware{labwareCount === 1 ? '' : 's'}
        </span>
      </header>

      {unresolved.length > 0 ? (
        <p className="chat-preview__blocked" data-testid="chat-preview-unresolved">
          {unresolved.length} term{unresolved.length === 1 ? '' : 's'} still unresolved — resolve
          them before applying. Nothing has been written.
        </p>
      ) : null}

      {/* L2-CHAT-1 regatefix2 D1: the adoption REFUSAL wall — a failed Apply
          (the shared adoption core threw, e.g. the run's deck lock conflict)
          must be VISIBLE here naming the cause. The hook keeps the preview
          staged, so this wall sits above the still-actionable controls —
          never a silent nothing. */}
      {chat.adoptionError ? (
        <div className="chat-preview__error" role="alert" data-testid="chat-preview-error">
          <span className="chat-preview__error-label">Apply failed</span>
          <span className="chat-preview__error-message">{chat.adoptionError}</span>
        </div>
      ) : null}

      {events.length > 0 ? (
        <ul className="chat-preview__events">
          {events.map((event) => {
            const state = chat.previewEventStates.get(event.eventId) ?? 'pending'
            const dropped = state === 'rejected'
            return (
              <li
                key={event.eventId}
                className={dropped ? 'chat-preview__event chat-preview__event--dropped' : 'chat-preview__event'}
              >
                <span className="chat-preview__event-text">
                  <span className="chat-preview__event-label">{eventLabel(event)}</span>
                  {(() => {
                    const detail = eventDetailLine(event)
                    return detail ? (
                      <span className="chat-preview__event-details" data-testid="chat-preview-event-details">
                        {detail}
                      </span>
                    ) : null
                  })()}
                </span>
                <button
                  type="button"
                  className="chat-preview__toggle"
                  data-testid={`chat-preview-toggle-${event.eventId}`}
                  aria-pressed={dropped}
                  onClick={() => chat.setPreviewEventState(event.eventId, dropped ? 'pending' : 'rejected')}
                >
                  {dropped ? 'Include' : 'Drop'}
                </button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <div className="chat-preview__actions">
        <button
          type="button"
          className="chat-preview__btn chat-preview__btn--apply"
          data-testid="chat-preview-apply"
          disabled={chat.isAccepting || unresolved.length > 0}
          onClick={() => chat.acceptPreview()}
        >
          Apply
        </button>
        <button
          type="button"
          className="chat-preview__btn"
          data-testid="chat-preview-discard"
          disabled={chat.isAccepting}
          onClick={() => chat.rejectPreview()}
        >
          Discard
        </button>
      </div>
    </section>
  )
}
