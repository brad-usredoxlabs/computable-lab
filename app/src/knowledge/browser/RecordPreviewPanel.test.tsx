/**
 * Focused tests for RecordPreviewPanel — compact TapTab read surface.
 *
 * Covers:
 * - empty state renders correctly
 * - error state renders correctly
 * - open/edit actions present
 * - compact TapTab projection surface renders when projection available
 * - fallback to JSON when no projection available
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { createContext, useContext, useState, type ReactNode } from 'react'
import { RecordPreviewPanel } from './RecordPreviewPanel'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import type { RecordEnvelope } from '../../types/kernel'

// ── Mocks ────────────────────────────────────────────────────────────

const mockRefresh = vi.fn()
const mockFileToRun = vi.fn()

// Mock the apiClient module — vi.mock hoists to top of file
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getUiSpec: vi.fn(),
    getRecordEditorProjection: vi.fn(),
  },
}))

// Import the mocked apiClient
import { apiClient } from '../../shared/api/client'

// ── Helpers ──────────────────────────────────────────────────────────

const mockRecord: RecordEnvelope = {
  recordId: 'REC_0001__test-record',
  schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml',
  payload: {
    kind: 'study',
    title: 'Test Study',
    status: 'draft',
    description: 'A test study for preview panel',
  },
  meta: {
    path: '/studies/REC_0001__test-record',
    createdAt: '2024-01-15T10:00:00.000Z',
    updatedAt: '2024-01-16T14:30:00.000Z',
  },
}

const mockProjection: EditorProjectionResponse = {
  schemaId: mockRecord.schemaId,
  recordId: mockRecord.recordId,
  title: 'Test Study',
  blocks: [
    {
      id: 'section-1',
      kind: 'section',
      label: 'Study Details',
      slotIds: ['slot-title', 'slot-description'],
    },
  ],
  slots: [
    {
      id: 'slot-title',
      path: '$.title',
      label: 'Title',
      widget: 'text',
      required: true,
    },
    {
      id: 'slot-description',
      path: '$.description',
      label: 'Description',
      widget: 'textarea',
    },
  ],
  diagnostics: [],
}

function defaultMocks() {
  vi.mocked(apiClient.getRecord).mockResolvedValue(mockRecord)
  vi.mocked(apiClient.getUiSpec).mockResolvedValue({
    uiVersion: 1,
    schemaId: mockRecord.schemaId,
    form: {
      sections: [
        {
          title: 'Study Details',
          fields: [
            { path: '$.title', widget: 'text', label: 'Title' },
            { path: '$.description', widget: 'textarea', label: 'Description' },
          ],
        },
      ],
    },
  })
  vi.mocked(apiClient.getRecordEditorProjection).mockResolvedValue(mockProjection)
}

// Create a minimal BrowserContext mock provider
const MockBrowserContext = createContext<any>(null)

function MockBrowserProvider({
  selectedRecordId: initialRecordId,
  children,
}: {
  selectedRecordId?: string | null
  children: ReactNode
}) {
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(initialRecordId ?? null)

  return (
    <MockBrowserContext.Provider
      value={{
        selectedRecordId,
        setSelectedRecordId,
        refresh: mockRefresh,
        studies: [],
        fileToRun: mockFileToRun,
      }}
    >
      {children}
    </MockBrowserContext.Provider>
  )
}

// Override the useBrowser hook to use our mock context
vi.mock('../../shared/context/BrowserContext', () => ({
  useBrowser: () => {
    const ctx = useContext(MockBrowserContext)
    if (!ctx) {
      throw new Error('useBrowser must be used within a MockBrowserProvider')
    }
    return ctx
  },
}))

// ── Tests ────────────────────────────────────────────────────────────

describe('RecordPreviewPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRefresh.mockReset()
    mockFileToRun.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('shows empty state when no record is selected', () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId={null}>
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    expect(screen.getByText('Select a record to view details')).toBeInTheDocument()
  })

  it('shows error state when record fetch fails', async () => {
    vi.mocked(apiClient.getRecord).mockRejectedValue(
      new Error('Network error'),
    )

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    await waitFor(() => {
      expect(screen.getByText('Error loading record')).toBeInTheDocument()
      expect(screen.getByText('Network error')).toBeInTheDocument()
    })

    // Should have a close button
    const closeBtn = screen.getByText('Close')
    expect(closeBtn).toBeInTheDocument()
  })

  it('renders compact TapTab projection surface when projection is available', async () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for the record to be fetched and projection to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(apiClient.getRecordEditorProjection).toHaveBeenCalled()
    })

    // The ProjectionTapTabEditor renders a container with taptab-editor-container class
    await waitFor(() => {
      const container = document.querySelector('.taptab-editor-container')
      expect(container).toBeInTheDocument()
    })

    // Should show the section heading from the projection
    await waitFor(() => {
      const sectionHeading = document.querySelector('.taptab-section-heading')
      expect(sectionHeading?.textContent).toBe('Study Details')
    })
  })

  it('renders open and edit action buttons', async () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show Open button (use query to avoid duplicate errors)
    await waitFor(() => {
      const openBtns = document.querySelectorAll('button')
      const openBtn = Array.from(openBtns).find(btn => btn.textContent?.includes('Open'))
      expect(openBtn).toBeInTheDocument()
    })

    // Should show Edit button
    await waitFor(() => {
      const editBtns = document.querySelectorAll('button')
      const editBtn = Array.from(editBtns).find(btn => btn.textContent?.includes('Edit'))
      expect(editBtn).toBeInTheDocument()
    })
  })

  it('renders badges for kind, status, and schema', async () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show kind badge
    await waitFor(() => {
      const kindBadges = document.querySelectorAll('span')
      const kindBadge = Array.from(kindBadges).find(span => span.textContent === 'study')
      expect(kindBadge).toBeInTheDocument()
    })

    // Should show status badge
    await waitFor(() => {
      const statusBadges = document.querySelectorAll('span')
      const statusBadge = Array.from(statusBadges).find(span => span.textContent === 'draft')
      expect(statusBadge).toBeInTheDocument()
    })

    // Should show schema display name
    await waitFor(() => {
      const schemaBadges = document.querySelectorAll('span')
      const schemaBadge = Array.from(schemaBadges).find(span => span.textContent === 'Study')
      expect(schemaBadge).toBeInTheDocument()
    })
  })

  it('renders metadata rows for created/updated dates', async () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show Created and Updated labels
    await waitFor(() => {
      const labels = document.querySelectorAll('span')
      const createdLabel = Array.from(labels).find(span => span.textContent === 'Created')
      const updatedLabel = Array.from(labels).find(span => span.textContent === 'Updated')
      expect(createdLabel).toBeInTheDocument()
      expect(updatedLabel).toBeInTheDocument()
    })
  })

  it('renders close button', async () => {
    defaultMocks()

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show close button
    await waitFor(() => {
      const closeBtn = document.querySelector('[title="Close preview"]')
      expect(closeBtn).toBeInTheDocument()
    })
  })

  it('falls back to JSON when no projection and no UISpec', async () => {
    vi.mocked(apiClient.getRecordEditorProjection).mockRejectedValue(
      new Error('Projection unavailable'),
    )
    vi.mocked(apiClient.getUiSpec).mockResolvedValue(null)

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show JSON preview
    await waitFor(() => {
      const jsonPreview = document.querySelector('pre')
      expect(jsonPreview).toBeInTheDocument()
      expect(jsonPreview?.textContent).toContain('Test Study')
    })
  })

  it('shows File to Run button for inbox records', async () => {
    const inboxRecord = {
      ...mockRecord,
      payload: {
        ...mockRecord.payload,
        status: 'inbox',
      },
    }

    vi.mocked(apiClient.getRecord).mockResolvedValue(inboxRecord as unknown as RecordEnvelope)

    render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should show File to Run button for inbox records
    await waitFor(() => {
      const fileBtns = document.querySelectorAll('button')
      const fileBtn = Array.from(fileBtns).find(btn => btn.textContent?.includes('File to Run'))
      expect(fileBtn).toBeInTheDocument()
    })
  })

  it('does not show File to Run button for non-inbox records', async () => {
    defaultMocks()

    const { container } = render(
      <MemoryRouter>
        <MockBrowserProvider selectedRecordId="REC_0001__test-record">
          <RecordPreviewPanel />
        </MockBrowserProvider>
      </MemoryRouter>,
    )

    // Wait for record to load
    await waitFor(() => {
      expect(apiClient.getRecord).toHaveBeenCalled()
    })

    // Should NOT show File to Run button for non-inbox records
    // Check within the container only to avoid picking up elements from other tests
    await waitFor(() => {
      const fileBtns = container.querySelectorAll('button')
      const fileBtn = Array.from(fileBtns).find(btn => btn.textContent?.includes('File to Run'))
      expect(fileBtn).toBeUndefined()
    })
  })
})
