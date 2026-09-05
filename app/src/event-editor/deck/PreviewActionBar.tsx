import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEventEditor } from '../EventEditorContext'
import { useOptionalWorkspace } from '../workspace/WorkspaceContext'
import { persistAcceptedEventGraph } from '../eventGraphPersistence'
import { eventEditorGraphPath } from '../eventGraphRouting'
import { ProposedGraphModal } from './ProposedGraphModal'
import {
  materializeAcceptedOntologyBindings,
  rewriteAcceptedOntologyRefs,
  type TermDecision,
} from './acceptedOntologyBindings'

/** A proposed ontology term that requires the scientist's sign-off (gate on Accept). */
function bindingNeedsDecision(b: { minted?: boolean; requiresReview?: boolean; draftOnly?: boolean }): boolean {
  return Boolean(b.minted || b.requiresReview || b.draftOnly)
}

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
  const [termDecisions, setTermDecisions] = useState<Record<string, TermDecision>>({})
  const acceptingRef = useRef(false)
  const preview = state.preview
  if (!preview) return null
  const activePreview = preview

  // Terms that need an explicit sign-off decision. Accept is hard-blocked until
  // every one is approved or replaced.
  const decisionNeeded = useMemo(
    () => (activePreview.ontologyBindings ?? []).filter(bindingNeedsDecision),
    [activePreview.ontologyBindings],
  )
  const pendingDecisions = decisionNeeded.filter((b) => !termDecisions[b.curie])
  const acceptBlocked = pendingDecisions.length > 0

  const labwareCount = activePreview.previewPlacements.length
  const eventCount = activePreview.previewEvents.length

  const summary = [
    labwareCount > 0
      ? `${labwareCount} new labware${labwareCount === 1 ? '' : 's'}`
      : null,
    eventCount > 0 ? `${eventCount} event${eventCount === 1 ? '' : 's'}` : null,
    pendingDecisions.length > 0
      ? `${pendingDecisions.length} ontology term${pendingDecisions.length === 1 ? '' : 's'} to review`
      : null,
  ]
    .filter(Boolean)
    .join(', ') || 'preview ready'

  function handleDiscard() {
    actions.clearPreview()
  }

  async function handleAccept() {
    if (acceptingRef.current) return
    // Hard gate: every minted/requiresReview/draftOnly ontology term must be
    // signed off before we materialize the graph.
    if (acceptBlocked) {
      setShowChanges(true)
      return
    }
    acceptingRef.current = true
    setAcceptError(null)
    setAccepting(true)
    try {
      const materialized = await materializeAcceptedOntologyBindings(
        activePreview.ontologyBindings,
        undefined,
        termDecisions,
      )
      const acceptedEvents = rewriteAcceptedOntologyRefs(activePreview.previewEvents, materialized)
      const persisted = await persistAcceptedEventGraph({
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        events: [...state.events, ...acceptedEvents],
        labwares: { ...state.labwares, ...activePreview.previewLabwares },
        placements: [...state.placements, ...activePreview.previewPlacements],
        ...(state.runId ? { platformId: state.platformId, variantId: state.variantId } : {}),
        // Auto-capture seam: only when the preview was produced by an AI prompt
        // (the common case) do we POST one corpus pair on the durable save.
        ...(activePreview.sourcePrompt
          ? { corpusUserPrompt: activePreview.sourcePrompt }
          : {}),
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
        title={
          acceptBlocked
            ? `${pendingDecisions.length} ontology term${pendingDecisions.length === 1 ? '' : 's'} need decision — review & sign off first`
            : 'Commit the preview to the deck and event graph'
        }
      >{accepting ? 'Accepting...' : acceptBlocked ? 'Review terms to accept' : 'Accept'}</button>
      {showChanges ? (
        <ProposedGraphModal
          preview={activePreview}
          onClose={() => setShowChanges(false)}
          termDecisions={termDecisions}
          onDecisionsChange={setTermDecisions}
        />
      ) : null}
    </div>
  )
}
