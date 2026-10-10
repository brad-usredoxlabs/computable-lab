/**
 * W2-8 T1 — the wave-2 composition of /ingestion/vendor-pdf/:recordId
 * (spec §3 W1, §5 A1/A4/A6, §6.1 T1).
 *
 * Wave-2 is a DATA state (a semantic draft exists for this artifact), never a
 * URL fork. With a draft: left = SAID (PDF/text + read-only SaidFactsPane),
 * right = SemanticDraftPanel over candidates[0].draft. Without one: the
 * affordance button that runs the merged W2-6 semantic pass on the CAN-*
 * candidate (M1). Either way: NO literal-step completion on this route.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const getRecordMock = vi.fn()
const getIntakeReviewMock = vi.fn()
const listRecordsByKindMock = vi.fn()
const updateRecordMock = vi.fn()
const createRecordMock = vi.fn()
const semanticDraftMock = vi.fn()
const blobUrlMock = vi.fn((recordId: string) => (recordId ? `/api/vendor-pdfs/${recordId}/pdf` : ''))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: (...args: unknown[]) => getRecordMock(...args),
    getIntakeReview: (...args: unknown[]) => getIntakeReviewMock(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindMock(...args),
    updateRecord: (...args: unknown[]) => updateRecordMock(...args),
    createRecord: (...args: unknown[]) => createRecordMock(...args),
    vendorPdfBlobUrl: (recordId: string) => blobUrlMock(recordId),
    semanticDraft: (...args: unknown[]) => semanticDraftMock(...args),
    getEditorDraftProjection: () => Promise.reject(new Error('no projection in test')),
    realizeIntakeBranch: vi.fn(),
    extractProtocolStream: vi.fn(),
    getExtractionOptions: vi.fn(),
  },
}))

vi.mock('pdfjs-dist', () => ({
  // A blob URL that pdfjs cannot load makes the page fall back to the
  // plain-text pane — the same data-vpdf-page machinery the anchor jump uses.
  getDocument: () => ({ promise: Promise.reject(new Error('no pdf in test')), destroy: () => {} }),
  GlobalWorkerOptions: {},
}))

import { VendorPdfReviewPage } from './VendorPdfReviewPage'

const VPDF_ID = 'VPDF-ABCDEF012345'
const CAN_ID = 'CAN-w28-demo'
const XDR_ID = 'XDR-semantic-demo0001'

const vpdfRecord = {
  recordId: VPDF_ID,
  schemaId: 'vendor-pdf',
  payload: {
    kind: 'vendor-pdf',
    recordId: VPDF_ID,
    title: 'ZymoBIOMICS 96 MagBead DNA Kit',
    extractedText: [
      { pageNumber: 1, text: 'Page one: kit overview.' },
      { pageNumber: 2, text: 'Page two: sample prep.' },
    ],
    vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID },
  },
  meta: { kind: 'vendor-pdf', contentSha: 'vpdf-sha' },
}

const saidCandidate = {
  recordId: CAN_ID,
  schemaId: 'vpc',
  payload: {
    kind: 'vendor-protocol-candidate',
    title: 'ZymoBIOMICS 96 MagBead DNA Kit',
    source: { documentId: VPDF_ID, filename: 'zymo.pdf', pageCount: 31 },
    sections: [{ id: 'section-protocol', kind: 'protocol', title: 'Protocol', provenance: { documentId: VPDF_ID, pageStart: 2 } }],
    materials: [{ id: 'm1', label: 'MagBead Beads', sourceText: 'MagBead Beads', provenance: { documentId: VPDF_ID, pageStart: 2 }, confidence: 1 }],
    equipment: [],
    labware: [],
    steps: [
      { id: 'step-1', stepNumber: 1, sourceText: 'Add sample.', actions: [], conditions: [], materials: [], labware: [], equipment: [], notes: [], branches: [], provenance: { documentId: VPDF_ID, pageStart: 2 }, confidence: 1 },
    ],
    tables: [],
    notes: [],
    outputs: [],
    diagnostics: [],
  },
  meta: { kind: 'vendor-protocol-candidate', contentSha: 'can-sha' },
}

function semanticDraftEnvelope() {
  return {
    recordId: XDR_ID,
    schemaId: 'xdr',
    payload: {
      kind: 'extraction-draft',
      recordId: XDR_ID,
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
                stepId: 'step-lyse-a',
                label: 'Lyse (variant a)',
                ordinal: 2,
                kind: 'other',
                intent: {
                  semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-beat' } },
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 3 }],
                },
              },
              {
                stepId: 'step-lyse-b',
                label: 'Lyse (variant b)',
                ordinal: 3,
                kind: 'other',
                intent: {
                  semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'verb-thaw' } },
                  provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: CAN_ID, pageStart: 99 }],
                },
              },
            ],
            branch_axes: [
              {
                axisId: 'lysis-method',
                label: 'Which lysis method?',
                conditions: [
                  { id: 'bead-beater', label: 'Bead beater', predicate: {}, then_stepIds: ['step-lyse-a'] },
                  { id: 'freeze-thaw', label: 'Freeze-thaw', predicate: {}, then_stepIds: ['step-lyse-b'] },
                ],
              },
            ],
          },
        },
      ],
      status: 'pending_review',
    },
    meta: { kind: 'extraction-draft', contentSha: 'xdr-sha' },
  }
}

function intakeReview() {
  return {
    matchVia: 'sha256',
    artifact: { recordId: VPDF_ID, title: 'ZymoBIOMICS', storedPath: null, sha256: 'aa' },
    candidate: {
      documentId: VPDF_ID,
      title: 'ZymoBIOMICS',
      steps: [{ stepId: 'step-1', ordinal: 1, label: 'Add sample', description: '', gatedByAxisIds: [], gatedByQuestions: [], branches: [], provenancePages: [2] }],
      roles: { materials: [], labware: [], equipment: [] },
    },
    tree: {
      recordId: 'PDT-zymo',
      documentId: 'zymo',
      axes: [{ axisId: 'lysis-method', question: 'Which lysis method?', choiceKey: '$.branchSelection.lysis-method', origin: 'document_branch', conditions: [] }],
      scaleAxis: { question: 'Scale', options: [] },
      generatedAt: '2026-10-10T00:00:00.000Z',
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
  // jsdom implements no scrollIntoView; the anchor machinery needs it present.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = vi.fn()
  }
  getRecordMock.mockReset()
  getIntakeReviewMock.mockReset()
  listRecordsByKindMock.mockReset()
  updateRecordMock.mockReset()
  createRecordMock.mockReset()
  semanticDraftMock.mockReset()
  getRecordMock.mockImplementation((recordId: string) => {
    if (recordId === VPDF_ID) return Promise.resolve(vpdfRecord)
    if (recordId === CAN_ID) return Promise.resolve(saidCandidate)
    return Promise.resolve(null)
  })
  getIntakeReviewMock.mockResolvedValue(intakeReview())
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('wave-2 render — a semantic draft exists for this artifact', () => {
  beforeEach(() => {
    listRecordsByKindMock.mockImplementation((kind: string) => {
      if (kind === 'extraction-draft') return Promise.resolve({ records: [semanticDraftEnvelope()], total: 1 })
      if (kind === 'vendor-protocol-candidate') return Promise.resolve({ records: [saidCandidate], total: 1 })
      return Promise.resolve({ records: [], total: 0 })
    })
  })

  it('the right pane is the MEANT editor over candidates[0].draft (A4: all branches visible)', async () => {
    renderPage()
    const panel = await screen.findByTestId('semantic-draft-panel')
    expect(panel).toBeTruthy()
    expect(panel.textContent).toContain('Lyse (variant a)')
    expect(panel.textContent).toContain('Lyse (variant b)')
  })

  it('the left pane carries the read-only SAID facts (A1)', async () => {
    renderPage()
    expect(await screen.findByTestId('said-facts')).toBeTruthy()
    expect(await screen.findByText('MagBead Beads')).toBeTruthy()
  })

  it('NO literal-step action exists on the route (A6): no save / save-as / use-extracted', async () => {
    renderPage()
    await screen.findByTestId('semantic-draft-panel')
    expect(screen.queryByTestId('vpdf-save')).toBeNull()
    expect(screen.queryByTestId('vpdf-save-as')).toBeNull()
    expect(screen.queryByTestId('vpdf-save-actions')).toBeNull()
    expect(screen.queryByTestId('vpdf-use-extracted')).toBeNull()
    expect(screen.queryByTestId('vpdf-saveas-modal')).toBeNull()
  })

  it('NO extraction-time questions on the route (A4): BranchQuestionsPanel is gone', async () => {
    renderPage()
    await screen.findByTestId('semantic-draft-panel')
    expect(screen.queryByTestId('branch-questions')).toBeNull()
    expect(screen.queryByTestId('vpdf-tree-select')).toBeNull()
  })

  it('no editable candidate controls remain (A1: overrides path retired)', async () => {
    renderPage()
    await screen.findByTestId('semantic-draft-panel')
    expect(screen.queryByTestId('candidate-preview')).toBeNull()
    expect(document.body.querySelectorAll('.vpdf-review__left input').length).toBe(0)
  })

  it('a semantic-evidence chip jumps the left pane (A2: data-vpdf-page machinery)', async () => {
    renderPage()
    const chip = await screen.findByTestId('semantic-evidence-step-lyse')
    const scrollSpy = vi.fn()
    const target = document.querySelector('[data-vpdf-page="2"]') as HTMLElement
    target.scrollIntoView = scrollSpy
    fireEvent.click(chip)
    expect(scrollSpy).toHaveBeenCalled()
  })

  it('an out-of-range anchor is disabled, not a crash (bait 7)', async () => {
    renderPage()
    const chip = (await screen.findByTestId('semantic-evidence-step-lyse-b')) as HTMLButtonElement
    expect(chip.disabled).toBe(true)
  })

  it('the SAID is never written: no updateRecord/createRecord ever targets a VPDF-* or CAN-* id (A1)', async () => {
    renderPage()
    const panel = await screen.findByTestId('semantic-draft-panel')
    // Poke every control the left pane offers.
    for (const button of Array.from(document.querySelectorAll('.vpdf-review__left button'))) {
      fireEvent.click(button)
    }
    const save = panel.querySelector('[data-testid="semantic-draft-save"]') as HTMLButtonElement
    expect(save.disabled).toBe(true)
    expect(updateRecordMock).not.toHaveBeenCalled()
    expect(createRecordMock).not.toHaveBeenCalled()
  })
})

describe('no-draft state — the affordance rides the merged W2-6 endpoint (M1/OQ1 (a))', () => {
  beforeEach(() => {
    listRecordsByKindMock.mockImplementation((kind: string) => {
      if (kind === 'extraction-draft') return Promise.resolve({ records: [], total: 0 })
      if (kind === 'vendor-protocol-candidate') return Promise.resolve({ records: [saidCandidate], total: 1 })
      return Promise.resolve({ records: [], total: 0 })
    })
  })

  it('offers "Draft the semantic protocol" and passes the CAN-* candidate id (NOT the VPDF id)', async () => {
    semanticDraftMock.mockResolvedValue({ recordId: XDR_ID, diagnostics: [] })
    renderPage()
    const button = await screen.findByTestId('vpdf-semantic-draft')
    fireEvent.click(button)
    await waitFor(() => expect(semanticDraftMock).toHaveBeenCalledWith(CAN_ID))
    // The affordance never passes the route's VPDF id.
    expect(semanticDraftMock.mock.calls[0]![0]).not.toBe(VPDF_ID)
  })

  it('after the pass lands, the same render shows the MEANT editor (data state, no URL fork)', async () => {
    let drafts: Array<Record<string, unknown>> = []
    listRecordsByKindMock.mockImplementation((kind: string) => {
      if (kind === 'extraction-draft') return Promise.resolve({ records: drafts, total: drafts.length })
      if (kind === 'vendor-protocol-candidate') return Promise.resolve({ records: [saidCandidate], total: 1 })
      return Promise.resolve({ records: [], total: 0 })
    })
    semanticDraftMock.mockImplementation(() => {
      drafts = [semanticDraftEnvelope()]
      return Promise.resolve({ recordId: XDR_ID, diagnostics: [] })
    })
    renderPage()
    const button = await screen.findByTestId('vpdf-semantic-draft')
    fireEvent.click(button)
    await screen.findByTestId('semantic-draft-panel')
    expect(screen.queryByTestId('vpdf-semantic-draft')).toBeNull()
  })

  it('a failed pass shows the server error verbatim and keeps the affordance', async () => {
    semanticDraftMock.mockRejectedValue(new Error('SEMANTIC_PASS_UNAVAILABLE: Semantic pass is not configured (no ai.inference endpoint)'))
    renderPage()
    const button = await screen.findByTestId('vpdf-semantic-draft')
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByTestId('vpdf-semantic-draft-error').textContent).toContain('SEMANTIC_PASS_UNAVAILABLE'))
    expect(screen.getByTestId('vpdf-semantic-draft')).toBeTruthy()
  })

  it('with no candidate AND no draft, the route offers no literal completion either (A6)', async () => {
    listRecordsByKindMock.mockImplementation((kind: string) =>
      Promise.resolve({ records: kind === 'extraction-draft' ? [] : [], total: 0 }),
    )
    getRecordMock.mockImplementation((recordId: string) =>
      Promise.resolve(recordId === VPDF_ID ? { ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: undefined } } : null),
    )
    renderPage()
    await screen.findByTestId('vpdf-review')
    // No literal-step completion, no editable candidate — the pre-draft state
    // keeps only the extraction progress panel and the intake questions read
    // model (which produce no protocol at all).
    expect(screen.queryByTestId('vpdf-save')).toBeNull()
    expect(screen.queryByTestId('vpdf-save-as')).toBeNull()
    expect(screen.queryByTestId('vpdf-use-extracted')).toBeNull()
    expect(screen.queryByTestId('vpdf-save-actions')).toBeNull()
    expect(screen.queryByTestId('candidate-preview')).toBeNull()
    expect(screen.queryByTestId('vpdf-semantic-draft')).toBeNull()
  })
})
