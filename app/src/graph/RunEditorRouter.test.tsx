/**
 * u6binddoor — RED pins before the fix:
 *   (a) App.tsx does NOT register /runs/:runId/bindings (route is unreachable)
 *   (b) RunEditorRouter renders "Not found" because apiClient.getRecord 404s
 *       on tree-store records; the two-step getRecordWithUI resolution is
 *       missing.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import fs from 'fs'
import path from 'path'

describe('u6binddoor — route and resolution pins', () => {
  beforeEach(() => { vi.restoreAllMocks() })

  it('App.tsx registers /runs/:runId/bindings', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8')
    expect(src).toContain('/runs/:runId/bindings')
  })

  it('resolves run → PLR and mounts BindingModeEditor', async () => {
    // Stub apiClient BEFORE importing RunEditorRouter
    const mockRunResp = { record: { id: 'RUN-1', payload: { plannedRunRef: { id: 'PLR-1' } } } }
    const mockPlrResp = { record: { id: 'PLR-1', payload: { kind: 'planned-run', state: 'draft', title: 'Draft Plan' } } }

    vi.doMock('../shared/api/client', () => ({
      apiClient: {
        getRecordWithUI: vi.fn(async (id: string) =>
          id === 'RUN-1' ? mockRunResp : mockPlrResp,
        ),
        getRecord: vi.fn(async () => { throw new Error('404') }),
      },
    }))

    // Stub BindingModeEditor so we can detect the branch
    vi.doMock('./BindingMode/BindingModeEditor', () => ({
      BindingModeEditor: vi.fn(function BindingModeEditor({ plannedRunId }) {
        return (
          <div role="region" data-testid="binding-mode-editor">
            <h2>Role Bindings for {plannedRunId}</h2>
          </div>
        )
      }),
    }))

    // Stub LabwareEventEditor (fallback branch)
    vi.doMock('./LabwareEventEditor', () => ({
      LabwareEventEditor: vi.fn(function LabwareEventEditor() {
        return <div data-testid="labware-event-editor">LabwareEventEditor</div>
      }),
    }))

    // Reset modules so lazy imports pick up the mocks
    vi.resetModules()
    const { RunEditorRouter } = await import('./RunEditorRouter')

    render(
      <MemoryRouter initialEntries={['/runs/RUN-1/bindings']}>
        <Routes>
          <Route path="/runs/:runId/bindings" element={<RunEditorRouter />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('binding-mode-editor')).toBeInTheDocument()
    }, { timeout: 5000 })
  })
})
