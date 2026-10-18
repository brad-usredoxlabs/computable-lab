/**
 * UCX-2 (RED) — SequencesPage page-local ?tab= deep-link pins (e).
 *
 * The sequences internal tabs (Editor/Assay/Analysis/Setup/Import/Knowledge —
 * the declared const kept in lockstep with surfaces.yaml by the server compat
 * test) are NOT OpenTabsContext tabs; only a page-local ?tab= can express them
 * (OQ2 ruling). Precedence: explicit valid ?tab= > ?source=→Import > 'Editor'.
 * Writes ride the page's single tab-setter (human click AND agent setTab) with
 * replace:true. The existing ?source= behavior must stay byte-stable.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const searchSpy = vi.hoisted(() => ({ calls: [] as Array<{ init?: unknown; opts?: unknown }> }))
const chatCapture = vi.hoisted(() => ({ opts: null as Record<string, unknown> | null }))

vi.mock('react-router-dom', async (importOriginal) => {
  const real = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...real,
    useSearchParams: (...args: unknown[]) => {
      const [params, setParams] = (real.useSearchParams as (...a: unknown[]) => [URLSearchParams, (i: unknown, o?: unknown) => void])(...args)
      return [
        params,
        (init: unknown, opts?: unknown) => {
          searchSpy.calls.push({ init, opts })
          return (setParams as (i: unknown, o?: unknown) => void)(init, opts)
        },
      ]
    },
  }
})

vi.mock('./api', () => ({
  sequenceApi: vi.fn(async () => ({ records: [] })),
  draftApi: vi.fn(async () => ({})),
  requestId: () => 'test-req',
  recordRef: (id: string, type = 'sequence') => ({ kind: 'record', id, type }),
}))

vi.mock('../shared/surfaces/registry', () => ({
  loadSurfaceRegistry: async () => [],
}))

vi.mock('../shared/hooks/useAiChat', () => ({
  useAiChat: (opts: Record<string, unknown>) => {
    chatCapture.opts = opts
    return { sendPrompt: () => {}, messages: [] }
  },
}))

vi.mock('../agent/HarnessChatPane', () => ({
  HarnessChatPane: () => null,
}))

import { SequencesPage } from './SequencesPage'
import { AiPanelProvider } from '../shared/context/AiPanelContext'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

function Probe() {
  const location = useLocation()
  return <div data-testid="probe-search">{location.search}</div>
}

function mountPage(url: string) {
  searchSpy.calls.length = 0
  chatCapture.opts = null
  return render(
    <OpenTabsProvider>
      <AiPanelProvider>
        <MemoryRouter initialEntries={[url]}>
          <SequencesPage />
          <Probe />
        </MemoryRouter>
      </AiPanelProvider>
    </OpenTabsProvider>,
  )
}

function pressed(name: string): boolean {
  const button = screen.getByRole('button', { name })
  return button.getAttribute('aria-pressed') === 'true'
}

function probeSearch(): URLSearchParams {
  return new URLSearchParams(screen.getByTestId('probe-search').textContent ?? '')
}

beforeEach(() => {
  cleanup()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('SequencesPage ?tab= consumer (UCX-2)', () => {
  it('?tab=Analysis activates the Analysis tab on first paint', () => {
    mountPage('/sequences?tab=Analysis')
    expect(pressed('Analysis')).toBe(true)
    expect(pressed('Editor')).toBe(false)
  })

  it('malformed ?tab=Nope degrades to the default Editor with no crash', () => {
    mountPage('/sequences?tab=Nope')
    expect(pressed('Editor')).toBe(true)
  })

  it('?source= without ?tab= still routes to Import (existing behavior byte-pin)', () => {
    mountPage('/sequences?source=ncbi')
    expect(pressed('Import')).toBe(true)
  })

  it('a valid ?tab= outranks ?source=', () => {
    mountPage('/sequences?source=ncbi&tab=Setup')
    expect(pressed('Setup')).toBe(true)
  })

  it('a human tab click writes ?tab= with replace:true', async () => {
    mountPage('/sequences')
    fireEvent.click(screen.getByRole('button', { name: 'Setup' }))
    await waitFor(() => expect(probeSearch().get('tab')).toBe('Setup'))
    expect(pressed('Setup')).toBe(true)
    const last = searchSpy.calls[searchSpy.calls.length - 1]
    expect((last?.opts as { replace?: boolean } | undefined)?.replace, 'tab write must REPLACE, never push').toBe(true)
  })

  it('the agent setTab path persists through the same setter (replace)', async () => {
    mountPage('/sequences')
    const onAgentAction = chatCapture.opts?.onAgentAction as ((a: unknown) => unknown) | undefined
    expect(onAgentAction).toBeTypeOf('function')
    act(() => {
      onAgentAction!({ action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } })
    })
    await waitFor(() => expect(pressed('Analysis')).toBe(true))
    await waitFor(() => expect(probeSearch().get('tab')).toBe('Analysis'))
    const last = searchSpy.calls[searchSpy.calls.length - 1]
    expect((last?.opts as { replace?: boolean } | undefined)?.replace).toBe(true)
  })
})
