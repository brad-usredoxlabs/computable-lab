/**
 * Hydration regressions (plan 2026-09-19_092150, root cause 1):
 * the persisted session must be readable on the FIRST render and must never be
 * written over by the pre-hydration empty state (which, under StrictMode's
 * double-invoked effects, wiped the session on every page load).
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { OpenTabsProvider, useOpenTabs } from './OpenTabsContext'

const KEY = 'cl-open-tabs'
const STORED = {
  tabs: [
    {
      tab: { id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' },
      activeRightPaneMode: 'protocol',
      breadcrumb: [],
      contentHistory: [{ id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' }],
      contentCursor: 0,
    },
  ],
  activeTabId: 'run:RUN-A',
  history: ['run:RUN-A'],
  historyCursor: 0,
}

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(OpenTabsProvider, null, children)

describe('OpenTabsProvider hydration', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.localStorage.setItem(KEY, JSON.stringify(STORED))
  })

  it('exposes the stored session on the first render', () => {
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    // First render — not after an effect.
    expect(result.current.state.tabs).toHaveLength(1)
    expect(result.current.state.activeTabId).toBe('run:RUN-A')
  })

  it('never overwrites storage with the pre-hydration empty state', () => {
    renderHook(() => useOpenTabs(), { wrapper })
    const raw = window.localStorage.getItem(KEY)
    expect(JSON.parse(raw!).tabs).toHaveLength(1)
  })

  it('keeps the stored right-pane mode', () => {
    const { result } = renderHook(() => useOpenTabs(), { wrapper })
    expect(result.current.state.tabs[0]!.activeRightPaneMode).toBe('protocol')
  })
})
