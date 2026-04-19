import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ExtractionDraftsListPage } from './ExtractionDraftsListPage';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('ExtractionDraftsListPage', () => {
  const mockDrafts = [
    {
      recordId: 'XDR-001',
      kind: 'extraction-draft' as const,
      source_artifact: { kind: 'pdf', id: 'doc-123' },
      candidates: [
        { target_kind: 'protocol', draft: { display_name: 'Protocol A' } },
        { target_kind: 'equipment', draft: { display_name: 'Centrifuge' } },
      ],
      status: 'pending_review' as const,
      created_at: '2024-01-15T10:00:00Z',
    },
    {
      recordId: 'XDR-002',
      kind: 'extraction-draft' as const,
      source_artifact: { kind: 'xlsx', id: 'spreadsheet-456' },
      candidates: [{ target_kind: 'labware', draft: { display_name: '96-well plate' } }],
      status: 'partially_promoted' as const,
      created_at: '2024-01-16T14:30:00Z',
    },
    {
      recordId: 'XDR-003',
      kind: 'extraction-draft' as const,
      source_artifact: { kind: 'pdf', id: 'doc-789' },
      candidates: [
        { target_kind: 'context', draft: { display_name: 'Lab Setup' } },
      ],
      status: 'promoted' as const,
      created_at: '2024-01-17T09:15:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders all 3 mocked records', async () => {
    // API returns { records: [...], total: number }
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: mockDrafts, total: 3 }),
    });

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith('/api/records?kind=extraction-draft');
    });

    // Check that all 3 record IDs are rendered
    expect(screen.getByText('XDR-001')).toBeInTheDocument();
    expect(screen.getByText('XDR-002')).toBeInTheDocument();
    expect(screen.getByText('XDR-003')).toBeInTheDocument();

    // Check that the table is rendered
    const table = screen.getByRole('table');
    expect(table).toBeInTheDocument();

    unmount();
  });

  it('filters by pending_review status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: mockDrafts, total: 3 }),
    });

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('XDR-001')).toBeInTheDocument();
    });

    // Select the pending_review filter
    const filterSelect = screen.getByLabelText('Status:');
    fireEvent.change(filterSelect, { target: { value: 'pending_review' } });

    // Only XDR-001 should remain (the one with pending_review status)
    expect(screen.getByText('XDR-001')).toBeInTheDocument();
    expect(screen.queryByText('XDR-002')).not.toBeInTheDocument();
    expect(screen.queryByText('XDR-003')).not.toBeInTheDocument();

    unmount();
  });

  it('filters by promoted status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: mockDrafts, total: 3 }),
    });

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('XDR-001')).toBeInTheDocument();
    });

    // Select the promoted filter
    const filterSelect = screen.getByLabelText('Status:');
    fireEvent.change(filterSelect, { target: { value: 'promoted' } });

    // Only XDR-003 should remain (the one with promoted status)
    expect(screen.queryByText('XDR-001')).not.toBeInTheDocument();
    expect(screen.queryByText('XDR-002')).not.toBeInTheDocument();
    expect(screen.getByText('XDR-003')).toBeInTheDocument();

    unmount();
  });

  it('navigates to review page when clicking a row', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: mockDrafts, total: 3 }),
    });

    const { unmount } = render(
      <MemoryRouter initialEntries={['/extraction']}>
        <Routes>
          <Route path="/extraction" element={<ExtractionDraftsListPage />} />
          <Route path="/extraction/review/:recordId" element={<div data-testid="review-page">Review Page</div>} />
        </Routes>
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('XDR-001')).toBeInTheDocument();
    });

    // Click on the first row
    const firstRow = screen.getByText('XDR-001').closest('tr');
    expect(firstRow).toBeInTheDocument();
    fireEvent.click(firstRow!);

    // Check that navigation happened by looking for the review page content
    await waitFor(() => {
      expect(screen.getByTestId('review-page')).toBeInTheDocument();
    });

    unmount();
  });

  it('shows loading state initially', () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    expect(screen.getByText('Loading extraction drafts...')).toBeInTheDocument();

    unmount();
  });

  it('shows error message when fetch fails', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Failed to load extraction drafts/)).toBeInTheDocument();
    });

    unmount();
  });

  it('shows "No extraction drafts found" when list is empty', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ records: [], total: 0 }),
    });

    const { unmount } = render(
      <MemoryRouter>
        <ExtractionDraftsListPage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText('No extraction drafts found.')).toBeInTheDocument();
    });

    unmount();
  });
});
