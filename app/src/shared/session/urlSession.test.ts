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
import { tabPath } from '../shell/WorkspaceTabStrip'
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

  // FIX1 (advc defect 4): `execution` is UNDECODABLE on purpose. Its stable id
  // (executionTabId = `execution:<eventGraphId>`, types.ts:158) carries NO
  // runId, and WorkspaceTabStrip.tabPath maps execution → `/runs/${tab.runId}`.
  // A decoded tab with runId:'' therefore navigates to `/runs/` — the RUNS
  // COLLECTION route (App.tsx:152), not the run workspace (/runs/:runId,
  // App.tsx:202). Nothing in the URL can re-derive runId (no server call in
  // scope, no second id convention), so the kind is dropped rather than
  // restored as a mis-navigating tab.
  it('execution ids return null: a decoded tab must never carry runId:"" (defect 4)', () => {
    expect(tabFromStableId('execution:EVG-1')).toBeNull()
    const decoded = decodeWorkspaceParams('ws=execution:EVG-1&wsa=execution:EVG-1')
    expect(decoded.state).toBeNull()
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
  })

  it('an execution entry is dropped per-entry; valid siblings survive', () => {
    const decoded = decodeWorkspaceParams('ws=registry,execution:EVG-1&wsa=registry')
    expect(decoded.state!.tabs.map((t) => t.tab.id)).toEqual(['registry'])
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
  })

  it('encodeWorkspaceParams never encodes an execution tab (unencodable kind)', () => {
    const state = stateOf(
      [
        entry({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'Run' }),
        entry({ id: 'execution:EVG-1', kind: 'execution', eventGraphId: 'EVG-1', runId: 'RUN-1', title: 'Execute' }),
      ],
      'execution:EVG-1',
    )
    const params = new URLSearchParams(encodeWorkspaceParams(state))
    expect(params.get(WS_PARAM)).toBe('run:RUN-1')
    // wsa names only an encodable tab: an execution-active strip writes no wsa
    // (decode then activates the first surviving tab).
    expect(params.get(WSA_PARAM)).toBeNull()
  })

  it('no decoded tab can ever produce the bare /runs/ path (navigation safety)', () => {
    const decoded = decodeWorkspaceParams(
      'ws=run:RUN-1,deck:EVG-2,execution:EVG-1,registry&wsa=run:RUN-1',
    )
    expect(decoded.state).not.toBeNull()
    const paths = decoded.state!.tabs.map((t) => tabPath(t.tab))
    expect(paths).not.toContain('/runs/')
    expect(paths).not.toContain('')
    expect(decoded.diagnostic?.code).toBe('MALFORMED_WS_PARAM')
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

  it('an execution-only strip encodes to NO params (unencodable kind, never an empty ws)', () => {
    const state = stateOf(
      [entry({ id: 'execution:EVG-1', kind: 'execution', eventGraphId: 'EVG-1', runId: 'RUN-1', title: 'Execute' })],
      'execution:EVG-1',
    )
    expect(encodeWorkspaceParams(state)).toBe('')
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
  // Fields the STABLE ID does not carry (tabId.ts): the decoded tab re-derives
  // them minimally and the host page's mount re-registration enriches them —
  // exactly how a localStorage reload works today. The gate pins what the id
  // DOES carry: kind, base id, and the id-encoded payload fields.
  // FIX1 (advc defect 4): `execution` is NO LONGER masked here. Its runId is
  // not carried by the stable id and cannot be re-derived, so the kind is
  // dropped from the decodable set entirely (see the navigation-safety pins
  // below) — masking it in LOSSY_FIELDS hid a mis-navigating decoded tab.
  const LOSSY_FIELDS: Record<string, string[]> = {
    run: ['eventGraphId'],
    deck: ['runId'],
    'lab-entity': ['schemaId', 'entityType'],
    'record-edit': ['recordKind'],
  }
  it('decode(encode(state)) ≈ state for every kind incl. slot-suffixed ids', () => {
    const state = stateOf(TABS_BY_KIND.map((t) => entry(t)), 'registry')
    const decoded = decodeWorkspaceParams(encodeWorkspaceParams(state))
    expect(decoded.diagnostic).toBeUndefined()
    expect(decoded.state).not.toBeNull()
    const round = decoded.state!

    // FIX1 (advc defect 4): execution is unencodable, so it drops out of the
    // strip; every OTHER kind survives in order.
    const wantTabs = state.tabs.filter((t) => t.tab.kind !== 'execution')
    expect(round.tabs.length).toBe(wantTabs.length)
    for (let i = 0; i < wantTabs.length; i++) {
      const want = wantTabs[i]!
      const got = round.tabs[i]!
      // Slot-suffix kinds (project-details/splash) encode to the bare kind and
      // re-derive on a FRESH slotted id. FIX1 (advc defect 2): the colon
      // separator is asserted — the RED pin's original force. tabId.ts's slot
      // format is `kind:<slot>`, so a decoded id that loses the `kind:`
      // separator IS the drift this gate exists to catch.
      if (want.tab.kind === 'project-details' || want.tab.kind === 'splash') {
        expect(got.tab.id.startsWith(`${want.tab.kind}:`), `kind ${want.tab.kind}`).toBe(true)
        // Exact rebuilt shape: kind + ':' + slotSuffix() (tabId.ts:24-26 —
        // Date.now base36 ':' random base36). Drift in either source fails here.
        // The final segment is `*` because Math.random().toString(36) can
        // terminate early (e.g. 0.5 → 'i'); the CONTRACT pinned is the two
        // separators, not the random segment's length.
        expect(
          got.tab.id,
          `kind ${want.tab.kind} rebuilt id shape`,
        ).toMatch(new RegExp(`^${want.tab.kind}:[0-9a-z]+:[0-9a-z]*$`))
      } else {
        expect(got.tab.id, `kind ${want.tab.kind}`).toBe(want.tab.id)
      }
      expect(got.tab.kind).toBe(want.tab.kind)
      // Every id-carried payload field survives the round trip.
      const lossy = LOSSY_FIELDS[want.tab.kind] ?? []
      const { id: _id, kind: _kind, title: _title, ...wantFields } = want.tab as WorkspaceTab & Record<string, unknown>
      const { id: _gid, kind: _gkind, title: _gtitle, ...gotFields } = got.tab as WorkspaceTab & Record<string, unknown>
      for (const field of lossy) {
        delete (wantFields as Record<string, unknown>)[field]
        delete (gotFields as Record<string, unknown>)[field]
      }
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
    expect(decoded.state!.tabs[1]!.tab.id.startsWith('splash:'), 'slot id keeps the kind: separator').toBe(true)
    // Exact rebuilt shape (defect 2): splash + ':' + slotSuffix() (tabId.ts:24-26).
    expect(decoded.state!.tabs[1]!.tab.id).toMatch(/^splash:[0-9a-z]+:[0-9a-z]*$/)
  })
})
