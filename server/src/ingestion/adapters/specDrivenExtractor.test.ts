import { describe, it, expect } from 'vitest';
import { runExtractionSpec, type ExtractionResult, type SpecDrivenExtractionOutput } from './specDrivenExtractor.js';

describe('specDrivenExtractor', () => {
  describe('runExtractionSpec', () => {
    describe('CSV extraction', () => {
      it('should parse simple CSV content', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-001',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name', transform: 'trim' },
                { targetField: 'cas_number', source: 'CAS', transform: 'none' },
              ],
              defaults: {
                source: 'test-file',
              },
            },
          ],
          tableExtraction: {
            method: 'csv',
            headerRow: 0,
            skipRows: 0,
          },
        };

        const csvContent = `Name,CAS,Concentration
Water,7732-18-5,100%
Ethanol,64-17-5,95%`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.targetSchema).toBe('lab/material');
        expect(result.results[0]?.rows).toHaveLength(2);
        expect(result.results[0]?.rows[0]?.fields.name).toBe('Water');
        expect(result.results[0]?.rows[0]?.fields.cas_number).toBe('7732-18-5');
        expect(result.results[0]?.rows[1]?.fields.name).toBe('Ethanol');
        expect(result.totalRows).toBe(2);
      });

      it('should handle quoted CSV fields', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-002',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
                { targetField: 'description', source: 'Description' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name,Description
"Compound A","A complex chemical with, commas"`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.name).toBe('Compound A');
        expect(result.results[0]?.rows[0]?.fields.description).toBe('A complex chemical with, commas');
      });

      it('should apply transforms correctly', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-003',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name', transform: 'uppercase' },
                { targetField: 'code', source: 'Code', transform: 'lowercase' },
                { targetField: 'label', source: 'Label', transform: 'trim' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name,Code,Label
  hello  ,ABC,  test  
WORLD,DEF,test`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.name).toBe('HELLO');
        expect(result.results[0]?.rows[0]?.fields.code).toBe('abc');
        expect(result.results[0]?.rows[0]?.fields.label).toBe('test');
      });

      it('should apply normalize_chemical transform', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-004',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name', transform: 'normalize_chemical' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name
Δ-Glucose
  Test  Compound`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        // Δ should be normalized, whitespace collapsed
        expect(result.results[0]?.rows[0]?.fields.name).toBe('Δ-Glucose');
        expect(result.results[0]?.rows[1]?.fields.name).toBe('Test Compound');
      });

      it('should apply parse_concentration transform', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-005',
          targets: [
            {
              targetSchema: 'workflow/protocol-step',
              recordKind: 'protocol-step',
              idPrefix: 'PS-',
              fieldMappings: [
                { targetField: 'concentration', source: 'Conc', transform: 'parse_concentration' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Conc
1 mM
10 µM
0.5 M`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.concentration).toEqual({ value: 1, unit: 'mM' });
        expect(result.results[0]?.rows[1]?.fields.concentration).toEqual({ value: 10, unit: 'µM' });
        expect(result.results[0]?.rows[2]?.fields.concentration).toEqual({ value: 0.5, unit: 'M' });
      });

      it('should apply parse_volume transform', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-006',
          targets: [
            {
              targetSchema: 'workflow/protocol-step',
              recordKind: 'protocol-step',
              idPrefix: 'PS-',
              fieldMappings: [
                { targetField: 'volume', source: 'Volume', transform: 'parse_volume' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Volume
10 µL
500 mL
25 uL`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.volume).toEqual({ value: 10, unit: 'µL' });
        expect(result.results[0]?.rows[1]?.fields.volume).toEqual({ value: 500, unit: 'mL' });
        expect(result.results[0]?.rows[2]?.fields.volume).toEqual({ value: 25, unit: 'uL' });
      });

      it('should apply parse_duration transform', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-007',
          targets: [
            {
              targetSchema: 'workflow/protocol-step',
              recordKind: 'protocol-step',
              idPrefix: 'PS-',
              fieldMappings: [
                { targetField: 'duration', source: 'Duration', transform: 'parse_duration' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Duration
30 min
2 h
overnight`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.duration).toEqual({ value: 30, unit: 'min' });
        expect(result.results[0]?.rows[1]?.fields.duration).toEqual({ value: 2, unit: 'h' });
        expect(result.results[0]?.rows[2]?.fields.duration).toEqual({ value: 12, unit: 'hours' });
      });

      it('should apply default values', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-008',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
              ],
              defaults: {
                source: 'default-source',
                verified: false,
              },
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name
Test Material`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows[0]?.fields.source).toBe('default-source');
        expect(result.results[0]?.rows[0]?.fields.verified).toBe(false);
        expect(result.results[0]?.rows[0]?.fields.name).toBe('Test Material');
      });

      it('should handle multiple targets from same file', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-009',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Material' },
              ],
              defaults: {},
            },
            {
              targetSchema: 'workflow/protocol',
              recordKind: 'protocol',
              idPrefix: 'PRT-',
              fieldMappings: [
                { targetField: 'step_name', source: 'Step' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Material,Step
Chemical A,Incubate
Chemical B,Mix`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results).toHaveLength(2);
        expect(result.results[0]?.targetSchema).toBe('lab/material');
        expect(result.results[0]?.rows).toHaveLength(2);
        expect(result.results[1]?.targetSchema).toBe('workflow/protocol');
        expect(result.results[1]?.rows).toHaveLength(2);
      });

      it('should generate issues for missing fields', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-010',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
                { targetField: 'cas', source: 'CAS' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name
Test Material`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        const issues = result.results[0]?.issues || [];
        const missingFieldIssues = issues.filter(i => i.type === 'missing_field');
        expect(missingFieldIssues.length).toBeGreaterThan(0);
        expect(missingFieldIssues[0]?.message).toContain('CAS');
      });

      it('should handle skipRows option', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-011',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv', skipRows: 1 },
        };

        const csvContent = `Name
SkipThis
Test Material`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows).toHaveLength(1);
        expect(result.results[0]?.rows[0]?.fields.name).toBe('Test Material');
      });

      it('should handle empty rows gracefully', async () => {
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
              defaults: {},
            },
          ],
          tableExtraction: { method: 'csv' },
        };

        const csvContent = `Name
Test Material
`;

        const result = await runExtractionSpec(spec, csvContent, 'csv');

        expect(result.results[0]?.rows).toHaveLength(1);
      });
    });

    describe('HTML table extraction', () => {
      it('should parse HTML tables', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-013',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
                { targetField: 'concentration', source: 'Concentration' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'html_table' },
        };

        const htmlContent = `
<html>
<body>
<h1>Materials</h1>
<table>
  <tr><th>Name</th><th>Concentration</th></tr>
  <tr><td>Water</td><td>100%</td></tr>
  <tr><td>Ethanol</td><td>95%</td></tr>
</table>
</body>
</html>
`;

        const result = await runExtractionSpec(spec, htmlContent, 'html');

        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.rows).toHaveLength(2);
        expect(result.results[0]?.rows[0]?.fields.name).toBe('Water');
        expect(result.results[0]?.rows[0]?.fields.concentration).toBe('100%');
      });
    });

    describe('AI extract method', () => {
      it('should return not implemented issue for ai_extract method', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-014',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'name', source: 'Name' },
              ],
              defaults: {},
            },
          ],
          tableExtraction: { method: 'ai_extract' },
        };

        const result = await runExtractionSpec(spec, 'some content', 'txt');

        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.issues[0]?.type).toBe('parser_not_implemented');
        expect(result.totalIssues).toBe(1);
      });
    });

    describe('Edge cases', () => {
      it('should handle empty spec targets', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-015',
          targets: [],
          tableExtraction: { method: 'csv' },
        };

        const result = await runExtractionSpec(spec, 'a,b\n1,2', 'csv');

        expect(result.results[0]?.issues[0]?.type).toBe('no_targets');
      });

      it('should handle missing tableExtraction config', async () => {
        const spec = {
          kind: 'extraction-spec',
          id: 'XSPEC-TEST-016',
          targets: [
            {
              targetSchema: 'lab/material',
              recordKind: 'material',
              idPrefix: 'MAT-',
              fieldMappings: [
                { targetField: 'a', source: 'a' },
              ],
              defaults: {},
            },
          ],
        };

        const result = await runExtractionSpec(spec, 'a\n1', 'csv');

        // Should default to csv method
        expect(result.results[0]?.rows).toHaveLength(1);
      });
    });
  });
});
