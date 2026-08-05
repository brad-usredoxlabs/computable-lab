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
  const [visibleSteps, setVisibleStepsState] = useState<Set<string>>(new Set())
  const [stepGraphs, setStepGraphs] = useState<Record<string, ProtocolStepGraph>>({})

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

  return (
    <ProtocolSelectionContext.Provider
      value={{
        activeStepId,
        currentStepId,
        setCurrentStepId,
        visibleSteps,
        stepGraphs,
        setActiveStepId,
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
