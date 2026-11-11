/**
 * Ontology Sources Registry — conformance test.
 *
 * Proves that the shipped registry (config/ontology-sources.yaml) is valid
 * against its schema, and that every enabled local-obo source actually loads
 * to a valid OBO file containing its declared root term.
 *
 * Six legs:
 *   (i)   registry parses as YAML and validates against the schema
 *   (ii)  every enabled local-obo source's path exists and contains >= 1
 *         [Term] stanza whose id: equals the entry's declared root
 *   (iii) id, prefix, namespace_iri are unique across sources
 *   (iv)  loader/path discipline: local-obo has path, ols4 has ols_key
 *         (exercised by shipped data AND an inline negative fixture)
 *   (v)   at least one enabled source and at least one local source
 *   (vi)  hardcode boundary: no TS file outside *.test.ts contains the
 *         literal "<PREFIX>:" for any prefix in the registry
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the SHIPPED registry from disk — never inline a copy.
const REGISTRY_URL = new URL('../../../config/ontology-sources.yaml', import.meta.url);
const REGISTRY_PATH = fileURLToPath(REGISTRY_URL);
const registryData = parseYaml(
  readFileSync(REGISTRY_PATH, 'utf8')
);

// Load the schema from content
function loadSchema() {
  const schemaContent = readFileSync(
    resolve(__dirname, '../../../schema/registry/ontology-sources.schema.yaml'),
    'utf8'
  );
  const schemas = new Map<string, string>();
  schemas.set('ontology-sources.schema.yaml', schemaContent);
  return schemas;
}

// Load all .ts files from server/src and app/src (excluding *.test.ts)
function getAllTsFiles(baseDir: string): string[] {
  const files: string[] = [];
  function walk(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
        files.push(full);
      }
    }
  }
  walk(baseDir);
  return files;
}

function parseObos(content: string): Array<{ id: string; isTerm: boolean }> {
  const stanzas: Array<{ id: string; isTerm: boolean }> = [];
  const lines = content.split('\n');
  let inTerm = false;
  let termId: string | undefined;
  for (const line of lines) {
    if (line === '[Term]') {
      inTerm = true;
      termId = undefined;
    } else if (line.startsWith('[') && line !== '[Term]') {
      inTerm = false;
    } else if (inTerm && line.startsWith('id: ')) {
      termId = line.slice(4).trim();
    } else if (inTerm && line === '' && termId !== undefined) {
      stanzas.push({ id: termId, isTerm: true });
      inTerm = false;
    }
  }
  // Close last stanza if file doesn't end with blank line
  if (inTerm && termId !== undefined) {
    stanzas.push({ id: termId, isTerm: true });
  }
  return stanzas;
}

describe('Ontology Sources Registry', () => {
  it('(i) registry parses as YAML and validates against the schema', async () => {
    const schemas = loadSchema();
    const loaded = loadSchemasFromContent(schemas);
    expect(loaded.errors, 'schema load errors').toEqual([]);
    expect(loaded.entries.length).toBeGreaterThanOrEqual(1);

    const validator = createValidator({ strict: false });
    for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);

    const result = validator.validate(registryData, loaded.entries[0].id);
    expect(result.errors, 'registry validation errors').toEqual([]);
  });

  it('(ii) every enabled local-obo source loads to >= 1 term with declared root', () => {
    const sources = registryData.sources as Array<Record<string, unknown>>;
    for (const source of sources) {
      const enabled = source.enabled as boolean;
      const loader = source.loader as string;
      const id = source.id as string;
      if (!enabled || loader !== 'local-obo') continue;

      const path = source.path as string;
      const expectedRoot = source.root as string;
      expect(path, `${id}: path must be declared`).toBeDefined();
      expect(expectedRoot, `${id}: root must be declared`).toBeDefined();

      // File must exist
      const content = readFileSync(path, 'utf8');

      // Parse [Term] stanzas
      const terms = parseObos(content).filter((s) => s.isTerm);
      expect(terms.length, `${id}: must have >= 1 [Term] stanza`).toBeGreaterThanOrEqual(1);

      // Declared root must be present
      const roots = terms.map((s) => s.id);
      expect(roots.includes(expectedRoot), `${id}: root ${expectedRoot} not found in ${path}`).toBe(true);
    }
  });

  it('(iii) id, prefix, namespace_iri are unique across sources', () => {
    const sources = registryData.sources as Array<Record<string, unknown>>;

    const ids = sources.map((s) => s.id);
    const prefixes = sources.map((s) => s.prefix);
    const iris = sources.map((s) => s.namespace_iri);

    expect(new Set(ids).size, 'duplicate id').toBe(ids.length);
    expect(new Set(prefixes).size, 'duplicate prefix').toBe(prefixes.length);
    expect(new Set(iris).size, 'duplicate namespace_iri').toBe(iris.length);
  });

  it('(iv) loader discipline — local has path, ols4 has ols_key (data + negative fixture)', () => {
    const sources = registryData.sources as Array<Record<string, unknown>>;

    // Check shipped data
    for (const source of sources) {
      const loader = source.loader as string;
      const id = source.id as string;
      if (loader === 'local-obo') {
        expect(source.path, `${id}: local-obo must declare path`).toBeDefined();
        expect(source.ols_key, `${id}: local-obo must NOT declare ols_key`).toBeUndefined();
      } else if (loader === 'ols4') {
        expect(source.ols_key, `${id}: ols4 must declare ols_key`).toBeDefined();
        expect(source.path, `${id}: ols4 must NOT declare path`).toBeUndefined();
      }
    }

    // Inline negative fixture — schema must reject these
    const schemas = loadSchema();
    const loaded = loadSchemasFromContent(schemas);
    const validator = createValidator({ strict: false });
    for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
    const schemaId = loaded.entries[0].id;

    // Negative 1: ols4 source with a path (must fail)
    const ols4WithPath = {
      version: '1.0',
      sources: [
        {
          id: 'bad-ols4',
          prefix: 'BAD',
          namespace_iri: 'http://example.org/bad/',
          display_name: 'Bad',
          loader: 'ols4',
          enabled: true,
          ols_key: 'bad',
          path: '/no/such/file.obo',
        },
      ],
    };
    const neg1 = validator.validate(ols4WithPath, schemaId);
    expect(neg1.valid, 'ols4 with path must be rejected').toBe(false);

    // Negative 2: local-obo source without a path (must fail)
    const localWithoutPath = {
      version: '1.0',
      sources: [
        {
          id: 'bad-local',
          prefix: 'BAD',
          namespace_iri: 'http://example.org/bad/',
          display_name: 'Bad',
          loader: 'local-obo',
          enabled: true,
          root: 'BAD:0000100',
        },
      ],
    };
    const neg2 = validator.validate(localWithoutPath, schemaId);
    expect(neg2.valid, 'local-obo without path must be rejected').toBe(false);
  });

  it('(v) at least one enabled source and at least one local source', () => {
    const sources = registryData.sources as Array<Record<string, unknown>>;
    const enabled = sources.filter((s) => s.enabled === true);
    const local = sources.filter((s) => s.loader === 'local-obo');

    expect(enabled.length, 'must have at least one enabled source').toBeGreaterThanOrEqual(1);
    expect(local.length, 'must have at least one local source').toBeGreaterThanOrEqual(1);
  });

  it('(vi) hardcode boundary — prefix CURIE not in non-test TS files', () => {
    const sources = registryData.sources as Array<Record<string, unknown>>;
    const prefixes = sources.map((s) => s.prefix as string);

    // Scan server/src and app/src for hardcoded prefix literals
    const serverTs = getAllTsFiles(resolve(__dirname, '..'));
    const appTs = getAllTsFiles(resolve(__dirname, '../../../app/src'));
    const allFiles = [...serverTs, ...appTs];

    for (const prefix of prefixes) {
      const pattern = `${prefix}:`;
      for (const file of allFiles) {
        const content = readFileSync(file, 'utf8');
        expect(
          content.includes(pattern),
          `Hardcoded "${pattern}" found in ${file} — prefixes must only appear in config/ontology-sources.yaml`
        ).toBe(false);
      }
    }
  });
});
