/**
 * Tests for SchemaRegistry module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SchemaRegistry, createSchemaRegistry } from './SchemaRegistry.js';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import type { SchemaEntry } from './types.js';

// Helper to create a mock schema entry
function mockEntry(
  id: string, 
  path: string, 
  dependencies: string[] = []
): SchemaEntry {
  return {
    id,
    path,
    schema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: id,
      type: 'object',
    },
    dependencies,
  };
}

describe('SchemaRegistry', () => {
  let registry: SchemaRegistry;
  
  beforeEach(() => {
    registry = createSchemaRegistry();
  });
  
  describe('basic operations', () => {
    it('starts empty', () => {
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
    
    it('adds a schema', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      expect(registry.size).toBe(1);
      expect(registry.has('https://example.com/schema/test.yaml')).toBe(true);
    });
    
    it('retrieves schema by id', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const retrieved = registry.getById('https://example.com/schema/test.yaml');
      expect(retrieved).toBe(entry);
    });
    
    it('retrieves schema by path', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const retrieved = registry.getByPath('test.yaml');
      expect(retrieved).toBe(entry);
    });
    
    it('returns undefined for unknown id', () => {
      expect(registry.getById('unknown')).toBeUndefined();
    });
    
    it('returns undefined for unknown path', () => {
      expect(registry.getByPath('unknown.yaml')).toBeUndefined();
    });
    
    it('removes a schema', () => {
      const entry = mockEntry('https://example.com/schema/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const removed = registry.removeSchema('https://example.com/schema/test.yaml');
      
      expect(removed).toBe(true);
      expect(registry.size).toBe(0);
      expect(registry.has('https://example.com/schema/test.yaml')).toBe(false);
    });
    
    it('returns false when removing unknown schema', () => {
      const removed = registry.removeSchema('unknown');
      expect(removed).toBe(false);
    });
    
    it('clears all schemas', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      registry.clear();
      
      expect(registry.size).toBe(0);
    });
    
    it('lists all ids', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      const ids = registry.getAllIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain('https://example.com/a.yaml');
      expect(ids).toContain('https://example.com/b.yaml');
    });
  });
  
  describe('dependency tracking', () => {
    it('tracks schema dependencies', () => {
      const common = mockEntry(
        'https://example.com/common.yaml', 
        'common.yaml'
      );
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['./common.yaml#/$defs/FAIRCommon']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const deps = registry.getDependencies('https://example.com/study.yaml');
      expect(deps).toContain('https://example.com/common.yaml');
    });
    
    it('tracks reverse dependencies', () => {
      const common = mockEntry(
        'https://example.com/common.yaml', 
        'common.yaml'
      );
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/common.yaml#/$defs/FAIRCommon']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const dependents = registry.getDependents('https://example.com/common.yaml');
      expect(dependents).toContain('https://example.com/study.yaml');
    });
    
    it('ignores local fragment refs in dependency tracking', () => {
      const entry = mockEntry(
        'https://example.com/test.yaml',
        'test.yaml',
        ['#/$defs/LocalDef']
      );
      
      registry.addSchema(entry);
      
      const deps = registry.getDependencies('https://example.com/test.yaml');
      expect(deps).toHaveLength(0);
    });
    
    it('does not add self as dependency', () => {
      const entry = mockEntry(
        'https://example.com/test.yaml',
        'test.yaml',
        ['https://example.com/test.yaml#/$defs/SomeDef']
      );
      
      registry.addSchema(entry);
      
      const deps = registry.getDependencies('https://example.com/test.yaml');
      expect(deps).not.toContain('https://example.com/test.yaml');
    });
  });
  
  describe('reference resolution', () => {
    it('reports all references resolved when complete', () => {
      const common = mockEntry('https://example.com/common.yaml', 'common.yaml');
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/common.yaml']
      );
      
      registry.addSchema(common);
      registry.addSchema(study);
      
      const result = registry.checkResolution();
      expect(result.resolved).toBe(true);
      expect(result.unresolved).toHaveLength(0);
    });
    
    it('reports unresolved references', () => {
      const study = mockEntry(
        'https://example.com/study.yaml', 
        'study.yaml',
        ['https://example.com/missing.yaml']
      );
      
      registry.addSchema(study);
      
      const result = registry.checkResolution();
      expect(result.resolved).toBe(false);
      expect(result.unresolved).toContain(
        'https://example.com/study.yaml -> https://example.com/missing.yaml'
      );
    });

    it('registers the concentration and composition datatypes', async () => {
      const schemaRoot = join(process.cwd(), 'schema');
      const paths = [
        'core/datatypes/ref.schema.yaml',
        'core/datatypes/amount.schema.yaml',
        'core/datatypes/concentration.schema.yaml',
        'core/datatypes/composition-entry.schema.yaml',
        'core/common.schema.yaml',
        'lab/material.schema.yaml',
      ];

      const contents = new Map<string, string>();
      for (const path of paths) {
        contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
      }

      const result = loadSchemasFromContent(contents);
      expect(result.errors).toEqual([]);

      registry.addSchemas(result.entries);

      expect(registry.has('https://computable-lab.com/schema/computable-lab/datatypes/concentration.schema.yaml')).toBe(true);
      expect(registry.has('https://computable-lab.com/schema/computable-lab/datatypes/composition-entry.schema.yaml')).toBe(true);
      expect(
        registry.getDependencies('https://computable-lab.com/schema/computable-lab/datatypes/composition-entry.schema.yaml')
      ).toEqual([
        'https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml',
        'https://computable-lab.com/schema/computable-lab/datatypes/concentration.schema.yaml',
      ]);
    });

    it('registers the ingestion schemas and supporting datatypes', async () => {
      const schemaRoot = join(process.cwd(), 'schema');
      const paths = [
        'core/datatypes/ref.schema.yaml',
        'core/datatypes/file-ref.schema.yaml',
        'core/datatypes/ingestion-source-ref.schema.yaml',
        'core/datatypes/ontology-match-candidate.schema.yaml',
        'core/datatypes/publish-result.schema.yaml',
        'core/datatypes/ingestion-metrics.schema.yaml',
        'core/common.schema.yaml',
        'ingestion/ingestion-job.schema.yaml',
        'ingestion/ingestion-artifact.schema.yaml',
        'ingestion/ingestion-candidate-bundle.schema.yaml',
        'ingestion/ingestion-candidate.schema.yaml',
        'ingestion/ingestion-issue.schema.yaml',
      ];

      const contents = new Map<string, string>();
      for (const path of paths) {
        contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
      }

      const result = loadSchemasFromContent(contents);
      expect(result.errors).toEqual([]);

      registry.addSchemas(result.entries);

      expect(registry.has('https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml')).toBe(true);
      expect(registry.has('https://computable-lab.com/schema/computable-lab/ingestion-artifact.schema.yaml')).toBe(true);
      expect(registry.has('https://computable-lab.com/schema/computable-lab/ingestion-candidate-bundle.schema.yaml')).toBe(true);
      expect(registry.has('https://computable-lab.com/schema/computable-lab/ingestion-candidate.schema.yaml')).toBe(true);
      expect(registry.has('https://computable-lab.com/schema/computable-lab/ingestion-issue.schema.yaml')).toBe(true);
      expect(
        registry.getDependencies('https://computable-lab.com/schema/computable-lab/ingestion-candidate.schema.yaml')
      ).toEqual(
        expect.arrayContaining([
          'https://computable-lab.com/schema/computable-lab/common.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/datatypes/ref.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/datatypes/ingestion-source-ref.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/datatypes/ontology-match-candidate.schema.yaml',
          'https://computable-lab.com/schema/computable-lab/datatypes/publish-result.schema.yaml',
        ])
      );
    });
  });

  describe('validation', () => {
    it('validates concentration and optional material molecular weight', async () => {
      const schemaRoot = join(process.cwd(), 'schema');
      const paths = [
        'core/datatypes/amount.schema.yaml',
        'core/datatypes/ref.schema.yaml',
        'core/datatypes/concentration.schema.yaml',
        'core/datatypes/composition-entry.schema.yaml',
        'core/datatypes/file-ref.schema.yaml',
        'core/common.schema.yaml',
        'lab/datatypes/chemical-properties.schema.yaml',
        'lab/material.schema.yaml',
        'lab/recipe.schema.yaml',
        'lab/vendor-product.schema.yaml',
        'workflow/events/plate-event.add-material.schema.yaml',
      ];

      const contents = new Map<string, string>();
      for (const path of paths) {
        contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
      }

      const result = loadSchemasFromContent(contents);
      expect(result.errors).toEqual([]);

      const validator = createValidator({ strict: false });
      validator.addSchemas(result.entries.map((entry) => entry.schema));

      expect(
        validator.validate(
          { value: 1, unit: 'mM', basis: 'molar' },
          'https://computable-lab.com/schema/computable-lab/datatypes/concentration.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'material',
            id: 'MAT-CLOFIBRATE',
            name: 'Clofibrate',
            domain: 'chemical',
            molecular_weight: { value: 242.7, unit: 'g/mol' },
            chemical_properties: {
              molecular_formula: 'C12H15ClO3',
              cas_number: '637-07-0',
              solubility: 'Soluble in ethanol and DMSO',
            },
          },
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'material',
            id: 'MAT-CLOFIBRATE',
            name: 'Clofibrate',
            domain: 'chemical',
            molecular_weight: { value: 242.7, unit: 'mg' },
          },
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
        ).valid
      ).toBe(false);

      expect(
        validator.validate(
          {
            kind: 'material',
            id: 'MAT-CLOFIBRATE',
            name: 'Clofibrate',
            domain: 'chemical',
            chemical_properties: {
              molecular_formula: 123,
            },
          },
          'https://computable-lab.com/schema/computable-lab/material.schema.yaml'
        ).valid
      ).toBe(false);

      expect(
        validator.validate(
          {
            kind: 'vendor-product',
            id: 'VPR-SIGMA-D8418',
            name: 'Clofibrate sodium salt solution',
            vendor: 'Sigma-Aldrich',
            catalog_number: 'D8418',
            material_ref: {
              kind: 'record',
              id: 'MAT-CLOFIBRATE',
              type: 'material',
              label: 'Clofibrate',
            },
            declared_composition: [
              {
                component_ref: {
                  kind: 'record',
                  id: 'MAT-CLOFIBRATE',
                  type: 'material',
                  label: 'Clofibrate',
                },
                role: 'solute',
                concentration: { value: 100, unit: 'mM', basis: 'molar' },
                source: 'vendor declaration',
              },
            ],
            composition_provenance: {
              source_type: 'vendor_search',
              vendor: 'Sigma-Aldrich',
              source_url: 'https://example.com/product',
              source_text: 'Clofibrate sodium salt solution, 100 mM',
              captured_at: '2026-03-21T12:00:00.000Z',
            },
            documents: [
              {
                id: 'VDOC-TEST-1',
                title: 'Vendor product sheet',
                document_kind: 'formulation_sheet',
                file_ref: {
                  file_name: 'product-sheet.pdf',
                  media_type: 'application/pdf',
                  source_url: 'https://example.com/product-sheet.pdf',
                  size_bytes: 1024,
                  sha256: 'abc123',
                  page_count: 2,
                },
                provenance: {
                  source_type: 'upload',
                  added_at: '2026-03-21T12:00:00.000Z',
                  note: 'Uploaded from vendor page',
                },
                extraction: {
                  method: 'pdf_text',
                  extracted_at: '2026-03-21T12:01:00.000Z',
                  page_count: 2,
                  ocr_attempted: false,
                  ocr_available: false,
                  text_excerpt: 'RPMI 1640 contains glucose 2 g/L',
                },
              },
            ],
            composition_drafts: [
              {
                id: 'VDRAFT-TEST-1',
                source_document_id: 'VDOC-TEST-1',
                extraction_method: 'pdf_text',
                status: 'draft',
                overall_confidence: 0.83,
                created_at: '2026-03-21T12:01:00.000Z',
                extracted_text_excerpt: 'RPMI 1640 contains glucose 2 g/L',
                items: [
                  {
                    component_name: 'Glucose',
                    role: 'solute',
                    concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
                    confidence: 0.83,
                    source_page: 1,
                    source_text: 'Glucose 2 g/L',
                  },
                ],
              },
            ],
          },
          'https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'recipe',
            id: 'RCP-RPMI-1640',
            name: 'Prepare RPMI 1640',
            input_roles: [
              {
                role_id: 'base_media',
                role_type: 'buffer_component',
                material_ref: {
                  kind: 'record',
                  id: 'MAT-RPMI-BASE',
                  type: 'material',
                  label: 'RPMI base',
                },
              },
            ],
            output_material_spec_ref: {
              kind: 'record',
              id: 'MSP-RPMI-1640',
              type: 'material-spec',
              label: 'RPMI 1640',
            },
            output: {
              composition: [
                {
                  component_ref: {
                    kind: 'record',
                    id: 'MAT-GLUCOSE',
                    type: 'material',
                    label: 'Glucose',
                  },
                  role: 'solute',
                  concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
                },
                {
                  component_ref: {
                    kind: 'record',
                    id: 'MAT-SODIUM-BICARB',
                    type: 'material',
                    label: 'Sodium bicarbonate',
                  },
                  role: 'buffer_component',
                },
              ],
            },
            steps: [
              {
                order: 1,
                instruction: 'Combine components and sterile filter.',
              },
            ],
          },
          'https://computable-lab.com/schema/computable-lab/recipe.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            wells: ['A1'],
            material_spec_ref: {
              kind: 'record',
              id: 'MSP-RPMI-1640',
              type: 'material-spec',
              label: 'RPMI 1640',
            },
            volume: { value: 100, unit: 'uL' },
            composition_snapshot: [
              {
                component_ref: {
                  kind: 'record',
                  id: 'MAT-GLUCOSE',
                  type: 'material',
                  label: 'Glucose',
                },
                role: 'solute',
                concentration: { value: 2, unit: 'g/L', basis: 'mass_per_volume' },
              },
            ],
          },
          'https://computable-lab.com/schema/computable-lab/workflow/events/plate-event.add-material.schema.yaml'
        ).valid
      ).toBe(true);
    });

    it('validates ingestion jobs, artifacts, bundles, candidates, and issues', async () => {
      const schemaRoot = join(process.cwd(), 'schema');
      const paths = [
        'core/datatypes/ref.schema.yaml',
        'core/datatypes/file-ref.schema.yaml',
        'core/datatypes/ingestion-source-ref.schema.yaml',
        'core/datatypes/ontology-match-candidate.schema.yaml',
        'core/datatypes/publish-result.schema.yaml',
        'core/datatypes/ingestion-metrics.schema.yaml',
        'core/common.schema.yaml',
        'ingestion/ingestion-job.schema.yaml',
        'ingestion/ingestion-artifact.schema.yaml',
        'ingestion/ingestion-candidate-bundle.schema.yaml',
        'ingestion/ingestion-candidate.schema.yaml',
        'ingestion/ingestion-issue.schema.yaml',
      ];

      const contents = new Map<string, string>();
      for (const path of paths) {
        contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
      }

      const result = loadSchemasFromContent(contents);
      expect(result.errors).toEqual([]);

      const validator = createValidator({ strict: false });
      const validationRegistry = createSchemaRegistry();
      validationRegistry.addSchemas(result.entries);
      for (const id of validationRegistry.getTopologicalOrder()) {
        const entry = validationRegistry.getById(id);
        if (entry) {
          validator.addSchema(entry.schema, entry.id);
        }
      }

      expect(
        validator.validate(
          {
            kind: 'ingestion-job',
            id: 'ING-VENDOR-TEST',
            name: 'Cayman library upload',
            status: 'queued',
            stage: 'collect',
            source_kind: 'vendor_plate_map_pdf',
            submitted_at: '2026-03-22T12:00:00.000Z',
            source_refs: [
              {
                artifact_ref: {
                  kind: 'record',
                  id: 'IAR-TEST-1',
                  type: 'ingestion-artifact',
                  label: 'cayman-lipid-library.pdf',
                },
                page: 1,
                locator_text: 'Plate 1 table',
              },
            ],
            artifact_refs: [
              {
                kind: 'record',
                id: 'IAR-TEST-1',
                type: 'ingestion-artifact',
              },
            ],
            progress: {
              phase: 'match',
              current: 10,
              total: 234,
              unit: 'compounds',
              percent: 4.27,
              message: 'Matched 10 of 234 compounds',
              updated_at: '2026-03-23T12:05:00.000Z',
            },
            metrics: {
              plates_detected: 13,
              issues_open: 0,
              issues_blocking: 0,
            },
          },
          'https://computable-lab.com/schema/computable-lab/ingestion-job.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'ingestion-artifact',
            id: 'IAR-TEST-1',
            job_ref: {
              kind: 'record',
              id: 'ING-VENDOR-TEST',
              type: 'ingestion-job',
              label: 'Cayman library upload',
            },
            artifact_role: 'primary_source',
            source_url: 'https://example.com/cayman.pdf',
            file_ref: {
              file_name: 'cayman-lipid-library.pdf',
              media_type: 'application/pdf',
              size_bytes: 1024,
              source_url: 'https://example.com/cayman.pdf',
            },
            provenance: {
              source_type: 'upload',
              added_at: '2026-03-22T12:00:00.000Z',
            },
          },
          'https://computable-lab.com/schema/computable-lab/ingestion-artifact.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'ingestion-candidate-bundle',
            id: 'IBN-TEST-1',
            job_ref: {
              kind: 'record',
              id: 'ING-VENDOR-TEST',
              type: 'ingestion-job',
            },
            title: 'Cayman lipid library',
            bundle_type: 'screening_library',
            status: 'draft',
            metrics: {
              plates_detected: 13,
              materials_detected: 812,
            },
          },
          'https://computable-lab.com/schema/computable-lab/ingestion-candidate-bundle.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'ingestion-candidate',
            id: 'ICD-TEST-1',
            job_ref: {
              kind: 'record',
              id: 'ING-VENDOR-TEST',
              type: 'ingestion-job',
            },
            bundle_ref: {
              kind: 'record',
              id: 'IBN-TEST-1',
              type: 'ingestion-candidate-bundle',
            },
            candidate_type: 'material',
            title: 'Apigenin',
            status: 'needs_review',
            normalized_name: 'apigenin',
            confidence: 0.91,
            payload: {
              name: 'Apigenin',
            },
            source_refs: [
              {
                artifact_ref: {
                  kind: 'record',
                  id: 'IAR-TEST-1',
                  type: 'ingestion-artifact',
                },
                page: 2,
                row_label: 'A1',
              },
            ],
            match_refs: [
              {
                namespace: 'CHEBI',
                term_id: '1722',
                label: 'apigenin',
                match_type: 'exact',
                score: 0.99,
              },
            ],
          },
          'https://computable-lab.com/schema/computable-lab/ingestion-candidate.schema.yaml'
        ).valid
      ).toBe(true);

      expect(
        validator.validate(
          {
            kind: 'ingestion-issue',
            id: 'ISS-TEST-1',
            job_ref: {
              kind: 'record',
              id: 'ING-VENDOR-TEST',
              type: 'ingestion-job',
            },
            candidate_ref: {
              kind: 'record',
              id: 'ICD-TEST-1',
              type: 'ingestion-candidate',
            },
            severity: 'warning',
            issue_type: 'symbol_normalization_changed',
            title: 'Delta symbol normalized',
            resolution_status: 'open',
          },
          'https://computable-lab.com/schema/computable-lab/ingestion-issue.schema.yaml'
        ).valid
      ).toBe(true);
    });
  });
  
  describe('topological ordering', () => {
    it('returns schemas in dependency order', () => {
      // C depends on B, B depends on A
      const a = mockEntry('https://example.com/a.yaml', 'a.yaml');
      const b = mockEntry(
        'https://example.com/b.yaml', 
        'b.yaml',
        ['https://example.com/a.yaml']
      );
      const c = mockEntry(
        'https://example.com/c.yaml', 
        'c.yaml',
        ['https://example.com/b.yaml']
      );
      
      // Add in reverse order
      registry.addSchema(c);
      registry.addSchema(b);
      registry.addSchema(a);
      
      const order = registry.getTopologicalOrder();
      
      // A should come before B, B should come before C
      const indexA = order.indexOf('https://example.com/a.yaml');
      const indexB = order.indexOf('https://example.com/b.yaml');
      const indexC = order.indexOf('https://example.com/c.yaml');
      
      expect(indexA).toBeLessThan(indexB);
      expect(indexB).toBeLessThan(indexC);
    });
    
    it('throws on circular dependencies', () => {
      // A depends on B, B depends on A
      const a = mockEntry(
        'https://example.com/a.yaml', 
        'a.yaml',
        ['https://example.com/b.yaml']
      );
      const b = mockEntry(
        'https://example.com/b.yaml', 
        'b.yaml',
        ['https://example.com/a.yaml']
      );
      
      registry.addSchema(a);
      registry.addSchema(b);
      
      expect(() => registry.getTopologicalOrder()).toThrow(/[Cc]ircular/);
    });
    
    it('handles schemas with no dependencies', () => {
      registry.addSchema(mockEntry('https://example.com/a.yaml', 'a.yaml'));
      registry.addSchema(mockEntry('https://example.com/b.yaml', 'b.yaml'));
      
      const order = registry.getTopologicalOrder();
      expect(order).toHaveLength(2);
    });
  });
  
  describe('toSchemaMap', () => {
    it('returns schemas as plain object map', () => {
      const entry = mockEntry('https://example.com/test.yaml', 'test.yaml');
      registry.addSchema(entry);
      
      const map = registry.toSchemaMap();
      
      expect(map['https://example.com/test.yaml']).toBe(entry.schema);
    });
  });
  
  describe('addSchemas', () => {
    it('adds multiple schemas at once', () => {
      const entries = [
        mockEntry('https://example.com/a.yaml', 'a.yaml'),
        mockEntry('https://example.com/b.yaml', 'b.yaml'),
      ];
      
      registry.addSchemas(entries);
      
      expect(registry.size).toBe(2);
    });
  });
});
