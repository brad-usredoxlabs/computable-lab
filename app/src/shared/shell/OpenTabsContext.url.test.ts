/**
 * UCX-2 (RED) — URL-wins-over-storage hydration (pin (a)).
 *
 * The initial resolver must merge the URL strip OVER the storage state
 * synchronously on the first render: an explicit ?ws=/?wsa= deep link REPLACES
 * the stored session entirely (the strip is the strip — no union), and storage
 * stays untouched until the first real change. Absent/malformed params keep the
 * storage state (the default workspace) — that is what the unmodified
 * OpenTabsContext.hydration.test.ts pins.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { OpenTabsProvider, useOpenTabs } from './OpenTabsContext'

const KEY = 'cl-open-tabs'
const STORED = {
  tabs: [
    {
      tab: { id: 'run:RUN-OLD', kind: 'run', runId: 'RUN-OLD', title: 'Stale session' },
      activeRightPaneMode: 'protocol',
      breadcrumb: [],
      contentHistory: [{ id: 'run:RUN-OLD', kind: 'run', runId: 'RUN-OLD', title: 'Stale session' }],
      contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-OLD',
  history: ['run:RUN-OLD'],
  historyCursor: 0,
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(OpenTabsProvider, null, children)

function setUrl(url: string): void {
  window.history.replaceState({}, '', url)
}

beforeEach(() => {
  window.localStorage.clear()
  window.localStorage.setItem(KEY, JSON.stringify(STORED))
})

afterEach(() => {
  setUrl('/')
})

describe('OpenTabsProvider URL hydration (cl:workspace-strip-binding)', () => {
  it('the URL strip REPLACES the stored session on the first render', () => {
    setUrl('/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9')
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    // First render — not after an effect.
    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual([
      'project:STU-1',
      'record:DOC-9',
    ])
    expect(result.current.state.activeTabId).toBe('record:DOC-9')
    expect(result.current.state.tabs.some((t) => t.tab.id === 'run:RUN-OLD')).toBe(false)
  })

  it('storage is untouched until the first change', () => {
    setUrl('/record/DOC-9?ws=project:STU-1,record:DOC-9&wsa=record:DOC-9')
    renderHook(() => useOpenTabs(), { wrapper })
    const raw = window.localStorage.getItem(KEY)
    expect(JSON.parse(raw!).activeTabId).toBe('run:RUN-OLD')
  })

  it('a malformed ws keeps the storage state (the default workspace)', () => {
    setUrl('/record/DOC-9?ws=%%nonsense%%&wsa=zzz')
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-OLD'])
    expect(result.current.state.activeTabId).toBe('run:RUN-OLD')
  })

  it('no params at all → the storage state (hydration pin unchanged)', () => {
    setUrl('/record/DOC-9')
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-OLD'])
  })
})
