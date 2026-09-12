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

import { useCallback, useRef, useState } from 'react'
import { useProtocolSelection } from '../../protocol/ProtocolSelectionContext'
import type { ProtocolStepSummary } from '../../protocol/ProtocolSelectionContext'
import './ProtocolNavPanel.css'

export interface ProtocolNavPanelProps {
  /** Surface label to lead the rail (e.g. the run title). */
  title?: string
}

/** A hover/focus step with its anchor rect (viewport coords) for the fixed tooltip. */
interface StepTip {
  stepId: string
  text: string
  x: number
  y: number
}

export function ProtocolNavPanel({ title }: ProtocolNavPanelProps) {
  const sel = useProtocolSelection()
  const steps = sel?.steps ?? []
  const focusedStep = sel?.focusedStep
  const setFocusedStep = sel?.setFocusedStep ?? (() => {})
  const stepGraphs = sel?.stepGraphs ?? {}
  const visibleSteps = sel?.visibleSteps ?? new Set<string>()
  const [tip, setTip] = useState<StepTip | null>(null)
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
            </li>
          )
        })}
      </ol>
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
