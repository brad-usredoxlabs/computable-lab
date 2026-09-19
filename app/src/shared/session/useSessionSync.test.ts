/**
 * useSessionSync — boot adopt, debounced push, focus pull (tmux-style attach).
 *
 * apiClient is stubbed: this is a unit test of the reconciliation policy, not of
 * the transport. The live cross-device behavior is covered by
 * app/e2e/session-persistence.spec.ts.
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

describe('useSessionSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    window.localStorage.clear()
    getSession.mockReset()
    putSession.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adopts the server session on boot when nothing is local (second device)', async () => {
    getSession.mockResolvedValue(serverSession([{ kind: 'run', runId: 'RUN-9', title: 'from server' }], 'run:RUN-9', '2026-09-19T00:00:00.000Z'))
    putSession.mockResolvedValue({ session: { updatedAt: '2026-09-19T00:00:01.000Z' } })

    const { result } = renderHook(
      () => {
        useSessionSync()
        return useOpenTabs()
      },
      { wrapper },
    )
    await act(async () => {
      await Promise.resolve()
    })

    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-9'])
    expect(result.current.state.activeTabId).toBe('run:RUN-9')
  })

  it('pushes a local change once, debounced', async () => {
    getSession.mockResolvedValue(serverSession([], null, '2026-09-19T00:00:00.000Z'))
    putSession.mockResolvedValue({ session: { updatedAt: '2026-09-19T00:00:02.000Z' } })

    const { result } = renderHook(
      () => {
        useSessionSync()
        return useOpenTabs()
      },
      { wrapper },
    )
    await act(async () => {
      await Promise.resolve()
    })

    act(() => {
      result.current.openTab({ id: 'run:RUN-1', kind: 'run', runId: 'RUN-1', title: 'T' })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })

    expect(putSession).toHaveBeenCalledTimes(1)
    const payload = putSession.mock.calls[0]![0] as { tabs: unknown[]; activeTabId: string | null }
    expect(payload.activeTabId).toBe('run:RUN-1')
  })

  it('does not adopt an older server session on focus', async () => {
    getSession.mockResolvedValue(serverSession([{ kind: 'run', runId: 'RUN-SERVER', title: 'srv' }], 'run:RUN-SERVER', '2026-09-19T00:00:00.000Z'))
    putSession.mockResolvedValue({ session: { updatedAt: '2026-09-19T05:00:00.000Z' } })

    const { result } = renderHook(
      () => {
        useSessionSync()
        return useOpenTabs()
      },
      { wrapper },
    )
    await act(async () => {
      await Promise.resolve()
    })
    // last push (from boot adoption) is stamped 05:00, so the 00:00 server copy
    // must NOT overwrite the local session.
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(result.current.state.tabs.map((t) => t.tab.id)).toEqual(['run:RUN-SERVER'])
  })
})
