import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor';

interface AmbiguitySpan {
  path: string;
  reason: string;
}

interface Candidate {
  target_kind: string;
  confidence?: number;
  uncertainty?: string;
  evidence_span?: string;
  ambiguity_spans?: AmbiguitySpan[];
  draft: Record<string, unknown>;
  status?: 'promoted' | 'rejected';
}

interface ExtractionDraft {
  recordId: string;
  kind: 'extraction-draft';
  source_artifact: { kind: string; id: string; locator?: string };
  candidates: Candidate[];
  status: string;
  diagnostics?: Array<{ severity: string; code: string; message: string }>;
  extractor_profile?: string;
}

// ── Projection helpers for extraction candidates ─────────────────────

/**
 * Well-known target kinds that get a structured TapTab projection.
 */
const KNOWN_TARGET_KINDS = new Set([
  'protocol',
  'equipment',
  'labware',
  'material',
  'assay',
  'plate',
  'run',
  'study',
  'experiment',
  'context',
  'event-graph',
]);

/**
 * Build a minimal EditorProjection blocks/slots for a candidate draft
 * based on its target_kind.  Returns null when the kind is unknown so
 * the caller can fall back to a structured JSON display.
 */
function buildCandidateProjection(
  targetKind: string,
  draft: Record<string, unknown>
): { blocks: Array<{ id: string; kind: string; label?: string; slotIds?: string[] }>; slots: Array<{ id: string; path: string; label: string; widget: string; readOnly?: boolean }> } | null {
  if (!KNOWN_TARGET_KINDS.has(targetKind)) {
    return null;
  }

  const kindLabel = targetKind.charAt(0).toUpperCase() + targetKind.slice(1);

  // Build slots from draft keys (flat projection)
  const slots: Array<{ id: string; path: string; label: string; widget: string; readOnly?: boolean }> = [];
  const slotIds: string[] = [];

  for (const [key, value] of Object.entries(draft)) {
    const slotId = `slot-${key}`;
    slotIds.push(slotId);
    const widget = Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : 'readonly';
    slots.push({
      id: slotId,
      path: key,
      label: key,
      widget,
      readOnly: true,
    });
  }

  // If no slots were built (empty draft), create a placeholder
  if (slots.length === 0) {
    slots.push({
      id: 'slot-empty',
      path: '_empty',
      label: 'Empty draft',
      widget: 'readonly',
      readOnly: true,
    });
    slotIds.push('slot-empty');
  }

  return {
    blocks: [
      {
        id: 'section-draft',
        kind: 'section',
        label: `${kindLabel} Draft`,
        slotIds,
      },
    ],
    slots,
  };
}

// ── Structured fallback for unsupported candidates ───────────────────

/**
 * Render a structured fallback for candidates whose target_kind is not
 * in the known set.  Shows the draft payload in a readable key-value
 * layout rather than raw JSON.
 */
function CandidateDraftFallback({ draft }: { draft: Record<string, unknown> }): JSX.Element {
  return (
    <div className="candidate-draft-fallback">
      <h4>Draft</h4>
      <div className="structured-fallback">
        {Object.keys(draft).length === 0 ? (
          <p className="text-gray-500 italic">Empty draft payload</p>
        ) : (
          <dl className="fallback-dl">
            {Object.entries(draft).map(([key, value]) => (
              <div key={key} className="fallback-field">
                <dt className="fallback-label">{key}</dt>
                <dd className="fallback-value">
                  {typeof value === 'object' && value !== null ? (
                    <pre className="fallback-value-pre">{JSON.stringify(value, null, 2)}</pre>
                  ) : (
                    <span>{String(value)}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

// ── TapTab read surface for candidate detail ─────────────────────────

/**
 * Read-only TapTab surface for a candidate draft.
 * Uses ProjectionTapTabEditor with disabled=true.
 */
function CandidateTapTabSurface({
  targetKind,
  draft,
}: {
  targetKind: string;
  draft: Record<string, unknown>;
}): JSX.Element {
  const projection = buildCandidateProjection(targetKind, draft);

  if (!projection) {
    // Unsupported target_kind — show structured fallback
    return <CandidateDraftFallback draft={draft} />;
  }

  return (
    <div className="candidate-taptab-surface">
      <ProjectionTapTabEditor
        blocks={projection.blocks}
        slots={projection.slots}
        data={draft}
        disabled
      />
    </div>
  );
}

// ── Main page component ──────────────────────────────────────────────

export function ExtractionReviewPage(): JSX.Element {
  const { recordId } = useParams<{ recordId: string }>();
  const [record, setRecord] = useState<ExtractionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!recordId) {
      setError('No record ID provided');
      setLoading(false);
      return;
    }
    fetch(`/api/records/${recordId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => { if (!cancelled) { setRecord(data as ExtractionDraft); setLoading(false); } })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [recordId]);

  // Handle Escape key to close drawer
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && openIndex !== null) {
        setOpenIndex(null);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openIndex]);

  const promote = async (index: number) => {
    if (!recordId || actionInProgress !== null) return;
    setActionInProgress(index);
    try {
      const response = await fetch(`/api/extraction/drafts/${recordId}/candidates/${index}/promote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        const result = await response.json();
        // Optimistically update local state
        setRecord(prev => {
          if (!prev) return null;
          const updatedCandidates = [...prev.candidates];
          updatedCandidates[index] = { ...updatedCandidates[index], status: 'promoted' as const };
          return { ...prev, candidates: updatedCandidates };
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Promote failed: ${errorData.message || response.statusText}`);
      }
    } catch (err) {
      alert(`Promote failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const reject = async (index: number) => {
    if (!recordId || actionInProgress !== null) return;
    setActionInProgress(index);
    try {
      const response = await fetch(`/api/extraction/drafts/${recordId}/candidates/${index}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (response.ok) {
        // Optimistically update local state
        setRecord(prev => {
          if (!prev) return null;
          const updatedCandidates = [...prev.candidates];
          updatedCandidates[index] = { ...updatedCandidates[index], status: 'rejected' as const };
          return { ...prev, candidates: updatedCandidates };
        });
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert(`Reject failed: ${errorData.message || response.statusText}`);
      }
    } catch (err) {
      alert(`Reject failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setActionInProgress(null);
    }
  };

  if (loading) return <div>Loading extraction draft...</div>;
  if (error) return <div role="alert">Failed to load: {error}</div>;
  if (!record) return <div>Not found</div>;

  const openCandidate = openIndex !== null ? record.candidates[openIndex] : null;

  return (
    <div className="extraction-review">
      <h1>Extraction Review: {record.recordId}</h1>
      <section>
        <h2>Source</h2>
        <dl>
          <dt>Kind</dt><dd>{record.source_artifact.kind}</dd>
          <dt>Id</dt><dd>{record.source_artifact.id}</dd>
          {record.source_artifact.locator && <><dt>Locator</dt><dd>{record.source_artifact.locator}</dd></>}
          {record.extractor_profile && <><dt>Extractor</dt><dd>{record.extractor_profile}</dd></>}
        </dl>
      </section>
      <section>
        <h2>Candidates ({record.candidates.length})</h2>
        <table role="table">
          <thead>
            <tr><th>#</th><th>Kind</th><th>Name</th><th>Confidence</th><th>Uncertainty</th><th>Evidence</th><th>Status</th></tr>
          </thead>
          <tbody>
            {record.candidates.map((c, i) => (
              <tr
                key={i}
                onClick={() => setOpenIndex(i)}
                aria-selected={openIndex === i}
                style={{ cursor: 'pointer', backgroundColor: openIndex === i ? '#e0e0e0' : 'transparent' }}
              >
                <td>{i + 1}</td>
                <td>{c.target_kind}</td>
                <td>{String((c.draft as {display_name?: string; name?: string}).display_name ?? (c.draft as {name?: string}).name ?? '—')}</td>
                <td>{c.confidence?.toFixed(2) ?? '—'}</td>
                <td>{c.uncertainty ?? '—'}</td>
                <td>{c.evidence_span ?? '—'}</td>
                <td>
                  {c.status === 'promoted' && <span style={{ color: 'green' }}>promoted</span>}
                  {c.status === 'rejected' && <span style={{ color: 'red' }}>rejected</span>}
                  {!c.status && <span>—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {openIndex !== null && openCandidate && (
        <aside role="complementary" aria-label="Candidate detail">
          <button onClick={() => setOpenIndex(null)} aria-label="Close" style={{ float: 'right', fontSize: '24px', border: 'none', background: 'none', cursor: 'pointer' }}>×</button>
          <h3>Candidate {openIndex + 1}</h3>
          <p>Confidence: {openCandidate.confidence?.toFixed(2) ?? '—'}</p>
          <p>Uncertainty: {openCandidate.uncertainty ?? '—'}</p>
          <h4>Evidence</h4>
          <blockquote>{openCandidate.evidence_span ?? '—'}</blockquote>
          <h4>Ambiguity spans</h4>
          <ul>{(openCandidate.ambiguity_spans ?? []).map((s, i) => <li key={i}>{s.path}: {s.reason}</li>)}</ul>
          <CandidateTapTabSurface targetKind={openCandidate.target_kind} draft={openCandidate.draft} />
          <h4>Actions</h4>
          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
            <button
              onClick={() => promote(openIndex)}
              disabled={openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null}
              style={{ padding: '4px 8px', cursor: (openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null) ? 'not-allowed' : 'pointer' }}
            >
              Promote
            </button>
            <button
              onClick={() => reject(openIndex)}
              disabled={openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null}
              style={{ padding: '4px 8px', cursor: (openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null) ? 'not-allowed' : 'pointer' }}
            >
              Reject
            </button>
          </div>
        </aside>
      )}
    </div>
  );
}
