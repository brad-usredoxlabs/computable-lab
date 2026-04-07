import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiClient, type RunWorkspaceResponse } from '../../shared/api/client'
import type { UseAiChatReturn } from '../../shared/hooks/useAiChat'
import type { UseEvidenceAssemblyReturn } from '../hooks/useEvidenceAssembly'
import type { RecordEnvelope } from '../../types/kernel'
import { RunAiSuggestions } from './RunAiSuggestions'
import { RunClaimDraftPanel } from './RunClaimDraftPanel'
import { AssertionDraftPanel } from './AssertionDraftPanel'
import { ProvenanceChain } from './ProvenanceChain'

type ReviewStatus = 'accepted' | 'rejected' | 'draft'

interface RunClaimsTabProps {
  workspace: RunWorkspaceResponse | null
  onRefresh: () => Promise<void>
  onExportAnalysis?: () => void
  exportingAnalysis?: boolean
  runId: string
  chat: UseAiChatReturn
  assembly: UseEvidenceAssemblyReturn
}

interface ClaimBundle {
  claim: RecordEnvelope | null
  assertions: RecordEnvelope[]
  evidence: RecordEnvelope[]
  status: ReviewStatus
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function reviewStatusFromRecord(record: RecordEnvelope | null): ReviewStatus {
  if (!record) return 'draft'
  const keywords = asStringArray(asObject(record.payload).keywords)
  if (keywords.includes('review:accepted')) return 'accepted'
  if (keywords.includes('review:rejected')) return 'rejected'
  return 'draft'
}

function mergeReviewKeyword(payload: Record<string, unknown>, status: Exclude<ReviewStatus, 'draft'>): Record<string, unknown> {
  const keywords = new Set(asStringArray(payload.keywords))
  keywords.delete('review:accepted')
  keywords.delete('review:rejected')
  keywords.add(`review:${status}`)
  return {
    ...payload,
    keywords: Array.from(keywords),
  }
}

function recordRefId(value: unknown): string | null {
  const obj = asObject(value)
  return typeof obj.id === 'string' ? obj.id : null
}

function collectClaimBundles(workspace: RunWorkspaceResponse | null): ClaimBundle[] {
  if (!workspace) return []
  const claimById = new Map<string, RecordEnvelope>()
  const evidenceByAssertionId = new Map<string, RecordEnvelope[]>()

  for (const evidence of workspace.evidence) {
    const payload = asObject(evidence.payload)
    const supports = Array.isArray(payload.supports) ? payload.supports : []
    for (const support of supports) {
      const assertionId = recordRefId(support)
      if (!assertionId) continue
      const current = evidenceByAssertionId.get(assertionId) ?? []
      current.push(evidence)
      evidenceByAssertionId.set(assertionId, current)
    }
  }

  const grouped = new Map<string, ClaimBundle>()
  for (const assertion of workspace.assertions) {
    const payload = asObject(assertion.payload)
    const claimId = recordRefId(payload.claim_ref) || `orphan:${assertion.recordId}`
    const current = grouped.get(claimId) ?? {
      claim: null,
      assertions: [],
      evidence: [],
      status: 'draft' as ReviewStatus,
    }
    current.assertions.push(assertion)
    const linkedEvidence = evidenceByAssertionId.get(assertion.recordId) ?? []
    current.evidence.push(...linkedEvidence)
    grouped.set(claimId, current)
  }

  for (const claim of workspace.claims) {
    claimById.set(claim.recordId, claim)
  }

  for (const [claimId, bundle] of grouped.entries()) {
    bundle.claim = claimById.get(claimId) ?? null
    const statuses = [
      reviewStatusFromRecord(bundle.claim),
      ...bundle.assertions.map(reviewStatusFromRecord),
      ...bundle.evidence.map(reviewStatusFromRecord),
    ]
    bundle.status = statuses.includes('rejected')
      ? 'rejected'
      : statuses.every((status) => status === 'accepted')
        ? 'accepted'
        : 'draft'
  }

  return Array.from(grouped.values()).sort((a, b) => {
    const rank = (status: ReviewStatus) => status === 'draft' ? 0 : status === 'rejected' ? 1 : 2
    return rank(a.status) - rank(b.status)
  })
}

function claimStatement(bundle: ClaimBundle): string {
  const payload = bundle.claim ? asObject(bundle.claim.payload) : null
  if (payload && typeof payload.statement === 'string') return payload.statement
  const assertionPayload = bundle.assertions[0] ? asObject(bundle.assertions[0].payload) : null
  return typeof assertionPayload?.statement === 'string' ? assertionPayload.statement : 'Draft claim'
}

export function RunClaimsTab({ workspace, onRefresh, onExportAnalysis, exportingAnalysis = false, runId, chat, assembly }: RunClaimsTabProps) {
  const [savingBundleId, setSavingBundleId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bundles = useMemo(() => collectClaimBundles(workspace), [workspace])

  const updateBundleStatus = async (bundle: ClaimBundle, status: Exclude<ReviewStatus, 'draft'>) => {
    setSavingBundleId(bundle.claim?.recordId || bundle.assertions[0]?.recordId || null)
    setMessage(null)
    setError(null)
    try {
      const updates = [bundle.claim, ...bundle.assertions, ...bundle.evidence].filter(Boolean) as RecordEnvelope[]
      for (const record of updates) {
        await apiClient.updateRecord(record.recordId, mergeReviewKeyword(asObject(record.payload), status))
      }
      setMessage(`Marked bundle as ${status}.`)
      await onRefresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to mark bundle as ${status}`)
    } finally {
      setSavingBundleId(null)
    }
  }

  if (!workspace) {
    return (
      <section className="run-workspace-card">
        <h2>Claims</h2>
        <p>No run workspace loaded.</p>
      </section>
    )
  }

  return (
    <section className="run-workspace-card">
      <div className="run-claims-tab__header">
        <div>
          <h2>Claims Review</h2>
          <p>Review drafted claims, linked assertions, and evidence bundles generated from run results before treating them as accepted outputs.</p>
        </div>
        <div className="run-claims-tab__stats">
          <span>{bundles.length} bundles</span>
          <span>{workspace.evidence.length} evidence</span>
          <span>{workspace.assertions.length} assertions</span>
          {onExportAnalysis ? (
            <button type="button" onClick={onExportAnalysis} disabled={exportingAnalysis}>
              {exportingAnalysis ? 'Exporting…' : 'Export Analysis Bundle'}
            </button>
          ) : null}
        </div>
      </div>

      {message ? <div className="run-claims-tab__message run-claims-tab__message--success">{message}</div> : null}
      {error ? <div className="run-claims-tab__message run-claims-tab__message--error">{error}</div> : null}

      {bundles.length === 0 ? (
        <div className="run-claims-tab__empty">
          <p>No drafted claims are attached to this run yet.</p>
          <p>Return to Results mode, review a measurement, and use the evidence draft action to seed the claims surface.</p>
        </div>
      ) : (
        <div className="run-claims-tab__list">
          {bundles.map((bundle) => {
            const bundleId = bundle.claim?.recordId || bundle.assertions[0]?.recordId || 'bundle'
            const isSaving = savingBundleId === bundleId
            return (
              <article key={bundleId} className={`run-claims-bundle run-claims-bundle--${bundle.status}`}>
                <div className="run-claims-bundle__header">
                  <div>
                    <div className="run-claims-bundle__status">{bundle.status.toUpperCase()}</div>
                    <h3>{claimStatement(bundle)}</h3>
                  </div>
                  <div className="run-claims-bundle__actions">
                    <button type="button" onClick={() => void updateBundleStatus(bundle, 'accepted')} disabled={isSaving}>
                      {isSaving ? 'Saving…' : 'Accept'}
                    </button>
                    <button type="button" onClick={() => void updateBundleStatus(bundle, 'rejected')} disabled={isSaving}>
                      Reject
                    </button>
                    {bundle.claim ? (
                      <Link to={`/records/${encodeURIComponent(bundle.claim.recordId)}/edit`}>Edit Claim</Link>
                    ) : bundle.assertions[0] ? (
                      <Link to={`/records/${encodeURIComponent(bundle.assertions[0].recordId)}/edit`}>Edit Assertion</Link>
                    ) : null}
                  </div>
                </div>

                <div className="run-claims-bundle__grid">
                  <section>
                    <h4>Claim</h4>
                    {bundle.claim ? (
                      <>
                        <p>{String(asObject(bundle.claim.payload).statement || bundle.claim.recordId)}</p>
                        <Link to={`/records/${encodeURIComponent(bundle.claim.recordId)}`}>Open claim record</Link>
                      </>
                    ) : (
                      <p>No explicit claim record linked to this bundle yet.</p>
                    )}
                  </section>
                  <section>
                    <h4>Assertions</h4>
                    <ul>
                      {bundle.assertions.map((assertion) => (
                        <li key={assertion.recordId}>
                          <strong>{assertion.recordId}</strong>
                          {' · '}
                          {String(asObject(assertion.payload).statement || 'Assertion draft')}
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h4>Evidence</h4>
                    <ul>
                      {bundle.evidence.map((evidence) => {
                        const payload = asObject(evidence.payload)
                        const quality = asObject(payload.quality)
                        return (
                          <li key={evidence.recordId}>
                            <strong>{evidence.recordId}</strong>
                            {' · '}
                            {typeof payload.title === 'string' ? payload.title : 'Evidence draft'}
                            {quality.origin ? ` · ${String(quality.origin)}` : ''}
                          </li>
                        )
                      })}
                    </ul>
                  </section>
                </div>
              </article>
            )
          })}
        </div>
      )}
      <AssertionDraftPanel runId={runId} assembly={assembly} workspace={workspace} />
      <ProvenanceChain workspace={workspace} />
      <RunClaimDraftPanel runId={runId} chat={chat} onRefresh={onRefresh} />
      <RunAiSuggestions runId={runId} tab="claims" chat={chat} />

      <style>{`
        .run-claims-tab__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1rem;
          flex-wrap: wrap;
        }
        .run-claims-tab__header h2 { margin: 0; }
        .run-claims-tab__stats {
          display: flex;
          gap: 0.75rem;
          align-items: center;
          flex-wrap: wrap;
          font-size: 0.85rem;
          color: #64748b;
        }
        .run-claims-tab__stats button {
          padding: 0.4rem 0.75rem;
          border-radius: 999px;
          border: 1px solid #b6d1ff;
          background: #eff6ff;
          color: #0969da;
          font-weight: 700;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .run-claims-tab__stats button:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .run-claims-tab__message {
          border-radius: 8px;
          padding: 0.6rem 0.85rem;
          margin-bottom: 0.75rem;
          font-size: 0.85rem;
        }
        .run-claims-tab__message--success {
          background: #dcfce7;
          border: 1px solid #86efac;
          color: #15803d;
        }
        .run-claims-tab__message--error {
          background: #fee2e2;
          border: 1px solid #fca5a5;
          color: #b91c1c;
        }
        .run-claims-tab__empty {
          padding: 1.5rem;
          text-align: center;
          color: #94a3b8;
        }
        .run-claims-tab__list {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .run-claims-bundle {
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 1rem;
          background: #f8fafc;
        }
        .run-claims-bundle--accepted {
          border-color: #86efac;
          background: #f0fdf4;
        }
        .run-claims-bundle--rejected {
          border-color: #fca5a5;
          background: #fef2f2;
          opacity: 0.7;
        }
        .run-claims-bundle__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 0.75rem;
        }
        .run-claims-bundle__header h3 { margin: 0.25rem 0 0; }
        .run-claims-bundle__status {
          font-size: 0.7rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          color: #64748b;
        }
        .run-claims-bundle--accepted .run-claims-bundle__status { color: #15803d; }
        .run-claims-bundle--rejected .run-claims-bundle__status { color: #b91c1c; }
        .run-claims-bundle__actions {
          display: flex;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .run-claims-bundle__actions button {
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          border: 1px solid #d8dee4;
          background: #ffffff;
          font-size: 0.8rem;
          font-weight: 600;
          cursor: pointer;
        }
        .run-claims-bundle__actions button:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .run-claims-bundle__actions a {
          padding: 0.35rem 0.7rem;
          border-radius: 999px;
          border: 1px solid #b6d1ff;
          background: #eff6ff;
          color: #0969da;
          font-size: 0.8rem;
          font-weight: 600;
          text-decoration: none;
        }
        .run-claims-bundle__grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 0.75rem;
        }
        .run-claims-bundle__grid section h4 {
          margin: 0 0 0.35rem;
          font-size: 0.85rem;
          color: #64748b;
        }
        .run-claims-bundle__grid section ul {
          margin: 0;
          padding-left: 1rem;
        }
        .run-claims-bundle__grid section li {
          font-size: 0.85rem;
          margin-bottom: 0.3rem;
        }
        @media (max-width: 760px) {
          .run-claims-bundle__grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </section>
  )
}
