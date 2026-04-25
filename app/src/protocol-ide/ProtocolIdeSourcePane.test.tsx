/**
 * Focused tests for ProtocolIdeSourcePane — verifies PDF/artifact rendering,
 * extracted text visibility, and evidence citation links/labels.
 *
 * Covers:
 * - renders the pane container
 * - renders PDF preview when pdfUrl is present
 * - renders artifact preview when no pdfUrl but artifacts are present
 * - shows extracted text excerpts
 * - shows table extracts
 * - shows provenance metadata
 * - shows evidence citations with page and snippet labels
 * - citation links are clickable and call onCitationClick
 * - trace/diagnostics are secondary (collapsible)
 * - loading and error states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ProtocolIdeSourcePane, buildEvidenceModel } from './ProtocolIdeSourcePane'
import type { ProtocolIdeSession } from './types'
import type { IngestionArtifactRecord, IngestionIssueRecord } from '../../types/ingestion'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockOnCitationClick = vi.fn()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(overrides?: Partial<ProtocolIdeSession>): ProtocolIdeSession {
  return {
    kind: 'protocol-ide-session',
    recordId: 'PIS-001',
    sourceMode: 'pdf_url',
    title: 'Test Protocol',
    pdfUrl: 'https://example.com/test-protocol.pdf',
    status: 'reviewing',
    latestDirectiveText: 'Add 10uL buffer to A1',
    ...overrides,
  }
}

function makeArtifact(overrides?: Partial<IngestionArtifactRecord['payload']>): IngestionArtifactRecord {
  return {
    recordId: 'art-001',
    payload: {
      kind: 'ingestion-artifact',
      id: 'art-001',
      artifact_role: 'source',
      source_url: 'https://example.com/test-protocol.pdf',
      media_type: 'application/pdf',
      text_extract: {
        method: 'pdfminer',
        excerpt: 'Add 10 uL of buffer to well A1 of the 96-well plate.',
      },
      table_extracts: [
        {
          id: 'tbl-001',
          page: 3,
          row_count: 12,
          note: 'Reagent volumes table',
        },
      ],
      file_ref: {
        file_name: 'test-protocol.pdf',
        media_type: 'application/pdf',
        size_bytes: 245760,
      },
      provenance: {
        source_type: 'vendor_protocol_pdf',
        added_at: '2026-04-25T10:00:00Z',
        note: 'Imported from vendor search',
      },
      ...overrides,
    },
  }
}

function makeIssue(overrides?: Partial<IngestionIssueRecord['payload']>): IngestionIssueRecord {
  return {
    recordId: 'issue-001',
    payload: {
      kind: 'ingestion-issue',
      id: 'issue-001',
      severity: 'warning',
      issue_type: 'pipette_too_coarse',
      title: 'Pipette too coarse for 1 uL transfer',
      resolution_status: 'open',
      ...overrides,
    },
  }
}

function renderSourcePane(
  props: Partial<Parameters<typeof ProtocolIdeSourcePane>[0]> = {}
) {
  return render(
    <ProtocolIdeSourcePane
      session={makeSession()}
      onCitationClick={mockOnCitationClick}
      {...props}
    />
  )
}

// ---------------------------------------------------------------------------
// Tests — rendering the pane container
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — renders the pane container', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the pane container', () => {
    renderSourcePane()
    expect(screen.getByTestId('protocol-ide-source-pane')).toBeTruthy()
  })

  it('renders the pane title', () => {
    renderSourcePane()
    expect(screen.getByText('Source Evidence')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Tests — PDF/artifact rendering
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — PDF/artifact rendering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the PDF preview section when pdfUrl is present', () => {
    renderSourcePane()
    expect(screen.getByTestId('source-pane-preview')).toBeTruthy()
  })

  it('renders an iframe for the PDF preview', () => {
    renderSourcePane()
    expect(screen.getByTestId('source-pane-pdf-iframe')).toBeTruthy()
  })

  it('renders an open-in-new-tab link for the PDF', () => {
    renderSourcePane()
    expect(screen.getByTestId('source-pane-preview-open-link')).toHaveTextContent(
      'Open PDF in new tab'
    )
  })

  it('renders artifact preview metadata when no pdfUrl but artifacts are present', () => {
    const session = makeSession({ pdfUrl: undefined })
    const artifact = makeArtifact()
    renderSourcePane({ session, artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-preview')).toBeTruthy()
    expect(screen.getByTestId('source-pane-preview-filename')).toHaveTextContent(
      'test-protocol.pdf'
    )
    expect(screen.getByTestId('source-pane-preview-mimetype')).toHaveTextContent(
      'application/pdf'
    )
    expect(screen.getByTestId('source-pane-preview-size')).toHaveTextContent(
      '240.0 KB'
    )
  })

  it('shows empty state when no pdfUrl and no artifacts', () => {
    const session = makeSession({ pdfUrl: undefined })
    renderSourcePane({ session, artifacts: [] })
    expect(screen.getByTestId('source-pane-preview-empty')).toHaveTextContent(
      'No source artifact loaded yet'
    )
  })
})

// ---------------------------------------------------------------------------
// Tests — extracted text visibility
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — extracted text visibility', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the extracted text section when artifacts have text_extract', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-extracted-text')).toBeTruthy()
  })

  it('shows the extracted text excerpt', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-excerpt-0')).toHaveTextContent(
      'Add 10 uL of buffer to well A1 of the 96-well plate.'
    )
  })

  it('shows the extraction method', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-excerpt-0')).toHaveTextContent(
      'Method: pdfminer'
    )
  })

  it('does NOT render extracted text section when no text_extract', () => {
    const artifact = makeArtifact({ text_extract: undefined })
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.queryByTestId('source-pane-extracted-text')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — table extracts
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — table extracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the table extracts section when artifacts have table_extracts', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-table-extracts')).toBeTruthy()
  })

  it('shows table row data', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-table-row-tbl-001')).toBeTruthy()
  })

  it('shows page number in table extract', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    const row = screen.getByTestId('source-pane-table-row-tbl-001')
    expect(row).toHaveTextContent('3')
  })
})

// ---------------------------------------------------------------------------
// Tests — provenance metadata
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — provenance metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the provenance section when artifacts have provenance', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    expect(screen.getByTestId('source-pane-provenance')).toBeTruthy()
  })

  it('shows source type in provenance', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    const provSection = screen.getByTestId('source-pane-provenance')
    expect(provSection).toHaveTextContent('vendor_protocol_pdf')
  })

  it('shows provenance note', () => {
    const artifact = makeArtifact()
    renderSourcePane({ artifacts: [artifact] })
    const provSection = screen.getByTestId('source-pane-provenance')
    expect(provSection).toHaveTextContent('Imported from vendor search')
  })
})

// ---------------------------------------------------------------------------
// Tests — evidence citations
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — evidence citations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the citations section when citations are provided', () => {
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
        label: 'Buffer addition step',
      },
    ]
    renderSourcePane({ citations })
    expect(screen.getByTestId('source-pane-citations')).toBeTruthy()
  })

  it('shows citation count in title', () => {
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
        label: 'Buffer addition step',
      },
      {
        id: 'cit-002',
        artifactId: 'art-001',
        page: 7,
        snippet: 'Mix for 30 seconds',
        label: 'Mixing step',
      },
    ]
    renderSourcePane({ citations })
    expect(screen.getByTestId('source-pane-citations')).toHaveTextContent(
      'Evidence Citations (2)'
    )
  })

  it('renders citation links with page labels', () => {
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
        label: 'Buffer addition step',
      },
    ]
    renderSourcePane({ citations })
    expect(screen.getByTestId('source-pane-citation-cit-001')).toBeTruthy()
  })

  it('renders citation links with snippet text', () => {
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
        label: 'Buffer addition step',
      },
    ]
    renderSourcePane({ citations })
    expect(screen.getByTestId('source-pane-citation-cit-001')).toHaveTextContent(
      'Add 10 uL buffer to A1'
    )
  })

  it('calls onCitationClick when a citation link is clicked', () => {
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
        label: 'Buffer addition step',
      },
    ]
    renderSourcePane({ citations })
    const citationLink = screen.getByTestId('source-pane-citation-link-cit-001')
    fireEvent.click(citationLink)
    expect(mockOnCitationClick).toHaveBeenCalledTimes(1)
    expect(mockOnCitationClick).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'cit-001',
        page: 5,
        snippet: 'Add 10 uL buffer to A1',
      })
    )
  })

  it('does NOT render citations section when no citations', () => {
    renderSourcePane({ citations: [] })
    expect(screen.queryByTestId('source-pane-citations')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — trace / diagnostics (secondary)
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — trace / diagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('renders the trace section as a collapsible details element', () => {
    const issue = makeIssue()
    renderSourcePane({ issues: [issue] })
    expect(screen.getByTestId('source-pane-trace')).toBeTruthy()
  })

  it('shows the trace summary with issue count', () => {
    const issue = makeIssue()
    renderSourcePane({ issues: [issue] })
    expect(screen.getByText(/Trace & Diagnostics \(1\)/)).toBeTruthy()
  })

  it('shows issue items in the trace body', () => {
    const issue = makeIssue()
    renderSourcePane({ issues: [issue] })
    expect(screen.getByTestId('source-pane-trace-item-issue-001')).toBeTruthy()
  })

  it('shows the issue title in the trace', () => {
    const issue = makeIssue()
    renderSourcePane({ issues: [issue] })
    const traceItem = screen.getByTestId('source-pane-trace-item-issue-001')
    expect(traceItem).toHaveTextContent('Pipette too coarse for 1 uL transfer')
  })

  it('does NOT render trace section when no issues', () => {
    renderSourcePane({ issues: [] })
    expect(screen.queryByTestId('source-pane-trace')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — loading and error states
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — loading and error states', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('shows loading text when isLoading is true', () => {
    renderSourcePane({ isLoading: true })
    expect(screen.getByTestId('protocol-ide-source-pane-loading')).toHaveTextContent(
      'Loading source evidence'
    )
  })

  it('displays an error message when provided', () => {
    renderSourcePane({ error: 'Failed to load source' })
    expect(screen.getByTestId('protocol-ide-source-pane-error')).toHaveTextContent(
      'Failed to load source'
    )
  })

  it('does not display error when no error is provided', () => {
    renderSourcePane()
    expect(screen.queryByTestId('protocol-ide-source-pane-error')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tests — buildEvidenceModel
// ---------------------------------------------------------------------------

describe('ProtocolIdeSourcePane — buildEvidenceModel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    cleanup()
  })

  it('builds an evidence model from session and artifacts', () => {
    const session = makeSession()
    const artifact = makeArtifact()
    const model = buildEvidenceModel(session, [artifact])
    expect(model.artifacts).toHaveLength(1)
    expect(model.byArtifactId['art-001']).toBeDefined()
  })

  it('indexes citations by artifact id', () => {
    const session = makeSession()
    const artifact = makeArtifact()
    const citations = [
      {
        id: 'cit-001',
        artifactId: 'art-001',
        page: 5,
        snippet: 'Test snippet',
      },
    ]
    const model = buildEvidenceModel(session, [artifact], citations)
    expect(model.byArtifactId['art-001'].citations).toHaveLength(1)
    expect(model.byCitationId['cit-001']).toBeDefined()
  })

  it('returns empty model when no artifacts or citations', () => {
    const session = makeSession()
    const model = buildEvidenceModel(session, [], [])
    expect(model.artifacts).toHaveLength(0)
    expect(model.citations).toHaveLength(0)
    expect(Object.keys(model.byArtifactId)).toHaveLength(0)
    expect(Object.keys(model.byCitationId)).toHaveLength(0)
  })
})
