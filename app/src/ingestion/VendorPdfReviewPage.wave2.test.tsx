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
const refreshIntakeTreesMock = vi.fn()
const extractProtocolStreamMock = vi.fn()
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
    refreshIntakeTrees: (...args: unknown[]) => refreshIntakeTreesMock(...args),
    getEditorDraftProjection: () => Promise.reject(new Error('no projection in test')),
    realizeIntakeBranch: vi.fn(),
    extractProtocolStream: (...args: unknown[]) => extractProtocolStreamMock(...args),
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
  refreshIntakeTreesMock.mockReset()
  extractProtocolStreamMock.mockReset()
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

/**
 * VPDF-3 — the honest extraction ladder on this route.
 * (4) button truth + post-extract loop; (5) stale-ref honesty; (2) staleness
 * banner read from the written diagnostic; (6) the gap line carries a real
 * affordance (the intake runner), never an instruction with no button.
 */
describe('VPDF-3 (4): the button says "Extract candidate" and the done event lights the semantic affordance', () => {
  beforeEach(() => {
    // No candidate record exists yet and no draft: the pre-extract state.
    listRecordsByKindMock.mockImplementation(() =>
      Promise.resolve({ records: [], total: 0 }),
    )
    getRecordMock.mockImplementation((recordId: string) =>
      Promise.resolve(recordId === VPDF_ID ? { ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: undefined } } : null),
    )
  })

  it('the extract button reads "Extract candidate" (one vocabulary: the entity is the candidate)', async () => {
    renderPage()
    const button = await screen.findByTestId('vpdf-extract')
    expect(button.textContent).toBe('Extract candidate')
    expect(button.textContent).not.toContain('Extract Protocol')
  })

  it('done with candidateRecordId -> the note names the CAN-* and the semantic affordance lights against it', async () => {
    const CAN_NEW = 'CAN-vendorpdf-0123456789abcdef'
    let candidates: Array<Record<string, unknown>> = []
    listRecordsByKindMock.mockImplementation(() =>
      Promise.resolve({
        records: candidates,
        total: candidates.length,
      }),
    )
    extractProtocolStreamMock.mockImplementation((_body: unknown, opts: { onEvent: (e: unknown) => void }) => {
      // The server persists the candidate BEFORE emitting done — the store
      // already names the record when the reload runs.
      candidates = [{
        recordId: CAN_NEW,
        schemaId: 'vpc',
        payload: { kind: 'vendor-protocol-candidate', title: 'Fresh', source: { documentId: VPDF_ID, filename: 'x.pdf', pageCount: 1 } },
      }]
      opts.onEvent({ type: 'done', candidate: {}, source: {}, document: {}, elapsedMs: 10, candidateRecordId: CAN_NEW })
      return Promise.resolve()
    })
    renderPage()
    const extract = await screen.findByTestId('vpdf-extract')
    fireEvent.click(extract)
    await waitFor(() => expect(screen.getByTestId('extraction-note').textContent).toContain(CAN_NEW))
    // The draftToken reload re-ran the SAID join; the affordance now rides the fresh CAN-*.
    const semantic = await screen.findByTestId('vpdf-semantic-draft', {}, { timeout: 4000 })
    semanticDraftMock.mockResolvedValue({ recordId: XDR_ID, diagnostics: [] })
    fireEvent.click(semantic)
    await waitFor(() => expect(semanticDraftMock).toHaveBeenCalledWith(CAN_NEW))
  })
})

describe('VPDF-3 (5): a vendorProtocolCandidateRef that names nothing renders honestly', () => {
  it('a non-CAN-* ghost ref (graph-lemur-*) names nothing — the SAID pane says so with the id', async () => {
    const GHOST = 'graph-lemur-6c821d307e98'
    getRecordMock.mockImplementation((recordId: string) =>
      Promise.resolve(recordId === VPDF_ID
        ? { ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: GHOST } } }
        : null),
    )
    listRecordsByKindMock.mockImplementation((kind: string) =>
      Promise.resolve({ records: kind === 'extraction-draft' ? [semanticDraftEnvelope()] : [], total: kind === 'extraction-draft' ? 1 : 0 }),
    )
    renderPage()
    const block = await screen.findByTestId('vpdf-stale-candidate-ref')
    expect(block.textContent).toContain(GHOST)
    expect(block.textContent).toContain('re-extract to mint a candidate')
  })

  it('a CAN-* ref whose record fails to load is also an honest block, not a silent fall-through', async () => {
    const MISSING = 'CAN-vendorpdf-deadbeefdeadbeef'
    getRecordMock.mockImplementation((recordId: string) => {
      if (recordId === VPDF_ID) {
        return Promise.resolve({ ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: MISSING } } })
      }
      return Promise.resolve(null) // the CAN-* names nothing loadable
    })
    listRecordsByKindMock.mockImplementation(() => Promise.resolve({ records: [], total: 0 }))
    renderPage()
    const block = await screen.findByTestId('vpdf-stale-candidate-ref')
    expect(block.textContent).toContain(MISSING)
  })

  it('a healthy CAN-* ref renders the SAID facts, not the stale block', async () => {
    renderPage()
    await screen.findByTestId('said-facts')
    expect(screen.queryByTestId('vpdf-stale-candidate-ref')).toBeNull()
  })
})

describe('VPDF-3 (2): the staleness banner reads the written diagnostic ONLY', () => {
  beforeEach(() => {
    // Default: a joined draft WITHOUT the staleness diagnostic.
    listRecordsByKindMock.mockImplementation((kind: string) => {
      if (kind === 'extraction-draft') return Promise.resolve({ records: [semanticDraftEnvelope()], total: 1 })
      if (kind === 'vendor-protocol-candidate') return Promise.resolve({ records: [saidCandidate], total: 1 })
      return Promise.resolve({ records: [], total: 0 })
    })
  })

  it('an XDR carrying CANDIDATE_SUPERSEDED_BY_REEXTRACT renders the banner above the MEANT editor', async () => {
    const flagged = semanticDraftEnvelope()
    const flaggedPayload = flagged.payload as unknown as Record<string, unknown>
    flaggedPayload.diagnostics = [{
      severity: 'warning',
      code: 'CANDIDATE_SUPERSEDED_BY_REEXTRACT',
      message: 'The candidate this draft was built from was re-extracted — re-run the semantic pass to refresh it.',
      details: { candidateRecordId: CAN_ID, supersededAt: '2026-10-20T00:00:00.000Z' },
    }]
    listRecordsByKindMock.mockImplementation((kind: string) => {
      if (kind === 'extraction-draft') return Promise.resolve({ records: [flagged], total: 1 })
      if (kind === 'vendor-protocol-candidate') return Promise.resolve({ records: [saidCandidate], total: 1 })
      return Promise.resolve({ records: [], total: 0 })
    })
    renderPage()
    const banner = await screen.findByTestId('vpdf-draft-staleness-banner')
    expect(banner.textContent).toContain('built from an older extraction')
    // Friction, not a gate: the editor still renders.
    expect(screen.getByTestId('semantic-draft-panel')).toBeTruthy()
  })

  it('an XDR without the diagnostic renders NO banner (no UI-side staleness computation)', async () => {
    renderPage()
    await screen.findByTestId('semantic-draft-panel')
    expect(screen.queryByTestId('vpdf-draft-staleness-banner')).toBeNull()
  })
})

describe('VPDF-3 (6): the no-draft gap line carries the real intake runner', () => {
  beforeEach(() => {
    // No draft, no candidate record: the legacy no-draft questions surface.
    listRecordsByKindMock.mockImplementation(() => Promise.resolve({ records: [], total: 0 }))
    getRecordMock.mockImplementation((recordId: string) =>
      Promise.resolve(recordId === VPDF_ID ? { ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: undefined } } : null),
    )
    // No attributable tree: the read model returns null (404).
    getIntakeReviewMock.mockResolvedValue(null)
  })

  it('the gap line is no longer an instruction with no affordance — a button runs the intake runner', async () => {
    refreshIntakeTreesMock.mockResolvedValue({ success: true, documentId: VPDF_ID, treeRecordId: 'PDT-x', proposalRecordIds: [], eventGraphRecordIds: [] })
    renderPage()
    const button = await screen.findByTestId('vpdf-intake-refresh')
    expect(button.textContent).toBe('Run intake on this document')
    fireEvent.click(button)
    await waitFor(() => expect(refreshIntakeTreesMock).toHaveBeenCalledWith(VPDF_ID))
  })

  it('with a candidate ref present, the runner is sent the REF documentId (what the intake service keys on)', async () => {
    const GHOST = 'graph-lemur-6c821d307e98'
    getRecordMock.mockImplementation((recordId: string) =>
      Promise.resolve(recordId === VPDF_ID
        ? { ...vpdfRecord, payload: { ...vpdfRecord.payload, vendorProtocolCandidateRef: { kind: 'record', type: 'vendor-protocol-candidate', id: GHOST } } }
        : null),
    )
    refreshIntakeTreesMock.mockResolvedValue({ success: true, documentId: GHOST, treeRecordId: 'PDT-x', proposalRecordIds: [], eventGraphRecordIds: [] })
    renderPage()
    const button = await screen.findByTestId('vpdf-intake-refresh')
    fireEvent.click(button)
    await waitFor(() => expect(refreshIntakeTreesMock).toHaveBeenCalledWith(GHOST))
  })

  it('a runner refusal shows the server message verbatim', async () => {
    refreshIntakeTreesMock.mockRejectedValue(new Error('No persisted candidate artifact for VPDF-ABCDEF012345; run a full intake instead of a refresh'))
    renderPage()
    const button = await screen.findByTestId('vpdf-intake-refresh')
    fireEvent.click(button)
    await waitFor(() => expect(screen.getByTestId('vpdf-intake-refresh-error').textContent)
      .toContain('No persisted candidate artifact for VPDF-ABCDEF012345; run a full intake instead of a refresh'))
  })
})
