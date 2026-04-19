/**
 * Tests for PipelineLoader.
 *
 * Uses node:fs + node:os.tmpdir() for temp test fixtures.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPipeline, loadPipelinesFromDir, PipelineLoadError } from './PipelineLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create a temporary directory for test fixtures.
 */
function createTempDir(): string {
  const tmpDir = join('/tmp', `pipeline-loader-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpDir, { recursive: true });
  return tmpDir;
}

/**
 * Clean up a temporary directory.
 */
function cleanupTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

describe('PipelineLoader', () => {
  describe('loadPipeline', () => {
    it('should load a valid YAML with 2 passes', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: protocol-compile
passes:
  - id: pass-one
    family: parse
    description: First pass
  - id: pass-two
    family: normalize
    depends_on:
      - pass-one
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        const spec = loadPipeline(filePath);

        expect(spec.pipelineId).toBe('test-pipeline');
        expect(spec.entrypoint).toBe('protocol-compile');
        expect(spec.passes.length).toBe(2);
        expect(spec.passes[0].id).toBe('pass-one');
        expect(spec.passes[0].family).toBe('parse');
        expect(spec.passes[1].id).toBe('pass-two');
        expect(spec.passes[1].family).toBe('normalize');
        expect(spec.passes[1].depends_on).toEqual(['pass-one']);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError when passes field is missing', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: protocol-compile
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/passes/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError when entrypoint is invalid', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: bogus-compile
passes:
  - id: pass-one
    family: parse
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        const error = expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/entrypoint/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError when pass ids are duplicated', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: protocol-compile
passes:
  - id: duplicate-id
    family: parse
  - id: duplicate-id
    family: normalize
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/Duplicate pass id/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError for invalid pipelineId pattern', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: Invalid_Id
entrypoint: protocol-compile
passes:
  - id: pass-one
    family: parse
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/pipelineId/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError for invalid pass family', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: protocol-compile
passes:
  - id: pass-one
    family: invalid-family
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/family/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError for invalid YAML syntax', () => {
      const tmpDir = createTempDir();
      try {
        const yamlContent = `
pipelineId: test-pipeline
entrypoint: protocol-compile
passes:
  - id: pass-one
    family: parse
    invalid: [unclosed bracket
`;
        const filePath = join(tmpDir, 'test.yaml');
        writeFileSync(filePath, yamlContent, 'utf-8');

        expect(() => loadPipeline(filePath)).toThrow(PipelineLoadError);
        expect(() => loadPipeline(filePath)).toThrow(/yaml parse error/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError when file does not exist', () => {
      expect(() => loadPipeline('/nonexistent/path/file.yaml')).toThrow(PipelineLoadError);
    });
  });

  describe('loadPipelinesFromDir', () => {
    it('should load multiple pipelines and skip schema files', () => {
      const tmpDir = createTempDir();
      try {
        // Create first valid pipeline
        const yaml1 = `
pipelineId: pipeline-one
entrypoint: protocol-compile
passes:
  - id: pass-a
    family: parse
`;
        writeFileSync(join(tmpDir, 'pipeline-one.yaml'), yaml1, 'utf-8');

        // Create second valid pipeline
        const yaml2 = `
pipelineId: pipeline-two
entrypoint: extraction-compile
passes:
  - id: pass-b
    family: validate
`;
        writeFileSync(join(tmpDir, 'pipeline-two.yaml'), yaml2, 'utf-8');

        // Create schema definition file (should be skipped)
        const schemaYaml = `
# This is a schema definition file, not a pipeline
$schema: "http://json-schema.org/draft-07/schema#"
type: object
`;
        writeFileSync(join(tmpDir, 'compile-pipeline.schema.yaml'), schemaYaml, 'utf-8');

        const result = loadPipelinesFromDir(tmpDir);

        expect(result.size).toBe(2);
        expect(result.has('pipeline-one')).toBe(true);
        expect(result.has('pipeline-two')).toBe(true);
        expect(result.has('compile-pipeline.schema')).toBe(false);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should throw PipelineLoadError when pipelineId is duplicated across files', () => {
      const tmpDir = createTempDir();
      try {
        // Create first pipeline
        const yaml1 = `
pipelineId: duplicate-pipeline
entrypoint: protocol-compile
passes:
  - id: pass-a
    family: parse
`;
        writeFileSync(join(tmpDir, 'first.yaml'), yaml1, 'utf-8');

        // Create second pipeline with same pipelineId
        const yaml2 = `
pipelineId: duplicate-pipeline
entrypoint: extraction-compile
passes:
  - id: pass-b
    family: validate
`;
        writeFileSync(join(tmpDir, 'second.yaml'), yaml2, 'utf-8');

        expect(() => loadPipelinesFromDir(tmpDir)).toThrow(PipelineLoadError);
        expect(() => loadPipelinesFromDir(tmpDir)).toThrow(/duplicate.*pipelineId|pipelineId.*duplicate/);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should return empty map for directory with no yaml files', () => {
      const tmpDir = createTempDir();
      try {
        // Create a non-yaml file
        writeFileSync(join(tmpDir, 'readme.txt'), 'This is not a pipeline');

        const result = loadPipelinesFromDir(tmpDir);
        expect(result.size).toBe(0);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should propagate errors from invalid pipeline files', () => {
      const tmpDir = createTempDir();
      try {
        // Create an invalid pipeline
        const yaml = `
pipelineId: invalid-pipeline
entrypoint: bogus-entrypoint
passes:
  - id: pass-a
    family: parse
`;
        writeFileSync(join(tmpDir, 'invalid.yaml'), yaml, 'utf-8');

        expect(() => loadPipelinesFromDir(tmpDir)).toThrow(PipelineLoadError);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });

    it('should handle .yml extension', () => {
      const tmpDir = createTempDir();
      try {
        const yaml = `
pipelineId: yml-pipeline
entrypoint: run-plan-compile
passes:
  - id: pass-x
    family: disambiguate
`;
        writeFileSync(join(tmpDir, 'pipeline.yml'), yaml, 'utf-8');

        const result = loadPipelinesFromDir(tmpDir);
        expect(result.size).toBe(1);
        expect(result.has('yml-pipeline')).toBe(true);
      } finally {
        cleanupTempDir(tmpDir);
      }
    });
  });

  describe('PipelineLoadError', () => {
    it('should have correct name property', () => {
      const error = new PipelineLoadError('/path/to/file.yaml', 'test reason');
      expect(error.name).toBe('PipelineLoadError');
    });

    it('should include path and reason in message', () => {
      const error = new PipelineLoadError('/path/to/file.yaml', 'test reason');
      expect(error.message).toContain('/path/to/file.yaml');
      expect(error.message).toContain('test reason');
    });

    it('should store path and reason as properties', () => {
      const error = new PipelineLoadError('/path/to/file.yaml', 'test reason', { extra: 'data' });
      expect(error.path).toBe('/path/to/file.yaml');
      expect(error.reason).toBe('test reason');
      expect(error.details).toEqual({ extra: 'data' });
    });
  });
});
