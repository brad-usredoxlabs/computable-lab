import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventEditor, type EventEditorPreview } from '../EventEditorContext'
import { streamDraftEvents, getAiHealth } from '../../shared/api/aiClient'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import {
  labwareDefinitionRecordToPayload,
  labwareRecordToEditorLabware,
  type LabwareRecordPayload,
} from '../../types/labware'
import type { AiConversationMessage, AiLabwareAddition } from '../../types/ai'
import { buildAiRequestContext } from './buildAiContext'
import type { PlateEvent } from '../../types/events'
import type { EventEditorPlacement, PlacementLocation } from '../types'
import { resolveOrientation, validatePlacement } from '../lib/placementRules'
import type { Labware } from '../../types/labware'
import type { PlatformManifest, PlatformVariantManifest } from '../../types/platformRegistry'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'status'
  content: string
  draftedEvents?: PlateEvent[]
  labwareAdditions?: AiLabwareAddition[]
  /**
   * Diagnostics surfaced when the draft was promoted to a preview: any
   * labware that couldn't be placed (validation failure) lands here so the
   * user sees *why* the deck shows fewer ghosts than the LLM proposed.
   */
  previewSkips?: string[]
}

// Monotonic counter so message ids stay unique even when multiple status
// events fire within the same millisecond. `Date.now()` alone collided
// during burst status streams (React's duplicate-key warning).
let messageSeq = 0
function makeMsgId(suffix: string): string {
  messageSeq += 1
  return `m-${Date.now()}-${messageSeq}-${suffix}`
}

type DockMode = 'precompile' | 'ai'

function labwareRecordFallbackPayload(recordId: string): LabwareRecordPayload {
  const label = recordId
    .replace(/^lbw-/, '')
    .replace(/^def:/, '')
    .replace(/[/:@_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const haystack = `${recordId} ${label}`.toLowerCase()
  const format = haystack.includes('384')
    ? { rows: 16, cols: 24, wellCount: 384 }
    : haystack.includes('reservoir') && haystack.includes('12')
      ? { rows: 1, cols: 12, wellCount: 12 }
      : haystack.includes('reservoir') && haystack.includes('8')
        ? { rows: 1, cols: 8, wellCount: 8 }
        : haystack.includes('tube')
          ? { rows: 1, cols: 1, wellCount: 1 }
          : { rows: 8, cols: 12, wellCount: 96 }
  const labwareType = haystack.includes('reservoir')
    ? 'reservoir'
    : haystack.includes('deep')
      ? 'deepwell'
      : haystack.includes('tube')
        ? 'tube'
        : 'plate'

  return {
    kind: 'labware',
    recordId,
    name: label || recordId,
    labwareType,
    format,
  }
}

function labwarePayloadForAddition(addition: AiLabwareAddition): LabwareRecordPayload {
  return labwareDefinitionRecordToPayload(addition.recordId)
    ?? labwareRecordFallbackPayload(addition.recordId)
}

function summarizeDrafts(events: PlateEvent[], additions: AiLabwareAddition[]): string {
  const parts: string[] = []
  if (events.length > 0) {
    parts.push(`${events.length} event${events.length === 1 ? '' : 's'}`)
  }
  if (additions.length > 0) {
    parts.push(`${additions.length} labware placement${additions.length === 1 ? '' : 's'}`)
  }
  return parts.length > 0 ? `Drafted ${parts.join(' and ')}.` : 'No events generated.'
}

function normalizeDeckSlot(slot: string | undefined): string | null {
  if (!slot) return null
  const normalized = slot.trim().toUpperCase()
  return /^[A-Z][0-9]+$/.test(normalized) ? normalized : null
}

let previewPlacementCounter = 0
function nextPreviewPlacementId(): string {
  previewPlacementCounter += 1
  return `pl-preview-${Date.now().toString(36)}-${previewPlacementCounter.toString(36)}`
}

interface BuildPreviewArgs {
  platform: PlatformManifest | null | undefined
  variant: PlatformVariantManifest | null | undefined
  events: PlateEvent[]
  labwareAdditions: AiLabwareAddition[]
}

interface BuildPreviewResult {
  preview: EventEditorPreview
  skips: string[]
}

/**
 * Turn a streamed draft into an EventEditorPreview by validating each
 * labware addition against the current platform/variant and resolving
 * placement locations. Validation failures go into `skips` so the dock can
 * surface them to the user.
 */
function buildPreviewFromDraft({
  platform,
  variant,
  events,
  labwareAdditions,
}: BuildPreviewArgs): BuildPreviewResult {
  const previewLabwares: Record<string, Labware> = {}
  const previewPlacements: EventEditorPlacement[] = []
  const skips: string[] = []

  for (let index = 0; index < labwareAdditions.length; index += 1) {
    const addition = labwareAdditions[index]!
    const labware = labwareRecordToEditorLabware(labwarePayloadForAddition(addition))
    const slotId = normalizeDeckSlot(addition.deckSlot)
    const location: PlacementLocation = slotId
      ? { kind: 'slot', slotId }
      : { kind: 'lawn', xMm: 20 + index * 24, yMm: 20 + index * 18 }

    if (!platform || !variant) {
      skips.push(`${addition.recordId}: deck not loaded`)
      continue
    }

    const validation = validatePlacement({ platform, variant, location, labware })
    if (!validation.ok) {
      skips.push(`${addition.recordId}: ${validation.errors.join(' ')}`)
      continue
    }
    const orientation = resolveOrientation(validation, undefined, labware)
    previewLabwares[labware.labwareId] = labware
    previewPlacements.push({
      placementId: nextPreviewPlacementId(),
      labwareId: labware.labwareId,
      location,
      orientation,
    })
  }

  return {
    preview: {
      previewLabwares,
      previewPlacements,
      previewEvents: [...events],
    },
    skips,
  }
}

export function EventEditorAiDock() {
  const { state, actions } = useEventEditor()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [mode, setMode] = useState<DockMode>('precompile')
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  /**
   * Id of the chat message whose draft is currently mounted as the editor's
   * preview. Cleared when the user accepts or discards (which nulls
   * state.preview) — see the syncing effect below.
   */
  const [previewMessageId, setPreviewMessageId] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    getAiHealth()
      .then((h) => { if (!cancelled) setAiAvailable(h.available) })
      .catch(() => { if (!cancelled) setAiAvailable(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [messages])

  useEffect(() => () => abortRef.current?.abort(), [])

  // Drop the preview-message binding once the editor clears its preview
  // (Accept or Discard from the floating bar). Keeps the chat indicator in
  // sync without the dock having to know which button the user clicked.
  useEffect(() => {
    if (state.preview === null && previewMessageId !== null) {
      setPreviewMessageId(null)
    }
  }, [state.preview, previewMessageId])

  // Fix-it panel hands the original failing prompt back via pendingRetryPrompt.
  // Replay it here, close the panel so the user can inspect the new ghost on
  // the deck, and clear the slot so the effect doesn't re-fire on the next
  // render. The actual send call is below `send` so we use a ref to break the
  // circular dependency.
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {})
  useEffect(() => {
    const pending = state.fixIt.pendingRetryPrompt
    if (!pending || streaming) return
    actions.consumeRetryPrompt()
    actions.closeFixIt()
    void sendRef.current(pending)
  }, [actions, state.fixIt.pendingRetryPrompt, streaming])

  const send = useCallback(async (overrideText?: string) => {
    // Allow callers (currently: the Fix-it retry button) to invoke send
    // with an explicit prompt instead of pulling from the input field.
    // When omitted we use what's in the input as before.
    const text = (overrideText ?? input).trim()
    if (!text || streaming) return
    if (overrideText === undefined) setInput('')
    setStreaming(true)
    const userId = makeMsgId('u')
    const assistantId = makeMsgId('a')
    setMessages((prev) => [
      ...prev,
      { id: userId, role: 'user', content: text },
      { id: assistantId, role: 'assistant', content: '' },
    ])

    const history: AiConversationMessage[] = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const context = buildAiRequestContext(state)
      let assistantText = ''
      const drafted: PlateEvent[] = []
      const labwareAdditions: AiLabwareAddition[] = []
      const deterministicOnly = mode === 'precompile'
      for await (const event of streamDraftEvents(text, context, history, controller.signal, { deterministicOnly })) {
        if (event.type === 'text_delta') {
          assistantText += event.delta
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, content: assistantText } : m)),
          )
        } else if (event.type === 'draft') {
          drafted.push(...event.events)
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantId ? { ...m, draftedEvents: [...drafted] } : m)),
          )
        } else if (event.type === 'done') {
          drafted.splice(0, drafted.length, ...(event.result.events ?? []))
          labwareAdditions.splice(0, labwareAdditions.length, ...(event.result.labwareAdditions ?? []))
          const resultText = [
            assistantText,
            event.result.error ? `Error: ${event.result.error}` : '',
            ...(event.result.notes ?? []),
            assistantText ? '' : (event.result.clarificationNeeded ?? ''),
          ]
            .filter((part) => part.trim().length > 0)
            .join('\n\n')

          // Promote the draft into the editor's preview state so the deck
          // ghosts it and the floating Accept bar can commit. A non-empty
          // draft replaces any earlier preview (matches the user's chosen
          // "Replace" behavior).
          const platform = getPlatformManifest(state.platforms, state.platformId)
          const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)
          const { preview, skips } = buildPreviewFromDraft({
            platform,
            variant,
            events: drafted,
            labwareAdditions,
          })
          const hasPreview =
            preview.previewPlacements.length > 0 || preview.previewEvents.length > 0
          if (hasPreview) {
            actions.setPreview({
              ...preview,
              sourcePrompt: text,
              ...(skips.length > 0 ? { sourceSkips: skips } : {}),
            })
            setPreviewMessageId(assistantId)
          } else {
            // No actionable draft — drop any stale preview that might
            // still be on the deck from a previous prompt.
            actions.clearPreview()
            setPreviewMessageId(null)
          }

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: resultText || summarizeDrafts(drafted, labwareAdditions),
                    draftedEvents: [...drafted],
                    labwareAdditions: [...labwareAdditions],
                    ...(skips.length > 0 ? { previewSkips: skips } : {}),
                  }
                : m,
            ),
          )
        } else if (event.type === 'status') {
          setMessages((prev) => [
            ...prev,
            { id: makeMsgId('s'), role: 'status', content: event.message },
          ])
        } else if (event.type === 'error') {
          setMessages((prev) => [
            ...prev,
            { id: makeMsgId('e'), role: 'status', content: `Error: ${event.message}` },
          ])
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setMessages((prev) => [
        ...prev,
        { id: makeMsgId('e'), role: 'status', content: `Stream failed: ${message}` },
      ])
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }, [actions, input, messages, mode, state, streaming])

  // Keep the ref pointing at the latest send closure so the
  // pendingRetryPrompt effect can fire without re-running on every send
  // identity change.
  useEffect(() => {
    sendRef.current = send
  }, [send])

  return (
    <aside className="ai-dock" aria-label="AI assistant">
      <div className="ai-dock__log" ref={logRef}>
        {messages.length === 0 ? (
          <div className="ai-dock__empty">
            Ask the AI to draft events — e.g. "fill column 1 with 100 µL DMEM" or "transfer 10 µL
            from A1 of source to row A of dest".
          </div>
        ) : null}
        {messages.map((m) => (
          <div key={m.id} className="ai-dock__msg" data-role={m.role}>
            <span className="ai-dock__role">{m.role === 'user' ? 'you' : m.role === 'assistant' ? 'ai' : '·'}</span>
            <div className="ai-dock__bubble">
              <div className="ai-dock__text">{m.content || (m.role === 'assistant' && streaming ? '…' : '')}</div>
              {((m.draftedEvents?.length ?? 0) > 0 || (m.labwareAdditions?.length ?? 0) > 0) ? (
                <div className="ai-dock__events">
                  <span className="ai-dock__events-summary">
                    {summarizeDrafts(m.draftedEvents ?? [], m.labwareAdditions ?? [])}
                  </span>
                  {previewMessageId === m.id ? (
                    <span
                      className="ai-dock__preview-pill"
                      title="Use the Accept button on the deck to commit, or Discard to drop it."
                    >Preview on deck →</span>
                  ) : null}
                </div>
              ) : null}
              {m.previewSkips && m.previewSkips.length > 0 ? (
                <ul className="ai-dock__skips">
                  {m.previewSkips.map((skip, i) => (
                    <li key={i}>Skipped: {skip}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      <form
        className="ai-dock__input-row"
        onSubmit={(event) => {
          event.preventDefault()
          void send()
        }}
      >
        <div
          className="ai-dock__mode"
          role="radiogroup"
          aria-label="Drafting mode"
        >
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'precompile'}
            className="ai-dock__mode-opt"
            data-active={mode === 'precompile'}
            onClick={() => setMode('precompile')}
            disabled={streaming}
            title="Use the deterministic precompiler only — no LLM call."
          >Precompile</button>
          <button
            type="button"
            role="radio"
            aria-checked={mode === 'ai'}
            className="ai-dock__mode-opt"
            data-active={mode === 'ai'}
            onClick={() => setMode('ai')}
            disabled={streaming || aiAvailable === false}
            title={
              aiAvailable === false
                ? 'AI is not configured. Open Settings to add provider, model, and API key.'
                : 'Allow the LLM to assist when the deterministic precompiler is incomplete.'
            }
          >AI</button>
        </div>
        <input
          type="text"
          className="ai-dock__input"
          placeholder={streaming ? 'Streaming…' : 'Describe what to do…'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={streaming}
        />
        {streaming ? (
          <button
            type="button"
            className="ai-dock__send ai-dock__send--cancel"
            onClick={() => abortRef.current?.abort()}
          >Stop</button>
        ) : (
          <button type="submit" className="ai-dock__send" disabled={!input.trim()}>Send</button>
        )}
      </form>
    </aside>
  )
}
