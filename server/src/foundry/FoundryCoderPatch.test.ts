import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  extractUnifiedDiff,
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

describe('extractUnifiedDiff', () => {
  it('extracts fenced diff', () => {
    const text = '```diff\ndiff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,0 +1,1 @@\n+new line\n```';
    const result = extractUnifiedDiff(text);
    expect(result).toContain('diff --git a/foo.ts');
    expect(result).toContain('+++ b/foo.ts');
    expect(result).toContain('+new line');
  });

  it('extracts diff with leading whitespace', () => {
    const text = '  --- a/foo.ts\n  +++ b/foo.ts\n  @@ -1,0 +1,1 @@\n  +new line\n';
    const result = extractUnifiedDiff(text);
    expect(result).toBeDefined();
    expect(result!.includes('--- a/foo.ts')).toBe(true);
    expect(result!.startsWith('  ---')).toBe(false);
  });

  it('extracts raw diff with diff --git', () => {
    const text = 'Some text before\ndiff --git a/foo.ts b/foo.ts\n--- a/foo.ts\n+++ b/foo.ts\n';
    const result = extractUnifiedDiff(text);
    expect(result).toContain('diff --git a/foo.ts');
  });

  it('returns undefined for non-diff content', () => {
    const text = 'Just some text without any diff markers.';
    expect(extractUnifiedDiff(text)).toBeUndefined();
  });

  it('extracts fallback diff with --- a/ and +++ b/', () => {
    const text = 'Some preamble text\n--- a/foo.ts\n+++ b/foo.ts\n@@ -1,0 +1,1 @@\n+added line\n';
    const result = extractUnifiedDiff(text);
    expect(result).toContain('--- a/foo.ts');
    expect(result).toContain('+added line');
  });
});
