/**
 * The left rail owns protocol attach AND change (plan 2026-09-19_121028, D4).
 *
 * A run with a protocol attached showed its steps and nothing else — no way to
 * change the protocol without going back to another host page. The right-pane
 * Protocol tab used to carry the picker, which the harness no longer renders in
 * the run workspace; that picker is retired (D4), so the rail grows a
 * "Change protocol" entry that reuses AttachProtocolPanel's already-attached mode.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useEffect } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'

const getProtocolContext = vi.fn()

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getProtocolContext: (...args: unknown[]) => getProtocolContext(...args),
    getRecord: vi.fn(async () => ({ payload: {} })),
    useProtocolInRun: vi.fn(async () => ({})),
  },
}))

afterEach(() => {
  cleanup()
  getProtocolContext.mockReset()
})

/** Publishes two step concepts into the shared selection context. */
function StepSeeder() {
  const sel = useProtocolSelection()
  useEffect(() => {
    sel?.setSteps([
      { stepId: 's1', label: 'Seed cells', ordinal: 1 },
      { stepId: 's2', label: 'Add compound', ordinal: 2 },
    ])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderRail() {
  return render(
    <MemoryRouter>
      <ProtocolSelectionProvider>
        <StepSeeder />
        <ProtocolNavPanel title="CellROX Run" runId="RUN-1" studyId="STU-1" />
      </ProtocolSelectionProvider>
    </MemoryRouter>,
  )
}

describe('ProtocolNavPanel — protocol attached', () => {
  it('offers Change protocol, and it opens the picker in already-attached mode', async () => {
    getProtocolContext.mockResolvedValue({
      projectTemplates: [
        { recordId: 'PROTO-2', payload: { title: 'Other protocol', kind: 'protocol', state: 'approved' } },
      ],
      availableProtocols: [],
      ingestedPdfs: [],
    })

    renderRail()
    // steps are the default view
    expect(screen.getByTestId('protocol-nav-step-s1')).toBeTruthy()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()

    fireEvent.click(screen.getByTestId('protocol-nav-change'))
    expect(await screen.findByTestId('attach-protocol')).toBeTruthy()
    // alreadyAttached copy: attaching here REPLACES the current method
    expect(await screen.findByText(/Change protocol/i)).toBeTruthy()

    // Cancel returns to the step rail
    fireEvent.click(screen.getByTestId('change-cancel'))
    await waitFor(() => expect(screen.queryByTestId('attach-protocol')).toBeNull())
    expect(screen.getByTestId('protocol-nav-step-s1')).toBeTruthy()
  })
})
