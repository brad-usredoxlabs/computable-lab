/**
 * FAME-3 W5 — RED-first at the mount level: on the /analysis mount the chat
 * must (a) reach the record-drafting flow with a record_draft_proposal frame
 * (AnalysisChatPanel registers onRecordDraftProposal ->
 * flow.proposeWorkstate('record-drafting', intent) — the SAME adapter-parameter
 * discipline AiTabPanel.tsx:884 already uses; the frame handler EXISTS on the
 * generic stack (useAiChat.ts:709) and is merely UNWIRED at this mount), and
 * (b) thread the ACTIVE RUN identity (runId + revisionRef id) into the outgoing
 * aiContext.surfaceContext — the spec §10 W5 "analysis surfaceContext {}" gap
 * (bait #8: the chat leg cannot resolve a peak into a compound without the W5
 * context plumb).
 *
 * Pre-fix (RED):
 *  (a) NO onRecordDraftProposal at this mount => the record_draft_proposal frame
 *      surfaces a NAMED system bubble ("cannot show proposal cards yet") and the
 *      flow is NEVER called. W5 pins the bubble DISAPPEARS into a card
 *      (proposeWorkstate('record-drafting', <verbatim intent>)).
 *  (b) surfaceContext is {} (AnalysisChatPanel.tsx:37) — the active run identity
 *      is not threaded; the outgoing streamAssist context carries no run id.
 *
 * Conventions mirror AnalysisChatPanel.analysisProposal.test.tsx (the flow hook
 * is SPYED at its module — the spec-preferred seam; the assertion is the exact
 * (adapter, verbatim intent) call, not card rendering) and the analysisProposal
 * test's streamAssist frame mock.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { AnalysisChatPanel } from './AnalysisChatPanel'
import { streamAssist } from '../shared/api/aiClient'

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

// Spy the flow hook at its module (the spec-preferred seam, copied from the
// analysisProposal test): the mount-level assertion is
// proposeWorkstate('record-drafting', <verbatim intent>).
const mocks = vi.hoisted(() => ({
  proposeWorkstate: vi.fn(),
  handleAgentAction: vi.fn(),
  rejectWorkstate: vi.fn(),
}))

vi.mock('../shared/ai/useWorkstateProposalFlow', () => ({
  useWorkstateProposalFlow: () => ({
    card: null,
    proposeWorkstate: mocks.proposeWorkstate,
    acceptWorkstate: vi.fn(),
    rejectWorkstate: mocks.rejectWorkstate,
    handleAgentAction: mocks.handleAgentAction,
  }),
}))

// The VERBATIM server frame (the W6 edit-record arm's proposal; envelope shape
// per the recordDraft tool-def property — operation + term + fields ONLY).
// FAME-3 D1 (adv-review D1): the envelope is additionalProperties:false and
// carries NO target (only operation/requestId/kind/fields/term are legal).
// The edit target is a compile REQUEST-BODY channel (body.target.recordId),
// relayed by the flow as a THIRD proposeWorkstate argument — it never rides
// inside the recordDraft frame.
const RECORD_DRAFT_FRAME = {
  type: 'record_draft_proposal',
  recordDraft: {
    operation: 'edit-record',
    term: 'FAME-LOCAL:methyl-octanoate-n8',
    fields: { label: 'C8:0 (octanoic acid) FAME peak 7', expected_rt_min: 19.0624, rt_window_min: 0.2 },
  },
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AnalysisChatPanel — record_draft_proposal reaches the flow (FAME-3 W5)', () => {
  it('a record_draft_proposal frame calls flow.proposeWorkstate with adapter "record-drafting" and the verbatim intent (the named bubble disappears into a card)', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield RECORD_DRAFT_FRAME as never
      yield { type: 'done', result: { success: true, notes: ['Proposed a record edit — review the card; nothing was written.'] } } as never
    })

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'assign the FAME peak at 19 minutes to octanoate' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    await waitFor(() => expect(mocks.proposeWorkstate).toHaveBeenCalledTimes(1), { timeout: 3000 })
    // FAME-3 D1: the frame is relayed VERBATIM (no target inside the envelope)
    // and the target argument is ABSENT (no activeRun ⇒ no method record id) —
    // a third arg of undefined, never a fabricated target.
    expect(mocks.proposeWorkstate).toHaveBeenCalledWith('record-drafting', RECORD_DRAFT_FRAME.recordDraft, undefined)
  })

  it('a record_draft_proposal on a run WITH a method record id forwards the gc-method id as the compile REQUEST-BODY target (body.target.recordId) — never the run id or the analysis-revision ref', async () => {
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield RECORD_DRAFT_FRAME as never
      yield { type: 'done', result: { success: true, notes: ['Proposed a record edit — review the card; nothing was written.'] } } as never
    })

    // The gc-method record id (the edit arm's NAMED target — the guard in
    // record-edit-guards.yaml is keyed to the gc-method schemaId; the run id
    // ANR-000033 and the analysis-revision ANREV-000013 would both compile to
    // EDIT_GUARD_UNDECLARED).
    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel activeRun={{ recordId: 'ANR-000033', revisionRefId: 'ANREV-000013', methodRecordId: 'GCM-FAME3-WORKING-L1T1030' }} />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'assign the FAME peak at 19 minutes to octanoate' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    await waitFor(() => expect(mocks.proposeWorkstate).toHaveBeenCalledTimes(1), { timeout: 3000 })
    expect(mocks.proposeWorkstate).toHaveBeenCalledWith('record-drafting', RECORD_DRAFT_FRAME.recordDraft, { recordId: 'GCM-FAME3-WORKING-L1T1030' })
    // The run id / analysis-revision ref never ride as the target.
    const targetArg = mocks.proposeWorkstate.mock.calls[0]?.[2]
    expect(targetArg).not.toEqual({ recordId: 'ANR-000033' })
    expect(targetArg).not.toEqual({ recordId: 'ANREV-000013' })
  })

  it('the ACTIVE RUN identity (runId + revisionRef id) rides the outgoing surfaceContext', async () => {
    const captured: Array<Record<string, unknown>> = []
    vi.mocked(streamAssist).mockImplementation(async function* (_p: string, _s: string, ctx: Record<string, unknown>) {
      captured.push(ctx)
      yield { type: 'done', result: { success: true, notes: [] } } as never
    })

    render(
      <ThemeProvider>
        <MemoryRouter>
          <AnalysisChatPanel activeRun={{ recordId: 'ANR-000033', revisionRefId: 'ANREV-000013' }} />
        </MemoryRouter>
      </ThemeProvider>,
    )

    const input = await screen.findByTestId('analysis-chat-input')
    fireEvent.change(input, { target: { value: 'what peaks does this run show' } })
    fireEvent.click(screen.getByTestId('analysis-chat-send'))

    await waitFor(() => expect(captured.length).toBeGreaterThan(0), { timeout: 3000 })
    // contextPayload = { ...surfaceContext } (useAiChat.ts:572); the active-run
    // identity is threaded, not invented.
    expect(captured[0]).toMatchObject({
      activeRunId: 'ANR-000033',
      activeRevisionRefId: 'ANREV-000013',
    })
  })
})
