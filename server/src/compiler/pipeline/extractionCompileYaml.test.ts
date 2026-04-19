/**
 * Tests for extraction-compile.yaml pipeline specification.
 *
 * Verifies the 3-pass extraction pipeline structure per spec-077.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPipeline, PipelineLoadError } from './PipelineLoader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the extraction-compile.yaml pipeline file.
 */
const EXTRACTION_COMPILE_PATH = join(
  __dirname,
  '../../../../schema/registry/compile-pipelines/extraction-compile.yaml',
);

describe('extraction-compile.yaml', () => {
  describe('Pipeline structure', () => {
    it('loads via PipelineLoader with correct pipelineId', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      expect(spec.pipelineId).toBe('extraction-compile');
    });

    it('loads via PipelineLoader with correct entrypoint', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      expect(spec.entrypoint).toBe('extraction-compile');
    });

    it('has exactly 3 passes', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      expect(spec.passes.length).toBe(3);
    });
  });

  describe('Pass ids match ExtractionPasses', () => {
    it('pass ids are extractor_run, mention_resolve, draft_assemble in order', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const passIds = spec.passes.map((p) => p.id);
      expect(passIds).toEqual(['extractor_run', 'mention_resolve', 'draft_assemble']);
    });
  });

  describe('Families are correct', () => {
    it('families are parse, disambiguate, project in order', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const families = spec.passes.map((p) => p.family);
      expect(families).toEqual(['parse', 'disambiguate', 'project']);
    });
  });

  describe('Removed passes are absent', () => {
    it('does not contain candidate_schema_validation as a pass id', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      // Check for pass id patterns (lines starting with "- id: <name>")
      const lines = content.split('\n');
      const passIdLines = lines.filter((line) => line.trim().startsWith('- id:'));
      
      for (const line of passIdLines) {
        expect(line).not.toMatch(/- id:\s*candidate_schema_validation/);
      }
    });

    it('does not contain confidence_threshold_filter as a pass id', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      const lines = content.split('\n');
      const passIdLines = lines.filter((line) => line.trim().startsWith('- id:'));
      
      for (const line of passIdLines) {
        expect(line).not.toMatch(/- id:\s*confidence_threshold_filter/);
      }
    });

    it('does not contain load_source_artifact as a pass id', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      const lines = content.split('\n');
      const passIdLines = lines.filter((line) => line.trim().startsWith('- id:'));
      
      for (const line of passIdLines) {
        expect(line).not.toMatch(/- id:\s*load_source_artifact/);
      }
    });
  });

  describe('Description documents removals', () => {
    it('description mentions candidate_schema_validation removal', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      expect(content).toContain('candidate_schema_validation');
    });

    it('description mentions confidence_threshold_filter removal', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      expect(content).toContain('confidence_threshold_filter');
    });

    it('description mentions load_source_artifact removal', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      expect(content).toContain('load_source_artifact');
    });

    it('description references compiler-specs/80-ai-pre-compiler.md §3.3', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      expect(content).toContain('§3.3');
    });

    it('description references compiler-specs/80-ai-pre-compiler.md §7', () => {
      const content = readFileSync(EXTRACTION_COMPILE_PATH, 'utf-8');
      expect(content).toContain('§7');
    });
  });

  describe('Pass dependencies', () => {
    it('extractor_run has no dependencies', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const extractorRun = spec.passes.find((p) => p.id === 'extractor_run');
      expect(extractorRun).toBeDefined();
      expect(extractorRun?.depends_on).toBeUndefined();
    });

    it('mention_resolve depends on extractor_run', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const mentionResolve = spec.passes.find((p) => p.id === 'mention_resolve');
      expect(mentionResolve).toBeDefined();
      expect(mentionResolve?.depends_on).toEqual(['extractor_run']);
    });

    it('draft_assemble depends on mention_resolve', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const draftAssemble = spec.passes.find((p) => p.id === 'draft_assemble');
      expect(draftAssemble).toBeDefined();
      expect(draftAssemble?.depends_on).toEqual(['mention_resolve']);
    });
  });

  describe('Pass descriptions', () => {
    it('extractor_run has description', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const extractorRun = spec.passes.find((p) => p.id === 'extractor_run');
      expect(extractorRun?.description).toBeDefined();
      expect(extractorRun?.description).toContain('extractor adapter');
    });

    it('mention_resolve has description', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const mentionResolve = spec.passes.find((p) => p.id === 'mention_resolve');
      expect(mentionResolve?.description).toBeDefined();
      expect(mentionResolve?.description).toContain('deterministic resolver');
    });

    it('draft_assemble has description', () => {
      const spec = loadPipeline(EXTRACTION_COMPILE_PATH);
      const draftAssemble = spec.passes.find((p) => p.id === 'draft_assemble');
      expect(draftAssemble?.description).toBeDefined();
      expect(draftAssemble?.description).toContain('pending_review');
    });
  });
});
