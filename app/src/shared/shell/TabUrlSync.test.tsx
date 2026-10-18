/**
 * UCX-2 (RED) — TabUrlSync router-side sync pins (b), (c) + loop/inert guards.
 *
 * Harness: OpenTabsProvider > MemoryRouter > <TabUrlSync/> + a probe that
 * exposes the tab context and the current location.search. useNavigate is
 * wrapped (vi.hoisted spy) so every navigation this component issues is
 * recorded — the replace-only rule (push would double-book the strip's own
 * Back/Forward) is asserted on the recorded calls.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { OpenTabsProvider, useOpenTabs, type OpenTabsContextValue } from './OpenTabsContext'
import { TabUrlSync } from './TabUrlSync'

const spy = vi.hoisted(() => ({ calls: [] as unknown[][] }))

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...real,
    useNavigate: () => {
      const inner = real.useNavigate()
      return (...args: unknown[]) => {
        spy.calls.push(args)
        return (inner as (...a: unknown[]) => unknown)(...args)
      }
    },
  }
})

const KEY = 'cl-open-tabs'
const STORED = {
  tabs: [
    {
      tab: { id: 'record:DOC-9', kind: 'record-edit', recordId: 'DOC-9', title: 'SOP' },
      activeRightPaneMode: 'ai',
      breadcrumb: [],
      contentHistory: [{ id: 'record:DOC-9', kind: 'record-edit', recordId: 'DOC-9', title: 'SOP' }],
      contentCursor: 0,
    },
  ],
  activeTabId: 'record:DOC-9',
  history: ['record:DOC-9'],
  historyCursor: 0,
}

let ctx: OpenTabsContextValue | null = null
let lastSearch = ''

function Probe(): null {
  ctx = useOpenTabs()
  const location = useLocation()
  lastSearch = location.search
  const navigate = useNavigate()
  return (
    <button
      data-testid="external-navigate"
      onClick={() => navigate('/record/DOC-9?ws=registry&wsa=registry', { replace: true })}
    >
      external
    </button>
  )
}

function mountSync(initialEntry: string) {
  spy.calls.length = 0
  ctx = null
  lastSearch = ''
  return render(
    <OpenTabsProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <TabUrlSync />
        <Probe />
      </MemoryRouter>
    </OpenTabsProvider>,
  )
}

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
  window.localStorage.setItem(KEY, JSON.stringify(STORED))
})

function searchParams(): URLSearchParams {
  return new URLSearchParams(lastSearch)
}

describe('TabUrlSync state → URL (replace-only)', () => {
  it('openTab writes the strip into the current search with replace:true', async () => {
    mountSync('/record/DOC-9')
    act(() => {
      ctx!.openTab({ id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' })
    })
    await waitFor(() => expect(searchParams().get('ws')).toBe('record:DOC-9,run:RUN-A'))
    expect(searchParams().get('wsa')).toBe('run:RUN-A')
    expect(spy.calls.length).toBeGreaterThan(0)
    for (const call of spy.calls) {
      const opts = call[1] as { replace?: boolean } | undefined
      expect(opts?.replace, `navigate(${JSON.stringify(call[0])}) must REPLACE, never push`).toBe(true)
    }
  })

  it('closeTab removes the id from ws', async () => {
    mountSync('/record/DOC-9')
    act(() => {
      ctx!.openTab({ id: 'run:RUN-A', kind: 'run', runId: 'RUN-A', title: 'Run A' })
    })
    await waitFor(() => expect(searchParams().get('ws')).toBe('record:DOC-9,run:RUN-A'))
    act(() => {
      ctx!.closeTab('run:RUN-A')
    })
    await waitFor(() => expect(searchParams().get('ws')).toBe('record:DOC-9'))
    expect(searchParams().get('wsa')).toBe('record:DOC-9')
  })

  it('no-op guard: a state change that does not change the strip writes nothing', async () => {
    mountSync('/record/DOC-9?ws=record:DOC-9&wsa=record:DOC-9')
    await waitFor(() => expect(lastSearch).toBe('?ws=record:DOC-9&wsa=record:DOC-9'))
    const before = spy.calls.length
    act(() => {
      ctx!.renameTab('record:DOC-9', 'SOP renamed')
    })
    expect(spy.calls.length).toBe(before)
  })

  it('INERT on a pathname no tab owns (/literature): zero navigations, zero params', () => {
    mountSync('/literature')
    expect(spy.calls.length).toBe(0)
    expect(lastSearch).toBe('')
  })
})

describe('TabUrlSync URL → state (external change)', () => {
  it('a pasted/external valid ws replaceStates the decoded strip', async () => {
    mountSync('/record/DOC-9')
    fireEvent.click(screen.getByTestId('external-navigate'))
    await waitFor(() => expect(ctx!.state.tabs.map((t) => t.tab.id)).toEqual(['registry']))
    expect(ctx!.state.activeTabId).toBe('registry')
  })

  it('malformed ws degrades: state untouched, banner visible, URL not rewritten', async () => {
    mountSync('/record/DOC-9?ws=%%nonsense%%&wsa=zzz')
    const banner = await screen.findByTestId('ws-param-diagnostic')
    expect(banner).toBeTruthy()
    expect(ctx!.state.tabs.map((t) => t.tab.id)).toEqual(['record:DOC-9'])
    expect(lastSearch).toContain('nonsense')
    expect(spy.calls.length).toBe(0)
  })

  it('per-entry keep-valid/drop-bad: registry survives, banner shows', async () => {
    mountSync('/record/DOC-9?ws=registry,notakind!&wsa=registry')
    const banner = await screen.findByTestId('ws-param-diagnostic')
    expect(banner).toBeTruthy()
    await waitFor(() => expect(ctx!.state.tabs.map((t) => t.tab.id)).toEqual(['registry']))
  })

  it('the banner is dismissable', async () => {
    mountSync('/record/DOC-9?ws=%%nonsense%%&wsa=zzz')
    await screen.findByTestId('ws-param-diagnostic')
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }))
    await waitFor(() => expect(screen.queryByTestId('ws-param-diagnostic')).toBeNull())
  })

  it('a valid strip renders NO banner', () => {
    mountSync('/record/DOC-9?ws=record:DOC-9&wsa=record:DOC-9')
    expect(screen.queryByTestId('ws-param-diagnostic')).toBeNull()
  })
})
