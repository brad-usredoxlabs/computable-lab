/**
 * TapTabEditor React component for rendering TipTap-based document editor.
 */

import { useMemo, useImperativeHandle, forwardRef } from 'react';
import { useEditor, EditorContent, Extension, Editor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import { Section, SectionHeading } from './extensions/Section';
import { FieldRow } from './extensions/FieldRow';
import { buildDocument } from './documentMapper';
import { createTabNavPlugin } from './tabNavPlugin';
import type { TapTabEditorProps } from './types';

/**
 * Custom Document extension with content: 'section+' to allow only section nodes.
 */
const CustomDocument = Document.extend({
  content: 'section+',
});

/**
 * Tab navigation extension for FieldRow focus cycling.
 */
const TabNavExtension = Extension.create({
  name: 'tabNav',
  addProseMirrorPlugins() {
    return [createTabNavPlugin()];
  },
});

/**
 * Imperative handle type for TapTabEditor.
 */
export interface TapTabEditorHandle {
  getEditor: () => Editor | null;
}

/**
 * TapTabEditor component that renders a TipTap editor with custom extensions.
 */
export const TapTabEditor = forwardRef<TapTabEditorHandle, TapTabEditorProps>(function TapTabEditor(
  { data, uiSpec, schema, disabled }: TapTabEditorProps,
  ref
) {
  const editor = useEditor({
    extensions: [
      CustomDocument,
      Text,
      Section,
      SectionHeading,
      FieldRow,
      TabNavExtension,
    ],
    content: useMemo(() => buildDocument(uiSpec, schema, data), [uiSpec, schema, data]),
    editable: !disabled,
  });

  // Expose the editor instance to the parent via ref
  useImperativeHandle(ref, () => ({
    getEditor: () => editor,
  }), [editor]);

  if (!editor) {
    return <div className="taptab-editor-loading">Loading editor...</div>;
  }

  return (
    <div className="taptab-editor-container">
      <EditorContent editor={editor} />
    </div>
  );
});

export default TapTabEditor;
