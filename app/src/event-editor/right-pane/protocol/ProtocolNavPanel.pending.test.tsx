/**
 * ProtocolNavPanel — steps pending / read-failed (G3-D3, browser gate g3 F5).
 *
 * The loader publishes the run's protocol identity (sel.setProtocol) BEFORE its
 * steps fetch lands, so "identity known AND steps empty" can only mean
 * pending-or-failed — a protocol record requires >= 1 step
 * (schema/workflow/protocol.schema.yaml:320 minItems: 1). The rail must render
 * a pending rail (or an honest read-failure line), never the attach surface:
 * a live "Attach to run" would let a second protocol replace the attached one.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    // Identity header record fetch — empty payload so the ref label is the name,
    // and the envelope carries the record id the identity line displays.
    getRecord: vi.fn(async () => ({ recordId: 'LPR-1', payload: {} })),
    getProtocolContext: vi.fn(async () => ({ projectTemplates: [], availableProtocols: [], ingestedPdfs: [] })),
  },
}))

afterEach(() => { cleanup() })

/** Mirrors the loader's publish order: identity first, steps state, no steps. */
function Seed({ pending }: { pending: boolean }) {
  const sel = useProtocolSelection()
  useEffect(() => {
    sel?.setProtocol({ recordId: 'LPR-1', title: 'Cell Seeding' })
    sel?.setStepsPending(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

describe('ProtocolNavPanel — pending / failed steps rail', () => {
  it('identity known + steps pending -> pending rail, no attach surface', async () => {
    render(
      <MemoryRouter>
        <ProtocolSelectionProvider>
          <Seed pending={true} />
          <ProtocolNavPanel title="2026-09-06 Run" runId="RUN-1" studyId="STU-1" />
        </ProtocolSelectionProvider>
      </MemoryRouter>,
    )
    // The pending rail shows the identity header (name = ref label, then the
    // record id once the record fetch settles) + the loading line. No attach
    // affordance, no "No protocol attached".
    expect(screen.getByTestId('protocol-nav-pending').textContent).toContain('Cell Seeding')
    const identityName = await screen.findByTestId('protocol-identity-name')
    expect(identityName.textContent).toContain('LPR-1')
    expect(screen.queryByText(/No protocol attached/i)).toBeNull()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()
  })

  it('identity known + steps failed -> honest read-failure line, no attach surface', () => {
    render(
      <MemoryRouter>
        <ProtocolSelectionProvider>
          <Seed pending={false} />
          <ProtocolNavPanel title="2026-09-06 Run" runId="RUN-1" studyId="STU-1" />
        </ProtocolSelectionProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/could not be read/i)).toBeTruthy()
    expect(screen.queryByTestId('protocol-nav-pending')).toBeNull()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()
    expect(screen.queryByText(/No protocol attached/i)).toBeNull()
  })

  it('no known protocol -> the attach surface, unchanged (AC3)', async () => {
    render(
      <MemoryRouter>
        <ProtocolSelectionProvider>
          <ProtocolNavPanel title="2026-09-06 Run" runId="RUN-1" studyId="STU-1" />
        </ProtocolSelectionProvider>
      </MemoryRouter>,
    )
    expect(screen.getByTestId('attach-protocol')).toBeTruthy()
    // the selector copy lands once the protocol context fetch resolves
    expect(await screen.findByText('No protocol attached')).toBeTruthy()
    // the pending/failed rails must not have intruded into the no-protocol path
    expect(screen.queryByTestId('protocol-nav-pending')).toBeNull()
    expect(screen.queryByText(/could not be read/i)).toBeNull()
  })
})
