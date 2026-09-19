/**
 * BranchQuestionsPanel — the document's own if/then questions, asked at the
 * point of review.
 *
 * The vendor PDF already states them: lettered a./b. branches in the step text
 * and tables its steps point at ("Add sample ... using the table below"). The
 * intake engine lifts them into a decision tree and enumerates one subgraph
 * proposal per answer combination. This panel shows them, resolves the
 * reviewer's answers to the matching proposal, and reports which steps that
 * branch activates.
 *
 * Presentational by design: its owner (the review page) loads the review read
 * model once and hands down `axes` + `proposals`, so the questions and the step
 * list cannot drift apart or be fetched twice. It never invents a question — an
 * empty axis list renders the owner's `gap` sentence and nothing else.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import type { IntakeAxis, IntakeProposal } from '../../shared/api/client'

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
  axes: IntakeAxis[]
  proposals: IntakeProposal[]
  /** Shown when the document has no answerable questions (never a guess). */
  gap?: string | null
  onResolved?: (resolved: ResolvedReviewBranch | null) => void
  /** Fired after a redraft lands, so the owner can reload the review. */
  onRedrafted?: () => void
}

/** The diagnostic that explains the outcome: the first ERROR, else the first. */
function compileReason(
  diagnostics: Array<{ severity: 'error' | 'warning'; code: string; message: string }>,
): string {
  const worst = diagnostics.find((d) => d.severity === 'error') ?? diagnostics[0];
  return worst ? `${worst.code}: ${worst.message}` : 'no diagnostics recorded';
}

const ORIGIN_LABEL: Record<string, string> = {
  document_branch: 'from the document’s branch text',
  document_table: 'from a table in the document',
  ai_suggested: 'raised by the AI pass (document evidence attached)',
}

export default function BranchQuestionsPanel({
  axes,
  proposals,
  gap,
  onResolved,
  onRedrafted,
}: BranchQuestionsPanelProps) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const [prompt, setPrompt] = useState('')
  const [redrafting, setRedrafting] = useState(false)
  const [redraftNote, setRedraftNote] = useState<string | null>(null)
  const [redraftError, setRedraftError] = useState<string | null>(null)

  const answeredAll = axes.length > 0 && axes.every((a) => typeof choices[a.axisId] === 'string')

  const matchedProposal = useMemo<IntakeProposal | null>(() => {
    if (!answeredAll) return null
    return (
      proposals.find(
        (p) =>
          p.branchPath.length === axes.length &&
          p.branchPath.every((entry) => choices[entry.axisId] === entry.conditionId),
      ) ?? null
    )
  }, [proposals, axes, choices, answeredAll])

  const activeStepIds = useMemo<string[]>(
    () => (matchedProposal && Array.isArray(matchedProposal.activeStepIds) ? matchedProposal.activeStepIds : []),
    [matchedProposal],
  )

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
   * prompt to the proposal, run the redraft, then let the owner reload the
   * review so the new revision's graph is what the reviewer sees next.
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
      onRedrafted?.()
    } catch (err) {
      setRedraftError(err instanceof Error ? err.message : 'Redraft failed')
    } finally {
      setRedrafting(false)
    }
  }, [matchedProposal, prompt, onRedrafted])

  if (axes.length === 0) {
    return (
      <section className="branch-questions" data-testid="branch-questions">
        <p className="branch-questions__muted">
          {gap ?? 'This document states no if/then questions that the intake engine could derive.'}
        </p>
      </section>
    )
  }

  return (
    <section className="branch-questions" data-testid="branch-questions">
      <header className="branch-questions__header">
        <h3 className="branch-questions__title">This document asks</h3>
        <p className="branch-questions__subtitle">
          {axes.length} question{axes.length === 1 ? '' : 's'} → {proposals.length} branch realization
          {proposals.length === 1 ? '' : 's'}
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
          <p className="branch-questions__muted">Answer every question to see which steps this branch runs.</p>
        ) : matchedProposal ? (
          <p className="branch-questions__resolved">
            This branch runs <strong>{activeStepIds.length}</strong> step
            {activeStepIds.length === 1 ? '' : 's'}
            {activeStepIds.length > 0 ? ` (${activeStepIds.join(', ')})` : ''} at{' '}
            <strong>{matchedProposal.scaleLevel.replace(/_/g, ' ')}</strong> scale.
          </p>
        ) : (
          <p className="branch-questions__error" role="alert">
            No realization was enumerated for this combination — the branch product was capped. Say so rather
            than guessing.
          </p>
        )}

        {matchedProposal && matchedProposal.compileStatus && matchedProposal.compileStatus !== 'complete' ? (
          <p className="branch-questions__muted" data-testid="branch-questions-compile">
            Compile: {matchedProposal.compileStatus}
            {matchedProposal.compileDiagnostics && matchedProposal.compileDiagnostics.length > 0
              ? ` — ${compileReason(matchedProposal.compileDiagnostics)}`
              : matchedProposal.compileStatus === 'not_run'
                ? ' (no compile runner configured)'
                : ' (no diagnostics recorded)'}
          </p>
        ) : null}

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