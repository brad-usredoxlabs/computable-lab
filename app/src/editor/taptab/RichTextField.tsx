/**
 * RichTextField component for rendering a nested TipTap editor.
 * Used for fields with widget 'textarea' or 'markdown'.
 */

import { useEditor, EditorContent } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';

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

  return (
    <div className="taptab-richtext">
      <EditorContent editor={editor} />
    </div>
  );
}

export default RichTextField;
