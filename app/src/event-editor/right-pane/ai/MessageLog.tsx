/**
 * MessageLog — vertical scroll of chat turns.
 *
 * Renders committed messages plus, if streaming, the in-flight assistant
 * "pending" bubble whose text grows on every text_delta. Auto-scrolls to
 * the latest bubble on each render — the streaming UX is unusable
 * otherwise.
 */

import { useEffect, useRef } from 'react'
import type { ChatState } from './chatReducer'
import type { AiClarificationOption, AiClarificationRequest } from '../../../types/ai'

export interface MessageLogProps {
  state: ChatState
}

function safeMentionPart(value: string): string {
  return value.replace(/[\]\n\r]/g, '').trim()
}

function optionRefId(option: AiClarificationOption): string {
  const ref = option.ref
  if (typeof ref?.curie === 'string' && ref.curie.trim()) return ref.curie
  if (typeof ref?.id === 'string' && ref.id.trim()) return ref.id
  return option.id
}

export function mentionTokenForOption(
  request: AiClarificationRequest,
  option: AiClarificationOption,
): string | undefined {
  const label = safeMentionPart(option.label)
  const id = safeMentionPart(optionRefId(option))
  if (!id) return undefined
  if (request.menuProvider === '/l' || request.kind === 'labware') {
    return `[[labware:${id}|${label}]]`
  }
  if (request.menuProvider === '/e') {
    return `[[equipment:${id}|${label}]]`
  }
  if (request.menuProvider === '/m') {
    const refKind = typeof option.ref?.kind === 'string' ? option.ref.kind : undefined
    const kind =
      refKind === 'material-spec' || refKind === 'aliquot' || refKind === 'material-instance'
        ? refKind
        : 'material'
    return `[[${kind}:${id}|${label}]]`
  }
  return undefined
}

/**
 * What the model actually put in the tool call — the difference between "the model
 * proposed nothing" and "the panel lost it". A bare `Tool: agent_intent` hid a real
 * failure (2026-09-19): a turn whose call carried no fields looked identical to a
 * successful one.
 */
function describeToolArgs(args: Record<string, unknown> | undefined): string {
  const a = args ?? {}
  const intent = typeof a.intent === 'string' ? a.intent : undefined
  const keys = Object.keys(a).filter((key) => key !== 'intent')
  const fieldNote = keys.length === 0
    ? 'no fields'
    : `${keys.length} field${keys.length === 1 ? '' : 's'}: ${keys.slice(0, 6).join(', ')}${keys.length > 6 ? `, +${keys.length - 6} more` : ''}`
  if (!intent) return ` · ${fieldNote}`

  // The intent is the single most informative thing the call carries, and it used to
  // be filtered out of this line (2026-09-19): authoring records, drafting events and
  // switching the deck all rendered as "Tool: agent_intent". Say what it decided, and
  // say it from the ARGS — never from a guess about what the model meant.
  const parts: string[] = [intent]
  if (intent === 'create_record') {
    const records = Array.isArray(a.records) ? a.records : []
    const described = records.map((raw) => {
      const record = (raw ?? {}) as Record<string, unknown>
      const kind = typeof record.kind === 'string' ? record.kind : 'record'
      const name = typeof record.name === 'string' ? record.name : '(unnamed)'
      return `${kind} “${name}”`
    })
    parts.push(records.length === 0 ? 'no records' : `create ${records.length}: ${described.join(', ')}`)
    const place = (a.alsoPlace ?? null) as Record<string, unknown> | null
    if (place && typeof place.surface === 'string') {
      const slot = typeof place.slotId === 'string' ? ` (${place.slotId})` : ''
      parts.push(`also place on ${place.surface}${slot}`)
    }
  } else if (intent === 'event_graph') {
    const events = Array.isArray(a.events) ? a.events.length : 0
    parts.push(`${events} event${events === 1 ? '' : 's'}`)
    for (const [key, label] of [
      ['equipmentRequirements', 'equipment'],
      ['labwareRequirements', 'labware'],
      ['equipmentAdditions', 'equipment add'],
      ['labwareAdditions', 'labware add'],
    ] as const) {
      const list = Array.isArray(a[key]) ? a[key].length : 0
      if (list > 0) parts.push(`${list} ${label}`)
    }
  } else if (intent === 'deck_layout' && typeof a.variantId === 'string') {
    parts.push(a.variantId)
  }
  return ` · ${parts.join(' · ')} · ${fieldNote}`
}

export function MessageLog({ state }: MessageLogProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  // Auto-scroll on every message change. jsdom doesn't ship scrollTo, so
  // we guard it the same way the PDF viewer does.
  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    // Defer to next frame so the freshly-rendered bubble is laid out.
    requestAnimationFrame(() => {
      if (typeof el.scrollTo === 'function') {
        el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
      } else {
        el.scrollTop = el.scrollHeight
      }
    })
  }, [state.messages.length, state.pending?.text])

  const empty = state.messages.length === 0 && !state.pending

  return (
    <div
      className="message-log"
      ref={scrollerRef}
      data-testid="message-log"
      role="log"
      aria-live="polite"
    >
      {empty ? (
        <p className="message-log__hint">
          Send a message to start. The agent sees where you are (the surface
          chip above) and whatever sources you attach.
        </p>
      ) : null}
      {state.messages.map((m) => (
        <article
          key={m.id}
          className={
            m.role === 'user'
              ? 'message-log__bubble message-log__bubble--user'
              : 'message-log__bubble message-log__bubble--assistant'
          }
          data-testid={`message-${m.id}`}
        >
          <header className="message-log__role">
            {m.role === 'user' ? 'You' : 'AI'}
          </header>
          <p className="message-log__text">{m.text}</p>
          {m.clarificationRequests?.length ? (
            <p className="message-log__clarification-summary">
              {m.clarificationRequests.length} clarification{m.clarificationRequests.length > 1 ? 's' : ''} needed — see Questions panel above.
            </p>
          ) : null}
        </article>
      ))}
      {state.pending ? (
        <article
          className="message-log__bubble message-log__bubble--assistant message-log__bubble--pending"
          data-testid={`message-${state.pending.id}`}
        >
          <header className="message-log__role">AI</header>
          <p className="message-log__text">
            {state.pending.text || <em>…thinking</em>}
          </p>
        </article>
      ) : null}
      {(state.trace ?? []).length > 0 ? (
        <div className="message-log__trace" data-testid="message-log-trace">
          {(state.trace ?? []).map((t) => (
            <div key={`trace-${t.seq}`} className="message-log__trace-entry" data-testid={`trace-${t.kind}`} role="status">
              {t.kind === 'tool_call' ? (
                <span className="message-log__trace-icon">⚙</span>
              ) : t.kind === 'tool_result' ? (
                <span className={t.success === false ? 'message-log__trace-icon message-log__trace-icon--error' : 'message-log__trace-icon'}>✓</span>
              ) : t.kind === 'draft' ? (
                <span className="message-log__trace-icon message-log__trace-icon--draft">◈</span>
              ) : t.kind === 'action' ? (
                // PB-CH-4 tier-1: a compiled agent action applied on arrival
                // (focus/open — the workspace moved, nothing was written).
                <span className="message-log__trace-icon message-log__trace-icon--action">➤</span>
              ) : t.kind === 'ledger' ? (
                // PB-CH-8: the SERVER-BUILT ledger answer (fetched journal
                // evidence — read-only, nothing was written).
                <span className="message-log__trace-icon message-log__trace-icon--ledger">▤</span>
              ) : (
                <span className={`message-log__trace-icon message-log__trace-icon--${t.severity ?? 'info'}`}>◆</span>
              )}
              <span className="message-log__trace-text">
                {t.kind === 'tool_call' ? (
                  <>Tool: {t.toolName}{describeToolArgs(t.args)}</>
                ) : t.kind === 'tool_result' ? (
                  <>{t.toolName} {t.success === false ? 'failed' : 'ok'}{t.durationMs ? ` · ${t.durationMs}ms` : ''}</>
                ) : t.kind === 'draft' ? (
                  <>{t.evidence ?? 'draft'}</>
                ) : t.kind === 'action' ? (
                  <>{t.evidence ?? 'action'}</>
                ) : t.kind === 'ledger' ? (
                  // The server's answerText verbatim + provenance lines:
                  // capturedAt rides inside the disclosure text; links and the
                  // clearly-labeled lab events render beneath it.
                  <>
                    {t.evidence ?? 'ledger'}
                    {t.links && t.links.length > 0 ? (
                      <span className="message-log__trace-provenance" data-testid="trace-ledger-links"> · linked lab events: {t.links.join(', ')}</span>
                    ) : null}
                    {t.labEvents && t.labEvents.length > 0 ? (
                      <span className="message-log__trace-provenance" data-testid="trace-ledger-lab-events"> · lab events, not workstate: {t.labEvents.map((e) => `${e.occurredAt} ${e.action} (${e.subjectId})`).join('; ')}</span>
                    ) : null}
                  </>
                ) : (
                  <>{t.message ?? t.code ?? (t.severity ?? 'info')}</>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : null}
      {state.status ? (
        <div className="message-log__status" data-testid="message-log-status">
          {state.status}
        </div>
      ) : null}
      {state.error ? (
        <div className="message-log__error" data-testid="message-log-error">
          {state.error}
        </div>
      ) : null}
    </div>
  )
}
