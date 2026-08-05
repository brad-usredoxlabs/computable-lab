/**
 * ProtocolPreviewBridge — invisible component that reads the
 * ProtocolSelectionContext and layers visible steps' sub-graph events
 * onto the deck canvas via the EventEditorContext preview system.
 *
 * Must be rendered inside BOTH:
 *   - <ProtocolSelectionProvider> (for step selection state)
 *   - <EventEditorProvider>       ( for setPreview/clearPreview)
 *
 * When visibleSteps changes or stepGraphs are updated, this component
 * aggregates all visible steps' events and calls setPreview to ghost
 * them onto the canvas. When no steps are visible, calls clearPreview.
 *
 * The preview uses empty previewPlacements and previewLabwares because
 * protocol step sub-graph events reference labware already placed on
 * the deck — no new labware needs to be ghosted.
 */

import { useEffect } from 'react'
import { useEventEditor } from '../EventEditorContext'
import { useProtocolSelection } from './ProtocolSelectionContext'
import type { PlateEvent } from '../../types/events'
import type { Labware } from '../../types/labware'
import type { EventEditorPlacement } from '../types'

export function ProtocolPreviewBridge() {
  const protocolSelection = useProtocolSelection()
  const { state, actions } = useEventEditor()

  const visibleSteps = protocolSelection?.visibleSteps ?? new Set<string>()
  const stepGraphs = protocolSelection?.stepGraphs ?? {}
  const currentStepId = protocolSelection?.currentStepId ?? null

  useEffect(() => {
    const allEvents: PlateEvent[] = []
    const allLabwareMap: Record<string, Labware> = {}
    const allPlacements: EventEditorPlacement[] = []

    for (const stepId of visibleSteps) {
      const graph = stepGraphs[stepId]
      if (!graph) continue
      for (const event of graph.events) {
        const ev = event as unknown as PlateEvent
        if (currentStepId !== null) {
          // Protocol-planning per-step layering: tag each event with its
          // originating step and whether it is past or current so the deck
          // can dim past steps and highlight the live one.
          const status = stepId === currentStepId ? 'current' : 'past'
          allEvents.push({
            ...ev,
            _protocolStepId: stepId,
            _protocolStepStatus: status,
          } as unknown as PlateEvent)
        } else {
          // Flat "ghost all visible steps" (Protocol tab default) — unchanged.
          allEvents.push(ev)
        }
      }
      for (const labware of graph.labwares) {
        const lw = labware as unknown as Labware
        if (lw.labwareId) {
          allLabwareMap[lw.labwareId] = lw
        }
      }
    }

    if (allEvents.length > 0) {
      actions.setPreview({
        previewLabwares: allLabwareMap,
        previewPlacements: allPlacements,
        previewEvents: allEvents,
        sourcePrompt: 'Protocol step preview',
      })
    } else {
      // Only clear if we previously set a protocol preview — don't
      // clobber an AI-dock preview that might be active.
      if (state.preview?.sourcePrompt === 'Protocol step preview') {
        actions.clearPreview()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSteps, stepGraphs, currentStepId])

  return null
}
