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
import { useMemo } from 'react'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import { proposalRowFact, recordIdsFromLastUserMessage } from './proposalRowFacts'
import './ChatPreviewCard.css'

// L2-CLARIFY-TARGET-1 (Change 5 / P7): ONE module constant for the proposal's
// reject verb — the bar's OWN word at :192 (the D1 guardrail's "row-action
// uses the bar's verb"). The row button renders it when pending and `Restore`
// when dropped; with `aria-label` = `${verb} ${fact}` two identically-worded
// controls stay distinguishable. The D1 pin: the per-row toggle keeps calling
// `chat.setPreviewEventState(event.eventId, …)` — this constant only names the
// visible verb, it adds no second approval surface.
const PROPOSAL_REJECT_VERB = 'Discard'

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
 * Cycles ride the mix (`details.cycles`).
 *
 * L2-SUITE-A-uifix3 D6 (regate-5): the descriptor also reads the DECLARED
 * detail fields the other verbs carry — `duration` (a plain string, the
 * record's own wording: "overnight") and `temperature` (the two wire shapes
 * the compile emits: `{ value, unit }` per IncubateDetails, and the plain
 * number the committed incubate record carries — unit implied °C, the repo's
 * one temperature convention: the liquid-handling vocab's temperature_C "°C",
 * EquipmentTile "55 °C", events.ts eventLabel "at 37°C"). Still a field
 * descriptor: whatever displayable fields the record carries, in the record's
 * order — no per-kind switch table, no fabricated values.
 * No displayable field → null (a dead empty line would be dead chrome).
 *
 * L2-CLARIFY-TARGET-1 fix run 4 / D1 CONFORM (ruling l2t0937 Q3, shape (A) —
 * COMPOSE): the descriptor accepts a caller-supplied EXCLUSION of the detail
 * fields the row fact already carries (declared in ONE place by the fact
 * formatter — `proposalRowFact`'s `carried` set). Over the residual it keeps
 * its declared doctrine — whatever displayable fields the record carries, in
 * the record's order. No field text appears TWICE on a row (the exclusion),
 * and no field the record displayed is dropped (the fact's fields are
 * excluded, not the record's).
 */
function eventDetailLine(event: { details?: unknown }, excludedFields?: ReadonlySet<string>): string | null {
  const details = event.details as Record<string, unknown> | undefined
  if (!details || typeof details !== 'object') return null
  const parts: string[] = []
  const volume = details.volume
  if (!excludedFields?.has('volume')) {
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
  }
  if (typeof details.cycles === 'number' && Number.isFinite(details.cycles) && !excludedFields?.has('cycles')) {
    const cycles = details.cycles
    parts.push(`${cycles} cycle${cycles === 1 ? '' : 's'}`)
  }
  // L2-SUITE-A-uifix3 D6: the declared duration field — a plain string in the
  // record's own wording (the committed incubate record carries "overnight";
  // nothing is parsed or re-formatted, the value is displayed as-is).
  if (typeof details.duration === 'string' && details.duration.trim().length > 0 && !excludedFields?.has('duration')) {
    parts.push(details.duration)
  }
  // L2-SUITE-A-uifix3 D6: the declared temperature field, honest to the two
  // wire shapes (same discipline as the volume arm): { value, unit } keeps
  // the record's unit verbatim; a plain number is the committed record shape
  // (the IncubateDetails numeric form) — the unit implied by the repo's one
  // temperature convention (°C), never a second unit invented.
  const temperature = details.temperature
  if (!excludedFields?.has('temperature')) {
    if (typeof temperature === 'number' && Number.isFinite(temperature)) {
      parts.push(`${temperature} °C`)
    } else if (
      temperature &&
      typeof temperature === 'object' &&
      typeof (temperature as { value?: unknown }).value === 'number'
    ) {
      const t = temperature as { value: number; unit?: unknown }
      const unit = typeof t.unit === 'string' && t.unit.length > 0 ? t.unit : '°C'
      parts.push(`${t.value} ${unit}`)
    }
  }
  return parts.length > 0 ? parts.join(' · ') : null
}

export function ChatPreviewCard({ chat }: { chat: UseAiChatReturn }) {
  // L2-CLARIFY-TARGET-1 (Change 5 / P7): `material label → record id` from the
  // LAST user message (the answer sentence of the turn that produced the
  // preview) via the EXISTING `parsePromptMentions` — no new grammar, no
  // server field, no re-search (OQ3 ratified: the transcript's mention token
  // is the id's only home; a label mismatch yields no id, never an invented
  // one). `useMemo` over `chat.messages` (spec :391-397); null → rows render
  // well ← volume ← material with no `(…)` suffix.
  const recordIds = useMemo(() => recordIdsFromLastUserMessage(chat.messages), [chat.messages])
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
  // L2-CLARIFY-TARGET-1 UI-gate fix 1 / D3 (the inert Discard toggle): the header
  // count must reflect the rows' REAL dropped state. A dropped row is still in
  // `previewEvents` — dropping only flips its STATE in `previewEventStates`
  // (`rejected`) — so counting `events.length` stays "1 event" after a drop and
  // the label never reflects the row's real state. Count the ACTIVE (non-
  // dropped) events; a single staged row dropped to zero events reads
  // "0 events" (the gate's expected post-drop count), and restoring returns it.
  const activeEventCount = events.filter(
    (event) => chat.previewEventStates.get(event.eventId) !== 'rejected',
  ).length

  return (
    <section className="chat-preview" data-testid="chat-preview" aria-label="Proposed deck changes">
      <header className="chat-preview__header">
        <span className="chat-preview__title">Proposed deck changes</span>
        <span className="chat-preview__counts">
          {activeEventCount} event{activeEventCount === 1 ? '' : 's'} · {labwareCount} new labware{labwareCount === 1 ? '' : 's'}
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
            // L2-CLARIFY-TARGET-1 (Change 5 / P7): the checkable row fact, once
            // per row, shared by the detail line and the row-action aria-label.
            const rowFact = proposalRowFact(event, recordIds ?? undefined)
            return (
              <li
                key={event.eventId}
                className={dropped ? 'chat-preview__event chat-preview__event--dropped' : 'chat-preview__event'}
              >
                <span className="chat-preview__event-text">
                  <span className="chat-preview__event-label">{eventLabel(event)}</span>
                  {(() => {
                    // L2-CLARIFY-TARGET-1 (Change 5 / P7) + fix run 4 / D1
                    // CONFORM (ruling l2t0937 Q3, shape (A) — COMPOSE, NOT
                    // REPLACE): the row renders ONE detail line = the row fact
                    // followed by the RESIDUAL of `eventDetailLine` — the
                    // displayable fields the fact did NOT already carry (the
                    // formatter's ONE declaration: `rowFact.carried`), joined
                    // with ` · `. The composed line renders inside the
                    // EXISTING `chat-preview__event-details` element, which
                    // KEEPS `data-testid="chat-preview-row-fact"` — no second
                    // line, no duplicated field text (a field the fact
                    // carries is excluded from the residual, never printed
                    // twice), and no field the record displayed before this
                    // delta is gone (the residual keeps the descriptor's
                    // doctrine over what remains — the mix's `3 cycles`).
                    // Worked face: mix {volume:75, cycles:3} → fact `75 uL`
                    // + residual `3 cycles` → ONE line `75 uL · 3 cycles`;
                    // add_material {wells:[B1,B2], volume} → fact `B1, B2 ←
                    // 100 uL`, residual empty → ONE line `B1, B2 ← 100 uL`.
                    // An event the formatter cannot represent keeps today's
                    // `eventLabel` + `eventDetailLine` line (testid
                    // `chat-preview-event-details` remains the no-fact
                    // fallback exactly as today); with neither, no line at
                    // all (dead chrome is not added).
                    const detail = eventDetailLine(event, rowFact?.carried)
                    if (rowFact) {
                      const composed = detail ? `${rowFact.text} · ${detail}` : rowFact.text
                      return (
                        <span
                          className="chat-preview__event-details"
                          data-testid="chat-preview-row-fact"
                        >
                          {composed}
                        </span>
                      )
                    }
                    return detail ? (
                      <span className="chat-preview__event-details" data-testid="chat-preview-event-details">
                        {detail}
                      </span>
                    ) : null
                  })()}
                </span>
                {(() => {
                  // The row-action verb is the BAR'S verb (D1 guardrail):
                  // `PROPOSAL_REJECT_VERB` (the bar's own `Discard`) when
                  // pending, `Restore` when dropped. The aria-label names the
                  // row's fact (or the verb line) so two identically-worded
                  // controls stay distinguishable. The D1 pin: the click path
                  // is still ONLY `chat.setPreviewEventState(event.eventId, …)`.
                  const rowLabel = rowFact?.text ?? eventLabel(event)
                  return (
                    <button
                      type="button"
                      className="chat-preview__toggle"
                      data-testid={`chat-preview-toggle-${event.eventId}`}
                      aria-pressed={dropped}
                      aria-label={`${dropped ? 'Restore' : PROPOSAL_REJECT_VERB} ${rowLabel}`}
                      onClick={() => chat.setPreviewEventState(event.eventId, dropped ? 'pending' : 'rejected')}
                    >
                      {dropped ? 'Restore' : PROPOSAL_REJECT_VERB}
                    </button>
                  )
                })()}
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
