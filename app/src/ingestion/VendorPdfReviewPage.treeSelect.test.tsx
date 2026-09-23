/**
 * Handbook review surface: one artifact, MANY trees. The GET review response
 * carries `trees` (all sha256 matches) + singular compat mirrors of trees[0].
 * The page must (a) offer a protocol selector ONLY when count > 1, (b) drive
 * the questions panel from the SELECTED tree, and (c) render exactly the old
 * single-tree UI for count === 1 / absent `trees` (older servers).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const getRecordMock = vi.fn()
const getIntakeReviewMock = vi.fn()
const blobUrlMock = vi.fn((_recordId: string) => '')
const realizeMock = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    getIntakeReview: (...args: unknown[]) => getIntakeReviewMock(...args),
    vendorPdfBlobUrl: (recordId: string) => blobUrlMock(recordId),
    realizeIntakeBranch: (...args: unknown[]) => realizeMock(...args),
    getEditorDraftProjection: () => Promise.reject(new Error('no projection in test')),
  },
}))

// The PDF pane is irrelevant here — a blob URL of '' makes pdfjs fail fast and
// the page falls back to the text pane.
vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({ promise: Promise.reject(new Error('no pdf in test')), destroy: () => {} }),
  GlobalWorkerOptions: {},
}))

import { VendorPdfReviewPage } from './VendorPdfReviewPage'

const record = {
  recordId: 'VPDF-HB1',
  kind: 'vendor-pdf',
  payload: {
    kind: 'vendor-pdf',
    recordId: 'VPDF-HB1',
    title: 'DNeasy Blood & Tissue Handbook',
    extractedText: [{ pageNumber: 1, text: 'Protocol: Blood …' }],
  },
}

function axis(id: string, question: string) {
  return { axisId: id, question, choiceKey: `$.branchSelection.${id}`, origin: 'document_branch', conditions: [] }
}

function treeDetail(recordId: string, documentId: string, question: string) {
  return {
    tree: { recordId, documentId, axes: [axis(`ax-${recordId}`, question)], scaleAxis: { question: 'Scale', options: [{ level: 'manual_tubes' }] }, generatedAt: '2026-09-22T00:00:00.000Z' },
    candidate: { steps: [{ id: 'step-1', text: `${question} step one` }] },
    proposals: [],
  }
}

const blood = treeDetail('PDT-hb__blood-spin', 'hb__blood-spin', 'Which blood prep?')
const tissue = treeDetail('PDT-hb__tissue-spin', 'hb__tissue-spin', 'Which tissue prep?')

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/ingestion/vendor-pdf/VPDF-HB1']}>
      <Routes>
        <Route path="/ingestion/vendor-pdf/:recordId" element={<VendorPdfReviewPage embedded />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  getRecordMock.mockReset()
  getIntakeReviewMock.mockReset()
  realizeMock.mockReset()
  getRecordMock.mockResolvedValue(record)
})

afterEach(() => cleanup())

describe('handbook tree selector', () => {
  it('offers one option per tree when the artifact backs several, and switches the panel', async () => {
    getIntakeReviewMock.mockResolvedValue({
      matchVia: 'sha256',
      artifact: { recordId: 'VPDF-HB1', title: record.payload.title, storedPath: null, sha256: 'aa' },
      candidate: blood.candidate,
      count: 2,
      trees: [blood, tissue],
      // Compat mirrors of trees[0]:
      tree: blood.tree,
      proposals: blood.proposals,
    })
    renderPage()

    const select = await screen.findByTestId('vpdf-tree-select')
    expect(select).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]!.textContent).toContain('blood-spin')
    expect(options[1]!.textContent).toContain('tissue-spin')

    // First render shows tree[0]'s question.
    expect(await screen.findByText(/Which blood prep\?/)).toBeInTheDocument()

    // Switch to the tissue protocol: the panel follows the selection.
    fireEvent.change(select, { target: { value: '1' } })
    await waitFor(() => expect(screen.getByText(/Which tissue prep\?/)).toBeInTheDocument())
    expect(screen.queryByText(/Which blood prep\?/)).not.toBeInTheDocument()
  })

  it('renders NO selector for a single-tree artifact (legacy shape, no trees field)', async () => {
    getIntakeReviewMock.mockResolvedValue({
      matchVia: 'sha256',
      artifact: { recordId: 'VPDF-HB1', title: null, storedPath: null, sha256: 'aa' },
      candidate: blood.candidate,
      tree: blood.tree,
      proposals: blood.proposals,
    })
    renderPage()

    expect(await screen.findByText(/Which blood prep\?/)).toBeInTheDocument()
    expect(screen.queryByTestId('vpdf-tree-select')).not.toBeInTheDocument()
  })

  it('count:1 with trees present still renders no selector', async () => {
    getIntakeReviewMock.mockResolvedValue({
      matchVia: 'sha256',
      artifact: { recordId: 'VPDF-HB1', title: null, storedPath: null, sha256: 'aa' },
      candidate: blood.candidate,
      count: 1,
      trees: [blood],
      tree: blood.tree,
      proposals: blood.proposals,
    })
    renderPage()

    expect(await screen.findByText(/Which blood prep\?/)).toBeInTheDocument()
    expect(screen.queryByTestId('vpdf-tree-select')).not.toBeInTheDocument()
  })
})
