/**
 * RunSurfaceChatBridge — L2-CHAT-1: the run workspace's universal chat.
 *
 * Runs INSIDE the run page's EventEditorProvider, so the single
 * `useSurfaceChat` call can finally carry what the page's old top-level call
 * never could (it sat ABOVE the provider):
 *
 *  - `onAcceptEvent: actions.appendEvent` — ChatPreviewCard Apply actually
 *    applies: accepted events land on the deck through the SAME editor action
 *    the deck canvas uses. With the handler absent, a done with mountable
 *    events used to be a silent no-op (spec §1 defect); useAiChat now reports
 *    the missing-handler case loudly instead.
 *  - the GHOST MOUNT (useDeckGhostMount): an event-bearing proposal mounts
 *    deck ghosts + the revision trail on the editor state; Discard clears.
 *    ADOPTION (placements/labwares → committed) rides the deck's own
 *    PreviewActionBar commitPreview path — the same one the /deck/:id route
 *    uses: one event/ghost path, no second adopter.
 *
 * The pane (HarnessChatPane in the page's rightPane slot) is a pure consumer
 * of the app-level AiPanelContext, so registering from inside the provider
 * changes nothing about what the pane reads.
 */
import { useEventEditor } from '../event-editor/EventEditorContext'
import { useDeckGhostMount } from '../event-editor/deck/useDeckGhostMount'
import { useSurfaceChat } from '../agent/useSurfaceChat'
import type { AiContext } from '../types/aiContext'

export function RunSurfaceChatBridge({ aiContext }: { aiContext: AiContext }) {
  const { actions } = useEventEditor()
  const { onProposalDrafted, onPreviewDiscarded } = useDeckGhostMount()

  useSurfaceChat({
    aiContext,
    endpoint: 'event-editor',
    onAcceptEvent: actions.appendEvent,
    onProposalDrafted,
    onPreviewDiscarded,
  })

  return null
}
