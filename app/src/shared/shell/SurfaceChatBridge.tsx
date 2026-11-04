/**
 * SurfaceChatBridge — CHATHOST-CONSOLIDATE-1: the ONE universal-chat registrar.
 *
 * It replaces the four handwritten per-host bridges (the retired deck bridge,
 * the retired run bridge, the project page's local door, and this file's old
 * aiContext-prop form). It takes `host` (a door-registry id — the door naming
 * itself, NOT a host list) plus an optional `base` (the page-local context +
 * scope record/artifact/registry/project build today) and:
 *   1. resolves the host's entry from the YAML door registry (build-time parse);
 *   2. LOUD-FAILS (throws ChatDoorMisconfiguredError naming the host + every
 *      missing required slice) if a `required_providers` slice is not published —
 *      never a silent empty pane (the LEG-F defect: a door mounted one provider
 *      too high is a loud error, not a deaf pane). The verification is a
 *      COMMIT-TIME re-check at a bounded deterministic deadline (D1 fix): a
 *      required provider that publishes a beat later (the deck slice from
 *      inside EventEditorProvider; StrictMode's double-mount / a keyed
 *      remount's transient clear) must not throw during the initial
 *      render/publish window, but a provider that is NEVER published still
 *      throws loudly after the window — not a silent pane, not an indefinite
 *      wait;
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
import { useEffect, useMemo, useState } from 'react'
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

/**
 * The bounded re-check window for a door's required providers (D1 fix, §2.5
 * step 2). A required slice that is merely PUBLISHING LATE (the deck slice
 * commits a beat after the door's first render; StrictMode's double-mount and
 * a keyed remount's clear-on-unmount re-render the door on a transiently empty
 * slice ref) must not throw during this window — the loud-fail is reserved for
 * a genuinely misconfigured door. A required slice that is NEVER published
 * still throws ChatDoorMisconfiguredError (named host + missing ids) once this
 * deadline has passed, so the check is bounded and deterministic — never a
 * silent empty pane, never an indefinite wait.
 */
export const DOOR_REQUIRED_RECHECK_DEADLINE_MS = 5000

/**
 * The bounded required-provider re-check (§2.5 step 2, D1 ordering fix).
 *
 * It reports, as of the CURRENT commit, whether the door's bounded re-check
 * window has elapsed: false during the initial render/publish window (the door
 * renders normally and keeps re-checking on every re-render — each slice
 * version bump re-renders it) and true once DOOR_REQUIRED_RECHECK_DEADLINE_MS
 * has passed since the door's mount. The caller re-reads the LIVE slice store
 * on the re-render that the deadline state flip triggers and throws
 * ChatDoorMisconfiguredError if a required slice is still unpublished — the
 * loud-fail contract, evaluated at a bounded deterministic deadline instead of
 * in the render body.
 *
 * No host-name comparison (V-8): `required` is the host entry's DATA fact
 * (whether it declares any required_providers), never a host id.
 */
function useDoorRequiredRecheckDeadline(required: boolean): boolean {
  const [elapsed, setElapsed] = useState(false)
  useEffect(() => {
    if (!required) return
    const t = window.setTimeout(() => setElapsed(true), DOOR_REQUIRED_RECHECK_DEADLINE_MS)
    return () => window.clearTimeout(t)
  }, [required])
  return required && elapsed
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

  // §2.5 step 2 (D1 ordering fix): the required-slice verification is a
  // BOUNDED RE-CHECK (see useDoorRequiredRecheckDeadline), not a render-body
  // throw. The deck slice is published by DeckChatSlice from INSIDE
  // EventEditorProvider — a sibling that commits a beat after this registrar's
  // first render (and StrictMode's double-mount / a keyed remount's
  // clear-on-unmount re-renders the registrar on a transiently EMPTY ref —
  // SurfaceSliceStore.tsx:151-159 documents this exact window). A render-body
  // throw therefore fired on every ordinary page load of the two deck doors
  // (gate D1) before the provider's stable commit. The loud-fail CONTRACT is
  // unchanged: once the bounded deadline has elapsed the live slice store is
  // re-checked (the throw at the bottom of this component) and a
  // still-missing required slice STILL throws ChatDoorMisconfiguredError
  // (named host + missing ids) — never a silent empty pane, and no
  // indefinite wait.
  const recheckDeadlineMet = useDoorRequiredRecheckDeadline(entry.required_providers.length > 0)

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
  // N wells` — the retired deck bridge's focus). Every other door (the run
  // door, the page-level `analysis` doors) publishes the POSTED summary as the
  // label plus the protocol-selection focused step as the detail (the run
  // door's "Step N: label" — absent when no step is focused OR no
  // ProtocolSelectionProvider: the conditional spread keeps the detail key
  // ABSENT, never `undefined`). The focused step is read from the
  // protocol-selection context DIRECTLY (the same truth the deleted
  // ChatContextHeader + the retired run bridge read): §8.4 forbids
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

  // §2.5 step 2 — the loud door-misconfiguration check, evaluated at the
  // BOUNDED re-check deadline (not in the first render, which precedes the
  // deck slice's publish). The live store is read here, on the re-render the
  // deadline flip triggers: a required slice that is merely late does not
  // throw (it re-checks on every slice version bump and clears itself once
  // published); a required slice that is NEVER published throws the named
  // error after the window. This is the LAST statement of the component (after
  // every hook), so the re-render that throws never violates the rules of
  // hooks. The contract test (SurfaceChatBridge.door.test.tsx) pins both legs.
  if (recheckDeadlineMet) {
    const missing = entry.required_providers.filter(
      (id) => (id === 'deck' ? deckSlice == null : getSlice(id) == null),
    )
    if (missing.length > 0) {
      throw new ChatDoorMisconfiguredError(host, missing)
    }
  }

  return null
}
