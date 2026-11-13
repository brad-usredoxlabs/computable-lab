/**
 * g4labmount — mount pin (g4 D-2):
 * RunEditorRouter's fall-through arm (record !== null, not the
 * (planned-run, draft) branch) must render LabwareEventEditor inside a
 * LabwareEditorProvider.
 *
 * The stub editor below calls the REAL `useLabwareEditor` hook from
 * graph/context/LabwareEditorContext, which throws
 * "useLabwareEditor must be used within a LabwareEditorProvider"
 * (LabwareEditorContext.tsx:832) when no provider is mounted. The throw
 * happens asynchronously when the lazy chunk resolves (outside a React
 * render, so no error boundary can see it), so the test captures the
 * process-level uncaughtException and reports it verbatim as the failure.
 *
 * Note: the `?screen=labware-editor&fixture=...` arm in app/src/main.tsx
 * cannot be unit-tested cheaply (bootstrap + URL parsing); it is covered
 * by AC1 in the browser gate.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

describe('g4labmount — fall-through arm mounts LabwareEventEditor inside a LabwareEditorProvider', () => {
  let caught: unknown = null

  beforeEach(() => {
    vi.restoreAllMocks()
    caught = null
  })

  afterEach(() => {
    process.removeListener('uncaughtException', onUncaught)
  })

  function onUncaught(e: unknown) {
    caught = e
    // Swallow so the test process survives; the test itself asserts on it.
  }

  it('renders the editor on the non-draft fall-through arm without the provider error', async () => {
    process.on('uncaughtException', onUncaught)

    // A run whose resolved PLR is NOT a draft planned-run → record is
    // non-null and the (planned-run, draft) branch is skipped → the
    // fall-through arm at RunEditorRouter.tsx:31-35 renders
    // <LabwareEventEditor />. (record === null is the separate not-found
    // arm and stays untouched — AC3.)
    const mockRunResp = { record: { id: 'RUN-NO-PLR', payload: { plannedRunRef: { id: 'PLR-1' } } } }
    const mockPlrResp = { record: { id: 'PLR-1', payload: { kind: 'planned-run', state: 'active' } } }
    vi.doMock('../shared/api/client', () => ({
      apiClient: {
        getRecordWithUI: vi.fn(async (id: string) =>
          id === 'RUN-NO-PLR' ? mockRunResp : mockPlrResp,
        ),
        getRecord: vi.fn(async () => { throw new Error('404') }),
      },
    }))

    // Stub the editor with the real hook: it throws outside a provider.
    vi.doMock('./LabwareEventEditor', async () => {
      const { useLabwareEditor } = await vi.importActual<typeof import('./context/LabwareEditorContext')>(
        './context/LabwareEditorContext',
      )
      return {
        LabwareEventEditor: () => {
          useLabwareEditor()
          return <div data-testid="labware-event-editor">LabwareEventEditor (stub)</div>
        },
      }
    })

    vi.resetModules()
    const { RunEditorRouter } = await import('./RunEditorRouter')

    render(
      <MemoryRouter initialEntries={['/runs/RUN-NO-PLR']}>
        <Routes>
          <Route path="/runs/:runId" element={<RunEditorRouter />} />
        </Routes>
      </MemoryRouter>,
    )

    // Wait for the editor to render; if the provider error surfaces as an
    // uncaught exception first, fail with that exact error.
    await waitFor(() => {
      if (caught) throw new Error(String((caught as Error).message))
      expect(screen.queryByTestId('labware-event-editor')).not.toBeNull()
    }, { timeout: 5000 })
  })
})
