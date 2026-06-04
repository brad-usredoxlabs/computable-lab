/**
 * DocumentToolbar — viewer toolbar for document tabs. Just wires the
 * shared editor instance from DocumentEditorContext into the pure
 * `RichTextToolbar` component. Keeping it this thin makes the toolbar
 * reusable in other surfaces (e.g. a future record-edit pane) that just
 * need a TipTap editor + a toolbar.
 */

import { RichTextToolbar } from '../../../editor/taptab/RichTextToolbar'
import { useDocumentEditor } from './DocumentEditorContext'

export interface DocumentToolbarProps {
  /** Provided by the dispatcher; redundant with context but kept for symmetry. */
  artifactId: string
}

export function DocumentToolbar({ artifactId }: DocumentToolbarProps) {
  const v = useDocumentEditor()
  return (
    <div
      className="viewer-toolbar viewer-toolbar--document"
      data-testid="document-toolbar"
      data-artifact-id={artifactId}
    >
      <RichTextToolbar editor={v.editor} />
    </div>
  )
}
