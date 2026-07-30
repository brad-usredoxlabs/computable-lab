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
  const { visibleSteps, stepGraphs } = useProtocolSelection()
  const { state, actions } = useEventEditor()

  useEffect(() => {
    const allEvents: PlateEvent[] = []
    const allLabwareMap: Record<string, Labware> = {}
    const allPlacements: EventEditorPlacement[] = []

    for (const stepId of visibleSteps) {
      const graph = stepGraphs[stepId]
      if (!graph) continue
      for (const event of graph.events) {
        allEvents.push(event as unknown as PlateEvent)
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
  }, [visibleSteps, stepGraphs])

  return null
}
