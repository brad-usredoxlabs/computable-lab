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
 * segment must be SAFE — the client guard below mirrors the server's ONE
 * rule (AiThreadStore.ts isValidThreadSegment: non-empty,
 * THREAD_SEGMENT_PATTERN /^[A-Za-z0-9._-]+$/, and NOT dots-only —
 * DOTS_ONLY_SEGMENT_PATTERN /^\.+$/, because '.' is a no-op path hop and
 * '..' escapes the {endpoint} directory). A scope the client refuses is
 * OMITTED (the server's reserved "_" scope then holds the thread); a
 * malformed scope header maps to fresh-empty "_" semantics at the handler
 * (AiThreadHandlers.ts:71) — never a 4xx, never a fallback read.
 *
 * LEG D rider D1 (AS-L2T0915-LEGC-MINORS-DEFERRED, DEFECT D1): the old
 * client mirror omitted the server's dots-only refusal (so '.' / '..'
 * passed the guard) and its header claimed a malformed scope "would 400 the
 * thread fetch and fail every turn" — no longer true since the handler maps
 * malformed scope to undefined (fresh "_"). Aligned with isValidThreadSegment
 * (ONE guard, no per-surface branch) and the header re-worded to the never-4xx
 * truth. Pin: the '.' / '..' refusal is unit-asserted in
 * RegistryHostPage.surfaceChat.test.tsx (the bridge's home surface).
 *
 * Surface kind: 'analysis' — the server's declared no-params AI-context
 * surface (server/src/ai/systemPrompt.ts:299-303): generic prompt with an
 * empty preamble, the intended behavior for a context-reading chat.
 */
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import { useOptionalAiPanel } from '../context/AiPanelContext'
import type { AiContext } from '../../types/aiContext'

/**
 * Mirror of the server's thread-scope segment rule (see header cite).
 * LEG D rider D1: aligned with the server's ONE guard (isValidThreadSegment) —
 * the alphabet guard PLUS the dots-only refusal ('.' / '..' are refused even
 * though the alphabet technically admits dots). Exported so the refusal is
 * unit-pinnable; ONE guard for all surfaces — no per-surface branching.
 */
const THREAD_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/
const DOTS_ONLY_SEGMENT_PATTERN = /^\.+$/

export function isThreadSegmentSafe(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.length > 0
    && THREAD_SEGMENT_PATTERN.test(value)
    && !DOTS_ONLY_SEGMENT_PATTERN.test(value)
  )
}

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
    ...(isThreadSegmentSafe(scope) ? { scope } : {}),
  })
  return null
}
