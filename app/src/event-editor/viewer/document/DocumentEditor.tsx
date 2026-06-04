/**
 * DocumentEditor — workspace viewer for `kind: 'document'` tabs.
 *
 * Pure renderer. The TipTap `Editor` instance, the artifact load state,
 * and the debounced save lifecycle all live in `DocumentStateProvider`
 * (mounted above AppShell by ProjectWorkspacePage), which lets the
 * toolbar — rendered into a sibling AppShell slot — drive the same editor.
 *
 * Layout: title header, the TipTap EditorContent, and a small saving/error
 * indicator at the bottom. The toolbar lives elsewhere.
 */

import { EditorContent } from '@tiptap/react'
import { useDocumentEditor } from './DocumentEditorContext'
import './document.css'

export interface DocumentEditorProps {
  artifactId: string
  title: string
}

export function DocumentEditor({ artifactId, title }: DocumentEditorProps) {
  const v = useDocumentEditor()

  // Guard against a stale leftPane render asking for a different artifact
  // than the provider currently owns. The provider is keyed on artifactId
  // at the page level so this is rare but worth surfacing explicitly.
  if (v.artifactId !== null && v.artifactId !== artifactId) {
    return (
      <div className="document-editor document-editor--mismatch">
        Editor state mismatch: tab is {artifactId}, provider has {v.artifactId}.
      </div>
    )
  }

  return (
    <div className="document-editor" data-testid="document-editor">
      <div className="document-editor__header">
        <h2>{title}</h2>
        <span className="document-editor__id">{artifactId}</span>
        <span className="document-editor__spacer" />
        <DocumentEditorStatus />
      </div>
      <div className="document-editor__body">
        {v.loadState.kind === 'loading' || v.loadState.kind === 'idle' ? (
          <p className="document-editor__hint">Loading document…</p>
        ) : v.loadState.kind === 'error' ? (
          <p className="document-editor__error">
            Failed to load: {v.loadState.message}
          </p>
        ) : (
          <EditorContent editor={v.editor} className="document-editor__content" />
        )}
      </div>
    </div>
  )
}

function DocumentEditorStatus() {
  const v = useDocumentEditor()
  if (v.saveError) {
    return (
      <span
        className="document-editor__status document-editor__status--error"
        data-testid="document-editor-save-error"
      >
        Save failed: {v.saveError}
      </span>
    )
  }
  if (v.saving) {
    return (
      <span
        className="document-editor__status document-editor__status--saving"
        data-testid="document-editor-saving"
      >
        Saving…
      </span>
    )
  }
  if (v.loadState.kind === 'ready') {
    return (
      <span
        className="document-editor__status"
        data-testid="document-editor-saved"
      >
        Saved
      </span>
    )
  }
  return null
}
