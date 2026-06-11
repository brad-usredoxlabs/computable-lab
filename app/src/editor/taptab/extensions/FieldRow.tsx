import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { FieldRowAttrs } from '../types';
import { useState } from 'react';
import { OntologySidebar, type OntologyTerm } from '../OntologySidebar';
import { apiClient } from '../../../shared/api/client';
import { WidgetRenderer } from './WidgetRenderer';
import { focusAdjacentTapTabField } from '../tabNavPlugin';

function FieldRowView({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as FieldRowAttrs;
  const [sidebarTerm, setSidebarTerm] = useState<OntologyTerm | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleRefSelect = (v: string, s: 'local' | 'ontology', t?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => {
    if (s === 'ontology' && t) {
      setSidebarTerm({ label: t.label, iri: t.iri, definition: t.definition, synonyms: t.synonyms, ontology: t.ontology });
      setSidebarOpen(true);
    } else { updateAttributes({ value: v }); }
  };

  const handleAddToVocab = async (term: { label: string; iri: string }) => {
    try {
      await apiClient.addLocalVocabTerm(attrs.refKind || 'default', { value: term.label, iri: term.iri });
      updateAttributes({ value: term.label });
      setSidebarOpen(false);
      setSidebarTerm(null);
    } catch (error) { console.error('Failed to add term to local vocabulary:', error); }
  };

  const handleSidebarClose = () => { setSidebarOpen(false); setSidebarTerm(null); };

  if (attrs.widget === 'hidden') return null;

  // Row-level Tab fallback: the plain inline input handles its own Tab
  // (and stops propagation), but composite widgets — rich-text Description,
  // arrays, comboboxes — swallow or never surface Tab, which made
  // navigation die exactly at the fields where those widgets sit (the last
  // field of most sections, so it read as "can't tab across sections").
  // Any Tab that bubbles up to the row advances to the adjacent field.
  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    // currentTarget (the row), NOT target: portal-rendered widget inputs
    // (comboboxes) dispatch through the React tree but live outside the
    // editor DOM, so the target can't anchor a position lookup.
    focusAdjacentTapTabField(e.currentTarget as HTMLElement, e.shiftKey);
  };

  return (
    <NodeViewWrapper className={`taptab-field-row ${attrs.readOnly ? 'readonly' : ''}`} data-read-only={attrs.readOnly} onKeyDown={handleRowKeyDown}>
      <span className="taptab-field-label" data-required={attrs.required}>{attrs.label}</span>
      <WidgetRenderer
        widget={attrs.widget}
        value={attrs.value}
        readOnly={attrs.readOnly || false}
        options={attrs.options}
        refKind={attrs.refKind}
        onCommit={(v) => updateAttributes({ value: v })}
        onRefSelect={handleRefSelect}
        onCancel={() => {}}
        objectProperties={attrs.objectConfig?.properties}
        multiselectOptions={attrs.multiselectConfig?.options}
      />
      {attrs.help && <span className="taptab-field-help">{attrs.help}</span>}
      {sidebarOpen && sidebarTerm && <OntologySidebar term={sidebarTerm} onAddToVocab={handleAddToVocab} onClose={handleSidebarClose} open={sidebarOpen} />}
    </NodeViewWrapper>
  );
}

export const FieldRow = Node.create({
  name: 'fieldRow', group: 'block', atom: true,
  addAttributes() {
    return {
      path: { default: '' },
      widget: { default: 'text' },
      label: { default: '' },
      value: { default: null },
      readOnly: { default: false },
      required: { default: false },
      options: { default: null },
      refKind: { default: null },
      help: { default: null },
      arraySchema: { default: null },
      objectConfig: { default: null },
      reflistConfig: { default: null },
      multiselectConfig: { default: null },
    };
  },
  parseHTML() { return [{ tag: 'div[data-type="taptab-field-row"]' }]; },
  renderHTML({ HTMLAttributes }) { return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'taptab-field-row', class: 'taptab-field-row' })]; },
  addNodeView() { return ReactNodeViewRenderer(FieldRowView); },
});
