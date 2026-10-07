/**
 * PB-CH-6 — missing-provider arms on the Analysis mount (each NAMED, never a
 * silent no-op):
 *  - getAiHealth false ⇒ input + send are DISABLED with a visible reason line
 *    (data-testid="analysis-chat-unavailable") and a send attempt fires ZERO
 *    stream calls;
 *  - no-tab-store (the unit tree where the executor's openTabs seam is null —
 *    in the routed app OpenTabsProvider always wraps /analysis) ⇒ the
 *    executor's NO_TAB_STORE diagnostic surfaces VERBATIM as a system bubble
 *    (the flow's handleAgentAction returns the executor text; useAiChat
 *    renders it). The executor seam is REAL here; only the OpenTabs context
 *    module is mocked so useOptionalOpenTabs() reads null while
 *    useApplySessionDocument()'s useOpenTabs gets a harmless fake.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { AnalysisChatPanel } from './AnalysisChatPanel'
import { apiClient } from '../shared/api/client'
import { getAiHealth, streamAssist } from '../shared/api/aiClient'

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

// Registry seam mocked (AiTabPanel.workstate.test.tsx precedent — the loader
// has a module-level promise cache that leaks across test files in one
// worker; mocking the seam keeps this a unit test of the EXECUTOR arm).
const REGISTRY = [
  { id: 'run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'] },
]
vi.mock('../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => REGISTRY,
  loadSurfaceRegistry: () => Promise.resolve(REGISTRY),
}))

// The OpenTabs seam: useOptionalOpenTabs() reads null (the executor's
// conservative NO_TAB_STORE arm — workstateExecutor.ts:209) while
// useApplySessionDocument()'s useOpenTabs receives a harmless fake so the
// hook tree can mount in a unit test.
const replaceStateFake = vi.fn()
vi.mock('../shared/shell/OpenTabsContext', () => ({
  useOpenTabs: () => ({
    state: { tabs: [], activeTabId: null },
    openTab: vi.fn(),
    closeTab: vi.fn(),
    activateTab: vi.fn(),
    replaceState: replaceStateFake,
    canGoBack: () => false,
    canGoForward: () => false,
    back: vi.fn(),
    forward: vi.fn(),
    withinBack: () => false,
    withinForward: () => false,
  }),
  useOptionalOpenTabs: () => null,
}))

const INTENT = { operation: 'compose-workstate', tabs: [{ surface: 'analysis', title: 'Analysis' }], activeTab: { index: 0 } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AnalysisChatPanel — missing-capability arms', () => {
  it('AI unhealthy (aiAvailable false): disabled input + NAMED reason line; a send attempt fires ZERO stream calls', async () => {
    vi.mocked(getAiHealth).mockResolvedValue({ available: false })

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    expect(await screen.findByTestId('analysis-chat-unavailable')).toBeDefined()
    expect(screen.getByTestId('analysis-chat-unavailable').textContent).toContain('unavailable')
    expect((input as HTMLTextAreaElement).disabled).toBe(true)
    const send = screen.getByTestId('analysis-chat-send') as HTMLButtonElement
    expect(send.disabled).toBe(true)

    fireEvent.change(input, { target: { value: 'compose the workspace' } })
    fireEvent.click(send)
    await new Promise((r) => setTimeout(r, 20))
    expect(streamAssist).not.toHaveBeenCalled()
  })

  it('no-tab-store tree: the executor NO_TAB_STORE diagnostic surfaces VERBATIM (named system bubble), zero writes', async () => {
    vi.mocked(getAiHealth).mockResolvedValue({ available: true })
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'agent_action', action: { action: 'open-surface', surface: 'run', target: { kind: 'run', id: 'RUN-7' } } } as never
      yield { type: 'workstate_proposal', workstate: INTENT } as never
      yield { type: 'done', result: { success: true, notes: [] } } as never
    })
    vi.mocked(apiClient.compileWorkstateDraft).mockResolvedValue({
      draftId: 'DRAFT-NO-TABS',
      revision: 1,
      reviewHash: 'e'.repeat(64),
      canAccept: true,
      diagnostics: [],
      result: { sessionDocument: { version: 1, tabs: [{ kind: 'run', runId: 'RUN-7' }], activeTabId: null } },
    })

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'open the analysis surface' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    // Tier-1 arm: the executor (REAL, unmocked) sees openTabs = null and
    // returns its NO_TAB_STORE diagnostic — the flow surfaces the text and
    // useAiChat renders it as a system bubble, VERBATIM.
    expect(
      await screen.findByText(/no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks/, undefined, { timeout: 3000 }),
    ).toBeDefined()

    // Tier-2 arm still works in the same tree: the card reaches review
    // (compile is the trust boundary; the card is honest about what it can
    // and cannot do — accept would surface the executor's diagnostics too).
    expect(await screen.findByTestId('workstate-card')).toBeDefined()
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledTimes(1)

    // Zero writes: the fake replaceState was never touched.
    await waitFor(() => expect(screen.getByTestId('workstate-card-accept')).toBeDefined())
    expect(replaceStateFake).not.toHaveBeenCalled()
  })
})
