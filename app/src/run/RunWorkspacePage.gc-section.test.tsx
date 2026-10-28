/**
 * GC-12 (deliverable C) — RunWorkspacePage: the GATED render of the GC
 * run-sheet section.
 *
 * Pins (D1/bait #2): the section mounts ONLY when the page's single mount
 * getRecord resolves `payload.kind === 'run'`. A non-run record (e.g. a
 * sequence id on /runs/:runId) or a failed fetch NEVER mounts the section —
 * the DNA surface stays byte-identical. The page fires NO extra getRecord
 * for the gate (it reuses the existing mount fetch), and the section's own
 * probe (listRecordsByKind instrument-sequence) is the section's business —
 * here it is mocked so the page test stays focused on the gate.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { apiClient } from '../shared/api/client'
import { RunWorkspacePage } from './RunWorkspacePage'

// The deck stack is OUT of scope for the gate test: mock the heavy providers
// to inert elements (the page's OWN getRecord stays real — that is the gate
// input).
vi.mock('./RunWorkspaceShell', () => ({
  RunWorkspaceShell: ({
    children,
    viewerToolbar,
  }: {
    children: React.ReactNode
    viewerToolbar?: React.ReactNode
  }) => (
    <div data-testid="rwp-shell">
      <div data-testid="rwp-toolbar">{viewerToolbar}</div>
      {children}
    </div>
  ),
}))
vi.mock('./lib/mode-toggle', () => ({
  useModeToggle: () => ({ mode: 'plan', setMode: vi.fn() }),
  ModeToggle: () => <span data-testid="rwp-mode-toggle">plan</span>,
}))
vi.mock('../graph/execution/ExecutionView', () => ({
  ExecutionView: () => <div data-testid="rwp-execution-view">execution</div>,
}))
vi.mock('../event-editor/viewer/deck/DeckViewer', () => ({
  DeckViewer: () => <div data-testid="rwp-deck-viewer">deck</div>,
}))
vi.mock('../event-editor/viewer/deck/DeckToolbar', () => ({
  DeckToolbar: () => <span data-testid="rwp-deck-toolbar">deck-toolbar</span>,
}))
vi.mock('../event-editor/EventEditorContext', () => ({
  EventEditorProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-event-editor">{children}</div>
  ),
}))
vi.mock('../event-editor/workspace/WorkspaceContext', () => ({
  WorkspaceProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-workspace">{children}</div>
  ),
}))
vi.mock('../agent/HarnessChatPane', () => ({
  HarnessChatPane: () => <div data-testid="rwp-chat">chat</div>,
}))
vi.mock('../agent/useSurfaceChat', () => ({
  useSurfaceChat: () => undefined,
}))
vi.mock('./RunNavPane', () => ({
  RunNavPane: () => <div data-testid="rwp-nav">nav</div>,
}))
vi.mock('./RunProtocolStepsLoader', () => ({
  RunProtocolStepsLoader: () => null,
}))
vi.mock('../event-editor/protocol/ProtocolSelectionContext', () => ({
  ProtocolSelectionProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-protocol">{children}</div>
  ),
}))
vi.mock('../event-editor/protocol/ProtocolPreviewBridge', () => ({
  ProtocolPreviewBridge: () => null,
}))
vi.mock('../event-editor/focus/FocusModalsProvider', () => ({
  FocusModalsProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="rwp-focus">{children}</div>
  ),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    listRecordsByKind: vi.fn().mockResolvedValue({ records: [], total: 0 }),
    getAnalysisRun: vi.fn(),
    getConfig: vi.fn().mockResolvedValue({ storageDevices: [] }),
    registerAcquisitionPackage: vi.fn(),
    getPackageAnalysisInputs: vi.fn(),
    createAnalysisRun: vi.fn(),
    executeAnalysisRun: vi.fn(),
  },
}))

function renderPage(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/runs/${runId}`]}>
      <Routes>
        <Route path="/runs/:runId" element={<RunWorkspacePage />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 })
})

describe('RunWorkspacePage — the GC section gate (D1, bait #2)', () => {
  it('a kind-run record mounts the GC run-sheet section (additive)', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue({
      recordId: 'RUN-GC12-P1',
      payload: { kind: 'run', recordId: 'RUN-GC12-P1', title: 'GC page run', status: 'planned' },
    } as never)
    renderPage('RUN-GC12-P1')
    // The page shell renders (the gate input resolved).
    expect(await screen.findByTestId('rwp-shell')).toBeDefined()
    // The section mounted (its probe found no linked sequence → it renders
    // nothing, but it IS mounted — the listRecordsByKind probe fired).
    await waitFor(() => {
      expect(apiClient.listRecordsByKind).toHaveBeenCalledWith('instrument-sequence', 500)
    })
    // The section rendered NOTHING (no linked sequence) — the DNA surface is
    // byte-identical.
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
    // The gate fired on the page's SINGLE mount fetch (no extra getRecord).
    expect(apiClient.getRecord).toHaveBeenCalledTimes(1)
  })

  it('a non-run record NEVER mounts the section (the gate is kind, not just "record exists")', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue({
      recordId: 'ISEQ-NOT-A-RUN',
      payload: { kind: 'instrument-sequence', id: 'ISEQ-NOT-A-RUN', title: 'a sequence' },
    } as never)
    renderPage('ISEQ-NOT-A-RUN')
    expect(await screen.findByTestId('rwp-shell')).toBeDefined()
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })
    // No section probe fired (the section never mounted) — the DNA byte-
    // identical surface.
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalled()
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
  })

  it('a failed record fetch NEVER mounts the section', async () => {
    vi.mocked(apiClient.getRecord).mockRejectedValue(new Error('404: not found'))
    renderPage('RUN-GONE-1')
    // The page falls back to the scratch study and renders the shell.
    expect(await screen.findByTestId('rwp-shell')).toBeDefined()
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalled()
    expect(screen.queryByTestId('gc-run-sheet')).toBeNull()
  })
})
