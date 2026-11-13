/**
 * ProtocolNavPanel — steps pending / read failed (G3-D3, browser gate g3 F5).
 * Identity known AND steps empty can only mean pending-or-failed (a protocol
 * requires >= 1 step, protocol.schema.yaml:320 minItems: 1) — never attach.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(async () => ({ recordId: 'LPR-1', payload: {} })),
    getProtocolContext: vi.fn(async () => ({ projectTemplates: [], availableProtocols: [], ingestedPdfs: [] })),
  },
}))

afterEach(cleanup)
/** Mirrors the loader's publish order: identity first, steps state, no steps. */
function Seed({ pending }: { pending: boolean }) {
  const sel = useProtocolSelection()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !sel) return
    done.current = true
    sel.setProtocol({ recordId: 'LPR-1', title: 'Cell Seeding' })
    sel.setStepsPending(pending)
  }, [sel, pending])
  return null
}

function renderRail(pending: boolean | null, withRun = true) {
  return render(
    <MemoryRouter>
      <ProtocolSelectionProvider>
        {pending !== null ? <Seed pending={pending} /> : null}
        <ProtocolNavPanel title="2026-09-06 Run" {...(withRun ? { runId: 'RUN-1', studyId: 'STU-1' } : {})} />
      </ProtocolSelectionProvider>
    </MemoryRouter>,
  )
}

describe('ProtocolNavPanel — pending / failed steps rail', () => {
  it('identity known + steps pending -> pending rail, no attach surface', async () => {
    renderRail(true)
    expect(screen.getByTestId('protocol-nav-pending').textContent).toContain('Cell Seeding')
    const identity = await screen.findByTestId('protocol-identity-name')
    expect(identity.textContent).toContain('LPR-1')
    expect(screen.queryByText(/No protocol attached/i)).toBeNull()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()
  })

  it('identity known + steps failed -> honest read-failure line, no attach surface', () => {
    renderRail(false)
    expect(screen.getByText(/could not be read/i)).toBeTruthy()
    expect(screen.queryByTestId('protocol-nav-pending')).toBeNull()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()
    expect(screen.queryByText(/No protocol attached/i)).toBeNull()
  })

  it('no known protocol -> the attach hint, not the pending/failed rails (AC3)', () => {
    renderRail(null, false)
    expect(screen.getByText(/Attach a protocol to see its steps/i)).toBeTruthy()
    expect(screen.queryByTestId('protocol-nav-pending')).toBeNull()
    expect(screen.queryByText(/could not be read/i)).toBeNull()
  })
})
