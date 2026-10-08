/**
 * assistStream — minimal SSE client for the workspace AI panel.
 *
 * The backend's `/api/ai/assist/stream` endpoint accepts JSON and emits
 * Server-Sent Events, one JSON object per `data:` line. The supported
 * event types come from `server/src/ai/types.ts#AgentEvent`:
 *   - `status`: pipeline progress strings
 *   - `text_delta`: streamed assistant text chunks
 *   - `done`: final result payload
 *   - `error`: failure
 *   - `thinking`, `tool_call`, `tool_result`, `draft`,
 *     `pipeline_diagnostics`: observability events; ignored here
 *
 * The standard browser EventSource doesn't support POST, so this client
 * uses fetch + a streaming reader. Caller passes an AbortSignal for the
 * Stop button.
 */

import { API_BASE } from '../../../shared/api/base'
import type { AiClarificationAnswer, AiClarificationRequest, AiProtocolCandidateSummary, AiSourcePdfSummary } from '../../../types/ai'
import type { DraftTermRow } from './TermPanel'

/**
 * The compact ground-truth payload for the protocol ATTACHED to an
 * event-editor chat (PROTO-AI-6), populated app-side into the request
 * `context.attachedProtocol`. The server renders it as the ATTACHED PROTOCOL
 * prompt block plus the protocol_edit instruction section ONLY when present;
 * absent → neither. It rides in `context` (not a top-level field) so the
 * warm render and the real request share one cacheable prefix.
 * Mirrors `server/src/ai/types.ts#AttachedProtocolContext`.
 */
export interface AssistAttachedProtocol {
  recordId: string
  /** Current content sha of the attached record — the staleness anchor for
   *  expectedSha at proposal-apply time; absent until the record fetch lands. */
  sha?: string
  steps: Array<{ stepId: string; ordinal: number; label: string; kind?: string }>
  labwareRoles?: Array<{ roleId: string; description?: string; expectedLabwareKinds?: string[] }>
  instrumentRoles?: Array<{ roleId: string; description?: string; allowedInstrumentIds?: string[] }>
}

export interface AssistStreamRequest {
  prompt: string
  /** Surface id sent to the orchestrator. Workspace uses `workspace.<viewer>`
   *  so server-side telemetry / system-prompt selection can fork later. */
  surface: string
  /** Anything the agent should know about the active viewer / study. */
  context: Record<string, unknown>
  /** Prior conversation history — server expects `{role, content}`. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Answers to structured clarification requests from an earlier assistant turn. */
  clarificationAnswers?: AiClarificationAnswer[]
  /** Opt into the model's chain-of-thought (off by default — it's slow). */
  enableThinking?: boolean
  /** Protocol-planning step context injected so the AI adapts/ghosts ONE step. */
  protocolStepContext?: {
    stepId: string
    stepLabel: string
    highlightedSection: string
    selectedText: string
  }
  /**
   * PB-CH-4 — structured working focus: the step the ChatContextHeader shows
   * (`ProtocolSelectionContext.focusedStep`, display-only until now). Rides the
   * request TOP-LEVEL (like protocolStepContext) so the server renders it as
   * the WORKING FOCUS prompt block and the model can resolve "the step I'm
   * looking at". NOT folded into `context`: focus changes per turn and would
   * churn the KV warm prefix (attachedProtocol's stability precedent does not
   * apply). Mirrors `server/src/api/handlers/AIHandlers.ts#AssistBody.workingFocus`.
   */
  workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
}

/**
 * A protocol_edit proposal emitted by the server (PROTO-AI-7) and rendered by
 * the ChangesPanel diff (PROTO-AI-9). `ops` is the model's envelope ALREADY
 * validated server-side against the registered protocol-edit-op schema
 * (schema/workflow/protocol-edit-op.schema.yaml), re-emitted verbatim; the op
 * shape is schema-owned data, so it stays an opaque validated array here
 * rather than a hand-rolled TypeScript mirror of the op union.
 * `protocolId` is only the model's explicit override; when absent, the
 * attached-protocol scope of the conversation binds the target.
 * PROPOSE-NEVER-WRITE: the server writes NOTHING for this payload — Accept
 * (PROTO-AI-8) is the only path that applies it.
 */
export interface AiProtocolEditProposal {
  ops: unknown[]
  protocolId?: string
}

/**
 * The slice of the backend's AgentResult the chat panel can render. In
 * forced-draft-tool mode the model emits no prose at all — the entire answer
 * lives in this payload, so dropping it renders as "(no response)".
 */
export interface AssistDraftResult {
  success?: boolean
  events?: unknown[]
  /**
   * What each term in the draft matched (local record / ontology / vendor /
   * not yet in the lab), classified server-side for the term panel. Absent on
   * older payloads — the panel simply does not render.
   */
  termManifest?: DraftTermRow[]
  notes?: string[]
  labwareRequirements?: Array<{ classCurie?: string; deckSlot?: string; reason?: string }>
  labwareAdditions?: Array<{ recordId?: string; deckSlot?: string; reason?: string }>
  /**
   * Bench equipment the draft proposes (water bath, heat block, shaker…).
   * Equipment is NOT labware and never occupies a deck slot.
   */
  equipmentRequirements?: Array<{
    recordId?: string
    classCurie?: string
    handle?: string
    reason?: string
    settings?: Record<string, unknown>
    source?: string
  }>
  /** Records the draft wants CREATED (the add; nothing is written until Accept). */
  recordCreations?: Array<{
    kind?: 'equipment' | 'material' | 'labware'
    name?: string
    handle?: string
    classKind?: string
    classRecordId?: string
    curie?: string
    domain?: string
    labwareType?: string
    format?: { rows?: number; cols?: number; wellCount?: number }
    settings?: Record<string, unknown>
    source?: string
    reason?: string
  }>
  /** Place the created record on the bench in the same turn (explicit). */
  alsoPlace?: { surface?: 'lawn' | 'slot'; slotId?: string }
  /**
   * A protocol_edit proposal emitted via agent_intent (PROTO-AI-7). See
   * AiProtocolEditProposal — the server validates the envelope against the
   * registered schema and WRITES NOTHING; rendering is PROTO-AI-9, applying
   * (on Accept) is PROTO-AI-8.
   */
  protocolEdit?: AiProtocolEditProposal
  /** Draft-only ontology bindings; materialized into records on Accept. */
  ontologyBindings?: unknown[]
  clarificationNeeded?: string
  clarification?: { prompt?: string }
  clarificationRequests?: AiClarificationRequest[]
  error?: string
}

export interface PipelineDiagnosticItem {
  pass_id: string
  code: string
  severity: 'info' | 'warning' | 'error'
  message: string
}

export interface DraftEventProposal {
  eventId?: string
  event_type?: string
  details?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * PB-CH-4 — transport mirror of `schema/workflow/agent-action.schema.yaml`
 * after PB-CH-1's server-side compilation (THE SCHEMA IS THE AUTHORITY; this
 * is typing convenience for the stream, mirroring `server/src/ai/types.ts#
 * AgentActionPayload` — no import from server/**). A frame of this shape exists
 * ONLY as the output of the workspace-action compiler: a raw model proposal
 * never rides it. exactOptionalPropertyTypes discipline: optional fields are
 * OMITTED, never `undefined`.
 */
export type AgentActionTargetEnvelope =
  | { kind: 'protocol-step'; protocolId: string; stepId: string; label?: string }
  | { kind: 'record'; id: string; type?: string; label?: string }
  | { kind: 'ontology'; id: string; namespace?: string; label?: string; uri?: string }

export interface AgentActionEnvelope {
  action: 'focus' | 'open-surface'
  target?: AgentActionTargetEnvelope
  surface?: string
  contextNote?: string
  supportedBy?: AgentActionTargetEnvelope[]
}

/**
 * PB-CH-8 — transport mirror of `server/src/workspace-session/ledgerQuery.ts#
 * LedgerAnswerEnvelope` (no import from server/**; the same mirror discipline
 * as `AgentActionEnvelope` above). The frame is SERVER-BUILT fetched evidence:
 * the journal snapshot + server-known audit rows, never model narration.
 * exactOptionalPropertyTypes discipline: optional fields are OMITTED, never
 * `undefined`. `answerText` is the server's single wording authority — the
 * client renders it verbatim instead of re-composing reason prose.
 */
export type LedgerNoHistoryReason =
  | 'policy-disabled'
  | 'journal-empty'
  | 'predates-first-capture'
  | 'pruned'
  | 'no-anchor'
  | 'actor-unresolved'

export interface LedgerLabEventLine {
  recordId: string
  action: string
  occurredAt: string
  subjectId: string
}

export interface LedgerAnswerEnvelope {
  status: 'found' | 'no-history'
  /**
   * The server-known audit time the query was answered at (never
   * model-supplied). OPTIONAL (adversarial r2 F2, mirroring the server
   * envelope): present exactly when a server-known audit time exists; the
   * refusal paths (policy-disabled / actor-unresolved / no-anchor) OMIT the
   * key — the server never emits a fabricated epoch as observed time.
   */
  asOf?: string
  capturedAt?: string
  disclosure?: string
  links?: string[]
  reason?: LedgerNoHistoryReason
  labEvents?: LedgerLabEventLine[]
  integrity?: Array<{ file: string; reason: string }>
  answerText?: string
}

export type AssistStreamEvent =
  | { type: 'status'; message: string }
  | { type: 'text_delta'; delta: string }
  | { type: 'done'; result?: AssistDraftResult }
  | { type: 'error'; message: string }
  | { type: 'protocol_extracted'; candidate: AiProtocolCandidateSummary; sourcePdf?: AiSourcePdfSummary }
  // Observability events — the AI's actual tool trail + pipeline diagnostics.
  // These make the loop legible ("why did a 24-well land for a T25 request")
  // instead of dropping the model's resolved decisions.
  | { type: 'tool_call'; toolName: string; args: Record<string, unknown> }
  | { type: 'tool_result'; toolName: string; success: boolean; durationMs: number }
  | { type: 'pipeline_diagnostics'; outcome: string; diagnostics: PipelineDiagnosticItem[] }
  | { type: 'draft'; events: DraftEventProposal[] }
  // PB-CH-1's emission, mounted by PB-CH-4: the server-compiled tier-1 action.
  // Before this item the app union had no member for it and dispatchFrame
  // silently dropped it (grep agent_action app/src = 0).
  | { type: 'agent_action'; action: AgentActionEnvelope }
  // PB-CH-4 tier-2: the model's workstate INTENT — verbs and terms only. This
  // is NOT a compiled draft and is NOT actionable alone: POST /api/drafts/compile
  // (Ajv + canAccept) is the trust boundary, not this stream. Field name
  // `workstate` mirrors the server frame (AgentOrchestrator emits
  // {type:'workstate_proposal', workstate}).
  | { type: 'workstate_proposal'; workstate: Record<string, unknown> }
  // PB-CH-5 tier-2 (analysis): the model's analysis INTENT — verbs and terms
  // only, relayed verbatim. NOT a compiled draft and NOT actionable alone:
  // POST /api/drafts/compile (Ajv + canAccept) is the trust boundary, not this
  // stream. Field name `analysis` mirrors the server frame (AgentOrchestrator
  // emits {type:'analysis_proposal', analysis}).
  | { type: 'analysis_proposal'; analysis: Record<string, unknown> }
  // PB-CH-8: the ledger ANSWER — SERVER-BUILT fetched evidence (never model
  // narration). The client relays the envelope verbatim; `answerText` is the
  // server's single wording authority. Deliberately assistStream-only: the
  // generic `types/ai.ts` AiStreamEvent stack does not consume ledger answers
  // this task (the aiStreamTypes.pin.test.ts rationale — stated, not silent).
  | { type: 'ledger_answer'; answer: LedgerAnswerEnvelope }

/** Render a draft-tool result as chat text for panels with no preview canvas. */
export function summarizeDraftResult(result: AssistDraftResult | undefined): string | undefined {
  if (!result) return undefined
  if (result.error) return `Draft failed: ${result.error}`
  const clarificationRequests = Array.isArray(result.clarificationRequests) ? result.clarificationRequests : []
  if (clarificationRequests.length > 0) {
    return clarificationRequests.length === 1
      ? clarificationRequests[0]?.prompt
      : `${clarificationRequests.length} clarifications needed.`
  }
  const clarification = result.clarification?.prompt ?? result.clarificationNeeded
  if (clarification) return clarification
  const lines: string[] = []
  const events = Array.isArray(result.events) ? result.events.length : 0
  if (events > 0) lines.push(`Drafted ${events} event${events === 1 ? '' : 's'}.`)
  for (const req of result.labwareRequirements ?? []) {
    const what = req.classCurie ?? 'labware'
    lines.push(`Proposed labware: ${what}${req.deckSlot ? ` in slot ${req.deckSlot}` : ''}.`)
  }
  for (const add of result.labwareAdditions ?? []) {
    lines.push(`Proposed labware addition: ${add.recordId ?? 'unknown record'}${add.deckSlot ? ` in slot ${add.deckSlot}` : ''}.`)
  }
  // Equipment is not labware and has its own bucket: without this the panel told
  // the user "(no response)" for a draft that DID propose an instrument.
  for (const req of result.equipmentRequirements ?? []) {
    const what = req.handle ?? req.recordId ?? req.classCurie ?? 'equipment'
    const settings = req.settings && Object.keys(req.settings).length > 0
      ? ` (${Object.entries(req.settings).map(([k, v]) => `${k.replace(/_/g, ' ')} ${String(v)}`).join(', ')})`
      : ''
    lines.push(`Proposed equipment on the bench: ${what}${settings}.`)
  }
  // Records the draft wants authored: an equipment-only (or material/labware-only)
  // draft used to summarize to `undefined`, so the panel said "(no response)" for a
  // turn that DID propose something.
  for (const creation of result.recordCreations ?? []) {
    const source = creation.source ? `source: ${creation.source}` : 'no source stated'
    lines.push(`New ${creation.kind ?? 'record'} to create: ${creation.name ?? 'unnamed'} (${source}).`)
  }
  for (const note of result.notes ?? []) lines.push(note)
  return lines.length > 0 ? lines.join('\n') : undefined
}

export interface AssistStreamHandlers {
  onEvent: (event: AssistStreamEvent) => void
  signal?: AbortSignal
}

/**
 * Run one assist stream to completion. Resolves when the stream closes,
 * rejects on transport errors (NOT on `error` events — those surface
 * through `onEvent`). The caller is responsible for tracking AbortSignal
 * triggers and translating them into UI state.
 */
export async function runAssistStream(
  request: AssistStreamRequest,
  handlers: AssistStreamHandlers,
): Promise<void> {
  const response = await fetch(`${API_BASE}/ai/assist/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    ...(handlers.signal ? { signal: handlers.signal } : {}),
  })

  if (!response.ok) {
    handlers.onEvent({
      type: 'error',
      message: `HTTP ${response.status} ${response.statusText}`,
    })
    return
  }
  if (!response.body) {
    handlers.onEvent({
      type: 'error',
      message: 'No response body',
    })
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  // SSE frames are separated by `\n\n`. We buffer partial frames between
  // chunks so a frame split across reads still parses.
  let buffer = ''

  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      let sep = buffer.indexOf('\n\n')
      while (sep !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)
        dispatchFrame(frame, handlers.onEvent)
        sep = buffer.indexOf('\n\n')
      }
    }
    // Flush a trailing frame if the server didn't terminate with \n\n.
    if (buffer.trim().length > 0) {
      dispatchFrame(buffer, handlers.onEvent)
    }
  } catch (err) {
    // AbortError is expected when the user clicks Stop; surface as
    // cancellation rather than an error.
    if ((err as Error).name === 'AbortError') return
    handlers.onEvent({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  } finally {
    reader.releaseLock()
  }
}

function dispatchFrame(
  frame: string,
  onEvent: (event: AssistStreamEvent) => void,
): void {
  // Each frame is one or more lines; SSE spec allows multiple `data:`
  // continuation lines for one event. The backend writes single-line
  // JSON per frame, so we just strip the prefix.
  const lines = frame.split('\n')
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trimStart())
    }
  }
  if (dataLines.length === 0) return
  const payload = dataLines.join('\n')
  let parsed: { type?: string; message?: string; delta?: string; result?: AssistDraftResult; candidate?: AiProtocolCandidateSummary; sourcePdf?: AiSourcePdfSummary; toolName?: string; args?: Record<string, unknown>; success?: boolean; durationMs?: number; outcome?: string; diagnostics?: PipelineDiagnosticItem[]; events?: DraftEventProposal[]; action?: AgentActionEnvelope; workstate?: Record<string, unknown>; analysis?: Record<string, unknown>; answer?: LedgerAnswerEnvelope }
  try {
    parsed = JSON.parse(payload)
  } catch {
    // Server sent a malformed frame — surface as an inline error rather
    // than crashing the panel.
    onEvent({ type: 'error', message: `Malformed SSE frame: ${payload.slice(0, 80)}` })
    return
  }
  switch (parsed.type) {
    case 'status':
      onEvent({ type: 'status', message: parsed.message ?? '' })
      return
    case 'text_delta':
      onEvent({ type: 'text_delta', delta: parsed.delta ?? '' })
      return
    case 'done':
      onEvent({ type: 'done', ...(parsed.result ? { result: parsed.result } : {}) })
      return
    case 'error':
      onEvent({ type: 'error', message: parsed.message ?? 'Unknown error' })
      return
    case 'tool_call':
      onEvent({ type: 'tool_call', toolName: parsed.toolName ?? 'unknown', args: parsed.args ?? {} })
      return
    case 'tool_result':
      onEvent({ type: 'tool_result', toolName: parsed.toolName ?? 'unknown', success: parsed.success === true, durationMs: parsed.durationMs ?? 0 })
      return
    case 'pipeline_diagnostics':
      onEvent({ type: 'pipeline_diagnostics', outcome: parsed.outcome ?? 'unknown', diagnostics: Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [] })
      return
    case 'draft':
      onEvent({ type: 'draft', events: Array.isArray(parsed.events) ? parsed.events : [] })
      return
    case 'agent_action':
      // PB-CH-1's compiled action (the server only emits this after Ajv +
      // spine + registry resolution). Relay the envelope as-is — the mount
      // hands it to the executor; a malformed frame carries no action and is
      // dropped rather than guessed into one.
      if (parsed.action && typeof parsed.action === 'object' && (parsed.action.action === 'focus' || parsed.action.action === 'open-surface')) {
        onEvent({ type: 'agent_action', action: parsed.action })
      }
      return
    case 'workstate_proposal':
      // PB-CH-4 tier-2: relay the model's INTENT verbatim. NOT actionable
      // alone — the mount relays it to POST /api/drafts/compile, which is the
      // Ajv/canAccept trust boundary.
      if (parsed.workstate && typeof parsed.workstate === 'object' && !Array.isArray(parsed.workstate)) {
        onEvent({ type: 'workstate_proposal', workstate: parsed.workstate })
      }
      return
    case 'analysis_proposal':
      // PB-CH-5 tier-2 (analysis): same discipline — relay the model's INTENT
      // verbatim; the mount relays it to POST /api/drafts/compile (adapter
      // 'analysis'), which is the Ajv/canAccept trust boundary.
      if (parsed.analysis && typeof parsed.analysis === 'object' && !Array.isArray(parsed.analysis)) {
        onEvent({ type: 'analysis_proposal', analysis: parsed.analysis })
      }
      return
    case 'ledger_answer':
      // PB-CH-8: the SERVER-BUILT ledger answer (journal snapshot + server-
      // known audit rows — fetched evidence, never model narration). Relay the
      // envelope verbatim; a frame without a recognized status is DROPPED,
      // never guessed into an answer.
      if (parsed.answer && typeof parsed.answer === 'object' && !Array.isArray(parsed.answer)
        && (parsed.answer.status === 'found' || parsed.answer.status === 'no-history')) {
        onEvent({ type: 'ledger_answer', answer: parsed.answer as LedgerAnswerEnvelope })
      }
      return
    case 'protocol_extracted':
      if (parsed.candidate) {
        onEvent({
          type: 'protocol_extracted',
          candidate: parsed.candidate,
          ...(parsed.sourcePdf ? { sourcePdf: parsed.sourcePdf } : {}),
        })
      }
      return
    default:
      // thinking and genuinely unknown events are still ignored — they carry
      // no UI value in the chat surface.
      return
  }
}
