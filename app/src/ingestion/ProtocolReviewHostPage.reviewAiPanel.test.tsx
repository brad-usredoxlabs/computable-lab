/**
 * W2-9 T1 — the rightPane mount on the protocol-review host (spec §3 R1, §5 B1).
 *
 * RED on clean trunk BY DESIGN: ProtocolReviewHostPage renders NO rightPane
 * today (leftPane only — the verified gap the item exists to close). GREEN:
 * the host mounts the review AI panel as its rightPane (review-ai-panel +
 * chat-input testids), and the no-draft state renders a NAMED + reasoned arm
 * (never a silent blank, spec §2.4).
 *
 * The left pane (W2-8's VendorPdfReviewPage) is stubbed — this test pins the
 * HOST's mount contract, not W2-8's internals (zero edits to their files).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell/useTheme'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

const getRecordMock = vi.fn()
const listRecordsByKindMock = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
    getSurfaces: () => Promise.resolve({ surfaces: [] }),
  },
}))

vi.mock('./VendorPdfReviewPage', () => ({
  VendorPdfReviewPage: ({ embedded }: { embedded?: boolean }) => (
    <div data-testid="vendor-review-stub">{embedded ? 'left pane' : ''}</div>
  ),
}))

import { ProtocolReviewHostPage } from './ProtocolReviewHostPage'

const VPDF_ID = 'VPDF-ABCDEF012345'
const CAN_ID = 'CAN-w29-demo'
const XDR_ID = 'XDR-semantic-w29demo0001'

const vpdfRecord = {
  recordId: VPDF_ID,
  schemaId: 'vendor-pdf',
  payload: { kind: 'vendor-pdf', recordId: VPDF_ID, title: 'ZymoBIOMICS 96 MagBead DNA Kit' },
  meta: { kind: 'vendor-pdf', contentSha: 'vpdf-sha' },
}

function xdrEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'extraction-draft',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
      status: 'draft',
      source_artifact: { kind: 'file', id: VPDF_ID, locator: 'zymo.pdf' },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.9,
          draft: {
            kind: 'protocol',
            recordId: `PRT-${CAN_ID}-semantic`,
            title: 'ZymoBIOMICS — semantic family draft',
            steps: [
              {
                stepId: 'step-lyse',
                label: 'Lyse samples',
                ordinal: 1,
                kind: 'other',
                intent: {
                  semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-lyse' } },
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Sample prep' }],
                },
              },
              {
                stepId: 'step-wash',
                label: 'Wash beads',
                ordinal: 2,
                kind: 'wash',
                intent: {
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 2, label: 'Wash' }],
                },
              },
            ],
          },
        },
      ],
      ambiguity_spans_by_candidate: [[{ text: 'briefly wash', page: 2 }]],
      diagnostics: [],
    },
    meta: { kind: 'extraction-draft', contentSha: 'xdr-sha-1' },
  }
}

function saidEnvelope() {
  return {
    recordId: CAN_ID,
    schemaId: 'vendor-protocol-candidate',
    payload: {
      kind: 'vendor-protocol-candidate',
      title: 'ZymoBIOMICS 96 MagBead DNA Kit',
      source: { documentId: VPDF_ID, filename: 'zymo.pdf', pageCount: 31 },
    },
    meta: { kind: 'vendor-protocol-candidate', contentSha: 'can-sha' },
  }
}

function renderHost() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[`/ingestion/vendor-pdf/${VPDF_ID}`]}>
        <OpenTabsProvider>
          <Routes>
            <Route path="/ingestion/vendor-pdf/:recordId" element={<ProtocolReviewHostPage />} />
          </Routes>
        </OpenTabsProvider>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('ProtocolReviewHostPage rightPane mount (W2-9 T1)', () => {
  beforeEach(() => {
    cleanup()
    getRecordMock.mockReset()
    listRecordsByKindMock.mockReset()
    getRecordMock.mockResolvedValue(vpdfRecord)
    listRecordsByKindMock.mockImplementation(async (kind: string) => {
      if (kind === 'extraction-draft') return { records: [xdrEnvelope()], total: 1 }
      if (kind === 'vendor-protocol-candidate') return { records: [saidEnvelope()], total: 1 }
      return { records: [], total: 0 }
    })
  })

  it('mounts the review AI panel as the rightPane beside the left pane', async () => {
    renderHost()
    // The left pane (W2-8's surface) is still there.
    expect(await screen.findByTestId('vendor-review-stub')).toBeTruthy()
    // W2-9: the rightPane renders the review AI panel with its chat input.
    const panel = await screen.findByTestId('review-ai-panel')
    expect(panel).toBeTruthy()
    expect(screen.getByTestId('chat-input')).toBeTruthy()
    // With an open draft there is NO unavailable arm.
    expect(screen.queryByTestId('review-ai-no-draft')).toBeNull()
  })

  it('with no open XDR the panel renders a NAMED, reasoned unavailable arm (never a silent blank)', async () => {
    listRecordsByKindMock.mockImplementation(async () => ({ records: [], total: 0 }))
    renderHost()
    const panel = await screen.findByTestId('review-ai-panel')
    expect(panel).toBeTruthy()
    const arm = await screen.findByTestId('review-ai-no-draft')
    // Named + reasoned: the arm states WHY proposals cannot apply (no target).
    expect(arm.textContent).toContain('draft')
    expect(arm.textContent).toContain('edit')
    // Chat itself stays usable (chat can still ANSWER questions).
    expect(screen.getByTestId('chat-input')).toBeTruthy()
  })
})
