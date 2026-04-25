import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseFixture } from './FixtureTypes.js';
import { runFixture } from './FixtureRunner.js';
import { PassRegistry } from '../PassRegistry.js';
import { runPipeline } from '../PipelineRunner.js';
import { loadPipeline } from '../PipelineLoader.js';
import {
  createExtractEntitiesPass,
  createAiPrecompilePass,
  createExpandBiologyVerbsPass,
  createMintMaterialsPass,
  createApplyDirectivesPass,
  createLabwareResolvePass,
  createResolveReferencesPass,
  createResolvePriorLabwareReferencesPass,
  createExpandProtocolPass,
  createExpandPatternsPass,
  createResolveRolesPass,
  createLabStatePass,
  createComputeVolumesPass,
  createComputeResourcesPass,
  createPlanDeckLayoutPass,
  createValidatePass,
  createEmitInstrumentRunFilesPass,
  createEmitDownstreamQueuePass,
  type LlmClient,
} from '../passes/ChatbotCompilePasses.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import type { CompletionRequest, CompletionResponse } from '../../../ai/types.js';
import { emptyLabState } from '../../state/LabState.js';
import { getProtocolSpecRegistry } from '../../../registry/ProtocolSpecRegistry.js';
import { getAssaySpecRegistry } from '../../../registry/AssaySpecRegistry.js';
import { getStampPatternRegistry } from '../../../registry/StampPatternRegistry.js';
import { getCompoundClassRegistry } from '../../../registry/CompoundClassRegistry.js';

const FIXTURE_PATH = resolve(__dirname, 'prompt-04-fire-assay.yaml');

describe('Prompt 04 - deep debug', () => {
  it('deep debug', async () => {
    const fixture = parseFixture(readFileSync(FIXTURE_PATH, 'utf8'));
    const mockedOutput = fixture.mocked_ai_precompile_output;

    // Build mock LLM
    const llmClient: LlmClient = {
      complete: async (_req: CompletionRequest): Promise<CompletionResponse> => {
        const content = JSON.stringify(mockedOutput);
        return {
          id: 'fixture-mock',
          choices: [{
            index: 0,
            message: { role: 'assistant', content },
            finish_reason: 'stop',
          }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        };
      },
    };

    // Build minimal extraction service
    const extractionService: ExtractionRunnerService = {
      run: async (_req: RunExtractionServiceArgs): Promise<ExtractionDraftBody> => ({
        target_kind: _req.target_kind,
        source: _req.source,
        candidates: [],
        diagnostics: [],
      }),
    } as unknown as ExtractionRunnerService;

    // Build registry and pipeline
    const registry = new PassRegistry();
    registry.register(createExtractEntitiesPass({ extractionService }));
    registry.register(createAiPrecompilePass({ llmClient }));
    registry.register(createMintMaterialsPass());
    registry.register(createApplyDirectivesPass());
    registry.register(createExpandBiologyVerbsPass());
    registry.register(createLabwareResolvePass({ searchLabwareByHint: async () => [] }));
    registry.register(createResolveReferencesPass({
      protocolRegistry: getProtocolSpecRegistry(),
      assayRegistry: getAssaySpecRegistry(),
      stampPatternRegistry: getStampPatternRegistry(),
      compoundClassRegistry: getCompoundClassRegistry(),
    }));
    registry.register(createResolvePriorLabwareReferencesPass());
    registry.register(createExpandProtocolPass({ protocolRegistry: getProtocolSpecRegistry() }));
    registry.register(createExpandPatternsPass({ stampPatternRegistry: getStampPatternRegistry() }));
    registry.register(createResolveRolesPass());
    registry.register(createLabStatePass());
    registry.register(createComputeVolumesPass());
    registry.register(createComputeResourcesPass());
    registry.register(createPlanDeckLayoutPass());
    registry.register(createValidatePass());
    registry.register(createEmitInstrumentRunFilesPass());
    registry.register(createEmitDownstreamQueuePass());

    // Use the same path as runChatbotCompile
    const PIPELINE_YAML_PATH = resolve(
      import.meta.dirname ?? __dirname,
      '../../../../../../schema/registry/compile-pipelines/chatbot-compile.yaml',
    );
    const spec = loadPipeline(PIPELINE_YAML_PATH);
    
    const result = await runPipeline(spec, registry, {
      prompt: fixture.input.prompt,
      attachments: [],
      labState: emptyLabState(),
    });

    console.log('pass_statuses:', result.pass_statuses.map(s => `${s.pass_id}: ${s.status} (${s.reason})`));
    console.log('ai_precompile output keys:', Object.keys(result.outputs.get('ai_precompile') ?? {}));
    const aiOutput = result.outputs.get('ai_precompile') as Record<string, unknown> | undefined;
    console.log('ai_precompile.patternEvents:', aiOutput?.patternEvents);
    console.log('expand_patterns output:', JSON.stringify(result.outputs.get('expand_patterns'), null, 2));
    console.log('resolve_roles output events count:', (result.outputs.get('resolve_roles') as { events?: unknown[] })?.events?.length);
    console.log('apply_directives output:', JSON.stringify(result.outputs.get('apply_directives'), null, 2));
    console.log('emit_downstream_queue output:', JSON.stringify(result.outputs.get('emit_downstream_queue'), null, 2));
    console.log('diagnostics:', result.diagnostics.map(d => `${d.code}: ${d.message}`));

    expect(true).toBe(true);
  });
});
