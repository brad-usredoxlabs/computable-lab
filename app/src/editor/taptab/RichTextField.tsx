/**
 * RichTextField component for rendering a nested TipTap editor.
 * Used for fields with widget 'textarea' or 'markdown'.
 */

import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import { focusAdjacentTapTabField } from './tabNavPlugin';

export interface RichTextFieldProps {
  /** HTML string content */
  content: string;
  /** Callback when content changes */
  onChange: (html: string) => void;
}

export function RichTextField({ content, onChange }: RichTextFieldProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'ProseMirror',
      },
    },
  });

  if (!editor) {
    return <div className="taptab-richtext-loading">Loading editor...</div>;
  }

  // This is a nested TipTap editor: Tab keydowns inside its contenteditable
  // never reach the outer editor's tab-nav plugin, so without this handler Tab
  // falls through to the browser's native focus order and skips the next field
  // (e.g. Description → Tags). Content is already committed live via onUpdate,
  // so we only need to advance focus.
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    focusAdjacentTapTabField(e.currentTarget as HTMLElement, e.shiftKey);
  };

  return (
    <div className="taptab-richtext" onKeyDown={handleKeyDown}>
      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextField;
