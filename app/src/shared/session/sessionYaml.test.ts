import { describe, expect, it } from 'vitest'
import { sessionDocumentToState, sessionFromYaml, sessionToYaml, sessionTabsToState } from './sessionYaml'
import { stableTabId } from './tabId'
import type { OpenTabsState } from '../shell/OpenTabsContext'

const state: OpenTabsState = {
  tabs: [
    {
      tab: { id: 'project:STU-1', kind: 'project', studyId: 'STU-1', title: 'DHVC' },
      activeRightPaneMode: 'ai',
      breadcrumb: [],
      contentHistory: [],
      contentCursor: 0,
    },
    {
      tab: { id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'Titration' },
      activeRightPaneMode: 'protocol',
      breadcrumb: [],
      contentHistory: [],
      contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-1',
  history: ['run:RUN-1'],
  historyCursor: 0,
}

describe('session document', () => {
  it('round-trips the session through YAML (ids are re-derived, not stored)', () => {
    const yaml = sessionToYaml(state)
    expect(yaml).not.toContain('project:STU-1') // no slot ids in the document
    const doc = sessionFromYaml(yaml)
    const back = sessionDocumentToState(doc, stableTabId)
    expect(back.tabs.map((t) => t.tab.id)).toEqual(['project:STU-1', 'run:RUN-1'])
    expect(back.tabs[1]!.activeRightPaneMode).toBe('protocol')
    expect(back.activeTabId).toBe('run:RUN-1')
  })

  it('rejects a document that is not version 1', () => {
    expect(() => sessionFromYaml('version: 2\ntabs: []')).toThrow(/version/)
  })

  it('rejects a tab without a kind', () => {
    expect(() => sessionFromYaml('version: 1\ntabs:\n  - runId: RUN-1')).toThrow(/kind/)
  })

  it('falls back to the last tab when activeTabId is unknown', () => {
    const doc = sessionFromYaml(
      'version: 1\nactiveTabId: run:NOPE\ntabs:\n  - kind: run\n    runId: RUN-1\n    title: T',
    )
    expect(sessionDocumentToState(doc, stableTabId).activeTabId).toBe('run:RUN-1')
  })

  it('defaults a rebuilt tab right-pane mode from its kind', () => {
    const doc = sessionFromYaml('version: 1\ntabs:\n  - kind: run\n    runId: RUN-1\n    title: T')
    expect(sessionDocumentToState(doc, stableTabId).tabs[0]!.activeRightPaneMode).toBe('protocol')
  })

  it('adopts a server row (tab objects, no document wrapper)', () => {
    const adopted = sessionTabsToState([{ kind: 'run', runId: 'RUN-9', title: 'From server' }], 'run:RUN-9')
    expect(adopted.tabs).toHaveLength(1)
    expect(adopted.activeTabId).toBe('run:RUN-9')
  })
})
