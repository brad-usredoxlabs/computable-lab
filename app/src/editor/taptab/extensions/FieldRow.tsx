import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { FieldRowAttrs } from '../types';
import { useState } from 'react';
import { OntologySidebar, type OntologyTerm } from '../OntologySidebar';
import { apiClient } from '../../../shared/api/client';
import { WidgetRenderer } from './WidgetRenderer';
import { focusAdjacentTapTabField } from '../tabNavPlugin';

interface SelectedOntologyTerm {
  label: string;
  iri?: string;
  definition?: string;
  synonyms?: string[];
  ontology?: string;
  oboId?: string;
}

function curieFromOntologyTerm(term: SelectedOntologyTerm): { curie: string; namespace: string } | null {
  if (term.oboId && /^[A-Za-z][A-Za-z0-9_]*:[A-Za-z0-9_]+$/.test(term.oboId)) {
    const namespace = term.oboId.split(':')[0]!.toUpperCase();
    return { curie: `${namespace}:${term.oboId.split(':').slice(1).join(':')}`, namespace };
  }
  const iriTail = term.iri?.split(/[\/#]/).filter(Boolean).pop();
  if (iriTail && /^[A-Za-z][A-Za-z0-9]+_[A-Za-z0-9_]+$/.test(iriTail)) {
    const [prefix, ...rest] = iriTail.split('_');
    return { curie: `${prefix.toUpperCase()}:${rest.join('_')}`, namespace: prefix.toUpperCase() };
  }
  const namespace = term.ontology?.trim().toUpperCase();
  if (!namespace) return null;
  const id = term.label.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return { curie: `${namespace}:${id}`, namespace };
}

function FieldRowView({ node, updateAttributes, editor }: NodeViewProps) {
  const attrs = node.attrs as FieldRowAttrs;
  const [sidebarTerm, setSidebarTerm] = useState<OntologyTerm | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const groundOntologyTerm = async (term: SelectedOntologyTerm) => {
    const curie = curieFromOntologyTerm(term);
    if (!curie) throw new Error('Could not derive ontology CURIE for selected term');
    const response = await apiClient.groundOntologyMaterial({
      ontologyRef: {
        kind: 'ontology',
        id: curie.curie,
        namespace: curie.namespace,
        label: term.label,
        ...(term.iri ? { uri: term.iri } : {}),
      },
      sourceLabel: term.label,
    });
    updateAttributes({ value: response.materialRef });
  };

  const handleRefSelect = async (v: string, s: 'local' | 'ontology', t?: SelectedOntologyTerm) => {
    if (s === 'ontology' && t) {
      if (attrs.suggestionPlan?.ontologyBinding === 'local-material-required') {
        try {
          await groundOntologyTerm(t);
          return;
        } catch (error) {
          console.error('Failed to ground ontology material:', error);
        }
      }
      if (attrs.suggestionPlan?.valueShape === 'ontology-ref') {
        const curie = curieFromOntologyTerm(t);
        updateAttributes({
          value: curie
            ? { kind: 'ontology', id: curie.curie, namespace: curie.namespace, label: t.label, ...(t.iri ? { uri: t.iri } : {}) }
            : v,
        });
        return;
      }
      setSidebarTerm({ label: t.label, iri: t.iri ?? '', definition: t.definition, synonyms: t.synonyms, ontology: t.ontology });
      setSidebarOpen(true);
    } else {
      updateAttributes({ value: v });
    }
  };

  const handleAddToVocab = async (term: { label: string; iri: string }) => {
    try {
      if (attrs.suggestionPlan?.ontologyBinding === 'local-material-required') {
        await groundOntologyTerm({ ...term, ontology: sidebarTerm?.ontology });
      } else {
        await apiClient.addLocalVocabTerm(attrs.refKind || 'default', { value: term.label, iri: term.iri });
        updateAttributes({ value: term.label });
      }
      setSidebarOpen(false);
      setSidebarTerm(null);
    } catch (error) { console.error('Failed to add term to local vocabulary:', error); }
  };

  const handleSidebarClose = () => { setSidebarOpen(false); setSidebarTerm(null); };

  const getRecordValue = (path: string): unknown => {
    let value: unknown;
    editor.state.doc.descendants((child) => {
      if (child.type.name === 'fieldRow' && child.attrs.path === path) {
        value = child.attrs.value;
        return false;
      }
      return true;
    });
    return value;
  };

  const handleRecordPatch = (patch: Record<string, unknown>) => {
    const paths = new Set(Object.keys(patch));
    if (paths.size === 0) return;
    let tr = editor.state.tr;
    editor.state.doc.descendants((child, pos) => {
      if (child.type.name !== 'fieldRow') return true;
      const path = child.attrs.path;
      if (typeof path !== 'string' || !paths.has(path)) return true;
      tr = tr.setNodeMarkup(pos, undefined, { ...child.attrs, value: patch[path] }, child.marks);
      return true;
    });
    if (tr.docChanged) editor.view.dispatch(tr);
  };

  if (attrs.widget === 'hidden') return null;

  // Row-level Tab fallback: the plain inline input handles its own Tab
  // (and stops propagation), but composite widgets swallow or never surface Tab.
  const handleRowKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    e.stopPropagation();
    focusAdjacentTapTabField(e.currentTarget as HTMLElement, e.shiftKey);
  };

  const readOnly = attrs.readOnly || attrs.suggestionPlan?.ownedByApp || false;

  return (
    <NodeViewWrapper className={`taptab-field-row ${readOnly ? 'readonly' : ''}`} data-read-only={readOnly} onKeyDown={handleRowKeyDown}>
      <span className="taptab-field-label" data-required={attrs.required}>{attrs.label}</span>
      <WidgetRenderer
        widget={attrs.widget}
        value={attrs.value}
        readOnly={readOnly}
        options={attrs.options}
        refKind={attrs.refKind}
        suggestionPlan={attrs.suggestionPlan}
        onCommit={(v) => updateAttributes({ value: v })}
        onRefSelect={handleRefSelect}
        onCancel={() => {}}
        objectProperties={attrs.objectConfig?.properties}
        multiselectOptions={attrs.multiselectConfig?.options}
        recordId={attrs.recordId}
        onRecordPatch={handleRecordPatch}
        getRecordValue={getRecordValue}
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
      suggestionPlan: { default: null },
      refKind: { default: null },
      help: { default: null },
      recordId: { default: null },
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
