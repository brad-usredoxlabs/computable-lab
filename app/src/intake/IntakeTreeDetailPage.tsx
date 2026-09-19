/**
 * IntakeTreeDetailPage — one PDF's decision tree + its subgraph proposals.
 *
 * Top: the logical question axes as chip rows (the if/then questions the
 * intake pass resolved, e.g. "What is the DNA source?" -> cell culture /
 * bacteria / buccal swab), plus the execution-scale axis (tubes -> plate +
 * multichannel -> robot deck). Bottom: every branch x scale proposal with
 * its chosen branch path, active step count, scale + deck profile, state,
 * "Open in editor" deep-link into the event-graph editor for the drafted
 * subgraph, and the review loop: attach a prompt, redraft.
 *
 * Route: /intake/:treeId
 */
import { useCallback, useEffect, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AppShell } from '../shared/shell';
import { WorkspaceTabStrip } from '../shared/shell/WorkspaceTabStrip';
import {
  apiClient,
  type IntakeProposal,
  type IntakeTreeDetail,
} from '../shared/api/client';
import './intake.css';

export function IntakeTreeDetailPage(): JSX.Element {
  const { treeId } = useParams<{ treeId: string }>();
  const [tree, setTree] = useState<IntakeTreeDetail | null>(null);
  const [proposals, setProposals] = useState<IntakeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    if (!treeId) return;
    setLoading(true);
    setError(null);
    apiClient
      .getIntakeTree(treeId)
      .then((data) => {
        setTree(data.tree);
        setProposals(data.proposals);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [treeId]);

  useEffect(() => {
    load();
  }, [load]);

  const attachPrompt = async (proposal: IntakeProposal) => {
    const prompt = (promptDrafts[proposal.recordId] ?? '').trim();
    if (!prompt) return;
    setBusyId(proposal.recordId);
    setActionError(null);
    try {
      const updated = await apiClient.setIntakeProposalPrompt(proposal.recordId, prompt);
      setProposals((prev) => prev.map((p) => (p.recordId === updated.recordId ? updated : p)));
      setPromptDrafts((prev) => ({ ...prev, [proposal.recordId]: '' }));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  };

  const redraft = async (proposal: IntakeProposal) => {
    setBusyId(proposal.recordId);
    setActionError(null);
    try {
      await apiClient.redraftIntakeProposal(proposal.recordId);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : String(err));
      setBusyId(null);
    }
  };

  const body = (
    <div className="intake-page">
      <div className="intake-page__header">
        <div>
          <Link className="intake-backlink" to="/intake">← all trees</Link>
          <h1>{tree?.recordId ?? treeId}</h1>
        </div>
        {tree && (
          <span className="intake-page__hint">
            source: {tree.documentId} · {proposals.length} proposal(s)
          </span>
        )}
      </div>

      {error && <div className="intake-error">Failed to load tree: {error}</div>}
      {loading && <div className="intake-page__hint">Loading…</div>}
      {actionError && <div className="intake-error">{actionError}</div>}

      {tree && (
        <>
          {tree.axes.length === 0 && (
            <div className="intake-axis">
              <div className="intake-axis__question">No logical branch questions — linear protocol.</div>
            </div>
          )}
          {tree.axes.map((axis) => (
            <div className="intake-axis" key={axis.axisId}>
              <div className="intake-axis__question">
                {axis.question}
                {axis.origin === 'ai_suggested' ? ' (AI-suggested)' : ''}
              </div>
              <div className="intake-axis__chips">
                {axis.conditions.map((cond) => (
                  <span className="intake-chip" key={`${axis.axisId}-${cond.id}`}>
                    {cond.label ?? cond.id}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {(tree.scaleAxis?.options ?? []).length > 0 && (
            <div className="intake-axis">
              <div className="intake-axis__question">{tree.scaleAxis.question} (execution scale)</div>
              <div className="intake-axis__chips">
                {tree.scaleAxis.options.map((opt) => (
                  <span className="intake-chip intake-chip--scale" key={opt.level}>
                    {opt.label ?? opt.level}
                  </span>
                ))}
              </div>
            </div>
          )}

          <table className="intake-proposal-table">
            <thead>
              <tr>
                <th>Proposal</th>
                <th>Branch path</th>
                <th>Scale</th>
                <th>Steps</th>
                <th>Compile</th>
                <th>State</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((proposal) => (
                <tr key={proposal.recordId}>
                  <td>
                    <div>{proposal.recordId}</div>
                    {typeof proposal.revision === 'number' && proposal.revision > 1 && (
                      <div className="intake-page__hint">rev {proposal.revision}</div>
                    )}
                  </td>
                  <td className="intake-proposal__path">
                    {proposal.branchPath.map((step) => step.label ?? step.conditionId).join(' → ') || '—'}
                  </td>
                  <td>{proposal.scaleLevel}</td>
                  <td>{proposal.activeStepIds?.length ?? '—'}</td>
                  <td>{proposal.compileStatus ?? 'not_run'}</td>
                  <td>
                    <span className={`intake-proposal__state intake-proposal__state--${proposal.state}`}>
                      {proposal.state}
                    </span>
                    {proposal.reviewPrompt && (
                      <div className="intake-proposal__prompt-preview">
                        prompt: {proposal.reviewPrompt.slice(0, 80)}
                        {proposal.reviewPrompt.length > 80 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="intake-proposal__actions">
                      <Link
                        className="intake-btn"
                        to={`/event-editor/${encodeURIComponent(proposal.eventGraphRef.id)}`}
                      >
                        Open in editor
                      </Link>
                      <button
                        type="button"
                        className="intake-btn intake-btn--primary"
                        disabled={busyId === proposal.recordId || !(promptDrafts[proposal.recordId] ?? '').trim()}
                        onClick={() => void attachPrompt(proposal)}
                      >
                        Add prompt
                      </button>
                      <button
                        type="button"
                        className="intake-btn"
                        disabled={busyId === proposal.recordId || proposal.state !== 'needs_prompt'}
                        onClick={() => void redraft(proposal)}
                        title={proposal.state !== 'needs_prompt' ? 'Add a prompt first' : 'Re-draft with the attached prompt'}
                      >
                        {busyId === proposal.recordId ? 'Working…' : 'Redraft'}
                      </button>
                    </div>
                    <div className="intake-prompt-row">
                      <input
                        className="intake-prompt-input"
                        placeholder="e.g. use 1.5 mL tubes, not 2 mL — redraft"
                        value={promptDrafts[proposal.recordId] ?? ''}
                        onChange={(e) =>
                          setPromptDrafts((prev) => ({ ...prev, [proposal.recordId]: e.target.value }))
                        }
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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

export default IntakeTreeDetailPage;
