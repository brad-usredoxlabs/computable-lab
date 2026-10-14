/**
 * ChatFocusContext — the surface-agnostic working-focus carrier for the shared
 * harness chat pane (HARNESS-SEQ-1).
 *
 * The focus is DERIVED by the host page from its resolved surface state (tab /
 * selected record / records) and published here. The context itself holds NO
 * derivation logic and makes NO model calls. Without a provider, consumers see
 * null (the run page's ChatContextHeader fallback stays untouched).
 */
import { createContext, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

export interface ChatFocus {
  surface: string
  label: string
  detail?: string
  refs?: string[]
}

interface ChatFocusContextValue {
  focus: ChatFocus | null
  setFocus: (focus: ChatFocus | null) => void
}

const ChatFocusContext = createContext<ChatFocusContextValue | null>(null)

/**
 * Host-controlled when `focus` is supplied (the host's resolved state is the
 * single source); otherwise the provider carries internal focus set via
 * setFocus. Either way the provider is a carrier, not a deriver.
 */
export function ChatFocusProvider({ focus, children }: { focus?: ChatFocus | null; children: ReactNode }) {
  const [internal, setInternal] = useState<ChatFocus | null>(null)
  const value = useMemo<ChatFocusContextValue>(() => ({
    focus: focus !== undefined ? focus : internal,
    setFocus: (next) => { setInternal(next) },
  }), [focus, internal])
  return <ChatFocusContext.Provider value={value}>{children}</ChatFocusContext.Provider>
}

/** The published focus, or null when no provider / no focus. Never throws. */
export function useChatFocus(): ChatFocus | null {
  return useContext(ChatFocusContext)?.focus ?? null
}
