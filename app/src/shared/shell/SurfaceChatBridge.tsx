/**
 * SurfaceChatBridge — CHATHOST-CONSOLIDATE-1: the ONE universal-chat registrar.
 *
 * It replaces the four handwritten per-host bridges (DeckSurfaceChat,
 * RunSurfaceChatBridge, ProjectSurfaceChat, and this file's old
 * aiContext-prop form). It takes `host` (a door-registry id — the door naming
 * itself, NOT a host list) plus an optional `base` (the page-local context +
 * scope record/artifact/registry/project build today) and:
 *   1. resolves the host's entry from the YAML door registry (build-time parse);
 *   2. LOUD-FAILS (throws ChatDoorMisconfiguredError naming the host + every
 *      missing required slice) if a `required_providers` slice is not published —
 *      never a silent empty pane (the LEG-F defect: a door mounted one provider
 *      too high is a loud error, not a deaf pane);
 *   3. collects the AiContext through the ONE collector (collectSurfaceContext:
 *      merges published slices into the base, resolves the posted surface);
 *   4. wires the ghost/adoption/deck-layout handlers from the published `deck`
 *      slice ONLY when the host's `ghost_mount` is true;
 *   5. calls useSurfaceChat exactly once.
 *
 * NO HOST-NAME COMPARISON (bait #8 / V-8): the `host` id only indexes the YAML
 * entry; endpoint/scope/ghost-wiring/surface all key off the entry's DATA and
 * the PUBLISHED slices. The capability facts live in config/chat/chat-hosts.yaml.
 *
 * Provider posture: renders nothing. Without an AiPanelProvider it honestly
 * registers nothing (useRegisterAiChat throws, so the inner hook component is
 * gated on the optional provider — the same posture the old bridge had; host
 * pages render provider-free in tests and keep the pane's honest empty state).
 */
import { useEffect, useMemo } from 'react'
import { useSurfaceChat } from '../../agent/useSurfaceChat'
import { useOptionalAiPanel } from '../context/AiPanelContext'
import { useSurfaceSlices } from '../context/SurfaceSliceStore'
import {
  collectSurfaceContext,
  isThreadSegmentSafe,
  focusedStepDetail,
  type DoorEntry,
  type CollectorBase,
  type CollectorDeckSlice,
} from '../lib/collectSurfaceContext'
import { useSetChatFocus } from '../../agent/ChatFocusContext'
import { useProtocolSelection } from '../../event-editor/protocol/ProtocolSelectionContext'
import { parse as parseYaml } from 'yaml'
import chatHostsRaw from '../../../../config/chat/chat-hosts.yaml?raw'

// Re-exported (the registry-host pin unit-asserts the thread-scope segment
// refusal through this import — the bridge's home surface): ONE guard, the
// server mirror (isThreadSegmentSafe), no per-surface branch.
export { isThreadSegmentSafe }

// ---------------------------------------------------------------------------
// The door registry (build-time parse, §2.6) — parse ONCE at module load.
// ---------------------------------------------------------------------------

interface RegistryHost {
  id: string
  surface: string
  required_providers?: string[]
  optional_providers?: string[]
  ghost_mount?: boolean
}

function loadDoorRegistry(): { byId: Map<string, DoorEntry> } {
  let doc: { hosts?: RegistryHost[] }
  try {
    doc = parseYaml(chatHostsRaw) as { hosts?: RegistryHost[] }
  } catch (e) {
    throw new Error(
      `chat-door registry: malformed config/chat/chat-hosts.yaml — ${String(e)}`,
    )
  }
  const hosts = doc.hosts
  if (!Array.isArray(hosts) || hosts.length === 0) {
    throw new Error('chat-door registry: config/chat/chat-hosts.yaml has no hosts')
  }
  const byId = new Map<string, DoorEntry>()
  for (const h of hosts) {
    byId.set(h.id, {
      id: h.id,
      surface: h.surface,
      required_providers: h.required_providers ?? [],
      optional_providers: h.optional_providers ?? [],
      ghost_mount: h.ghost_mount ?? false,
    })
  }
  return { byId }
}

// Parsed once (the registry is static — not caller-parameterized). A YAML typo
// throws at import: it cannot reach production (the contract test runs in CI).
export const doorRegistry = loadDoorRegistry()

/** The set of door-registry host ids (the closed vocabulary the call sites name). */
export type ChatHostId = string

/**
 * The loud door-misconfiguration error (§2.5 step 2). Names the host and every
 * required slice that is not published, so a door mounted one provider too high
 * is a loud error, never a silent empty pane.
 */
export class ChatDoorMisconfiguredError extends Error {
  readonly host: string
  readonly missing: string[]
  constructor(host: string, missing: string[]) {
    super(
      `chat door '${host}' is misconfigured: required slice(s) not published: ${missing.join(', ')}`,
    )
    this.name = 'ChatDoorMisconfiguredError'
    this.host = host
    this.missing = missing
  }
}

export interface SurfaceChatBridgeProps {
  /** The door-registry host id (the door naming itself — a data lookup, never compared). */
  host: ChatHostId
  /**
   * The page-local base context + thread scope (record/artifact/registry/
   * project build today). Deck doors pass none: the published `deck` slice
   * supplies the full context.
   */
  base?: CollectorBase
}

export function SurfaceChatBridge(props: SurfaceChatBridgeProps) {
  const panel = useOptionalAiPanel()
  if (!panel) return null
  return <SurfaceChatRegistrar {...props} />
}

function SurfaceChatRegistrar({ host, base }: SurfaceChatBridgeProps) {
  const entry = doorRegistry.byId.get(host)
  if (!entry) {
    // A literal host id that is not in the registry: a loud error (the
    // contract test pins the literal set == the YAML ids, so this is the
    // anti-drift backstop at runtime).
    throw new Error(`chat door '${host}' is not declared in config/chat/chat-hosts.yaml`)
  }

  const { getSlice } = useSurfaceSlices()
  const deckSlice = getSlice('deck') as CollectorDeckSlice | undefined

  // §2.5 step 2: verify every required slice is published — LOUD (throw), never
  // a silent empty pane. (A render-body throw propagates to the test / error
  // boundary; it is the acceptance (b) "unit test mounts the registrar with a
  // required provider absent and asserts the loud error".)
  const missing = entry.required_providers.filter(
    (id) => (id === 'deck' ? deckSlice == null : getSlice(id) == null),
  )
  if (missing.length > 0) {
    throw new ChatDoorMisconfiguredError(host, missing)
  }

  const collected = useMemo(
    () =>
      collectSurfaceContext({
        host,
        base: base ?? { context: { surface: 'analysis', summary: '', surfaceContext: {} } },
        slices: {
          ...(deckSlice ? { deck: deckSlice } : {}),
        },
        entry,
      }),
    [host, base, deckSlice, entry],
  )

  const endpoint = collected.endpoint
  const scope = collected.scope
  // §2.5 step 3: the ghost handlers wire ONLY when the host declares ghost_mount
  // (the collector only returns handlers in that case — belt and braces).
  const handlers = entry.ghost_mount ? collected.handlers : undefined

  // Thread-scope segment guard (the server mirror — the dots-only refusal the
  // host-page pins assert on isThreadSegmentSafe). Exported (kept from the old
  // bridge) so the refusal stays unit-pinnable.
  useSurfaceChat({
    aiContext: collected.aiContext,
    endpoint,
    ...(scope !== undefined && isThreadSegmentSafe(scope) ? { scope } : {}),
    ...(handlers ? handlers : {}),
  })

  // Working-focus publish (the pane's SurfaceFocusHeader carrier). Data-driven,
  // no host-name comparison (V-8): the collector's `deckSurfaceWins` signal (the
  // deck slice won the posted surface — the deck door) selects the deck slice's
  // working focus (label `Deck <eventGraphId>`, detail `platform · variant ·
  // N wells` — the old DeckSurfaceChat's focus). Every other door (the run
  // door, the page-level `analysis` doors) publishes the POSTED summary as the
  // label plus the protocol-selection focused step as the detail (the run
  // door's "Step N: label" — absent when no step is focused OR no
  // ProtocolSelectionProvider: the conditional spread keeps the detail key
  // ABSENT, never `undefined`). The focused step is read from the
  // protocol-selection context DIRECTLY (the same truth the deleted
  // ChatContextHeader + the old RunSurfaceChatBridge read): §8.4 forbids
  // publishing the protocol-selection SLICE unless the collector consumes it,
  // and the collector does not — the focus concern is the registrar's, and the
  // slice store cannot reach a provider mounted ABOVE the registrar (the run
  // page's ProtocolSelectionProvider is above its AiPanelProvider).
  const setFocus = useSetChatFocus()
  const selection = useProtocolSelection()
  const deckFocus = collected.deckSurfaceWins ? deckSlice?.focus : undefined
  const focusSurface = collected.aiContext.surface
  const focusLabel = deckFocus?.label ?? collected.aiContext.summary
  const detail = deckFocus?.detail ?? focusedStepDetail(selection?.focusedStep ?? null)
  useEffect(() => {
    setFocus({
      surface: focusSurface,
      label: focusLabel,
      ...(detail !== undefined ? { detail: detail } : {}),
    })
    return () => setFocus(null)
  }, [setFocus, focusSurface, focusLabel, detail])

  return null
}
