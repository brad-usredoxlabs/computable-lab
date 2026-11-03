/**
 * SurfaceSliceStore — CHATHOST-CONSOLIDATE-1 §2.4: the app-level STORE the
 * context-producing providers write into and the ONE registrar (the
 * SurfaceChatBridge) reads.
 *
 * Why a STORE, not a React context (§2.4 / bait #3): the defect class this item
 * kills is POSITIONAL — a bridge mounted one provider too high is silently
 * deaf (proven live on the project page's local door). React context only flows DOWN, so a
 * "well-known context slot" implemented as another context reproduces the
 * defect. A store (write + subscribe) makes mount position irrelevant: a
 * registrar ABOVE the deck's EventEditorProvider still sees a deck slice
 * published BELOW it (the project page's page-level door).
 *
 * The store instance is created by AiPanelProvider (ONE per app tree — no
 * module-global, no cross-test leakage) and read through a dedicated context
 * (SurfaceSliceStoreContext) that AiPanelProvider provides. The write is
 * render-safe (a ref write, no setState — the AiPanelContext writeChat pattern);
 * the version bumps in an effect when a slice's identity changes, so subscribers
 * (the registrar, via useSyncExternalStore) re-render on a real change.
 */
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useSyncExternalStore,
  useCallback,
  useMemo,
} from 'react'

// The deck slice bundle's canonical shape is the collector's (the ONE context
// collector is the source of truth for what a deck slice carries). The
// store -> collector import is one-way (the collector imports only
// types/aiContext + api/aiThreadClient + hooks/useAiChat, none of which import
// the store).
import type { CollectorDeckSlice } from '../lib/collectSurfaceContext'

// The slice vocabulary is DATA (config/chat/chat-hosts.yaml `slices:`) — this
// is the structural typing of the BUNDLES, not a copy of the vocabulary (bait
// #7/#8). `id` is a plain string; the registry's slice ids (deck /
// protocol-selection / workspace) are enforced by the contract test, not here.
export type SurfaceSliceId = string

/**
 * The `deck` slice bundle — the published state a deck door publishes. The
 * canonical shape is the collector's `CollectorDeckSlice` (the ONE context
 * collector is the source of truth for what a deck slice carries: the
 * precomputed deck context patch, the thread endpoint + scope, and the
 * ghost/adoption/deck-layout handler closures — structurally the useAiChat
 * option callbacks the registrar wires ONLY when the host's `ghost_mount` is
 * true). Re-exporting it (not re-declaring it) keeps the store, the collector,
 * and the publisher on ONE type — the loose `{[k:string]:unknown}` handler
 * types a separate declaration would force break the real `PlateEvent`-typed
 * `onAcceptEvent` the editor's actions provide.
 */
export type DeckSliceBundle = CollectorDeckSlice
export type { CollectorDeckSlice } from '../lib/collectSurfaceContext'

/** The `protocol-selection` slice — the focused step (the pane's working-focus box). */
export interface ProtocolSelectionSlice {
  focusedStep: { stepId: string; label: string; ordinal?: number } | null
}

type SliceValue = DeckSliceBundle | ProtocolSelectionSlice | Record<string, unknown>

/** The store interface (created once per AiPanelProvider). */
export interface SurfaceSliceStore {
  /** Current version (the useSyncExternalStore snapshot). Stable between bumps. */
  getVersion: () => number
  /** Subscribe a listener to version bumps. */
  subscribe: (listener: () => void) => () => void
  /** Read the current slice value (ref read — safe during render). */
  getSlice: (id: SurfaceSliceId) => SliceValue | undefined
  /** Render-safe write (ref only, no setState). Called by usePublishSurfaceSlice. */
  publishRender: (id: SurfaceSliceId, value: SliceValue) => void
  /** Clear a slice (ref only) + bump. Called on unmount. */
  clearSlice: (id: SurfaceSliceId) => void
  /** Bump the version (notify subscribers). Called from effects. */
  bump: () => void
}

/** Create a fresh slice store (ONE per AiPanelProvider tree). */
export function createSurfaceSliceStore(): SurfaceSliceStore {
  const slicesRef = { current: new Map<SurfaceSliceId, SliceValue>() }
  const versionRef = { current: 0 }
  const listeners = new Set<() => void>()

  const notify = () => {
    versionRef.current += 1
    for (const l of listeners) l()
  }

  return {
    getVersion: () => versionRef.current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSlice: (id) => slicesRef.current.get(id),
    publishRender: (id, value) => {
      slicesRef.current.set(id, value)
    },
    clearSlice: (id) => {
      slicesRef.current.delete(id)
      notify()
    },
    bump: notify,
  }
}

// The store is provided by AiPanelProvider through this dedicated context (a
// separate context avoids the SurfaceSliceStore <-> AiPanelContext import cycle;
// "read through the same provider" is satisfied — AiPanelProvider owns the
// instance). No provider -> null (the registrar honestly registers nothing,
// matching the bridge's provider-free posture).
export const SurfaceSliceStoreContext = createContext<SurfaceSliceStore | null>(null)

/** Read the store (null when there is no AiPanelProvider). */
export function useSurfaceSliceStore(): SurfaceSliceStore | null {
  return useContext(SurfaceSliceStoreContext)
}

const NOOP_SUBSCRIBE = () => () => { /* no store — nothing to subscribe to */ }
const NOOP_VERSION = () => 0

/**
 * Subscribe the calling component to slice changes (mirrors useRegistrationStore,
 * AiPanelContext.tsx:167-174). Unconditional useSyncExternalStore (no-op without
 * a store) so the early-return never makes the hook conditional.
 */
export function useSurfaceSlices(): { version: number; getSlice: SurfaceSliceStore['getSlice'] } {
  const store = useSurfaceSliceStore()
  const version = useSyncExternalStore(
    store ? store.subscribe : NOOP_SUBSCRIBE,
    store ? store.getVersion : NOOP_VERSION,
    store ? store.getVersion : NOOP_VERSION,
  )
  const getSlice = useCallback<SurfaceSliceStore['getSlice']>((id) => store?.getSlice(id) ?? undefined, [store])
  return useMemo(() => ({ version, getSlice }), [version, getSlice])
}

/**
 * Publish a slice (render-safe write + version bump on identity change + clear
 * on unmount). The write is a ref write (safe during render — the publisher
 * renders BEFORE the registrar, so the registrar's first render reads the
 * populated ref). The version bump (effect) notifies subscribers of a real
 * change; the clear (unmount effect) notifies removal.
 *
 * NOTE the split between the two effects: the bump effect has NO cleanup. The
 * render-phase write is the source of truth, and the bundle's identity changes
 * whenever the editor's state/actions identity changes (the pins' mocked
 * useEventEditor re-creates the actions object on every read). A clear-on-dep-
 * change cleanup would drop the slice between that cleanup and the next
 * render's write — the bump then re-renders the registrar on an EMPTY ref and
 * the required-slice check throws mid-lifecycle. Clearing belongs to unmount
 * only (separate effect, stable deps).
 *
 * @param id — the slice id (a member of the registry's `slices:` vocabulary).
 * @param value — the published bundle. `null`/`undefined` un-publishes (clears).
 */
export function usePublishSurfaceSlice(id: SurfaceSliceId, value: SliceValue | null | undefined): void {
  const store = useSurfaceSliceStore()
  const lastRef = useRef<SliceValue | null>(null)

  // Render-safe write (ref only, no setState) — the registrar (a later sibling)
  // reads this ref on its own render. Re-written on EVERY render with a
  // non-null value, so the ref always holds the latest bundle.
  if (store && value != null) {
    store.publishRender(id, value)
  }

  // Bump on identity change (or un-publish on null). No cleanup: see the note
  // above — a dep-change clear races the next render's write.
  useEffect(() => {
    if (!store) return
    if (value == null) {
      if (lastRef.current != null) {
        lastRef.current = null
        store.clearSlice(id)
      }
      return
    }
    if (lastRef.current !== value) {
      lastRef.current = value
      store.bump()
    }
  }, [store, id, value])

  // Clear on unmount ONLY (stable deps): the registrar re-renders, sees the
  // missing slice, and throws the loud error if it was required.
  useEffect(() => {
    if (!store) return
    return () => {
      store.clearSlice(id)
    }
  }, [store, id])
}

/** Read a specific published slice (null when absent / no store). */
export function usePublishedSlice<T>(id: SurfaceSliceId): T | null {
  const { getSlice } = useSurfaceSlices()
  return (getSlice(id) as T | undefined) ?? null
}
