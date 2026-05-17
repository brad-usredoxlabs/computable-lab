import { useEventEditor } from '../EventEditorContext'
import { buildFixSeed } from '../fix-it/buildFixSeed'

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
  const preview = state.preview
  if (!preview) return null

  const labwareCount = preview.previewPlacements.length
  const eventCount = preview.previewEvents.length

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

  function handleAccept() {
    actions.commitPreview()
  }

  function handleFixIt() {
    // Capture the source prompt + skips that were attached when the dock
    // promoted this draft. If they're missing (e.g., a preview built by a
    // future code path that doesn't yet set them) the seed still works but
    // with an empty prompt — the user can fill in via chat.
    const seed = buildFixSeed({
      prompt: preview?.sourcePrompt ?? '',
      previewSkips: preview?.sourceSkips ?? [],
      state,
    })
    actions.openFixIt(seed)
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
        className="preview-bar__btn preview-bar__btn--fixit"
        onClick={handleFixIt}
        title="Open the fix-it side chat to diagnose what's wrong"
      >Fix-it</button>
      <button
        type="button"
        className="preview-bar__btn preview-bar__btn--primary"
        onClick={handleAccept}
        title="Commit the preview to the deck and event graph"
      >Accept</button>
    </div>
  )
}
