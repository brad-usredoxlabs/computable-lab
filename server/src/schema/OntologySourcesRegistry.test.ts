/**
 * Ontology Sources Registry — conformance test.
 *
 * Proves that the shipped registry (config/ontology-sources.yaml) is
 * schema-valid and that every enabled local-obo source actually loads
 * to a valid OBO file containing its declared root term.
 *
 * Seven legs (from the brief + o1rfix):
 *   (i)     registry parses as YAML and validates against the schema
 *   (ii)    every enabled local-obo source's path exists AND parses to
 *           >= 1 [Term] stanza whose id: equals that entry's declared root
 *   (iii)   id, prefix, namespace_iri are unique across sources
 *   (iv)    loader discipline: local-obo-with-path or ols4-without-path,
 *           exercised by shipped data AND two inline negative fixtures
 *   (v)     at least one enabled source and at least one local source
 *   (v.bis) at least two enabled local-obo sources with distinct roots
 *   (vi)    hardcode boundary: derive prefix list from registry and assert
 *           the literal '<PREFIX>:' does not appear in any non-test TS/TSX
 *           file under server/src or app/src
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the SHIPPED registry from disk — never inline a copy.
const REGISTRY_URL = new URL('../../../config/ontology-sources.yaml', import.meta.url);

function readRegistry() {
  return parseYaml(readFileSync(REGISTRY_URL, 'utf8')) as Record<string, unknown>;
}

function buildValidator() {
  const contents = new Map<string, string>();
  contents.set(
    'ontology-sources.schema.yaml',
    readFileSync(
      resolve(__dirname, '../../../schema/registry/ontology-sources.schema.yaml'),
      'utf8',
    ),
  );
  const loaded = loadSchemasFromContent(contents);
  expect(loaded.errors, 'schema load errors').toEqual([]);
  const validator = createValidator({ strict: false });
  for (const entry of loaded.entries) validator.addSchema(entry.schema, entry.id);
  return { validator, schemaId: loaded.entries[0].id };
}

// Helper: parse OBO file for [Term] stanzas
function parseObos(content: string): string[] {
  const ids: string[] = [];
  let inTerm = false;
  for (const line of content.split('\n')) {
    if (line === '[Term]') inTerm = true;
    else if (line.startsWith('[') && line !== '[Term]') inTerm = false;
    else if (inTerm && line.startsWith('id: ')) {
      ids.push(line.slice(4).trim());
    }
  }
  return ids;
}

// Helper: collect .ts/.tsx files (excluding *.test.ts / *.test.tsx) recursively
function collectTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (entry.isFile() && /\.(ts|tsx|mts|cts)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name))
      out.push(full);
  }
  return out;
}

describe('Ontology Sources Registry', () => {
  it('(i) registry parses and validates against schema', () => {
    const registry = readRegistry();
    const { validator, schemaId } = buildValidator();
    const result = validator.validate(registry, schemaId);
    expect(result.errors).toEqual([]);
  });

  it('(ii) every enabled local-obo source loads to >=1 [Term] with declared root', () => {
    const registry = readRegistry();
    const sources = registry.sources as Array<Record<string, unknown>>;
    for (const src of sources) {
      if (src.loader !== 'local-obo' || !src.enabled) continue;
      const path = src.path as string;
      const root = src.root as string;
      expect(path, `${src.id}: path must exist`).toBeTruthy();
      expect(existsSync(path), `${src.id}: path missing`).toBe(true);
      const content = readFileSync(path, 'utf8');
      const termIds = parseObos(content);
      expect(termIds.length, `${src.id}: >= 1 [Term]`).toBeGreaterThanOrEqual(1);
      expect(
        termIds.includes(root),
        `${src.id}: root ${root} not found in ${path}`,
      ).toBe(true);
    }
  });

  it('(iii) id, prefix, namespace_iri are unique across sources', () => {
    const registry = readRegistry();
    const sources = registry.sources as Array<Record<string, unknown>>;
    const ids = sources.map((s) => s.id);
    const prefixes = sources.map((s) => s.prefix);
    const iris = sources.map((s) => s.namespace_iri);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(prefixes).size).toBe(prefixes.length);
    expect(new Set(iris).size).toBe(iris.length);
  });

  it('(iv) loader discipline: local-obo has path, ols4 has ols_key — data + negative fixtures', () => {
    const registry = readRegistry();
    const { validator, schemaId } = buildValidator();

    // Shipped data: local entries have path, ols4 entry has ols_key
    const sources = registry.sources as Array<Record<string, unknown>>;
    for (const src of sources) {
      if (src.loader === 'local-obo') {
        expect(src.path, `${src.id}: local-obo must have path`).toBeTruthy();
        expect(src.ols_key, `${src.id}: local-obo must not have ols_key`).toBeUndefined();
      } else if (src.loader === 'ols4') {
        expect(src.ols_key, `${src.id}: ols4 must have ols_key`).toBeTruthy();
        expect(src.path, `${src.id}: ols4 must not have path`).toBeUndefined();
      }
    }

    // Negative fixture 1: ols4 entry with a path must be rejected
    const negFixtureOls4WithPath = {
      version: '1.0',
      sources: [
        {
          id: 'neg-fixture-1',
          prefix: 'NEG',
          namespace_iri: 'http://example.org/neg/',
          display_name: 'Negative Fixture 1',
          loader: 'ols4',
          enabled: true,
          ols_key: 'neg',
          path: '/no/such/file.obo',
        },
      ],
    };
    const negResultOls4 = validator.validate(negFixtureOls4WithPath, schemaId);
    expect(negResultOls4.valid, 'ols4-with-path fixture must be rejected').toBe(false);

    // Negative fixture 2: local-obo entry without path/root must be rejected
    const negFixtureLocalWithoutPath = {
      version: '1.0',
      sources: [
        {
          id: 'neg-fixture-2',
          prefix: 'NEG',
          namespace_iri: 'http://example.org/neg/',
          display_name: 'Negative Fixture 2',
          loader: 'local-obo',
          enabled: true,
        },
      ],
    };
    const negResultLocal = validator.validate(negFixtureLocalWithoutPath, schemaId);
    expect(negResultLocal.valid, 'local-obo-without-path-root fixture must be rejected').toBe(false);

    // Negative fixture 3: local-obo entry with invalid root value (not a CURIE) must be rejected
    const negFixtureInvalidRoot = {
      version: '1.0',
      sources: [
        {
          id: 'neg-fixture-3',
          prefix: 'NEG',
          namespace_iri: 'http://example.org/neg/',
          display_name: 'Negative Fixture 3',
          loader: 'local-obo',
          enabled: true,
          path: '/some/path.obo',
          root: 'banana',
        },
      ],
    };
    const negResultInvalidRoot = validator.validate(negFixtureInvalidRoot, schemaId);
    expect(negResultInvalidRoot.valid, 'invalid-root-value fixture must be rejected').toBe(false);
  });

  it('(v) at least one enabled source and at least one local source', () => {
    const registry = readRegistry();
    const sources = registry.sources as Array<Record<string, unknown>>;
    const enabled = sources.filter((s) => s.enabled === true);
    const locals = sources.filter((s) => s.loader === 'local-obo');
    expect(enabled.length).toBeGreaterThanOrEqual(1);
    expect(locals.length).toBeGreaterThanOrEqual(1);
  });

  it('(v.bis) at least two enabled local-obo sources with distinct roots', () => {
    const registry = readRegistry();
    const sources = registry.sources as Array<Record<string, unknown>>;
    const enabledLocals = sources.filter((s) => s.loader === 'local-obo' && s.enabled === true);
    expect(enabledLocals.length, 'at least two enabled local-obo sources').toBeGreaterThanOrEqual(2);
    const roots = enabledLocals.map((s) => s.root as string);
    expect(new Set(roots).size, 'distinct root values among enabled locals').toBeGreaterThanOrEqual(2);
  });

  it('(vi) hardcode boundary: prefix CURIE not in non-test TS/TSX files', () => {
    const registry = readRegistry();
    const sources = registry.sources as Array<Record<string, unknown>>;
    const prefixes = sources.map((s) => s.prefix as string);

    const serverTs = collectTsFiles(resolve(__dirname, '..'));
    const appDir = resolve(__dirname, '../../../app/src');
    expect(existsSync(appDir), 'app/src must exist for the hardcode boundary scan').toBe(true);
    const appTs = collectTsFiles(appDir);

    for (const prefix of prefixes) {
      const literal = `${prefix}:`;
      for (const file of [...serverTs, ...appTs]) {
        const content = readFileSync(file, 'utf8');
        expect(
          content.includes(literal),
          `hardcoded "${literal}" in ${file} — only config/ontology-sources.yaml may contain it`,
        ).toBe(false);
      }
    }
  });
});
