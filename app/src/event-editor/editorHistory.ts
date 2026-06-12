/**
 * editorHistory — undo/redo for the event editor, as a reducer wrapper.
 *
 * Deck and well state are purely derived by replaying the `events` array
 * (graph/lib/eventGraph.ts), so a complete undo is just restoring a previous
 * snapshot of the mutable substate: events, labwares, placements, plateRail,
 * tipState. Snapshots are cheap — five references; the base reducer never
 * mutates in place.
 *
 * Deliberately NOT snapshotted:
 *  - `preview` — the AI ghost layer is staged, not committed. Undoing
 *    `commit_preview` restores the pre-commit committed state but does not
 *    resurrect the ghosts.
 *  - `eventGraphId` / `eventGraphSave` — undoing past a save leaves the save
 *    chip pointing at the last commit while local state diverges, the same
 *    situation as editing after a save.
 *  - `fixIt`, focus, selection — transient UI state. Focus/selection are
 *    only *clamped* after a restore so they never dangle.
 */

import type { Labware } from '../types/labware'
import type { PlateEvent } from '../types/events'
import type { EventEditorPlacement, TipState, WellSelection } from './types'
import type { PlateRailDraft } from './rail/state'

export interface UndoableSnapshot {
  events: PlateEvent[]
  labwares: Record<string, Labware>
  placements: EventEditorPlacement[]
  plateRail: Record<string, PlateRailDraft>
  tipState: TipState
}

export interface EditorHistory {
  past: Array<{ snapshot: UndoableSnapshot; coalesceKey: string | null }>
  future: UndoableSnapshot[]
}

export const EMPTY_HISTORY: EditorHistory = { past: [], future: [] }

const HISTORY_CAP = 50

/**
 * The structural slice of EventEditorState the wrapper needs. Kept structural
 * (rather than importing EventEditorState) so this module has no value-level
 * dependency back into EventEditorContext.
 */
export interface HistoryHostState extends UndoableSnapshot {
  history: EditorHistory
  focusPlacementId: string | null
  selection: WellSelection | null
  preview: {
    previewLabwares: Record<string, Labware>
    previewPlacements: EventEditorPlacement[]
  } | null
}

interface HistoryAction {
  type: string
  placementId?: string | null
}

/**
 * Mutating actions that push an undo entry. The value derives a coalesce
 * key: consecutive pushes with the same non-null key share one history entry
 * (rail notes/groups dispatch per keystroke — one undo should revert the
 * whole edit run, not one character).
 */
const UNDOABLE: Record<string, (action: HistoryAction) => string | null> = {
  append_event: () => null,
  place_new_labware: () => null,
  move_placement: () => null,
  remove_placement: () => null,
  rename_labware: () => null,
  set_tip: () => null,
  dispense_commit: () => null,
  commit_preview: () => null,
  update_plate_rail: (action) => `plate_rail:${action.placementId ?? ''}`,
}

/**
 * Actions after which history must be wiped: a different graph (or a
 * different platform, whose slot ids aren't comparable) makes old snapshots
 * unrestorable.
 */
const RESET_ACTIONS = new Set(['load_success', 'load_event_graph_success', 'set_platform'])

function takeSnapshot(state: HistoryHostState): UndoableSnapshot {
  return {
    events: state.events,
    labwares: state.labwares,
    placements: state.placements,
    plateRail: state.plateRail,
    tipState: state.tipState,
  }
}

/**
 * Restore a snapshot, clamping focus/selection that would otherwise dangle
 * (mirrors what `remove_placement` does when the focused placement goes away).
 * Preview ghosts stay valid across restores, so they count as live targets.
 */
function restoreSnapshot<S extends HistoryHostState>(state: S, snapshot: UndoableSnapshot): S {
  const livePlacements = [...snapshot.placements, ...(state.preview?.previewPlacements ?? [])]
  const focusOk =
    state.focusPlacementId !== null &&
    livePlacements.some((p) => p.placementId === state.focusPlacementId)
  const selectionOk =
    state.selection !== null &&
    (snapshot.labwares[state.selection.labwareId] !== undefined ||
      state.preview?.previewLabwares[state.selection.labwareId] !== undefined)
  return {
    ...state,
    ...snapshot,
    focusPlacementId: focusOk ? state.focusPlacementId : null,
    selection: focusOk && selectionOk ? state.selection : null,
  }
}

/**
 * Wrap the event-editor reducer with undo/redo. Intercepts `undo`/`redo`
 * actions; for everything else it runs the base reducer and maintains the
 * history field: push on undoable mutations (skipping reducer no-ops, which
 * return the same state reference), clear redo on any new mutation, reset on
 * graph/platform loads, cap depth at HISTORY_CAP.
 */
export function withEditorHistory<S extends HistoryHostState, A extends HistoryAction>(
  inner: (state: S, action: A) => S,
): (state: S, action: A) => S {
  return (state, action) => {
    if (action.type === 'undo') {
      const top = state.history.past[state.history.past.length - 1]
      if (!top) return state
      const restored = restoreSnapshot(state, top.snapshot)
      return {
        ...restored,
        history: {
          past: state.history.past.slice(0, -1),
          future: [...state.history.future, takeSnapshot(state)],
        },
      }
    }

    if (action.type === 'redo') {
      const snapshot = state.history.future[state.history.future.length - 1]
      if (!snapshot) return state
      const restored = restoreSnapshot(state, snapshot)
      return {
        ...restored,
        history: {
          past: [...state.history.past, { snapshot: takeSnapshot(state), coalesceKey: null }],
          future: state.history.future.slice(0, -1),
        },
      }
    }

    const next = inner(state, action)
    if (RESET_ACTIONS.has(action.type)) {
      return next.history.past.length === 0 && next.history.future.length === 0
        ? next
        : { ...next, history: EMPTY_HISTORY }
    }
    const keyFn = UNDOABLE[action.type]
    // next === state is the base reducer's no-op convention (rename to the
    // same name, dispense with an empty tip, commit with no preview, …).
    if (!keyFn || next === state) return next

    const key = keyFn(action)
    const top = state.history.past[state.history.past.length - 1]
    // Coalescing never reaches back across an undo (future non-empty would
    // mean the top entry predates the state the user just restored).
    const coalesce =
      key !== null && top !== undefined && top.coalesceKey === key && state.history.future.length === 0
    const past = coalesce
      ? state.history.past
      : [
          ...state.history.past.slice(-(HISTORY_CAP - 1)),
          { snapshot: takeSnapshot(state), coalesceKey: key },
        ]
    return { ...next, history: { past, future: [] } }
  }
}
