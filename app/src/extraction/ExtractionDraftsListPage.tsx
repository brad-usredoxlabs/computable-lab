import { useEffect, useState, useRef } from 'react';
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
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    try {
      const base64 = await readFileAsBase64(file);
      const response = await fetch('/api/extract/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_kind: 'protocol',
          fileName: file.name,
          contentBase64: base64,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        const msg = (errBody as { error?: { message?: string }; message?: string }).error?.message
          || (errBody as { message?: string }).message
          || `HTTP ${response.status}`;
        throw new Error(msg);
      }

      const data = await response.json() as { recordId: string };
      navigate(`/extraction/review/${data.recordId}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
    } finally {
      setUploading(false);
    }
  };

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

      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          style={{ display: 'none' }}
          id="pdf-upload-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleUpload();
            }
          }}
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            padding: '6px 12px',
            backgroundColor: uploading ? '#ccc' : '#007bff',
            color: 'white',
            borderRadius: '4px',
            border: 'none',
            cursor: uploading ? 'not-allowed' : 'pointer',
          }}
        >
          Upload PDF
        </button>
        {uploadError && (
          <span style={{ color: 'red', fontSize: '0.9rem' }}>{uploadError}</span>
        )}
      </div>

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

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the data:...;base64, prefix
      const commaIndex = result.indexOf(',');
      resolve(commaIndex !== -1 ? result.slice(commaIndex + 1) : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
