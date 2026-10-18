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

export function ChatPreviewCard({ chat }: { chat: UseAiChatReturn }) {
  if (!chat.hasPreview) return null

  const events = chat.previewEvents ?? []
  const labware = chat.previewLabwareAdditions ?? []
  const unresolved = chat.unresolvedRefs ?? []

  return (
    <section className="chat-preview" data-testid="chat-preview" aria-label="Proposed deck changes">
      <header className="chat-preview__header">
        <span className="chat-preview__title">Proposed deck changes</span>
        <span className="chat-preview__counts">
          {events.length} event{events.length === 1 ? '' : 's'} · {labware.length} new labware
        </span>
      </header>

      {unresolved.length > 0 ? (
        <p className="chat-preview__blocked" data-testid="chat-preview-unresolved">
          {unresolved.length} term{unresolved.length === 1 ? '' : 's'} still unresolved — resolve
          them before applying. Nothing has been written.
        </p>
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
                <span className="chat-preview__event-label">{eventLabel(event)}</span>
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
