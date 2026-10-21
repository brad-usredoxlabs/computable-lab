/**
 * VPDF-4 — the review page tells the truth about a failed extraction.
 *
 * The server-side truthful terminal stage (ProtocolBuilderStreamTruthful)
 * rides events the page ALREADY handles: `stage` sets the stage line, `error`
 * sets the alert, `chunk-done` writes the log. What this suite pins is the
 * client half of the acceptance:
 *  - a zero-parsed run shows `Last stage: Extraction failed: …` AND the
 *    role="alert" with the N-chunk message, and "Extraction complete" appears
 *    NOWHERE on that run;
 *  - a chunk-done with `preview` renders the raw tail in the reasoning log;
 *  - a `done` whose candidate has zero steps never says "Extraction complete"
 *    (the belt; the server no longer sends such a done, the page still refuses
 *    to paint it).
 *
 * Mock-event pattern mirrors VendorPdfReviewPage.wave2.test.tsx.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const getRecordMock = vi.fn()
const getIntakeReviewMock = vi.fn()
const listRecordsByKindMock = vi.fn()
const extractProtocolStreamMock = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    getIntakeReview: (...args: unknown[]) => getIntakeReviewMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
    updateRecord: vi.fn(),
    createRecord: vi.fn(),
    vendorPdfBlobUrl: (recordId: string) => `/api/vendor-pdfs/${recordId}/pdf`,
    semanticDraft: vi.fn(),
    refreshIntakeTrees: vi.fn(),
    getEditorDraftProjection: () => Promise.reject(new Error('no projection in test')),
    realizeIntakeBranch: vi.fn(),
    extractProtocolStream: (...args: unknown[]) => extractProtocolStreamMock(...args),
    getExtractionOptions: vi.fn(),
  },
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({ promise: Promise.reject(new Error('no pdf in test')), destroy: () => {} }),
  GlobalWorkerOptions: {},
}))

import { VendorPdfReviewPage } from './VendorPdfReviewPage'

const VPDF_ID = 'VPDF-ABCDEF012345'

const vpdfRecord = {
  recordId: VPDF_ID,
  schemaId: 'vendor-pdf',
  payload: {
    kind: 'vendor-pdf',
    recordId: VPDF_ID,
    title: 'Genomic DNA Extraction - PureLink',
    extractedText: [
      { pageNumber: 1, text: 'Genomic DNA Extraction - PureLink | Thermo Fisher Scientific - US' },
    ],
  },
  meta: { kind: 'vendor-pdf', contentSha: 'vpdf-sha' },
}

// The page's questions machinery needs the real intake-review shape (the
// wave2 fixture) — a bare {questions,trees} crashes activeReview.tree.axes.
function intakeReview() {
  return {
    matchVia: 'sha256',
    artifact: { recordId: VPDF_ID, title: 'PureLink', storedPath: null, sha256: 'aa' },
    candidate: {
      documentId: VPDF_ID,
      title: 'PureLink',
      steps: [{ stepId: 'step-1', ordinal: 1, label: 'Lyse', description: '', gatedByAxisIds: [], gatedByQuestions: [], branches: [], provenancePages: [1] }],
      roles: { materials: [], labware: [], equipment: [] },
    },
    tree: {
      recordId: 'PDT-purelink',
      documentId: 'purelink',
      axes: [],
      scaleAxis: { question: 'Scale', options: [] },
      generatedAt: '2026-10-21T00:00:00.000Z',
    },
    proposals: [],
  }
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={[`/ingestion/vendor-pdf/${VPDF_ID}`]}>
      <Routes>
        <Route path="/ingestion/vendor-pdf/:recordId" element={<VendorPdfReviewPage embedded />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
  getRecordMock.mockReset()
  getIntakeReviewMock.mockReset()
  listRecordsByKindMock.mockReset()
  extractProtocolStreamMock.mockReset()
  getRecordMock.mockImplementation((recordId: string) =>
    Promise.resolve(recordId === VPDF_ID ? vpdfRecord : null),
  )
  getIntakeReviewMock.mockResolvedValue(intakeReview())
  listRecordsByKindMock.mockImplementation(() => Promise.resolve({ records: [], total: 0 }))
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

async function clickExtract() {
  renderPage()
  const extract = await screen.findByTestId('vpdf-extract')
  fireEvent.click(extract)
}

describe('VPDF-4 (1): a zero-parsed run paints FAILED, never "complete"', () => {
  it('stage-FAILED + error events -> the alert names the chunk count, the status line says Extraction failed, and "Extraction complete" appears nowhere', async () => {
    extractProtocolStreamMock.mockImplementation((_body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: 'start', model: 'm', chunks: 2, characters: 12000, thinkingLevel: '', thinkingParams: {} })
      opts.onEvent({ type: 'stage', index: 1, total: 2, message: 'Extracting chunk 1 of 2 (9,927 characters)' })
      opts.onEvent({ type: 'reasoning', index: 1, text: 'Let me think…' })
      opts.onEvent({ type: 'chunk-done', index: 1, parsed: false, steps: 0, elapsedMs: 43000, preview: 'HEAD … TAIL — chunk answer was truncated (finish_reason \'length\'). Raise the configured maxTokens' })
      opts.onEvent({ type: 'stage', index: 2, total: 2, message: 'Extraction failed: no parseable candidate in 2 chunk(s)' })
      opts.onEvent({ type: 'error', message: 'Extraction failed: no parseable candidate in 2 chunk(s) — every chunk produced reasoning or text without a parseable JSON candidate; see the raw-tail previews above.', index: 2 })
      return Promise.resolve()
    })
    await clickExtract()

    const alert = await screen.findByTestId('extraction-error')
    expect(alert.textContent).toContain('Extraction failed: no parseable candidate in 2 chunk(s)')
    expect(alert.getAttribute('role')).toBe('alert')

    await waitFor(() => {
      const status = screen.getByTestId('extraction-status')
      expect(status.textContent).toContain('Last stage: Extraction failed: no parseable candidate in 2 chunk(s)')
    })
    expect(document.body.textContent).not.toContain('Extraction complete')
  })

  it('the raw-tail preview renders in the reasoning log (diagnostics survive)', async () => {
    extractProtocolStreamMock.mockImplementation((_body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: 'start', model: 'm', chunks: 1, characters: 100, thinkingLevel: '', thinkingParams: {} })
      opts.onEvent({ type: 'stage', index: 1, total: 1, message: 'Extracting chunk 1 of 1 (100 characters)' })
      opts.onEvent({ type: 'chunk-done', index: 1, parsed: false, steps: 0, elapsedMs: 1000, preview: 'HEADFRAGMENT … TAILFRAGMENT' })
      opts.onEvent({ type: 'stage', index: 1, total: 1, message: 'Extraction failed: no parseable candidate in 1 chunk(s)' })
      opts.onEvent({ type: 'error', message: 'Extraction failed: no parseable candidate in 1 chunk(s)', index: 1 })
      return Promise.resolve()
    })
    await clickExtract()

    const reasoning = await screen.findByTestId('extraction-reasoning')
    await waitFor(() => {
      expect(reasoning.textContent).toContain('HEADFRAGMENT … TAILFRAGMENT')
    })
  })
})

describe('VPDF-4 (1 belt): a done with zero steps never says "Extraction complete"', () => {
  it('done with candidate.steps === [] paints the zero-steps failure line instead', async () => {
    extractProtocolStreamMock.mockImplementation((_body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: 'start', model: 'm', chunks: 1, characters: 100, thinkingLevel: '', thinkingParams: {} })
      opts.onEvent({ type: 'chunk-done', index: 1, parsed: true, steps: 0, elapsedMs: 1000 })
      opts.onEvent({
        type: 'done',
        candidate: { kind: 'vendor-protocol-candidate', title: 'Nothing', steps: [] },
        source: {},
        document: {},
        elapsedMs: 1000,
      })
      return Promise.resolve()
    })
    await clickExtract()

    await waitFor(() => {
      const status = screen.getByTestId('extraction-status')
      expect(status.textContent).toContain('Last stage: Extraction failed: candidate has zero steps')
    })
    expect(document.body.textContent).not.toContain('Extraction complete')
  })

  it('a parsed done still says Extraction complete (the happy path stays truthful)', async () => {
    extractProtocolStreamMock.mockImplementation((_body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      opts.onEvent({ type: 'start', model: 'm', chunks: 1, characters: 100, thinkingLevel: '', thinkingParams: {} })
      opts.onEvent({ type: 'chunk-done', index: 1, parsed: true, steps: 3, elapsedMs: 1000 })
      opts.onEvent({
        type: 'done',
        candidate: { kind: 'vendor-protocol-candidate', title: 'Kit', steps: [{ stepNumber: 1, text: 'Lyse.' }] },
        source: {},
        document: {},
        elapsedMs: 1000,
      })
      return Promise.resolve()
    })
    await clickExtract()

    await waitFor(() => {
      const status = screen.getByTestId('extraction-status')
      expect(status.textContent).toContain('Last stage: Extraction complete')
    })
    expect(document.body.textContent).not.toContain('Extraction failed')
  })
})
