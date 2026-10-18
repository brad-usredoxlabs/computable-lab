/**
 * UCX-2 (RED) — urlSession codec pins.
 *
 * The `ws`/`wsa` scheme (cl:workspace-strip-binding): `ws` is the comma-
 * separated strip of STABLE tab ids (slot suffix stripped), `wsa` the active
 * tab's stable id. Round-trip decode(encode(state)) ≈ state is the drift gate
 * against tabId.ts / types.ts changes — it must cover EVERY WorkspaceTab kind,
 * slot-suffixed ids, and exactOptionalPropertyTypes-shaped tabs (optional keys
 * ABSENT, never `undefined`).
 */
import { describe, expect, it } from 'vitest'
import type { WorkspaceTab } from '../../event-editor/workspace/types'
import type { OpenTabState, OpenTabsState } from '../shell/OpenTabsContext'
import {
  WS_PARAM,
  WSA_PARAM,
  decodeWorkspaceParams,
  encodeWorkspaceParams,
  tabFromStableId,
} from './urlSession'

function entry(tab: WorkspaceTab, activeRightPaneMode: 'ai' | 'protocol' = 'ai'): OpenTabState {
  return {
    tab,
    activeRightPaneMode,
    breadcrumb: [],
    contentHistory: [tab],
    contentCursor: 0,
  }
}

function stateOf(tabs: OpenTabState[], activeTabId: string | null): OpenTabsState {
  return { tabs, activeTabId, history: activeTabId ? [activeTabId] : [], historyCursor: activeTabId ? 0 : -1 }
}

/** Every kind in the WorkspaceTab union (types.ts), exactOptionalPropertyTypes
 *  shaped: optional keys are OMITTED, never `undefined`. */
const TABS_BY_KIND: WorkspaceTab[] = [
  { id: 'project:STU-1', kind: 'project', studyId: 'STU-1', title: 'DHVC' },
  { id: 'project-details:mslot:abc123', kind: 'project-details', title: 'Project' },
  { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'First Titration' },
  { id: 'run:RUN-2', kind: 'run', runId: 'RUN-2', eventGraphId: 'EVG-9', title: 'Run with deck' },
  { id: 'execution:EVG-1', kind: 'execution', eventGraphId: 'EVG-1', runId: 'RUN-1', title: 'Execute' },
  { id: 'deck:EVG-2', kind: 'deck', eventGraphId: 'EVG-2', title: 'Deck' },
  { id: 'deck:EVG-3', kind: 'deck', eventGraphId: 'EVG-3', runId: 'RUN-1', title: 'Deck+run' },
  { id: 'claim:CLM-1', kind: 'claim', claimId: 'CLM-1', title: 'Cytation 5 quantifies dsDNA' },
  { id: 'lab:EQ-1', kind: 'lab-entity', schemaId: 'equipment', recordId: 'EQ-1', entityType: 'equipment', title: 'Cytation 5' },
  { id: 'record:DOC-1', kind: 'record-edit', recordId: 'DOC-1', title: 'SOP' },
  { id: 'record:DOC-2', kind: 'record-edit', recordId: 'DOC-2', recordKind: 'document', title: 'Doc with kind' },
  { id: 'create:study', kind: 'record-create', nodeType: 'study', title: 'New study' },
  { id: 'create:experiment:STU-1', kind: 'record-create', nodeType: 'experiment', studyId: 'STU-1', title: 'New experiment' },
  { id: 'create:run:EXP-1', kind: 'record-create', nodeType: 'run', experimentId: 'EXP-1', title: 'New run' },
  { id: 'collection:projects', kind: 'collection', collection: 'projects', title: 'Projects' },
  { id: 'registry', kind: 'registry', title: 'Registry' },
  { id: 'pdf:ART-1', kind: 'pdf', artifactId: 'ART-1', title: 'Vendor PDF' },
  { id: 'document:ART-2', kind: 'document', artifactId: 'ART-2', title: 'Derived doc' },
  { id: 'protocol-review:VPDF-1', kind: 'protocol-review', recordId: 'VPDF-1', title: 'Vendor review' },
  { id: 'splash:mslot:def456', kind: 'splash', title: 'New Tab' },
]

describe('tabFromStableId (mirror of stableTabId)', () => {
  it('decodes every kind the id policy encodes', () => {
    const cases: Array<[string, string, Record<string, unknown>]> = [
      ['project:STU-1', 'project', { studyId: 'STU-1' }],
      ['run:RUN-1', 'run', { runId: 'RUN-1' }],
      ['execution:EVG-1', 'execution', { eventGraphId: 'EVG-1' }],
      ['deck:EVG-2', 'deck', { eventGraphId: 'EVG-2' }],
      ['claim:CLM-1', 'claim', { claimId: 'CLM-1' }],
      ['lab:EQ-1', 'lab-entity', { recordId: 'EQ-1' }],
      ['record:DOC-1', 'record-edit', { recordId: 'DOC-1' }],
      ['create:study', 'record-create', { nodeType: 'study' }],
      ['create:experiment:STU-1', 'record-create', { nodeType: 'experiment', studyId: 'STU-1' }],
      ['create:run:EXP-1', 'record-create', { nodeType: 'run', experimentId: 'EXP-1' }],
      ['collection:projects', 'collection', { collection: 'projects' }],
      ['registry', 'registry', {}],
      ['pdf:ART-1', 'pdf', { artifactId: 'ART-1' }],
      ['document:ART-2', 'document', { artifactId: 'ART-2' }],
      ['protocol-review:VPDF-1', 'protocol-review', { recordId: 'VPDF-1' }],
    ]
    for (const [id, kind, fields] of cases) {
      const tab = tabFromStableId(id)
      expect(tab, id).not.toBeNull()
      expect(tab!.kind, id).toBe(kind)
      for (const [field, value] of Object.entries(fields)) {
        expect((tab as unknown as Record<string, unknown>)[field], `${id}.${field}`).toBe(value)
      }
    }
  })

  it('slot-suffixed ids (project-details/splash) decode to their kind', () => {
    expect(tabFromStableId('project-details:mslot:abc123')?.kind).toBe('project-details')
    expect(tabFromStableId('splash:mslot:def456')?.kind).toBe('splash')
  })

  it('unknown ids return null (never throw)', () => {
    expect(tabFromStableId('notakind!')).toBeNull()
    expect(tabFromStableId('')).toBeNull()
    expect(tabFromStableId('collection:notacollection')).toBeNull()
    expect(tabFromStableId('create:alien')).toBeNull()
  })
})

describe('encodeWorkspaceParams', () => {
  it('encodes the strip in order with the active id', () => {
    const state = stateOf(
      [entry(TABS_BY_KIND[0]!), entry(TABS_BY_KIND[9]!)],
      'record:DOC-1',
    )
    const search = encodeWorkspaceParams(state)
    const params = new URLSearchParams(search)
    expect(params.get(WS_PARAM)).toBe('project:STU-1,record:DOC-1')
    expect(params.get(WSA_PARAM)).toBe('record:DOC-1')
  })

  it('strips slot suffixes to the BASE id (tabId.ts slot-suffix kinds)', () => {
    const details = { id: 'project-details:mslot:abc123', kind: 'project-details' as const, title: 'Project' }
    const splash = { id: 'splash:mslot:def456', kind: 'splash' as const, title: 'New Tab' }
    const run = { ...TABS_BY_KIND[2]!, id: 'run:RUN-1:slot7:xyz' }
    const search = encodeWorkspaceParams(stateOf([entry(run), entry(details), entry(splash)], 'run:RUN-1:slot7:xyz'))
    const params = new URLSearchParams(search)
    expect(params.get(WS_PARAM)).toBe('run:RUN-1,project-details,splash')
    expect(params.get(WSA_PARAM)).toBe('run:RUN-1')
  })

  it('no tabs ⇒ no params at all (never an empty ws)', () => {
    expect(encodeWorkspaceParams(stateOf([], null))).toBe('')
  })
})

describe('decodeWorkspaceParams', () => {
  it('decodes a valid ws/wsa pair into a full OpenTabsState', () => {
    const decoded = decodeWorkspaceParams('ws=project:STU-1,record:DOC-1&wsa=record:DOC-1')
    expect(decoded.diagnostic).toBeUndefined()
    expect(decoded.state).not.toBeNull()
    const state = decoded.state!
    expect(state.tabs.map((t) => t.tab.id)).toEqual(['project:STU-1', 'record:DOC-1'])
    expect(state.activeTabId).toBe('record:DOC-1')
    expect(state.history).toEqual(['record:DOC-1'])
    expect(state.historyCursor).toBe(0)
    for (const t of state.tabs) {
      expect(t.contentHistory).toEqual([t.tab])
      expect(t.contentCursor).toBe(0)
      expect(t.breadcrumb).toEqual([])
      expect(t.activeRightPaneMode).toBeDefined()
    }
  })

  it('wsa missing from the strip → first surviving tab becomes active + diagnostic', () => {
    const decoded = decodeWorkspaceParams('ws=project:STU-1,record:DOC-1&wsa=zzz')
    expect(decoded.state).not.toBeNull()
    expect(decoded.state!.activeTabId).toBe('project:STU-1')
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
  })

  it('per-entry keep-valid/drop-bad: a bad entry never swallows valid ones', () => {
    const decoded = decodeWorkspaceParams('ws=registry,notakind!&wsa=registry')
    expect(decoded.state).not.toBeNull()
    expect(decoded.state!.tabs.map((t) => t.tab.id)).toEqual(['registry'])
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
  })

  it('zero decodable entries → state null + diagnostic (never a crash)', () => {
    const decoded = decodeWorkspaceParams('ws=%%nonsense%%&wsa=zzz')
    expect(decoded.state).toBeNull()
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
    expect(typeof decoded.diagnostic?.message).toBe('string')
  })

  it('absent params → state null, no diagnostic (storage/default workspace wins)', () => {
    const decoded = decodeWorkspaceParams('')
    expect(decoded.state).toBeNull()
    expect(decoded.diagnostic).toBeUndefined()
  })
})

describe('round-trip mirror-drift gate (every WorkspaceTab kind)', () => {
  it('decode(encode(state)) ≈ state for every kind incl. slot-suffixed ids', () => {
    const state = stateOf(TABS_BY_KIND.map((t) => entry(t)), 'registry')
    const decoded = decodeWorkspaceParams(encodeWorkspaceParams(state))
    expect(decoded.diagnostic).toBeUndefined()
    expect(decoded.state).not.toBeNull()
    const round = decoded.state!

    expect(round.tabs.length).toBe(state.tabs.length)
    for (let i = 0; i < state.tabs.length; i++) {
      const want = state.tabs[i]!
      const got = round.tabs[i]!
      // Slot-suffix kinds (project-details/splash) re-derive a fresh slot id;
      // every other kind must round-trip to the EXACT base id.
      if (want.tab.kind === 'project-details' || want.tab.kind === 'splash') {
        expect(got.tab.id.startsWith(`${want.tab.kind}:`), `kind ${want.tab.kind}`).toBe(true)
      } else {
        expect(got.tab.id, `kind ${want.tab.kind}`).toBe(want.tab.id)
      }
      expect(got.tab.kind).toBe(want.tab.kind)
      // Every non-optional payload field survives the round trip.
      const { id: _id, kind: _kind, title: _title, ...wantFields } = want.tab as WorkspaceTab & Record<string, unknown>
      const { id: _gid, kind: _gkind, title: _gtitle, ...gotFields } = got.tab as WorkspaceTab & Record<string, unknown>
      expect(gotFields, `kind ${want.tab.kind} fields`).toEqual(wantFields)
      expect(typeof got.tab.title).toBe('string')
      expect(got.contentHistory).toEqual([got.tab])
      expect(got.contentCursor).toBe(0)
      expect(got.breadcrumb).toEqual([])
    }
    expect(round.activeTabId).toBe('registry')
  })

  it('slot-suffixed tab ids encode to the base id and re-derive on decode', () => {
    const suffixed = stateOf(
      [
        entry({ id: 'project-details:slot1:aaa', kind: 'project-details', title: 'Project' }),
        entry({ id: 'splash:slot2:bbb', kind: 'splash', title: 'New Tab' }),
      ],
      'splash:slot2:bbb',
    )
    const decoded = decodeWorkspaceParams(encodeWorkspaceParams(suffixed))
    expect(decoded.state!.tabs.map((t) => t.tab.kind)).toEqual(['project-details', 'splash'])
    expect(decoded.state!.activeTabId).toBe(decoded.state!.tabs[1]!.tab.id)
    expect(decoded.state!.tabs[1]!.tab.id.startsWith('splash:')).toBe(true)
  })
})
