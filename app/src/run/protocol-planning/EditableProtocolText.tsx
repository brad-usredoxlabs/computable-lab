/**
 * EditableProtocolText — lightweight TipTap text surface for step-localization
 * inputs.
 *
 * String-based contract: the parent passes `initial` (string) and receives
 * `onChange(string)`. Content seeding uses the `initial` prop; the parent
 * remounts with a `key` on step change so the component does NOT try to
 * reset content imperatively.
 *
 * Mirrors ChatInput's TipTap construction (Document/Paragraph/Text/Placeholder
 * extensions, serialized with `editorToText`).
 */

import { useEffect } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Placeholder from '@tiptap/extension-placeholder'
import { editorToText } from '../../shared/taptab/slashMenu/serialize'

export interface EditableProtocolTextProps {
  /** Initial content string. The parent remounts via `key` to reset. */
  initial: string
  /** Placeholder text shown when the editor is empty. */
  placeholder: string
  /** Called with the serialized string on every editor update. */
  onChange: (text: string) => void
  /** Data attribute for test targeting (e.g. 'sl-title', 'sl-text'). */
  testId?: string
  /** 'title' = compact header; 'prose' (default) = multiline body. */
  kind?: 'title' | 'prose'
  /** Extra class on the wrapper. */
  className?: string
}

const EMPTY_EDITOR_CLASS = 'is-empty-editor'

export function EditableProtocolText({
  initial,
  placeholder,
  onChange,
  testId,
  kind = 'prose',
  className = 'editable-protocol-text',
}: EditableProtocolTextProps) {
  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      Placeholder.configure({
        placeholder,
        emptyEditorClass: EMPTY_EDITOR_CLASS,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'editable-protocol-text__editor',
        'data-placeholder': placeholder,
      },
    },
    content: initial ? `<p>${escapeHtml(initial)}</p>` : '',
    onUpdate({ editor }) {
      const serialized = editorToText(editor)
      onChange(serialized)
    },
  })

  // Sync state with the initial prop so re-renders with the same key but
  // different text update the display. On step-change the parent remounts
  // with a new `key`, so we only need to handle the case where the same
  // instance receives a different initial value.
  useEffect(() => {
    if (editor && editor.getText() !== initial) {
      editor.commands.setContent(initial ? `<p>${escapeHtml(initial)}</p>` : '')
    }
  }, [editor, initial])

  return (
    <div className={`${className} editable-protocol-text--${kind}`} data-testid={testId ?? 'editable-protocol-text'}>
      <EditorContent editor={editor} />
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
