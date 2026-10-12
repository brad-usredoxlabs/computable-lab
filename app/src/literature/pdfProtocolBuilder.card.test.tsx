/**
 * PB-CH-6 — the ONE approved generic consumer (OQ1 ruling):
 * app/src/literature/PdfProtocolBuilder.tsx (useAiChat endpoint 'literature',
 * surface 'protocol-builder', reached at /literature?view=build via
 * LiteratureBody.tsx). Its chat gains the proposal card by composing the SAME
 * useWorkstateProposalFlow; text chat stays unaffected.
 *
 * Pinned: a workstate_proposal frame renders the card in the right panel
 * (compiling → review → accept through the flow → the mocked executor seam);
 * a plain text turn still renders messages through LiteratureRightPanel with
 * NO compile call (text chat unaffected).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PdfProtocolBuilder } from './PdfProtocolBuilder'
import { apiClient } from '../shared/api/client'

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(() => ({ promise: Promise.resolve({ numPages: 0, fingerprints: [''], getPage: () => Promise.resolve(null), destroy: () => undefined }), destroy: () => undefined })),
  GlobalWorkerOptions: { workerSrc: '' },
  TextLayer: class { render() { return Promise.resolve() } },
}))
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.mjs' }))

const mocks = vi.hoisted(() => ({
  streamFrames: [] as Array<Record<string, unknown>>,
  executeTier1: vi.fn(),
  applyAcceptedWorkstate: vi.fn(),
}))

vi.mock('../shared/api/aiClient', () => ({
  streamAssist: vi.fn(async function* () {
    for (const frame of mocks.streamFrames) yield frame as never
  }),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../shared/api/aiThreadClient', () => ({
  getThread: vi.fn().mockResolvedValue({ messages: [] }),
  appendThreadMessage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }),
    compileWorkstateDraft: vi.fn(),
    acceptWorkstateDraft: vi.fn(),
  },
}))

vi.mock('../shared/session/useWorkstateExecutor', () => ({
  useWorkstateExecutor: () => ({
    executeTier1: mocks.executeTier1,
    applyAcceptedWorkstate: mocks.applyAcceptedWorkstate,
  }),
}))

const INTENT = { operation: 'compose-workstate', tabs: [{ surface: 'knowledge', title: 'Literature' }], activeTab: { index: 0 } }
const COMPILED_OK = {
  draftId: 'DRAFT-L1',
  revision: 3,
  reviewHash: 'f'.repeat(64),
  canAccept: true,
  diagnostics: [],
  result: {
    sessionDocument: { version: 1, tabs: [{ kind: 'run', runId: 'RUN-5', title: 'Extract run' }], activeTabId: null },
    summary: 'Open the extract run',
  },
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  mocks.streamFrames = []
  mocks.executeTier1.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  mocks.applyAcceptedWorkstate.mockReturnValue({ ok: true, kind: 'replaced', diagnostics: [] })
  // Compile resolves after a tick so the `compiling` slot (NO accept control)
  // is observable before the review card lands.
  vi.mocked(apiClient.compileWorkstateDraft).mockImplementation(
    () => new Promise((resolve) => setTimeout(() => resolve(COMPILED_OK), 60)),
  )
  vi.mocked(apiClient.acceptWorkstateDraft).mockResolvedValue(COMPILED_OK.result)
})

function sendChat(text: string) {
  const input = document.querySelector('.lit-ai-tab__input') as HTMLTextAreaElement
  fireEvent.change(input, { target: { value: text } })
  fireEvent.click(screen.getByText('Send'))
}

describe('PdfProtocolBuilder proposal card (PB-CH-6 consumer mount)', () => {
  it('a workstate_proposal frame renders the card in the right panel and accept rides the shared flow', async () => {
    mocks.streamFrames = [
      { type: 'workstate_proposal', workstate: INTENT },
      { type: 'done', result: { success: true, notes: [] } },
    ]
    render(
      <MemoryRouter>
        <PdfProtocolBuilder />
      </MemoryRouter>,
    )

    sendChat('compose the workspace: open the literature surface')

    expect(await screen.findByTestId('workstate-card-compiling')).toBeDefined()

    expect(await screen.findByTestId('workstate-card')).toBeDefined()
    expect(apiClient.compileWorkstateDraft).toHaveBeenCalledWith({ adapter: 'workstate', intent: INTENT })

    await act(async () => {
      fireEvent.click(screen.getByTestId('workstate-card-accept'))
    })
    expect(apiClient.acceptWorkstateDraft).toHaveBeenCalledTimes(1)
    expect(mocks.applyAcceptedWorkstate).toHaveBeenCalledWith(
      COMPILED_OK.result,
      { accepted: true },
      { draftId: 'DRAFT-L1', revision: 3, reviewHash: 'f'.repeat(64) },
    )
    expect(await screen.findByTestId('workstate-card-applied')).toBeDefined()
  })

  it('text chat is unaffected: a plain text turn renders messages with ZERO compile/accept calls and NO card', async () => {
    mocks.streamFrames = [
      { type: 'text_delta', delta: 'Here is how the kit works.' },
      { type: 'done', result: { success: true, notes: [] } },
    ]
    render(
      <MemoryRouter>
        <PdfProtocolBuilder />
      </MemoryRouter>,
    )

    sendChat('explain this protocol')

    // The assistant message body accumulates the status preamble + model text.
    await waitFor(() => expect(screen.getByText(/Here is how the kit works\./)).toBeDefined())
    expect(screen.queryByTestId('workstate-card')).toBeNull()
    expect(screen.queryByTestId('workstate-card-compiling')).toBeNull()
    expect(apiClient.compileWorkstateDraft).not.toHaveBeenCalled()
    expect(apiClient.acceptWorkstateDraft).not.toHaveBeenCalled()
  })
})
