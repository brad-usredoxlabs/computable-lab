/**
 * ProtocolSelectionContext — shared state between the ProtocolTabPanel
 * (right pane) and the ProtocolPreviewBridge (left pane / canvas).
 *
 * ProtocolTabPanel writes: activeStepId, visibleSteps, stepGraphs.
 * ProtocolPreviewBridge reads: visibleSteps + stepGraphs to compute
 * which events to ghost onto the deck canvas.
 *
 * This context must live ABOVE both the right pane and the left pane
 * in the component tree, so both can access it. It's mounted inside
 * ProjectWorkspacePage's WorkspaceShellHost, wrapping the AppShell.
 */

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

/** Minimal shape of a compiled sub-graph returned by the sub-graph API. */
export interface ProtocolStepGraph {
  id: string
  name?: string
  description?: string
  stepId?: string
  phaseId?: string
  events: Array<Record<string, unknown>>
  labwares: Array<Record<string, unknown>>
}

/** Minimal step identity for the left navigation rail (concepts/steps). */
export interface ProtocolStepSummary {
  stepId: string
  label: string
  ordinal: number
}

interface ProtocolSelectionState {
  /** The currently selected step (for settings display, etc.). */
  activeStepId: string | null
  /** Step IDs whose events are ghosted onto the canvas. */
  visibleSteps: Set<string>
  /** Cached sub-graphs keyed by stepId. */
  stepGraphs: Record<string, ProtocolStepGraph>
  /**
   * The "live" step in protocol-planning mode. When set (non-null), the
   * preview bridge tags events as PAST vs CURRENT so the current step is
   * highlighted and past steps render dimmed. When null (default), the flat
   * "ghost all visible steps" behavior is preserved for the Protocol tab.
   */
  currentStepId: string | null
  /** Set the current step (null to restore flat ghosting). */
  setCurrentStepId: (id: string | null) => void
  /** Set the active step (null to deselect). */
  setActiveStepId: (id: string | null) => void
  /**
   * Single-step focus for investigating a step's REALIZATION. When set, the
   * preview bridge shows ONLY this step's sub-graph events (concept→realization
   * isolation). When null, flat "ghost all visible steps" is preserved.
   */
  focusStepId: string | null
  /** The focused step's concept identity (label + order) for the indicator/banner. */
  focusedStep: { stepId: string; label: string; ordinal?: number } | null
  /** Set the focused step (null to restore flat ghosting). */
  setFocusedStep: (step: { stepId: string; label: string; ordinal?: number } | null) => void
  /** The protocol's steps as concept summaries — shared source of truth for
   *  the left navigation rail and any deck consumer that lists them. */
  steps: ProtocolStepSummary[]
  /** Set the step concept list (populated when the protocol steps first load). */
  setSteps: (steps: ProtocolStepSummary[]) => void
  /** Toggle a step's canvas visibility. */
  toggleStepVisibility: (stepId: string) => void
  /** Set whether a step is visible. */
  setStepVisibility: (stepId: string, visible: boolean) => void
  /** Cache a fetched sub-graph. */
  setStepGraph: (stepId: string, graph: ProtocolStepGraph) => void
  /** Bulk-set visible steps (e.g. when steps are first loaded). */
  setVisibleSteps: (stepIds: string[]) => void
}

const ProtocolSelectionContext = createContext<ProtocolSelectionState | null>(null)

export function ProtocolSelectionProvider({ children }: { children: ReactNode }) {
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [currentStepId, setCurrentStepId] = useState<string | null>(null)
  const [focusStepId, setFocusStepIdState] = useState<string | null>(null)
  const [focusedStep, setFocusedStepState] = useState<{ stepId: string; label: string; ordinal?: number } | null>(null)
  const [visibleSteps, setVisibleStepsState] = useState<Set<string>>(new Set())
  const [stepGraphs, setStepGraphs] = useState<Record<string, ProtocolStepGraph>>({})
  const [steps, setStepsState] = useState<ProtocolStepSummary[]>([])

  const setFocusedStep = useCallback((step: { stepId: string; label: string; ordinal?: number } | null) => {
    setFocusStepIdState(step ? step.stepId : null)
    setFocusedStepState(step)
  }, [])

  const toggleStepVisibility = useCallback((stepId: string) => {
    setVisibleStepsState((prev) => {
      const next = new Set(prev)
      if (next.has(stepId)) {
        next.delete(stepId)
      } else {
        next.add(stepId)
      }
      return next
    })
  }, [])

  const setStepVisibility = useCallback((stepId: string, visible: boolean) => {
    setVisibleStepsState((prev) => {
      const next = new Set(prev)
      if (visible) {
        next.add(stepId)
      } else {
        next.delete(stepId)
      }
      return next
    })
  }, [])

  const setStepGraph = useCallback((stepId: string, graph: ProtocolStepGraph) => {
    setStepGraphs((prev) => ({ ...prev, [stepId]: graph }))
  }, [])

  const setVisibleSteps = useCallback((stepIds: string[]) => {
    setVisibleStepsState(new Set(stepIds))
  }, [])

  const setSteps = useCallback((next: ProtocolStepSummary[]) => {
    setStepsState(next)
  }, [])

  return (
    <ProtocolSelectionContext.Provider
      value={{
        activeStepId,
        currentStepId,
        setCurrentStepId,
        visibleSteps,
        stepGraphs,
        focusStepId,
        focusedStep,
        setFocusedStep,
        setActiveStepId,
        steps,
        setSteps,
        toggleStepVisibility,
        setStepVisibility,
        setStepGraph,
        setVisibleSteps,
      }}
    >
      {children}
    </ProtocolSelectionContext.Provider>
  )
}

export function useProtocolSelection(): ProtocolSelectionState | null {
  return useContext(ProtocolSelectionContext)
}
