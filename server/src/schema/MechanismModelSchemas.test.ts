import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { accessSync, constants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { load } from 'js-yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, '..', '..', '..');
const KNOWLEDGE_DIR = resolve(REPO_ROOT, 'records', 'knowledge');

// Skip if records/knowledge/ directory doesn't exist
function knowledgeDirExists() {
  try { accessSync(KNOWLEDGE_DIR, constants.F_OK); return true; } catch { return false; }
}

const KNOWLEDGE_SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'knowledge/claim.schema.yaml',
  'knowledge/context-role.schema.yaml',
  'knowledge/mechanism-model.schema.yaml',
  'readout-definition.schema.yaml',
] as const;

async function loadKnowledgeSchemas() {
  const schemaRoot = join(REPO_ROOT, 'schema');
  const contents = new Map<string, string>();
  for (const path of KNOWLEDGE_SCHEMA_PATHS) {
    try {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    } catch {
      if (path === 'readout-definition.schema.yaml') {
        contents.set(path, await readFile(join(schemaRoot, 'lab', 'readout-definition.schema.yaml'), 'utf8'));
      } else {
        throw new Error(`Failed to read schema ${path}`);
      }
    }
  }
  return loadSchemasFromContent(contents);
}

async function loadRecord(relPath: string): Promise<Record<string, unknown>> {
  const text = await readFile(join(REPO_ROOT, 'records', relPath), 'utf8');
  const parsed = load(text) as Record<string, unknown>;
  // Strip wrapper fields the same way RecordParser does before validation.
  const { $schema: _schema, recordId: _recordId, ...payload } = parsed as Record<string, unknown> & {
    $schema?: unknown;
    recordId?: unknown;
  };
  return payload;
}

describe.skip(!knowledgeDirExists() ? 'Knowledge-layer mechanism-model schemas and seeds (skipped — missing records/knowledge/)' : 'Knowledge-layer mechanism-model schemas and seeds', () => {
  it('mechanism-model schema loads with its dependencies', async () => {
    const result = await loadKnowledgeSchemas();
    expect(result.errors).toEqual([]);
    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    expect(
      registry.has('https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml'),
    ).toBe(true);
    expect(
      registry.getDependencies('https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml'),
    ).toContain('https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml');
  });

  it('validates MECH-PPARA-ROS-001 against the mechanism-model schema', async () => {
    const result = await loadKnowledgeSchemas();
    expect(result.errors).toEqual([]);
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const record = await loadRecord('knowledge/MECH-PPARA-ROS-001__ppara-ros-via-nadh-rs.yaml');
    const outcome = validator.validate(
      record,
      'https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml',
    );
    expect(outcome.errors ?? []).toEqual([]);
    expect(outcome.valid).toBe(true);
  });

  it('validates context-role records with prerequisites (CR-ros-positive-control)', async () => {
    const result = await loadKnowledgeSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const record = await loadRecord('knowledge/CR-ros-positive-control__ros-positive-control.yaml');
    const outcome = validator.validate(
      record,
      'https://computable-lab.com/schema/computable-lab/context-role.schema.yaml',
    );
    expect(outcome.errors ?? []).toEqual([]);
    expect(outcome.valid).toBe(true);
  });

  it('validates context-role records without prerequisites (CR-vehicle-baseline)', async () => {
    const result = await loadKnowledgeSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const record = await loadRecord('knowledge/CR-vehicle-baseline__vehicle-baseline.yaml');
    const outcome = validator.validate(
      record,
      'https://computable-lab.com/schema/computable-lab/context-role.schema.yaml',
    );
    expect(outcome.errors ?? []).toEqual([]);
    expect(outcome.valid).toBe(true);
  });

  it('validates every seeded atomic claim (CLM-*)', async () => {
    const result = await loadKnowledgeSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const seedFiles = [
      'CLM-ppar-causes-bo__ppar-causes-beta-oxidation.yaml',
      'CLM-bo-causes-nadh-rs__beta-oxidation-causes-nadh-reductive-stress.yaml',
      'CLM-nadh-rs-causes-ros__nadh-reductive-stress-causes-ros.yaml',
      'CLM-bhb-causes-nadh-rs__bhb-causes-nadh-reductive-stress.yaml',
      'CLM-acac-causes-nadh-os__acac-causes-nadh-oxidative-stress.yaml',
      'CLM-rot-positive-for-ros__rotenone-is-ros-positive-control.yaml',
      'CLM-fccp-negative-for-ros__fccp-is-ros-negative-control.yaml',
    ];

    for (const file of seedFiles) {
      const record = await loadRecord(`knowledge/${file}`);
      const outcome = validator.validate(
        record,
        'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
      );
      expect(outcome.errors ?? [], `${file} should validate`).toEqual([]);
      expect(outcome.valid, `${file} should be valid`).toBe(true);
    }
  });

  it('rejects a mechanism-model with an intervention that has both blocks_edge and modulates_node', async () => {
    const result = await loadKnowledgeSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) validator.addSchema(entry.schema, entry.id);

    const invalid = {
      kind: 'mechanism-model',
      id: 'MECH-INVALID-001',
      title: 'Invalid mechanism',
      nodes: [
        { id: 'a', kind: 'perturbation' },
        { id: 'b', kind: 'feature' },
      ],
      edges: [
        {
          id: 'E-a-to-b',
          claim_ref: { kind: 'record', id: 'CLM-x', type: 'claim' },
          subject: 'a',
          object: 'b',
        },
      ],
      interventions: [
        {
          material_ref: { kind: 'ontology', id: 'CHEBI:0', namespace: 'CHEBI', label: 'fake' },
          blocks_edge: 'E-a-to-b',
          modulates_node: 'a',
          expected_effect: { direction: 'decreased' },
        },
      ],
    };

    const outcome = validator.validate(
      invalid,
      'https://computable-lab.com/schema/computable-lab/mechanism-model.schema.yaml',
    );
    expect(outcome.valid).toBe(false);
  });
});
