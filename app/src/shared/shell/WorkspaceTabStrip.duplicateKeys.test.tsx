/**
 * PROTO-AI-14 F3 (red-first): the localStorage load path must never hydrate
 * two entries sharing one tab.id, and WorkspaceTabStrip (key={tab.id}) must
 * render a duplicated-run persisted session with a clean console.
 *
 * loadFromStorage previously mapped persisted tabs without dedupe, so a
 * corrupted/duplicated store (or a double-apply) landed two same-id entries in
 * state.tabs and React warned "Encountered two children with the same key".
 * Fix at the LOAD entry site: dedupe on tab.id, last-wins (the reducer's
 * 'open' case already replaces a same-id tab — the loader now matches that
 * convention). Entries whose ids differ by a slot suffix (tabId.ts
 * slotSuffix() precedent) are DISTINCT tabs and are kept.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { loadFromStorage, OpenTabsProvider } from './OpenTabsContext'
import { WorkspaceTabStrip } from './WorkspaceTabStrip'

const KEY = 'cl-open-tabs'

const dupRunTab = (title: string) => ({
  id: 'run:RUN-DUP',
  kind: 'run' as const,
  runId: 'RUN-DUP',
  title,
})

const storedDup = {
  tabs: [
    { tab: dupRunTab('First copy'), activeRightPaneMode: 'protocol', breadcrumb: [] },
    { tab: dupRunTab('Second copy'), activeRightPaneMode: 'protocol', breadcrumb: [] },
  ],
  activeTabId: 'run:RUN-DUP',
  history: ['run:RUN-DUP', 'run:RUN-DUP'],
  historyCursor: 1,
}

describe('loadFromStorage duplicate-run dedupe (PROTO-AI-14 F3)', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('a persisted store with TWO identical run ids loads ONE entry per id (last-wins)', () => {
    window.localStorage.setItem(KEY, JSON.stringify(storedDup))
    const state = loadFromStorage()
    expect(state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-DUP'])
    expect(state.tabs[0]!.tab.title).toBe('Second copy')
  })

  it('slot-suffixed ids (distinct tabs of the same run) are NOT collapsed', () => {
    window.localStorage.setItem(KEY, JSON.stringify({
      tabs: [
        { tab: { ...dupRunTab('View 1'), id: 'run:RUN-DUP:aaa:111' }, activeRightPaneMode: 'protocol', breadcrumb: [] },
        { tab: { ...dupRunTab('View 2'), id: 'run:RUN-DUP:bbb:222' }, activeRightPaneMode: 'protocol', breadcrumb: [] },
      ],
      activeTabId: 'run:RUN-DUP:bbb:222',
      history: [],
      historyCursor: -1,
    }))
    const state = loadFromStorage()
    expect(state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-DUP:aaa:111', 'run:RUN-DUP:bbb:222'])
  })
})

describe('WorkspaceTabStrip renders a duplicated persisted session with unique keys', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(KEY, JSON.stringify(storedDup))
  })

  it('renders one tab element per id and the console stays free of the duplicate-key warning', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(
      <MemoryRouter>
        <OpenTabsProvider>
          <WorkspaceTabStrip />
        </OpenTabsProvider>
      </MemoryRouter>,
    )
    const tabs = screen.getAllByTestId('workspace-tab-run:RUN-DUP')
    expect(tabs).toHaveLength(1)
    const dupKeyWarnings = consoleError.mock.calls
      .flat()
      .filter((a) => typeof a === 'string' && a.includes('two children with the same key'))
    expect(dupKeyWarnings).toEqual([])
    consoleError.mockRestore()
  })
})
