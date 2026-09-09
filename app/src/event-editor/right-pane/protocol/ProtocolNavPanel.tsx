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

import { useCallback } from 'react'
import { useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import type { ProtocolStepSummary } from '../../protocol/ProtocolSelectionContext'
import './ProtocolNavPanel.css'

export interface ProtocolNavPanelProps {
  /** Surface label to lead the rail (e.g. the run title). */
  title?: string
}

export function ProtocolNavPanel({ title }: ProtocolNavPanelProps) {
  const sel = useProtocolSelection()
  const steps = sel?.steps ?? []
  const focusedStep = sel?.focusedStep
  const setFocusedStep = sel?.setFocusedStep ?? (() => {})
  const stepGraphs = sel?.stepGraphs ?? {}
  const visibleSteps = sel?.visibleSteps ?? new Set<string>()

  const handleStepClick = useCallback(
    (step: ProtocolStepSummary) => {
      // Toggle: clicking the already-focused step clears focus (restore flat
      // ghosting); clicking any other step focuses its realization.
      const next = focusedStep?.stepId === step.stepId ? null : step
      setFocusedStep(next)
    },
    [focusedStep?.stepId, setFocusedStep],
  )

  if (steps.length === 0) {
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

  return (
    <aside className="protocol-nav" data-testid="protocol-nav">
      {title ? <header className="protocol-nav__head">{title}</header> : null}
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
                aria-pressed={focused}
                onClick={() => handleStepClick(step)}
                title={`Focus step ${step.ordinal} on the deck`}
              >
                <span className="protocol-nav__ordinal">{step.ordinal}</span>
                <span className="protocol-nav__label">{step.label}</span>
                {hasRealization ? <span className="protocol-nav__realized" title="Has a committed realization">✓</span> : null}
                {!visible ? <span className="protocol-nav__hidden" title="Hidden from deck">⊘</span> : null}
              </button>
            </li>
          )
        })}
      </ol>
    </aside>
  )
}
