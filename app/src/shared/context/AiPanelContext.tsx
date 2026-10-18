import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { UseAiChatReturn } from '../hooks/useAiChat'
import type { WorkstateProposalFlow } from '../ai/useWorkstateProposalFlow'

const STORAGE_KEY = 'ai-panel-open'

function loadPersistedOpen(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true'
  } catch {
    return false
  }
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
  /** Write a chat into the ref (no state update — safe during render). */
  writeChat: (chat: UseAiChatReturn) => void
  /** Write the surface's proposal flow into the ref (render-safe). */
  writeProposalFlow: (flow: WorkstateProposalFlow | null) => void
  /** Increment version counter to notify consumers (call from useEffect only). */
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

  const bumpChatVersion = useCallback(() => {
    setChatVersion((v) => v + 1)
  }, [])

  const writeProposalFlow = useCallback((flow: WorkstateProposalFlow | null) => {
    proposalFlowRef.current = flow
  }, [])

  const clearChat = useCallback(() => {
    chatRef.current = null
    proposalFlowRef.current = null
    setChatVersion((v) => v + 1)
  }, [])

  return (
    <AiPanelContext.Provider value={{ open, setOpen, toggle, chatRef, proposalFlowRef, chatVersion, writeChat, writeProposalFlow, bumpChatVersion, clearChat }}>
      {children}
    </AiPanelContext.Provider>
  )
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useAiPanel must be used within AiPanelProvider')
  const { chatRef, proposalFlowRef, chatVersion, writeChat, writeProposalFlow, bumpChatVersion, clearChat, ...rest } = ctx
  void chatVersion // subscribe to version changes so we re-render
  return { ...rest, chat: chatRef.current, proposalFlow: proposalFlowRef.current }
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
  if (!ctx) return null
  void ctx.chatVersion // subscribe to registration/unregistration
  return { chat: ctx.chatRef.current, proposalFlow: ctx.proposalFlowRef.current }
}

export function useRegisterAiChat(chat: UseAiChatReturn, proposalFlow?: WorkstateProposalFlow | null) {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useRegisterAiChat must be used within AiPanelProvider')
  const { writeChat, writeProposalFlow, bumpChatVersion, clearChat } = ctx

  // Write latest chat to ref on every render — ref write only, no setState.
  writeChat(chat)
  writeProposalFlow(proposalFlow ?? null)

  // On mount: bump version so AiChatPanel re-renders and picks up the ref.
  // On unmount: clear ref and bump version.
  useEffect(() => {
    bumpChatVersion()
    return () => {
      clearChat()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
