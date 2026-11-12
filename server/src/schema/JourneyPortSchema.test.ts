// @vitest-environment node
/**
 * L2-JOURNEY-PORTS-1 (unit u1vocab): the journey port vocabulary, as data.
 *
 * Pure-logic pins (no jsdom): the REAL loader/registry/validator pipeline over
 * the real schema/ directory, exactly what the store enforces.
 *
 * Fixtures are BUILT FROM the schema document (required lists, declared property
 * sets, enums), so this file holds no second copy of the port vocabulary. The
 * only literals here are the schema $id and the $defs keys used to LOCATE
 * fixtures; no port field, port kind or provenance layer is hardcoded in TS.
 *
 * The material provenance enum is pinned to the SHIPPED registry
 * (schema/lab/material-profile.registry.yaml, clarification.layers) so the
 * campaign cannot grow a second authority for the layer vocabulary.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/journey-port.schema.yaml';

const PORT_DEFS = [
  'SequenceSetReference',
  'AlignmentReference',
  'MaterialReference',
  'LabwareDefinitionReference',
  'CommittedRecordReference',
  'StagedDraftReference',
] as const;

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema');
const MATERIAL_POLICY_PATH = join(SCHEMA_DIR, 'lab', 'material-profile.registry.yaml');
const portRef = (def: string) => `${SCHEMA_ID}#/$defs/${def}`;

interface PropSchema { enum?: unknown[]; const?: unknown }
interface DefSchema {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, PropSchema>;
}
interface DocSchema {
  additionalProperties?: boolean;
  properties?: Record<string, PropSchema>;
  $defs?: Record<string, DefSchema>;
}
interface ValidationIssue { path: string; keyword: string; params?: Record<string, unknown> }

describe('journey port vocabulary schema', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const loaded = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, id);
    }
  });

  const doc = (): DocSchema => registry.getById(SCHEMA_ID)!.schema as DocSchema;
  const defOf = (name: string): DefSchema => doc().$defs![name]!;
  const propertiesOf = (name: string): string[] => Object.keys(defOf(name).properties ?? {});
  const requiredOf = (name: string): string[] => defOf(name).required ?? [];
  const valueFor = (prop?: PropSchema): unknown =>
    prop?.enum?.[0] ?? prop?.const ?? 'FIXTURE-VALUE';

  /** The single enum-bearing property of a port (its controlled vocabulary). */
  function enumKeyOf(name: string): string {
    const keys = Object.entries(defOf(name).properties ?? {})
      .filter(([, prop]) => Array.isArray(prop.enum))
      .map(([key]) => key);
    expect(keys.length, `${name}: exactly one enum-bearing property`).toBe(1);
    return keys[0]!;
  }

  function payload(name: string, all: boolean): Record<string, unknown> {
    const def = defOf(name);
    const keys = all ? Object.keys(def.properties ?? {}) : (def.required ?? []);
    const out: Record<string, unknown> = {};
    for (const key of keys) out[key] = valueFor(def.properties?.[key]);
    return out;
  }
  const validPayload = (name: string) => payload(name, false);
  /** Every declared property populated, so a deletion test removes exactly one. */
  const fullPayload = (name: string) => payload(name, true);

  function issues(input: unknown, name: string): ValidationIssue[] {
    const result = validator.validate(input, portRef(name));
    expect(result.valid, `${name} fixture should be refused`).toBe(false);
    return (result.errors ?? []) as ValidationIssue[];
  }

  function expectDecision(
    input: unknown, name: string, keyword: string, paramKey: string, paramValue: string,
  ): void {
    const found = issues(input, name).find(
      (issue) => issue.keyword === keyword && issue.params?.[paramKey] === paramValue,
    );
    expect(found, `${name}: expected ${keyword}/${paramValue}`).toBeDefined();
    expect(found!.path).toBe('/');
  }

  it('is registered under its declared $id with the six reference ports', () => {
    expect(registry.getById(SCHEMA_ID)).toBeDefined();
    expect(Object.keys(doc().$defs ?? {}).sort()).toEqual([...PORT_DEFS].sort());
  });

  it('declares every port as a closed object, so extra properties are refused', () => {
    for (const name of PORT_DEFS) {
      const def = defOf(name);
      expect(def.type, `${name}.type`).toBe('object');
      expect(def.additionalProperties, `${name}.additionalProperties`).toBe(false);
      expect(requiredOf(name).length, `${name}.required`).toBeGreaterThan(0);
    }
    // The ROOT container is closed too and carries no payload shape of its own:
    // a caller addresses a port by $ref, never validates a bare root document.
    expect(doc().additionalProperties, 'root.additionalProperties').toBe(false);
    expect(Object.keys(doc().properties ?? {}), 'root payload properties').toHaveLength(0);
  });

  it('accepts a minimal valid payload for every port', () => {
    for (const name of PORT_DEFS) {
      const result = validator.validate(validPayload(name), portRef(name));
      expect(result.errors ?? [], `${name} valid fixture`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('refuses every payload missing any required field (including the shared version)', () => {
    const shared = requiredOf(PORT_DEFS[0]).filter((key) =>
      PORT_DEFS.every((name) => requiredOf(name).includes(key)),
    );
    expect(shared.length, 'a single field every port requires (its version)').toBe(1);
    for (const name of PORT_DEFS) {
      for (const key of requiredOf(name)) {
        const input = fullPayload(name);
        delete input[key];
        expectDecision(input, name, 'required', 'missingProperty', key);
      }
    }
  });

  it('refuses a staged draft carrying committed-record properties (closed shape)', () => {
    const staged = 'StagedDraftReference';
    const committed = 'CommittedRecordReference';
    const stagedProps = new Set(propertiesOf(staged));
    const committedOnly = propertiesOf(committed).filter((key) => !stagedProps.has(key));
    expect(committedOnly.length, 'committed-only properties exist').toBeGreaterThan(0);
    // ...and the reverse derivation, so a field ADDED to staged cannot shrink
    // committedOnly silently: the two families share exactly the version field.
    const sharedProps = propertiesOf(committed).filter((key) => stagedProps.has(key));
    const sharedRequired = requiredOf(committed).filter((key) =>
      requiredOf(staged).includes(key),
    );
    expect(sharedRequired.length, 'the single shared required field (version)').toBe(1);
    expect(sharedProps, 'staged and committed share only that field').toEqual(sharedRequired);
    for (const key of committedOnly) {
      expectDecision(
        { ...validPayload(staged), [key]: 'FIXTURE-VALUE' },
        staged, 'additionalProperties', 'additionalProperty', key,
      );
    }
  });

  it('requires every committed-only property a staged draft must never carry (the receipt)', () => {
    const committed = 'CommittedRecordReference';
    const stagedProps = new Set(propertiesOf('StagedDraftReference'));
    const distinguishing = propertiesOf(committed).filter((key) => !stagedProps.has(key));
    expect(distinguishing.length, 'distinguishing properties exist').toBeGreaterThan(0);
    for (const key of distinguishing) {
      expect(requiredOf(committed), `${committed}.required`).toContain(key);
      const input = fullPayload(committed);
      delete input[key];
      expectDecision(input, committed, 'required', 'missingProperty', key);
    }
  });

  it('refuses a labware DEFINITION carrying any sibling port property (not an instance)', () => {
    const target = 'LabwareDefinitionReference';
    const declared = new Set(propertiesOf(target));
    const foreign = [
      ...new Set(PORT_DEFS.filter((n) => n !== target).flatMap((n) => propertiesOf(n))),
    ].filter((key) => !declared.has(key));
    expect(foreign.length, 'foreign port properties exist').toBeGreaterThan(0);
    for (const key of foreign) {
      expectDecision(
        { ...validPayload(target), [key]: 'FIXTURE-VALUE' },
        target, 'additionalProperties', 'additionalProperty', key,
      );
    }
  });

  it('refuses a material provenance layer outside the shipped registry enum', () => {
    const material = 'MaterialReference';
    const layerKey = enumKeyOf(material);
    const rejectedLayer = 'NOT-A-SHIPPED-LAYER';
    const found = issues({ ...validPayload(material), [layerKey]: rejectedLayer }, material)
      .find((issue) => issue.keyword === 'enum' && issue.path === `/${layerKey}`);
    expect(found, `${material}: expected enum refusal at /${layerKey}`).toBeDefined();
    expect(found!.params?.['allowedValues'] as unknown[]).not.toContain(rejectedLayer);
  });

  it('pins the material provenance enum EXACTLY to the registry clarification.layers keys', async () => {
    const registryDoc = parseYaml(await readFile(MATERIAL_POLICY_PATH, 'utf8')) as {
      clarification?: { layers?: Record<string, unknown> };
    };
    const shippedLayers = Object.keys(registryDoc.clarification?.layers ?? {}).sort();
    expect(shippedLayers.length, 'registry declares provenance layers').toBeGreaterThan(0);

    const material = defOf('MaterialReference');
    const declaredEnum = (material.properties?.[enumKeyOf('MaterialReference')]?.enum ?? [])
      .map(String)
      .sort();
    expect(declaredEnum).toEqual(shippedLayers);
  });
});
