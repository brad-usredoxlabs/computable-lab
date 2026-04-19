import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface ExtractionDraft {
  recordId: string;
  kind: 'extraction-draft';
  source_artifact: { kind: string; id: string; locator?: string };
  candidates: Array<{
    target_kind: string;
    confidence?: number;
    draft: Record<string, unknown>;
  }>;
  status: 'pending_review' | 'partially_promoted' | 'promoted' | 'rejected';
  diagnostics?: Array<{ severity: string; code: string; message: string }>;
  extractor_profile?: string;
  created_at?: string;
}

type StatusFilter = 'pending_review' | 'partially_promoted' | 'promoted' | 'rejected' | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_review', label: 'Pending Review' },
  { value: 'partially_promoted', label: 'Partially Promoted' },
  { value: 'promoted', label: 'Promoted' },
  { value: 'rejected', label: 'Rejected' },
];

export function ExtractionDraftsListPage(): JSX.Element {
  const [drafts, setDrafts] = useState<ExtractionDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch('/api/records?kind=extraction-draft')
      .then((r) => {
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}: ${r.statusText}`);
        }
        return r.json();
      })
      .then((data) => {
        if (!cancelled) {
          // API returns { records: [...], total: number }
          setDrafts((data as { records: ExtractionDraft[] }).records || []);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDrafts = drafts.filter((d) => {
    if (statusFilter === 'all') return true;
    return d.status === statusFilter;
  });

  if (loading) {
    return <div>Loading extraction drafts...</div>;
  }

  if (error) {
    return (
      <div role="alert" style={{ color: 'red' }}>
        Failed to load extraction drafts: {error}
      </div>
    );
  }

  return (
    <div className="extraction-drafts-list">
      <h1>Extraction Drafts</h1>

      <div style={{ marginBottom: '1rem' }}>
        <label htmlFor="status-filter">Status: </label>
        <select
          id="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {filteredDrafts.length === 0 ? (
        <div>No extraction drafts found.</div>
      ) : (
        <table role="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #ccc' }}>
              <th style={{ textAlign: 'left', padding: '8px' }}>Record ID</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Source Artifact</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Candidates</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
              <th style={{ textAlign: 'left', padding: '8px' }}>Created At</th>
            </tr>
          </thead>
          <tbody>
            {filteredDrafts.map((draft) => (
              <tr
                key={draft.recordId}
                onClick={() => navigate(`/extraction/review/${draft.recordId}`)}
                style={{
                  cursor: 'pointer',
                  borderBottom: '1px solid #eee',
                  backgroundColor: 'white',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f5f5f5')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'white')}
              >
                <td style={{ padding: '8px' }}>{draft.recordId}</td>
                <td style={{ padding: '8px' }}>
                  {draft.source_artifact.kind}:{draft.source_artifact.id}
                </td>
                <td style={{ padding: '8px' }}>{draft.candidates.length}</td>
                <td style={{ padding: '8px' }}>
                  <span
                    style={{
                      color:
                        draft.status === 'promoted'
                          ? 'green'
                          : draft.status === 'rejected'
                          ? 'red'
                          : draft.status === 'pending_review'
                          ? 'orange'
                          : 'blue',
                    }}
                  >
                    {draft.status}
                  </span>
                </td>
                <td style={{ padding: '8px' }}>{draft.created_at ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
