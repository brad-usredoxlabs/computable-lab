/**
 * HARNESS-SEQ-2 — the sequences-side agent-action executor.
 *
 * The server compiled an `agent_action` frame (Ajv-validated, resolved,
 * re-validated — see server/src/ai/compileWorkspaceAction.ts). This module
 * decides what that frame means ON the sequences page and (via the mount
 * adapter) executes it through THE SAME paths a human click uses:
 *   - sequence-tab  -> the page's setTab (human tab clicks are not
 *     draft-guarded; the agent is neither stricter nor looser);
 *   - sequence-record / resolved record ref -> the page's selectRecord, so
 *     the editor's canLeave() guard is INHERITED, never reimplemented, never
 *     bypassed — and when the guard blocked the navigation the AGENT path
 *     returns the honest line (the human path stays silent as today).
 *
 * Zero-policy-in-code law: the decision branches on TARGET KIND (the
 * contract's own discriminated union) — never on surface names, tab names,
 * or labels. The tab list it validates against is the page's declared const,
 * kept in lockstep with the surfaces registry by the compatibility test
 * (server/src/surfaces/surfacesTabsCompat.test.ts). No fetches, no model
 * calls, no policy, no writes: an unroutable frame is a NAMED diagnostic,
 * never a guess.
 *
 * exactOptionalPropertyTypes discipline: absent keys are OMITTED (never
 * `undefined`), and "nothing to say" is `undefined`, never `''`.
 */
import type { AiAgentActionEnvelope } from '../types/ai'

export interface SequencesAgentActionRecord {
  recordId: string
}

export interface SequencesAgentActionState {
  /** The page's declared tab list (compat-tested against the registry). */
  tabs: readonly string[]
  selected: string
  /** The records the page's library currently shows. */
  visible: readonly SequencesAgentActionRecord[]
}

export interface SequencesAgentActionEffects {
  setTab?: string
  selectRecordId?: string
}

export type ApplyAgentActionResult =
  | { ok: true; effects: SequencesAgentActionEffects; message?: string }
  | { ok: false; effects: SequencesAgentActionEffects; reason: string }

function trimmed(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

/**
 * The pure decision: it decides, it never navigates. Returns the effects the
 * mount adapter must run (empty on refusal) plus the explainable line.
 */
export function applyAgentAction(
  action: AiAgentActionEnvelope,
  state: SequencesAgentActionState,
): ApplyAgentActionResult {
  const target = action.target as Record<string, unknown> | undefined
  const kind = trimmed(target?.kind)

  if (kind === undefined) {
    return {
      ok: false,
      effects: {},
      reason: 'The workspace action carried no target, so nothing could be routed. Nothing was changed.',
    }
  }

  if (kind === 'sequence-tab') {
    const tab = trimmed(target?.tab)
    if (tab === undefined) {
      return { ok: false, effects: {}, reason: 'The tab action carried no tab name. Nothing was changed.' }
    }
    if (!state.tabs.includes(tab)) {
      return {
        ok: false,
        effects: {},
        reason: `This page has no "${tab}" tab (it declares ${state.tabs.join(', ')}). Nothing was changed.`,
      }
    }
    return { ok: true, effects: { setTab: tab } }
  }

  if (kind === 'sequence-record' || kind === 'record') {
    const recordId = trimmed(kind === 'sequence-record' ? target?.recordId : target?.id)
    if (recordId === undefined) {
      return { ok: false, effects: {}, reason: 'The record action carried no record id. Nothing was changed.' }
    }
    if (!state.visible.some((record) => record.recordId === recordId)) {
      return {
        ok: false,
        effects: {},
        reason: `Record "${recordId}" is not in this page's library. Nothing was changed.`,
      }
    }
    if (state.selected === recordId) {
      // Idempotent: the frame is already satisfied — no navigation to make.
      return { ok: true, effects: {}, message: 'That record is already selected.' }
    }
    return { ok: true, effects: { selectRecordId: recordId } }
  }

  return {
    ok: false,
    effects: {},
    reason: `This page cannot apply a "${kind}" action. Nothing was changed.`,
  }
}

/**
 * The mount adapter: runs the decided effects through the page's OWN
 * navigation paths and returns the diagnostic string useAiChat renders as a
 * system bubble (or `undefined` when there is nothing to say).
 *
 * `editorCanLeave` reads the SAME SequenceEditorHandle the human path reads.
 * Strictness matches the page exactly: only `=== false` means blocked (an
 * unmounted editor returning `undefined` is not a block). The guard itself is
 * NOT reimplemented here — `selectRecord` is called regardless; the read only
 * decides whether the agent path must SPEAK about the block.
 */
export interface SequencesAgentActionMount {
  tabs: readonly string[]
  records: () => readonly SequencesAgentActionRecord[]
  selected: () => string
  editorCanLeave: () => boolean | undefined
  setTab: (tab: string) => void
  selectRecord: (recordId: string) => void
}

export function createSequencesAgentActionHandler(
  mount: SequencesAgentActionMount,
): (action: AiAgentActionEnvelope) => string | undefined {
  return (action) => {
    const result = applyAgentAction(action, {
      tabs: mount.tabs,
      selected: mount.selected(),
      visible: mount.records(),
    })

    if (!result.ok) return result.reason

    if (result.effects.setTab !== undefined) {
      mount.setTab(result.effects.setTab)
      return undefined
    }

    if (result.effects.selectRecordId !== undefined) {
      const blocked = mount.editorCanLeave() === false
      // The page's own navigator — the canLeave guard is inherited.
      mount.selectRecord(result.effects.selectRecordId)
      if (blocked) {
        return 'You have an unsaved sequence draft — save or discard it in the Editor first. Nothing was changed.'
      }
      return undefined
    }

    return result.message
  }
}
