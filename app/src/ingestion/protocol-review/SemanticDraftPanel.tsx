/**
 * SemanticDraftPanel — the MEANT editor (spec §3 W2, acceptance A2/A3/A4).
 *
 * The right pane of the wave-2 review route: a TapTab editor over the
 * extraction-draft's candidates[0].draft (a protocol-kind payload — the merged
 * W2-6 pass mints exactly that), the family's branch/variant steps visible
 * unfiltered, and each step's intent.provenance[] rendered as semantic-evidence
 * chips that jump the SAID pane (onGotoPage(pageStart) — the same
 * data-vpdf-page machinery the page already ships).
 *
 * Save rides the applyProtocolEdit lock discipline (protocolEditOps.ts:367-393,
 * reused READ-ONLY): meta.contentSha expectedSha, deepEqual no-op, ONE atomic
 * write, the stale-409 reload message with no retry. NO rung badges (OQ4/M6 —
 * merged StepProvenanceRef is rung-agnostic; inventing a rung value is a banned
 * re-mint). NO question-asking here: the family's questions are shown as data
 * and asked at the realization entry (ProtocolLocalizationThread).
 */
import { useCallback, useMemo, useState } from 'react'
import { ProjectionTapTabEditor } from '../../editor/taptab/TapTabEditor'
import type { EditorProjectionResponse } from '../../types/uiSpec'
import { describeWriteRejection, saveSemanticDraftEdit } from './semanticDraft'

export interface SemanticDraftPanelProps {
  /** The XDR-* record the save PUTs (M3: PUT /records/:XDR + expectedSha). */
  xdrRecordId: string
  candidateIndex: number
  /** candidates[candidateIndex].draft — the protocol-kind MEANT payload. */
  draft: Record<string, unknown>
  /** The SAID candidate's source.pageCount — the anchor range guard (bait 7). */
  sourcePageCount?: number
  /** The protocol-surface projection; null until it loads (evidence + save still render). */
  projection: EditorProjectionResponse | null
  /** Jump the left (SAID) pane to a page. */
  onGotoPage: (pageNumber: number) => void
}

interface ProvenanceRef {
  kind?: string
  type?: string
  id?: string
  label?: string
  pageStart?: number
  pageEnd?: number
}

interface DraftStep {
  stepId?: string
  label?: string
  ordinal?: number
  intent?: { provenance?: ProvenanceRef[] }
}

function stepsOf(draft: Record<string, unknown>): DraftStep[] {
  return Array.isArray(draft.steps) ? (draft.steps as DraftStep[]) : []
}

function branchAxesOf(draft: Record<string, unknown>): Array<{ axisId?: string; label?: string; conditions?: Array<{ id?: string; label?: string }> }> {
  return Array.isArray(draft.branch_axes) ? (draft.branch_axes as never) : []
}

export function SemanticDraftPanel({
  xdrRecordId,
  candidateIndex,
  draft,
  sourcePageCount,
  projection,
  onGotoPage,
}: SemanticDraftPanelProps) {
  const [draftBody, setDraftBody] = useState<Record<string, unknown>>(draft)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // TapTab keeps the edited payload in local state ONLY until Save (the same
  // posture the route had before; W2-8 adds the persistence the edits deserve).
  const handleTapTabUpdate = useCallback((serialized: Record<string, unknown>, isDirty?: boolean) => {
    if (isDirty === false) return
    setDraftBody((prev) => ({ ...prev, ...serialized }))
    setDirty(true)
  }, [])

  const steps = useMemo(() => stepsOf(draftBody), [draftBody])
  const axes = useMemo(() => branchAxesOf(draftBody), [draftBody])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setError(null)
    setNote(null)
    try {
      const outcome = await saveSemanticDraftEdit(xdrRecordId, candidateIndex, draftBody)
      setNote(outcome.wrote ? 'Saved. Reload to re-read the draft from the server.' : 'Nothing to save — this draft already says that.')
      setDirty(false)
    } catch (err) {
      setError(describeWriteRejection(err))
    } finally {
      setSaving(false)
    }
  }, [xdrRecordId, candidateIndex, draftBody])

  return (
    <section className="semantic-draft" data-testid="semantic-draft-panel" aria-label="MEANT — draft semantic protocol">
      <header className="semantic-draft__header">
        <h3 className="semantic-draft__title">Draft semantic protocol (MEANT)</h3>
        <p className="semantic-draft__meta">
          {xdrRecordId} · candidates[{candidateIndex}].draft · edits save to the draft record, never to the SAID
        </p>
      </header>

      <div className="semantic-draft__taptab" data-testid="semantic-draft-taptab">
        {projection ? (
          <ProjectionTapTabEditor
            blocks={projection.blocks}
            slots={projection.slots}
            data={draftBody}
            onUpdate={handleTapTabUpdate}
          />
        ) : (
          <p className="semantic-draft__hint">
            The protocol editor projection is unavailable — the draft's evidence and Save still work.
          </p>
        )}
      </div>

      {/* Family clause (A4): every branch/variant step is listed unfiltered,
          and the family's questions render as DATA (asking lives at the
          realization entry — no radio inputs here). */}
      {axes.length > 0 ? (
        <div className="semantic-draft__branch-axes" data-testid="semantic-draft-branch-axes">
          <h4 className="semantic-draft__axes-heading">Branches in this family (answered at localization)</h4>
          {axes.map((axis, ai) => (
            <div key={axis.axisId ?? ai} className="semantic-draft__axis">
              <span className="semantic-draft__axis-label">{axis.label ?? axis.axisId}</span>
              <ul className="semantic-draft__axis-conditions">
                {(axis.conditions ?? []).map((condition, ci) => (
                  <li key={condition.id ?? ci}>{condition.label ?? condition.id}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      {/* Semantic evidence (A2): intent.provenance chips jump the SAID pane. */}
      <div className="semantic-draft__evidence" data-testid="semantic-draft-evidence">
        <h4 className="semantic-draft__evidence-heading">Semantic evidence (jumps the SAID)</h4>
        <ul className="semantic-draft__steps">
          {steps.map((step, si) => {
            const refs = Array.isArray(step.intent?.provenance) ? step.intent!.provenance! : []
            const stepKey = step.stepId ?? `step-${si}`
            return (
              <li key={stepKey} className="semantic-draft__step">
                <span className="semantic-draft__step-label">{step.label ?? stepKey}</span>
                {refs.map((ref, ri) => {
                  const page = typeof ref.pageStart === 'number' ? ref.pageStart : undefined
                  const outOfRange =
                    page !== undefined && typeof sourcePageCount === 'number' && page > sourcePageCount
                  return (
                    <button
                      key={`${stepKey}-${ri}`}
                      type="button"
                      className="semantic-draft__chip"
                      data-testid={`semantic-evidence-${stepKey}${ri > 0 ? `-${ri}` : ''}`}
                      disabled={outOfRange}
                      title={
                        outOfRange
                          ? `Anchor page ${page} is beyond the source document (${sourcePageCount} pages)`
                          : page !== undefined
                            ? `Jump to page ${page}`
                            : 'No page anchor'
                      }
                      onClick={() => {
                        if (page !== undefined && !outOfRange) onGotoPage(page)
                      }}
                    >
                      {ref.label ?? ref.id ?? 'evidence'}
                      {page !== undefined ? ` · p${page}` : ''}
                      {outOfRange ? ' (out of range)' : ''}
                    </button>
                  )
                })}
              </li>
            )
          })}
        </ul>
      </div>

      <footer className="semantic-draft__footer">
        <button
          type="button"
          className="semantic-draft__save"
          data-testid="semantic-draft-save"
          disabled={!dirty || saving}
          onClick={() => void handleSave()}
        >
          {saving ? 'Saving…' : 'Save draft'}
        </button>
        {note ? <span className="semantic-draft__note" data-testid="semantic-draft-note">{note}</span> : null}
        {error ? (
          <span className="semantic-draft__error" data-testid="semantic-draft-error" role="alert">
            {error}
          </span>
        ) : null}
      </footer>
    </section>
  )
}
