/**
 * L2-SUBPROTOCOL-EXPAND-1 g6leg2b — mount pin for the product-door route:
 * LabwareEditorRoutePage must render LabwareEventEditor INSIDE a
 * LabwareEditorProvider (same wrap as RunEditorRouter's fall-through arm).
 * The stubbed editor calls the REAL `useLabwareEditor`, which throws
 * "useLabwareEditor must be used within a LabwareEditorProvider"
 * (LabwareEditorContext.tsx:832) outside a provider; the throw surfaces
 * when the lazy chunk resolves, so the test captures the process-level
 * uncaughtException and fails with it verbatim. A page that drops the
 * provider wrapper passes a naive render test but throws in the product.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

describe('g6leg2b — /labware-editor page mounts LabwareEventEditor inside a LabwareEditorProvider', () => {
  let caught: unknown = null
  function onUncaught(e: unknown) {
    caught = e
    // Swallow so the test process survives; the test itself asserts on it.
  }
  afterEach(() => { process.removeListener('uncaughtException', onUncaught) })

  it('renders the editor at /labware-editor with useLabwareEditor resolving (provider proof)', async () => {
    process.on('uncaughtException', onUncaught)

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
    const { LabwareEditorRoutePage } = await import('./LabwareEditorRoutePage')

    render(
      <MemoryRouter initialEntries={['/labware-editor?id=EVG-1&runId=RUN-1&planning=1']}>
        <Routes>
          <Route path="/labware-editor" element={<LabwareEditorRoutePage />} />
        </Routes>
      </MemoryRouter>,
    )

    // If the provider error surfaces first, fail with that exact error.
    await waitFor(() => {
      if (caught) throw new Error(String((caught as Error).message))
      expect(screen.queryByTestId('labware-event-editor')).not.toBeNull()
    }, { timeout: 5000 })
  })
})
