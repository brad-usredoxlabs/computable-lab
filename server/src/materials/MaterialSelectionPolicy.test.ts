// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { normalizeMaterialSelectionPolicies } from './MaterialSelectionPolicy.js';

const SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/material-selection-policy.schema.yaml';

describe('MaterialSelectionPolicy', () => {
  let validator: ReturnType<typeof createValidator>;

  beforeAll(async () => {
    const schemaDir = join(
      fileURLToPath(new URL('.', import.meta.url)),
      '../../../schema',
    );
    const loaded = await loadAllSchemas({
      basePath: schemaDir,
      recursive: true,
    });
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema as never, id);
      }
    }
  });

  function validate(record: Record<string, unknown>) {
    return validator.validate(record, SCHEMA_ID);
  }

  it('discovers the schema and validates a minimal valid record', () => {
    const result = validate({
      kind: 'material-selection-policy',
      recordId: 'MSPOL-EXAMPLE-1',
      title: 'Example selection policy',
      material_ref: {
        kind: 'ontology',
        id: 'CHEBI:EXAMPLE-1',
        namespace: 'CHEBI',
        label: 'Example material concept',
      },
      vendor_product_ref: {
        kind: 'record',
        id: 'VPR-EXAMPLE-1',
        type: 'vendor-product',
      },
      selection: 'only',
      since: '2026-11-09',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects duplicate only claims for the same material concept', () => {
    const policies = [
      {
        kind: 'material-selection-policy',
        recordId: 'MSPOL-DUP-1',
        title: 'First only claim',
        material_ref: {
          kind: 'ontology',
          id: 'CHEBI:SHARED',
          namespace: 'CHEBI',
          label: 'Shared material',
        },
        vendor_product_ref: {
          kind: 'record',
          id: 'VPR-EXAMPLE-1',
          type: 'vendor-product',
        },
        selection: 'only',
        since: '2026-11-01',
      },
      {
        kind: 'material-selection-policy',
        recordId: 'MSPOL-DUP-2',
        title: 'Second only claim',
        material_ref: {
          kind: 'ontology',
          id: 'CHEBI:SHARED',
          namespace: 'CHEBI',
          label: 'Shared material',
        },
        vendor_product_ref: {
          kind: 'record',
          id: 'VPR-EXAMPLE-2',
          type: 'vendor-product',
        },
        selection: 'only',
        since: '2026-11-02',
      },
    ];
    expect(() => normalizeMaterialSelectionPolicies(policies)).toThrow(
      /MSPOL-DUP-1.*MSPOL-DUP-2|MSPOL-DUP-2.*MSPOL-DUP-1/,
    );
  });

  it('allows two default selections for the same concept', () => {
    const policies = [
      {
        kind: 'material-selection-policy',
        recordId: 'MSPOL-DEF-1',
        title: 'First default claim',
        material_ref: {
          kind: 'ontology',
          id: 'CHEBI:SHARED',
          namespace: 'CHEBI',
          label: 'Shared material',
        },
        vendor_product_ref: {
          kind: 'record',
          id: 'VPR-DEF-1',
          type: 'vendor-product',
        },
        selection: 'default',
        since: '2026-11-01',
      },
      {
        kind: 'material-selection-policy',
        recordId: 'MSPOL-DEF-2',
        title: 'Second default claim',
        material_ref: {
          kind: 'ontology',
          id: 'CHEBI:SHARED',
          namespace: 'CHEBI',
          label: 'Shared material',
        },
        vendor_product_ref: {
          kind: 'record',
          id: 'VPR-DEF-2',
          type: 'vendor-product',
        },
        selection: 'default',
        since: '2026-11-02',
      },
    ];
    const index = normalizeMaterialSelectionPolicies(policies);
    expect(index.size).toBe(1);
    expect(index.get('ontology:CHEBI:SHARED').length).toBe(2);
  });

  it('rejects a record with selection only and no vendor_product_ref', () => {
    const result = validate({
      kind: 'material-selection-policy',
      recordId: 'MSPOL-NO-VPR',
      title: 'Missing vendor_product_ref',
      material_ref: {
        kind: 'ontology',
        id: 'CHEBI:EXAMPLE-2',
        namespace: 'CHEBI',
        label: 'Some material',
      },
      selection: 'only',
      since: '2026-11-09',
    });
    expect(result.valid).toBe(false);
  });
});
