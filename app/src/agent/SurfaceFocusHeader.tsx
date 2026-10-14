/**
 * SurfaceFocusHeader — the working-focus header for any surface hosting the
 * shared harness chat pane (HARNESS-SEQ-1).
 *
 * It renders the label published in ChatFocusContext ONLY — derived from the
 * host's resolved state, never AI prose, never a model call. Its own testid
 * (`surface-focus-header`) so the run page's `chat-context-header` count in
 * three-pane-harness.spec.ts stays exact. Without a published focus it renders
 * nothing.
 */
import { useChatFocus } from './ChatFocusContext'
import './SurfaceFocusHeader.css'

export function SurfaceFocusHeader() {
  const focus = useChatFocus()
  if (!focus) return null
  return (
    <div className="surface-focus-header surface-focus-header--active" data-testid="surface-focus-header">
      <span className="surface-focus-header__label">Working focus</span>
      <span className="surface-focus-header__value" title={focus.detail ?? focus.label}>{focus.label}</span>
    </div>
  )
}
