import { useParams, useSearchParams } from 'react-router-dom';
import { useEffect, useState, type JSX, type ReactNode } from 'react';
import { ProjectionTapTabEditor } from '../editor/taptab/TapTabEditor';
import { promoteThread } from '../shared/api/aiThreadClient';
import { AppShell } from '../shared/shell';
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip';
import './extraction.css';

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

function generateConversationRecordId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = Math.random().toString(36).slice(2, 8);
  return `CONV-${stamp}-${rand}`;
}

/** Wrap a page body in the app shell (GlobalNavbar + tab strip + content). */
function renderShell(body: ReactNode): JSX.Element {
  return (
    <AppShell
      brand="Extraction Review"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={<div className="extraction-scroll">{body}</div>}
    />
  );
}

export function ExtractionReviewPage(): JSX.Element {
  // Phase 6: recordId may come from a path param (legacy /extraction/review/:recordId)
  // or a search param (/literature?view=review&recordId=…).
  const params = useParams<{ recordId: string }>();
  const [searchParams] = useSearchParams();
  const recordId = params.recordId ?? searchParams.get('recordId') ?? undefined;
  const [record, setRecord] = useState<ExtractionDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [actionInProgress, setActionInProgress] = useState<number | null>(null);
  // Concise LLM human steps (the primary, biologist-readable artifact).
  const [humanSteps, setHumanSteps] = useState<Array<{ ordinal: number; text: string }>>([]);
  const [humanTitle, setHumanTitle] = useState<string | null>(null);
  const [humanLoading, setHumanLoading] = useState(false);
  const [humanError, setHumanError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!recordId) {
      setError('No record ID provided');
      setLoading(false);
      return;
    }
    fetch(`/api/records/${recordId}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(data => {
        if (cancelled) return
        // `/api/records/:id` returns the record envelope ({ record: { payload } });
        // the draft fields (recordId, candidates, source_artifact, status) live in
        // record.payload. Fall back to data.record / data for older shapes.
        const nested = (data as { record?: { payload?: unknown } | unknown }).record
        const unwrapped =
          (nested && typeof nested === 'object' && 'payload' in (nested as Record<string, unknown>)
            ? (nested as { payload: unknown }).payload
            : nested) ?? data
        setRecord(unwrapped as ExtractionDraft)
        // Auto-open the first candidate so the extracted-protocol steps are
        // visible immediately (not hidden behind a table-row click).
        const draft = unwrapped as ExtractionDraft
        if (draft && Array.isArray(draft.candidates) && draft.candidates.length > 0) {
          setOpenIndex(0)
        }
        setLoading(false)
      })
      .catch(err => { if (!cancelled) { setError(err.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [recordId]);

  // Fetch concise LLM human steps for the source artifact (vendor PDF). This is
  // the primary, biologist-readable protocol; the role/deck structure below is
  // the machine view.
  useEffect(() => {
    if (!record) return;
    const srcId = record.source_artifact?.id;
    if (!srcId) return;
    let cancelled = false;
    setHumanLoading(true);
    setHumanError(null);
    fetch(`/api/extraction/human-steps/${encodeURIComponent(srcId)}`, { method: 'POST' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        if (cancelled) return;
        setHumanSteps(Array.isArray(d?.steps) ? d.steps : []);
        setHumanTitle(typeof d?.title === 'string' ? d.title : null);
        setHumanLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setHumanError(err instanceof Error ? err.message : String(err));
        setHumanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [record]);

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
        const result = await response.json() as { recordId?: string; promotionId?: string };
        // Optimistically update local state
        setRecord(prev => {
          if (!prev) return null;
          const updatedCandidates = [...prev.candidates];
          updatedCandidates[index] = { ...updatedCandidates[index], status: 'promoted' as const };
          return { ...prev, candidates: updatedCandidates };
        });
        // Auto-promote the originating AI thread (Phase 0 → Phase 5 → Phase 6).
        // Failures are non-fatal: the canonical record has already been written.
        const promotedRecordId = result.recordId;
        if (promotedRecordId) {
          const linked: Array<{ recordId: string; kind?: string }> = [
            { recordId: promotedRecordId, kind: 'extracted' },
          ];
          if (result.promotionId) linked.push({ recordId: result.promotionId, kind: 'extraction-promotion' });
          try {
            await promoteThread('literature', {
              title: `Extraction promotion · ${promotedRecordId}`,
              recordId: generateConversationRecordId(),
              mode: 'automatic',
              reason: 'extraction-promotion',
              linkedArtifacts: linked,
            });
          } catch (promoteErr) {
            console.warn('Thread auto-promotion failed:', promoteErr);
          }
        }
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

  if (loading) return renderShell(<div className="extraction-review"><p>Loading extraction draft...</p></div>);
  if (error) return renderShell(<div className="extraction-review"><p role="alert">Failed to load: {error}</p></div>);
  if (!record) return renderShell(<div className="extraction-review"><p>Not found</p></div>);

  const openCandidate = openIndex !== null ? record.candidates[openIndex] : null;

  return renderShell(
    <div className="extraction-review">
      <h1>Extraction Review: {record.recordId}</h1>

      <section className="human-protocol" data-testid="human-protocol">
        <div className="human-protocol__head">
          <h2>Human protocol</h2>
          {humanTitle && <span className="human-protocol__title">{humanTitle}</span>}
        </div>
        {humanLoading ? (
          <p>Generating human-readable protocol…</p>
        ) : humanError ? (
          <p role="alert">Couldn't generate human steps: {humanError}</p>
        ) : humanSteps.length === 0 ? (
          <p>No human-readable steps available for this source.</p>
        ) : (
          <ol className="human-protocol__list">
            {humanSteps.map((s) => (
              <li key={s.ordinal}>{s.text}</li>
            ))}
          </ol>
        )}
        <p className="human-protocol__note">The structured machine/role view follows below.</p>
      </section>

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
        <div className="candidate-detail" data-testid="candidate-detail" role="complementary" aria-label="Candidate detail">
          <div className="candidate-detail__head">
            <h3>Candidate {openIndex + 1}</h3>
            <button className="candidate-detail__close" aria-label="Close" onClick={() => setOpenIndex(null)}>×</button>
          </div>
          <div className="candidate-detail__meta">
            <p>Kind: {openCandidate.target_kind} · Confidence: {openCandidate.confidence?.toFixed(2) ?? '—'} · Uncertainty: {openCandidate.uncertainty ?? '—'}</p>
            {(openCandidate.ambiguity_spans?.length ?? 0) > 0 && <h4>Ambiguity spans</h4>}
            {(openCandidate.ambiguity_spans?.length ?? 0) > 0 && (
              <ul>{(openCandidate.ambiguity_spans ?? []).map((s, i) => <li key={i}>{s.path}: {s.reason}</li>)}</ul>
            )}
          </div>
          <h4>Extracted protocol</h4>
          <CandidateTapTabSurface targetKind={openCandidate.target_kind} draft={openCandidate.draft} />
          <div className="candidate-detail__actions">
            <button
              onClick={() => promote(openIndex)}
              disabled={openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null}
            >
              Promote
            </button>
            <button
              onClick={() => reject(openIndex)}
              disabled={openCandidate.status === 'promoted' || openCandidate.status === 'rejected' || actionInProgress !== null}
            >
              Reject
            </button>
          </div>
        </div>
      )}
    </div>,
  );
}
