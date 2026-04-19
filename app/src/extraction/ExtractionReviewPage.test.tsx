import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ExtractionReviewPage } from './ExtractionReviewPage'

describe('ExtractionReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders loading state initially', async () => {
    // Mock fetch that never resolves to keep it in loading state
    vi.spyOn(global, 'fetch').mockImplementation(() => new Promise(() => {}))
    
    render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-001']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )
    
    expect(screen.getByText('Loading extraction draft...')).toBeInTheDocument()
  })

  it('renders extraction draft with 2 candidates', async () => {
    const mockData = {
      recordId: 'XDR-test-001',
      kind: 'extraction-draft',
      source_artifact: {
        kind: 'pdf',
        id: 'PDF-123',
        locator: '/path/to/file.pdf'
      },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.95,
          uncertainty: 'low',
          evidence_span: 'Mix 5ml of solution A',
          draft: { display_name: 'Protocol A', steps: [] }
        },
        {
          target_kind: 'equipment',
          confidence: 0.87,
          uncertainty: 'medium',
          evidence_span: 'Use centrifuge at 3000rpm',
          draft: { name: 'Centrifuge Model X' }
        }
      ],
      status: 'pending-review',
      extractor_profile: 'protocol-extractor-v1'
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    } as Response)

    render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-001']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Extraction Review: XDR-test-001')).toBeInTheDocument()
    })

    // Check source artifact info
    expect(screen.getByText('Source')).toBeInTheDocument()
    // Use queryAllByText to handle duplicate "Kind" in table header
    const kindLabels = screen.getAllByText('Kind')
    expect(kindLabels.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('pdf')).toBeInTheDocument()
    expect(screen.getByText('PDF-123')).toBeInTheDocument()
    expect(screen.getByText('Locator')).toBeInTheDocument()
    expect(screen.getByText('/path/to/file.pdf')).toBeInTheDocument()
    expect(screen.getByText('Extractor')).toBeInTheDocument()
    expect(screen.getByText('protocol-extractor-v1')).toBeInTheDocument()

    // Check candidates table
    expect(screen.getByText('Candidates (2)')).toBeInTheDocument()
    
    // Verify table structure
    const table = screen.getByRole('table')
    expect(table).toBeInTheDocument()

    // Check for 2 candidate rows (excluding header)
    const rows = screen.getAllByRole('row')
    expect(rows).toHaveLength(3) // 1 header + 2 data rows

    // Check first candidate
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByText('protocol')).toBeInTheDocument()
    expect(screen.getByText('Protocol A')).toBeInTheDocument()
    expect(screen.getByText('0.95')).toBeInTheDocument()
    expect(screen.getByText('low')).toBeInTheDocument()
    expect(screen.getByText('Mix 5ml of solution A')).toBeInTheDocument()

    // Check second candidate
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('equipment')).toBeInTheDocument()
    expect(screen.getByText('Centrifuge Model X')).toBeInTheDocument()
    expect(screen.getByText('0.87')).toBeInTheDocument()
    expect(screen.getByText('medium')).toBeInTheDocument()
    expect(screen.getByText('Use centrifuge at 3000rpm')).toBeInTheDocument()
  })

  it('renders error state when fetch fails', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'))

    render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-001']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText(/Failed to load: Network error/)).toBeInTheDocument()
  })

  it('renders error for non-ok HTTP response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404
    } as Response)

    render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-001']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
    })

    expect(screen.getByText(/Failed to load: HTTP 404/)).toBeInTheDocument()
  })

  it('handles candidates without optional fields', async () => {
    const mockData = {
      recordId: 'XDR-test-002',
      kind: 'extraction-draft',
      source_artifact: {
        kind: 'xlsx',
        id: 'XLSX-456'
      },
      candidates: [
        {
          target_kind: 'labware',
          draft: { name: 'Test Tube' }
        }
      ],
      status: 'pending-review'
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    } as Response)

    render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-002']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Extraction Review: XDR-test-002')).toBeInTheDocument()
    })

    expect(screen.getByText('Test Tube')).toBeInTheDocument()
    // Use queryAllByText to handle multiple "—" cells
    const dashes = screen.getAllByText('—')
    expect(dashes.length).toBeGreaterThanOrEqual(3) // confidence, uncertainty, evidence
  })

  it('opens drawer when clicking a row and closes with Escape', async () => {
    const mockData = {
      recordId: 'XDR-test-003',
      kind: 'extraction-draft',
      source_artifact: {
        kind: 'pdf',
        id: 'PDF-789',
        locator: '/path/to/protocol.pdf'
      },
      candidates: [
        {
          target_kind: 'protocol',
          confidence: 0.92,
          uncertainty: 'low',
          evidence_span: 'Incubate at 37°C for 30 minutes',
          ambiguity_spans: [
            { path: 'steps[0].duration', reason: 'Ambiguous time unit' }
          ],
          draft: {
            display_name: 'Incubation Protocol',
            steps: [
              { name: 'Incubate', duration: 30, unit: 'minutes', temperature: 37 }
            ]
          }
        },
        {
          target_kind: 'equipment',
          confidence: 0.88,
          evidence_span: 'Use incubator Model Z',
          draft: { name: 'Incubator Model Z' }
        }
      ],
      status: 'pending-review'
    }

    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockData
    } as Response)

    const { container, unmount } = render(
      <MemoryRouter initialEntries={['/extraction/review/XDR-test-003']}>
        <Routes>
          <Route path="/extraction/review/:recordId" element={<ExtractionReviewPage />} />
        </Routes>
      </MemoryRouter>
    )

    // Wait for the page to load within this container
    const page = container.querySelector('.extraction-review')
    await waitFor(() => {
      expect(container.textContent).toContain('Extraction Review: XDR-test-003')
    })

    // Click the first row
    const rows = container.querySelectorAll('tbody tr')
    const firstDataRow = rows[0]
    fireEvent.click(firstDataRow)

    // Drawer should appear with role="complementary"
    const drawer = await new Promise<HTMLElement>((resolve) => {
      const check = () => {
        const d = container.querySelector('[role="complementary"]') as HTMLElement
        if (d) resolve(d)
        else setTimeout(check, 50)
      }
      check()
    })
    expect(drawer).toBeInTheDocument()

    // Check that the drawer contains the candidate details
    expect(container.textContent).toContain('Candidate 1')
    expect(container.textContent).toContain('Confidence: 0.92')
    expect(container.textContent).toContain('Uncertainty: low')
    expect(container.textContent).toContain('Evidence')
    expect(container.textContent).toContain('Incubate at 37°C for 30 minutes')
    expect(container.textContent).toContain('Ambiguity spans')
    expect(container.textContent).toContain('steps[0].duration: Ambiguous time unit')
    expect(container.textContent).toContain('Draft')

    // Check that the pre contains the JSON stringified draft
    const preElement = container.querySelector('pre')
    expect(preElement).toBeInTheDocument()
    const preText = preElement?.textContent || ''
    expect(preText).toContain('Incubation Protocol')
    expect(preText).toContain('Incubate')

    // Press Escape to close the drawer
    fireEvent.keyDown(document, { key: 'Escape' })

    // Drawer should be closed
    await waitFor(() => {
      expect(container.querySelector('[role="complementary"]')).not.toBeInTheDocument()
    })

    unmount()
  })
})
