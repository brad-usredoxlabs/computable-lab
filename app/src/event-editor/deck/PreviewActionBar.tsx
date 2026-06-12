import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEventEditor } from '../EventEditorContext'
import { useOptionalWorkspace } from '../workspace/WorkspaceContext'
import { persistAcceptedEventGraph } from '../eventGraphPersistence'
import { eventEditorGraphPath } from '../eventGraphRouting'
import { ProposedGraphModal } from './ProposedGraphModal'
import {
  materializeAcceptedOntologyBindings,
  rewriteAcceptedOntologyRefs,
} from './acceptedOntologyBindings'

/**
 * Floating control that appears over the deck stage whenever an AI preview
 * is staged. Replaces the inline per-bubble Accept button in the dock so the
 * user can drill into ghosted labware, inspect per-well overlays, then
 * commit (or discard) the proposal from one place.
 *
 * Visibility: tied to `state.preview` being non-null. Hidden otherwise so
 * the control doesn't clutter the deck when there's nothing to act on.
 */
export function PreviewActionBar() {
  const { state, actions } = useEventEditor()
  const workspace = useOptionalWorkspace()
  const navigate = useNavigate()
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState<string | null>(null)
  const [showChanges, setShowChanges] = useState(false)
  const acceptingRef = useRef(false)
  const preview = state.preview
  if (!preview) return null
  const activePreview = preview

  const labwareCount = activePreview.previewPlacements.length
  const eventCount = activePreview.previewEvents.length

  const summary = [
    labwareCount > 0
      ? `${labwareCount} new labware${labwareCount === 1 ? '' : 's'}`
      : null,
    eventCount > 0 ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : null,
  ]
    .filter(Boolean)
    .join(', ') || 'preview ready'

  function handleDiscard() {
    actions.clearPreview()
  }

  async function handleAccept() {
    if (acceptingRef.current) return
    acceptingRef.current = true
    setAcceptError(null)
    setAccepting(true)
    try {
      const materialized = await materializeAcceptedOntologyBindings(activePreview.ontologyBindings)
      const acceptedEvents = rewriteAcceptedOntologyRefs(activePreview.previewEvents, materialized)
      const persisted = await persistAcceptedEventGraph({
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        events: [...state.events, ...acceptedEvents],
        labwares: { ...state.labwares, ...activePreview.previewLabwares },
        placements: [...state.placements, ...activePreview.previewPlacements],
      })
      actions.commitPreview(acceptedEvents, persisted.eventGraphId, persisted.commit)
      if (workspace) {
        // Workspace shell: stay put. commitPreview already adopted the
        // persisted graph into editor state; binding the tab makes reloads
        // and tab switches rehydrate it. Navigating to the legacy
        // /event-editor route here bounced through the workspace redirect
        // and remounted everything — losing the conversation and the
        // freshly accepted deck.
        const activeTabId = workspace.state.activeTabId
        if (activeTabId) workspace.bindDeckTab(activeTabId, persisted.eventGraphId)
      } else {
        navigate(eventEditorGraphPath(persisted.eventGraphId, state.runId), { replace: true })
      }
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : String(error))
    } finally {
      acceptingRef.current = false
      setAccepting(false)
    }
  }

  return (
    <div className="preview-bar" role="region" aria-label="Preview actions">
      <span className="preview-bar__summary">
        <span className="preview-bar__dot" aria-hidden />
        {summary}
      </span>
      <button
        type="button"
        className="preview-bar__btn preview-bar__btn--ghost"
        onClick={handleDiscard}
        title="Discard the proposed preview"
      >Discard</button>
      <button
        type="button"
        className="preview-bar__btn"
        onClick={() => setShowChanges(true)}
        title="Inspect the proposed event graph (events, refs, raw JSON)"
      >View changes</button>
      {acceptError ? (
        <div className="preview-bar__error" role="alert" title={acceptError}>
          <span className="preview-bar__error-label">Accept failed</span>
          <span className="preview-bar__error-message">{acceptError}</span>
        </div>
      ) : null}
      <button
        type="button"
        className="preview-bar__btn preview-bar__btn--primary"
        onClick={() => { void handleAccept() }}
        disabled={accepting}
        title="Commit the preview to the deck and event graph"
      >{accepting ? 'Accepting...' : 'Accept'}</button>
      {showChanges ? (
        <ProposedGraphModal preview={activePreview} onClose={() => setShowChanges(false)} />
      ) : null}
    </div>
  )
}
