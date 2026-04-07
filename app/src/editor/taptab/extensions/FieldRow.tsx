import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import type { FieldRowAttrs } from '../types';
import { useState, useRef, useEffect } from 'react';
import { EnumCombobox } from '../EnumCombobox';
import { RefCombobox } from '../RefCombobox';
import { RichTextField } from '../RichTextField';
import { OntologySidebar, type OntologyTerm } from '../OntologySidebar';
import { apiClient } from '../../../shared/api/client';

function FieldRowView({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as FieldRowAttrs;
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(String(attrs.value ?? ''));
  const [sidebarTerm, setSidebarTerm] = useState<OntologyTerm | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the input when entering editing mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  // Update localValue when node value changes externally
  useEffect(() => {
    setLocalValue(String(attrs.value ?? ''));
  }, [attrs.value]);

  const handleValueClick = () => {
    // Read-only fields do not respond to click
    if (attrs.readOnly) {
      return;
    }

    // Checkbox fields toggle immediately without entering editing state
    if (attrs.widget === 'checkbox') {
      const currentValue = node.attrs.value ?? false;
      updateAttributes({ value: !currentValue });
      return;
    }

    // For other scalar fields, enter editing mode
    setLocalValue(String(attrs.value ?? ''));
    setEditing(true);
  };

  const handleInputBlur = () => {
    if (editing) {
      updateAttributes({ value: localValue });
      setEditing(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateAttributes({ value: localValue });
      setEditing(false);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setLocalValue(String(attrs.value ?? ''));
      setEditing(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalValue(e.target.value);
  };

  const handleComboboxSelect = (selectedValue: string) => {
    updateAttributes({ value: selectedValue });
    setEditing(false);
  };

  const handleComboboxCancel = () => {
    setLocalValue(String(attrs.value ?? ''));
    setEditing(false);
  };

  const handleRefSelect = (selectedValue: string, source: 'local' | 'ontology', termData?: { label: string; iri: string; definition?: string; synonyms?: string[]; ontology?: string }) => {
    if (source === 'ontology' && termData) {
      // Open sidebar for ontology terms
      setSidebarTerm({
        label: termData.label,
        iri: termData.iri,
        definition: termData.definition,
        synonyms: termData.synonyms,
        ontology: termData.ontology,
      });
      setSidebarOpen(true);
    } else {
      // Commit immediately for local terms
      updateAttributes({ value: selectedValue });
      setEditing(false);
    }
  };

  const handleRefCancel = () => {
    setLocalValue(String(attrs.value ?? ''));
    setEditing(false);
  };

  const handleAddToVocab = async (term: { label: string; iri: string }) => {
    try {
      // Add to local vocabulary
      await apiClient.addLocalVocabTerm(attrs.refKind || 'default', {
        value: term.label,
        iri: term.iri,
      });
      // Commit the term label as the field value
      updateAttributes({ value: term.label });
      setEditing(false);
      setSidebarOpen(false);
      setSidebarTerm(null);
    } catch (error) {
      console.error('Failed to add term to local vocabulary:', error);
      // Keep sidebar open on error - error handling is done in the sidebar
    }
  };

  const handleSidebarClose = () => {
    setSidebarOpen(false);
    setSidebarTerm(null);
  };

  if (attrs.widget === 'hidden') {
    return null;
  }

  // Determine input type based on widget
  const getInputType = () => {
    switch (attrs.widget) {
      case 'number':
        return 'number';
      case 'date':
        return 'date';
      default:
        return 'text';
    }
  };

  // Render EnumCombobox for select widgets
  if (editing && attrs.widget === 'select') {
    const options = (attrs.options as Array<{ value: string; label: string }>) || [];
    return (
      <NodeViewWrapper className={`taptab-field-row ${attrs.readOnly ? 'readonly' : ''}`} data-read-only={attrs.readOnly}>
        <span className="taptab-field-label" data-required={attrs.required}>
          {attrs.label}
        </span>
        <span className="taptab-field-value">
          <EnumCombobox
            options={options}
            value={String(attrs.value ?? '')}
            onSelect={handleComboboxSelect}
            onCancel={handleComboboxCancel}
          />
        </span>
        {attrs.help && <span className="taptab-field-help">{attrs.help}</span>}
      </NodeViewWrapper>
    );
  }

  // Render RefCombobox for ref/combobox widgets
  if (editing && (attrs.widget === 'ref' || attrs.widget === 'combobox')) {
    const refKind = (attrs.refKind as string) || 'default';
    return (
      <NodeViewWrapper className={`taptab-field-row ${attrs.readOnly ? 'readonly' : ''}`} data-read-only={attrs.readOnly}>
        <span className="taptab-field-label" data-required={attrs.required}>
          {attrs.label}
        </span>
        <span className="taptab-field-value">
          <RefCombobox
            value={String(attrs.value ?? '')}
            refKind={refKind}
            onSelect={handleRefSelect}
            onCancel={handleRefCancel}
          />
        </span>
        {attrs.help && <span className="taptab-field-help">{attrs.help}</span>}
        {sidebarOpen && sidebarTerm && (
          <OntologySidebar
            term={sidebarTerm}
            onAddToVocab={handleAddToVocab}
            onClose={handleSidebarClose}
            open={sidebarOpen}
          />
        )}
      </NodeViewWrapper>
    );
  }

  // Render RichTextField for textarea or markdown widgets
  if (attrs.widget === 'textarea' || attrs.widget === 'markdown') {
    return (
      <NodeViewWrapper className={`taptab-field-row ${attrs.readOnly ? 'readonly' : ''}`} data-read-only={attrs.readOnly}>
        <span className="taptab-field-label" data-required={attrs.required}>
          {attrs.label}
        </span>
        <RichTextField
          content={String(attrs.value ?? '')}
          onChange={(html) => updateAttributes({ value: html })}
        />
        {attrs.help && <span className="taptab-field-help">{attrs.help}</span>}
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={`taptab-field-row ${attrs.readOnly ? 'readonly' : ''}`} data-read-only={attrs.readOnly}>
      <span className="taptab-field-label" data-required={attrs.required}>
        {attrs.label}
      </span>
      <span className="taptab-field-value" onClick={handleValueClick}>
        {editing ? (
          <input
            ref={inputRef}
            type={getInputType()}
            value={localValue}
            onChange={handleInputChange}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            className="taptab-inline-input"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span>{String(attrs.value ?? '')}</span>
        )}
      </span>
      {attrs.help && <span className="taptab-field-help">{attrs.help}</span>}
    </NodeViewWrapper>
  );
}

export const FieldRow = Node.create({
  name: 'fieldRow',
  group: 'block',
  atom: true,

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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="taptab-field-row"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'taptab-field-row',
        class: 'taptab-field-row',
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FieldRowView);
  },
});
