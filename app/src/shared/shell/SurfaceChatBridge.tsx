/**
 * SurfaceChatBridge — L2-CHAT-UI-1 LEG C: the universal-chat registrar for
 * the workspace host surfaces (registry / record / artifact / project).
 *
 * ONE registrar, the DeckSurfaceChat pattern (memoized AiContext in the
 * host + `useSurfaceChat`), MINUS the deck ghosting: these surfaces own no
 * event-editor preview, so there is no ghost mount, no adoption seam, and
 * no deck-layout handler. The bridge RENDERS NOTHING — `useSurfaceChat`
 * registers the chat + proposal flow through AiPanelContext
 * (useRegisterAiChat), and RightPane's `panelSlot?.chat` arm
 * (RightPane.tsx:95) then shows HarnessChatPane automatically instead of
 * the legacy AiTabPanel fallback.
 *
 * Honest no-provider posture: `useRegisterAiChat` THROWS without an
 * AiPanelProvider (AiPanelContext.tsx:211). The routed app always has one
 * (main.tsx wraps the app), but host pages are also rendered provider-free
 * in tests — there the bridge registers NOTHING and RightPane keeps the
 * honest AiTabPanel fallback (a revert of any sub-leg returns to exactly
 * that state). The provider check lives here; the actual hook calls live in
 * the inner component so they are never conditional (rules-of-hooks).
 *
 * Thread identity: endpoint 'browser' (the generic-chat thread endpoint —
 * same choice MaterialsPage made pre-routing, MaterialsPage.tsx:46). Scope
 * is the surface's INSTANCE identity when it is thread-segment safe: the
 * server keys threads on (user, endpoint, scope, threadId) and every path
 * segment must match THREAD_SEGMENT_PATTERN /^[A-Za-z0-9._-]+$/
 * (server/src/ai-threads/AiThreadStore.ts:382) — a non-matching scope would
 * 400 the thread fetch and fail every turn, so an unsafe scope is omitted
 * (the server's reserved "_" scope then holds the thread).
 *
 * Surface kind: 'analysis' — the server's declared no-params AI-context
 * surface (server/src/ai/systemPrompt.ts:299-303): generic prompt with an
 * empty preamble, the intended behavior for a context-reading chat.
 */
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import { useOptionalAiPanel } from '../context/AiPanelContext'
import type { AiContext } from '../../types/aiContext'

/** Mirror of the server's thread-scope segment rule (see header cite). */
const THREAD_SEGMENT = /^[A-Za-z0-9._-]+$/

export interface SurfaceChatBridgeProps {
  /** The surface's context, memoized by the host page (DeckSurfaceChat pattern). */
  aiContext: AiContext
  /**
   * The surface's instance identity for thread scoping (studyId / recordId).
   * Omitted, or not thread-segment safe, => no scope => the server's "_" scope.
   */
  scope?: string | null
}

export function SurfaceChatBridge({ aiContext, scope }: SurfaceChatBridgeProps) {
  // Provider presence is stable per tree, so this early return never makes
  // a hook conditional inside this component (it calls exactly one hook).
  const panel = useOptionalAiPanel()
  if (!panel) return null
  return <SurfaceChatRegistrar aiContext={aiContext} scope={scope} />
}

function SurfaceChatRegistrar({ aiContext, scope }: SurfaceChatBridgeProps) {
  useSurfaceChat({
    aiContext,
    endpoint: 'browser',
    ...(scope && THREAD_SEGMENT.test(scope) ? { scope } : {}),
  })
  return null
}
