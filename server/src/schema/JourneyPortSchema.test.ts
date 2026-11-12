// @vitest-environment node
/**
 * L2-JOURNEY-PORTS-1 (unit u1vocab): the journey port vocabulary, as data.
 *
 * These are pure-logic pins (no jsdom): the REAL loader/registry/validator
 * pipeline over the real schema/ directory, exactly what the store enforces.
 *
 * Fixtures are BUILT FROM the schema document (required lists, declared
 * property sets, enums) so this file does not coin a second copy of the port
 * vocabulary. The only literals here are the schema $id and the $defs keys
 * used to LOCATE fixtures; no port field, port kind or provenance layer is
 * hardcoded in TypeScript.
 *
 * The material provenance layer enum is pinned to the SHIPPED registry
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

const SCHEMA_DIR = join(
  fileURLToPath(new URL('.', import.meta.url)),
  '../../../schema',
);
const MATERIAL_POLICY_PATH = join(SCHEMA_DIR, 'lab', 'material-profile.registry.yaml');
const portRef = (def: string) => `${SCHEMA_ID}#/$defs/${def}`;

interface PropSchema {
  type?: string;
  enum?: unknown[];
  const?: unknown;
}
interface DefSchema {
  type?: string;
  additionalProperties?: boolean;
  required?: string[];
  properties?: Record<string, PropSchema>;
}
interface DocSchema {
  $defs?: Record<string, DefSchema>;
}
interface ValidationIssue {
  path: string;
  keyword: string;
  params?: Record<string, unknown>;
}

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
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  const doc = (): DocSchema => registry.getById(SCHEMA_ID)!.schema as DocSchema;
  const defOf = (name: string): DefSchema => doc().$defs![name]!;
  const propertiesOf = (name: string): string[] =>
    Object.keys(defOf(name).properties ?? {});
  const requiredOf = (name: string): string[] => defOf(name).required ?? [];

  /** Build the minimal valid payload from the schema's own declarations. */
  function validPayload(name: string): Record<string, unknown> {
    const def = defOf(name);
    const payload: Record<string, unknown> = {};
    for (const key of def.required ?? []) {
      const prop = def.properties?.[key];
      payload[key] = prop?.enum?.[0] ?? prop?.const ?? 'FIXTURE-VALUE';
    }
    return payload;
  }

  function issues(payload: unknown, name: string): ValidationIssue[] {
    const result = validator.validate(payload, portRef(name));
    expect(result.valid, `${name} fixture should be refused`).toBe(false);
    return (result.errors ?? []) as ValidationIssue[];
  }

  function expectDecision(
    payload: unknown,
    name: string,
    keyword: string,
    paramKey: string,
    paramValue: string,
    path?: string,
  ): void {
    const found = issues(payload, name).find(
      (issue) => issue.keyword === keyword && issue.params?.[paramKey] === paramValue,
    );
    expect(
      found,
      `${name}: expected ${keyword}/${paramValue}${path ? ` at ${path}` : ''}`,
    ).toBeDefined();
    if (path !== undefined) {
      expect(found!.path).toBe(path);
    }
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
  });

  it('accepts a minimal valid payload for every port', () => {
    for (const name of PORT_DEFS) {
      const result = validator.validate(validPayload(name), portRef(name));
      expect(result.errors ?? [], `${name} valid fixture`).toEqual([]);
      expect(result.valid).toBe(true);
    }
  });

  it('refuses every payload missing any required field, naming that field', () => {
    for (const name of PORT_DEFS) {
      for (const key of requiredOf(name)) {
        const payload = validPayload(name);
        delete payload[key];
        expectDecision(payload, name, 'required', 'missingProperty', key, '/');
      }
    }
  });

  it('refuses every port payload missing the one field all ports share (its version)', () => {
    const shared = requiredOf(PORT_DEFS[0]).filter((key) =>
      PORT_DEFS.every((name) => requiredOf(name).includes(key)),
    );
    expect(shared.length, 'a single universally required key').toBe(1);
    for (const name of PORT_DEFS) {
      for (const key of shared) {
        const payload = validPayload(name);
        delete payload[key];
        expectDecision(payload, name, 'required', 'missingProperty', key, '/');
      }
    }
  });

  it('refuses a staged draft that carries committed-record properties (closed shape)', () => {
    const staged = 'StagedDraftReference';
    const stagedProps = new Set(propertiesOf(staged));
    const committedOnly = propertiesOf('CommittedRecordReference').filter(
      (key) => !stagedProps.has(key),
    );
    expect(committedOnly.length, 'committed-only properties exist').toBeGreaterThan(0);
    for (const key of committedOnly) {
      const payload = { ...validPayload(staged), [key]: 'FIXTURE-VALUE' };
      expectDecision(payload, staged, 'additionalProperties', 'additionalProperty', key, '/');
    }
  });

  it('refuses a labware DEFINITION carrying any sibling port property (not an instance)', () => {
    const target = 'LabwareDefinitionReference';
    const declared = new Set(propertiesOf(target));
    const foreign = [
      ...new Set(
        PORT_DEFS.filter((name) => name !== target).flatMap((name) => propertiesOf(name)),
      ),
    ].filter((key) => !declared.has(key));
    expect(foreign.length, 'foreign port properties exist').toBeGreaterThan(0);
    for (const key of foreign) {
      const payload = { ...validPayload(target), [key]: 'FIXTURE-VALUE' };
      expectDecision(payload, target, 'additionalProperties', 'additionalProperty', key, '/');
    }
  });

  it('refuses a material provenance layer outside the shipped registry enum', () => {
    const material = 'MaterialReference';
    const enumKeys = Object.entries(defOf(material).properties ?? {})
      .filter(([, prop]) => Array.isArray(prop.enum))
      .map(([key]) => key);
    expect(enumKeys.length, 'exactly one enum-bearing material property').toBe(1);
    const layerKey = enumKeys[0];
    const rejectedLayer = 'NOT-A-SHIPPED-LAYER';
    const payload = { ...validPayload(material), [layerKey]: rejectedLayer };
    const found = issues(payload, material).find(
      (issue) => issue.keyword === 'enum' && issue.path === `/${layerKey}`,
    );
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
    const enumKeys = Object.entries(material.properties ?? {})
      .filter(([, prop]) => Array.isArray(prop.enum))
      .map(([key]) => key);
    expect(enumKeys.length, 'one enum-bearing material property').toBe(1);

    const declaredEnum = (material.properties?.[enumKeys[0]]?.enum ?? [])
      .map(String)
      .sort();
    expect(declaredEnum).toEqual(shippedLayers);
  });
});
