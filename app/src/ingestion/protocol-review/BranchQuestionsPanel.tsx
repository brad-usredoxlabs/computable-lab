/**
 * BranchQuestionsPanel — the document's own if/then questions, asked at the
 * point of review.
 *
 * The vendor PDF already states them: lettered a./b. branches in the step text
 * and tables its steps point at ("Add sample ... using the table below"). The
 * intake engine lifts them into a decision tree and enumerates one subgraph
 * proposal per answer combination. This panel shows them for the artifact the
 * reviewer has open, resolves the reviewer's answers to the matching proposal,
 * and reports which steps that branch activates.
 *
 * It never invents a question: no attributable tree means the panel says so and
 * stays quiet (see `getIntakeReview` returning null on a gap).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type {
  IntakeAxis,
  IntakeProposal,
  IntakeReviewDetailResponse,
} from '../../shared/api/client'

export interface ResolvedReviewBranch {
  axes: IntakeAxis[]
  /** axisId -> conditionId, one entry per answered axis. */
  choices: Record<string, string>
  /** The proposal whose branch path matches every answer, when complete. */
  proposal: IntakeProposal | null
  /** Step ids the chosen answers activate. */
  activeStepIds: string[]
}

export interface BranchQuestionsPanelProps {
  /** The vendor-pdf artifact record the reviewer has open (VPDF-...). */
  artifactId: string
  onResolved?: (resolved: ResolvedReviewBranch | null) => void
}

const ORIGIN_LABEL: Record<string, string> = {
  document_branch: 'from the document’s branch text',
  document_table: 'from a table in the document',
  ai_suggested: 'raised by the AI pass (document evidence attached)',
}

export default function BranchQuestionsPanel({ artifactId, onResolved }: BranchQuestionsPanelProps) {
  const [review, setReview] = useState<IntakeReviewDetailResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [prompt, setPrompt] = useState('')
  const [redrafting, setRedrafting] = useState(false)
  const [redraftNote, setRedraftNote] = useState<string | null>(null)
  const [redraftError, setRedraftError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!artifactId) {
      setReview(null)
      return
    }
    setLoading(true)
    setLoadError(null)
    apiClient
      .getIntakeReview(artifactId)
      .then((res) => {
        if (cancelled) return
        setReview(res)
        setChoices((prev) => {
          // Keep the reviewer's answers across a reload when they still apply.
          const next: Record<string, string> = {}
          for (const axis of res?.tree.axes ?? []) {
            const chosen = prev[axis.axisId]
            if (chosen && axis.conditions.some((c) => c.id === chosen)) next[axis.axisId] = chosen
          }
          return next
        })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setReview(null)
        setLoadError(err instanceof Error ? err.message : 'Could not load the document’s questions')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [artifactId, reloadToken])

  const axes = useMemo<IntakeAxis[]>(() => review?.tree.axes ?? [], [review])

  const answeredAll = axes.length > 0 && axes.every((a) => typeof choices[a.axisId] === 'string')

  const matchedProposal = useMemo<IntakeProposal | null>(() => {
    if (!review || !answeredAll) return null
    return (
      review.proposals.find(
        (p) =>
          p.branchPath.length === axes.length &&
          p.branchPath.every((entry) => choices[entry.axisId] === entry.conditionId),
      ) ?? null
    )
  }, [review, axes, choices, answeredAll])

  const activeStepIds = useMemo<string[]>(() => {
    if (!matchedProposal) return []
    if (Array.isArray(matchedProposal.activeStepIds)) return matchedProposal.activeStepIds
    return []
  }, [matchedProposal])

  useEffect(() => {
    if (!onResolved) return
    if (!answeredAll) {
      onResolved(null)
      return
    }
    onResolved({ axes, choices, proposal: matchedProposal, activeStepIds })
  }, [axes, choices, answeredAll, matchedProposal, activeStepIds, onResolved])

  const choose = useCallback((axisId: string, conditionId: string) => {
    setChoices((prev) => ({ ...prev, [axisId]: conditionId }))
  }, [])

  /**
   * Send an instruction back to the AI for THIS branch realization: attach the
   * prompt to the proposal, run the redraft, then reload the review so the new
   * revision's graph is what the reviewer sees next.
   */
  const handleRedraft = useCallback(async () => {
    const proposalId = matchedProposal?.recordId
    if (!proposalId) return
    setRedrafting(true)
    setRedraftError(null)
    setRedraftNote(null)
    try {
      await apiClient.setIntakeProposalPrompt(proposalId, prompt)
      const result = await apiClient.redraftIntakeProposal(proposalId)
      setRedraftNote(`Redrafted ${result.proposalRecordIds.join(', ') || proposalId}.`)
      setPrompt('')
      setReloadToken((n) => n + 1)
    } catch (err) {
      setRedraftError(err instanceof Error ? err.message : 'Redraft failed')
    } finally {
      setRedrafting(false)
    }
  }, [matchedProposal, prompt])

  if (!artifactId) return null

  if (loading) {
    return (
      <section className="branch-questions" data-testid="branch-questions">
        <p className="branch-questions__muted">Reading the document’s questions…</p>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="branch-questions" data-testid="branch-questions">
        <p className="branch-questions__error" role="alert">
          {loadError}
        </p>
      </section>
    )
  }

  if (!review || axes.length === 0) {
    return (
      <section className="branch-questions" data-testid="branch-questions">
        <p className="branch-questions__muted">
          This document states no if/then questions that the intake engine could derive
          {review ? ' (its steps carry no branches and no table its steps point at)' : ' (no decision tree is attributable to it yet)'}.
        </p>
      </section>
    )
  }

  return (
    <section className="branch-questions" data-testid="branch-questions">
      <header className="branch-questions__header">
        <h3 className="branch-questions__title">This document asks</h3>
        <p className="branch-questions__subtitle">
          {review.tree.axisCount} question{review.tree.axisCount === 1 ? '' : 's'} →{' '}
          {review.tree.proposalCount} branch realization{review.tree.proposalCount === 1 ? '' : 's'}
          {review.matchVia === 'sha256' ? ' · matched to this PDF by content hash' : ''}
        </p>
      </header>

      {axes.map((axis) => (
        <fieldset key={axis.axisId} className="branch-questions__axis" data-testid={`axis-${axis.axisId}`}>
          <legend className="branch-questions__legend">
            {axis.question}
            {axis.origin ? (
              <span className="branch-questions__origin"> — {ORIGIN_LABEL[axis.origin] ?? axis.origin}</span>
            ) : null}
          </legend>
          <div className="branch-questions__options">
            {axis.conditions.map((cond) => (
              <label key={cond.id} className="branch-questions__option">
                <input
                  type="radio"
                  name={axis.axisId}
                  value={cond.id}
                  checked={choices[axis.axisId] === cond.id}
                  onChange={() => choose(axis.axisId, cond.id)}
                />
                <span>{cond.label ?? cond.id}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      <footer className="branch-questions__footer" data-testid="branch-questions-result">
        {!answeredAll ? (
          <p className="branch-questions__muted">
            Answer every question to see which steps this branch runs.
          </p>
        ) : matchedProposal ? (
          <p className="branch-questions__resolved">
            This branch runs <strong>{activeStepIds.length}</strong> step
            {activeStepIds.length === 1 ? '' : 's'}
            {activeStepIds.length > 0 ? ` (${activeStepIds.join(', ')})` : ''} at{' '}
            <strong>{matchedProposal.scaleLevel.replace(/_/g, ' ')}</strong> scale.
          </p>
        ) : (
          <p className="branch-questions__error" role="alert">
            No realization was enumerated for this combination — the branch product was capped. Say so
            rather than guessing.
          </p>
        )}

        {matchedProposal ? (
          <div className="branch-questions__redraft" data-testid="branch-questions-redraft">
            <label className="branch-questions__redraft-label" htmlFor="branch-questions-prompt">
              Send this branch back to the AI
            </label>
            <textarea
              id="branch-questions-prompt"
              className="branch-questions__prompt"
              rows={2}
              value={prompt}
              placeholder="e.g. the 550 µl volume is for the tube format; keep the rack format at 750 µl"
              disabled={redrafting}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <button
              type="button"
              className="branch-questions__redraft-button"
              disabled={redrafting || prompt.trim().length === 0}
              onClick={() => void handleRedraft()}
            >
              {redrafting ? 'Redrafting…' : 'Redraft this branch'}
            </button>
            {redraftNote ? (
              <p className="branch-questions__muted" data-testid="redraft-note">
                {redraftNote}
              </p>
            ) : null}
            {redraftError ? (
              <p className="branch-questions__error" role="alert" data-testid="redraft-error">
                {redraftError}
              </p>
            ) : null}
          </div>
        ) : null}
      </footer>
    </section>
  )
}