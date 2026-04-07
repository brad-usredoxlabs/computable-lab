/**
 * AiContextProvider — Generic React context that supplies an AiContext to the AI chat system.
 *
 * Each page wraps its content with this provider, supplying page-specific context.
 * useAiChat reads from this provider instead of directly from LabwareEditorContext.
 */

import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import type { AiContext } from '../../types/aiContext'

const AiContextReact = createContext<AiContext | null>(null)

export function AiContextProvider({
  value,
  children,
}: {
  value: AiContext
  children: ReactNode
}) {
  return (
    <AiContextReact.Provider value={value}>
      {children}
    </AiContextReact.Provider>
  )
}

export function useAiContext(): AiContext | null {
  return useContext(AiContextReact)
}
