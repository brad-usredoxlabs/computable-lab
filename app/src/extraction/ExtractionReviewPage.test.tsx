import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { ExtractionReviewPage } from './ExtractionReviewPage'
import type { JSX } from 'react'

const DRAFT = {
  recordId: 'XDR-test-001',
  kind: 'extraction-draft',
  source_artifact: { kind: 'file', id: 'VPDF-123' },
  candidates: [
    {
      target_kind: 'protocol',
      confidence: 0.7,
      draft: { title: 'Draft protocol', steps: [] },
    },
  ],
  status: 'pending_review',
}

const STEPS = {
  title: 'ZymoBIOMICS 96 MagBead DNA Kit',
  steps: [
    { ordinal: 1, text: 'Add 550 uL lysis solution to each well.' },
    { ordinal: 2, text: 'Bead-beat for 5 minutes.' },
  ],
}

function renderReview(ui: JSX.Element) {
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <MemoryRouter initialEntries={['/extraction/review/XDR-test-001']}>
          <Routes>
            <Route path="/extraction/review/:recordId" element={ui} />
          </Routes>
        </MemoryRouter>
      </OpenTabsProvider>
    </ThemeProvider>,
  )
}

function mockApi(opts: { pending?: boolean; stepsPending?: boolean; stepsReject?: boolean } = {}) {
  vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
    const url = typeof input === 'string' ? input : String((input as Request).url)
    if (url.includes('/api/records/')) {
      if (opts.pending) return new Promise<Response>(() => {}) as unknown as Promise<Response>
      return { ok: true, json: async () => ({ record: { recordId: DRAFT.recordId, payload: DRAFT } }) } as Response
    }
    if (url.includes('/api/extraction/human-steps/')) {
      if (opts.stepsPending) return new Promise<Response>(() => {}) as unknown as Promise<Response>
      if (opts.stepsReject) return { ok: false, status: 500, statusText: 'LLM error' } as Response
      return { ok: true, json: async () => STEPS } as Response
    }
    if (url.includes('/api/extraction/drafts/')) {
      return { ok: true, json: async () => ({ recordId: 'PRT-1', promotionId: 'PROM-1' }) } as Response
    }
    return { ok: true, json: async () => ({}) } as Response
  })
}

describe('ExtractionReviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('renders loading state initially', () => {
    mockApi({ pending: true })
    renderReview(<ExtractionReviewPage />)
    expect(screen.getByText('Loading candidate protocol...')).toBeInTheDocument()
  })

  it('shows a thinking timeline while the LLM is generating', async () => {
    mockApi({ stepsPending: true })
    renderReview(<ExtractionReviewPage />)
    expect(await screen.findByTestId('thinking')).toBeInTheDocument()
  })

  it('renders the numbered candidate protocol steps after generation', async () => {
    mockApi()
    renderReview(<ExtractionReviewPage />)
    // Section + both steps appear once generation completes.
    expect(await screen.findByTestId('candidate-protocol')).toBeInTheDocument()
    expect(await screen.findByText('Add 550 uL lysis solution to each well.')).toBeInTheDocument()
    expect(screen.getByText('Bead-beat for 5 minutes.')).toBeInTheDocument()
    expect(screen.getByText('1.')).toBeInTheDocument()
    expect(screen.getAllByText('Candidate Protocol').length).toBeGreaterThan(0)
  })

  it('shows an error and disables nothing critical when generation fails', async () => {
    mockApi({ stepsReject: true })
    renderReview(<ExtractionReviewPage />)
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Promote' })).toBeInTheDocument()
  })

  it('promotes the primary candidate', async () => {
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String((input as Request).url)
      calls.push(url)
      if (url.includes('/api/records/')) {
        return { ok: true, json: async () => ({ record: { recordId: DRAFT.recordId, payload: DRAFT } }) } as Response
      }
      if (url.includes('/api/extraction/human-steps/')) {
        return { ok: true, json: async () => STEPS } as Response
      }
      if (url.includes('/api/extraction/drafts/')) {
        return { ok: true, json: async () => ({ recordId: 'PRT-1', promotionId: 'PROM-1' }) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    renderReview(<ExtractionReviewPage />)
    const promote = await screen.findByRole('button', { name: 'Promote' })
    await waitFor(() => expect(promote).not.toBeDisabled())
    fireEvent.click(promote)
    await waitFor(() =>
      expect(calls.some((c) => c.includes('/api/extraction/drafts/XDR-test-001/candidates/0/promote'))).toBe(true),
    )
    expect(await screen.findByText('promoted')).toBeInTheDocument()
  })

  it('rejects the primary candidate', async () => {
    const calls: string[] = []
    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : String((input as Request).url)
      calls.push(url)
      if (url.includes('/api/records/')) {
        return { ok: true, json: async () => ({ record: { recordId: DRAFT.recordId, payload: DRAFT } }) } as Response
      }
      if (url.includes('/api/extraction/human-steps/')) {
        return { ok: true, json: async () => STEPS } as Response
      }
      if (url.includes('/api/extraction/drafts/')) {
        return { ok: true, json: async () => ({}) } as Response
      }
      return { ok: true, json: async () => ({}) } as Response
    })
    renderReview(<ExtractionReviewPage />)
    const reject = await screen.findByRole('button', { name: 'Reject' })
    await waitFor(() => expect(reject).not.toBeDisabled())
    fireEvent.click(reject)
    await waitFor(() =>
      expect(calls.some((c) => c.includes('/api/extraction/drafts/XDR-test-001/candidates/0/reject'))).toBe(true),
    )
    expect(await screen.findByText('rejected')).toBeInTheDocument()
  })
})
