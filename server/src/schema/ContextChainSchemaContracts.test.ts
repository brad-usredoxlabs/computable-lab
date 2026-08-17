/**
 * Context-chain schema contracts (Plan 2, Phase A).
 * Asserts protocol.inputContexts + planned-run.sourceBindings resolve.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const RUN_ID = 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml';

describe('protocol context-chain contracts', () => {
  let validator!: ReturnType<typeof createValidator>;
  let registry!: ReturnType<typeof createSchemaRegistry>;

  beforeAll(async () => {
    const result = await loadAllSchemas({ basePath: join(process.cwd(), 'schema') });
    expect(result.errors).toEqual([]);
    registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    validator = createValidator({ strict: false });
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }
  });

  it('declares inputContexts + sourceBindings', () => {
    const protocol = registry.getById(PROTOCOL_ID)?.schema as Record<string, unknown>;
    const run = registry.getById(RUN_ID)?.schema as Record<string, unknown>;
    expect((protocol.properties as Record<string, unknown>).inputContexts).toBeDefined();
    expect((run.properties as Record<string, unknown>).sourceBindings).toBeDefined();
    expect((protocol.required as unknown[] | undefined) ?? []).not.toContain('inputContexts');
    expect((run.required as unknown[] | undefined) ?? []).not.toContain('sourceBindings');
  });

  it('a protocol with inputContexts validates', () => {
    const proto = {
      kind: 'protocol',
      recordId: 'PRT-rtpcr',
      title: 'rtPCR',
      protocolLayer: 'universal',
      roles: {
        labwareRoles: [{ roleId: 'sample-plate' }],
        materialRoles: [{ roleId: 'mastermix' }],
      },
      steps: [{
        stepId: 'add-mm', label: 'Add mastermix', ordinal: 1, kind: 'add_material',
        target: { labwareRole: 'sample-plate' }, wells: { kind: 'all' },
        material: { materialRole: 'mastermix' }, volume_uL: 20,
      }],
      inputContexts: [{ role: 'source-rna-plate', sourceKind: 'plate-context', consumesByDefault: true }],
    };
    expect(validator.validate(proto, PROTOCOL_ID).valid).toBe(true);
  });
});