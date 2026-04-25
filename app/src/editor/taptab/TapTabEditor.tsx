/**
 * TapTabEditor React component for rendering TipTap-based document editor.
 * Supports both the legacy uiSpec+data path and the new projection-backed path.
 */

import { useMemo, useImperativeHandle, forwardRef, useCallback, useRef } from 'react';
import { useEditor, EditorContent, Extension, Editor } from '@tiptap/react';
import Document from '@tiptap/extension-document';
import Text from '@tiptap/extension-text';
import { Section, SectionHeading } from './extensions/Section';
import { FieldRow } from './extensions/FieldRow';
import { buildDocument, buildProjectionDocument } from './documentMapper';
import { createTabNavPlugin } from './tabNavPlugin';
import { serializeDocument, isDirty } from './recordSerializer';
import type { TapTabEditorProps, OnSerializedChangeCallback } from './types';

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
 * Supports both the legacy uiSpec+data path and the new projection-backed path.
 */
export const TapTabEditor = forwardRef<TapTabEditorHandle, TapTabEditorProps>(function TapTabEditor(
  { data, uiSpec, disabled, onUpdate }: TapTabEditorProps,
  ref
) {
  // Build TipTap document from uiSpec (legacy path)
  const content = useMemo(() => buildDocument(uiSpec, data), [uiSpec, data]);

  // Use a ref to avoid circular dependency between handleUpdate and editor
  const editorRef = useRef<Editor | null>(null);

  // Event-driven dirty tracking: serialize and report changes when editor updates
  const handleUpdate = useCallback(() => {
    if (!onUpdate || !editorRef.current) return;
    const serialized = serializeDocument(editorRef.current.getJSON(), data);
    const dirty = isDirty(data, serialized);
    onUpdate(serialized, dirty);
  }, [onUpdate, data]);

  const editor = useEditor({
    extensions: [
      CustomDocument,
      Text,
      Section,
      SectionHeading,
      FieldRow,
      TabNavExtension,
    ] as any[],
    content,
    editable: !disabled,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'taptab-editor-prose',
      },
    },
  });

  // Update ref when editor changes
  editorRef.current = editor;

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

/**
 * Props for ProjectionTapTabEditor — extends ProjectionEditorProps with onUpdate.
 */
export interface ProjectionTapTabEditorProps {
  /** Document blocks from the projection */
  blocks: Array<{
    id: string;
    kind: string;
    label?: string;
    help?: string;
    slotIds?: string[];
  }>;
  /** Document slots from the projection */
  slots: Array<{
    id: string;
    path: string;
    label: string;
    widget: string;
    help?: string;
    required?: boolean;
    readOnly?: boolean;
    suggestionProviders?: string[];
  }>;
  /** Base payload to edit */
  data: Record<string, unknown>;
  /** Whether the editor is disabled */
  disabled?: boolean;
  /** Callback fired when the editor content changes (event-driven dirty tracking) */
  onUpdate?: OnSerializedChangeCallback;
}

/**
 * Projection-backed TapTabEditor — used by BudgetDocumentSurface and registry surfaces.
 * Builds the TipTap document from EditorProjection blocks/slots instead of uiSpec.
 */
export const ProjectionTapTabEditor = forwardRef<TapTabEditorHandle, ProjectionTapTabEditorProps>(function ProjectionTapTabEditor(
  { blocks, slots, data, disabled, onUpdate }: ProjectionTapTabEditorProps,
  ref
) {
  // Build TipTap document from projection (additive path)
  const content = useMemo(() => buildProjectionDocument(blocks, slots, data), [blocks, slots, data]);

  // Use a ref to avoid circular dependency between handleUpdate and editor
  const editorRef = useRef<Editor | null>(null);

  // Event-driven dirty tracking: serialize and report changes when editor updates
  const handleUpdate = useCallback(() => {
    if (!onUpdate || !editorRef.current) return;
    const serialized = serializeDocument(editorRef.current.getJSON(), data);
    const dirty = isDirty(data, serialized);
    onUpdate(serialized, dirty);
  }, [onUpdate, data]);

  const editor = useEditor({
    extensions: [
      CustomDocument,
      Text,
      Section,
      SectionHeading,
      FieldRow,
      TabNavExtension,
    ] as any[],
    content,
    editable: !disabled,
    onUpdate: handleUpdate,
    editorProps: {
      attributes: {
        class: 'taptab-editor-prose',
      },
    },
  });

  // Update ref when editor changes
  editorRef.current = editor;

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
