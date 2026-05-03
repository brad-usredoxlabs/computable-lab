/**
 * Tests for chatbot-compile.yaml pipeline specification.
 *
 * Verifies the chatbot-compile pipeline structure including when-clause fields.
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

    it('has exactly 21 passes', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      expect(spec.passes.length).toBe(21);
    });
  });

  describe('Pass ids are correct', () => {
    it('pass ids are in correct order', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const passIds = spec.passes.map((p) => p.id);
      expect(passIds).toEqual([
        'extract_entities',
        'tag_prompt',
        'deterministic_precompile',
        'ai_precompile',
        'mint_materials',
        'apply_directives',
        'expand_biology_verbs',
        'resolve_labware',
        'resolve_references',
        'resolve_prior_labware_references',
        'expand_protocol',
        'expand_patterns',
        'resolve_roles',
        'compute_volumes',
        'compute_resources',
        'derive_execution_scale_plan',
        'plan_deck_layout',
        'validate',
        'emit_instrument_run_files',
        'emit_downstream_queue',
        'lab_state',
      ]);
    });
  });

  describe('Families are correct', () => {
    it('families are in correct order', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const families = spec.passes.map((p) => p.family);
      expect(families).toEqual([
        'parse',
        'parse',
        'parse',
        'expand',
        'expand',
        'expand',
        'expand',
        'disambiguate',
        'disambiguate',
        'disambiguate',
        'expand',
        'expand',
        'expand',
        'expand',
        'emit',
        'emit',
        'emit',
        'validate',
        'emit',
        'emit',
        'emit',
      ]);
    });
  });

  describe('Pass dependencies', () => {
    it('extract_entities has no dependencies', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const extractEntities = spec.passes.find((p) => p.id === 'extract_entities');
      expect(extractEntities).toBeDefined();
      expect(extractEntities?.depends_on).toBeUndefined();
    });

    it('deterministic_precompile has no dependencies', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const detPrecompile = spec.passes.find((p) => p.id === 'deterministic_precompile');
      expect(detPrecompile).toBeDefined();
      expect(detPrecompile?.depends_on).toEqual([]);
      expect(detPrecompile?.family).toBe('parse');
    });

    it('tag_prompt has no dependencies', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const tagPrompt = spec.passes.find((p) => p.id === 'tag_prompt');
      expect(tagPrompt).toBeDefined();
      expect(tagPrompt?.depends_on).toEqual([]);
      expect(tagPrompt?.family).toBe('parse');
    });

    it('ai_precompile depends on extract_entities and deterministic_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const aiPrecompile = spec.passes.find((p) => p.id === 'ai_precompile');
      expect(aiPrecompile).toBeDefined();
      expect(aiPrecompile?.depends_on).toEqual(['extract_entities', 'deterministic_precompile']);
    });

    it('expand_biology_verbs depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandBiologyVerbs = spec.passes.find((p) => p.id === 'expand_biology_verbs');
      expect(expandBiologyVerbs).toBeDefined();
      expect(expandBiologyVerbs?.depends_on).toEqual(['ai_precompile']);
    });

    it('mint_materials depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const mintMaterials = spec.passes.find((p) => p.id === 'mint_materials');
      expect(mintMaterials).toBeDefined();
      expect(mintMaterials?.depends_on).toEqual(['ai_precompile']);
    });

    it('resolve_labware depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveLabware = spec.passes.find((p) => p.id === 'resolve_labware');
      expect(resolveLabware).toBeDefined();
      expect(resolveLabware?.depends_on).toEqual(['ai_precompile']);
    });

    it('resolve_references depends on ai_precompile', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveRefs = spec.passes.find((p) => p.id === 'resolve_references');
      expect(resolveRefs).toBeDefined();
      expect(resolveRefs?.depends_on).toEqual(['ai_precompile']);
    });

    it('expand_protocol depends on resolve_references', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandProtocol = spec.passes.find((p) => p.id === 'expand_protocol');
      expect(expandProtocol).toBeDefined();
      expect(expandProtocol?.depends_on).toEqual(['resolve_references']);
    });

    it('resolve_roles depends on expand_protocol', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveRoles = spec.passes.find((p) => p.id === 'resolve_roles');
      expect(resolveRoles).toBeDefined();
      expect(resolveRoles?.depends_on).toEqual(['expand_protocol']);
    });

    it('lab_state depends on resolve_roles', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const labState = spec.passes.find((p) => p.id === 'lab_state');
      expect(labState).toBeDefined();
      expect(labState?.depends_on).toEqual(['resolve_roles']);
    });

    it('derive_execution_scale_plan depends on compute_resources', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const scalePlan = spec.passes.find((p) => p.id === 'derive_execution_scale_plan');
      expect(scalePlan).toBeDefined();
      expect(scalePlan?.depends_on).toEqual(['compute_resources']);
    });
  });

  describe('when clauses', () => {
    it('mint_materials has when clause for mintMaterials', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const mintMaterials = spec.passes.find((p) => p.id === 'mint_materials');
      expect(mintMaterials).toBeDefined();
      expect(mintMaterials?.when).toBe('outputs.ai_precompile.mintMaterials');
    });

    it('apply_directives has when clause for directives', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const applyDirectives = spec.passes.find((p) => p.id === 'apply_directives');
      expect(applyDirectives).toBeDefined();
      expect(applyDirectives?.when).toBe('outputs.ai_precompile.directives');
    });

    it('expand_biology_verbs has when clause for candidateEvents', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandBiologyVerbs = spec.passes.find((p) => p.id === 'expand_biology_verbs');
      expect(expandBiologyVerbs).toBeDefined();
      expect(expandBiologyVerbs?.when).toBe('outputs.ai_precompile.candidateEvents');
    });

    it('resolve_labware has when clause for candidateLabwares', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveLabware = spec.passes.find((p) => p.id === 'resolve_labware');
      expect(resolveLabware).toBeDefined();
      expect(resolveLabware?.when).toBe('outputs.ai_precompile.candidateLabwares');
    });

    it('resolve_references has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveRefs = spec.passes.find((p) => p.id === 'resolve_references');
      expect(resolveRefs).toBeDefined();
      expect(resolveRefs?.when).toBeUndefined();
    });

    it('resolve_prior_labware_references has when clause for priorLabwareRefs', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolvePrior = spec.passes.find((p) => p.id === 'resolve_prior_labware_references');
      expect(resolvePrior).toBeDefined();
      expect(resolvePrior?.when).toBe('outputs.ai_precompile.priorLabwareRefs');
    });

    it('expand_protocol has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandProtocol = spec.passes.find((p) => p.id === 'expand_protocol');
      expect(expandProtocol).toBeDefined();
      expect(expandProtocol?.when).toBeUndefined();
    });

    it('expand_patterns has when clause for patternEvents', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandPatterns = spec.passes.find((p) => p.id === 'expand_patterns');
      expect(expandPatterns).toBeDefined();
      expect(expandPatterns?.when).toBe('outputs.ai_precompile.patternEvents');
    });

    it('emit_downstream_queue has when clause for downstreamCompileJobs', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const emitDownstream = spec.passes.find((p) => p.id === 'emit_downstream_queue');
      expect(emitDownstream).toBeDefined();
      expect(emitDownstream?.when).toBe('outputs.ai_precompile.downstreamCompileJobs');
    });

    it('extract_entities has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const extractEntities = spec.passes.find((p) => p.id === 'extract_entities');
      expect(extractEntities).toBeDefined();
      expect(extractEntities?.when).toBeUndefined();
    });

    it('tag_prompt has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const tagPrompt = spec.passes.find((p) => p.id === 'tag_prompt');
      expect(tagPrompt).toBeDefined();
      expect(tagPrompt?.when).toBeUndefined();
    });

    it('ai_precompile has no when clause (gating is internal to the pass, spec-046)', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const aiPrecompile = spec.passes.find((p) => p.id === 'ai_precompile');
      expect(aiPrecompile).toBeDefined();
      expect(aiPrecompile?.when).toBeUndefined();
    });

    it('resolve_roles has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveRoles = spec.passes.find((p) => p.id === 'resolve_roles');
      expect(resolveRoles).toBeDefined();
      expect(resolveRoles?.when).toBeUndefined();
    });

    it('compute_volumes has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const computeVolumes = spec.passes.find((p) => p.id === 'compute_volumes');
      expect(computeVolumes).toBeDefined();
      expect(computeVolumes?.when).toBeUndefined();
    });

    it('compute_resources has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const computeResources = spec.passes.find((p) => p.id === 'compute_resources');
      expect(computeResources).toBeDefined();
      expect(computeResources?.when).toBeUndefined();
    });

    it('derive_execution_scale_plan has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const scalePlan = spec.passes.find((p) => p.id === 'derive_execution_scale_plan');
      expect(scalePlan).toBeDefined();
      expect(scalePlan?.when).toBeUndefined();
    });

    it('plan_deck_layout has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const planDeck = spec.passes.find((p) => p.id === 'plan_deck_layout');
      expect(planDeck).toBeDefined();
      expect(planDeck?.when).toBeUndefined();
    });

    it('validate has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const validate = spec.passes.find((p) => p.id === 'validate');
      expect(validate).toBeDefined();
      expect(validate?.when).toBeUndefined();
    });

    it('emit_instrument_run_files has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const emitInstrument = spec.passes.find((p) => p.id === 'emit_instrument_run_files');
      expect(emitInstrument).toBeDefined();
      expect(emitInstrument?.when).toBeUndefined();
    });

    it('lab_state has no when clause', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const labState = spec.passes.find((p) => p.id === 'lab_state');
      expect(labState).toBeDefined();
      expect(labState?.when).toBeUndefined();
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
      expect(aiPrecompile).toBeDefined();
      expect(aiPrecompile?.description).toContain('LLM-backed');
    });

    it('tag_prompt has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const tagPrompt = spec.passes.find((p) => p.id === 'tag_prompt');
      expect(tagPrompt).toBeDefined();
      expect(tagPrompt?.description).toContain('Shadow-mode');
    });

    it('expand_biology_verbs has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const expandBiologyVerbs = spec.passes.find((p) => p.id === 'expand_biology_verbs');
      expect(expandBiologyVerbs).toBeDefined();
      expect(expandBiologyVerbs?.description).toContain('biology verbs');
    });

    it('resolve_labware has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const resolveLabware = spec.passes.find((p) => p.id === 'resolve_labware');
      expect(resolveLabware).toBeDefined();
      expect(resolveLabware?.description).toContain('searchLabwareByHint');
    });

    it('lab_state has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const labState = spec.passes.find((p) => p.id === 'lab_state');
      expect(labState).toBeDefined();
      expect(labState?.description).toContain('lab-state snapshot');
    });

    it('mint_materials has description', () => {
      const spec = loadPipeline(CHATBOT_COMPILE_PATH);
      const mintMaterials = spec.passes.find((p) => p.id === 'mint_materials');
      expect(mintMaterials).toBeDefined();
      expect(mintMaterials?.description).toContain('create_container');
    });
  });
});
