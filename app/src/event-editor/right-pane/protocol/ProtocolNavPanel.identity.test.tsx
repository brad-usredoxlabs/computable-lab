import { describe, it, expect, afterEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { useEffect, useRef } from 'react'
import { ProtocolSelectionProvider, useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import { ProtocolNavPanel } from './ProtocolNavPanel'

/**
 * The run workspace's Protocol rail must name the protocol the run is attached
 * to — not only the run — so the step list below is never read against the
 * wrong protocol. The name comes from the record; the id comes from the run's
 * chain (published into ProtocolSelectionContext by RunProtocolStepsLoader).
 */

const mocks = vi.hoisted(() => ({ getRecord: vi.fn() }))

vi.mock('../../../shared/api/client', () => ({
  apiClient: { getRecord: mocks.getRecord },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const PROTOCOL_ENV = {
  recordId: 'PRT-4iaey2',
  payload: {
    kind: 'protocol',
    title: 'PureLink Genomic DNA Extraction (Thermo Fisher)',
    state: 'approved',
    createdAt: '2026-09-12T20:30:05.113Z',
  },
}

/** Publishes steps (+ optionally the attached protocol) into the shared context, once. */
function Seed({ withProtocol = true }: { withProtocol?: boolean }) {
  const sel = useProtocolSelection()
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !sel) return
    done.current = true
    sel.setSteps([
      { stepId: 'step-1', label: 'Set 2 water baths', ordinal: 1 },
      { stepId: 'step-2', label: 'Cut the mouse tail', ordinal: 2 },
    ])
    if (withProtocol) sel.setProtocol({ recordId: 'PRT-4iaey2', title: 'ref label' })
  }, [sel, withProtocol])
  return null
}

function renderRail(withProtocol = true) {
  return render(
    <ProtocolSelectionProvider>
      <Seed withProtocol={withProtocol} />
      <ProtocolNavPanel title="2026-09-19 Run" />
    </ProtocolSelectionProvider>,
  )
}

describe('ProtocolNavPanel identity line', () => {
  it('names the attached protocol from its record, alongside the run header', async () => {
    mocks.getRecord.mockResolvedValue(PROTOCOL_ENV)
    renderRail()

    expect(screen.getByText('2026-09-19 Run')).toBeTruthy()
    // The record's title wins over the ref label the context carried.
    expect(await screen.findByText('PureLink Genomic DNA Extraction (Thermo Fisher)')).toBeTruthy()
    expect(screen.getByTestId('protocol-identity-name').textContent).toContain('PRT-4iaey2')
    expect(mocks.getRecord).toHaveBeenCalledWith('PRT-4iaey2')
    // The step rail is still there below it.
    expect(screen.getByTestId('protocol-nav-list')).toBeTruthy()
  })

  it('reveals the record metadata on hover', async () => {
    mocks.getRecord.mockResolvedValue(PROTOCOL_ENV)
    renderRail()

    const anchor = await screen.findByTestId('protocol-identity-name')
    expect(screen.queryByTestId('protocol-identity-tooltip')).toBeNull()

    fireEvent.focus(anchor)
    const tooltip = screen.getByTestId('protocol-identity-tooltip')
    expect(tooltip.textContent).toContain('PRT-4iaey2')
    expect(tooltip.textContent).toContain('approved')
    expect(tooltip.textContent).toContain('2026-09-12 20:30 UTC')

    fireEvent.blur(anchor)
    expect(screen.queryByTestId('protocol-identity-tooltip')).toBeNull()
  })

  it('renders no identity line when the run has no attached protocol', () => {
    mocks.getRecord.mockResolvedValue(PROTOCOL_ENV)
    renderRail(false)
    // Steps are present, so the rail renders its list — just with no protocol named.
    expect(screen.getByTestId('protocol-nav-list')).toBeTruthy()
    expect(screen.queryByTestId('protocol-identity')).toBeNull()
  })
})