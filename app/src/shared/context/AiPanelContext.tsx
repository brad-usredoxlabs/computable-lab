import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { UseAiChatReturn } from '../hooks/useAiChat'

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
  chatVersion: number
  /** Write a chat into the ref (no state update — safe during render). */
  writeChat: (chat: UseAiChatReturn) => void
  /** Increment version counter to notify consumers (call from useEffect only). */
  bumpChatVersion: () => void
  /** Clear chat ref and notify consumers (call from useEffect only). */
  clearChat: () => void
}

const AiPanelContext = createContext<AiPanelContextValue | null>(null)

export function AiPanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(loadPersistedOpen)
  const chatRef = useRef<UseAiChatReturn | null>(null)
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

  const clearChat = useCallback(() => {
    chatRef.current = null
    setChatVersion((v) => v + 1)
  }, [])

  return (
    <AiPanelContext.Provider value={{ open, setOpen, toggle, chatRef, chatVersion, writeChat, bumpChatVersion, clearChat }}>
      {children}
    </AiPanelContext.Provider>
  )
}

export function useAiPanel() {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useAiPanel must be used within AiPanelProvider')
  const { chatRef, chatVersion, writeChat, bumpChatVersion, clearChat, ...rest } = ctx
  void chatVersion // subscribe to version changes so we re-render
  return { ...rest, chat: chatRef.current }
}

export function useRegisterAiChat(chat: UseAiChatReturn) {
  const ctx = useContext(AiPanelContext)
  if (!ctx) throw new Error('useRegisterAiChat must be used within AiPanelProvider')
  const { writeChat, bumpChatVersion, clearChat } = ctx

  // Write latest chat to ref on every render — ref write only, no setState.
  writeChat(chat)

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
