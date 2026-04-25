/**
 * Tests for the editor config in UISpecLoader.
 * 
 * Proves that the loader accepts the new `editor` config while leaving
 * existing `form` specs valid.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UISpecLoader } from './UISpecLoader.js';
import type { UISpec, EditorConfig, EditorBlock, EditorSlot } from './types.js';

describe('UISpecLoader.editor', () => {
  let loader: UISpecLoader;

  beforeEach(() => {
    loader = new UISpecLoader();
  });

  describe('editor config acceptance', () => {
    it('loads a UI spec with editor config', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/budget.schema.yaml"
editor:
  mode: "document"
  blocks:
    - id: "header"
      kind: "section"
      label: "Header"
    - id: "lines"
      kind: "repeater"
      label: "Line Items"
      path: "$.lines"
    - id: "totals"
      kind: "section"
      label: "Totals"
  slots:
    - id: "title"
      path: "$.title"
      label: "Title"
      widget: "text"
      required: true
    - id: "notes"
      path: "$.notes"
      label: "Notes"
      widget: "textarea"
      suggestionProviders:
        - local-vocab
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec).toBeDefined();
      expect(result.spec!.editor).toBeDefined();
      expect(result.spec!.editor!.mode).toBe('document');
      expect(result.spec!.editor!.blocks).toHaveLength(3);
      expect(result.spec!.editor!.slots).toHaveLength(2);
    });

    it('validates editor block kinds', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks:
    - id: "b1"
      kind: "section"
    - id: "b2"
      kind: "paragraph"
    - id: "b3"
      kind: "repeater"
    - id: "b4"
      kind: "table"
  slots: []
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.editor!.blocks).toHaveLength(4);
    });

    it('validates editor slot suggestion providers', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks: []
  slots:
    - id: "s1"
      path: "$.field1"
      label: "Field 1"
      widget: "text"
      suggestionProviders:
        - local-records
        - local-vocab
        - ontology
        - vendor-search
        - compiler
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.editor!.slots[0].suggestionProviders).toHaveLength(5);
    });

    it('accepts editor with table block and columns', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks:
    - id: "items"
      kind: "table"
      label: "Items"
      path: "$.items"
      columns:
        - path: "$.items[].name"
          label: "Name"
          widget: "text"
        - path: "$.items[].price"
          label: "Price"
          widget: "number"
  slots: []
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      const tableBlock = result.spec!.editor!.blocks.find(b => b.kind === 'table');
      expect(tableBlock).toBeDefined();
      expect(tableBlock!.columns).toHaveLength(2);
    });
  });

  describe('editor is additive to form', () => {
    it('loads a spec with both editor and form configs', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/budget.schema.yaml"
editor:
  mode: "document"
  blocks:
    - id: "header"
      kind: "section"
      label: "Header"
  slots: []
form:
  layout: "sections"
  sections:
    - title: "Details"
      fields:
        - path: "$.title"
          widget: "text"
          label: "Title"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.editor).toBeDefined();
      expect(result.spec!.form).toBeDefined();
      expect(result.spec!.form!.sections).toHaveLength(1);
    });

    it('loads a spec with only form config (no editor)', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
form:
  layout: "sections"
  sections:
    - title: "Details"
      fields:
        - path: "$.title"
          widget: "text"
          label: "Title"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.form).toBeDefined();
      expect(result.spec!.editor).toBeUndefined();
    });

    it('loads a spec with only editor config (no form)', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks:
    - id: "b1"
      kind: "paragraph"
      label: "Intro"
  slots: []
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.editor).toBeDefined();
      expect(result.spec!.form).toBeUndefined();
    });
  });

  describe('existing form specs remain valid', () => {
    it('loads the planned-run UI spec pattern', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/planned-run.schema.yaml"
display:
  titleField: "$.title"
  subtitleField: "$.state"
form:
  layout: "sections"
  sections:
    - title: "Identity"
      fields:
        - path: "$.recordId"
          widget: "text"
          label: "Record ID"
          readonly: true
        - path: "$.kind"
          widget: "text"
          label: "Kind"
          readonly: true
          hidden: true
    - title: "Basic Information"
      fields:
        - path: "$.title"
          widget: "text"
          label: "Title"
          required: true
        - path: "$.state"
          widget: "select"
          label: "State"
          required: true
list:
  columns:
    - path: "$.recordId"
      label: "ID"
    - path: "$.title"
      label: "Title"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.form).toBeDefined();
      expect(result.spec!.list).toBeDefined();
      expect(result.spec!.editor).toBeUndefined();
    });

    it('loads a spec with list config only', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
list:
  columns:
    - path: "$.id"
      label: "ID"
    - path: "$.name"
      label: "Name"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.list).toBeDefined();
    });

    it('loads a spec with detail config', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
detail:
  sections:
    - title: "Details"
      fields:
        - path: "$.name"
          label: "Name"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.detail).toBeDefined();
    });
  });

  describe('validation errors', () => {
    it('rejects a spec missing required fields', () => {
      const yaml = `
uiVersion: 1
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('Missing required field: schemaId');
    });

    it('rejects a spec with invalid uiVersion', () => {
      const yaml = `
uiVersion: "not-a-number"
schemaId: "https://example.com/schema/test.schema.yaml"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('uiVersion must be a number');
    });

    it('rejects a form section missing fields array', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
form:
  sections:
    - title: "Empty"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('form.sections[0]: missing required \'fields\' array');
    });

    it('rejects a field hint missing path', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
form:
  sections:
    - title: "Fields"
      fields:
        - widget: "text"
          label: "No path"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain('form.sections[0].fields[0]: missing required \'path\'');
    });

    it('rejects a field hint with invalid widget type', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
form:
  sections:
    - title: "Fields"
      fields:
        - path: "$.field"
          widget: "nonexistent-widget"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(false);
      expect(result.validationErrors).toContain("form.sections[0].fields[0].widget: invalid widget type 'nonexistent-widget'");
    });
  });

  describe('budget.ui.yaml pattern', () => {
    it('loads the budget UI spec pattern with editor and form', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://computable-lab.com/schema/computable-lab/budget.schema.yaml"
display:
  titleField: "$.title"
  subtitleField: "$.state"
  icon: "budget"
editor:
  mode: "document"
  blocks:
    - id: "header-summary"
      kind: "section"
      label: "Budget Summary"
      help: "Overview of budget state, currency, and totals."
    - id: "line-items"
      kind: "repeater"
      label: "Line Items"
      help: "Selected vendor-offer lines with pricing."
      path: "$.lines"
    - id: "totals"
      kind: "section"
      label: "Totals"
      help: "Computed summary of approved line items."
  slots:
    - id: "title-slot"
      path: "$.title"
      label: "Budget Title"
      widget: "text"
      required: true
    - id: "state-slot"
      path: "$.state"
      label: "State"
      widget: "select"
      suggestionProviders:
        - local-vocab
    - id: "currency-slot"
      path: "$.currency"
      label: "Currency"
      widget: "select"
      suggestionProviders:
        - local-vocab
    - id: "notes-slot"
      path: "$.notes"
      label: "Notes"
      widget: "textarea"
      suggestionProviders:
        - local-vocab
form:
  layout: "sections"
  sections:
    - title: "Identity"
      fields:
        - path: "$.recordId"
          widget: "text"
          label: "Record ID"
          readonly: true
    - title: "Budget Details"
      fields:
        - path: "$.title"
          widget: "text"
          label: "Title"
          required: true
list:
  columns:
    - path: "$.recordId"
      label: "ID"
    - path: "$.title"
      label: "Title"
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(result.spec!.editor).toBeDefined();
      expect(result.spec!.editor!.mode).toBe('document');
      expect(result.spec!.editor!.blocks).toHaveLength(3);
      expect(result.spec!.editor!.slots).toHaveLength(4);
      expect(result.spec!.form).toBeDefined();
      expect(result.spec!.form!.sections).toHaveLength(2);
      expect(result.spec!.list).toBeDefined();
    });
  });

  describe('caching', () => {
    it('caches specs by schemaId', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks: []
  slots: []
`;

      const result = loader.load(yaml);
      expect(result.success).toBe(true);
      expect(loader.has('https://example.com/schema/test.schema.yaml')).toBe(true);
      expect(loader.get('https://example.com/schema/test.schema.yaml')).toBeDefined();
    });

    it('clears the cache', () => {
      const yaml = `
uiVersion: 1
schemaId: "https://example.com/schema/test.schema.yaml"
editor:
  mode: "document"
  blocks: []
  slots: []
`;

      loader.load(yaml);
      expect(loader.size()).toBe(1);
      loader.clear();
      expect(loader.size()).toBe(0);
      expect(loader.has('https://example.com/schema/test.schema.yaml')).toBe(false);
    });
  });
});
