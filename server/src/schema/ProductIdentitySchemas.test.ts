/**
 * Product-identity schema contracts (L2-P1B-PRODUCT-IDENTITY-1).
 *
 * Validates, through the REAL Ajv path (SchemaRegistry + loadSchemasFromContent +
 * createValidator, exactly the closure the boot loads), that the two Brad 2026-11-16
 * product-identity schema rulings behave as declared:
 *
 *   - vendor-product: a product realises EXACTLY ONE referent. A labware-backed product
 *     (vendor + catalog_number + labware_definition_ref) VALIDATES; a product with
 *     NEITHER referent FAILS; a material-backed product (material_ref) still validates.
 *   - labware-instance: the new OPTIONAL vendorProductRef VALIDATES, and an instance
 *     without it still validates (existing records keep booting).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const VENDOR_PRODUCT = 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml';
const LABWARE_INSTANCE = 'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml';

describe('ProductIdentitySchemas (product-identity ruling, real Ajv path)', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), 'schema');
    // Dependency closure for vendor-product + labware-instance: the datatype refs each
    // $ref (ref, concentration, composition-entry, file-ref), the FAIRCommon mixin
    // (common), and the two schemas under test.
    const paths = [
      'core/datatypes/ref.schema.yaml',
      'core/datatypes/concentration.schema.yaml',
      'core/datatypes/composition-entry.schema.yaml',
      'core/datatypes/file-ref.schema.yaml',
      'core/common.schema.yaml',
      'lab/vendor-product.schema.yaml',
      'lab/labware-instance.schema.yaml',
    ];

    const contents = new Map<string, string>();
    for (const path of paths) {
      contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
    }

    const result = loadSchemasFromContent(contents);
    expect(result.errors).toEqual([]);

    registry.addSchemas(result.entries);
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) {
        validator.addSchema(entry.schema, entry.id);
      }
    }
  });

  describe('vendor-product (EXACTLY ONE referent)', () => {
    it('accepts a LABWARE-backed product: vendor + catalog_number + labware_definition_ref', () => {
      const valid = {
        kind: 'vendor-product',
        id: 'VPR-THERMO-A58941',
        name: 'Thermo Optical-Quality Imaging Plate',
        vendor: 'Thermo Fisher Scientific',
        catalog_number: 'A58941',
        labware_definition_ref: {
          kind: 'record',
          id: 'LBR-384-BW-CC',
          type: 'labware',
          label: '384-well black-walled clear-bottom plate',
        },
      };
      expect(validator.validate(valid, VENDOR_PRODUCT).valid).toBe(true);
    });

    it('REJECTS a product with NEITHER referent (material_ref AND labware_definition_ref both absent)', () => {
      const invalid = {
        kind: 'vendor-product',
        id: 'VPR-NO-REF',
        name: 'Product with no referent',
        vendor: 'Thermo Fisher Scientific',
        catalog_number: 'A58941',
        // no material_ref, no labware_definition_ref
      };
      expect(validator.validate(invalid, VENDOR_PRODUCT).valid).toBe(false);
    });

    it('still accepts a MATERIAL-backed product (material_ref only)', () => {
      const valid = {
        kind: 'vendor-product',
        id: 'VPR-SIGMA-D8418',
        name: 'Clofibrate',
        vendor: 'Sigma-Aldrich',
        catalog_number: 'D8418',
        material_ref: {
          kind: 'record',
          id: 'MAT-CLOFIBRATE',
          type: 'material',
          label: 'Clofibrate',
        },
      };
      expect(validator.validate(valid, VENDOR_PRODUCT).valid).toBe(true);
    });

    it('REJECTS a product with BOTH referents (exactly-one is violated)', () => {
      const invalid = {
        kind: 'vendor-product',
        id: 'VPR-BOTH-REF',
        name: 'Product with two referents',
        vendor: 'Vendor',
        catalog_number: 'X1',
        material_ref: { kind: 'record', id: 'MAT-1', type: 'material' },
        labware_definition_ref: { kind: 'record', id: 'LBR-1', type: 'labware' },
      };
      expect(validator.validate(invalid, VENDOR_PRODUCT).valid).toBe(false);
    });
  });

  describe('labware-instance (optional vendorProductRef)', () => {
    it('accepts an instance WITH vendorProductRef (purchased identity alongside the design)', () => {
      const valid = {
        kind: 'labware-instance',
        recordId: 'LBI-000041A',
        labwareId: 'LBR-384-BW-CC',
        vendorProductRef: {
          kind: 'record',
          id: 'VPR-THERMO-A58941',
          type: 'vendor-product',
          label: 'Thermo Optical-Quality Imaging Plate (A58941)',
        },
      };
      expect(validator.validate(valid, LABWARE_INSTANCE).valid).toBe(true);
    });

    it('still accepts an instance WITHOUT vendorProductRef (generic placement; existing records keep booting)', () => {
      const valid = {
        kind: 'labware-instance',
        recordId: 'LBI-000042B',
        labwareId: 'LBR-96-Generic',
        label: 'Plate B (RUN-000042)',
      };
      expect(validator.validate(valid, LABWARE_INSTANCE).valid).toBe(true);
    });
  });
});
