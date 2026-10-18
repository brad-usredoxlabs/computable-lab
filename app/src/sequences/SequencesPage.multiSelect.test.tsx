/**
 * UCX-1 RED — Sequences surface: multi-select toolbar over the Library result
 * list (spec 2026-10-18; adjudications OQ1-OQ4 binding).
 *
 * Pins (spec TEST PLAN):
 *  1. Toolbar always renders (OQ4) with count `0 selected` on load; every
 *     `sequence`-kind Library row has `sequence-check-*`; the oligo-spec row
 *     does NOT (OQ1 — mirrors the server pin at SequenceService.ts:104 and the
 *     fieldset's byKind('sequence') source).
 *  2. Checking SEQ-A + SEQ-B -> count `2 selected`.
 *  3. Select-all selects the visible checkbox-eligible ids only (oligo never
 *     enters the count); with query "Alpha" active, select-all adds only SEQ-A.
 *  4. Toolbar Save posts the EXACT save_collection payload
 *     ({operation, requestId, label, members:[recordRef...]}) and the captured
 *     body DEEP-EQUALS the old Analysis-fieldset flow body for the same
 *     name/ids (payload equivalence by pin, on top of the by-construction
 *     reuse of the :103 expression).
 *  5. Successful save clears the selection (count back to `0 selected`); a
 *     REJECTED save keeps the selection and surfaces role="alert".
 *  6. Clear resets: count `0 selected` AND the Analysis fieldset checkboxes are
 *     unchecked too (single-model proof — OQ3: one `members` state).
 *  7. aiContext: after checking SEQ-A, surfaceContext.collectionSelection ===
 *     ['SEQ-A'] (live-read, deckLabwares pattern) AND the pre-existing
 *     `selection` key still carries the analysis-inputs map (key-clobbering
 *     regression fence).
 *  8. Reviewer-bait fence: clicking a Library row CHECKBOX must not change the
 *     Editor-tab selection (row-button split — checkbox is a sibling of the
 *     open button, never nested in it).
 *
 * Harness: ./api is mocked (requestId deterministic 'req-test', faithful
 * recordRef re-export) so the /actions body is assertable verbatim; the chat
 * hook is mocked (aiContext capture) and the chat pane stubbed. AppShell's
 * workspace chrome (GlobalNavbar / WorkspaceTabStrip / SurfaceIndicator /
 * useTheme) is stubbed at the leaf modules — AppShell.tsx imports them
 * directly, so mocking the barrel would NOT intercept them; WorkspaceTabStrip
 * hard-requires OpenTabsProvider and the chrome is unrelated to this surface.
 */
import type { ReactNode } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { SequencesPage } from './SequencesPage'
import { sequenceApi } from './api'

const { aiContexts } = vi.hoisted(() => ({ aiContexts: [] as Record<string, any>[] }))

vi.mock('./api', () => ({
  draftApi: vi.fn(),
  sequenceApi: vi.fn(),
  requestId: vi.fn(() => 'req-test'),
  recordRef: (id: string, type = 'sequence') => ({ kind: 'record', id, type }),
}))

// Chat hook: capture the aiContext the page builds (pin 7) and return a no-op
// chat object (the page only registers it; HarnessChatPane is stubbed).
vi.mock('../shared/hooks/useAiChat', () => ({
  useAiChat: (opts: { aiContext: Record<string, any> }) => {
    aiContexts.push(opts.aiContext)
    return {
      messages: [], streaming: false, busy: false, error: '', prompt: '',
      setPrompt: () => {}, sendPrompt: () => {}, cancel: () => {}, clear: () => {},
    }
  },
}))
vi.mock('../shared/context/AiPanelContext', () => ({ useRegisterAiChat: vi.fn() }))
vi.mock('../agent/HarnessChatPane', () => ({
  HarnessChatPane: () => <div data-testid="harness-chat-pane-stub"/>,
}))
vi.mock('../shared/surfaces/registry', () => ({ loadSurfaceRegistry: vi.fn(async () => []) }))
vi.mock('../shared/shell/GlobalNavbar', () => ({ GlobalNavbar: () => null }))
vi.mock('../shared/shell/WorkspaceTabStrip', () => ({ WorkspaceTabStrip: () => null }))
vi.mock('../shared/shell/SurfaceIndicator', () => ({ SurfaceIndicator: () => null }))
vi.mock('../shared/shell/useTheme', () => ({
  ThemeProvider: ({ children }: { children?: ReactNode }) => children,
  useTheme: () => ({ resolvedTheme: 'light', theme: null, setTheme: () => {}, toggleTheme: () => {} }),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  vi.clearAllMocks()
  aiContexts.length = 0
  sessionStorage.clear()
})

const CATALOG = {
  records: [
    { recordId: 'SEQ-A', payload: { kind: 'sequence', label: 'Alpha', length: 10, alphabet: 'iupac_dna' } },
    { recordId: 'SEQ-B', payload: { kind: 'sequence', label: 'Beta', length: 20, alphabet: 'iupac_dna' } },
    { recordId: 'OLIG-1', payload: { kind: 'oligo-spec', label: 'Gamma oligo' } },
  ],
}

function actionBodies(): Record<string, any>[] {
  return vi.mocked(sequenceApi).mock.calls
    .filter(([path]) => path === '/actions')
    .map(([, body]) => body as Record<string, any>)
}

async function renderPage() {
  vi.mocked(sequenceApi).mockImplementation(async (path: string) => {
    if (path === '/catalog') return CATALOG
    if (path === '/contract') return { schema: { oneOf: [] }, capabilities: { engines: [] } }
    return { recordId: 'SEQSET-test' }
  })
  render(
    <MemoryRouter>
      <SequencesPage/>
    </MemoryRouter>,
  )
  await screen.findByTestId('sequence-selection-toolbar')
}

function check(id: string): HTMLInputElement {
  return screen.getByTestId(`sequence-check-${id}`) as HTMLInputElement
}

function countText(): string {
  return (screen.getByTestId('sequence-selection-count') as HTMLElement).textContent ?? ''
}

describe('SequencesPage multi-select toolbar', () => {
  it('pin 1: toolbar always renders with 0 selected; sequence rows have checkboxes, the oligo row does not', async () => {
    await renderPage()
    expect(countText()).toBe('0 selected')
    expect(check('SEQ-A')).toBeDefined()
    expect(check('SEQ-B')).toBeDefined()
    expect(screen.queryByTestId('sequence-check-OLIG-1')).toBeNull()
  })

  it('pin 2: checking SEQ-A + SEQ-B -> 2 selected', async () => {
    await renderPage()
    fireEvent.click(check('SEQ-A'))
    fireEvent.click(check('SEQ-B'))
    await waitFor(() => expect(countText()).toBe('2 selected'))
  })

  it('pin 3: select-all covers visible sequence rows only; query-filtered select-all adds only the visible one', async () => {
    await renderPage()
    fireEvent.click(screen.getByTestId('sequence-select-all'))
    await waitFor(() => expect(countText()).toBe('2 selected'))
    expect(check('SEQ-A').checked).toBe(true)
    expect(check('SEQ-B').checked).toBe(true)
    // Oligo never enters the count (no checkbox exists for it at all).
    expect(screen.queryByTestId('sequence-check-OLIG-1')).toBeNull()
    // Fresh mount: query "Alpha" then select-all -> only SEQ-A added.
    cleanup()
    vi.clearAllMocks()
    await renderPage()
    fireEvent.change(screen.getByLabelText('Search sequences'), { target: { value: 'Alpha' } })
    fireEvent.click(screen.getByTestId('sequence-select-all'))
    await waitFor(() => expect(countText()).toBe('1 selected'))
    expect(check('SEQ-A').checked).toBe(true)
    // SEQ-B is filtered out of the DOM; the count (1) proves it was not added.
    expect(screen.queryByTestId('sequence-check-SEQ-B')).toBeNull()
  })

  it('pin 4: toolbar save_collection body deep-equals the Analysis-fieldset body (byte-for-byte, requestId deterministic)', async () => {
    await renderPage()
    fireEvent.click(check('SEQ-A'))
    fireEvent.click(check('SEQ-B'))
    await waitFor(() => expect(countText()).toBe('2 selected'))
    fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Gates' } })
    fireEvent.click(screen.getByTestId('sequence-toolbar-save-collection'))
    await waitFor(() => expect(actionBodies().length).toBe(1))
    const toolbarBody = actionBodies()[0]
    expect(toolbarBody).toEqual({
      operation: 'save_collection',
      requestId: 'req-test',
      label: 'Gates',
      members: [
        { kind: 'record', id: 'SEQ-A', type: 'sequence' },
        { kind: 'record', id: 'SEQ-B', type: 'sequence' },
      ],
    })
    // Same fixture, same name/ids through the OLD fieldset flow (Analysis tab).
    cleanup()
    vi.clearAllMocks()
    await renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    fireEvent.click(screen.getByLabelText('Alpha'))
    fireEvent.click(screen.getByLabelText('Beta'))
    fireEvent.change(screen.getByLabelText('Collection name'), { target: { value: 'Gates' } })
    // The toolbar's Save button shares the name 'Save collection' — scope to
    // the Analysis fieldset so the OLD flow's button is the one clicked.
    const fieldset = screen.getByRole('group', { name: 'Reference / alignment collection' })
    fireEvent.click(within(fieldset).getByRole('button', { name: 'Save collection' }))
    await waitFor(() => expect(actionBodies().length).toBe(1))
    const fieldsetBody = actionBodies()[0]
    expect(toolbarBody).toEqual(fieldsetBody)
    expect(JSON.stringify(toolbarBody)).toBe(JSON.stringify(fieldsetBody))
  })

  it('pin 5: successful save clears the selection; rejected save keeps it and surfaces role="alert"', async () => {
    await renderPage()
    fireEvent.click(check('SEQ-A'))
    await waitFor(() => expect(countText()).toBe('1 selected'))
    fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Gates' } })
    fireEvent.click(screen.getByTestId('sequence-toolbar-save-collection'))
    await waitFor(() => expect(countText()).toBe('0 selected'))
    // Rejected save: sequenceApi rejects the /actions call.
    cleanup()
    vi.clearAllMocks()
    vi.mocked(sequenceApi).mockImplementation(async (path: string) => {
      if (path === '/catalog') return CATALOG
      if (path === '/contract') return { schema: { oneOf: [] }, capabilities: { engines: [] } }
      if (path === '/actions') throw new Error('collection rejected')
      return {}
    })
    render(
      <MemoryRouter>
        <SequencesPage/>
      </MemoryRouter>,
    )
    await screen.findByTestId('sequence-selection-toolbar')
    fireEvent.click(check('SEQ-A'))
    await waitFor(() => expect(countText()).toBe('1 selected'))
    fireEvent.change(screen.getByLabelText('New collection name'), { target: { value: 'Gates' } })
    fireEvent.click(screen.getByTestId('sequence-toolbar-save-collection'))
    expect(await screen.findByRole('alert')).toBeDefined()
    expect((screen.getByRole('alert') as HTMLElement).textContent).toContain('collection rejected')
    expect(countText()).toBe('1 selected')
  })

  it('pin 6: Clear resets the count AND the Analysis fieldset checkboxes (single-model proof)', async () => {
    await renderPage()
    fireEvent.click(check('SEQ-A'))
    fireEvent.click(check('SEQ-B'))
    await waitFor(() => expect(countText()).toBe('2 selected'))
    fireEvent.click(screen.getByRole('button', { name: 'Analysis' }))
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText('Beta') as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByTestId('sequence-clear-selection'))
    await waitFor(() => expect(countText()).toBe('0 selected'))
    expect((screen.getByLabelText('Alpha') as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText('Beta') as HTMLInputElement).checked).toBe(false)
  })

  it('pin 7: aiContext exposes collectionSelection live; the pre-existing selection (analysis inputs) key is untouched', async () => {
    await renderPage()
    fireEvent.click(check('SEQ-A'))
    await waitFor(() => {
      const latest = aiContexts[aiContexts.length - 1]
      expect(latest?.surfaceContext?.collectionSelection).toEqual(['SEQ-A'])
    })
    const latest = aiContexts[aiContexts.length - 1]
    // Regression fence: `selection` is the analysis-inputs map, NOT the
    // collection selection — the new key must not clobber it.
    expect(latest.surfaceContext.selection).toEqual({})
    expect(latest.surfaceContext.selection).not.toEqual(['SEQ-A'])
  })

  it('pin 8: clicking a Library row checkbox does NOT change the Editor-tab selection (row-button split)', async () => {
    await renderPage()
    // Baseline: Editor tab shows the region-annotation fieldset with NO record
    // selected — Save region is disabled.
    expect((screen.getByRole('button', { name: 'Save region' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(check('SEQ-A'))
    await waitFor(() => expect(countText()).toBe('1 selected'))
    // The checkbox click must NOT have opened the record: still on the Editor
    // tab with NO selection (Save region stays disabled).
    expect((screen.getByRole('button', { name: 'Save region' }) as HTMLButtonElement).disabled).toBe(true)
    // And the Library checkbox is a SIBLING of the open button, never inside it.
    expect(check('SEQ-A').closest('button')).toBeNull()
  })
})
