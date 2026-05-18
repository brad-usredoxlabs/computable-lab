import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import { apiClient } from '../shared/api/client'
import type { PlatformManifest } from '../types/platformRegistry'
import { defaultVariantForPlatform, getPlatformManifest } from '../shared/lib/platformRegistry'
import type { Labware } from '../types/labware'
import type {
  EventEditorPlacement,
  LabwareOrientation,
  PlacementLocation,
  TipState,
  WellSelection,
} from './types'
import type { WellId } from '../types/plate'
import type { PlateEvent } from '../types/events'
import { generateEventId } from '../types/events'

export type LoadState = 'idle' | 'loading' | 'ready' | 'error'

/**
 * A staged proposal from the AI dock, layered on top of committed state. The
 * deck and well grids render preview placements with a ghost treatment and
 * preview events as well-level overlays until the user clicks Accept (which
 * commits the preview) or Discard (which clears it).
 *
 * `previewLabwares` carries Labware definitions for previewPlacements that
 * aren't yet in `labwares` — committed labwares stay in the main map.
 */
export interface EventEditorPreview {
  previewLabwares: Record<string, Labware>
  previewPlacements: EventEditorPlacement[]
  previewEvents: PlateEvent[]
  /**
   * The user prompt that produced this preview. Travels with the preview so
   * downstream consumers (Fix-it seed, audit log) don't need to reach back
   * into the dock's chat history.
   */
  sourcePrompt?: string
  /**
   * Labware additions the precompile validated away as unplaceable (skipped
   * during preview construction). Kept here so Fix-it has the same hints
   * the dock shows under the chat bubble.
   */
  sourceSkips?: string[]
}

/**
 * Frozen snapshot of "the moment the user reported a problem" — captured
 * once when the Fix-it panel opens so the diagnosis conversation has a
 * stable referent even as the underlying state continues to change.
 *
 * Includes the failing prompt, what the precompile produced, and the deck
 * context the user was looking at.
 */
export interface FixItSeed {
  prompt: string
  draft: {
    events: PlateEvent[]
    placements: EventEditorPlacement[]
    labwares: Record<string, Labware>
    /** Labware-additions the precompile validated away as unplaceable. */
    skips: string[]
  }
  deckContext: {
    platformId: string
    platformLabel: string | null
    variantId: string
    variantTitle: string | null
    /** Committed placements at the moment of capture (not the ghosts). */
    committedPlacements: Array<{
      slotId: string | null
      lawn: { xMm: number; yMm: number } | null
      labwareName: string
      labwareType: string
    }>
  }
  /**
   * Stable id so server-side caching / logging can correlate every chat
   * turn for a given fix-it session.
   */
  fixItSessionId: string
}

export interface FixItChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** Hidden reasoning content from the model, streamed separately from content. */
  reasoning?: string
}

/**
 * Workflow stage for the Fix-it panel. Drives which pane is visible:
 *   chatting   — diagnosis chat with the AI
 *   spec-ready — spec + fixture YAML have been synthesized; user editing
 *   applying   — coder agent is running (Phase 2 wiring)
 *   done       — apply succeeded; show commit hash + touched files
 *   failed     — apply failed; show error and let user retry
 */
export type FixItStage = 'chatting' | 'spec-ready' | 'applying' | 'done' | 'failed'

export interface FixItSpec {
  specId: string
  specYaml: string
  fixtureYaml: string
  fixturePath: string
}

export interface FixItCriticSummary {
  verdict: 'pass' | 'block' | 'revision'
  message: string
  criteriaMet: string[]
  criteriaFailed: string[]
  revisionFeedback?: string
  /** True when the senior coder (architect endpoint) was the one that ran. */
  seniorRetryRan: boolean
}

export interface FixItApplyResult {
  status: 'applied' | 'blocked' | 'failed' | 'skipped' | 'stale' | 'needs-human' | 'needs-revision'
  message: string
  touchedFiles: string[]
  job?: {
    id: string
    worktreePath?: string
    artifactRoot: string
  }
  commit?: string
  critic?: FixItCriticSummary
}

/**
 * One entry in the per-session fix history. Pushed each time apply
 * completes (regardless of success/failure) so the user can see the chain
 * of attempts.
 */
export interface FixItHistoryEntry {
  specId: string
  title: string
  status: FixItApplyResult['status']
  commit?: string
  criticVerdict?: FixItCriticSummary['verdict']
  ts: string
}

export type FixItApplyStage =
  | 'writing_fixture'
  | 'writing_spec'
  | 'coder_running'
  | 'critic_running'
  | 'senior_retry'

export interface FixItApplyProgressEntry {
  source: 'server' | 'coder' | 'critic'
  phase: string
  message: string
  details?: Record<string, unknown>
  ts: string
}

export interface FixItState {
  isOpen: boolean
  seed: FixItSeed | null
  chat: FixItChatMessage[]
  streaming: boolean
  stage: FixItStage
  /** Server error message when synthesis/apply fails. */
  error: string | null
  /** Spec + fixture YAML once synthesized. User may edit before applying. */
  spec: FixItSpec | null
  /** Coarse pipeline stage while stage === 'applying'. */
  applyStage: FixItApplyStage | null
  /** Fine-grained apply progress streamed from the server/coder/critic. */
  applyProgress: FixItApplyProgressEntry[]
  /** Raw reasoning text accumulated during the apply phase. */
  applyReasoning: string
  /** Coder agent result once apply completes. */
  applyResult: FixItApplyResult | null
  /** Audit trail of every apply attempt during this session. */
  fixHistory: FixItHistoryEntry[]
  /**
   * When set, the dock will replay this prompt through its draft pipeline
   * (deterministic-only mode) on the next render and clear it. Used by the
   * Fix-it panel's "Retry prompt" button to hand the original failing
   * prompt back to the dock without coupling the two components directly.
   */
  pendingRetryPrompt: string | null
}

export type FixItSessionSnapshot = Pick<
  FixItState,
  | 'seed'
  | 'chat'
  | 'stage'
  | 'error'
  | 'spec'
  | 'applyStage'
  | 'applyProgress'
  | 'applyReasoning'
  | 'applyResult'
  | 'fixHistory'
  | 'pendingRetryPrompt'
>

export interface EventEditorState {
  loadState: LoadState
  loadError: string | null
  platforms: PlatformManifest[]
  platformId: string
  variantId: string
  vocabPackId: string
  toolTypeId: string | null
  assistPipetteId: string | null
  runId: string | null
  labwares: Record<string, Labware>
  placements: EventEditorPlacement[]
  focusPlacementId: string | null
  selection: WellSelection | null
  events: PlateEvent[]
  tipState: TipState
  preview: EventEditorPreview | null
  fixIt: FixItState
}

type Action =
  | { type: 'load_start' }
  | { type: 'load_error'; error: string }
  | { type: 'load_success'; platforms: PlatformManifest[]; initialPlatformId?: string }
  | { type: 'set_platform'; platformId: string }
  | { type: 'set_variant'; variantId: string }
  | { type: 'set_vocab'; vocabPackId: string }
  | { type: 'set_tool'; toolTypeId: string | null; assistPipetteId: string | null }
  | { type: 'set_run'; runId: string | null }
  | {
      type: 'place_new_labware'
      labware: Labware
      location: PlacementLocation
      orientation: LabwareOrientation
    }
  | {
      type: 'move_placement'
      placementId: string
      location: PlacementLocation
      orientation: LabwareOrientation
      // If location is a slot, displace any existing occupant to the lawn.
      displaceTo?: { xMm: number; yMm: number }
    }
  | { type: 'remove_placement'; placementId: string }
  | { type: 'set_focus'; placementId: string | null }
  | { type: 'set_selection'; selection: WellSelection | null }
  | { type: 'append_event'; event: PlateEvent }
  | { type: 'set_tip'; tipState: TipState }
  | { type: 'dispense_commit'; destLabwareId: string; destWells: WellId[] }
  | { type: 'set_preview'; preview: EventEditorPreview }
  | { type: 'clear_preview' }
  | { type: 'commit_preview' }
  | { type: 'open_fixit'; seed: FixItSeed }
  | { type: 'open_fixit_without_seed' }
  | { type: 'close_fixit' }
  | { type: 'append_fixit_chat'; message: FixItChatMessage }
  | { type: 'update_last_fixit_assistant'; content: string; reasoning?: string }
  | { type: 'append_last_fixit_reasoning'; delta: string }
  | { type: 'set_fixit_streaming'; streaming: boolean }
  | { type: 'set_fixit_spec'; spec: FixItSpec }
  | { type: 'edit_fixit_spec'; specYaml: string; fixtureYaml: string }
  | { type: 'clear_fixit_spec' }
  | { type: 'continue_fixit_feedback' }
  | { type: 'restore_fixit_session'; snapshot: FixItSessionSnapshot }
  | { type: 'set_fixit_stage'; stage: FixItStage; error?: string | null }
  | { type: 'set_fixit_apply_result'; result: FixItApplyResult }
  | { type: 'set_fixit_apply_stage'; applyStage: FixItApplyStage | null }
  | { type: 'append_fixit_apply_progress'; entry: Omit<FixItApplyProgressEntry, 'ts'> }
  | { type: 'append_fixit_apply_reasoning'; delta: string }
  | { type: 'append_fixit_apply_reasoning'; delta: string }
  | { type: 'request_retry_prompt'; prompt: string }
  | { type: 'consume_retry_prompt' }

const DEFAULT_PLATFORM_ID = 'opentrons_flex'

const initialState: EventEditorState = {
  loadState: 'idle',
  loadError: null,
  platforms: [],
  platformId: DEFAULT_PLATFORM_ID,
  variantId: '',
  vocabPackId: 'liquid-handling/v1',
  toolTypeId: null,
  assistPipetteId: null,
  runId: null,
  labwares: {},
  placements: [],
  focusPlacementId: null,
  selection: null,
  events: [],
  tipState: { kind: 'empty' },
  preview: null,
  fixIt: {
    isOpen: false,
    seed: null,
    chat: [],
    streaming: false,
    stage: 'chatting',
    error: null,
    spec: null,
    applyStage: null,
    applyProgress: [],
    applyReasoning: '',
    applyResult: null,
    fixHistory: [],
    pendingRetryPrompt: null,
  },
}

function pickDefaultsForPlatform(
  platforms: PlatformManifest[],
  platformId: string,
): { variantId: string; vocabPackId: string; toolTypeId: string | null } {
  const manifest = getPlatformManifest(platforms, platformId)
  const variantId = defaultVariantForPlatform(platforms, platformId)
  const vocabPackId = manifest?.allowedVocabIds[0] ?? 'liquid-handling/v1'
  const toolTypeId = manifest?.toolTypeIds[0] ?? null
  return { variantId, vocabPackId, toolTypeId }
}

let placementIdCounter = 0
function nextPlacementId(): string {
  placementIdCounter += 1
  return `pl-${Date.now().toString(36)}-${placementIdCounter.toString(36)}`
}

/**
 * Pull the `title:` field out of a YAML spec without instantiating a full
 * YAML parser inside the reducer. Good enough for synthesized specs which
 * always emit `title:` on its own line; returns null otherwise.
 */
function extractYamlTitle(yamlText: string): string | null {
  const match = yamlText.match(/^title:\s*(.+?)\s*$/m)
  if (!match) return null
  const raw = match[1]!
  return raw.replace(/^['"]|['"]$/g, '')
}

function isSameFixItThread(current: FixItSeed | null, next: FixItSeed): boolean {
  if (!current) return false
  if (current.fixItSessionId === next.fixItSessionId) return true
  return current.prompt.trim() === next.prompt.trim()
    && current.deckContext.platformId === next.deckContext.platformId
    && current.deckContext.variantId === next.deckContext.variantId
}

const FIXIT_APPLY_CONTEXT_PREFIX = 'Apply attempt context:'

function appendApplyContextMessage(
  chat: FixItChatMessage[],
  result: FixItApplyResult | null,
): FixItChatMessage[] {
  if (!result) return chat
  const last = chat[chat.length - 1]
  if (last?.role === 'assistant' && last.content.startsWith(FIXIT_APPLY_CONTEXT_PREFIX)) {
    return chat
  }
  const critic = result.critic
  const lines = [
    FIXIT_APPLY_CONTEXT_PREFIX,
    `Status: ${result.status}`,
    result.commit ? `Commit: ${result.commit}` : null,
    result.message ? `Message: ${result.message}` : null,
    critic ? `Critic verdict: ${critic.verdict}` : null,
    critic?.criteriaFailed.length
      ? `Failed criteria: ${critic.criteriaFailed.join(' | ')}`
      : null,
    result.touchedFiles.length
      ? `Touched files: ${result.touchedFiles.join(', ')}`
      : null,
  ].filter((line): line is string => Boolean(line))
  return [...chat, { role: 'assistant', content: lines.join('\n') }]
}

function findPlacementAtSlot(
  placements: EventEditorPlacement[],
  slotId: string,
): EventEditorPlacement | null {
  return placements.find((p) => p.location.kind === 'slot' && p.location.slotId === slotId) ?? null
}

function reducer(state: EventEditorState, action: Action): EventEditorState {
  switch (action.type) {
    case 'load_start':
      return { ...state, loadState: 'loading', loadError: null }
    case 'load_error':
      return { ...state, loadState: 'error', loadError: action.error }
    case 'load_success': {
      const platforms = action.platforms
      const fallbackPlatformId =
        platforms.find((p) => p.id === DEFAULT_PLATFORM_ID)?.id ?? platforms[0]?.id ?? DEFAULT_PLATFORM_ID
      const platformId = action.initialPlatformId ?? fallbackPlatformId
      const defaults = pickDefaultsForPlatform(platforms, platformId)
      return {
        ...state,
        loadState: 'ready',
        loadError: null,
        platforms,
        platformId,
        variantId: defaults.variantId,
        vocabPackId: defaults.vocabPackId,
        toolTypeId: defaults.toolTypeId,
        assistPipetteId: null,
      }
    }
    case 'set_platform': {
      if (action.platformId === state.platformId) return state
      const defaults = pickDefaultsForPlatform(state.platforms, action.platformId)
      // Switching platforms wipes placements — slot IDs aren't comparable across decks.
      return {
        ...state,
        platformId: action.platformId,
        variantId: defaults.variantId,
        vocabPackId: defaults.vocabPackId,
        toolTypeId: defaults.toolTypeId,
        assistPipetteId: null,
        labwares: {},
        placements: [],
        focusPlacementId: null,
        selection: null,
        events: [],
        tipState: { kind: 'empty' },
        preview: null,
        fixIt: {
          isOpen: false,
          seed: null,
          chat: [],
          streaming: false,
          stage: 'chatting',
          error: null,
          spec: null,
          applyStage: null,
          applyProgress: [],
          applyReasoning: '',
          applyResult: null,
          fixHistory: [],
          pendingRetryPrompt: null,
        },
      }
    }
    case 'set_variant':
      // Variant change keeps labwares but drops slot placements that no longer exist.
      // We don't know the new variant's slots here, so the DeckStage will reconcile —
      // for now, keep placements; orphaned ones simply won't render.
      return { ...state, variantId: action.variantId }
    case 'set_vocab':
      return { ...state, vocabPackId: action.vocabPackId }
    case 'set_tool':
      return {
        ...state,
        toolTypeId: action.toolTypeId,
        assistPipetteId: action.assistPipetteId,
      }
    case 'set_run':
      return { ...state, runId: action.runId }
    case 'place_new_labware': {
      const placement: EventEditorPlacement = {
        placementId: nextPlacementId(),
        labwareId: action.labware.labwareId,
        location: action.location,
        orientation: action.orientation,
      }
      // If dropping onto an occupied slot, displace the existing occupant to the lawn.
      let placements = state.placements
      if (action.location.kind === 'slot') {
        const existing = findPlacementAtSlot(placements, action.location.slotId)
        if (existing) {
          placements = placements.map((p) =>
            p.placementId === existing.placementId
              ? { ...p, location: { kind: 'lawn', xMm: 20, yMm: 20 } }
              : p,
          )
        }
      }
      return {
        ...state,
        labwares: { ...state.labwares, [action.labware.labwareId]: action.labware },
        placements: [...placements, placement],
      }
    }
    case 'move_placement': {
      const moving = state.placements.find((p) => p.placementId === action.placementId)
      if (!moving) return state
      let placements = state.placements

      if (action.location.kind === 'slot') {
        const occupant = findPlacementAtSlot(placements, action.location.slotId)
        if (occupant && occupant.placementId !== action.placementId) {
          // Swap: occupant goes to displaceTo (lawn) or to moving's previous slot if it was a slot.
          const occupantNextLocation: PlacementLocation =
            moving.location.kind === 'slot'
              ? { kind: 'slot', slotId: moving.location.slotId }
              : action.displaceTo
                ? { kind: 'lawn', xMm: action.displaceTo.xMm, yMm: action.displaceTo.yMm }
                : { kind: 'lawn', xMm: 20, yMm: 20 }
          placements = placements.map((p) =>
            p.placementId === occupant.placementId
              ? { ...p, location: occupantNextLocation }
              : p,
          )
        }
      }
      placements = placements.map((p) =>
        p.placementId === action.placementId
          ? { ...p, location: action.location, orientation: action.orientation }
          : p,
      )
      return { ...state, placements }
    }
    case 'remove_placement': {
      const target = state.placements.find((p) => p.placementId === action.placementId)
      if (!target) return state
      const placements = state.placements.filter((p) => p.placementId !== action.placementId)
      const stillReferenced = placements.some((p) => p.labwareId === target.labwareId)
      const labwares = { ...state.labwares }
      if (!stillReferenced) delete labwares[target.labwareId]
      const focusPlacementId = state.focusPlacementId === action.placementId ? null : state.focusPlacementId
      return { ...state, placements, labwares, focusPlacementId }
    }
    case 'set_focus': {
      // Drop selection when focus changes — selection is labware-scoped and a
      // different focus means a different (or no) labware.
      const focusedPlacement = action.placementId
        ? state.placements.find((p) => p.placementId === action.placementId)
        : null
      const focusedLabwareId = focusedPlacement?.labwareId ?? null
      const keepSelection =
        state.selection !== null &&
        focusedLabwareId !== null &&
        state.selection.labwareId === focusedLabwareId
      return {
        ...state,
        focusPlacementId: action.placementId,
        selection: keepSelection ? state.selection : null,
      }
    }
    case 'set_selection':
      return { ...state, selection: action.selection }
    case 'append_event':
      return { ...state, events: [...state.events, action.event] }
    case 'set_tip':
      return { ...state, tipState: action.tipState }
    case 'dispense_commit': {
      const tip = state.tipState
      if (tip.kind !== 'loaded') return state
      const transferEvent: PlateEvent = {
        eventId: generateEventId(),
        event_type: 'transfer',
        details: {
          source_labwareId: tip.sourceLabwareId,
          source_wells: tip.sourceWells,
          dest_labwareId: action.destLabwareId,
          dest_wells: action.destWells,
          volume: { value: tip.volume_uL, unit: 'uL' },
        },
      }
      return {
        ...state,
        events: [...state.events, transferEvent],
        tipState: { kind: 'empty' },
      }
    }
    case 'set_preview': {
      // Replace any existing preview — a fresh draft supersedes the old one.
      // If the user was drilled into a labware that belonged to the *previous*
      // preview, drop the focus so the stale ghost doesn't render orphaned.
      const droppedFocus =
        state.preview != null
        && state.focusPlacementId != null
        && state.preview.previewPlacements.some((p) => p.placementId === state.focusPlacementId)
          && !action.preview.previewPlacements.some((p) => p.placementId === state.focusPlacementId)
      return {
        ...state,
        preview: action.preview,
        ...(droppedFocus ? { focusPlacementId: null, selection: null } : {}),
      }
    }
    case 'clear_preview': {
      // If the user was drilled into a ghost labware, leave focus mode —
      // otherwise LabwareFocus would render an empty pane.
      const focusedOnPreview =
        state.focusPlacementId != null
        && state.preview != null
        && state.preview.previewPlacements.some((p) => p.placementId === state.focusPlacementId)
      return {
        ...state,
        preview: null,
        ...(focusedOnPreview ? { focusPlacementId: null, selection: null } : {}),
      }
    }
    case 'commit_preview': {
      const preview = state.preview
      if (!preview) return state
      // After commit, preview placements live in state.placements under the
      // same placementIds, so focus stays valid without further fixup.
      return {
        ...state,
        labwares: { ...state.labwares, ...preview.previewLabwares },
        placements: [...state.placements, ...preview.previewPlacements],
        events: [...state.events, ...preview.previewEvents],
        preview: null,
      }
    }
    case 'open_fixit': {
      // Reopening the exact same seed should restore the panel. Reopening a
      // retry of the same prompt/platform should keep the repair conversation
      // but refresh the seed so new pass outputs are available to the AI.
      const sameSeed = isSameFixItThread(state.fixIt.seed, action.seed)
      const reopenedRetryAfterDone =
        sameSeed
        && state.fixIt.seed?.fixItSessionId !== action.seed.fixItSessionId
        && state.fixIt.stage === 'done'
      return {
        ...state,
        fixIt: {
          isOpen: true,
          seed: action.seed,
          chat: sameSeed
            ? reopenedRetryAfterDone
              ? appendApplyContextMessage(state.fixIt.chat, state.fixIt.applyResult)
              : state.fixIt.chat
            : [],
          streaming: false,
          stage: sameSeed && !reopenedRetryAfterDone ? state.fixIt.stage : 'chatting',
          error: sameSeed ? state.fixIt.error : null,
          spec: sameSeed ? state.fixIt.spec : null,
          applyStage: sameSeed ? state.fixIt.applyStage : null,
          applyProgress: sameSeed ? state.fixIt.applyProgress : [],
          applyReasoning: sameSeed ? state.fixIt.applyReasoning : '',
          applyResult: sameSeed ? state.fixIt.applyResult : null,
          fixHistory: sameSeed ? state.fixIt.fixHistory : [],
          pendingRetryPrompt: sameSeed ? state.fixIt.pendingRetryPrompt : null,
        },
      }
    }
    case 'open_fixit_without_seed':
      // Reopening the panel without a fresh seed — used by the floating
      // launcher button after a page refresh so the user can view running
      // jobs and restore a session from a job card.
      return {
        ...state,
        fixIt: { ...state.fixIt, isOpen: true },
      }
    case 'close_fixit':
      // Keep seed + chat + spec around so reopening the same session
      // restores it; a new seed will clear them via `open_fixit` above.
      return {
        ...state,
        fixIt: { ...state.fixIt, isOpen: false, streaming: false },
      }
    case 'append_fixit_chat':
      return {
        ...state,
        fixIt: { ...state.fixIt, chat: [...state.fixIt.chat, action.message] },
      }
    case 'update_last_fixit_assistant': {
      const chat = state.fixIt.chat
      const last = chat[chat.length - 1]
      if (!last || last.role !== 'assistant') return state
      const next = chat.slice(0, -1).concat({
        role: 'assistant',
        content: action.content,
        reasoning: action.reasoning !== undefined ? action.reasoning : last.reasoning,
      })
      return { ...state, fixIt: { ...state.fixIt, chat: next } }
    }
    case 'append_last_fixit_reasoning': {
      const chat = state.fixIt.chat
      const last = chat[chat.length - 1]
      if (!last || last.role !== 'assistant') return state
      const currentReasoning = last.reasoning ?? ''
      const next = chat.slice(0, -1).concat({
        ...last,
        reasoning: currentReasoning + action.delta,
      })
      return { ...state, fixIt: { ...state.fixIt, chat: next } }
    }
    case 'set_fixit_streaming':
      return { ...state, fixIt: { ...state.fixIt, streaming: action.streaming } }
    case 'set_fixit_spec':
      return {
        ...state,
        fixIt: { ...state.fixIt, spec: action.spec, stage: 'spec-ready', error: null },
      }
    case 'edit_fixit_spec': {
      if (!state.fixIt.spec) return state
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          spec: {
            ...state.fixIt.spec,
            specYaml: action.specYaml,
            fixtureYaml: action.fixtureYaml,
          },
        },
      }
    }
    case 'clear_fixit_spec':
      return {
        ...state,
        fixIt: { ...state.fixIt, spec: null, stage: 'chatting', error: null, applyResult: null },
      }
    case 'continue_fixit_feedback':
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          chat: appendApplyContextMessage(state.fixIt.chat, state.fixIt.applyResult),
          stage: 'chatting',
          error: null,
          streaming: false,
        },
      }
    case 'restore_fixit_session':
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          ...action.snapshot,
          isOpen: true,
          streaming: false,
        },
      }
    case 'set_fixit_stage':
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          stage: action.stage,
          error: action.error !== undefined ? action.error : state.fixIt.error,
          ...(action.stage === 'applying' ? { applyProgress: [], applyReasoning: '' } : {}),
        },
      }
    case 'set_fixit_apply_result': {
      const specId = state.fixIt.spec?.specId ?? '(no-spec)'
      const title = extractYamlTitle(state.fixIt.spec?.specYaml ?? '') ?? specId
      const historyEntry: FixItHistoryEntry = {
        specId,
        title,
        status: action.result.status,
        ts: new Date().toISOString(),
        ...(action.result.commit ? { commit: action.result.commit } : {}),
        ...(action.result.critic?.verdict
          ? { criticVerdict: action.result.critic.verdict }
          : {}),
      }
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          applyResult: action.result,
          stage: action.result.status === 'applied' ? 'done' : 'failed',
          applyStage: null,
          fixHistory: [...state.fixIt.fixHistory, historyEntry],
        },
      }
    }
    case 'set_fixit_apply_stage':
      return { ...state, fixIt: { ...state.fixIt, applyStage: action.applyStage } }
    case 'append_fixit_apply_progress':
      return {
        ...state,
        fixIt: {
          ...state.fixIt,
          applyProgress: [
            ...state.fixIt.applyProgress.slice(-39),
            { ...action.entry, ts: new Date().toISOString() },
          ],
        },
      }
    case 'append_fixit_apply_reasoning':
      return { ...state, fixIt: { ...state.fixIt, applyReasoning: state.fixIt.applyReasoning + action.delta } }
    case 'request_retry_prompt':
      return { ...state, fixIt: { ...state.fixIt, pendingRetryPrompt: action.prompt } }
    case 'consume_retry_prompt':
      return { ...state, fixIt: { ...state.fixIt, pendingRetryPrompt: null } }
    default:
      return state
  }
}

export interface EventEditorActions {
  setPlatform: (platformId: string) => void
  setVariant: (variantId: string) => void
  setVocab: (vocabPackId: string) => void
  setTool: (selection: { toolTypeId: string | null; assistPipetteId?: string | null }) => void
  placeNewLabware: (
    labware: Labware,
    location: PlacementLocation,
    orientation: LabwareOrientation,
  ) => void
  movePlacement: (
    placementId: string,
    location: PlacementLocation,
    orientation: LabwareOrientation,
  ) => void
  removePlacement: (placementId: string) => void
  setFocus: (placementId: string | null) => void
  setSelection: (selection: WellSelection | null) => void
  clearSelection: () => void
  applyAddMaterial: (input: {
    labwareId: string
    wells: WellId[]
    materialRef: string
    volume_uL: number
    /**
     * Cell-count payload (cells/well). Set when the picked material has
     * a `cells` composition role; rides alongside `volume_uL` so the
     * event graph captures both the liquid and the cell-level metric
     * for replay (`AddMaterialDetails.count` in `types/events.ts`).
     */
    count?: number
  }) => void
  applyAspirate: (input: {
    labwareId: string
    wells: WellId[]
    volume_uL: number
    sourceLabel: string
  }) => void
  applyDispense: (input: {
    destLabwareId: string
    destWells: WellId[]
  }) => void
  clearTip: () => void
  appendEvent: (event: PlateEvent) => void
  setPreview: (preview: EventEditorPreview) => void
  clearPreview: () => void
  commitPreview: () => void
  openFixIt: (seed: FixItSeed) => void
  openFixItWithoutSeed: () => void
  closeFixIt: () => void
  appendFixItChat: (message: FixItChatMessage) => void
  updateLastFixItAssistant: (content: string, reasoning?: string) => void
  appendLastFixItReasoning: (delta: string) => void
  setFixItStreaming: (streaming: boolean) => void
  setFixItSpec: (spec: FixItSpec) => void
  editFixItSpec: (specYaml: string, fixtureYaml: string) => void
  clearFixItSpec: () => void
  continueFixItFeedback: () => void
  restoreFixItSession: (snapshot: FixItSessionSnapshot) => void
  setFixItStage: (stage: FixItStage, error?: string | null) => void
  setFixItApplyResult: (result: FixItApplyResult) => void
  setFixItApplyStage: (applyStage: FixItApplyStage | null) => void
  appendFixItApplyProgress: (entry: Omit<FixItApplyProgressEntry, 'ts'>) => void
  appendFixItApplyReasoning: (delta: string) => void
  requestRetryPrompt: (prompt: string) => void
  consumeRetryPrompt: () => void
}

interface ContextValue {
  state: EventEditorState
  actions: EventEditorActions
}

const EventEditorContext = createContext<ContextValue | null>(null)

interface ProviderProps {
  runId?: string
  children: ReactNode
}

export function EventEditorProvider({ runId, children }: ProviderProps) {
  const [state, dispatch] = useReducer(reducer, initialState)

  useEffect(() => {
    let cancelled = false
    dispatch({ type: 'load_start' })
    apiClient
      .getPlatforms()
      .then((platforms) => {
        if (cancelled) return
        dispatch({ type: 'load_success', platforms })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = error instanceof Error ? error.message : String(error)
        dispatch({ type: 'load_error', error: message })
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    dispatch({ type: 'set_run', runId: runId ?? null })
  }, [runId])

  const actions = useMemo<EventEditorActions>(
    () => ({
      setPlatform: (platformId) => dispatch({ type: 'set_platform', platformId }),
      setVariant: (variantId) => dispatch({ type: 'set_variant', variantId }),
      setVocab: (vocabPackId) => dispatch({ type: 'set_vocab', vocabPackId }),
      setTool: ({ toolTypeId, assistPipetteId }) =>
        dispatch({
          type: 'set_tool',
          toolTypeId,
          assistPipetteId: assistPipetteId ?? null,
        }),
      placeNewLabware: (labware, location, orientation) =>
        dispatch({ type: 'place_new_labware', labware, location, orientation }),
      movePlacement: (placementId, location, orientation) =>
        dispatch({ type: 'move_placement', placementId, location, orientation }),
      removePlacement: (placementId) => dispatch({ type: 'remove_placement', placementId }),
      setFocus: (placementId) => dispatch({ type: 'set_focus', placementId }),
      setSelection: (selection) => dispatch({ type: 'set_selection', selection }),
      clearSelection: () => dispatch({ type: 'set_selection', selection: null }),
      appendEvent: (event) => dispatch({ type: 'append_event', event }),
      applyAddMaterial: ({ labwareId, wells, materialRef, volume_uL, count }) => {
        dispatch({
          type: 'append_event',
          event: {
            eventId: generateEventId(),
            event_type: 'add_material',
            details: {
              labwareId,
              wells,
              material_ref: materialRef,
              volume: { value: volume_uL, unit: 'uL' },
              ...(typeof count === 'number' && Number.isFinite(count) ? { count } : {}),
            },
          },
        })
      },
      applyAspirate: ({ labwareId, wells, volume_uL, sourceLabel }) => {
        dispatch({
          type: 'set_tip',
          tipState: {
            kind: 'loaded',
            sourceLabwareId: labwareId,
            sourceWells: wells,
            volume_uL,
            sourceLabel,
          },
        })
      },
      applyDispense: ({ destLabwareId, destWells }) =>
        dispatch({ type: 'dispense_commit', destLabwareId, destWells }),
      clearTip: () => dispatch({ type: 'set_tip', tipState: { kind: 'empty' } }),
      setPreview: (preview) => dispatch({ type: 'set_preview', preview }),
      clearPreview: () => dispatch({ type: 'clear_preview' }),
      commitPreview: () => dispatch({ type: 'commit_preview' }),
      openFixIt: (seed) => dispatch({ type: 'open_fixit', seed }),
      openFixItWithoutSeed: () => dispatch({ type: 'open_fixit_without_seed' }),
      closeFixIt: () => dispatch({ type: 'close_fixit' }),
      appendFixItChat: (message) => dispatch({ type: 'append_fixit_chat', message }),
      updateLastFixItAssistant: (content, reasoning) =>
        dispatch({ type: 'update_last_fixit_assistant', content, ...(reasoning !== undefined ? { reasoning } : {}) }),
      appendLastFixItReasoning: (delta) =>
        dispatch({ type: 'append_last_fixit_reasoning', delta }),
      setFixItStreaming: (streaming) => dispatch({ type: 'set_fixit_streaming', streaming }),
      setFixItSpec: (spec) => dispatch({ type: 'set_fixit_spec', spec }),
      editFixItSpec: (specYaml, fixtureYaml) =>
        dispatch({ type: 'edit_fixit_spec', specYaml, fixtureYaml }),
      clearFixItSpec: () => dispatch({ type: 'clear_fixit_spec' }),
      continueFixItFeedback: () => dispatch({ type: 'continue_fixit_feedback' }),
      restoreFixItSession: (snapshot) => dispatch({ type: 'restore_fixit_session', snapshot }),
      setFixItStage: (stage, error) => dispatch({ type: 'set_fixit_stage', stage, ...(error !== undefined ? { error } : {}) }),
      setFixItApplyResult: (result) => dispatch({ type: 'set_fixit_apply_result', result }),
      setFixItApplyStage: (applyStage) => dispatch({ type: 'set_fixit_apply_stage', applyStage }),
      appendFixItApplyProgress: (entry) => dispatch({ type: 'append_fixit_apply_progress', entry }),
      appendFixItApplyReasoning: (delta) => dispatch({ type: 'append_fixit_apply_reasoning', delta }),
      requestRetryPrompt: (prompt) => dispatch({ type: 'request_retry_prompt', prompt }),
      consumeRetryPrompt: () => dispatch({ type: 'consume_retry_prompt' }),
    }),
    [],
  )

  const value = useMemo<ContextValue>(() => ({ state, actions }), [state, actions])

  return <EventEditorContext.Provider value={value}>{children}</EventEditorContext.Provider>
}

export function useEventEditor(): ContextValue {
  const ctx = useContext(EventEditorContext)
  if (!ctx) {
    throw new Error('useEventEditor must be used inside <EventEditorProvider>')
  }
  return ctx
}
