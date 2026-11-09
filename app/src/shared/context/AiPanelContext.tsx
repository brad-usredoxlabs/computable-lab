import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import type { UseAiChatReturn } from '../hooks/useAiChat'
import type { WorkstateProposalFlow } from '../ai/useWorkstateProposalFlow'
import {
  createSurfaceSliceStore,
  SurfaceSliceStoreContext,
} from './SurfaceSliceStore'

const STORAGE_KEY = 'ai-panel-open'

function loadPersistedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * The registration STORE the pane subscribes to (useSyncExternalStore).
 *
 * Why it exists (L2-CHAT-1 regatefix2 D3): the pane (HarnessChatPane) reads
 * the registered chat from `chatRef` at render time. Before this store the
 * only thing that could re-render the pane on a chat change was the
 * context's `chatVersion` — and a context bump re-renders the PROVIDER
 * only: its `children` element is referentially stable, so the pane's
 * subtree bails (the ghost test's REACTIVITY NOTE) and the pane keeps its
 * stale snapshot. A clarification turn changes NO host state, so the pane
 * sat on "Prompt received. Starting compiler pipeline..." for 45s while
 * the hook had finished in 4.3s (the gate's D3).
 *
 * A useSyncExternalStore subscription re-renders the SUBSCRIBING component
 * (the pane) directly — independent of element identity and provider
 * propagation. The producer (`useRegisterAiChat`) bumps the version when
 * the registered chat's PANE-RELEVANT state changes (the producer owns the
 * hook, so it re-renders on every one of those changes). The signature is
 * derived from stable-value fields, so the bump converges: the re-render
 * it triggers changes none of them.
 */
interface ChatRegistrationStore {
  version: number
  listeners: Set<() => void>
}

interface AiPanelContextValue {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  chatRef: React.RefObject<UseAiChatReturn | null>
  /**
   * The proposal flow registered by the same surface that owns the chat
   * (compile → card → accept/reject). The pane renders the card from it; the
   * surface owns it, so there is exactly one writer per surface.
   */
  proposalFlowRef: React.RefObject<WorkstateProposalFlow | null>
  chatVersion: number
  /** Subscribe the calling component to registration changes. */
  subscribe: (listener: () => void) => () => void
  /** The store's current version (stable between bumps). */
  getSnapshot: () => number
  /** Write a chat into the ref (no state update — safe during render). */
  writeChat: (chat: UseAiChatReturn) => void
  /** Write the surface's proposal flow into the ref (render-safe). */
  writeProposalFlow: (flow: WorkstateProposalFlow | null) => void
  /** Increment the version (store + state) to notify subscribers. */
  bumpChatVersion: () => void
  /** Clear chat ref and notify consumers (call from useEffect only). */
  clearChat: () => void
}

const AiPanelContext = createContext<AiPanelContextValue | null>(null)

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(loadPersistedOpen)
  const chatRef = useRef<UseAiChatReturn | null>(null)
  const proposalFlowRef = useRef<WorkstateProposalFlow | null>(null)
  const [chatVersion, setChatVersion] = useState(0)
  const storeRef = useRef<ChatRegistrationStore>({ version: 0, listeners: new Set() })

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(open))
    } catch { /* ignore */ }
  }, [open])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
  }, [])

  const toggle = useCallback(() => {
    setOpenState((prev) => !prev)
  }, [])

  const writeChat = useCallback((c: UseAiChatReturn) => {
    chatRef.current = c
  }, [])

  const subscribe = useCallback((listener: () => void) => {
    storeRef.current.listeners.add(listener)
    return () => {
      storeRef.current.listeners.delete(listener)
    }
  }, [])

  const getSnapshot = useCallback(() => storeRef.current.version, [])

  const bumpChatVersion = useCallback(() => {
    // Store first: the pane's useSyncExternalStore subscription re-renders
    // the pane directly (the path that actually matters). The state bump
    // keeps the context value honest for consumers that read chatVersion.
    storeRef.current.version += 1
    for (const listener of storeRef.current.listeners) listener()
    setChatVersion((v) => v + 1)
  }, [])

  const writeProposalFlow = useCallback((flow: WorkstateProposalFlow | null) => {
    proposalFlowRef.current = flow
  }, [])

  const clearChat = useCallback(() => {
    chatRef.current = null
    proposalFlowRef.current = null
    bumpChatVersion()
  }, [bumpChatVersion])

  // CHATHOST-CONSOLIDATE-1 §2.4: the ONE surface-slice store (created here so
  // there is exactly one per app tree, and no module-global cross-test
  // leakage). Provided through its own context (a separate context avoids the
  // SurfaceSliceStore <-> AiPanelContext import cycle); the providers nest so
  // a door "reads through the same provider" (AiPanelProvider owns the
  // instance). useMemo keeps the instance stable across re-renders.
  const sliceStore = useMemo(() => createSurfaceSliceStore(), [])

  return (
    <AiPanelContext.Provider value={{ open, setOpen, toggle, chatRef, proposalFlowRef, chatVersion, subscribe, getSnapshot, writeChat, writeProposalFlow, bumpChatVersion, clearChat }}>
      <SurfaceSliceStoreContext.Provider value={sliceStore}>
        {children}
      </SurfaceSliceStoreContext.Provider>
    </AiPanelContext.Provider>
  )
}

/**
 * A pane-relevant signature of the registered chat: the fields the pane
 * actually renders (the message stream, streaming/accepting flags, the
 * staged-preview shape, the honest walls, the proposal card). The last
 * message's CONTENT is in the signature — the streaming reply's text
 * mutates in place, and the pane must see it (the placeholder → the
 * clarification is exactly that mutation).
 */
function paneRelevantSignature(chat: UseAiChatReturn, flow: WorkstateProposalFlow | null): string {
  const last = chat.messages[chat.messages.length - 1]
  return [
    String(chat.isStreaming),
    // thread-scope settle visibility (L2-THREADPICKER-REFETCH-1): the threadId
    // is absent until the lazy-mint resolves (mint is provisionally-gated),
    // so its appearance changes the signature exactly once on settle.
    chat.threadId ?? '',
    String(chat.isAccepting),
    String(chat.hasPreview),
    chat.previewEvents.length,
    chat.previewLabwareAdditions.length,
    String(chat.previewStagedLabwareCount),
    chat.unresolvedRefs.length,
    // L2-CLARIFY-TARGET-1 UI-gate fix 1 / D3 (the inert row Discard toggle): the
    // staged-preview per-event STATE is pane-relevant — dropping/restoring a row
    // flips its entry here (`pending` <-> `rejected`) while `previewEvents` is
    // unchanged. Without it the signature never changes on a toggle, the
    // registration bump never fires, the pane (a consumer that re-renders ONLY
    // on that bump) keeps rendering the stale pending row, and the `Discard`
    // verb can never become `Restore`. Serialize the entries deterministically
    // (sorted by eventId) so a state flip changes the signature exactly once.
    [...(chat.previewEventStates ?? new Map<string, string>()).entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([eventId, state]) => `${eventId}:${state}`)
      .join(','),
    chat.honestWall ?? '',
    chat.adoptionError ?? '',
    chat.messages.length,
    last ? `${last.id}:${last.content}` : '',
    flow?.card ? `${flow.card.phase}:${flow.card.draftId}:${flow.card.revision}` : 'none',
  ].join('|')
}

const NOOP_SUBSCRIBE = () => () => { /* no provider — nothing to subscribe to */ }
const NOOP_GET_SNAPSHOT = () => 0

/**
 * Subscribe the calling component to registration changes WITHOUT a
 * conditional hook call: provider presence is stable per instance, but the
 * early-return in the optional consumer would otherwise make
 * useSyncExternalStore a conditional hook (a rules-of-hooks violation).
 * With no provider the no-op store never bumps, so the consumer simply
 * never re-renders from the registration (matching the old behavior).
 */
function useRegistrationStore(ctx: AiPanelContextValue | null) {
  useSyncExternalStore(
    ctx ? ctx.subscribe : NOOP_SUBSCRIBE,
    ctx ? ctx.getSnapshot : NOOP_GET_SNAPSHOT,
    ctx ? ctx.getSnapshot : NOOP_GET_SNAPSHOT,
  )
  void ctx?.chatVersion // keep the context value subscribed (registration bumps)
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useAiPanel must be used within AiPanelProvider')
  // L2-CHAT-1 regatefix2 D3: subscribe DIRECTLY to the registration store —
  // a chat-state bump re-renders THIS component (the pane), which re-reads
  // the refs. The old `void chatVersion` trick only worked when a host
  // re-render also recreated the pane element (the seam weakness the ghost
  // test documents); a clarification turn provides no such host re-render.
  useRegistrationStore(ctx)
  const { open, setOpen, toggle, chatRef, proposalFlowRef } = ctx
  return { open, setOpen, toggle, chat: chatRef.current, proposalFlow: proposalFlowRef.current }
}

/**
 * Optional form of `useAiPanel`: returns null when there is no AiPanelProvider
 * (and therefore no registered chat) instead of throwing. Surfaces that may
 * mount without the provider — and shell chrome that must decide whether THIS
 * surface has a universal chat — use this.
 */
export function useOptionalAiPanel(): {
  chat: UseAiChatReturn | null
  proposalFlow: WorkstateProposalFlow | null
} | null {
  const ctx = useContext(AiPanelContext)
  // Same direct subscription — an optional consumer must not miss a
  // chat-state change just because it is the shell deciding visibility.
  // Unconditional (no-op without a provider) so the early return below
  // never turns the hook call conditional.
  useRegistrationStore(ctx)
  if (!ctx) return null
  return { chat: ctx.chatRef.current, proposalFlow: ctx.proposalFlowRef.current }
}

export function useRegisterAiChat(chat: UseAiChatReturn, proposalFlow?: WorkstateProposalFlow | null) {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useRegisterAiChat must be used within AiPanelProvider')
  const { writeChat, writeProposalFlow, bumpChatVersion, clearChat } = ctx
  const flow = proposalFlow ?? null

  // Write latest chat to ref on every render — ref write only, no setState.
  writeChat(chat)
  writeProposalFlow(flow)

  // L2-CHAT-1 regatefix2 D3: bump the registration version when the
  // registered chat's PANE-RELEVANT state changes — not only on
  // mount/unmount. This component owns the chat hook (it called
  // useAiChat/useSurfaceChat), so it re-renders on every one of those
  // changes; the signature compare + effect is the notification point.
  // Converges: the pane re-render the bump triggers changes none of the
  // signature's inputs (it only reads the refs), so no re-bump loop.
  const signature = paneRelevantSignature(chat, flow)
  const lastSignatureRef = useRef(signature)
  useEffect(() => {
    if (lastSignatureRef.current === signature) return
    lastSignatureRef.current = signature
    bumpChatVersion()
  }, [signature, bumpChatVersion])

  // On mount: bump version so the pane re-renders and picks up the ref
  // (the original behavior — a fresh registration must be visible even
  // when the signature equals a previous surface's). On unmount: clear
  // ref and bump version.
  useEffect(() => {
    bumpChatVersion()
    return () => {
      clearChat()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
