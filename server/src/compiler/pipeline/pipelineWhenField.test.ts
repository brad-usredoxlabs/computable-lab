/**
 * Tests for the optional `when` clause on pipeline passes.
 *
 * Verifies that the PipelineLoader parses, validates, and preserves
 * the `when` field on PassSpec entries.  See spec-003-when-clause-vocabulary.
 */

import { describe, it, expect } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { loadPipeline, PipelineLoadError } from './PipelineLoader.js';

/**
 * Create a temporary directory for test fixtures.
 */
function createTempDir(): string {
  const tmpDir = join('/tmp', `pipeline-when-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Clean up a temporary directory.
 */
function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe('pipelineWhenField', () => {
  describe('when clause parsing', () => {
    it('preserves when clause on a pass', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-when-pipeline
entrypoint: protocol-compile
passes:
  - id: pass-with-when
    family: parse
    when: "outputs.ai_precompile.directives"
  - id: pass-without-when
    family: normalize
`;
        const filePath = join(tmpDir, 'test-when.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        const spec = loadPipeline(filePath);

        expect(spec.passes.length).toBe(2);

        const passWithWhen = spec.passes.find((p) => p.id === 'pass-with-when');
        expect(passWithWhen).toBeDefined();
        expect(passWithWhen!.when).toBe('outputs.ai_precompile.directives');

        const passWithoutWhen = spec.passes.find((p) => p.id === 'pass-without-when');
        expect(passWithoutWhen).toBeDefined();
        expect(passWithoutWhen!.when).toBeUndefined();
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('throws PipelineLoadError when when is not a string', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-when-invalid
entrypoint: protocol-compile
passes:
  - id: pass-bad-when
    family: parse
    when: 123
`;
        const filePath = join(tmpDir, 'test-when-invalid.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/when must be a string/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('preserves when clause with empty string', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-when-empty
entrypoint: protocol-compile
passes:
  - id: pass-empty-when
    family: parse
    when: ""
`;
        const filePath = join(tmpDir, 'test-when-empty.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        const spec = loadPipeline(filePath);

        const pass = spec.passes.find((p) => p.id === 'pass-empty-when');
        expect(pass).toBeDefined();
        expect(pass!.when).toBe('');
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('preserves when clause with complex dotted path', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-when-complex
entrypoint: chatbot-compile
passes:
  - id: pass-complex-when
    family: expand
    when: "outputs.ai_precompile.directives"
    depends_on:
      - ai_precompile
`;
        const filePath = join(tmpDir, 'test-when-complex.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        const spec = loadPipeline(filePath);

        const pass = spec.passes.find((p) => p.id === 'pass-complex-when');
        expect(pass).toBeDefined();
        expect(pass!.when).toBe('outputs.ai_precompile.directives');
        expect(pass!.depends_on).toEqual(['ai_precompile']);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });
});
