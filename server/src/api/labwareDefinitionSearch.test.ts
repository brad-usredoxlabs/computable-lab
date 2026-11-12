// @vitest-environment node
/**
 * Labware search + labwareType -> ontology-class binding (unit O4): shipped config
 * validates, CURIEs come from the ontology repo's data file, absent file fails by
 * name, and hits gain `lwoClass` only when the data maps the type to a CURIE.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import {
  loadLabwareTypeBindings,
  lookupLabwareClass,
} from '../resolve/bindings/labwareTypeBinding.js';
import {
  searchLabwareDefinitions,
  type LabwareDefinitionSearchOptions,
} from './labwareDefinitionSearch.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, '../../../config/ontology-bindings.yaml');
const SCHEMA_PATH = resolve(__dirname, '../../../schema/registry/ontology-bindings.schema.yaml');

function readConfig(): Record<string, unknown> {
  return parseYaml(readFileSync(CONFIG_PATH, 'utf8')) as Record<string, unknown>;
}

function buildValidator() {
  const contents = new Map<string, string>();
  contents.set('ontology-bindings.schema.yaml', readFileSync(SCHEMA_PATH, 'utf8'));
  const loaded = loadSchemasFromContent(contents);
  expect(loaded.errors, 'schema load errors').toEqual([]);
  const validator = createValidator({ strict: false });
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
  return { validator, schemaId: loaded.entries[0]!.id };
}

function storeWith(payloads: Array<Record<string, unknown>>) {
  return {
    list: async () => payloads.map((payload) => ({ payload })),
  } as unknown as LabwareDefinitionSearchOptions['store'];
}

function fixture(recordId: string, displayName: string, legacy?: string[]) {
  return {
    kind: 'labware-definition',
    recordId,
    type: 'labware_definition',
    id: `fixture/${recordId}@v1`,
    display_name: displayName,
    ...(legacy ? { legacy_labware_types: legacy } : {}),
  };
}

describe('labwareType -> ontology class bindings', () => {
  it('(a) shipped config validates against the closed schema', () => {
    const { validator, schemaId } = buildValidator();
    expect(validator.validate(readConfig(), schemaId).errors).toEqual([]);
  });

  it('(a) a path-less copy is rejected with the missing field named', () => {
    const { validator, schemaId } = buildValidator();
    const { path: _dropped, ...mutated } = readConfig();
    const result = validator.validate(mutated, schemaId);
    expect(result.valid).toBe(false);
    const missing = result.errors
      .filter((e) => e.keyword === 'required')
      .map((e) => (e.params as { missingProperty?: string } | undefined)?.missingProperty);
    expect(missing).toContain('path');
  });

  it('(b) real bindings map plate, reservoir and other to their data CURIEs', () => {
    expect(lookupLabwareClass('plate')?.lwoClass).toBe('LWO:0000121');
    expect(lookupLabwareClass('reservoir')?.lwoClass).toBe('LWO:0000117');
    expect(lookupLabwareClass('other')?.lwoClass).toBe('LWO:0000100');
  });

  it('(c) slide carries data null plus the data note — no substitute class', () => {
    const binding = lookupLabwareClass('slide');
    expect(binding).not.toBeNull();
    expect(binding?.lwoClass).toBeNull();
    expect(binding?.note).toContain('Microscope slide');
  });

  it('(d) an unknown type answers null without throwing or fuzzy-matching', () => {
    expect(lookupLabwareClass('microfluidic-chip')).toBeNull();
  });

  it('(e) an absent bindings path fails loudly by name; non-strict answers null', () => {
    const missing = resolve(__dirname, '../../../config/no-such-bindings-file.yaml');
    expect(() => loadLabwareTypeBindings({ bindingsPath: missing })).toThrowError(
      new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    );
    expect(lookupLabwareClass('plate', { bindingsPath: missing, strict: false })).toBeNull();
    const report = loadLabwareTypeBindings({ bindingsPath: missing, strict: false });
    expect(report.failures.map((f) => f.path)).toContain(missing);
    expect(report.entries).toEqual([]);
  });

  it('(f) a plate-type definition comes back anchored with the data CURIE', async () => {
    const store = storeWith([fixture('lwd-fixture-plate-anchor', 'Fixture Plate Anchor', ['plate'])]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture plate anchor' });
    expect(hits).toHaveLength(1);
    expect(hits[0]!.lwoClass).toBe('LWO:0000121');
  });

  it('(f) an untyped definition has no lwoClass key at all', async () => {
    const store = storeWith([fixture('lwd-fixture-unanchored', 'Fixture Unanchored Carrier')]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture unanchored carrier' });
    expect(hits).toHaveLength(1);
    expect('lwoClass' in hits[0]!).toBe(false);
  });

  it('(f) a null-mapped legacy type leaves the key absent (slide, not a lookalike)', async () => {
    const store = storeWith([fixture('lwd-fixture-slide', 'Fixture Slide Carrier', ['slide'])]);
    const { hits } = await searchLabwareDefinitions({ store, q: 'fixture slide carrier' });
    expect(hits).toHaveLength(1);
    expect('lwoClass' in hits[0]!).toBe(false);
  });
});
