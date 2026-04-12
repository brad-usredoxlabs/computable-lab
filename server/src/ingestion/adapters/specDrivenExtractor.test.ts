import { describe, it, expect } from 'vitest';
import { runExtractionSpec } from './specDrivenExtractor.js';

describe('specDrivenExtractor', () => {
  describe('runExtractionSpec', () => {
    it('should extract CSV data with field mappings', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-001',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'Material Name', transform: 'trim' },
              { targetField: 'cas_number', source: 'CAS' },
              { targetField: 'symbol', source: 'Symbol', transform: 'uppercase' },
            ],
            defaults: {
              status: 'active',
            },
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `Material Name,CAS,Symbol
Test Chemical,123-45-6,TC
Another Compound,789-01-2,AC`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results).toHaveLength(1);
      expect(result.results[0]!.targetSchema).toBe('lab/material');
      expect(result.results[0]!.recordKind).toBe('material');
      expect(result.results[0]!.idPrefix).toBe('MAT-');
      expect(result.results[0]!.rows).toHaveLength(2);
      
      // Check first row
      expect(result.results[0]!.rows[0]!.fields.name).toBe('Test Chemical');
      expect(result.results[0]!.rows[0]!.fields.cas_number).toBe('123-45-6');
      expect(result.results[0]!.rows[0]!.fields.symbol).toBe('TC');
      expect(result.results[0]!.rows[0]!.fields.status).toBe('active');

      // Check second row
      expect(result.results[0]!.rows[1]!.fields.name).toBe('Another Compound');
      expect(result.results[0]!.rows[1]!.fields.symbol).toBe('AC');
    });

    it('should apply transforms correctly', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-002',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name', transform: 'trim' },
              { targetField: 'lower_name', source: 'name', transform: 'lowercase' },
              { targetField: 'upper_name', source: 'name', transform: 'uppercase' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name
  Test Value  `;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      // The trim transform should be applied to the name field
      expect(result.results[0]!.rows[0]!.fields.name).toBe('Test Value');
      // lowercase should also trim first, then lowercase
      expect(result.results[0]!.rows[0]!.fields.lower_name).toBe('test value');
      // uppercase should also trim first, then uppercase
      expect(result.results[0]!.rows[0]!.fields.upper_name).toBe('TEST VALUE');
    });

    it('should apply normalize_chemical transform', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-003',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'normalized_name', source: 'name', transform: 'normalize_chemical' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name
Δ-9-Tetrahydrocannabinol`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      // The normalizeChemicalName function should convert Δ to Δ (already normalized)
      expect(result.results[0]!.rows[0]!.fields.normalized_name).toBe('Δ-9-Tetrahydrocannabinol');
    });

    it('should apply parse_concentration transform', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-004',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'concentration', source: 'conc', transform: 'parse_concentration' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `conc
1 mM
10 µM
100 nM`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results[0]!.rows[0]!.fields.concentration).toEqual({ value: 1, unit: 'mM' });
      expect(result.results[0]!.rows[1]!.fields.concentration).toEqual({ value: 10, unit: 'µM' });
      expect(result.results[0]!.rows[2]!.fields.concentration).toEqual({ value: 100, unit: 'nM' });
    });

    it('should apply parse_volume transform', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-005',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'volume', source: 'vol', transform: 'parse_volume' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `vol
10 µL
500 mL
1 L`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results[0]!.rows[0]!.fields.volume).toEqual({ value: 10, unit: 'µL' });
      expect(result.results[0]!.rows[1]!.fields.volume).toEqual({ value: 500, unit: 'mL' });
      expect(result.results[0]!.rows[2]!.fields.volume).toEqual({ value: 1, unit: 'L' });
    });

    it('should apply parse_duration transform', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-006',
        targets: [
          {
            targetSchema: 'workflow/protocol',
            recordKind: 'protocol',
            idPrefix: 'PRT-',
            fieldMappings: [
              { targetField: 'duration', source: 'time', transform: 'parse_duration' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `time
30 min
2 h
overnight`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results[0]!.rows[0]!.fields.duration).toEqual({ value: 30, unit: 'min' });
      expect(result.results[0]!.rows[1]!.fields.duration).toEqual({ value: 2, unit: 'h' });
      expect(result.results[0]!.rows[2]!.fields.duration).toEqual({ value: 12, unit: 'h' });
    });

    it('should handle multiple targets from the same source', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-007',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name' },
              { targetField: 'cas', source: 'cas' },
            ],
          },
          {
            targetSchema: 'workflow/protocol',
            recordKind: 'protocol',
            idPrefix: 'PRT-',
            fieldMappings: [
              { targetField: 'step_name', source: 'name' },
            ],
            defaults: {
              step_type: 'add',
            },
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name,cas
Chemical A,111-11-1
Chemical B,222-22-2`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results).toHaveLength(2);
      
      // First target: materials
      expect(result.results[0]!.targetSchema).toBe('lab/material');
      expect(result.results[0]!.rows).toHaveLength(2);
      expect(result.results[0]!.rows[0]!.fields.name).toBe('Chemical A');
      expect(result.results[0]!.rows[0]!.fields.cas).toBe('111-11-1');

      // Second target: protocols
      expect(result.results[1]!.targetSchema).toBe('workflow/protocol');
      expect(result.results[1]!.rows).toHaveLength(2);
      expect(result.results[1]!.rows[0]!.fields.step_name).toBe('Chemical A');
      expect(result.results[1]!.rows[0]!.fields.step_type).toBe('add');
    });

    it('should generate issues for missing source columns', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-008',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name' },
              { targetField: 'missing_field', source: 'does_not_exist' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name
Test`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      const issues = result.results[0]!.issues;
      const missingColumnIssue = issues.find(i => i.type === 'missing_source_column');
      expect(missingColumnIssue).toBeDefined();
      expect(missingColumnIssue?.message).toContain('does_not_exist');
    });

    it('should handle quoted CSV fields', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-009',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name' },
              { targetField: 'description', source: 'desc' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name,desc
"Test, Inc.","A description with, commas"`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results[0]!.rows[0]!.fields.name).toBe('Test, Inc.');
      expect(result.results[0]!.rows[0]!.fields.description).toBe('A description with, commas');
    });

    it('should handle ai_extract method with not implemented issue', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-010',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name' },
            ],
          },
        ],
        tableExtraction: {
          method: 'ai_extract',
        },
      };

      const result = await runExtractionSpec(spec, 'some content', 'text/plain');

      const issue = result.results[0]!.issues.find(i => i.type === 'parser_not_implemented');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('AI extraction is not yet implemented');
    });

    it('should handle empty rows', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-011',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'name' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 0,
          skipRows: 0,
        },
      };

      const csvContent = `name
Test
`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      // Should have 1 row (the empty row after header is skipped due to being empty)
      expect(result.totalRows).toBe(1);
    });

    it('should handle skipRows correctly', async () => {
      const spec = {
        kind: 'extraction-spec',
        id: 'XSPEC-TEST-012',
        targets: [
          {
            targetSchema: 'lab/material',
            recordKind: 'material',
            idPrefix: 'MAT-',
            fieldMappings: [
              { targetField: 'name', source: 'Name' },
            ],
          },
        ],
        tableExtraction: {
          method: 'csv',
          headerRow: 1,
          skipRows: 1,
        },
      };

      const csvContent = `Some header info
More header
Name,Value
Test1,1
Test2,2`;

      const result = await runExtractionSpec(spec, csvContent, 'text/csv');

      expect(result.results[0]!.rows).toHaveLength(2);
      expect(result.results[0]!.rows[0]!.fields.name).toBe('Test1');
      expect(result.results[0]!.rows[1]!.fields.name).toBe('Test2');
    });
  });
});
