/**
 * Tests for procurement schema contracts.
 * 
 * Validates that procurement-manifest, vendor-offer, and budget schemas
 * accept valid records and reject invalid ones. Also verifies that
 * vendor-product remains price-free.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

describe('ProcurementSchemaContracts', () => {
  let validator: ReturnType<typeof createValidator>;
  let registry: ReturnType<typeof createSchemaRegistry>;

  beforeEach(async () => {
    registry = createSchemaRegistry();
    validator = createValidator({ strict: false });

    const schemaRoot = join(process.cwd(), 'schema');
    const paths = [
      'core/datatypes/ref.schema.yaml',
      'core/datatypes/concentration.schema.yaml',
      'core/datatypes/composition-entry.schema.yaml',
      'core/datatypes/file-ref.schema.yaml',
      'core/common.schema.yaml',
      'workflow/procurement-manifest.schema.yaml',
      'lab/vendor-offer.schema.yaml',
      'workflow/budget.schema.yaml',
      'workflow/planned-run.schema.yaml',
      'lab/vendor-product.schema.yaml',
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

  describe('procurement-manifest', () => {
    it('accepts a valid manifest with lines', () => {
      const valid = {
        kind: 'procurement-manifest',
        recordId: 'PMF-000001',
        title: 'HepG2 viability reagents',
        sourceType: 'planned-run',
        sourceRef: {
          kind: 'record',
          id: 'PLR-000001',
          type: 'planned-run',
          label: 'HepG2 viability run',
        },
        state: 'draft',
        lines: [
          {
            lineId: 'line-1',
            materialRef: {
              kind: 'record',
              id: 'MAT-CLOFIBRATE',
              type: 'material',
              label: 'Clofibrate',
            },
            quantity: { value: 5, unit: 'mg' },
            priority: 'high',
          },
        ],
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/procurement-manifest.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a manifest missing required fields', () => {
      const invalid = {
        kind: 'procurement-manifest',
        // missing recordId, title, sourceType, sourceRef, state
        lines: [],
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/procurement-manifest.schema.yaml')
          .valid
      ).toBe(false);
    });

    it('accepts a manifest with vendorSearchScope', () => {
      const valid = {
        kind: 'procurement-manifest',
        recordId: 'PMF-000002',
        title: 'Expanded vendor search',
        sourceType: 'manual',
        sourceRef: {
          kind: 'record',
          id: 'USR-001',
          type: 'person',
          label: 'Lab Manager',
        },
        state: 'draft',
        lines: [],
        vendorSearchScope: {
          vendors: ['fisher-scientific', 'cayman-chemical'],
          searchTerms: ['AhR activator', 'PPAR agonist'],
        },
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/procurement-manifest.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a manifest with invalid vendor in vendorSearchScope', () => {
      const invalid = {
        kind: 'procurement-manifest',
        recordId: 'PMF-000003',
        title: 'Bad vendor',
        sourceType: 'manual',
        sourceRef: {
          kind: 'record',
          id: 'USR-001',
          type: 'person',
          label: 'Lab Manager',
        },
        state: 'draft',
        lines: [],
        vendorSearchScope: {
          vendors: ['unknown-vendor'],
        },
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/procurement-manifest.schema.yaml')
          .valid
      ).toBe(false);
    });
  });

  describe('vendor-offer', () => {
    it('accepts a valid vendor-offer with quote data', () => {
      const valid = {
        kind: 'vendor-offer',
        recordId: 'VOF-000001',
        vendorProductRef: {
          kind: 'record',
          id: 'VPR-CAYMAN-12345',
          type: 'vendor-product',
          label: 'AhR activator',
        },
        vendor: 'Cayman Chemical',
        catalog_number: '12345',
        price: 249.0,
        currency: 'USD',
        package_size: '10 mg',
        url: 'https://cayman.com/product/12345',
        availability: 'in_stock',
        captured_at: '2026-04-25T10:00:00.000Z',
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/vendor-offer.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a vendor-offer missing required fields', () => {
      const invalid = {
        kind: 'vendor-offer',
        // missing recordId, vendorProductRef, vendor, price, currency, captured_at
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/vendor-offer.schema.yaml')
          .valid
      ).toBe(false);
    });

    it('rejects a vendor-offer with negative price', () => {
      const invalid = {
        kind: 'vendor-offer',
        recordId: 'VOF-000002',
        vendorProductRef: {
          kind: 'record',
          id: 'VPR-TEST',
          type: 'vendor-product',
          label: 'Test',
        },
        vendor: 'Test Vendor',
        catalog_number: 'TEST-001',
        price: -10,
        currency: 'USD',
        captured_at: '2026-04-25T10:00:00.000Z',
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/vendor-offer.schema.yaml')
          .valid
      ).toBe(false);
    });

    it('accepts a vendor-offer with manifestLineRef', () => {
      const valid = {
        kind: 'vendor-offer',
        recordId: 'VOF-000003',
        vendorProductRef: {
          kind: 'record',
          id: 'VPR-TEST',
          type: 'vendor-product',
          label: 'Test',
        },
        vendor: 'Fisher Scientific',
        catalog_number: 'F-001',
        price: 50.0,
        currency: 'USD',
        captured_at: '2026-04-25T10:00:00.000Z',
        manifestLineRef: {
          kind: 'record',
          id: 'PMF-000001',
          type: 'procurement-manifest',
          label: 'HepG2 reagents',
        },
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/vendor-offer.schema.yaml')
          .valid
      ).toBe(true);
    });
  });

  describe('budget', () => {
    it('accepts a valid budget with lines and summary', () => {
      const valid = {
        kind: 'budget',
        recordId: 'BUD-000001',
        title: 'HepG2 viability budget',
        sourceType: 'procurement-manifest',
        sourceRef: {
          kind: 'record',
          id: 'PMF-000001',
          type: 'procurement-manifest',
          label: 'HepG2 reagents',
        },
        state: 'draft',
        currency: 'USD',
        lines: [
          {
            lineId: 'line-1',
            vendorOfferRef: {
              kind: 'record',
              id: 'VOF-000001',
              type: 'vendor-offer',
              label: 'Cayman AhR activator',
            },
            quantity: { value: 5, unit: 'mg' },
            unitPrice: 249.0,
            totalPrice: 1245.0,
            approved: true,
          },
        ],
        summary: {
          lineCount: 1,
          approvedLineCount: 1,
          grandTotal: 1245.0,
        },
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a budget missing required fields', () => {
      const invalid = {
        kind: 'budget',
        // missing recordId, title, sourceType, sourceRef, state
        lines: [],
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml')
          .valid
      ).toBe(false);
    });

    it('accepts a budget with unapproved lines', () => {
      const valid = {
        kind: 'budget',
        recordId: 'BUD-000002',
        title: 'Draft budget',
        sourceType: 'manual',
        sourceRef: {
          kind: 'record',
          id: 'USR-001',
          type: 'person',
          label: 'Lab Manager',
        },
        state: 'draft',
        currency: 'USD',
        lines: [
          {
            lineId: 'line-1',
            vendorOfferRef: {
              kind: 'record',
              id: 'VOF-000001',
              type: 'vendor-offer',
              label: 'Test',
            },
            quantity: { value: 1, unit: 'mg' },
            unitPrice: 100.0,
            totalPrice: 100.0,
            approved: false,
          },
        ],
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a budget with negative unitPrice', () => {
      const invalid = {
        kind: 'budget',
        recordId: 'BUD-000003',
        title: 'Bad budget',
        sourceType: 'manual',
        sourceRef: {
          kind: 'record',
          id: 'USR-001',
          type: 'person',
          label: 'Lab Manager',
        },
        state: 'draft',
        currency: 'USD',
        lines: [
          {
            lineId: 'line-1',
            vendorOfferRef: {
              kind: 'record',
              id: 'VOF-000001',
              type: 'vendor-offer',
              label: 'Test',
            },
            quantity: { value: 1, unit: 'mg' },
            unitPrice: -50,
            totalPrice: -50,
          },
        ],
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml')
          .valid
      ).toBe(false);
    });
  });

  describe('planned-run procurement anchor', () => {
    it('accepts a planned-run with narrow procurement anchor', () => {
      const valid = {
        kind: 'planned-run',
        recordId: 'PLR-000001',
        title: 'Test run',
        sourceType: 'protocol',
        sourceRef: {
          kind: 'record',
          id: 'PROT-001',
          type: 'protocol',
          label: 'Test protocol',
        },
        state: 'draft',
        procurement: {
          manifestRef: {
            kind: 'record',
            id: 'PMF-000001',
            type: 'procurement-manifest',
            label: 'Reagents',
          },
          budgetRef: {
            kind: 'record',
            id: 'BUD-000001',
            type: 'budget',
            label: 'Budget',
          },
          quoteStatus: 'collecting',
          lastQuotedAt: '2026-04-25T10:00:00.000Z',
        },
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('accepts a planned-run without procurement anchor (optional)', () => {
      const valid = {
        kind: 'planned-run',
        recordId: 'PLR-000002',
        title: 'Run without procurement',
        sourceType: 'protocol',
        sourceRef: {
          kind: 'record',
          id: 'PROT-001',
          type: 'protocol',
          label: 'Test protocol',
        },
        state: 'draft',
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml')
          .valid
      ).toBe(true);
    });

    it('rejects a planned-run with invalid quoteStatus', () => {
      const invalid = {
        kind: 'planned-run',
        recordId: 'PLR-000003',
        title: 'Bad status',
        sourceType: 'protocol',
        sourceRef: {
          kind: 'record',
          id: 'PROT-001',
          type: 'protocol',
          label: 'Test protocol',
        },
        state: 'draft',
        procurement: {
          quoteStatus: 'invalid_status',
        },
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml')
          .valid
      ).toBe(false);
    });
  });

  describe('vendor-product stays price-free', () => {
    it('rejects a vendor-product with price field (unevaluatedProperties: false)', () => {
      const invalid = {
        kind: 'vendor-product',
        id: 'VPR-TEST-001',
        name: 'Test compound',
        vendor: 'Test Vendor',
        catalog_number: 'TEST-001',
        material_ref: {
          kind: 'record',
          id: 'MAT-TEST',
          type: 'material',
          label: 'Test material',
        },
        price: 100, // This should be rejected — vendor-product is price-free
      };

      expect(
        validator.validate(invalid, 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml')
          .valid
      ).toBe(false);
    });

    it('accepts a valid vendor-product without price', () => {
      const valid = {
        kind: 'vendor-product',
        id: 'VPR-TEST-002',
        name: 'Test compound',
        vendor: 'Test Vendor',
        catalog_number: 'TEST-002',
        material_ref: {
          kind: 'record',
          id: 'MAT-TEST',
          type: 'material',
          label: 'Test material',
        },
        grade: '98%',
        package_size: '100 mg',
      };

      expect(
        validator.validate(valid, 'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml')
          .valid
      ).toBe(true);
    });
  });
});
