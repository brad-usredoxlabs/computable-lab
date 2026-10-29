/**
 * useAiChat — Core hook for AI chat panel state management.
 *
 * Accepts an AiContext interface so it can be used from any page surface.
 * When used from the labware editor, the caller builds the AiContext from editor state.
 * When used from other pages, the caller provides page-specific context.
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { flushSync } from 'react-dom'
import { streamAssist, getAiHealth } from '../api/aiClient'
import { apiClient } from '../api/client'
import {
  appendThreadMessage,
  getThread,
  listThreads,
  type ApplianceEndpoint,
  type ThreadSummary,
} from '../api/aiThreadClient'
import { parsePromptMentions } from '../lib/aiPromptMentions'
import type { PlateEvent } from '../../types/events'
import type { RecordRef } from '../../types/ref'
import type { AiContext, FileAttachment } from '../../types/aiContext'
import { labwareDefinitionRecordToPayload, type LabwareRecordPayload } from '../../types/labware'
import { getLabwareDefinitionById } from '../../types/labwareDefinition'
import type {
  ChatMessage,
  AiStreamEvent,
  AiHealthStatus,
  OntologyRefProposal,
  AiConversationMessage,
  AiLabwareAddition,
  InstrumentApplianceJob,
  PromptMention,
  AiAgentActionEnvelope,
  AiDraftRevisionContext,
  DraftOntologyBinding,
  AiClarification,
  AiClarificationRequest,
} from '../../types/ai'

const FALLBACK_APPLY_TO_GRAPH_TEXT = 'Apply the protocol to the labware graph.'
let _warnedFallbackOnce = false

// ---------------------------------------------------------------------------
// INSTR-READCHAIN-1 (b): the read-event chain the chatbot executor attaches to
// appliance executions. Resolved from RECORDS ONLY — the equipment id comes
// from the job's own instrumentRef, and the capable-verb set comes from the
// equipment-capability + verb-definition records. This is the read-time mirror
// of the join the server performs: DeclaredCapabilityGate's `read-event-verb`
// resolver (eventGraphRef -> event -> semanticKeyComponents.verb -> VERB-* by
// canonical) plus EquipmentCapabilityService's capability inventory.
// H1/H2: no verb literal and no equipment-id constant here — the canonical
// verb NAME arrives as verb-definition payload data.
// Deliberately CONSERVATIVE: the server's class<->realization closure
// (EquipmentKindRegistry) is NOT replicated, so this may under-attach;
// under-attachment falls through to the server's honest structured refusal,
// never a fabricated pass. ZERO or TWO-OR-MORE applicable events attach
// NOTHING — never "the first one" (over-attachment fabricates context).
// ---------------------------------------------------------------------------

function chainRefId(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const id = (value as Record<string, unknown>).id
  return typeof id === 'string' && id.length > 0 ? id : undefined
}

interface ResolvedReadEventChain {
  eventGraphId: string
  eventId: string
}

async function resolveReadEventChain(
  job: InstrumentApplianceJob,
  eventGraphId: string,
): Promise<ResolvedReadEventChain | null> {
  try {
    const equipmentId = chainRefId(job.request.instrumentRef)
    if (!equipmentId) return null

    const graphEnvelope = await apiClient.getRecord(eventGraphId)
    const events = (graphEnvelope.payload as { events?: unknown }).events
    if (!Array.isArray(events)) return null

    // Declared verbs of THIS equipment: its own capability records plus those
    // bound to its equipment class (direct join only — see the conservative
    // note above).
    const equipmentEnvelope = await apiClient.getRecord(equipmentId)
    const classId = chainRefId((equipmentEnvelope.payload as { equipmentClassRef?: unknown }).equipmentClassRef)

    const capabilityList = await apiClient.listRecordsByKind('equipment-capability', 200)
    const declaredVerbIds = new Set<string>()
    for (const envelope of capabilityList.records) {
      const payload = envelope.payload as {
        status?: unknown
        equipmentRef?: unknown
        equipmentClassRef?: unknown
        capabilities?: unknown
      }
      if (payload.status !== 'active') continue
      const matchesEquipment = chainRefId(payload.equipmentRef) === equipmentId
      const matchesClass = classId !== undefined && chainRefId(payload.equipmentClassRef) === classId
      if (!matchesEquipment && !matchesClass) continue
      const capabilities = Array.isArray(payload.capabilities) ? payload.capabilities : []
      for (const capability of capabilities) {
        const verbId = chainRefId((capability as { verbRef?: unknown })?.verbRef)
        if (verbId) declaredVerbIds.add(verbId)
      }
    }
    if (declaredVerbIds.size === 0) return null

    // VERB-* record ids -> their canonical NAME strings (data, not literals).
    const verbList = await apiClient.listRecordsByKind('verb-definition', 200)
    const canonicalVerbs = new Set<string>()
    for (const envelope of verbList.records) {
      const payload = envelope.payload as { kind?: unknown; id?: unknown; canonical?: unknown }
      if (payload.kind !== 'verb-definition') continue
      if (typeof payload.id !== 'string' || !declaredVerbIds.has(payload.id)) continue
      if (typeof payload.canonical === 'string' && payload.canonical.length > 0) canonicalVerbs.add(payload.canonical)
    }
    if (canonicalVerbs.size === 0) return null

    const candidates = events.filter((candidate) => {
      const event = candidate as { eventId?: unknown; semanticKeyComponents?: unknown }
      if (typeof event?.eventId !== 'string' || event.eventId.length === 0) return false
      const verb = (event.semanticKeyComponents as { verb?: unknown } | undefined)?.verb
      return typeof verb === 'string' && canonicalVerbs.has(verb)
    })
    if (candidates.length !== 1) return null

    return { eventGraphId, eventId: (candidates[0] as { eventId: string }).eventId }
  } catch {
    // A missing graph / equipment / capability fetch is treated as
    // no-applicable: no chain, no crash. The server's pre-flight owns the
    // structured refusal and the chat error surface already reports it.
    return null
  }
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`
}

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

async function resolveLabwareAdditionPayload(addition: AiLabwareAddition): Promise<LabwareRecordPayload> {
  const definitionPayload = labwareDefinitionRecordToPayload(addition.recordId)
  if (definitionPayload) return definitionPayload
  try {
    const record = await apiClient.getRecord(addition.recordId)
    if (record?.payload) return record.payload as unknown as LabwareRecordPayload
  } catch {
    // Seed/local labware ids are valid editor labware refs even when they are
    // not backed by /api/records.
  }
  return labwareRecordFallbackPayload(addition.recordId)
}

const MAX_HISTORY_MESSAGES = 20
const MAX_HISTORY_CONTENT_CHARS = 8_000
type LinearWellTemplate = { count: number; axis: 'x' | 'y' }

// ---------------------------------------------------------------------------
// L2-THREAD-SCOPED-1 — per-(tab, scope) thread-id mint.
//
// D3 fix: the map + mint is ONE module (`../api/threadTabIds`, spec §4.1/§4.7
// single getThreadTabId), imported by BOTH the hook (here: resolve/mint/
// switch) and the transport (aiThreadClient.threadHeaders). The hook's old
// local re-implementation of the same sessionStorage map
// (`cl.ai-thread-tab-ids`) is GONE — with two writers and two ephemeral-mint
// fallbacks, a no-sessionStorage context could disagree between the hydrated
// id and the per-request wire header id; one module closes that divergence.
// (The old rationale — pre-existing hook tests' vi.mock factories of
// aiThreadClient throwing on missing exports — is answered by putting the
// mint in its OWN module rather than forking it: the old hook tests' mock
// factories were NOT updated and need no re-export stubs; the static-import
// breakage that DID materialize is in the DECK test mocks, which stub
// aiThreadClient wholesale and gained a listThreads export (FIX2 D1).)
// ---------------------------------------------------------------------------

import {
  getThreadTabId as resolveTabThreadId,
  newThreadTabId as mintTabThreadEntry,
  setThreadTabId as writeTabThreadMapEntry,
} from '../api/threadTabIds'

function buildConversationHistory(messages: ChatMessage[]): AiConversationMessage[] {
  return messages
    .filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => (
      (message.role === 'user' || message.role === 'assistant')
      && !message.isStreaming
      && message.content.trim().length > 0
    ))
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, MAX_HISTORY_CONTENT_CHARS),
    }))
}

export type PreviewEventState = 'pending' | 'accepted' | 'rejected'

export interface UseAiChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  isAccepting: boolean
  previewEvents: PlateEvent[]
  previewLabwareAdditions: AiLabwareAddition[]
  previewEventStates: Map<string, PreviewEventState>
  executingApplianceJobIds: ReadonlySet<string>
  hasPreview: boolean
  unresolvedRefs: OntologyRefProposal[]
  /**
   * L2-CHAT-1: the honest-failure wall — a `success` done that produced
   * nothing mountable is a REPORTED failure in plain language, owned by its
   * turn (cleared on the next send). null when the last turn delivered
   * something or is still in flight. The universal port of AiTabPanel's
   * `honestWall` state.
   */
  honestWall: string | null
  /**
   * L2-CHAT-1 regatefix2 D1: the adoption REFUSAL the card must show
   * verbatim — set when the `onPreviewAccept` seam THROWS (e.g. the deck
   * lock conflict, `RunDeckLockConflictError`), cleared on a fresh apply
   * attempt, a successful adopt, or a discard. The card renders it as a
   * role=alert honest wall naming the cause; the staged preview stays
   * mounted (nothing half-applied — retry stays possible).
   */
  adoptionError: string | null
  /**
   * L2-CHAT-1 regatefix2 D2: the labware count the card shows — the
   * STAGED preview's truth, the same data the deck bar reads
   * (state.preview.previewPlacements via the onStagedExtras seam: a
   * placement per proposed new labware). Falls back to the done result's
   * additions count when the surface registers no seam (non-deck
   * surfaces). The card used to count previewLabwareAdditions alone —
   * empty on the shorthand path the gate ran ("1 event · 0 new labware"
   * vs the bar's "1 new labware, 1 event" over the SAME staged preview).
   */
  previewStagedLabwareCount: number
  inputText: string
  sendPrompt: (prompt: string, attachments?: FileAttachment[]) => void
  cancelStream: () => void
  acceptPreview: () => void
  acceptPreviewWithResolutions: (resolutions: Map<string, RecordRef>) => void
  rejectPreview: () => void
  setPreviewEventState: (eventId: string, state: PreviewEventState) => void
  setPreviewEvents: (events: PlateEvent[]) => void
  commitAcceptedPreviewEvents: () => Promise<void>
  /**
   * L2-SUITE-A-uifix2 FIX2 [D6]: the one-shot CLEAR for a staged chat preview
   * that was committed by ANOTHER acceptor — the deck bar (PreviewActionBar →
   * adoptStagedPreview → commitPreview). The deck bar commits the EDITOR
   * preview (state.preview nulls inside the reducer) but leaves the chat
   * hook's `previewEvents` staged: `hasPreview` stays true, so the
   * ChatPreviewCard keeps ACTIVE Apply/Discard chrome over an already-applied
   * batch (dead chrome + a second-Apply risk), and the next send's
   * `revising` check (sendPrompt) sees the stale staged batch and appends a
   * "Previous preview was auto-rejected." line — though the batch was
   * ACCEPTED, not rejected. The deck bar calls this (through the registered
   * chat) from its post-adoption hook, naming the persisted commit's sha so
   * the summary is honest about what superseded the staged state. A no-op
   * when nothing is staged (the chat-Apply adopter already cleared it — the
   * one-adopter invariant holds either way).
   */
  clearStagedPreviewForExternalCommit: (commitSha?: string) => void
  clearHistory: () => void
  applyToGraph: (message: ChatMessage) => void
  executeInstrumentApplianceJob: (job: InstrumentApplianceJob) => Promise<void>
  aiAvailable: boolean | null
  recheckHealth: () => void
  thinkingMode: boolean
  setThinkingMode: (value: boolean) => void
  /**
   * L2-THREAD-SCOPED-1: the ACTIVE thread id of the current scope. Only
   * present when the chat is thread-scoped (an `endpoint` is set) — absent
   * (not undefined) on in-memory chats so exactOptional surfaces never see a
   * dangling key. The picker reads it and `switchThread`/`newThread` drive it.
   */
  threadId?: string
  /**
   * Switch the active thread (picker selection of a LISTED thread). Resets
   * the chat state (messages + the persist/hydration refs) so the chosen
   * thread REHYDRATES — without the reset the `prev.length > 0` guard keeps
   * the old thread's messages and the stale persisted ids re-post them into
   * the new thread (reviewer bait #11). Absent without an `endpoint`.
   */
  switchThread?: (threadId: string) => void
  /**
   * Mint a FRESH thread for the current scope ("New thread"). Same reset
   * semantics as `switchThread`. Absent without an `endpoint`.
   */
  newThread?: () => void
  /**
   * L2-THREAD-SCOPED-1: fetch the user's threads for THIS chat's
   * (endpoint, scope) — feeds the picker. The endpoint/scope ride the
   * closure (the pane stays a pure consumer and never re-derives thread
   * identity). Absent without an `endpoint`.
   */
  listThreads?: () => Promise<ThreadSummary[]>
}

/**
 * Callback that the host page provides so accepted events can be applied.
 * For the labware editor this calls addEvent; other pages can provide a no-op
 * or their own handler.
 */
export type AcceptEventHandler = (event: PlateEvent) => void

/**
 * L2-CHAT-1 FIX3 D1: the outcome of a COMPLETE adoption (the `onPreviewAccept`
 * seam's return). Structurally identical to deckAdoption.DeckAdoptionResult —
 * declared here (shared/hooks must not import event-editor) so the deck core
 * stays assignable to it in one direction only.
 */
export interface DeckAdoptionOutcome {
  adopted: boolean
  /** Refused at the ontology sign-off gate: unsigned decisionNeeded terms. */
  blocked?: number
  /** Adopted: the counts of what was ACTUALLY committed (for the summary
   *  line — never "Accepted N events." while labware/placements were
   *  silently dropped). */
  eventCount?: number
  placementCount?: number
  labwareCount?: number
  /** L2-SUITE-A-uifix2 FIX2 [D6]: the persisted commit's sha (the record's
   *  advanced contentSha) — present on a completed adoption (the deck core
   *  carries `persisted.commit.sha`). The external-commit clear seam uses it
   *  to name the commit that supersedes the chat-side staged state. */
  commitSha?: string
}

/**
 * L2-CHAT-1 FIX3 D1: the full staged preview handed to `onPreviewAccept`
 * (structurally compatible with deckAdoption.DeckPreviewLike / the
 * editor's EventEditorPreview).
 */
export interface DeckPreviewLike {
  previewEvents: PlateEvent[]
  previewLabwares: Record<string, unknown>
  previewEquipments?: Record<string, unknown>
  previewPlacements: unknown[]
  ontologyBindings?: unknown[]
  recordCreations?: unknown[]
  sourcePrompt?: string
}

/**
 * L2-CHAT-1 — an event-bearing proposal the universal chat just staged.
 * Surfaces that own a deck (event editor) register a handler to mount the
 * proposal as GHOSTS on the editor state (the universal port of AiTabPanel's
 * buildPreviewFromDraft seam, AiTabPanel.tsx:608-669).
 */
export interface AiProposalDraft {
  events: PlateEvent[]
  labwareAdditions: AiLabwareAddition[]
  /**
   * Resolved placement offers (REVISE-GHOST-1 fix3 shape): labware hints the
   * pipeline bound against real inventory records. Ghosted as placements of
   * the EXISTING record (keyed by recordId), never a re-creation.
   */
  resolvedLabwares?: Array<{ hint?: string; recordId: string; title?: string }>
  /** The prompt that produced this draft. */
  prompt: string
  // NOTE (L2-CHAT-1 FIX1 D7): this draft carries NO `revisionHistory` field.
  // The deck ghost mount (useDeckGhostMount) rebuilds its OWN trail from
  // state.preview (the mounted preview's trail — CURRENT draft's prompt), and
  // the server-bound trail lives separately on AiDraftRevisionContext
  // (previous drafts' prompts). A single `revisionHistory` here read as live
  // but was never read by its only consumer — two different "trail" values.
}

/**
 * Callback for adding labware from a record.
 */
export type AddLabwareFromRecordHandler = (record: Record<string, unknown>, addition?: AiLabwareAddition) => void

export interface UseAiChatOptions {
  /** Page-level AI context — determines surface and context payload. */
  aiContext: AiContext
  /**
   * Appliance endpoint this chat belongs to. When set, the hook hydrates
   * messages from `/api/ai/threads/:endpoint` on mount and appends each new
   * message back so the conversation survives a page reload. When omitted,
   * the chat lives in memory only — used by legacy surfaces during the
   * Phase 2 → Phase 7 migration.
   */
  endpoint?: ApplianceEndpoint
  /**
   * L2-THREAD-SCOPED-1 (SUITEA-D3 deck-scope amendment): the surface's
   * INSTANCE identity — for the deck surface, the loaded event-graph
   * recordId. Threads key on (user, endpoint, scope, threadId): one thread
   * per (tab, scope). Surfaces without an instance identity omit this (the
   * server places them under its reserved "_" scope). A scope CHANGE re-keys
   * the chat: a distinct per-scope tab id is used and the new scope's thread
   * rehydrates (the first deck's messages are never carried into the second).
   */
  scope?: string
  /** Handler called for each accepted preview event. */
  proposalScopeKey?: string
  onSequenceProposal?: (proposal: Record<string, unknown>, userRequest?: string) => void
  onAcceptEvent?: AcceptEventHandler
  /**
   * L2-CHAT-1: called when the universal chat stages an event-bearing
   * proposal (a done with mountable events). Deck-owning surfaces use it to
   * mount the proposal as ghosts on the editor state.
   */
  onProposalDrafted?: (draft: AiProposalDraft) => void
  /**
   * L2-SUITE-A-uifix1 D1: called when a done delivers a `deckLayout`
   * (the server's deck_layout turn — `AgentOrchestrator` returns
   * `{ success: true, deckLayout: { platformId, variantId } }`). The universal
   * done arm had NO mount arm for it (the "NO universal arm" comment below),
   * so a "navigate to the freeform deck" turn left the deck unchanged and
   * only an honest wall showed. Deck-owning surfaces wire it to the SAME
   * native editor actions the manual deck bar uses
   * (`actions.setPlatform` + `actions.setVariant`) — the client guards the
   * variant against the platform manifest (the server validates loosely).
   * Returns whether the layout was ACCEPTED (mounted) — the surface's guard
   * may REFUSE (unknown platform/variant), and the done arm gates the
   * empty-success bubble on the mount SUCCEEDING, not on the seam being
   * registered (L2-SUITE-A-uifix1 F4 fix1: a refused mount left the deck
   * unchanged while the bubble was suppressed as if it had changed). A
   * handler returning void (legacy callers) is treated as accepted.
   */
  onDeckLayout?: (deckLayout: { platformId: string; variantId: string }) => boolean | void
  /**
   * L2-CHAT-1: called when the staged preview is discarded (Discard). Deck
   * surfaces use it to clear the ghosted preview.
   */
  onPreviewDiscarded?: () => void
  /**
   * L2-CHAT-1 FIX3 D1: the COMPLETE-adopter seam. When a deck-owning surface
   * (DeckSurfaceChat / RunSurfaceChatBridge) registers this, a chat-card
   * Apply commits the FULL staged editor preview — events + previewLabwares
   * + previewPlacements + recordCreations + ontologyBindings — through the
   * shared deck adoption core (deckAdoption.adoptStagedPreview) with the
   * deck bar's exact materialize/persist ordering, instead of the raw
   * per-event append below (which rides only when this seam is ABSENT).
   * A refused adoption (unsigned decisionNeeded ontology terms) returns
   * { adopted: false, blocked } and the ghost STAYS mounted — the hook
   * reports the refusal visibly and keeps its staged state. Only a
   * SUCCESSFUL adoption clears the staged state (the editor's commit_preview
   * nulls the ghost), so a later deck-bar commit is a no-op: one adopter
   * stays one.
   */
  onPreviewAccept?: (preview: DeckPreviewLike) => Promise<DeckAdoptionOutcome>
  /**
   * L2-CHAT-1 FIX3 D1+D3: the staged EXTRAS the ghost mount put on the
   * editor's preview that the universal hook doesn't hold itself. Deck-
   * owning surfaces wire it from state.preview (the same object
   * useDeckGhostMount staged): previewLabwares / previewPlacements /
   * previewEquipments / ontologyBindings / recordCreations feed the
   * adoption commit (D1); sourceSkips + ontologyBindings feed a revise
   * turn's draftRevision.currentPreviewDraft (D3, legacy AiTabPanel
   * parity — AiTabPanel.tsx previewDraft builder).
   */
  onStagedExtras?: () => {
    previewLabwares?: Record<string, unknown>
    previewPlacements?: unknown[]
    previewEquipments?: Record<string, unknown>
    ontologyBindings?: unknown[]
    recordCreations?: unknown[]
    /** The ghost mount stages [] (MOUNT-NONEVENT-1) — carried for legacy
     *  draftRevision parity anyway (always empty in practice). */
    labwareRequirements?: unknown[]
    sourceSkips?: string[]
  } | null
  /** Handler called to add labware from a record (for AI-proposed additions). */
  onAddLabwareFromRecord?: AddLabwareFromRecordHandler
  /**
   * PB-CH-6 — the wave-1 channel envelopes ride the generic stack now.
   * `onWorkstateProposal` receives the tier-2 INTENT verbatim (the mount
   * relays it to POST /api/drafts/compile via `useWorkstateProposalFlow` —
   * the trust boundary is the compile, not this stream). `onAgentAction`
   * receives the server-compiled tier-1 envelope and may return a diagnostic
   * string to surface in the chat. When NO callback is registered the frame
   * is surfaced as a NAMED system bubble — never swallowed (task verbatim:
   * "missing capability = explicit tested behavior, never a silent no-op").
   */
  onWorkstateProposal?: (intent: Record<string, unknown>) => void
  /**
   * PB-CH-5 repair — the analysis INTENT rides the same discipline: the
   * mount relays it verbatim to POST /api/drafts/compile (adapter
   * 'analysis') via `useWorkstateProposalFlow`; the trust boundary is the
   * compile, not this stream. With NO callback registered the frame becomes
   * a NAMED system bubble — never swallowed (same rule as above).
   */
  onAnalysisProposal?: (analysis: Record<string, unknown>) => void
  /**
   * QMS7-7 (OQ1 ruling A) — the record-drafting INTENT rides the same
   * discipline: the mount relays it verbatim to POST /api/drafts/compile
   * (adapter 'record-drafting') via `useWorkstateProposalFlow`; the trust
   * boundary is the compile, not this stream. With NO callback registered the
   * frame becomes a NAMED system bubble — never swallowed (same rule).
   */
  onRecordDraftProposal?: (recordDraft: Record<string, unknown>) => void
  /**
   * MATRES-CHAIN (OQ-3(a) ratified) — the execute-chain INTENT rides the same
   * discipline: the mount relays it verbatim to POST /api/drafts/compile
   * (adapter 'chain') via `useWorkstateProposalFlow`; the trust boundary is
   * the compile (Ajv chain-draft + lint + DATA arithmetic + canAccept), not
   * this stream. With NO callback registered the frame becomes a NAMED system
   * bubble — never swallowed (same rule).
   */
  onChainProposal?: (chain: Record<string, unknown>) => void
  onAgentAction?: (action: AiAgentActionEnvelope) => string | undefined
}

// regatefix2-fix1 D4: a stable EMPTY for the staged-truth memo dep — a fresh
// {} per render would churn the dependency whenever no staged seam is
// registered (non-deck surfaces), recomputing the count every render.
const EMPTY_STAGED_LABWARES = Object.freeze({})

/**
 * L2-SUITE-A-uifix1 D3 — the LEGACY clarification shape the ChatLog
 * clarification BLOCK arm (ChatLog.tsx:196) consumes, derived from a typed
 * request when the done payload carries only `clarificationRequests`.
 *
 * Why: the server's needs-clarification arm (shorthandChat.ts:1342+) returns
 * the typed requests; the gate's P4/P5/P6 browser turns consumed exactly that
 * shape (events=0, clarificationRequests=1|2|1) and rendered zero cards.
 * ChatLog has TWO render arms — the legacy `message.clarification` block
 * (196) and the typed `message.clarificationRequests` cards (197). The hook
 * already rode the typed requests verbatim (1169-1171); the legacy field
 * stayed absent, and the false empty-success bubble (which fired
 * UNCONDITIONALLY — see the done arm below) claimed "did not propose any
 * changes" beside the turn's own questions. Deriving the legacy shape from
 * the FIRST request keeps both arms fed from ONE payload — the picker
 * (menuProvider '/m') and the option list ('choice') both render.
 */
function legacyClarificationFromRequests(
  requests: AiClarificationRequest[] | undefined,
): AiClarification | null {
  const first = requests?.[0]
  if (!first) return null
  const kind: AiClarification['entityType'] =
    first.entityType ?? first.kind
  return {
    id: first.id,
    prompt: first.prompt,
    entityType: kind,
    menuProvider: first.menuProvider,
    options: first.options,
    ...(first.query !== undefined ? { query: first.query } : {}),
    ...(first.allowCreateLocal !== undefined ? { allowCreateLocal: first.allowCreateLocal } : {}),
  }
}

export function useAiChat({ aiContext, endpoint, scope, onAcceptEvent, onAddLabwareFromRecord, onSequenceProposal, proposalScopeKey, onWorkstateProposal, onAnalysisProposal, onRecordDraftProposal, onChainProposal, onAgentAction, onProposalDrafted, onPreviewDiscarded, onPreviewAccept, onStagedExtras, onDeckLayout }: UseAiChatOptions): UseAiChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isAccepting, setIsAccepting] = useState(false)
  const [previewEvents, setPreviewEvents] = useState<PlateEvent[]>([])
  const [previewLabwareAdditions, setPreviewLabwareAdditions] = useState<AiLabwareAddition[]>([])
  const [previewEventStates, setPreviewEventStatesMap] = useState<Map<string, PreviewEventState>>(new Map())
  // L2-CHAT-1 — the universal honest-failure wall: a done result that produced
  // nothing (the ONE shared rule, draftEmptiness.draftProducedNothing) is a
  // REPORTED failure in plain language, owned by its turn. AiTabPanel's
  // `honestWall` state ported to the generic stack.
  const [honestWall, setHonestWall] = useState<string | null>(null)
  // L2-CHAT-1 regatefix2 D1 — the adoption REFUSAL the card renders as a
  // visible honest wall (the onPreviewAccept seam threw; e.g. the deck lock
  // conflict). Null when the last apply attempt succeeded or was not yet
  // made. Owned by the apply attempt — cleared on the next attempt, on a
  // successful adopt, and on discard.
  const [adoptionError, setAdoptionError] = useState<string | null>(null)
  // L2-CHAT-1 — the revision trail: prompts that produced staged drafts in
  // the current draft chain. Carries back to the server as
  // `draftRevision.revisionHistory` (the structured context AiTabPanel's
  // context builder sends, AiTabPanel.tsx:308-315).
  const revisionTrailRef = useRef<{ prompt: string; createdAt: string }[]>([])
  // The staged draft's own source prompt + staging time (set by the done
  // handler); joined into the trail when the NEXT send revises it.
  const stagedSourceRef = useRef<{ prompt: string; createdAt: string } | null>(null)
  const [unresolvedRefs, setUnresolvedRefs] = useState<OntologyRefProposal[]>([])
  const [executingApplianceJobIds, setExecutingApplianceJobIds] = useState<Set<string>>(() => new Set())
  const [aiAvailable, setAiAvailable] = useState<boolean | null>(null)
  const [inputText, setInputText] = useState('')

  // Thinking-mode toggle — persisted in localStorage, default off.
  const [thinkingMode, _setThinkingMode] = useState<boolean>(() => {
    try {
      return JSON.parse(localStorage.getItem('ai-assistant-thinking-mode') ?? 'false') === true
    } catch {
      return false
    }
  })
  const setThinkingMode = useCallback((v: boolean) => {
    _setThinkingMode(v)
    try {
      localStorage.setItem('ai-assistant-thinking-mode', JSON.stringify(v))
    } catch {
      /* ignore quota errors */
    }
  }, [])

  // Fetched apply-to-graph template from prompt-templates registry.
  const [applyToGraphTemplate, setApplyToGraphTemplate] = useState<string | null>(null)

  const abortRef = useRef<AbortController | null>(null)
  const isAcceptingRef = useRef(false)

  // Session-level cache: ontology CURIE → RecordRef from previous material creation.
  const resolvedCache = useRef<Map<string, RecordRef>>(new Map())

  // Keep a stable ref to the latest aiContext so callbacks don't go stale.
  const proposalScopeRef = useRef(proposalScopeKey)
  proposalScopeRef.current = proposalScopeKey
  const sequenceProposalRef = useRef(onSequenceProposal)
  sequenceProposalRef.current = onSequenceProposal
  const aiContextRef = useRef(aiContext)
  aiContextRef.current = aiContext

  const onAcceptEventRef = useRef(onAcceptEvent)
  onAcceptEventRef.current = onAcceptEvent
  // L2-CHAT-1: ghost-mount seam — stable-ref convention (same as the
  // callbacks above) so the done handler always calls the LATEST handler.
  const onProposalDraftedRef = useRef(onProposalDrafted)
  onProposalDraftedRef.current = onProposalDrafted
  // L2-SUITE-A-uifix1 D1: the deck_layout seam — same stable-ref convention.
  const onDeckLayoutRef = useRef(onDeckLayout)
  onDeckLayoutRef.current = onDeckLayout
  const onPreviewDiscardedRef = useRef(onPreviewDiscarded)
  onPreviewDiscardedRef.current = onPreviewDiscarded
  // L2-CHAT-1 FIX3 D1+D3: the COMPLETE-adopter seam + the staged-extras
  // reader — same stable-ref convention (sendPrompt/acceptPreview are
  // memoized; the refs keep the latest host wiring live).
  const onPreviewAcceptRef = useRef(onPreviewAccept)
  onPreviewAcceptRef.current = onPreviewAccept
  const onStagedExtrasRef = useRef(onStagedExtras)
  onStagedExtrasRef.current = onStagedExtras
  // L2-CHAT-1 regatefix2 D2 — the STAGED labware truth the card shows: the
  // count of previewLabwares the ghost mount staged on the editor's preview
  // (the onStagedExtras seam — the same data the deck bar's "N new labware"
  // reads). The staged truth is a memo DEPENDENCY (regatefix2-fix1 D4), so
  // the count tracks staged-preview mutations even when no chat turn moves
  // previewEvents / previewLabwareAdditions. No seam (non-deck surface) or
  // empty staged labwares → fall back to the done result's additions count —
  // never a fabricated number, never the misreport of counting only the
  // additions while the deck stages more (or fewer) labwares. (Placed after
  // onStagedExtrasRef — an earlier position would hit the ref's temporal
  // dead zone on the first render.)
  // regatefix2-fix1 D4 (gate defect D4): read the staged truth ONCE per render
  // so the count memo can TRACK it as a dependency. The memo used to recompute
  // only on [previewEvents, previewLabwareAdditions] — a staged-extras change
  // that did not move those two arrays (an editor-preview mutation without a
  // new chat turn) left the memo stale and, on the shorthand path (the done
  // result's additions are EMPTY), the count fell back to 0 (the gate's
  // "1 event · 0 new labware" misreport). The seam read is a cheap pure read
  // of the host's editor preview (the same data the deck bar reads);
  // `?? EMPTY_STAGED_LABWARES` keeps the dep STABLE (a frozen shared object)
  // when no seam is registered, so non-deck surfaces don't churn the memo.
  const stagedPreviewLabwares =
    onStagedExtrasRef.current?.()?.previewLabwares ?? EMPTY_STAGED_LABWARES
  const previewStagedLabwareCount = useMemo(() => {
    const staged = Object.keys(stagedPreviewLabwares).length
    if (staged > 0) return staged
    return previewLabwareAdditions.length
    // stagedPreviewLabwares is a per-render dep (the staged truth); the ref
    // read above keeps it live. The rest of the closure is intentionally
    // stable (ref-backed), so the deps list is exhaustive by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stagedPreviewLabwares, previewEvents, previewLabwareAdditions])
  // Ref to the labware addition handler.
  const addLabwareFromRecordRef = useRef(onAddLabwareFromRecord)
  addLabwareFromRecordRef.current = onAddLabwareFromRecord

  // PB-CH-6: same stable-ref convention as aiContext/onAcceptEvent above —
  // sendPrompt is memoized, so reading the callbacks directly would capture
  // the FIRST render's versions (e.g. a flow whose registry seam had not
  // loaded yet). The refs keep the latest host callbacks live.
  const workstateProposalRef = useRef(onWorkstateProposal)
  workstateProposalRef.current = onWorkstateProposal
  // PB-CH-5 repair: same stable-ref convention for the analysis INTENT.
  const analysisProposalRef = useRef(onAnalysisProposal)
  analysisProposalRef.current = onAnalysisProposal

  // QMS7-7 (OQ1 ruling A): the record-drafting INTENT relay (same ref pattern).
  const recordDraftProposalRef = useRef(onRecordDraftProposal)
  recordDraftProposalRef.current = onRecordDraftProposal
  // MATRES-CHAIN (OQ-3(a)): the execute-chain INTENT relay (same ref pattern).
  const chainProposalRef = useRef(onChainProposal)
  chainProposalRef.current = onChainProposal
  const agentActionRef = useRef(onAgentAction)
  agentActionRef.current = onAgentAction

  // ---- Thread persistence ------------------------------------------------
  //
  // When the host page provides `endpoint`, hydrate the chat from the server
  // thread on mount and append each subsequent message back. The `persisted`
  // set tracks which message ids have already been pushed so re-renders
  // don't double-post.
  //
  // L2-THREAD-SCOPED-1: the thread is the (endpoint, scope, threadId) thread.
  // `threadId` is the tab's minted id for the current scope (the client's
  // mint-once per (tab, scope); absent scope = the server's reserved "_"
  // scope). Hydration + sync effects key on [endpoint, scope, threadId]; a
  // threadId CHANGE (picker switch / New thread / deck navigation) resets
  // messages + the persist/hydration refs so the new thread REHYDRATES —
  // the stale `prev.length > 0` guard and stale persisted ids would
  // otherwise keep the old thread's messages and re-post them into the new
  // thread (reviewer bait #11).
  const persistedIdsRef = useRef<Set<string>>(new Set())
  const hydratedRef = useRef(false)
  /** The last (scope, threadId) key the hydration effect ran for (reset-on-re-key). */
  const lastThreadKeyRef = useRef<string | null>(null)
  // L2-THREAD-SCOPED-1: the tab's thread for the current scope. The map
  // lives in sessionStorage (`cl.ai-thread-tab-ids`) and is SHARED with the
  // client (aiThreadClient.threadHeaders reads/mints the SAME key — one
  // source of truth for the wire, coordinated through storage). This state
  // is the hook's view: the hydration/sync RE-KEY token AND the picker's
  // active selection (exposed as `threadId`). The (scope, id) PAIR is held
  // together so a re-key never sees a stale (old scope, old id) combination.
  const [activeThread, setActiveThread] = useState<{ scope: string; id: string } | null>(null)

  const resetChatState = useCallback(() => {
    setMessages([])
    persistedIdsRef.current = new Set()
    hydratedRef.current = false
  }, [])

  const switchThread = useCallback(
    (id: string) => {
      if (!endpoint) return
      writeTabThreadMapEntry(scope, id)
      resetChatState()
      setActiveThread({ scope: scope ?? '', id })
    },
    [endpoint, scope, resetChatState],
  )

  const newThread = useCallback(() => {
    if (!endpoint) return
    const id = mintTabThreadEntry(scope)
    resetChatState()
    setActiveThread({ scope: scope ?? '', id })
  }, [endpoint, scope, resetChatState])

  // The picker's data seam: the user's threads for THIS chat's (endpoint,
  // scope). The endpoint/scope ride the closure so the pane stays a pure
  // consumer. (The client sends the tab's (scope, id) headers with the
  // request; the list is scope-scoped, so the id is incidental.)
  const listThreadsForChat = useCallback((): Promise<ThreadSummary[]> => {
    if (!endpoint) return Promise.resolve([])
    return listThreads(endpoint, { ...(scope ? { scope } : {}) }).then((r) => r.threads)
  }, [endpoint, scope])

  // Lazy mint: resolve the tab's id for the current scope (mint-once; a
  // reload or a return to a previously-visited scope reuses the stored id).
  // Runs again when the scope CHANGES (the state still holds the previous
  // scope's pair) — the in-effect re-key reset below then clears the chat
  // for the new (scope, threadId) key.
  useEffect(() => {
    if (!endpoint) return
    const id = resolveTabThreadId(scope)
    setActiveThread({ scope: scope ?? '', id })
  }, [endpoint, scope])

  useEffect(() => {
    if (!endpoint) {
      hydratedRef.current = true
      return
    }
    // The tab thread resolves in the lazy-mint effect (one render later) —
    // skip until then so the hydration GET carries the resolved (scope, id)
    // pair (avoids a duplicate pre-mint GET; both would mint the SAME id
    // anyway).
    if (!activeThread) return
    // Re-key reset (L2-THREAD-SCOPED-1 bait #11): a CHANGED (scope,
    // threadId) key — picker switch, New thread, OR a scope change (deck
    // navigation, where the lazy-mint effect resolves the new scope's id) —
    // clears the chat so the new thread REHYDRATES (fresh persisted ids; no
    // stale-message carryover; no re-post into the new thread).
    const threadKey = `${activeThread.scope}\u0000${activeThread.id}`
    if (lastThreadKeyRef.current !== null && lastThreadKeyRef.current !== threadKey) {
      setMessages([])
      persistedIdsRef.current = new Set()
    }
    lastThreadKeyRef.current = threadKey
    let cancelled = false
    hydratedRef.current = false
    const threadOpts = { ...(activeThread.scope ? { scope: activeThread.scope } : {}) }
    getThread(endpoint, threadOpts)
      .then((thread) => {
        if (cancelled) return
        if (thread.messages.length > 0) {
          const hydrated: ChatMessage[] = thread.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m, idx) => ({
              id: `persisted-${idx}-${m.createdAt}`,
              role: m.role as 'user' | 'assistant',
              content: m.content,
              ...(m.metadata?.sequenceProposal ? { sequenceProposal: m.metadata.sequenceProposal as Record<string, unknown> } : {}),
              ...(typeof m.metadata?.sequenceProposalRequest === 'string' ? { sequenceProposalRequest: m.metadata.sequenceProposalRequest } : {}),
              // A clarifier survives a reload WITH its answering surface: the
              // menuProvider/query/options are what make it answerable. Dropping
              // them left a persisted question with nothing to pick (or, before
              // ChatLog was guarded, a bordered EMPTY box).
              ...(m.metadata?.clarification ? { clarification: m.metadata.clarification as NonNullable<ChatMessage['clarification']> } : {}),
              // L2-CHAT-UI-1 LEG A (A3): ride the shorthand back so the
              // intent card survives a reload (key ABSENT when never
              // persisted — never undefined).
              ...(typeof m.metadata?.shorthand === 'string' ? { shorthand: m.metadata.shorthand } : {}),
              // L2-SUITE-A-uifix3 [D3-CHROME] (regate-5 defect 3, chrome slice):
              // mark the RESTORED message. Its answer inputs (the picker's
              // search field, the option buttons) do NOT survive a reload in
              // any answerable form — the typed requests are session-only and
              // the legacy field carries no `restored`-suppressed live state —
              // so ChatLog renders NEITHER for a historical card turn (inputs
              // belong to live staged cards only). Without the flag the
              // legacy-only menu-backed shape fell into ChatLog's block arm
              // and mounted the real ClarificationPicker, whose search input
              // always renders: the gate's 8 bare "Search labware…" boxes.
              restored: true,
              timestamp: Date.parse(m.createdAt) || Date.now(),
            }))
          hydrated.forEach((m) => persistedIdsRef.current.add(m.id))
          setMessages((prev) => (prev.length > 0 ? prev : hydrated))
        }
      })
      .catch((err) => {
        console.warn('Failed to hydrate AI thread', err)
      })
      .finally(() => {
        if (!cancelled) hydratedRef.current = true
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, activeThread?.scope, activeThread?.id])

  useEffect(() => {
    if (!endpoint || !hydratedRef.current || !activeThread) return
    const threadOpts = { ...(activeThread.scope ? { scope: activeThread.scope } : {}) }
    const unsynced = messages.filter(
      (m) => !persistedIdsRef.current.has(m.id) && !m.isStreaming,
    )
    if (unsynced.length === 0) return
    for (const m of unsynced) {
      if (m.role === 'system') continue
      persistedIdsRef.current.add(m.id)
      // Phase 5: persist the full message shape so promoted `conversation`
      // records carry preview events, labware additions, clarifications,
      // tool-call traces, and execution-scale plans — not just the prose
      // body. The schema's `messages[].metadata` accepts an open object;
      // we forward every structured field that isn't already a primitive.
      const metadata: Record<string, unknown> = {}
      if (m.sequenceProposal) metadata.sequenceProposal = m.sequenceProposal
      if (m.sequenceProposalRequest) metadata.sequenceProposalRequest = m.sequenceProposalRequest
      if (m.events && m.events.length > 0) metadata.events = m.events
      if (m.labwareAdditions && m.labwareAdditions.length > 0)
        metadata.labwareAdditions = m.labwareAdditions
      if (m.clarification) metadata.clarification = m.clarification
      // L2-CHAT-UI-1 LEG A (A3): persist the shorthand so the intent card
      // survives a reload (the hydration ride below reads it back).
      if (m.shorthand) metadata.shorthand = m.shorthand
      if (m.executionScalePlan) metadata.executionScalePlan = m.executionScalePlan
      if (m.instrumentApplianceJobs && m.instrumentApplianceJobs.length > 0)
        metadata.instrumentApplianceJobs = m.instrumentApplianceJobs
      if (m.usage) metadata.usage = m.usage
      if (m.attachments && m.attachments.length > 0)
        metadata.attachments = m.attachments
      appendThreadMessage(endpoint, {
        message: {
          role: m.role,
          content: m.content,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        },
      }, threadOpts).catch((err) => {
        console.warn(`Failed to persist message ${m.id}`, err)
        // Remove from the synced set so we retry on next change.
        persistedIdsRef.current.delete(m.id)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, activeThread?.scope, activeThread?.id, messages])


  // ------------------------------------------------------------------
  // Per-event preview state
  // ------------------------------------------------------------------
  function setPreviewEventState(eventId: string, state: PreviewEventState) {
    setPreviewEventStatesMap((prev) => {
      const next = new Map(prev)
      next.set(eventId, state)
      return next
    })
  }

  // Test-only hook to set preview events directly (for e2e testing)
  function setPreviewEventsTestOnly(events: PlateEvent[]) {
    setPreviewEvents(events)
    const nextStates = new Map<string, PreviewEventState>()
    events.forEach((e) => nextStates.set(e.eventId, 'pending'))
    setPreviewEventStatesMap(nextStates)
  }

  // Check health on mount
  const checkHealth = useCallback(() => {
    getAiHealth().then((h: AiHealthStatus) => {
      setAiAvailable(h.available)
    })
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  // Fetch apply-to-graph template from the prompt-templates registry.
  useEffect(() => {
    if (typeof apiClient.getPromptTemplate !== 'function') return
    apiClient
      .getPromptTemplate('assistant.apply-to-graph.user')
      .then((res) => {
        if ('error' in res) return
        setApplyToGraphTemplate(res.content)
      })
      .catch(() => {
        /* swallow */
      })
  }, [])

  // ------------------------------------------------------------------
  // Send a prompt
  // ------------------------------------------------------------------
  const sendPrompt = useCallback(
    async (prompt: string, attachments?: FileAttachment[]) => {
      if (isStreaming) return
      const submittedProposalScope = proposalScopeRef.current

      // L2-CHAT-1: a new send starts a new turn — the honest-failure wall
      // belongs to the turn that produced the failure, so it clears HERE,
      // synchronously (before any await) so the fresh turn never renders the
      // prior turn's wall.
      setHonestWall(null)

      // Auto-reject existing preview before starting new stream.
      // L2-CHAT-1: a send while a preview is staged is a REVISE turn — the
      // staged draft's source prompt joins the revision trail and rides back
      // to the server as `draftRevision.revisionHistory` (AiTabPanel's
      // round-trip). The CURRENT prompt is the new request, not history.
      const revising = previewEvents.length > 0 || previewLabwareAdditions.length > 0
      // L2-CHAT-1 FIX1 D3: the staged draft's source prompt rides back as
      // `currentPreviewDraft.sourcePrompt` (the legacy pane's shape) — captured
      // here, before the staged source is consumed below.
      const revisingSource = revising ? stagedSourceRef.current : null
      if (revising) {
        // L2-CHAT-1 FIX1 D3: the revision trail sent on THIS request is the
        // staged draft's OWN trail (already held in revisionTrailRef since the
        // prior done, legacy AiTabPanel.tsx:642-647 semantics) — the first
        // draft's prompt is carried as sourcePrompt, never re-appended here.
        stagedSourceRef.current = null
        setPreviewEvents([])
        setPreviewLabwareAdditions([])
        setUnresolvedRefs([])
        // L2-SUITE-A-uifix2 FIX2 [D6]: no "auto-rejected" line. A send that
        // supersedes a staged preview is a REVISE turn — the staged draft
        // rides back as draftRevision context (revisingSource above); it was
        // not rejected (no discard happened, and after a deck-bar accept the
        // staged state is already cleared by
        // clearStagedPreviewForExternalCommit, so this branch is unreachable
        // for it). The stale "Previous preview was auto-rejected." pill was
        // dead chrome sitting ABOVE the still-active card (the gate's D6) and
        // mislabeled the outcome — the revision context is the honest record.
      }

      const userMsg: ChatMessage = {
        id: generateMessageId(),
        role: 'user',
        content: prompt,
        timestamp: Date.now(),
        ...(attachments && attachments.length > 0
          ? {
              attachments: attachments.map((a) => ({
                name: a.name,
                size: a.size,
                type: a.type,
                previewUrl: a.previewUrl,
              })),
            }
          : {}),
      }

      const assistantId = generateMessageId()
      const initialStatus = 'Prompt received. Starting compiler pipeline...'
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: 'assistant',
        content: initialStatus,
        timestamp: Date.now(),
        streamEvents: [{ type: 'status', message: initialStatus }],
        isStreaming: true,
      }

      flushSync(() => {
        setMessages((prev) => [...prev, userMsg, assistantMsg])
        setIsStreaming(true)
      })

      const controller = new AbortController()
      abortRef.current = controller

      await waitForNextPaint()

      const ctx = aiContextRef.current
      const contextPayload: Record<string, unknown> = { ...ctx.surfaceContext }
      // L2-CHAT-1: the revision trail round-trip. A revise turn (send while a
      // preview was staged) carries the staged draft + the accumulated
      // revision history back as structured `draftRevision` context — the
      // SAME SHAPE the legacy pane's context builder sends
      // (AiTabPanel.tsx previewDraft), with the fields this stack actually
      // stages: events, labwareAdditions, sourcePrompt, sourceSkips (FIX3
      // D3) and the staged ontologyBindings. It is NOT identical to the
      // legacy context as a whole: the legacy pane also carries
      // labwareRequirements (this stack's ghost mount stages [] for the
      // non-event channels — useDeckGhostMount hardcodes them; documented
      // intentional subset, MOUNT-NONEVENT-1 follow-up, pending Brad) and
      // deck-scope / study / systemPrompt context the universal stack
      // derives differently.
      if (revising) {
        // L2-CHAT-1 FIX3 D3: the staged EXTRAS ride the draft back (the
        // ghost mount staged them on the editor preview). currentPreviewDraft
        // matches the legacy pane's previewDraft (AiTabPanel.tsx) for what
        // this stack ACTUALLY stages:
        //   - events / labwareAdditions / ontologyBindings / sourcePrompt /
        //     sourceSkips — the real staged values (sourceSkips is the
        //     FIX3 D3 fix: the ghost mount's skips now reach the server);
        //   - labwareRequirements — always [] here: the universal ghost
        //     mount stages [] (useDeckGhostMount hardcodes the non-event
        //     channels — MOUNT-NONEVENT-1, documented deferral pending
        //     Brad). It is NOT fabricated: the field carries the truthful
        //     empty set, and a revise turn on this stack can never revise
        //     requirements the mount never staged.
        const stagedExtras = revisingSource
          ? (onStagedExtrasRef.current?.() ?? null)
          : null
        const draftRevision: AiDraftRevisionContext = {
          currentPreviewDraft: {
            events: previewEvents,
            labwareRequirements: [],
            labwareAdditions: previewLabwareAdditions,
            // L2-CHAT-1 FIX1 D3: the staged (now-superseded) draft's source
            // prompt — the legacy pane carries it as sourcePrompt, so the
            // server sees the first draft's prompt HERE, not in the trail.
            ...(revisingSource ? { sourcePrompt: revisingSource.prompt } : {}),
            // L2-CHAT-1 FIX3 D3: the staged skips (legacy parity).
            ...(stagedExtras?.sourceSkips?.length
              ? { sourceSkips: stagedExtras.sourceSkips }
              : {}),
            // L2-CHAT-1 FIX3 D3: the staged ontology bindings (legacy
            // parity — AiTabPanel carries result.ontologyBindings on the
            // preview; the ghost mount stages the same).
            ...(stagedExtras?.ontologyBindings?.length
              ? { ontologyBindings: stagedExtras.ontologyBindings as DraftOntologyBinding[] }
              : {}),
          },
          // The trail is EXCLUSIVE of the sourcePrompt above (legacy: the trail
          // starts at the 2nd draft) — never re-includes the first draft's prompt.
          revisionHistory: revisionTrailRef.current,
        }
        contextPayload.draftRevision = draftRevision
      }
      let promptMentions: PromptMention[] = []
      // Inject mentions for event-editor surface
      if (ctx.surface === 'event-editor') {
        promptMentions = parsePromptMentions(prompt)
        contextPayload.mentions = promptMentions
      }
      if (ctx.editorMode) {
        contextPayload.editorMode = ctx.editorMode
      }

      const history = buildConversationHistory(messages)
      const accumulated: AiStreamEvent[] = [{ type: 'status', message: initialStatus }]

      const files = attachments?.map((a) => a.file)

      // L2-SUITE-A-uifix2 E: whether a navigation agent_action frame was
      // DELIVERED this turn (the handler applied it without reporting a block
      // diagnostic). Set in the agent_action branch below (the frame rides the
      // stream BEFORE the done frame), consumed by the empty-success gate so a
      // turn that navigated the workspace is not reported as "nothing was
      // proposed" — the same delivered-change arm as deckLayoutDelivered.
      let navActionDelivered = false

      try {
        for await (const event of streamAssist(
          prompt,
          ctx.surface,
          contextPayload,
          history,
          controller.signal,
          files,
          thinkingMode ? true : undefined,
        )) {
          accumulated.push(event)

          const content = buildAssistantContent(accumulated)

          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content, streamEvents: [...accumulated], isStreaming: true }
                : m
            )
          )

          if (event.type === 'pipeline_diagnostics') {
            const lines = event.diagnostics
              .map((d) => `- ${d.pass_id}.${d.code} (${d.severity}): ${d.message}`)
              .join('\n')
            setMessages((prev) => [
              ...prev,
              {
                id: generateMessageId(),
                role: 'system',
                content: `Pipeline did not produce events (outcome=${event.outcome}).\n${lines}`,
                timestamp: Date.now(),
              },
            ])
            continue
          }

          // PB-CH-6 — the wave-1 channel envelopes on the generic stack.
          // Before these branches the frame fell through the loop silently
          // (the defect class this item closes). Same never-break-the-turn
          // wrapper style as the pipeline_diagnostics branch above: a
          // throwing host callback surfaces as a system line, the turn
          // continues. With NO callback registered the frame becomes a NAMED
          // system bubble — a missing capability is visible, never a silent
          // no-op control.
          if (event.type === 'workstate_proposal') {
            if (workstateProposalRef.current) {
              try {
                workstateProposalRef.current(event.workstate)
              } catch (err: unknown) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId(),
                    role: 'system',
                    content: `The proposal card could not open: ${(err as Error).message || 'Unknown error'}. Nothing was written.`,
                    timestamp: Date.now(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'The assistant proposed a workspace change but this page cannot show proposal cards yet. Nothing was written.',
                  timestamp: Date.now(),
                },
              ])
            }
            continue
          }

          // PB-CH-5 repair — the analysis INTENT frame on the generic stack.
          // Same block shape as the workstate_proposal branch above (no
          // forked logic): callback -> verbatim relay, a throwing host
          // surfaces a system line and the turn continues, and with NO
          // callback the frame becomes a NAMED system bubble naming the
          // analysis proposal — never a silent drop (the frame the server
          // emits at AgentOrchestrator.ts:2337 fell through the loop before
          // this branch existed). The bubble text is distinct per frame kind
          // (the existing test pins the workstate wording).
          if (event.type === 'analysis_proposal') {
            if (analysisProposalRef.current) {
              try {
                analysisProposalRef.current(event.analysis)
              } catch (err: unknown) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId(),
                    role: 'system',
                    content: `The analysis proposal card could not open: ${(err as Error).message || 'Unknown error'}. Nothing was written.`,
                    timestamp: Date.now(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'The assistant proposed an analysis but this page cannot show proposal cards yet. Nothing was written.',
                  timestamp: Date.now(),
                },
              ])
            }
            continue
          }

          // QMS7-7 (OQ1 ruling A) — the record-drafting INTENT frame on the
          // generic stack. Same block shape as the workstate/analysis branches
          // above (no forked logic): callback -> verbatim relay, a throwing
          // host surfaces a system line and the turn continues, and with NO
          // callback the frame becomes a NAMED system bubble naming the record
          // draft — never a silent drop. The relay goes to
          // useWorkstateProposalFlow (adapter 'record-drafting'); POST
          // /api/drafts/compile is the trust boundary, so nothing here writes.
          if (event.type === 'record_draft_proposal') {
            if (recordDraftProposalRef.current) {
              try {
                recordDraftProposalRef.current(event.recordDraft)
              } catch (err: unknown) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId(),
                    role: 'system',
                    content: `The record draft proposal card could not open: ${(err as Error).message || 'Unknown error'}. Nothing was written.`,
                    timestamp: Date.now(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'The assistant proposed a record draft but this page cannot show proposal cards yet. Nothing was written.',
                  timestamp: Date.now(),
                },
              ])
            }
            continue
          }

          // MATRES-CHAIN (OQ-3(a)): the execute-chain INTENT — same block shape
          // as the workstate/analysis/record-draft branches above (no forked
          // logic): callback -> verbatim relay, a throwing host surfaces a
          // system line and the turn continues, and with NO callback the frame
          // becomes a NAMED system bubble naming the chain proposal — never a
          // silent drop. The relay goes to useWorkstateProposalFlow (adapter
          // 'chain'); POST /api/drafts/compile is the trust boundary, so
          // nothing here writes.
          if (event.type === 'chain_proposal') {
            if (chainProposalRef.current) {
              try {
                chainProposalRef.current(event.chain)
              } catch (err: unknown) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId(),
                    role: 'system',
                    content: `The execute-chain proposal card could not open: ${(err as Error).message || 'Unknown error'}. Nothing was written.`,
                    timestamp: Date.now(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'The assistant proposed an execute chain but this page cannot show proposal cards yet. Nothing was written.',
                  timestamp: Date.now(),
                },
              ])
            }
            continue
          }

          if (event.type === 'agent_action') {
            if (agentActionRef.current) {
              try {
                const diagnostic = agentActionRef.current(event.action)
                // L2-SUITE-A-uifix2 E: a DELIVERED navigation. The handler
                // applied the action and reported no block (a void return /
                // undefined = accepted — the same convention as onDeckLayout's
                // void). A diagnostic string means the action was REFUSED
                // (the workspace did not visibly change) and must NOT count as
                // a delivery (F4 parity: a refused mount leaves the bubble up).
                navActionDelivered = diagnostic === undefined
                if (diagnostic) {
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: generateMessageId(),
                      role: 'system',
                      content: diagnostic,
                      timestamp: Date.now(),
                    },
                  ])
                }
              } catch (err: unknown) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: generateMessageId(),
                    role: 'system',
                    content: `The workspace action could not run: ${(err as Error).message || 'Unknown error'}. Nothing was written.`,
                    timestamp: Date.now(),
                  },
                ])
              }
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  id: generateMessageId(),
                  role: 'system',
                  content: 'The assistant requested a workspace action but this page cannot apply workspace actions yet. Nothing was written.',
                  timestamp: Date.now(),
                },
              ])
            }
            continue
          }

          if (event.type === 'done') {
            const result = event.result
            if (result.sequenceProposal && submittedProposalScope === proposalScopeRef.current) sequenceProposalRef.current?.(result.sequenceProposal, prompt)
            const isConfirm = result.assurance?.decision === 'CONFIRM'
            const normalizedPreviewEvents = isConfirm
              ? []
              : normalizePreviewEvents(
                  result.events ?? [],
                  promptMentions,
                  result.labwareAdditions ?? [],
                )
            setPreviewEvents(normalizedPreviewEvents)
            setPreviewLabwareAdditions(isConfirm ? [] : (result.labwareAdditions ?? []))
            // Initialize preview event states to 'pending' for all new events
            const nextStates = new Map<string, PreviewEventState>()
            normalizedPreviewEvents.forEach((e: PlateEvent) => {
              nextStates.set(e.eventId, 'pending')
            })
            setPreviewEventStatesMap(nextStates)
            // L2-CHAT-1 FIX1 D3: the staged preview carries (source, trail) —
            // legacy AiTabPanel.tsx:642-647 semantics: a REVISE draft's trail is
            // the previous preview's trail + THIS draft's prompt, so the FIRST
            // draft's prompt rides as currentPreviewDraft.sourcePrompt and is
            // never in the trail (the trail starts at the 2nd draft).
            if (normalizedPreviewEvents.length > 0 && !isConfirm) {
              revisionTrailRef.current = revising
                ? [...revisionTrailRef.current, { prompt, createdAt: new Date().toISOString() }]
                : []
              stagedSourceRef.current = { prompt, createdAt: new Date().toISOString() }
              // L2-CHAT-1: the universal GHOST MOUNT. A surface that owns a
              // deck (event editor) receives the event-bearing proposal here
              // and mounts it as ghosts on the editor state (the port of
              // AiTabPanel's buildPreviewFromDraft seam, AiTabPanel.tsx:608-669).
              onProposalDraftedRef.current?.({
                events: normalizedPreviewEvents,
                labwareAdditions: result.labwareAdditions ?? [],
                ...(result.resolvedLabwares ? { resolvedLabwares: result.resolvedLabwares } : {}),
                prompt,
              })
            } else {
              // L2-CHAT-1 FIX1 D3: no (re)staged preview — the draft chain ends;
              // clear the trail/source so a later fresh chain starts clean.
              revisionTrailRef.current = []
              stagedSourceRef.current = null
            }
            const pending = (result.unresolvedRefs ?? []).filter(
              (p) => p?.ref?.id && !resolvedCache.current.has(p.ref.id)
            )
            setUnresolvedRefs(isConfirm ? [] : pending)
            setMessages((prev) => [
              ...(isConfirm
                ? [{
                    id: generateMessageId(),
                    role: 'system' as const,
                    content: [
                      'The system needs a bit more before it can draft these events:',
                      ...(result.assurance?.blockers ?? []).map((b) => `- ${b.message}`),
                    ].join('\n'),
                    timestamp: Date.now(),
                  }]
                : []),
              ...prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content: result.error ?? (result.sequenceProposal ? 'Proposal ready for review in the sequence workspace.' : result.clarification?.prompt ?? result.clarificationNeeded ?? content),
                      streamEvents: [...accumulated],
                      ...(result.sequenceProposal ? { sequenceProposal: result.sequenceProposal, sequenceProposalRequest: prompt } : {}),
                      events: normalizedPreviewEvents,
                      // L2-SUITE-A-uifix1 D3: the done payload's
                      // clarificationRequests ride the typed arm (ChatLog.tsx:197)
                      // AND seed the LEGACY clarification shape (ChatLog.tsx:196
                      // block arm) when the server sent requests without the
                      // legacy field — the gate's P4/P5/P6 turns carried exactly
                      // that shape, and with the legacy field absent neither
                      // arm had the full card (the picker arm needed the
                      // request's menuProvider/query; the block arm needed the
                      // legacy field itself). Deriving keeps both arms fed
                      // from ONE payload — never a second source of truth.
                      clarification:
                        result.clarification ??
                        legacyClarificationFromRequests(result.clarificationRequests) ??
                        undefined,
                      // L2-CHAT-1 FIX3 D4b: typed clarification requests ride
                      // the message so ChatLog's existing arm (ChatLog.tsx)
                      // renders them — a done carrying only these is NOT an
                      // empty pane (the wall counts them as asked questions).
                      ...(result.clarificationRequests?.length
                        ? { clarificationRequests: result.clarificationRequests }
                        : {}),
                      labwareAdditions: result.labwareAdditions,
                      executionScalePlan: result.executionScalePlan,
                      instrumentApplianceJobs: result.instrumentApplianceJobs,
                      usage: result.usage,
                      // L2-CHAT-UI-1 LEG A (A3): the done payload ALREADY
                      // carries result.shorthand (server AgentResult.shorthand,
                      // same POST /ai/assist/stream) — ride it verbatim so the
                      // assistant turn renders the intent card. Conditional
                      // spread: key ABSENT when the turn carried no shorthand,
                      // never undefined.
                      ...(result.shorthand !== undefined ? { shorthand: result.shorthand } : {}),
                      isStreaming: false,
                      docDiscussion:
                        (result.events?.length ?? 0) === 0 &&
                        typeof result.clarificationNeeded === 'string' &&
                        result.clarificationNeeded.trim().length > 0,
                    }
                  : m
              ),
            ])
            // Check for empty-success case: AI completed but proposed nothing
            // the universal pane can MOUNT. Skip when CONFIRM — the system did
            // pause for confirmation and we already surfaced a clarity message
            // above.
            // L2-CHAT-1 FIX1 D4 (FIX3 D4a repair): the gate is the universal
            // stack's MOUNTABLE set — the channels with a render/ghost arm
            // HERE:
            //   events           -> ChatPreviewCard + deck ghosts (useDeckGhostMount)
            //   clarification    -> the ChatLog clarification block (ChatLog.tsx)
            //   clarificationRequests -> the ChatLog typed-clarification arm
            //   error            -> rendered as the message content
            // labwareAdditions was listed as mountable (the card's "N new
            // labware" line) but the universal stack has NO mount arm for a
            // labware-only proposal: the ghost mount only fires on
            // event-bearing drafts (useDeckGhostMount early-returns without
            // placements/events) and the card's Apply is unmountable without
            // events (MOUNT-NONEVENT-1). So a success carrying ONLY
            // labwareAdditions reached neither a card nor a wall before — the
            // spec §3 forbidden silently-empty pane. FIX3: the wall NAMES
            // the channel instead of suppressing it.
            // Everything else a done result can carry (equipmentRequirements,
            // recordCreations, labwareRequirements, deckLayout,
            // instrumentApplianceJobs) has NO universal arm — useDeckGhostMount
            // hardcodes them to [] and no universal surface renders them — so
            // a turn delivering only one of them reached neither a card nor a
            // wall: the spec §3 forbidden silently-empty pane. The legacy
            // draftEmptiness.draftProducedNothing predicate counts those as
            // "produced something" because the LEGACY pane renders them; it is
            // jurisdiction-correct for AiTabPanel, not for this stack.
            const hasEvents = (result.events?.length ?? 0) > 0
            // L2-SUITE-A-uifix1 D1 (+ F4 fix1): a deckLayout done is a
            // DELIVERABLE turn — mount it through the host's native editor
            // action (the SAME actions the manual deck bar uses: setPlatform
            // + setVariant) BEFORE the empty-success accounting, so the
            // bubble decision sees the delivery. The host guards the variant
            // against the platform manifest (the server validates loosely)
            // and REPORTS the refusal (boolean return). Without a registered
            // seam the turn falls through to the honest wall below, which
            // NAMES the delivered channel — still honest, just unmounted.
            // F4: the bubble gate keys on the mount SUCCEEDING, not on the
            // seam being REGISTERED — a refused mount (manifest-guard miss)
            // left the deck unchanged while suppressing the bubble.
            const deckLayoutPayload = (result as { deckLayout?: { platformId?: unknown; variantId?: unknown } }).deckLayout
            let deckLayoutDelivered =
              Boolean(deckLayoutPayload) && onDeckLayoutRef.current !== undefined
            if (deckLayoutDelivered) {
              if (typeof deckLayoutPayload?.platformId === 'string' && typeof deckLayoutPayload.variantId === 'string') {
                const accepted = onDeckLayoutRef.current?.({ platformId: deckLayoutPayload.platformId, variantId: deckLayoutPayload.variantId })
                // A void return (handlers that predate the acceptance
                // contract) counts as accepted; an explicit false is the
                // surface's guard refusing — the deck did NOT change.
                deckLayoutDelivered = accepted !== false
              } else {
                // A deckLayout the seam cannot read (no platform/variant
                // ids) is never mounted — not a delivery.
                deckLayoutDelivered = false
              }
            }
            if (result.success && !result.sequenceProposal && !isConfirm && !hasEvents) {
              // A turn that asked a question or surfaced an error delivered
              // something the pane shows — the wall ("asked no questions")
              // must not fire beside it. L2-CHAT-1 FIX3 D4b: typed
              // clarificationRequests count as asked questions too (ChatLog
              // renders them — they are not unmountable here).
              const askedQuestion =
                Boolean(result.clarification?.prompt) ||
                Boolean(result.clarificationNeeded?.trim()) ||
                (result.clarificationRequests?.length ?? 0) > 0
              const surfacedError = Boolean(result.error?.trim())
              if (!askedQuestion && !surfacedError) {
                // Name what the turn actually carried when it is unmountable
                // here — the wall must report plain-language truth, not claim
                // "nothing" was proposed when it proposed unmountable things.
                const notesDelivered = (result.notes?.length ?? 0) > 0
                const labwareOnly = (result.labwareAdditions?.length ?? 0) > 0
                const unmountable = [
                  labwareOnly
                    ? `proposed ${result.labwareAdditions?.length} new labware, which this surface cannot mount without events`
                    : null,
                  (result.equipmentRequirements?.length ?? 0) > 0 ? 'bench-equipment requirements' : null,
                  (result.recordCreations?.length ?? 0) > 0 ? 'records to create' : null,
                  (result.labwareRequirements?.length ?? 0) > 0 ? 'labware requirements' : null,
                  // deckLayout is not declared on AiAgentResult but the server's
                  // AssistDraftResult can carry it in the done payload — read
                  // defensively so the wall stays honest if it appears.
                  Boolean((result as { deckLayout?: unknown }).deckLayout) ? 'a deck layout' : null,
                  (result.instrumentApplianceJobs?.length ?? 0) > 0 ? 'appliance jobs' : null,
                ].filter((part): part is string => part !== null)
                // L2-SUITE-A-uifix1 D2: the clause carries a VERB. The parts
                // are bare noun phrases; joining them after "it" rendered
                // "it a deck layout" (the gate's broken copy). "it delivered
                // only <parts>" is grammatical for every combination.
                // L2-SUITE-A-uifix1 F3 fix1: when the deck layout was
                // MOUNTED this turn (accepted by the surface), the closing
                // clause must say so — the old "Nothing was proposed and
                // nothing was applied." contradicted a deck the user just
                // watched switch (the D2/D1 gate read).
                const closing = deckLayoutDelivered
                  // L2-SUITE-A-uifix3 D1 (regate-5): the layout mount is
                  // VIEW-SESSION-ONLY — the record never carries the variant
                  // (methodContext.deckVariant stays "default"; a reload
                  // reverts the deck), so the wall must not claim the DECK:
                  // "applied to the deck." overclaimed and silently reversed
                  // on reload (gate D1: freeform in session, Single SBS
                  // Plate after reload, same wall text). Scope it to the view.
                  ? ' The deck layout was applied to this view.'
                  : ' Nothing was proposed and nothing was applied.'
                setHonestWall(
                  `Draft produced no events${
                    unmountable.length > 0
                      ? ` — it delivered only ${unmountable.join(' and ')}`
                      : notesDelivered
                        ? ' — it delivered only notes'
                        : ''
                  } and asked no questions.${closing}`,
                )
              }
              // L2-SUITE-A-uifix1 D3+D1 (+ F4 fix1): the bubble claims NOTHING
              // was proposed. It is false when the turn asked a question (the
              // clarification cards ARE the proposal — the gate's P4/P5/P6
              // "success-with-nothing") and when the deck layout MOUNTED
              // (deckLayoutDelivered — the surface's seam reported acceptance;
              // F4: a REFUSED mount — the guard's false — leaves the bubble
              // up because the deck did NOT visibly change). The wall above
              // stays on its own gate (askedQuestion suppresses it; a
              // delivered deckLayout is NAMED in it — the arms must not
              // contradict each other, which is exactly the gate's D3 read:
              // wall=null beside a bubble claiming nothing was proposed).
              // L2-SUITE-A-uifix2 E: and when a navigation agent_action was
              // DELIVERED (navActionDelivered — the onAgentAction handler
              // applied it without a block diagnostic). The banked wire
              // (L2-SUITE-B prompt-9.json) delivered an open-surface nav frame
              // + done.notes "Action sent — see the workspace."; the headless
              // classifier grades the turn 'proposal' via the nav frame, so the
              // pane's "nothing was proposed" bubble CONTRADICTS the delivered
              // action. Same delivered-change arm as deckLayoutDelivered.
              if (!askedQuestion && !deckLayoutDelivered && !navActionDelivered) {
                setMessages((prev) => [
                  ...prev,
                  {
                    id: `sys-${Date.now()}`,
                    role: 'system',
                    content: 'AI completed the task but did not propose any changes.',
                    timestamp: Date.now(),
                    isStreaming: false,
                  },
                ])
              }
            }
            break
          }

          if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? { ...m, content: `Error: ${event.message}`, isStreaming: false }
                  : m
              )
            )
            break
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name === 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: m.content + '\n\n(Cancelled)', isStreaming: false }
                : m
            )
          )
        } else {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? {
                    ...m,
                    content: `Error: ${(err as Error).message || 'Unknown error'}`,
                    isStreaming: false,
                  }
                : m
            )
          )
        }
      } finally {
        setIsStreaming(false)
        abortRef.current = null
      }
    },
    [isStreaming, previewEvents, messages]
  )

  // ------------------------------------------------------------------
  // Execute a compiled instrument appliance job
  // ------------------------------------------------------------------
  const executeInstrumentApplianceJob = useCallback(async (job: InstrumentApplianceJob) => {
    if (executingApplianceJobIds.has(job.jobId)) return

    const readiness = job.executionReadiness
    if (readiness?.status === 'blocked') {
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: [
            `Appliance job ${job.jobId} is blocked from execution.`,
            ...readiness.blockers.map((blocker) => `- ${blocker.message}`),
          ].join('\n'),
          timestamp: Date.now(),
        },
      ])
      return
    }

    const requiresConfirmation = readiness?.requiresConfirmation === true
    if (requiresConfirmation) {
      const confirmed = window.confirm(
        `Run live Gemini EM job ${job.jobId}? This will control the physical instrument.`,
      )
      if (!confirmed) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'system',
            content: `Live execution cancelled for appliance job ${job.jobId}.`,
            timestamp: Date.now(),
          },
        ])
        return
      }
    }

    // INSTR-READCHAIN-1 (b): resolve the run's read-event chain BEFORE the
    // executing-state set / dispatch. Absent graph id, zero applicable events,
    // or an ambiguous (2+) graph attach NOTHING — the request goes out
    // untouched and the server's pre-flight (ruling §2D) answers with its
    // honest structured 400. exactOptionalPropertyTypes: conditional spread,
    // never an `undefined` assignment.
    const surfaceEventGraphId = aiContextRef.current.surfaceContext['eventGraphId']
    const readChain = typeof surfaceEventGraphId === 'string' && surfaceEventGraphId.length > 0
      ? await resolveReadEventChain(job, surfaceEventGraphId)
      : null
    const dispatchJob: InstrumentApplianceJob = readChain
      ? {
          ...job,
          request: {
            ...job.request,
            eventGraphRef: { kind: 'record', id: readChain.eventGraphId, type: 'event-graph' },
            readEventRef: readChain.eventId,
          },
        }
      : job

    setExecutingApplianceJobIds((prev) => new Set(prev).add(job.jobId))
    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId(),
        role: 'system',
        content: `Executing appliance job ${job.jobId} (${job.instrument}).`,
        timestamp: Date.now(),
      },
    ])
    try {
      const result = await apiClient.executeInstrumentApplianceJob(dispatchJob, {
        confirmLiveExecution: requiresConfirmation,
      })
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: [
            `Appliance job ${result.jobId ?? job.jobId} completed.`,
            result.measurementId ? `Measurement: ${result.measurementId}` : '',
            result.logId ? `Log: ${result.logId}` : '',
            result.rawDataPath ? `Raw data: ${result.rawDataPath}` : '',
            result.applianceExecutionRecordPath ? `Execution record: ${result.applianceExecutionRecordPath}` : '',
          ].filter(Boolean).join('\n'),
          timestamp: Date.now(),
        },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: `Appliance job ${job.jobId} failed: ${(err as Error).message || 'Unknown error'}`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      setExecutingApplianceJobIds((prev) => {
        const next = new Set(prev)
        next.delete(job.jobId)
        return next
      })
    }
  }, [executingApplianceJobIds])

  // ------------------------------------------------------------------
  // Cancel the current stream
  // ------------------------------------------------------------------
  const cancelStream = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // ------------------------------------------------------------------
  // Accept preview events → add to editor (applies cached resolutions)
  // ------------------------------------------------------------------
  const acceptPreview = useCallback(async () => {
    if (isAcceptingRef.current) return
    isAcceptingRef.current = true
    setIsAccepting(true)
    // L2-CHAT-1 regatefix2 D1: a fresh apply attempt supersedes any prior
    // refusal — the wall belongs to the attempt that produced it (never a
    // stale error from a previous Apply beside a fresh preview).
    setAdoptionError(null)
    const eventsToAccept = previewEvents
    const labwareAdditionsToApply = previewLabwareAdditions
    try {
      // L2-CHAT-1 FIX3 D1: COMPLETE-adopter seam (adoption-first). A
      // deck-owning surface registers onPreviewAccept: Apply commits the
      // FULL staged editor preview (events + previewLabwares +
      // previewPlacements + recordCreations + ontologyBindings) through the
      // shared deck adoption core — the deck bar's exact materialize/persist
      // ordering — instead of the raw per-event append below. The per-event
      // path rides ONLY when the seam is absent (a non-deck surface), and
      // only for event-bearing applies: a labware-only preview is
      // unmountable on this surface (the honest wall names that channel at
      // the done — MOUNT-NONEVENT-1).
      const adopter = onPreviewAcceptRef.current
      const stagedExtras = adopter ? (onStagedExtrasRef.current?.() ?? null) : null
      const adoption = adopter && eventsToAccept.length > 0
        ? await adopter({
            previewEvents: eventsToAccept,
            previewLabwares: (stagedExtras?.previewLabwares as Record<string, unknown> | undefined) ?? {},
            ...(stagedExtras?.previewEquipments ? { previewEquipments: stagedExtras.previewEquipments } : {}),
            previewPlacements: (stagedExtras?.previewPlacements as unknown[] | undefined) ?? [],
            ...(stagedExtras?.ontologyBindings ? { ontologyBindings: stagedExtras.ontologyBindings } : {}),
            ...(stagedExtras?.recordCreations ? { recordCreations: stagedExtras.recordCreations } : {}),
            ...(stagedSourceRef.current ? { sourcePrompt: stagedSourceRef.current.prompt } : {}),
          })
        : null
      if (adoption?.adopted) {
        // A successful adoption IS the commit — the editor's commit_preview
        // already merged previewLabwares/previewPlacements and nulled the
        // ghost (one adopter stays one: a later deck-bar commit is a
        // no-op). Clear the staged state and end the draft chain (mirror
        // the legacy handler branch).
        flushSync(() => {
          setPreviewEvents([])
          setPreviewLabwareAdditions([])
          setPreviewEventStatesMap(new Map())
          setUnresolvedRefs([])
        })
        setAdoptionError(null)
        revisionTrailRef.current = []
        stagedSourceRef.current = null
        const adoptedEvents = adoption.eventCount ?? 0
        const adoptedLabware = adoption.labwareCount ?? 0
        const adoptedPlacements = adoption.placementCount ?? 0
        const adoptedCommitSha =
          typeof adoption.commitSha === 'string' && adoption.commitSha.length > 0
            ? adoption.commitSha
            : undefined
        const adoptedSummary = [
          `Accepted ${adoptedEvents} event${adoptedEvents === 1 ? '' : 's'}`,
          adoptedLabware > 0 ? `plus ${adoptedLabware} new labware${adoptedLabware === 1 ? '' : 's'}` : null,
          adoptedPlacements > 0 ? `plus ${adoptedPlacements} placement${adoptedPlacements === 1 ? '' : 's'}` : null,
          adoptedCommitSha ? `commit ${adoptedCommitSha}` : null,
        ]
          .filter(Boolean)
          .join(' ')
        setMessages((prev) => [
          ...prev,
          { id: generateMessageId(), role: 'system', content: adoptedSummary, timestamp: Date.now() },
        ])
        return
      }
      if (adoption) {
        // Refused at the ontology sign-off gate (NOT bypassable): VISIBLE in
        // the conversation; the ghost STAYS mounted and the staged state
        // stays (the scientist signs off in the changes panel and retries).
        // Never silently materialize.
        const blocked = adoption.blocked ?? 0
        setMessages((prev) => [
          ...prev,
          { id: generateMessageId(), role: 'system', content: `${blocked} ontology terms need sign-off in the changes panel — nothing was applied.`, timestamp: Date.now() },
        ])
        return
      }
      // Legacy per-event apply (no adoption seam registered).
      flushSync(() => {
        setPreviewEvents([])
        setPreviewLabwareAdditions([])
        setPreviewEventStatesMap(new Map())
        setUnresolvedRefs([])
      })
      // Track labware-addition outcomes for the summary message.
      const totalLabwareAttempts = labwareAdditionsToApply.length
      let labwareFailures = 0

      // Apply AI-proposed labware additions FIRST so events can reference them.
      for (const addition of labwareAdditionsToApply) {
        try {
          const payload = await resolveLabwareAdditionPayload(addition)
          addLabwareFromRecordRef.current?.(payload as unknown as Record<string, unknown>, addition)
        } catch (err) {
          labwareFailures++
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              role: 'system',
              content: `Error: Skipped labware addition ${addition.recordId}: ${(err as Error).message}.`,
              timestamp: Date.now(),
            },
          ])
        }
      }

      const cache = resolvedCache.current
      const handler = onAcceptEventRef.current
      if (handler) {
        for (const event of eventsToAccept) {
          handler(cache.size > 0 ? rewriteEventRefs(event, cache) : event)
        }
        // L2-CHAT-1 FIX1 D1 (superseded by the FIX3 D1 adoption seam when it
        // is registered — see above): on a surface WITHOUT onPreviewAccept
        // the per-event apply IS the only adoption — unmount the ghost
        // through the SAME discard seam rejectPreview uses, so no other
        // acceptor can commit the same events a second time.
        onPreviewDiscardedRef.current?.()
        // L2-CHAT-1 FIX1 D2: a successful accept ENDS this draft chain — reset
        // the trail/source so an applied chain's prompt never leaks into a
        // later chain's draftRevision.revisionHistory (mirror the else branches).
        revisionTrailRef.current = []
        stagedSourceRef.current = null
      } else if (eventsToAccept.length > 0) {
        // L2-CHAT-1: LOUD ACCEPT. A missing handler used to be a silent no-op
        // (the spec §1 defect: "make the missing-handler case loud"). The
        // staged events are reported as NOT applied — never quietly dropped.
        revisionTrailRef.current = []
        stagedSourceRef.current = null
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'system',
            content: `This surface has no event path wired — ${eventsToAccept.length} accepted event${eventsToAccept.length !== 1 ? 's' : ''} could not be applied.`,
            timestamp: Date.now(),
          },
        ])
      } else {
        revisionTrailRef.current = []
        stagedSourceRef.current = null
      }

      // Compute the final summary message based on outcomes.
      const eventCount = eventsToAccept.length
      let summary: string
      if (totalLabwareAttempts > 0 && labwareFailures === totalLabwareAttempts && eventCount === 0) {
        summary = `Accept failed — all ${totalLabwareAttempts} labware addition${totalLabwareAttempts !== 1 ? 's' : ''} could not be added.`
      } else if (labwareFailures > 0) {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''} (${labwareFailures} labware addition${labwareFailures !== 1 ? 's' : ''} failed — see above).`
      } else {
        summary = `Accepted ${eventCount} event${eventCount !== 1 ? 's' : ''}.`
      }

      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: summary,
          timestamp: Date.now(),
        },
      ])
    } catch (err: unknown) {
      // L2-CHAT-1 regatefix2 D1: the adoption seam THREW (e.g. the deck lock
      // conflict — persist refused because the route resolved off the run's
      // methodDeckLock). Before this catch the error escaped as an uncaught
      // page error and the pane showed NOTHING (the gate's "silent nothing").
      // Now: the refusal is NAMED — the error's class + message verbatim on
      // the hook-owned wall (the card renders it as role=alert), and a
      // system line in the conversation — and the staged preview STAYS
      // mounted (nothing half-applied; the scientist sees the cause and can
      // retry or discard). Never silently materialize, never silently drop.
      const errName = err instanceof Error && err.name && err.name !== 'Error' ? err.name : null
      const errMessage = err instanceof Error ? err.message : String(err)
      const message = errName ? `${errName}: ${errMessage}` : errMessage
      setAdoptionError(message)
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: `Apply failed — ${message} Nothing was written; the proposed preview stays staged.`,
          timestamp: Date.now(),
        },
      ])
    } finally {
      isAcceptingRef.current = false
      setIsAccepting(false)
    }
  }, [previewEvents, previewLabwareAdditions])

  // ------------------------------------------------------------------
  // Accept preview events with resolved material refs
  // ------------------------------------------------------------------
  const acceptPreviewWithResolutions = useCallback(
    (resolutions: Map<string, RecordRef>) => {
      if (isAcceptingRef.current) return
      isAcceptingRef.current = true
      setIsAccepting(true)
      try {
        const eventsToAccept = previewEvents
        flushSync(() => {
          setPreviewEvents([])
          setPreviewLabwareAdditions([])
          setPreviewEventStatesMap(new Map())
          setUnresolvedRefs([])
        })
        for (const [key, value] of resolutions) {
          resolvedCache.current.set(key, value)
        }
        const combined = resolvedCache.current
        const handler = onAcceptEventRef.current
        if (handler) {
          for (const event of eventsToAccept) {
            handler(rewriteEventRefs(event, combined))
          }
          // L2-CHAT-1 FIX1 D1+D2: the resolve-ref accept is ALSO an adoption —
          // unmount the ghost through the same discard seam (one adopter) and
          // reset the trail/source (mirror acceptPreview's handler branch),
          // so the deck bar cannot re-commit and a later chain starts clean.
          onPreviewDiscardedRef.current?.()
          revisionTrailRef.current = []
          stagedSourceRef.current = null
        } else if (eventsToAccept.length > 0) {
          // L2-CHAT-1: loud accept (same as acceptPreview).
          revisionTrailRef.current = []
          stagedSourceRef.current = null
          setMessages((prev) => [
            ...prev,
            {
              id: generateMessageId(),
              role: 'system',
              content: `This surface has no event path wired — ${eventsToAccept.length} accepted event${eventsToAccept.length !== 1 ? 's' : ''} could not be applied.`,
              timestamp: Date.now(),
            },
          ])
        } else {
          revisionTrailRef.current = []
          stagedSourceRef.current = null
        }
        setMessages((prev) => [
          ...prev,
          {
            id: generateMessageId(),
            role: 'system',
            content: `Accepted ${eventsToAccept.length} event${eventsToAccept.length !== 1 ? 's' : ''} (resolved ${resolutions.size} material${resolutions.size !== 1 ? 's' : ''}).`,
            timestamp: Date.now(),
          },
        ])
      } finally {
        isAcceptingRef.current = false
        setIsAccepting(false)
      }
    },
    [previewEvents]
  )

  // ------------------------------------------------------------------
  // Reject preview events
  // ------------------------------------------------------------------
  const rejectPreview = useCallback(() => {
    const count = previewEvents.length
    setPreviewEvents([])
    setPreviewLabwareAdditions([])
    setPreviewEventStatesMap(new Map())
    setUnresolvedRefs([])
    // L2-CHAT-1 regatefix2 D1: a discard supersedes any prior refusal — the
    // preview is gone, so the refusal's wall goes with it.
    setAdoptionError(null)
    // L2-CHAT-1: discard ends the draft chain.
    revisionTrailRef.current = []
    stagedSourceRef.current = null
    onPreviewDiscardedRef.current?.()
    setMessages((prev) => [
      ...prev,
      {
        id: generateMessageId(),
        role: 'system',
        content: `Rejected ${count} event${count !== 1 ? 's' : ''}.`,
        timestamp: Date.now(),
      },
    ])
  }, [previewEvents])

  // ------------------------------------------------------------------
  // Commit accepted preview events
  // ------------------------------------------------------------------
  const commitAcceptedPreviewEvents = useCallback(async () => {
    if (isAcceptingRef.current) return
    isAcceptingRef.current = true
    setIsAccepting(true)
    const toApply = previewEvents.filter(
      (e) => previewEventStates.get(e.eventId) === 'accepted',
    )
    const labwareAdditionsToApply = previewLabwareAdditions
    flushSync(() => {
      setPreviewEvents([])
      setPreviewLabwareAdditions([])
      setPreviewEventStatesMap(new Map())
      setUnresolvedRefs([])
    })

    try {
      // Apply labware additions first (same as acceptPreview)
      if (labwareAdditionsToApply.length > 0) {
        for (const addition of labwareAdditionsToApply) {
          try {
            const payload = await resolveLabwareAdditionPayload(addition)
            addLabwareFromRecordRef.current?.(payload as unknown as Record<string, unknown>, addition)
          } catch {
            // Silently skip labware additions that fail during commit
          }
        }
      }

      // Apply accepted events
      const handler = onAcceptEventRef.current
      if (handler) {
        for (const event of toApply) {
          handler(event)
        }
        // L2-CHAT-1 FIX1 D1+D2 (consistency): a per-event commit is an
        // adoption too — unmount the ghost through the same discard seam the
        // legacy pane's commit flow ends in (clearPreview), and reset the
        // trail/source, so every event-writing path keeps exactly one adopter
        // and no stale trail leaks into a later chain.
        onPreviewDiscardedRef.current?.()
        revisionTrailRef.current = []
        stagedSourceRef.current = null
      }

      // Add system message
      setMessages((prev) => [
        ...prev,
        {
          id: `sys-${Date.now()}`,
          role: 'system',
          content: `Committed ${toApply.length} event${toApply.length === 1 ? '' : 's'}.`,
          timestamp: Date.now(),
          isStreaming: false,
        },
      ])
    } finally {
      isAcceptingRef.current = false
      setIsAccepting(false)
    }
  }, [previewEvents, previewEventStates, previewLabwareAdditions])

  // ------------------------------------------------------------------
  // L2-SUITE-A-uifix2 FIX2 [D6]: external-commit clear (the deck-bar adopter)
  // ------------------------------------------------------------------
  const clearStagedPreviewForExternalCommit = useCallback(
    (commitSha?: string) => {
      // A no-op when nothing is staged: the chat-Apply adopter
      // (acceptPreview/acceptPreviewWithResolutions) already cleared the
      // staged state — one adopter, one clear (the one-adopter invariant
      // holds either way).
      if (previewEvents.length === 0 && previewLabwareAdditions.length === 0) return
      flushSync(() => {
        setPreviewEvents([])
        setPreviewLabwareAdditions([])
        setPreviewEventStatesMap(new Map())
        setUnresolvedRefs([])
      })
      // The accept ENDS the draft chain (mirror acceptPreview/rejectPreview)
      // and records the outcome as an ACCEPT — the batch was applied by the
      // deck bar (commitPreview), not rejected; the stale "auto-rejected"
      // line the next send used to append is gone (sendPrompt's `revising`
      // check no longer sees a staged batch).
      revisionTrailRef.current = []
      stagedSourceRef.current = null
      setMessages((prev) => [
        ...prev,
        {
          id: generateMessageId(),
          role: 'system',
          content: commitSha
            ? `Proposal applied (commit ${commitSha}).`
            : 'Proposal applied.',
          timestamp: Date.now(),
        },
      ])
    },
    [previewEvents, previewLabwareAdditions],
  )

  // ------------------------------------------------------------------
  // Clear chat history
  // ------------------------------------------------------------------
  const clearHistory = useCallback(() => {
    setMessages([])
    setPreviewEvents([])
    setPreviewLabwareAdditions([])
    setPreviewEventStatesMap(new Map())
    setUnresolvedRefs([])
    setExecutingApplianceJobIds(new Set())
  }, [])

  // ------------------------------------------------------------------
  // Apply a doc-discussion message to the graph (pre-fills chat input)
  // ------------------------------------------------------------------
  const applyToGraph = useCallback(
    (_message: ChatMessage) => {
      const text = applyToGraphTemplate ?? FALLBACK_APPLY_TO_GRAPH_TEXT
      if (applyToGraphTemplate === null && !_warnedFallbackOnce) {
        _warnedFallbackOnce = true
        console.warn('apply-to-graph template not loaded yet; using fallback text')
      }
      setInputText(text)
    },
    [applyToGraphTemplate, setInputText],
  )

  return {
    messages,
    isStreaming,
    isAccepting,
    previewEvents,
    previewLabwareAdditions,
    previewEventStates,
    executingApplianceJobIds,
    hasPreview: previewEvents.length > 0,
    unresolvedRefs,
    honestWall,
    adoptionError,
    previewStagedLabwareCount,
    inputText,
    sendPrompt,
    cancelStream,
    acceptPreview,
    acceptPreviewWithResolutions,
    rejectPreview,
    setPreviewEventState,
    setPreviewEvents: setPreviewEventsTestOnly,
    commitAcceptedPreviewEvents,
    clearStagedPreviewForExternalCommit,
    clearHistory,
    applyToGraph,
    executeInstrumentApplianceJob,
    aiAvailable,
    recheckHealth: checkHealth,
    thinkingMode,
    setThinkingMode,
    // L2-THREAD-SCOPED-1: thread-scoped chat fields — present ONLY on
    // thread-scoped chats (an `endpoint` is set). Conditionally spread: the
    // exactOptional surface must never see a dangling key on in-memory
    // chats. `threadId` is absent until the lazy-mint effect resolves the
    // tab's id (one render later).
    ...(endpoint
      ? {
          ...(activeThread ? { threadId: activeThread.id } : {}),
          switchThread: switchThread,
          newThread: newThread,
          listThreads: listThreadsForChat,
        }
      : {}),
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build human-readable assistant content from accumulated SSE events.
 */
function buildAssistantContent(events: AiStreamEvent[]): string {
  let modelText = ''
  const parts: string[] = []

  for (const ev of events) {
    switch (ev.type) {
      case 'text_delta':
        modelText += ev.delta
        break
      case 'status':
        parts.push(ev.message)
        break
      case 'thinking':
        break
      case 'tool_call':
        break
      case 'tool_result':
        break
      case 'draft':
        parts.push(
          `Drafted ${ev.events.length} event${ev.events.length !== 1 ? 's' : ''}${
            ev.notes?.length ? ': ' + ev.notes.join('; ') : ''
          }`
        )
        break
      case 'done':
        if (ev.result.error) {
          parts.push(`Error: ${ev.result.error}`)
        }
        if ((ev.result.notes ?? []).length) {
          parts.push((ev.result.notes ?? []).join('\n'))
        }
        if ((ev.result.clarificationNeeded ?? '').trim().length > 0 && modelText.length === 0) {
          // Plain-text answer that didn't come through as streaming chunks
          // (e.g. doc-discussion turn). Surface it as the message body.
          modelText = ev.result.clarificationNeeded ?? ''
        }
        if (!ev.result.error && (ev.result.events ?? []).length === 0 && modelText.length === 0) {
          parts.push('No events generated.')
        }
        break
      case 'error':
        parts.push(`Error: ${ev.message}`)
        break
      case 'pipeline_diagnostics':
        // Diagnostics are rendered as a separate system message, not appended here.
        break
    }
  }

  // Model text (streamed) comes first; summary lines after.
  const sections: string[] = []
  if (modelText.length > 0) sections.push(modelText)
  if (parts.length > 0) sections.push(parts.join('\n'))

  return sections.join('\n\n') || 'Thinking...'
}

function normalizePreviewEvents(
  events: PlateEvent[],
  mentions: PromptMention[] = [],
  labwareAdditions: AiLabwareAddition[] = [],
): PlateEvent[] {
  const materialMentionsById = new Map(
    mentions
      .filter((mention): mention is PromptMention & { type: 'material'; id: string; label?: string; entityKind?: string } => (
        mention.type === 'material' && typeof mention.id === 'string'
      ))
      .map((mention) => [mention.id, mention])
  )
  const linearLabwareTemplates = buildLinearLabwareTemplateMap(labwareAdditions, events)

  return events.map((event) => {
    const details = { ...(event.details as Record<string, unknown>) }
    const topLevelLabwareId = stringField((event as { labwareId?: unknown }).labwareId)
    if (topLevelLabwareId && typeof details.labwareId !== 'string') {
      details.labwareId = topLevelLabwareId
    }

    if (event.event_type === 'transfer' || event.event_type === 'multi_dispense') {
      const sourceLabware = stringField(details.source_labware) ?? stringField(details.source_labwareId)
      const destLabware = stringField(details.destination_labware)
        ?? stringField(details.dest_labware)
        ?? stringField(details.dest_labwareId)
      const sourceWells = normalizeWellsForLabware(
        arrayField(details.source_wells) ?? singleWellArray(details.source_well),
        sourceLabware,
        linearLabwareTemplates,
      )
      const destWells = normalizeWellsForLabware(
        arrayField(details.dest_wells)
          ?? arrayField(details.wells)
          ?? singleWellArray(details.destination_well)
          ?? singleWellArray(details.dest_well),
        destLabware,
        linearLabwareTemplates,
      )

      if (sourceLabware) details.source_labwareId = sourceLabware
      if (destLabware) details.dest_labwareId = destLabware
      if (sourceWells) details.source_wells = sourceWells
      if (destWells) details.dest_wells = destWells
      if (sourceLabware || sourceWells) {
        details.source = {
          ...(details.source && typeof details.source === 'object' ? details.source : {}),
          ...(sourceLabware ? { labwareInstanceId: sourceLabware } : {}),
          ...(sourceWells ? { wells: sourceWells } : {}),
        }
      }
      if (destLabware || destWells) {
        details.target = {
          ...(details.target && typeof details.target === 'object' ? details.target : {}),
          ...(destLabware ? { labwareInstanceId: destLabware } : {}),
          ...(destWells ? { wells: destWells } : {}),
        }
      }
    }

    if (event.event_type === 'add_material') {
      const labwareId = stringField(details.labwareId)
      const well = normalizeWellsForLabware(
        singleWellArray(details.well) ?? arrayField(details.wells),
        labwareId,
        linearLabwareTemplates,
      )
      if (well && !Array.isArray(details.wells)) {
        details.wells = well
      } else if (well) {
        details.wells = well
      }
      const volumeUl = typeof details.volume_uL === 'number' ? details.volume_uL : undefined
      if (volumeUl != null && !details.volume) {
        details.volume = { value: volumeUl, unit: 'uL' }
      }
      const recordId = stringField(details.recordId)
        ?? stringField((details.material as { recordId?: unknown } | undefined)?.recordId)
      if (recordId && !details.material_ref && !details.material_spec_ref && !details.aliquot_ref && !details.material_instance_ref) {
        const kind = stringField(details.kind)
          ?? stringField((details.material as { kind?: unknown } | undefined)?.kind)
          ?? materialMentionsById.get(recordId)?.entityKind
          ?? 'material'
        const label = stringField(details.label)
          ?? stringField(details.name)
          ?? stringField((details.material as { label?: unknown; name?: unknown } | undefined)?.label)
          ?? stringField((details.material as { label?: unknown; name?: unknown } | undefined)?.name)
          ?? materialMentionsById.get(recordId)?.label
          ?? recordId
        const ref = {
          kind: 'record',
          id: recordId,
          type: kind === 'aliquot'
            ? 'aliquot'
            : kind === 'material-spec'
              ? 'material-spec'
              : kind === 'material-instance'
                ? 'material-instance'
                : 'material',
          label,
        }
        if (ref.type === 'aliquot') details.aliquot_ref = ref
        else if (ref.type === 'material-spec') details.material_spec_ref = ref
        else if (ref.type === 'material-instance') details.material_instance_ref = ref
        else details.material_ref = ref
      }
    }

    return {
      ...event,
      details,
    }
  })
}

function buildLinearLabwareTemplateMap(additions: AiLabwareAddition[], events: PlateEvent[]): Map<string, LinearWellTemplate> {
  const templates = new Map<string, LinearWellTemplate>()
  for (const addition of additions) {
    const template = getLinearWellTemplate(addition.recordId)
    if (template) templates.set(addition.recordId, template)
  }
  for (const event of events) {
    const details = event.details as Record<string, unknown>
    const candidates = [
      stringField(details.labwareId),
      stringField((event as { labwareId?: unknown }).labwareId),
      stringField(details.source_labware),
      stringField(details.source_labwareId),
      stringField(details.destination_labware),
      stringField(details.dest_labware),
      stringField(details.dest_labwareId),
      stringField((details.source as { labwareInstanceId?: unknown } | undefined)?.labwareInstanceId),
      stringField((details.target as { labwareInstanceId?: unknown } | undefined)?.labwareInstanceId),
    ]
    for (const id of candidates) {
      if (id && !templates.has(id)) {
        const template = getLinearWellTemplate(id)
        if (template) templates.set(id, template)
      }
    }
  }
  return templates
}

function getLinearWellTemplate(recordId: string): LinearWellTemplate | null {
  const definition = getLabwareDefinitionById(recordId.startsWith('def:') ? recordId.slice(4) : recordId)
  if (definition?.topology.addressing === 'linear') {
    return {
      count: Math.max(1, definition.topology.linear_count || 1),
      axis: definition.topology.linear_axis || 'x',
    }
  }
  const payload = labwareDefinitionRecordToPayload(recordId)
  const labwareType = (payload?.labwareType ?? '').toLowerCase()
  if (labwareType === 'reservoir_12') return { count: 12, axis: 'x' }
  if (labwareType === 'reservoir_8') return { count: 8, axis: 'y' }
  const haystack = `${recordId} ${payload?.name ?? ''}`.toLowerCase()
  if (!haystack.includes('reservoir')) return null
  if (haystack.includes('12')) return { count: 12, axis: 'x' }
  if (haystack.includes('8')) return { count: 8, axis: 'y' }
  return null
}

function normalizeWellsForLabware(
  wells: string[] | undefined,
  labwareId: string | undefined,
  linearLabwareTemplates: Map<string, LinearWellTemplate>,
): string[] | undefined {
  const template = labwareId ? linearLabwareTemplates.get(labwareId) : undefined
  if (!wells || !template) return wells
  return wells.map((well) => normalizeLinearWellAlias(well, template))
}

function normalizeLinearWellAlias(well: string, template: LinearWellTemplate): string {
  const numeric = /^([1-9]\d*)$/.exec(well)
  if (numeric) {
    const index = Number(numeric[1])
    return index >= 1 && index <= template.count ? String(index) : well
  }
  const grid = /^([A-Z])([1-9]\d*)$/i.exec(well)
  if (!grid) return well
  const row = grid[1].toUpperCase().charCodeAt(0) - 64
  const column = Number(grid[2])
  const index = template.axis === 'x'
    ? row === 1 ? column : null
    : column === 1 ? row : null
  return index != null && index >= 1 && index <= template.count ? String(index) : well
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function arrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out = value.filter((item): item is string => typeof item === 'string' && item.length > 0)
  return out.length > 0 ? out : undefined
}

function singleWellArray(value: unknown): string[] | undefined {
  const well = stringField(value)
  return well ? [well] : undefined
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        setTimeout(resolve, 0)
      })
      return
    }
    setTimeout(resolve, 0)
  })
}

/**
 * Deep-clone a PlateEvent and replace any ontology refs in `details`
 * with resolved record refs from the resolutions map.
 */
function rewriteEventRefs(event: PlateEvent, resolutions: Map<string, RecordRef>): PlateEvent {
  if (!event.details || resolutions.size === 0) return event

  const detailsCopy = { ...event.details } as Record<string, unknown>
  let changed = false

  for (const [key, value] of Object.entries(detailsCopy)) {
    if (
      value &&
      typeof value === 'object' &&
      'kind' in value &&
      (value as { kind: string }).kind === 'ontology'
    ) {
      const ontId = (value as unknown as { id: string }).id
      const resolved = resolutions.get(ontId)
      if (resolved) {
        detailsCopy[key] = resolved
        changed = true
      }
    }
  }

  return changed ? { ...event, details: detailsCopy as PlateEvent['details'] } : event
}
