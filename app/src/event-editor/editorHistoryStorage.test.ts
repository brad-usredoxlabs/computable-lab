import { afterEach, describe, expect, it } from 'vitest'
import {
  persistEditorHistory,
  loadEditorHistory,
  clearEditorHistory,
  snapshotFingerprint,
} from './editorHistoryStorage'
import type { EditorHistory, UndoableSnapshot } from './editorHistory'
import type { PlateEvent } from '../types/events'

function event(id: string): PlateEvent {
  return { eventId: id, event_type: 'mix', details: {} } as PlateEvent
}

function snapshot(events: PlateEvent[]): UndoableSnapshot {
  return { events, labwares: {}, placements: [], plateRail: {}, tipState: { kind: 'empty' } }
}

function history(events: PlateEvent[]): EditorHistory {
  return { past: [{ snapshot: snapshot(events), coalesceKey: null }], future: [] }
}

afterEach(() => {
  clearEditorHistory('G1')
})

describe('editorHistoryStorage', () => {
  it('round-trips the history stack and head fingerprint', () => {
    const live = snapshot([event('e1'), event('e2')])
    persistEditorHistory('G1', history([event('e1')]), live)

    const loaded = loadEditorHistory('G1')
    expect(loaded).not.toBeNull()
    expect(loaded!.history.past).toHaveLength(1)
    expect(loaded!.headSig).toBe(snapshotFingerprint(live))
  })

  it('fingerprint matches an equivalent snapshot and differs when events change', () => {
    const a = snapshot([event('e1'), event('e2')])
    const same = snapshot([event('e1'), event('e2')])
    const diverged = snapshot([event('e1')]) // one fewer event
    expect(snapshotFingerprint(a)).toBe(snapshotFingerprint(same))
    expect(snapshotFingerprint(a)).not.toBe(snapshotFingerprint(diverged))
  })

  it('returns null for an absent key and after clear', () => {
    expect(loadEditorHistory('missing')).toBeNull()
    persistEditorHistory('G1', history([event('e1')]), snapshot([event('e1')]))
    expect(loadEditorHistory('G1')).not.toBeNull()
    clearEditorHistory('G1')
    expect(loadEditorHistory('G1')).toBeNull()
  })

  it('ignores a wrong-version / malformed blob', () => {
    window.localStorage.setItem('cl:editor-history:G1', JSON.stringify({ v: 999, history: {} }))
    expect(loadEditorHistory('G1')).toBeNull()
  })
})
