/**
 * Tests for chatbot-compile.yaml pipeline specification.
 *
 * Verifies the 4-pass chatbot-compile pipeline structure.
 */

import { describe, it, expect } from 'vitest';
import { loadPipeline } from './PipelineLoader.js';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Path to the chatbot-compile.yaml pipeline file.
 */
const CHATBOT_COMPILE_PATH = join(
  __dirname,
  '../../../../schema/registry/compile-pipelines/chatbot-compile.yaml',
);

describe('chatbot-compile.yaml', () => {
  describe('Pipeline structure', () => {
    it('loads via PipelineLoader with correct pipelineId', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      expect(spec.pipelineId).toBe('chatbot-compile');
    });

    it('loads via PipelineLoader with correct entrypoint', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      expect(spec.entrypoint).toBe('chatbot-compile');
    });

    it('has exactly 4 passes', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      expect(spec.passes.length).toBe(4);
    });
  });

  describe('Pass ids are correct', () => {
    it('pass ids are extract_entities, ai_precompile, expand_biology_verbs, resolve_labware in order', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const passIds = spec.passes.map((p) => p.id);
      expect(passIds).toEqual(['extract_entities', 'ai_precompile', 'expand_biology_verbs', 'resolve_labware']);
    });
  });

  describe('Families are correct', () => {
    it('families are parse, expand, expand, disambiguate in order', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const families = spec.passes.map((p) => p.family);
      expect(families).toEqual(['parse', 'expand', 'expand', 'disambiguate']);
    });
  });

  describe('Pass dependencies', () => {
    it('extract_entities has no dependencies', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const extractEntities = spec.passes.find((p) => p.id === 'extract_entities');
      expect(extractEntities).toBeDefined();
      expect(extractEntities?.depends_on).toBeUndefined();
    });

    it('ai_precompile depends on extract_entities', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const aiPrecompile = spec.passes.find((p) => p.id === 'ai_precompile');
      expect(aiPrecompile).toBeDefined();
      expect(aiPrecompile?.depends_on).toEqual(['extract_entities']);
    });

    it('expand_biology_verbs depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandBiologyVerbs = spec.passes.find((p) => p.id === 'expand_biology_verbs');
      expect(expandBiologyVerbs).toBeDefined();
      expect(expandBiologyVerbs?.depends_on).toEqual(['ai_precompile']);
    });

    it('resolve_labware depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveLabware = spec.passes.find((p) => p.id === 'resolve_labware');
      expect(resolveLabware).toBeDefined();
      expect(resolveLabware?.depends_on).toEqual(['ai_precompile']);
    });
  });

  describe('Pass descriptions', () => {
    it('extract_entities has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const extractEntities = spec.passes.find((p) => p.id === 'extract_entities');
      expect(extractEntities?.description).toBeDefined();
      expect(extractEntities?.description).toContain('ExtractionRunnerService');
    });

    it('ai_precompile has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const aiPrecompile = spec.passes.find((p) => p.id === 'ai_precompile');
      expect(aiPrecompile?.description).toBeDefined();
      expect(aiPrecompile?.description).toContain('LLM-backed');
    });

    it('expand_biology_verbs has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandBiologyVerbs = spec.passes.find((p) => p.id === 'expand_biology_verbs');
      expect(expandBiologyVerbs?.description).toBeDefined();
      expect(expandBiologyVerbs?.description).toContain('biology verbs');
    });

    it('resolve_labware has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveLabware = spec.passes.find((p) => p.id === 'resolve_labware');
      expect(resolveLabware?.description).toBeDefined();
      expect(resolveLabware?.description).toContain('searchLabwareByHint');
    });
  });
});
