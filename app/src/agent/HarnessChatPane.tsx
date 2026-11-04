/**
 * HarnessChatPane — the shared right-pane chat for harness surfaces
 * (HARNESS-SEQ-1).
 *
 * It CONSUMES the chat registered through the seam (useAiPanel().chat from
 * AiPanelContext) — it never registers a chat itself and never wraps its
 * subtree in another AiPanelProvider (nested providers would shadow
 * registrations). `chat === null` is a first-class state: an honest empty
 * state, no placeholder messages, disabled composer.
 *
 * The composer state is LOCAL to the pane; Send goes through the registered
 * chat's sendPrompt. A clarification turn answers through the same chat
 * (the next turn), never a blocking card.
 *
 * L2-THREAD-SCOPED-1: the pane hosts the THREAD PICKER — a thread-list
 * control (fed by the registered chat's listThreads, which rides the chat's
 * OWN (endpoint, scope) — the pane stays a pure consumer) plus a "New
 * thread" button. Switching = the chat's switchThread (the hook re-keys and
 * rehydrates). DEAD-CHROME RULE: the picker renders ONLY when the
 * registered chat is thread-scoped (exposes listThreads/switchThread/
 * newThread — i.e. an endpoint was set); a chat without one renders NO
 * picker. No rename affordance.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useOptionalAiPanel } from '../shared/context/AiPanelContext'
import { ChatLog } from './ChatLog'
import { WorkstateProposalCard } from '../event-editor/right-pane/ai/WorkstateProposalCard'
import { ChainProposalCard } from '../event-editor/right-pane/ai/ChainProposalCard'
import { ChatPreviewCard } from './ChatPreviewCard'
import { SurfaceFocusHeader } from './SurfaceFocusHeader'
import {
  SourcesStrip,
  type AddedSource,
} from '../event-editor/right-pane/ai/SourcesStrip'
import { AddSourceModal } from '../event-editor/right-pane/ai/AddSourceModal'
import { RunInEventEditorButton } from '../event-editor/right-pane/ai/RunInEventEditorButton'
import { useOptionalWorkspace } from '../event-editor/workspace/WorkspaceContext'
import { useOptionalEventEditor } from '../event-editor/EventEditorContext'
import { useOptionalOpenTabs } from '../shared/shell/OpenTabsContext'
import { openContent } from '../shared/lib/openContent'
import type { WorkspaceTab } from '../event-editor/workspace/types'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import './HarnessChatPane.css'
// L2-CHAT-UI-1 LEG D step 5 (OQ-4 PORT): the attached-sources strip chrome
// (SourcesStrip / AddSourceModal / RunInEventEditorButton) was AiTabPanel-owned.
// Its styles live in right-pane/ai/ai.css, whose ONLY importer (AiTabPanel) died
// in the deletion commit — so the pane imports ai.css directly to keep the
// stripped chrome's classes (sources-strip*, add-source*, run-in-event-editor*,
// message-log*, chat-input*) reachable. The step-8 dead-CSS sweep keeps the
// selectors the pane's survivors still render and deletes the rest.
import '../event-editor/right-pane/ai/ai.css'

export interface HarnessChatPaneProps {
  /** Host review handler threaded into ChatLog's Review-action button. */
  onReviewProposal?: (proposal: Record<string, unknown>, userRequest?: string) => void
}

/**
 * The thread picker (L2-THREAD-SCOPED-1): a <select> of the user's threads
 * for the registered chat's (endpoint, scope) + a "New thread" button.
 * Returns null (NO chrome) when the chat is not thread-scoped — dead chrome
 * is a defect.
 */
function ThreadPicker({ chat }: { chat: UseAiChatReturn }) {
  const listThreads = chat.listThreads
  const switchThread = chat.switchThread
  const newThread = chat.newThread
  const [threads, setThreads] = useState<ThreadSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => {
    if (!listThreads) return
    let cancelled = false
    listThreads()
      .then((list) => {
        if (cancelled) return
        setThreads(list)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        console.warn('Failed to load thread list', err)
        setError('Could not load the thread list.')
      })
    return () => {
      cancelled = true
    }
  }, [listThreads])

  useEffect(() => load(), [load])

  if (!listThreads || !switchThread || !newThread) return null
  const activeId = chat.threadId ?? null
  // The active thread may not be in the (pre-switch) list yet — keep the
  // select value resolvable (a controlled select with no matching option
  // would drop to the first row).
  const rows = threads ?? []
  const options: Array<{ threadId: string; title: string; updatedAt: string; messageCount: number }> =
    activeId && !rows.some((t) => t.threadId === activeId)
      ? [...rows, { threadId: activeId, title: 'New thread (this tab)', updatedAt: '', messageCount: 0 }]
      : rows

  return (
    <div className="harness-chat-pane__threads" data-testid="thread-picker">
      <select
        className="harness-chat-pane__threads-select"
        aria-label="Threads"
        data-testid="thread-picker-select"
        value={activeId ?? ''}
        onChange={(event) => {
          const value = event.target.value
          if (!value) return
          switchThread(value)
          void load()
        }}
        disabled={!activeId}
      >
        <option value="" disabled>
          {rows.length === 0 ? 'No threads yet' : 'Threads…'}
        </option>
        {options.map((t) => (
          <option key={t.threadId} value={t.threadId}>
            {`${t.title || '(empty)'}${t.updatedAt ? ` — ${t.updatedAt.slice(0, 16).replace('T', ' ')}` : ''}`}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="harness-chat-pane__threads-new"
        data-testid="thread-picker-new"
        onClick={() => {
          newThread()
          void load()
        }}
      >
        New thread
      </button>
      {error ? (
        <span className="harness-chat-pane__threads-error" role="status">
          {error}
        </span>
      ) : null}
    </div>
  )
}

/**
 * AttachedSourcesChrome — the attached-sources strip, ported onto the
 * universal pane (L2-CHAT-UI-1 LEG D step 5, OQ-4 PORT).
 *
 * AiTabPanel owned this chrome (SourcesStrip + AddSourceModal +
 * RunInEventEditorButton); the panel died in the deletion commit, so the
 * components (byte-identical, their own testids survive) mount here in the
 * pane's header region instead. Session-local state, exactly as AiTabPanel's:
 * the strip shows ONLY sources the user attached this mount, the modal ingests
 * a vendor PDF (onIngested appends a chip + the user can open it in the
 * viewer), and the run-in-event-editor button composes a prefill (prompt +
 * active viewer excerpt) and STAGES it in the pane's own composer (the pane's
 * local `prompt` state — the universal pane's replacement for ChatInput's
 * prefill prop). Phase 7b does NOT auto-send (the button's own contract,
 * RunInEventEditorButton.tsx:13-16): the composed text lands in the composer
 * and the user presses Send.
 *
 * Renders ONLY when the host is a workspace (RunInEventEditorButton needs
 * useWorkspace; outside one there is no active viewer tab, so the strip's
 * "+ Add source" attach flow is the whole chrome). Surface-agnostic: no
 * surface-name branching anywhere (D0 grammar).
 */
function AttachedSourcesChrome({
  studyId,
  activeTab,
  onPrefill,
}: {
  studyId: string
  activeTab: WorkspaceTab | null
  /** Stages the run-in-event-editor composed text in the pane's composer. */
  onPrefill: (text: string) => void
}) {
  const navigate = useNavigate()
  const openTabs = useOptionalOpenTabs()
  const [addedSources, setAddedSources] = useState<AddedSource[]>([])
  const [addSourceOpen, setAddSourceOpen] = useState(false)

  const handleSourceIngested = useCallback(
    (artifactId: string, info: { title?: string; sourceUrl: string; vendor?: string }) => {
      setAddedSources((prev) => {
        if (prev.some((s) => s.artifactId === artifactId)) return prev
        return [...prev, { artifactId, title: info.title ?? artifactId }]
      })
    },
    [],
  )

  const handleOpenSource = useCallback(
    (artifactId: string) => {
      const existing = addedSources.find((s) => s.artifactId === artifactId)
      const tab: WorkspaceTab = {
        id: `tab-pdf-${artifactId}`,
        kind: 'pdf',
        artifactId,
        title: existing?.title ?? artifactId,
      }
      openContent(openTabs, navigate, tab, `/artifact/pdf/${artifactId}`)
    },
    [addedSources, openTabs, navigate],
  )

  return (
    <>
      <div className="harness-chat-pane__sources" data-testid="harness-chat-sources">
        <SourcesStrip
          addedSources={addedSources}
          onAddSource={() => setAddSourceOpen(true)}
          onOpenSource={handleOpenSource}
        />
        {/* Visible only for non-deck (pdf/document) viewers — the component's
            own visibility rule; the ghost-preview flow lands somewhere the
            user can see it. */}
        <RunInEventEditorButton
          activeTab={activeTab}
          promptDraft=""
          onPrefilled={(text) => {
            // STAGE, do not send — the button's own Phase 7b contract
            // (RunInEventEditorButton.tsx:13-16: "does NOT automatically send
            // the prompt — it stages it … so the user reviews the composed
            // text first") and the legacy wiring (AiTabPanel.tsx:1595-1599
            // setPrefill + :1629 ChatInput prefill) both stage into the
            // composer. The pane owns its composer state, so staging = the
            // pane's local `prompt`; the user presses Send. The attached
            // sources stay session-local chips — the legacy panel never
            // attached them to the prompt either (Phase 9 upload support
            // was never wired; AiTabPanel.tsx:223-227).
            onPrefill(text)
          }}
        />
      </div>
      <AddSourceModal
        isOpen={addSourceOpen}
        studyId={studyId}
        onIngested={handleSourceIngested}
        onClose={() => setAddSourceOpen(false)}
      />
    </>
  )
}

export function HarnessChatPane({ onReviewProposal }: HarnessChatPaneProps) {
  // `proposalFlow` is registered by the SAME surface that owns the chat: the
  // pane renders the one pending compile card and drives accept/reject through
  // it. Absent flow (a surface that only chats) = no card, no dead controls.
  // LEG D: consume the OPTIONAL seam — RightPane's AI arm is now ALWAYS this
  // pane (the legacy AiTabPanel fallback died), so the pane can render
  // provider-free in tests (host-page suites render the real RightPane without
  // an AiPanelProvider). The routed app always has one (main.tsx wraps it), so
  // with a provider this is byte-for-byte the same value; without one the
  // pane treats it as no-registered-chat → the honest empty state, NEVER a
  // crash (browser-gate criterion, spec §8). useOptionalAiPanel subscribes to
  // the same registration store (no-op without a provider), so the D3 direct
  // subscription is preserved.
  const panel = useOptionalAiPanel()
  const chat = panel?.chat ?? null
  const proposalFlow = panel?.proposalFlow ?? null
  const [prompt, setPrompt] = useState('')

  // L2-CHAT-UI-1 LEG D step 5 (OQ-4 PORT): the attached-sources chrome mounts
  // ONLY on workspace hosts (RunInEventEditorButton internally calls the
  // throwing useWorkspace; outside a WorkspaceProvider there is no active
  // viewer tab, so the strip's attach flow is not applicable). useOptional*
  // is safe provider-free (returns null), so this derivation never throws —
  // the chrome (and the run button) render only when a workspace exists.
  const ws = useOptionalWorkspace()
  const activeTab = ws?.state.activeTabId
    ? ws.state.tabs.find((t: WorkspaceTab) => t.id === ws.state.activeTabId) ?? null
    : null

  // L2-CLARIFY-TARGET-1 UI-gate fix 1 / D2 (ruling Q2): the host SUPPLIES the
  // slot's selection as DATA. The deck's real selection lives in
  // EventEditorContext.state.selection (the only product WellSelectionProvider
  // is mounted around PlateCanvas — the slot's context fallback is never
  // visible on the live deck). Read the OPTIONAL editor seam (null-safe on a
  // non-deck host — the run workspace has no EventEditorProvider), and map it
  // at THIS seam to a PLAIN sorted readonly string[] of well addresses. The
  // prop type is the plain array (never WellSelection / the context value), so
  // the universal pane's public API acquires no event-editor type. No
  // second selection state, no second expander: this is the deck's own
  // published selection, not a re-derivation of the expansion.
  const editor = useOptionalEventEditor()
  const selectedWells: readonly string[] = useMemo(() => {
    const wells = editor?.state.selection?.wells
    return wells && wells.length > 0 ? [...wells].sort() : []
  }, [editor?.state.selection?.wells])

  if (!chat) {
    return (
      <aside className="harness-chat-pane" data-testid="harness-chat-pane">
        <SurfaceFocusHeader />
        <div className="harness-chat-pane__empty" role="status">
          No surface has registered a chat with this panel.
        </div>
        <label>Message<textarea rows={4} value={prompt} disabled onChange={event => setPrompt(event.target.value)}/></label>
        <button disabled>Send</button>
      </aside>
    )
  }

  return (
    <div className="harness-chat-pane" data-testid="harness-chat-pane">
      <SurfaceFocusHeader />
      {/* L2-THREAD-SCOPED-1: the per-tab thread picker — ONLY on
          thread-scoped chats (ThreadPicker returns null otherwise — no
          dead chrome). */}
      <ThreadPicker chat={chat} />
      {/* L2-CHAT-UI-1 LEG D step 5 (OQ-4 PORT): the attached-sources strip
          (SourcesStrip + AddSourceModal + RunInEventEditorButton) — ported
          onto the universal pane from the dead AiTabPanel. Workspace-hosts
          only (the run button needs useWorkspace); surface-agnostic. */}
      {ws ? (
        <AttachedSourcesChrome
          studyId={ws.state.studyId}
          activeTab={activeTab}
          onPrefill={(text) => {
            // ChatInput prefill semantics (AiTabPanel's ChatInput.tsx:143-156):
            // the composed text REPLACES the composer contents — the user
            // reviews the composed text, then sends it with Send.
            setPrompt(text)
          }}
        />
      ) : null}
      {/* L2-CHAT-1 §3: the universal honest-failure wall — a success that
          produced nothing mountable is a REPORTED failure in plain language
          (the universal port of AiTabPanel's ai-tab-honest-wall). Owned by
          its turn: the next send clears it in useAiChat.
          L2-CHAT-1 FIX1 D5: role=alert (assertive) — parity with the legacy
          ai-tab-honest-wall (AiTabPanel.tsx:1437); a reported failure must
          be announced loudly, not as a polite status. */}
      {chat.honestWall ? (
        <div className="harness-chat-pane__honest-wall" data-testid="honest-wall" role="alert">
          {chat.honestWall}
        </div>
      ) : null}
      {/* Staged deck proposal: apply/discard + per-event drop, reachable even
          when the deck itself is off screen (mobile drawer). */}
      <ChatPreviewCard chat={chat} />
      {proposalFlow?.card ? (
        <div className="harness-chat-pane__proposal" data-testid="harness-chat-proposal">
          {/* L2-CHAT-UI-1 LEG D0 (ruling CHATUI1-legD-OQ2 §3): branch on the
              card's ADAPTER — the flow's card state carries it (the universal
              seam's replacement for AiTabPanel's private flowCardAdapterRef):
              'chain' mounts the execute-chain wall (ChainProposalCard — its
              strings are the server-built card document the flow carried
              verbatim), every other adapter mounts the composition card
              (the existing render, untouched). ONE switch on the adapter
              constant — no surface-name branching (the pane and the flow
              stay surface-agnostic). Same conditional-spread key-absent
              discipline as the AiTabPanel chain arm (exactOptionalProperty
              types): an absent optional key is ABSENT, never undefined. */}
          {proposalFlow.card.adapter === 'chain' ? (
            <ChainProposalCard
              phase={proposalFlow.card.phase}
              {...(proposalFlow.card.chainCard ? { card: proposalFlow.card.chainCard } : {})}
              {...(proposalFlow.card.summary !== undefined ? { summary: proposalFlow.card.summary } : {})}
              {...(proposalFlow.card.diagnostics ? { diagnostics: proposalFlow.card.diagnostics } : {})}
              {...(proposalFlow.card.draftId !== undefined ? { draftId: proposalFlow.card.draftId } : {})}
              {...(proposalFlow.card.revision !== undefined ? { revision: proposalFlow.card.revision } : {})}
              onAccept={() => void proposalFlow.acceptWorkstate()}
              onReject={proposalFlow.rejectWorkstate}
            />
          ) : (
            <WorkstateProposalCard
              {...proposalFlow.card}
              onAccept={() => void proposalFlow.acceptWorkstate()}
              onReject={() => proposalFlow.rejectWorkstate()}
            />
          )}
        </div>
      ) : null}
      <ChatLog
        messages={chat.messages}
        isStreaming={chat.isStreaming}
        prompt={prompt}
        onPromptChange={setPrompt}
        onSend={() => { chat.sendPrompt(prompt); setPrompt('') }}
        onCancel={chat.cancelStream}
        selectedWells={selectedWells}
        {...(onReviewProposal ? { onReview: onReviewProposal } : {})}
        // ANSWER-CHANNEL: the sentence is the visible turn; the structured
        // answer rides the SAME turn as data so the server can fold the
        // scientist's choice onto the held intent instead of re-drafting the
        // ambiguous noun and re-asking forever (the DMEM loop).
        onClarificationPick={(answerText, answer) => {
          chat.sendPrompt(answerText, undefined, { clarificationAnswers: [answer] })
        }}
        // L2-CLARIFY-CARD-1 (P4): the grouped card (a sentence with MULTIPLE
        // unresolved facts) answers the WHOLE sentence in ONE turn — the batch
        // answer sentence + the slot-ordered array ride the SAME turn, and the
        // server folds the array in one turn with zero model calls
        // (AgentOrchestrator.ts clarificationAnswers array fold). One batch
        // submit = one user message = one `Answered:` row (ChatLog
        // isClarificationAnswered — no predicate change).
        onClarificationSubmit={(answerText, answers) => {
          chat.sendPrompt(answerText, undefined, { clarificationAnswers: answers })
        }}
      />
    </div>
  )
}
