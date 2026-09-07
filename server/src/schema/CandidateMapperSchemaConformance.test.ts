import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('Protocol candidate-mapper payload schema conformance', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeEach(async () => {
    const registry = createSchemaRegistry();
    validator = createValidator({ strict: false });
    const schemaRoot = join(process.cwd(), '..', 'schema');
    const paths = [
      'workflow/protocol.schema.yaml',
      'workflow/setting.schema.yaml',
      'workflow/local-protocol.schema.yaml',
      'core/common.schema.yaml',
      'core/datatypes/ref.schema.yaml',
      'core/datatypes/concentration.schema.yaml',
      'core/datatypes/reference-ratio.schema.yaml',
      'core/datatypes/condition.schema.yaml',
    ];
    const contents = new Map<string, string>();
    for (const path of paths) contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);
    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  const schemaId = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

  it('accepts a mapper-produced bare `other` step with provenance + isOptional', () => {
    const result = validator.validate({
      kind: 'protocol',
      recordId: 'PRT-candidate',
      title: 'CellROX assay',
      steps: [
        {
          stepId: 'step-1',
          label: 'Add detection reagent',
          ordinal: 1,
          kind: 'other',
          description: 'Add the probe to each well.',
          isOptional: false,
          provenance: [{ anchorId: 'src-1-1', pageNumber: 5 }],
        },
      ],
      roles: {
        materialRoles: [{ roleId: 'reagent', description: 'Detection reagent' }],
        labwareRoles: [{ roleId: 'plate', description: '96-well plate' }],
        instrumentRoles: [],
      },
    }, schemaId);

    expect(result.valid).toBe(true);
  });

  it('accepts humanStepsText + empty roles with a bare step', () => {
    const result = validator.validate({
      kind: 'protocol',
      recordId: 'PRT-candidate',
      title: 'Untitled',
      steps: [{ stepId: 'step-1', label: 'Step 1', ordinal: 1, kind: 'other', description: 'Do the thing.' }],
      roles: { materialRoles: [], labwareRoles: [], instrumentRoles: [] },
      humanStepsText: '1. Seed cells.\n2. Read.',
    }, schemaId);
    expect(result.valid).toBe(true);
  });
});