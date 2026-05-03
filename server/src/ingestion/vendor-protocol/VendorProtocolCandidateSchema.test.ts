import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../../..');
const schemaPath = resolve(repoRoot, 'schema/workflow/vendor-protocol-candidate.schema.yaml');

describe('vendor-protocol-candidate schema', () => {
  it('parses as YAML and declares the canonical candidate kind', () => {
    const parsed = parseYaml(readFileSync(schemaPath, 'utf-8')) as Record<string, any>;
    expect(parsed).toBeInstanceOf(Object);
    expect(parsed.properties.kind.const).toBe('vendor-protocol-candidate');
    expect(parsed.required).toEqual(expect.arrayContaining([
      'source',
      'materials',
      'equipment',
      'labware',
      'steps',
      'tables',
      'diagnostics',
    ]));
  });

  it('requires provenance on extracted items, actions, steps, tables, and sections', () => {
    const parsed = parseYaml(readFileSync(schemaPath, 'utf-8')) as Record<string, any>;
    expect(parsed.$defs.Provenance.required).toEqual(['documentId', 'pageStart']);
    expect(parsed.$defs.ExtractedItem.required).toContain('provenance');
    expect(parsed.$defs.Action.required).toContain('provenance');
    expect(parsed.properties.steps.items.required).toContain('provenance');
    expect(parsed.properties.tables.items.required).toContain('provenance');
    expect(parsed.properties.sections.items.required).toContain('provenance');
  });
});

