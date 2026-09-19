/**
 * IntakeTreeListPage — nightly corpus-intake review queue.
 *
 * One card per protocol-decision-tree the intake runner produced: source
 * document, question-axis count, scale levels, proposal count. Click a card
 * to open the tree detail (decision tree + subgraph proposals).
 *
 * Route: /intake
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../shared/shell';
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip';
import { apiClient, type IntakeTreeSummary } from '../shared/api/client';
import './intake.css';

export function IntakeTreeListPage(): JSX.Element {
  const navigate = useNavigate();
  const [trees, setTrees] = useState<IntakeTreeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    apiClient
      .listIntakeTrees()
      .then((list) => setTrees(list))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const body = (
    <div className="intake-page">
      <div className="intake-page__header">
        <h1>Protocol Intake</h1>
        <span className="intake-page__hint">
          Nightly vendor-PDF crawl: each document yields a decision tree and one subgraph
          proposal per branch &times; scale.
        </span>
      </div>
      {error && <div className="intake-error">Failed to load decision trees: {error}</div>}
      {loading && <div className="intake-page__hint">Loading…</div>}
      {!loading && !error && trees.length === 0 && (
        <div className="intake-page__hint">
          No decision trees yet. The nightly crawl (or `npm run corpus:intake -w server`)
          produces them.
        </div>
      )}
      <div className="intake-tree-list">
        {trees.map((tree) => {
          const title =
            (tree.sourcePdf && typeof tree.sourcePdf.title === 'string' && tree.sourcePdf.title) ||
            tree.documentId;
          return (
            <button
              key={tree.recordId}
              type="button"
              className="intake-tree-card"
              onClick={() => navigate(`/intake/${encodeURIComponent(tree.recordId)}`)}
            >
              <div className="intake-tree-card__title">{title}</div>
              <div className="intake-tree-card__meta">
                {tree.recordId} · {tree.axisCount} question axis(es) · scales:{' '}
                {tree.scaleLevels.length} · proposals: {tree.proposalCount}
                {tree.generatedAt ? ` · ${tree.generatedAt.slice(0, 10)}` : ''}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <AppShell
      brand="Protocol Intake"
      layout="workspace"
      topbarTabs={<WorkspaceTabStrip />}
      leftPane={<div className="intake-scroll">{body}</div>}
    />
  );
}

export default IntakeTreeListPage;
