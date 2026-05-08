import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  meaningfulPatchFiles,
  selectPatchSpecIdForRun,
} from './FoundryCoderPatch.js';

describe('meaningfulPatchFiles', () => {
  it('filters only compiler/schema/record files', () => {
    expect(meaningfulPatchFiles([
      'server/src/compiler/pipeline/ChatbotCompilePasses.ts',
      'schema/lab/material.schema.yaml',
      'client/src/App.tsx',
      'README.md',
      'server/src/foundry/FoundryLedger.ts',
      'package.json',
    ])).toEqual([
      'client/src/App.tsx',
      'schema/lab/material.schema.yaml',
      'server/src/compiler/pipeline/ChatbotCompilePasses.ts',
      'server/src/foundry/FoundryLedger.ts',
    ]);
  });

  it('returns empty for non-meaningful files', () => {
    expect(meaningfulPatchFiles(['README.md', 'package.json', 'tsconfig.json'])).toEqual([]);
  });

  it('handles empty input', () => {
    expect(meaningfulPatchFiles([])).toEqual([]);
  });
});

describe('selectPatchSpecIdForRun', () => {
  it('selects highest priority fix class', () => {
    const specs = [
      { id: 'spec-3', fixClass: 'browser_or_labware_rendering' },
      { id: 'spec-1', fixClass: 'foundry_runtime_wiring_gap' },
      { id: 'spec-2', fixClass: 'material_catalog_or_spec_gap' },
    ];
    expect(selectPatchSpecIdForRun(specs)).toBe('spec-1');
  });

  it('selects first spec when same priority', () => {
    const specs = [
      { id: 'spec-b', fixClass: 'material_catalog_or_spec_gap' },
      { id: 'spec-a', fixClass: 'material_catalog_or_spec_gap' },
    ];
    expect(selectPatchSpecIdForRun(specs)).toBe('spec-a');
  });

  it('returns undefined for empty input', () => {
    expect(selectPatchSpecIdForRun([])).toBeUndefined();
  });

  it('handles unknown fix classes', () => {
    const specs = [
      { id: 'spec-1', fixClass: 'unknown_fix_class' },
      { id: 'spec-2', fixClass: 'foundry_runtime_wiring_gap' },
    ];
    expect(selectPatchSpecIdForRun(specs)).toBe('spec-2');
  });
});
