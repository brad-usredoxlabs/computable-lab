import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';

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

export function ExtractionReviewPage(): JSX.Element {
  const { recordId } = useParams<{ recordId: string }>();
  const [record, setRecord] = useState<ExtractionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!recordId) {
      setError('No record ID provided');
      setLoading(false);
      return;
    }
    fetch(`/records/${recordId}`)
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
            <tr><th>#</th><th>Kind</th><th>Name</th><th>Confidence</th><th>Uncertainty</th><th>Evidence</th></tr>
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
          <h4>Draft</h4>
          <pre>{JSON.stringify(openCandidate.draft, null, 2)}</pre>
        </aside>
      )}
    </div>
  );
}
