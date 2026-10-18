/**
 * UCX-2 (OQ3) — skipBootPull: an explicit ?ws= deep link outranks the
 * server-session BOOT adopt. NEW file (the spec forbids editing the existing
 * useSessionSync.test.ts). ATTACH-on-focus adopt is unchanged.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { OpenTabsProvider, useOpenTabs } from '../shell/OpenTabsContext'

const getSession = vi.fn()
const putSession = vi.fn()

vi.mock('../api/client', () => ({
  apiClient: {
    getSession: (...args: unknown[]) => getSession(...args),
    putSession: (...args: unknown[]) => putSession(...args),
  },
}))

const { useSessionSync } = await import('./useSessionSync')

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(OpenTabsProvider, null, children)

const serverSession = (tabs: unknown[], activeTabId: string | null, updatedAt: string) => ({
  session: { version: 1 as const, userId: 'default', tabs, activeTabId, updatedAt },
})

describe('useSessionSync skipBootPull (UCX-2)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    getSession.mockReset()
    putSession.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('skipBootPull suppresses the boot GET so the local (URL-hydrated) strip survives', async () => {
    getSession.mockResolvedValue(serverSession([{ kind: 'run', runId: 'RUN-SERVER', title: 'srv' }], 'run:RUN-SERVER', '2026-10-18T00:00:00.000Z'))
    putSession.mockResolvedValue({ session: { updatedAt: '2026-10-18T00:00:01.000Z' } })
    window.localStorage.setItem('cl-open-tabs', JSON.stringify({
      tabs: [{ tab: { id: 'record:DOC-9', kind: 'record-edit', recordId: 'DOC-9', title: 'Deep link' }, activeRightPaneMode: 'ai' }],
      activeTabId: 'record:DOC-9',
    }))

    const { result } = renderHook(
      () => {
        useSessionSync({ skipBootPull: true })
        return useOpenTabs()
      },
      { wrapper },
    )
    await act(async () => {
      await Promise.resolve()
    })

    expect(getSession).not.toHaveBeenCalled()
    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['record:DOC-9'])
    expect(result.current.state.activeTabId).toBe('record:DOC-9')
  })

  it('ATTACH-on-focus still pulls when skipBootPull is set (focus-ATTACH unchanged)', async () => {
    getSession.mockResolvedValue(serverSession([{ kind: 'run', runId: 'RUN-SERVER', title: 'srv' }], 'run:RUN-SERVER', '2026-10-18T09:00:00.000Z'))
    putSession.mockResolvedValue({ session: { updatedAt: '2026-10-18T00:00:01.000Z' } })
    window.localStorage.setItem('cl-open-tabs:lastPushedAt', '2026-10-18T01:00:00.000Z')
    window.localStorage.setItem('cl-open-tabs', JSON.stringify({
      tabs: [{ tab: { id: 'record:DOC-9', kind: 'record-edit', recordId: 'DOC-9', title: 'Deep link' }, activeRightPaneMode: 'ai' }],
      activeTabId: 'record:DOC-9',
    }))

    const { result } = renderHook(
      () => {
        useSessionSync({ skipBootPull: true })
        return useOpenTabs()
      },
      { wrapper },
    )
    await act(async () => {
      await Promise.resolve()
    })
    expect(getSession).not.toHaveBeenCalled()

    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(getSession).toHaveBeenCalledTimes(1)
    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-SERVER'])
  })
})
