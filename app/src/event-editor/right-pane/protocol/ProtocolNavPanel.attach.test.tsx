/**
 * ProtocolNavPanel — attach affordance.
 *
 * User report: "in the left hand pane, there is a protocol tab, but no way to
 * attach a protocol." The rail's empty state used to be a dead end (a sentence
 * telling you to attach a protocol, with nothing to do it with), because the
 * only mount of ProtocolSelector lived in the right-pane ProtocolTabPanel that
 * the three-pane harness no longer renders.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ProtocolSelectionProvider } from '../../protocol/ProtocolSelectionContext'
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

function renderEmpty(opts: { runId?: string; studyId?: string }) {
  return render(
    <MemoryRouter>
      <ProtocolSelectionProvider>
        <ProtocolNavPanel
          title="CellROX Run"
          {...(opts.runId !== undefined ? { runId: opts.runId } : {})}
          {...(opts.studyId !== undefined ? { studyId: opts.studyId } : {})}
        />
      </ProtocolSelectionProvider>
    </MemoryRouter>,
  )
}

describe('ProtocolNavPanel — no protocol attached', () => {
  it('offers the find-&-attach surface when the run and study are known', async () => {
    getProtocolContext.mockResolvedValue({
      projectTemplates: [
        {
          recordId: 'PROTO-1',
          payload: { title: 'CellROX assay', kind: 'protocol', state: 'approved' },
        },
      ],
      availableProtocols: [],
      ingestedPdfs: [],
    })

    renderEmpty({ runId: 'RUN-1', studyId: 'STU-1' })

    expect(screen.getByTestId('attach-protocol')).toBeTruthy()
    expect(screen.getByTestId('protocol-search-input')).toBeTruthy()
    // the attachable protocol appears with its commit affordance
    expect(await screen.findByTestId('attach-PROTO-1')).toBeTruthy()
    // and the dead-end sentence is gone
    expect(screen.queryByText(/Attach a protocol to see its steps/i)).toBeNull()
  })

  it('keeps the plain hint when there is no run context (standalone rail)', () => {
    renderEmpty({})
    expect(screen.getByText(/Attach a protocol to see its steps/i)).toBeTruthy()
    expect(screen.queryByTestId('attach-protocol')).toBeNull()
  })
})
