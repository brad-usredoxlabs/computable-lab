import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'core/term.schema.yaml',
] as const;

async function loadTermSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

const TERM_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/term.schema.yaml';

/** A fully valid, ontology+vendor-linked term (the "ethanol" case). */
function validTerm(): Record<string, unknown> {
  return {
    kind: 'material',
    id: 'TERM-ethanol-k3m2',
    preferredLabel: 'ethanol',
    aliases: ['ethanol', 'EtOH', 'ethyl alcohol'],
    status: 'proposed',
    lifecycleId: 'lab-vocabulary-control',
    linkouts: [
      { kind: 'ontology', namespace: 'CHEBI', curie: 'CHEBI:16236', label: 'ethanol' },
      { kind: 'ontology', namespace: 'NCIT', curie: 'NCIT:8765', label: 'ethanol (NCIT)' },
      { kind: 'vendor', vendor: 'Thermo', catalog_number: '13579', grade: 'HPLC-grade', label: 'Thermo 500 mL HPLC-grade ethanol' },
      { kind: 'vendor', vendor: 'Sigma', catalog_number: '4321', grade: 'reagent-grade', label: 'Sigma 1000 mL reagent-grade ethanol' },
    ],
  };
}

describe('term schema', () => {
  it('loads into the schema registry with FAIRCommon + ref dependencies', async () => {
    const result = await loadTermSchemas();
    expect(result.errors).toEqual([]);

    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);

    expect(registry.has(TERM_SCHEMA_ID)).toBe(true);
    expect(
      registry.getDependencies(TERM_SCHEMA_ID),
    ).toContain('https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml');
  });

  it('validates a fully-linked term (ontology CURIEs + vendor SKUs as linkouts)', async () => {
    const result = await loadTermSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const out = validator.validate(validTerm(), TERM_SCHEMA_ID);
    expect(out.valid).toBe(true);
  });

  it('requires preferredLabel (alias-less term fails)', async () => {
    const result = await loadTermSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const { preferredLabel, ...noLabel } = validTerm();
    const out = validator.validate(noLabel, TERM_SCHEMA_ID);
    expect(out.valid).toBe(false);
    expect(out.errors?.some((e) => e.keyword === 'required')).toBe(true);
  });

  it('rejects a bad linkouts.kind', async () => {
    const result = await loadTermSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const bad = validTerm();
    bad.linkouts = [{ kind: 'wikipedia', url: 'https://en.wikipedia.org/wiki/Ethanol' }];
    const out = validator.validate(bad, TERM_SCHEMA_ID);
    expect(out.valid).toBe(false);
  });

  it('rejects an unknown term kind', async () => {
    const result = await loadTermSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const bad = validTerm();
    bad.kind = 'reagent';
    const out = validator.validate(bad, TERM_SCHEMA_ID);
    expect(out.valid).toBe(false);
  });

  it('rejects an id that does not match the TERM-<slug>-<hash> pattern', async () => {
    const result = await loadTermSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const bad = validTerm();
    bad.id = 'MAT-ETHANOL';
    const out = validator.validate(bad, TERM_SCHEMA_ID);
    expect(out.valid).toBe(false);
  });
});