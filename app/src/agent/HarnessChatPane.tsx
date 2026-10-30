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
import { useCallback, useEffect, useState } from 'react'
import { useOptionalAiPanel } from '../shared/context/AiPanelContext'
import { ChatLog } from './ChatLog'
import { WorkstateProposalCard } from '../event-editor/right-pane/ai/WorkstateProposalCard'
import { ChainProposalCard } from '../event-editor/right-pane/ai/ChainProposalCard'
import { ChatPreviewCard } from './ChatPreviewCard'
import { SurfaceFocusHeader } from './SurfaceFocusHeader'
import type { UseAiChatReturn } from '../shared/hooks/useAiChat'
import type { ThreadSummary } from '../shared/api/aiThreadClient'
import './HarnessChatPane.css'

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
        {...(onReviewProposal ? { onReview: onReviewProposal } : {})}
        onClarificationPick={(answerText) => { chat.sendPrompt(answerText) }}
      />
    </div>
  )
}
