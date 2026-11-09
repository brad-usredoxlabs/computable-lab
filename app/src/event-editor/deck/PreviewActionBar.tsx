import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEventEditor } from '../EventEditorContext'
import { useOptionalWorkspace } from '../workspace/WorkspaceContext'
import { eventEditorGraphPath } from '../eventGraphRouting'
import { useOptionalAiPanel } from '../../shared/context/AiPanelContext'
import { ProposedGraphModal } from './ProposedGraphModal'
import { type TermDecision } from './acceptedOntologyBindings'
import {
  adoptStagedPreview,
  bindingNeedsDecision,
} from './deckAdoption'
import { termClarifyPrompt, termConfirmPrompt } from '../right-pane/ai/termFollowUpPrompt'
import type { TermClarification, TermConfirmation } from '../right-pane/ai/TermPanel'

/**
 * Floating control that appears over the deck stage whenever an AI preview
 * is staged. Replaces the inline per-bubble Accept button in the dock so the
 * user can drill into ghosted labware, inspect per-well overlays, then
 * commit (or discard) the proposal from one place.
 *
 * Visibility: tied to `state.preview` being non-null. Hidden otherwise so
 * the control doesn't clutter the deck when there's nothing to act on.
 *
 * L2-CHAT-1 FIX3 D1: the accept core is the SHARED deck adoption
 * (deckAdoption.adoptStagedPreview) — the SAME module the universal
 * chat-card Apply delegates to. One adopter: commit_preview nulls the
 * preview inside the reducer, so whichever path commits first makes the
 * other a no-op.
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

  // L2-SUITE-A-uifix2 FIX2 [D6]: the surface's registered universal chat
  // (null when this surface has none — a deck without an AI chat has no
  // staged preview to clear). Hook, so it runs before the `!preview` early
  // return.
  const aiPanel = useOptionalAiPanel()

  // Terms that need an explicit sign-off decision. Accept is hard-blocked until
  // every one is approved or replaced. Computed from the LIVE preview reference
  // (NOT the dereferenced object) so the hook runs on every render regardless of
  // whether a preview is staged — hooks must not come after an early return.
  const decisionNeeded = useMemo(
    () => (preview?.ontologyBindings ?? []).filter(bindingNeedsDecision),
    [preview?.ontologyBindings],
  )
  const pendingDecisions = decisionNeeded.filter((b) => !termDecisions[b.curie])
  const acceptBlocked = pendingDecisions.length > 0

  if (!preview) return null
  const activePreview = preview

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
    // signed off before we materialize the graph (the shared core re-checks
    // this — belt and braces; the UI blocks the button first).
    if (acceptBlocked) {
      setShowChanges(true)
      return
    }
    acceptingRef.current = true
    setAcceptError(null)
    setAccepting(true)
    try {
      // L2-CHAT-1 FIX3 D1: the FULL adoption through the shared core — the
      // same module the chat-card Apply uses (same materialize/persist
      // ordering, same one-adopter semantics).
      await adoptStagedPreview(activePreview, {
        eventGraphId: state.eventGraphId,
        runId: state.runId,
        ...(state.platformId ? { platformId: state.platformId } : {}),
        ...(state.variantId ? { variantId: state.variantId } : {}),
        events: state.events,
        labwares: state.labwares,
        equipments: state.equipments,
        placements: state.placements,
      }, {
        termDecisions,
        commit: (previewEvents, persisted) =>
          actions.commitPreview(previewEvents, persisted.eventGraphId, persisted.commit),
        onAdopted: (persisted) => {
          // L2-SUITE-A-uifix2 FIX2 [D6]: the deck bar just committed the
          // staged preview (commitPreview above nulled state.preview). The
          // universal chat's OWN staged preview (its previewEvents) is
          // separate state — without this clear it stays staged, so the
          // ChatPreviewCard keeps ACTIVE Apply/Discard chrome over the
          // already-applied batch (dead chrome + a second-Apply risk) and
          // the next send's `revising` check appends a stale
          // "auto-rejected" line for a batch that was ACCEPTED. The one-shot
          // clear reads the chat's staged state (still staged — the editor
          // preview nulling doesn't re-render the bar yet) and is a no-op
          // when nothing is staged (the chat-Apply adopter already cleared
          // it — one adopter, one clear).
          aiPanel?.chat?.clearStagedPreviewForExternalCommit(
            persisted.commit?.sha,
          )
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
        },
      })
    } catch (error) {
      setAcceptError(error instanceof Error ? error.message : String(error))
    } finally {
      acceptingRef.current = false
      setAccepting(false)
    }
  }

  // L2-CLARIFY-TARGET-1 D2: when the pane chat has a staged proposal
  // (chat.hasPreview === true), the commit verbs render on the chat
  // surface — rendering them here too is dead chrome (SOP rule 12).
  // "View changes" always renders regardless.
  // L2-CLARIFY-TARGET-1 D2-fix3: keep Accept visible for the whole life
  // of a term-heavy preview (while terms are unsigned AND after sign-off),
  // so the signed decisions are committable from the bar when the card's
  // Apply path hardcodes termDecisions: {} and blocks the card.
  const chatCommitSurface = aiPanel?.chat?.hasPreview === true && decisionNeeded.length === 0

  return (
    <div className="preview-bar" role="region" aria-label="Preview actions">
      <span className="preview-bar__summary">
        <span className="preview-bar__dot" aria-hidden />
        {summary}
      </span>
      {chatCommitSurface ? null : (
        <button
          type="button"
          className="preview-bar__btn preview-bar__btn--ghost"
          onClick={handleDiscard}
          title="Discard the proposed preview"
        >Discard</button>
      )}
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
      {chatCommitSurface ? null : (
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
      )}
      {showChanges ? (
        <ProposedGraphModal
          preview={activePreview}
          onClose={() => setShowChanges(false)}
          termDecisions={termDecisions}
          onDecisionsChange={setTermDecisions}
          onTermConfirm={(confirmation: TermConfirmation) => {
            // Term overrides live in the modal now; the chat channel that turns a
            // confirm into a fresh draft lives in the editor context (the shared
            // prompt seam), consumed by the AI pane. Keep the modal open so the
            // biologist sees the redraft replace the ghosts it reviews.
            actions.requestRetryPrompt(termConfirmPrompt(confirmation))
          }}
          onTermClarify={(clarification: TermClarification) => {
            actions.requestRetryPrompt(termClarifyPrompt(clarification))
          }}
        />
      ) : null}
    </div>
  )
}
