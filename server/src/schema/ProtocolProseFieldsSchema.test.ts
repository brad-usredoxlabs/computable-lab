import { describe, expect, it, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('Protocol prose fields schema', () => {
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

  it('accepts optional overview, purpose, and notes on protocol', () => {
    const result = validator.validate({
      kind: 'protocol',
      recordId: 'PRT-prose',
      title: 'Protocol prose',
      overview: 'Reusable qPCR protocol template.',
      purpose: 'Detect target abundance.',
      notes: 'Keep controls visible.',
      steps: [
        {
          stepId: 'step-001',
          label: 'Review protocol',
          ordinal: 1,
          kind: 'other',
          description: 'Review protocol prose before execution.',
        },
      ],
    }, 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml');

    expect(result.valid).toBe(true);
  });

  it('accepts optional overview and purpose on local-protocol while keeping notes', () => {
    const result = validator.validate({
      kind: 'local-protocol',
      protocolLayer: 'lab',
      recordId: 'LPR-prose',
      title: 'Local prose',
      overview: 'Experiment-specific qPCR realization.',
      purpose: 'LOD execution method.',
      notes: 'Uses manual/open-deck setup.',
      inherits_from: { kind: 'record', id: 'PRT-prose', type: 'protocol' },
      status: 'draft',
    }, 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml');

    expect(result.valid).toBe(true);
  });
});
