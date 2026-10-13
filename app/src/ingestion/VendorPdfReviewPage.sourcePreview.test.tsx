/**
 * DOCINGEST-A A7 — the SAID pane previews the REAL source, keyed on
 * source.mediaKind, with today's pdf path as the default.
 *
 * Arms:
 *  - mediaKind 'text' (an uploaded lab document): the selectable extracted-
 *    text pane is FIRST-CLASS (header names the original file) and pdfjs is
 *    NEVER mounted — no canvas machinery, no blob fetch attempt.
 *  - mediaKind ABSENT (every legacy record): today's pdf path exactly —
 *    pdfjs getDocument runs and the pdf/text machinery behaves as before.
 *    A legacy VPDF record that goes blank is the exact EDITOR-era failure
 *    mode this pins out (spec bait 12).
 *  - mediaKind 'image' (reserved for Stage B): renders via today's pdf
 *    fallback until Stage B's endpoint exists.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const getRecordMock = vi.fn()
const getIntakeReviewMock = vi.fn()
const listRecordsByKindMock = vi.fn()
const getDocumentMock = vi.fn()
const blobUrlMock = vi.fn((recordId: string) => (recordId ? `/api/vendor-pdfs/${recordId}/pdf` : ''))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    getIntakeReview: (...args: unknown[]) => getIntakeReviewMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
    updateRecord: vi.fn(),
    createRecord: vi.fn(),
    vendorPdfBlobUrl: (recordId: string) => blobUrlMock(recordId),
    semanticDraft: vi.fn(),
    getEditorDraftProjection: () => Promise.reject(new Error('no projection in test')),
    realizeIntakeBranch: vi.fn(),
    extractProtocolStream: vi.fn(),
    getExtractionOptions: vi.fn(),
  },
}))

vi.mock('pdfjs-dist', () => ({
  getDocument: (...args: unknown[]) => getDocumentMock(...args),
  GlobalWorkerOptions: {},
}))

import { VendorPdfReviewPage } from './VendorPdfReviewPage'

const VPDF_ID = 'VPDF-MDTEXT012345'

function envelope(source: Record<string, unknown> | undefined, extractedText: Array<{ pageNumber: number; text: string }>) {
  return {
    recordId: VPDF_ID,
    schemaId: 'vendor-pdf',
    payload: {
      kind: 'vendor-pdf',
      recordId: VPDF_ID,
      title: 'Lysis protocol (lab-authored)',
      state: 'ingested',
      ...(source ? { source } : {}),
      extractedText,
    },
    meta: { kind: 'vendor-pdf', contentSha: 'vpdf-sha' },
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
  getDocumentMock.mockReset()
  // A pdfjs document that jsdom cannot paint: today's pdf path resolves the
  // document, then the canvas render fails and the page falls back to the
  // text pane. The spy call count is what this suite pins. Built lazily so a
  // text-kind test (which must never call getDocument) creates no orphan
  // rejected promise.
  getDocumentMock.mockImplementation(() => ({
    promise: new Promise<never>((_, reject) => reject(new Error('no pdf in test'))),
    destroy: () => {},
  }))
  getIntakeReviewMock.mockRejectedValue(new Error('404 in test'))
  listRecordsByKindMock.mockResolvedValue({ records: [] })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('review pane source preview (source.mediaKind)', () => {
  it('mediaKind "text": selectable extracted text is first-class, the header names the original file, and pdfjs is NEVER mounted', async () => {
    getRecordMock.mockResolvedValue(
      envelope(
        {
          engine: 'upload',
          ingestedAt: '2026-10-13T12:00:00.000Z',
          mediaKind: 'text',
          originalFileName: 'lysis.md',
          pageCount: 1,
        },
        [{ pageNumber: 1, text: '# Lysis protocol\n\n1. Add 500 uL of buffer.' }],
      ),
    )

    renderPage()

    const textPane = await screen.findByTestId('vpdf-review-text')
    expect(textPane.textContent).toContain('Lysis protocol')
    expect(textPane.textContent).toContain('Add 500 uL of buffer.')
    // First-class: the pane names the ORIGINAL file the user uploaded.
    expect(textPane.textContent).toContain('lysis.md')
    // No pdfjs machinery at all — not even a blob fetch attempt.
    expect(getDocumentMock, 'a text-kind record must never mount pdfjs').not.toHaveBeenCalled()
    expect(document.querySelector('canvas'), 'no pdf canvas may exist for a text-kind record').toBeNull()
  })

  it("mediaKind ABSENT (legacy record): today's pdf path exactly — pdfjs runs, no blankout", async () => {
    getRecordMock.mockResolvedValue(
      envelope(
        { engine: 'exa', url: 'https://vendor.example/protocol.pdf', ingestedAt: '2026-10-01T12:00:00.000Z', pageCount: 2 },
        [{ pageNumber: 1, text: 'Page one: kit overview.' }],
      ),
    )

    renderPage()

    await waitFor(() => expect(getDocumentMock).toHaveBeenCalledTimes(1), { timeout: 2000 })
    // Today's behavior: the pdf attempt happens, and the existing text
    // fallback renders when the blob cannot be painted in jsdom.
    await screen.findByTestId('vpdf-review-text')
  })

  it('mediaKind "image" (Stage B reserved): renders via the pdf fallback, not a blank pane', async () => {
    getRecordMock.mockResolvedValue(
      envelope(
        { engine: 'upload', ingestedAt: '2026-10-13T12:00:00.000Z', mediaKind: 'image', originalFileName: 'page.jpg' },
        [{ pageNumber: 1, text: 'OCR text placeholder.' }],
      ),
    )

    renderPage()

    // Until Stage B's page-image endpoint exists, an image-kind record takes
    // today's pdf path (getDocument runs; the text fallback covers the gap).
    await waitFor(() => expect(getDocumentMock).toHaveBeenCalledTimes(1), { timeout: 2000 })
    await screen.findByTestId('vpdf-review-text')
  })

  it('text-kind record WITH extractionDiagnostics: the honest diagnostic renders in the pane — never a blank success', async () => {
    // S5 state: a .docx stored on a host without its reader. The record is
    // stored (that is the accepted state) and the pane says WHY the text is
    // empty, instead of presenting a blank successful-looking document.
    const env = envelope(
      {
        engine: 'upload',
        ingestedAt: '2026-10-13T12:00:00.000Z',
        mediaKind: 'text',
        originalFileName: 'demo-sop.docx',
      },
      [{ pageNumber: 1, text: '' }],
    ) as Record<string, unknown> & { payload: Record<string, unknown> }
    env.payload.extractionDiagnostics = [
      { severity: 'error', code: 'DOCX_TOOL_MISSING', message: 'The configured DOCX reader "pandoc" is not installed on this host. Install it, or clear the field and paste the text.' },
    ]
    getRecordMock.mockResolvedValue(env)

    renderPage()

    const textPane = await screen.findByTestId('vpdf-review-text')
    expect(textPane.textContent).toContain('demo-sop.docx')
    const diag = await screen.findByTestId('vpdf-review-diagnostics')
    expect(diag.textContent).toContain('DOCX reader')
    expect(diag.textContent).toContain('not installed')
  })

  it("text-kind record WITHOUT diagnostics keeps today's empty-text hint (no phantom diagnostic UI)", async () => {
    getRecordMock.mockResolvedValue(
      envelope(
        { engine: 'upload', ingestedAt: '2026-10-13T12:00:00.000Z', mediaKind: 'text', originalFileName: 'empty.md' },
        [{ pageNumber: 1, text: '' }],
      ),
    )
    renderPage()
    await screen.findByTestId('vpdf-review-text')
    expect(screen.queryByTestId('vpdf-review-diagnostics')).toBeNull()
  })

  it('mediaKind "spreadsheet": selectable text like the text arm (no pdfjs)', async () => {
    getRecordMock.mockResolvedValue(
      envelope(
        { engine: 'upload', ingestedAt: '2026-10-13T12:00:00.000Z', mediaKind: 'spreadsheet', originalFileName: 'plate.xlsx' },
        [{ pageNumber: 1, text: '## Sheet: Plate\ncompound\tdose' }],
      ),
    )

    renderPage()

    const textPane = await screen.findByTestId('vpdf-review-text')
    expect(textPane.textContent).toContain('plate.xlsx')
    expect(textPane.textContent).toContain('compound')
    expect(getDocumentMock).not.toHaveBeenCalled()
  })
})
