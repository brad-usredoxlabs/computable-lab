/**
 * PROTO-AI-14 F3 (red-first): the session-YAML load path must never produce
 * two tab entries sharing one value-derived id.
 *
 * Tab ids are re-derived from the tab VALUE on load (tabId.ts — the document
 * "deliberately carries no ids", sessionYaml.ts:49-51), so a document that
 * carries the same run value twice collapses to the SAME id for both entries
 * and both land in state.tabs. WorkspaceTabStrip's key={tab.id} then hits
 * React's duplicate-key warning. Fix at the LOAD entry site: dedupe on the
 * value-derived id (last-wins, mirroring the reducer's 'open' replace).
 */
import { describe, expect, it } from 'vitest'
import { sessionDocumentToState, sessionFromYaml, sessionTabsToState } from './sessionYaml'
import { stableTabId } from './tabId'

const DUP_DOC = `version: 1
activeTabId: run:RUN-DUP
tabs:
  - kind: run
    runId: RUN-DUP
    title: First copy
  - kind: run
    runId: RUN-DUP
    title: Second copy
`

describe('sessionYaml duplicate-run dedupe (PROTO-AI-14 F3)', () => {
  it('a document with TWO identical run tabs rebuilds ONE entry per id', () => {
    const state = sessionDocumentToState(sessionFromYaml(DUP_DOC), stableTabId)
    expect(state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-DUP'])
    // last-wins: the later duplicate replaces the earlier entry's content
    // (same convention as the reducer's 'open' case replacing a same-id tab).
    expect(state.tabs[0]!.tab.title).toBe('Second copy')
    expect(state.activeTabId).toBe('run:RUN-DUP')
  })

  it('a server row with two identical run tabs adopts ONE entry per id', () => {
    const adopted = sessionTabsToState(
      [
        { kind: 'run', runId: 'RUN-DUP', title: 'First copy' },
        { kind: 'run', runId: 'RUN-DUP', title: 'Second copy' },
      ],
      'run:RUN-DUP',
    )
    expect(adopted.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-DUP'])
  })

  it('distinct tabs are untouched by the dedupe', () => {
    const state = sessionDocumentToState(
      sessionFromYaml(
        'version: 1\ntabs:\n  - kind: run\n    runId: RUN-A\n    title: A\n  - kind: run\n    runId: RUN-B\n    title: B\n',
      ),
      stableTabId,
    )
    expect(state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-A', 'run:RUN-B'])
  })
})
