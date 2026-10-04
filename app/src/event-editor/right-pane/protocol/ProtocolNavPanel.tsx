/**
 * ProtocolNavPanel — the left navigation rail of the three-pane agent harness.
 *
 * Renders the protocol's step CONCEPTS (from ProtocolSelectionContext — the
 * shared source of truth ProtocolTabPanel publishes) as the scientist's
 * navigation: click a step to FOCUS its realization on the deck (single-step
 * investigate mode). A step with a cached sub-graph carries a realization
 * badge; the currently focused step is highlighted. This is the "what are we
 * realizing / which step am I on" rail — the conversational subject, not more
 * chrome (plan §9: Left = navigate related work + inspect provenance).
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import type { ProtocolRoleSummary, ProtocolStepSummary } from '../../protocol/ProtocolSelectionContext'
import { AttachProtocolPanel } from './AttachProtocolPanel'
import { ProtocolIdentity } from './ProtocolIdentity'
import { ProtocolStepEditModal } from './ProtocolStepEditModal'
import { apiClient } from '../../../shared/api/client'
import { deleteProtocolStep, stepSummaries } from './protocolStepEditing'
import './AttachProtocolPanel.css'
import './ProtocolNavPanel.css'

export interface ProtocolNavPanelProps {
  /** Surface label to lead the rail (e.g. the run title). */
  title?: string
  /** The run this rail belongs to — needed to attach a protocol when none is. */
  runId?: string
  /** The run's study — scopes the protocol search. */
  studyId?: string
}

/** A hover/focus step with its anchor rect (viewport coords) for the fixed tooltip. */
interface StepTip {
  stepId: string
  text: string
  x: number
  y: number
}

export function ProtocolNavPanel({ title, runId, studyId }: ProtocolNavPanelProps) {
  const sel = useProtocolSelection()
  const steps = sel?.steps ?? []
  const resources = sel?.resources ?? { labwares: [], equipment: [] }
  // Declared resources start COLLAPSED and sit above the step list: with a
  // 17-step protocol an expanded resource list buries the navigation, while a
  // header with its count is visible at a glance and one click away.
  const [labwareOpen, setLabwareOpen] = useState(false)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const focusedStep = sel?.focusedStep
  const setFocusedStep = sel?.setFocusedStep ?? (() => {})
  const stepGraphs = sel?.stepGraphs ?? {}
  const visibleSteps = sel?.visibleSteps ?? new Set<string>()
  const [tip, setTip] = useState<StepTip | null>(null)
  // The rail owns BOTH attach (empty state) and change (footer, D4) — the
  // right-pane Protocol tab's picker is retired, so this is the only place a
  // protocol can be swapped once one is attached.
  const canChange = Boolean(runId && studyId)
  const [changing, setChanging] = useState(false)
  const [editingStep, setEditingStep] = useState<{ step: ProtocolStepSummary; mode: 'edit' | 'before' | 'after' } | null>(null)
  const [saving, setSaving] = useState(false)
  const [stepError, setStepError] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ protocolId: string; payload: Record<string, unknown>; expectedSha: string } | null>(null)
  useEffect(() => {
    setEditingStep(null)
    setUndo(null)
    setStepError(null)
  }, [sel?.protocol?.recordId])
  // Hold the anchor element so keyboard focus we can recompute the rect when
  // the rail scrolls (reposition), and so we can ignore stale mouse events.
  const anchorRef = useRef<HTMLElement | null>(null)

  const showTip = useCallback((el: HTMLElement, text: string) => {
    const rect = el.getBoundingClientRect()
    anchorRef.current = el
    setTip({ stepId: el.getAttribute('data-stepid') ?? '', text, x: rect.left, y: rect.bottom + 6 })
  }, [])

  const hideTip = useCallback(() => {
    anchorRef.current = null
    setTip(null)
  }, [])

  const handleStepClick = useCallback(
    (step: ProtocolStepSummary) => {
      // Toggle: clicking the already-focused step clears focus (restore flat
      // ghosting); clicking any other step focuses its realization.
      const next = focusedStep?.stepId === step.stepId ? null : step
      setFocusedStep(next)
    },
    [focusedStep?.stepId, setFocusedStep],
  )

  function openStepEditor(step: ProtocolStepSummary, mode: 'edit' | 'before' | 'after') {
    hideTip()
    setStepError(null)
    setEditingStep({ step, mode })
  }

  function publishSteps(next: ProtocolStepSummary[]) {
    if (!sel) return
    sel.setSteps(next)
    const ids = new Set(next.map(step => step.stepId))
    sel.setVisibleSteps([...visibleSteps].filter(id => ids.has(id)))
    if (focusedStep) sel.setFocusedStep(next.find(step => step.stepId === focusedStep.stepId) ?? null)
    if (sel.activeStepId && !ids.has(sel.activeStepId)) sel.setActiveStepId(null)
    if (sel.currentStepId && !ids.has(sel.currentStepId)) sel.setCurrentStepId(null)
  }

  async function removeStep(step: ProtocolStepSummary) {
    if (!sel?.protocol || saving) return
    hideTip()
    setSaving(true)
    setStepError(null)
    try {
      const protocolId = sel.protocol.recordId
      const record = await apiClient.getRecord(protocolId)
      const expectedSha = record.meta?.contentSha ?? record.meta?.commitSha
      if (!expectedSha) throw new Error('The protocol has no save token. Reload it before editing.')
      const payload = record.payload as Record<string, unknown>
      const updated = deleteProtocolStep(payload, step.stepId)
      const result = await apiClient.updateRecord(protocolId, updated, { expectedSha })
      if (!result.record) throw new Error('The step could not be deleted.')
      const savedSha = result.record.meta?.contentSha ?? result.record.meta?.commitSha
      setUndo(savedSha ? { protocolId, payload, expectedSha: savedSha } : null)
      publishSteps(stepSummaries(updated))
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
    } catch (error) { setStepError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }

  async function undoDelete() {
    if (!undo || saving) return
    setSaving(true)
    setStepError(null)
    try {
      const result = await apiClient.updateRecord(undo.protocolId, undo.payload, { expectedSha: undo.expectedSha })
      if (!result.record) throw new Error('The step could not be restored.')
      publishSteps(stepSummaries(result.record.payload as Record<string, unknown>))
      setUndo(null)
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
    } catch (error) { setStepError(error instanceof Error ? error.message : String(error)) }
    finally { setSaving(false) }
  }

  if (steps.length === 0) {
    // No protocol on this run → the rail has nothing to rail. This is the ONE
    // place a biologist can attach one from the run workspace (the right-pane
    // Protocol tab that used to host the picker is not rendered by the
    // three-pane harness), so render the find-&-attach surface — not a dead end.
    if (runId && studyId) {
      return (
        <aside className="protocol-nav" data-testid="protocol-nav">
          {title ? <header className="protocol-nav__head">{title}</header> : null}
          <AttachProtocolPanel
            runId={runId}
            studyId={studyId}
            onAttached={() => {
              // After attaching, the step rail refills: attaching writes the
              // run's plannedRunRef, so the loader re-resolves on this event.
              window.dispatchEvent(new CustomEvent('cl:records-changed'))
            }}
          />
        </aside>
      )
    }
    return (
      <aside className="protocol-nav" data-testid="protocol-nav">
        {title ? <header className="protocol-nav__head">{title}</header> : null}
        <p className="protocol-nav__empty">
          Attach a protocol to see its steps here — each step is a concept you
          can focus on the deck.
        </p>
      </aside>
    )
  }

  // Change-protocol mode: reuse the same find-&-attach surface, in replace mode.
  if (changing && runId && studyId) {
    return (
      <aside className="protocol-nav" data-testid="protocol-nav">
        {title ? <header className="protocol-nav__head">{title}</header> : null}
        <AttachProtocolPanel
          runId={runId}
          studyId={studyId}
          alreadyAttached
          onCancel={() => setChanging(false)}
          onAttached={() => {
            setChanging(false)
            window.dispatchEvent(new CustomEvent('cl:records-changed'))
          }}
        />
      </aside>
    )
  }

  return (
    <aside className="protocol-nav" data-testid="protocol-nav">
      {title ? <header className="protocol-nav__head">{title}</header> : null}
      {/* WHICH protocol this is: the run's attached protocol by name, with its
          record metadata (ID, parent artifact, created…) on hover. The header
          above names the RUN; this names the protocol being realized. */}
      {sel?.protocol ? (
        <div className="protocol-nav__identity">
          <ProtocolIdentity
            protocolId={sel.protocol.recordId}
            fallbackTitle={sel.protocol.title ?? null}
          />
        </div>
      ) : null}
      {stepError ? <p className="protocol-nav__error" role="alert">{stepError}</p> : null}
      {undo ? <div className="protocol-nav__notice" role="status">Step deleted.{' '}
        <button type="button" disabled={saving} onClick={() => void undoDelete()}>Undo</button>
      </div> : null}
      <ResourceSection
        testId="protocol-nav-labware"
        title="Labware"
        roles={resources.labwares}
        open={labwareOpen}
        onToggle={() => setLabwareOpen((o) => !o)}
      />
      <ResourceSection
        testId="protocol-nav-equipment"
        title="Equipment"
        roles={resources.equipment}
        open={equipmentOpen}
        onToggle={() => setEquipmentOpen((o) => !o)}
      />
      <ol className="protocol-nav__list" data-testid="protocol-nav-list">
        {steps.map((step) => {
          const focused = focusedStep?.stepId === step.stepId
          const hasRealization = Boolean(stepGraphs[step.stepId])
          const visible = visibleSteps.has(step.stepId)
          return (
            <li key={step.stepId} className={focused ? 'protocol-nav__item protocol-nav__item--active' : 'protocol-nav__item'}>
              <button
                type="button"
                className="protocol-nav__step"
                data-testid={`protocol-nav-step-${step.stepId}`}
                data-stepid={step.stepId}
                aria-pressed={focused}
                aria-describedby="protocol-nav-tooltip"
                onMouseEnter={(e) => {
                  const desc = step.description?.trim()
                  if (desc) showTip(e.currentTarget, desc)
                }}
                onMouseLeave={hideTip}
                onFocus={(e) => {
                  const desc = step.description?.trim()
                  if (desc) showTip(e.currentTarget, desc)
                }}
                onBlur={hideTip}
                onClick={() => handleStepClick(step)}
                title={`Focus step ${step.ordinal} on the deck`}
              >
                <span className="protocol-nav__ordinal">{step.ordinal}</span>
                <span className="protocol-nav__label">{step.label}</span>
                {hasRealization ? <span className="protocol-nav__realized" title="Has a committed realization">✓</span> : null}
                {!visible ? <span className="protocol-nav__hidden" title="Hidden from deck">⊘</span> : null}
              </button>
              {sel?.protocol ? (
                <div className="protocol-nav__actions">
                <button type="button" className="protocol-nav__action"
                  data-testid={`protocol-nav-edit-${step.stepId}`}
                  aria-label={`Edit step ${step.ordinal}`}
                  title="Edit step"
                  disabled={saving}
                  onClick={() => openStepEditor(step, 'edit')}>
                  <StepActionIcon action="edit" />
                </button>
                <button type="button" className="protocol-nav__action" disabled={saving}
                  aria-label={`Add step before step ${step.ordinal}`} title="Add step before"
                  onClick={() => openStepEditor(step, 'before')}>
                  <StepActionIcon action="before" />
                </button>
                <button type="button" className="protocol-nav__action" disabled={saving}
                  aria-label={`Add step after step ${step.ordinal}`} title="Add step after"
                  onClick={() => openStepEditor(step, 'after')}>
                  <StepActionIcon action="after" />
                </button>
                <button type="button" className="protocol-nav__action protocol-nav__action--delete"
                  disabled={saving || steps.length === 1}
                  aria-label={`Delete step ${step.ordinal}`}
                  title={steps.length === 1 ? 'A protocol needs at least one step' : 'Delete step'}
                  onClick={() => void removeStep(step)}>
                  <StepActionIcon action="delete" />
                </button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ol>
      {editingStep && sel?.protocol ? (
        <ProtocolStepEditModal protocolId={sel.protocol.recordId} step={editingStep.step} mode={editingStep.mode}
          onClose={() => setEditingStep(null)}
          onSaved={(updated, next) => {
            setUndo(null)
            publishSteps(next)
            if (editingStep.mode !== 'edit') {
              sel.setStepVisibility(updated.stepId, true)
              sel.setFocusedStep(updated)
            }
          }} />
      ) : null}
      {canChange ? (
        <footer className="protocol-nav__footer">
          <button
            type="button"
            className="protocol-nav__change"
            data-testid="protocol-nav-change"
            onClick={() => setChanging(true)}
            title="Attach a different protocol to this run"
          >
            Change protocol
          </button>
        </footer>
      ) : null}
      {tip ? (
        <div
          id="protocol-nav-tooltip"
          role="tooltip"
          data-testid="protocol-nav-tooltip"
          className="protocol-nav__tooltip"
          style={{ left: tip.x, top: tip.y }}
        >
          {tip.text}
        </div>
      ) : null}
    </aside>
  )
}

/**
 * A collapsible section of DECLARED roles (labware / equipment) in the rail.
 *
 * The roles are what the protocol needs before a run binds concrete instances,
 * so the rows are read-only context — the only interactive element is the
 * disclosure header. A protocol that declares none renders no section at all
 * (an empty accordion is chrome without content).
 */
function ResourceSection({
  testId,
  title,
  roles,
  open,
  onToggle,
}: {
  testId: string
  title: string
  roles: ProtocolRoleSummary[]
  open: boolean
  onToggle: () => void
}) {
  if (roles.length === 0) return null
  return (
    <section className="protocol-nav__section" data-testid={testId}>
      <button
        type="button"
        className="protocol-nav__section-head"
        aria-expanded={open}
        onClick={onToggle}
        data-testid={`${testId}-toggle`}
      >
        <span
          className={open ? 'protocol-nav__chevron protocol-nav__chevron--open' : 'protocol-nav__chevron'}
          aria-hidden="true"
        >
          ▸
        </span>
        <span className="protocol-nav__section-title">{title}</span>
        <span className="protocol-nav__section-count">{roles.length}</span>
      </button>
      {open ? (
        <ul className="protocol-nav__roles" data-testid={`${testId}-list`}>
          {roles.map((role) => (
            <li key={role.roleId} className="protocol-nav__role" title={role.description ?? role.roleId}>
              <span className="protocol-nav__role-id">{role.roleId}</span>
              {role.description ? <span className="protocol-nav__role-desc">{role.description}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function StepActionIcon({ action }: { action: 'edit' | 'before' | 'after' | 'delete' }) {
  return <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {action === 'edit' ? <path d="M12 4l4 4M3 17l1-5L14 2l4 4L8 16z" /> : action === 'delete' ? <>
      <path d="M3 5h14M7 5V3h6v2M5 5l1 12h8l1-12M8 8v6M12 8v6" />
    </> : <>
      <rect x="3" y={action === 'before' ? 11 : 2} width="14" height="6" rx="1" />
      <path d={action === 'before' ? 'M7 5h6M10 2v6' : 'M7 14h6M10 11v6'} />
    </>}
  </svg>
}
