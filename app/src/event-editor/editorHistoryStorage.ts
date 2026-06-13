/**
 * editorHistoryStorage — persist the editor's undo/redo stack so it survives a
 * page reload.
 *
 * The undo history is otherwise in-memory React state, wiped on every graph
 * load (see editorHistory.ts RESET_ACTIONS) and gone on reload. Because a
 * complete undo entry is a snapshot of the mutable substate (events, labwares,
 * placements, plateRail, tipState), we can serialize the whole stack to
 * localStorage keyed by the graph's identity and rehydrate it on load.
 *
 * Staleness guard: we store a cheap fingerprint of the live snapshot at persist
 * time. On rehydrate the caller compares it to the just-loaded committed
 * snapshot; a mismatch (graph changed in another session/device) drops the
 * stale stack rather than restoring an inconsistent one. localStorage is
 * per-browser, which is the right scope for "I reloaded the same tab".
 */

import type { EditorHistory, UndoableSnapshot } from './editorHistory'

const STORAGE_VERSION = 1
const KEY_PREFIX = 'cl:editor-history:'

interface PersistedHistory {
  v: number
  history: EditorHistory
  /** Fingerprint of the live snapshot when this was written. */
  headSig: string
}

function storageKey(graphKey: string): string {
  return `${KEY_PREFIX}${graphKey}`
}

/**
 * Cheap, stable fingerprint of a snapshot — enough to detect that the loaded
 * graph diverged from what the persisted stack was built against. Avoids
 * stringifying the whole snapshot on every comparison.
 */
export function snapshotFingerprint(snapshot: UndoableSnapshot): string {
  const lastEvent = snapshot.events[snapshot.events.length - 1]
  return [
    snapshot.events.length,
    lastEvent?.eventId ?? '',
    snapshot.placements.length,
    Object.keys(snapshot.labwares).sort().join(','),
  ].join('|')
}

/** Persist the history stack for a graph. No-op (swallowed) if storage fails. */
export function persistEditorHistory(
  graphKey: string,
  history: EditorHistory,
  live: UndoableSnapshot,
): void {
  try {
    const blob: PersistedHistory = { v: STORAGE_VERSION, history, headSig: snapshotFingerprint(live) }
    window.localStorage.setItem(storageKey(graphKey), JSON.stringify(blob))
  } catch {
    // Unavailable / quota exceeded — undo simply won't survive reload. Don't crash.
  }
}

/** Load a persisted history stack, or null if absent/invalid/wrong version. */
export function loadEditorHistory(graphKey: string): { history: EditorHistory; headSig: string } | null {
  try {
    const raw = window.localStorage.getItem(storageKey(graphKey))
    if (!raw) return null
    const blob = JSON.parse(raw) as PersistedHistory
    if (blob.v !== STORAGE_VERSION || !blob.history || typeof blob.headSig !== 'string') return null
    if (!Array.isArray(blob.history.past) || !Array.isArray(blob.history.future)) return null
    return { history: blob.history, headSig: blob.headSig }
  } catch {
    return null
  }
}

export function clearEditorHistory(graphKey: string): void {
  try {
    window.localStorage.removeItem(storageKey(graphKey))
  } catch {
    // ignore
  }
}
