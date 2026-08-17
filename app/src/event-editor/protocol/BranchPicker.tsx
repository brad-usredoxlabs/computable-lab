/**
 * BranchPicker — F2 (condition-first localization UI).
 *
 * Renders one option-group per branch axis; picking an option sets
 * `branchChoices[axisId] = branchId` and (with a full localize call) the step
 * list REBUILDS to the subset. Explicit + re-visitable: every choice is a
 * visible control and the user can move back up to change an earlier axis.
 *
 * Structured `branch_axes` (schema/datatypes/condition.schema.yaml) is the
 * primary source. When the protocol only embeds branches inline in step text
 * ("a. If using BashingBead rack… / b. If using a 96-well plate…"), an inline
 * fallback detector lifts them into the same option-group shape so the picker
 * works on real extracted protocols too.
 *
 * For the first browser-tested stab, selection is local state + an optional
 * `onLocalize` hook; the actual subset-rebuild API call is the follow-on.
 */
import { useMemo, useState } from 'react'

export interface BranchPickerCondition {
  id: string
  label?: string
  then_stepIds?: string[]
}

export interface BranchPickerAxis {
  axisId: string
  label?: string
  conditions: BranchPickerCondition[]
  shared_stepIds?: string[]
}

export interface BranchSelection {
  /** axisId -> selected condition id */
  [axisId: string]: string
}

/**
 * Detect inline "a. If … / b. If …" branch sub-options in a block of step text,
 * returning one condition per branch (id from the letter, label = the If-clause
 * text). The branch markers may appear anywhere in the text (mid-line, as the
 * real extractor concatenates sub-bullets). Returns [] when fewer than 2
 * distinct branches exist.
 */
export function detectInlineBranches(text: string | undefined): BranchPickerCondition[] {
  if (!text) return []
  const markers: Array<{ idx: number; letter: string }> = []
  const re = /([a-z])\.\s+If\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    markers.push({ idx: m.index, letter: m[1]!.toLowerCase() })
  }
  if (markers.length < 2) return []
  const out = new Map<string, string>()
  for (let i = 0; i < markers.length; i++) {
    const start = markers[i]!.idx
    const end = i + 1 < markers.length ? markers[i + 1]!.idx : text.length
    const clause = text.slice(start, end).trim().replace(/\.\s*$/, '')
    out.set(`branch-${markers[i]!.letter}`, clause)
  }
  return [...out.entries()].map(([id, label]) => ({ id, label }))
}

/**
 * Lift branchy steps into option axes: one axis per step that carries >= 2
 * inline branches. Works on real extracted protocols where branch text lives
 * in the step label instead of structured branch_axes.
 */
export function branchAxesFromSteps(
  steps: Array<{ stepId?: string; label?: string; description?: string }> | undefined,
): BranchPickerAxis[] {
  if (!Array.isArray(steps)) return []
  const axes: BranchPickerAxis[] = []
  for (const step of steps) {
    const fromLabel = detectInlineBranches(step.label)
    const conditions = fromLabel.length >= 2 ? fromLabel : detectInlineBranches(step.description)
    if (conditions.length < 2) continue
    axes.push({
      axisId: `branch-${step.stepId ?? 'step'}`,
      label: `Choose a variant`,
      conditions: conditions.map((c) => ({ ...c, then_stepIds: [step.stepId ?? ''] })),
    })
  }
  return axes
}

export interface BranchPickerProps {
  /** Structured branch axes (from protocol.branch_axes) — the primary source. */
  axes?: BranchPickerAxis[]
  /** Fallback: steps with inline branches, lifted automatically. */
  steps?: Array<{ stepId?: string; label?: string; description?: string }>
  /** Called when every axis has a selection (the "localize to subset" action). */
  onLocalize?: (selection: BranchSelection) => void
}

export function BranchPicker({ axes: structuredAxes, steps, onLocalize }: BranchPickerProps) {
  const axes = useMemo(
    () => (structuredAxes && structuredAxes.length > 0 ? structuredAxes : branchAxesFromSteps(steps)),
    [structuredAxes, steps],
  )
  const [selection, setSelection] = useState<BranchSelection>({})

  if (axes.length === 0) return null

  const allChosen = axes.every((axis) => selection[axis.axisId])

  return (
    <div data-testid="branch-picker" style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '10px', border: '1px solid var(--cl-border, #ccc)', borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Conditional choices</span>
        {onLocalize && (
          <button
            data-testid="branch-localize"
            disabled={!allChosen}
            onClick={() => allChosen && onLocalize(selection)}
            style={{ fontSize: 12, padding: '2px 8px' }}
          >
            Localize
          </button>
        )}
      </div>
      {axes.map((axis) => {
        const chosen = selection[axis.axisId]
        return (
          <div key={axis.axisId} data-testid={`axis-${axis.axisId}`} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span style={{ fontSize: 12, color: 'var(--cl-text-dim)' }}>{axis.label ?? axis.axisId}</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {axis.conditions.map((cond) => {
                const active = chosen === cond.id
                return (
                  <button
                    key={cond.id}
                    data-testid={`branch-${axis.axisId}-${cond.id}`}
                    data-active={active}
                    aria-pressed={active}
                    onClick={() => setSelection((prev) => ({ ...prev, [axis.axisId]: active ? '' : cond.id }))}
                    title={cond.then_stepIds?.join(', ')}
                    style={{
                      fontSize: 12,
                      textAlign: 'left',
                      padding: '4px 8px',
                      borderRadius: 6,
                      border: active ? '2px solid var(--cl-accent, #2469f2)' : '1px solid var(--cl-border, #ccc)',
                      background: active ? 'var(--cl-accent-soft, #e8f0fe)' : 'transparent',
                      maxWidth: 240,
                      cursor: 'pointer',
                    }}
                  >
                    {cond.label ?? cond.id}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}