/**
 * collectSurfaceContext — CHATHOST-CONSOLIDATE-1 §2.5: the ONE context
 * collector. It merges published slices into the door's `base` context,
 * resolves the posted `surface` (a published slice may declare the surface it
 * implies — the deck slice implies `event-editor`), and returns the AiContext
 * the ONE registrar (SurfaceChatBridge) forwards to useSurfaceChat, plus the
 * thread endpoint/scope and the ghost handlers.
 *
 * IT CONTAINS NO HOST-NAME COMPARISON (bait #8 / V-8): the `host` id only
 * indexes the YAML entry; every decision keys off the entry's DATA fields
 * (ghost_mount) and the PUBLISHED slices, never off the host id. The posted
 * surface resolution is the single nuance: when the door's base surface is
 * the generic no-params `analysis` surface and a deck slice is published, the
 * deck slice's implied surface wins (that is how project-deck-tab's deck
 * branch keeps posting `event-editor` while the run door keeps posting
 * `run-workspace`). `analysis` is the server's declared no-params surface
 * (types/aiContext.ts:35-43), not a host id.
 */
import type { AiContext } from '../../types/aiContext'
import type { ApplianceEndpoint } from '../api/aiThreadClient'
import type {
  AcceptEventHandler,
  AiProposalDraft,
  DeckAdoptionOutcome,
  DeckPreviewLike,
} from '../hooks/useAiChat'

/** The ghost/adoption/deck-layout handler closures a deck door wires. Structurally the useAiChat option callbacks. */
export interface SurfaceContextHandlers {
  onAcceptEvent?: AcceptEventHandler
  onProposalDrafted?: (draft: AiProposalDraft) => void
  onPreviewDiscarded?: () => void
  onPreviewAccept?: (preview: DeckPreviewLike) => Promise<DeckAdoptionOutcome>
  onStagedExtras?: () => Record<string, unknown> | null
  onDeckLayout?: (deckLayout: { platformId: string; variantId: string }) => boolean | void
}

/** A host entry from the door registry (the DATA the collector reads). */
export interface DoorEntry {
  id: string
  surface: string
  required_providers: string[]
  optional_providers: string[]
  ghost_mount: boolean
}

/**
 * The `deck` slice as seen by the collector: the published state bundle a deck
 * door publishes. `contextPatch` is the precomputed deck context (the
 * buildAcceptedEventGraphProjection result + the deck fields the prompt builder
 * reads). `handlers` are the ghost/adoption/deck-layout closures the registrar
 * wires ONLY when the host's `ghost_mount` is true.
 */
export interface CollectorDeckSlice {
  /** The appliance endpoint the deck thread store keys on (declared by the slice). */
  endpoint: ApplianceEndpoint
  /** The surface the deck slice implies (posted when the base is the generic `analysis`). */
  surface: string
  /** The deck's summary (posted when the base is the generic `analysis`). */
  summary: string
  /** The deck's thread scope (the loaded eventGraphId); ABSENT when unsaved. */
  scope?: string
  /** The editor mode the deck posts (top-level AiContext field, NOT in surfaceContext — the server's systemPrompt reads it). The deck slice posts 'deck'. */
  editorMode?: string
  /**
   * The deck's working focus (the pane's SurfaceFocusHeader box). The deck door's
   * legacy focus was the deck's layout/selection (label = `Deck <eventGraphId>`,
   * detail = `platform · variant · N wells`), DISTINCT from the run door's
   * protocol-step focus — so the slice carries its OWN working focus and the
   * registrar publishes it ONLY for the deck door (the generic-base case),
   * keeping the run door's protocol-step focus.
   */
  focus?: { label: string; detail?: string }
  /** The precomputed deck context, merged into the door's base surfaceContext. */
  contextPatch: Record<string, unknown>
  /** The ghost/adoption/deck-layout handler closures. */
  handlers: SurfaceContextHandlers
}

/** The `protocol-selection` slice: the focused step (the pane's working-focus box). */
export interface CollectorProtocolSelectionSlice {
  focusedStep: { stepId: string; label: string; ordinal?: number } | null
}

/** The published slices handed to the collector (a map keyed by slice id). */
export type CollectorSlices = {
  deck?: CollectorDeckSlice
  'protocol-selection'?: CollectorProtocolSelectionSlice
}

/** The door's page-local base context + its page-local thread scope. */
export interface CollectorBase {
  context: AiContext
  /** The page-local thread scope (recordId / artifactId / studyId); absent for registry. */
  scope?: string | null
}

/** The collected result the registrar forwards to useSurfaceChat. */
export interface CollectedContext {
  /** The AiContext to forward. */
  aiContext: AiContext
  /** The appliance endpoint (the generic-chat default `browser`, or the deck slice's). */
  endpoint: ApplianceEndpoint
  /** The thread scope; ABSENT (never `undefined`) when there is no instance identity. */
  scope?: string
  /** The ghost handlers (only when the host wires the deck slice); ABSENT otherwise. */
  handlers?: SurfaceContextHandlers
  /**
   * True when the deck slice WON the posted surface (the generic no-params base
   * case — the deck door). The registrar uses this (data-driven, no host-name
   * comparison) to pick the deck slice's working focus over the run door's
   * protocol-step focus.
   */
  deckSurfaceWins?: boolean
}

/** The generic no-params AI-context surface (types/aiContext.ts:35-43) — NOT a host id. */
const NO_PARAMS_SURFACE = 'analysis'
/** The generic-chat thread endpoint (the SurfaceChatBridge default; not a new literal). */
const DEFAULT_ENDPOINT: ApplianceEndpoint = 'browser'

/**
 * The ONE collector. `host` is unused inside (the entry carries the host's DATA
 * facts); it is accepted for the signature and logging only — never compared.
 */
export function collectSurfaceContext(args: {
  host: string
  base: CollectorBase
  slices: CollectorSlices
  entry: DoorEntry
}): CollectedContext {
  const { base, slices, entry } = args
  const deck = slices.deck

  // A deck door (ghost_mount: true) with a published deck slice wires the deck:
  // the slice's endpoint/scope/handlers apply, and the slice's surface+summary
  // win ONLY when the base is the generic no-params door (project-deck-tab's
  // deck branch). A specific-surface door (run-workspace) keeps its surface.
  if (entry.ghost_mount && deck) {
    const generic = base.context.surface === NO_PARAMS_SURFACE
    const surfaceContext = { ...base.context.surfaceContext, ...deck.contextPatch }
    // The posted editor mode: the deck slice's ('deck') when the base is the
    // generic no-params door (the deck door), else the base's (the run door's
    // 'plan'). editorMode is a top-level AiContext field the server reads —
    // the retired deck bridge posted 'deck'; the run door posted its mode.
    const editorMode = generic ? deck.editorMode : base.context.editorMode
    const aiContext: AiContext = {
      surface: (generic ? deck.surface : base.context.surface) as AiContext['surface'],
      summary: generic ? deck.summary : base.context.summary,
      surfaceContext,
      ...(editorMode !== undefined ? { editorMode } : {}),
    }
    return {
      aiContext,
      endpoint: deck.endpoint,
      ...(deck.scope !== undefined ? { scope: deck.scope } : {}),
      handlers: deck.handlers,
      // Data-driven signal for the registrar's focus pick: true when the deck
      // slice won the posted surface (the deck door), so the registrar publishes
      // the deck slice's working focus instead of the run door's protocol-step
      // focus. No host-name comparison.
      deckSurfaceWins: generic,
    }
  }

  // A non-deck door (or a deck door with no slice published): the page-local
  // base context, the generic-chat endpoint, and the page-local scope.
  return {
    aiContext: base.context,
    endpoint: DEFAULT_ENDPOINT,
    ...(base.scope !== undefined && base.scope !== null ? { scope: base.scope } : {}),
  }
}

/**
 * Resolve the thread scope from the collected result, mirroring the server's
 * ONE thread-segment rule (client guard, the SurfaceChatBridge mirror). Returns
 * the scope ONLY when it is a safe thread segment (absent otherwise — the
 * server's reserved "_" scope then holds the thread). Exported so the
 * dots-only refusal stays unit-pinnable (the host-page pins assert on it).
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

/** The focus detail a focused step produces (the run door's working-focus box). */
export function focusedStepDetail(
  step: { stepId: string; label: string; ordinal?: number } | null,
): string | undefined {
  if (!step) return undefined
  return `Step ${step.ordinal ?? '?'}: ${step.label}`
}
