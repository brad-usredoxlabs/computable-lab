/**
 * Tests for the extract_entities and ai_precompile passes.
 */

import { describe, it, expect, vi, type Mock } from 'vitest';
import type { ExtractionRunnerService } from '../../../extract/ExtractionRunnerService.js';
import type { ExtractionDraftBody } from '../../../extract/ExtractionDraftBuilder.js';
import {
  createExtractEntitiesPass,
  type CreateExtractEntitiesPassDeps,
  createAiPrecompilePass,
  type CreateAiPrecompilePassDeps,
  type LlmClient,
  type AiPrecompileOutput,
  createExpandBiologyVerbsPass,
  createLabwareResolvePass,
  type CreateLabwareResolvePassDeps,
  type LabwareResolveOutput,
  createMintMaterialsPass,
  type MintMaterialsDirective,
  type MintMaterialsPassOutput,
  createApplyDirectivesPass,
  type ApplyDirectivesPassOutput,
  createFallbackSideEvidenceEventsPass,
  createLabStatePass,
} from './ChatbotCompilePasses.js';
import type { PipelineState, PassDiagnostic } from '../types.js';
import type { CompletionRequest } from '../../../ai/types.js';
import { PROTOCOL_INTENT_KIND, PROTOCOL_INTENT_VERSION } from '../../protocolIntent/ProtocolIntent.js';
import { addMaterialExpander, transferExpander } from '../../biology/verbs/simpleVerbs.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';
import { applyEventToLabState } from '../../state/LabState.js';
import type { LabStateSnapshot } from '../../state/LabState.js';

describe('createExtractEntitiesPass', () => {
  it('prompt-only input produces entities from single ExtractionRunnerService call', async () => {
    // Create a mock ExtractionRunnerService
    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [
          {
            target_kind: 'material',
            draft: { name: 'reservoir', type: 'liquid-handling' },
            confidence: 0.85,
          },
        ],
        diagnostics: [],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    const deps: CreateExtractEntitiesPassDeps = {
      extractionService: mockExtractionService,
    };

    const pass = createExtractEntitiesPass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'add a reservoir',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'extract_entities',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as { entities: unknown[] };
    expect(output.entities.length).toBe(1);
    expect(output.entities[0]).toMatchObject({
      kind: 'material',
      source: 'prompt',
    });
    expect(mockExtractionService.run).toHaveBeenCalledTimes(1);
  });

  it('prompt + one PDF attachment produces entities from two calls', async () => {
    const mockExtractionService = {
      run: vi.fn(),
    } as unknown as ExtractionRunnerService;

    // Mock different results for prompt vs attachment
    (mockExtractionService.run as Mock)
      .mockResolvedValueOnce({
        candidates: [
          {
            target_kind: 'protocol',
            draft: { name: 'transfer-protocol', steps: [] },
            confidence: 0.9,
          },
        ],
        diagnostics: [],
      } as ExtractionDraftBody)
      .mockResolvedValueOnce({
        candidates: [
          {
            target_kind: 'labware-spec',
            draft: { name: '96-well-plate', material: 'polystyrene' },
            confidence: 0.95,
          },
        ],
        diagnostics: [],
      } as ExtractionDraftBody);

    const deps: CreateExtractEntitiesPassDeps = {
      extractionService: mockExtractionService,
    };

    const pass = createExtractEntitiesPass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'extract protocol from this PDF',
        attachments: [
          {
            name: 'protocol.pdf',
            mime_type: 'application/pdf',
            content: 'PDF content here',
          },
        ],
      },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'extract_entities',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as { entities: unknown[] };
    expect(output.entities.length).toBe(2);
    expect(mockExtractionService.run).toHaveBeenCalledTimes(2);
    
    // First entity from prompt
    expect(output.entities[0]).toMatchObject({
      kind: 'protocol',
      source: 'prompt',
    });
    
    // Second entity from attachment
    expect(output.entities[1]).toMatchObject({
      kind: 'labware-spec',
      source: 'attachment',
      attachment_name: 'protocol.pdf',
    });
  });

  it('extraction diagnostics are forwarded to pass diagnostics', async () => {
    const mockExtractionService = {
      run: vi.fn().mockResolvedValue({
        candidates: [
          {
            target_kind: 'material',
            draft: { name: 'reservoir', type: 'liquid-handling' },
            confidence: 0.3, // low confidence
          },
        ],
        diagnostics: [
          {
            severity: 'warning',
            code: 'LOW_CONFIDENCE',
            message: 'Extraction confidence below threshold',
            details: { confidence: 0.3 },
          },
        ],
      } as ExtractionDraftBody),
    } as unknown as ExtractionRunnerService;

    const deps: CreateExtractEntitiesPassDeps = {
      extractionService: mockExtractionService,
    };

    const pass = createExtractEntitiesPass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'some ambiguous text',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'extract_entities',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'extract_entities',
      severity: 'warning',
      code: 'LOW_CONFIDENCE',
      message: 'Extraction confidence below threshold',
    });
  });
});

describe('createAiPrecompilePass', () => {
  it('happy path: valid JSON response produces output as given', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'seed', material: 'HeLa cells', volume: '5mL' }],
      candidateLabwares: [{ hint: '96-well plate', reason: 'mentioned in prompt' }],
      unresolvedRefs: [{ kind: 'material', label: 'HeLa cells', reason: 'not in catalog' }],
      clarification: undefined,
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
      model: 'test-model',
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'seed a 96-well plate with HeLa cells',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['extract_entities', { entities: [{ kind: 'material', draft: { name: 'HeLa' } }] }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'seed', material: 'HeLa cells', volume: '5mL' });
    expect(output.candidateLabwares).toHaveLength(1);
    expect(output.candidateLabwares[0]).toMatchObject({ hint: '96-well plate' });
    expect(output.unresolvedRefs).toHaveLength(1);
    expect(result.diagnostics).toBeUndefined();
    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
    const callArg = (mockLlmClient.complete as Mock).mock.calls[0][0] as CompletionRequest;
    expect(callArg.model).toBe('test-model');
    expect(callArg.response_format).toEqual({ type: 'json_object' });
    expect(callArg.messages[0]?.content).toContain('"protocolIntent"');
    expect(callArg.messages[0]?.content).toContain('protocolIntent is the primary output');
  });

  it('invalid JSON produces warning diagnostic + empty output', async () => {
    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'not json at all' } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'some prompt',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toEqual([]);
    expect(output.candidateLabwares).toEqual([]);
    expect(output.unresolvedRefs).toEqual([]);
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'ai_precompile',
      severity: 'warning',
      code: 'ai_precompile_parse_error',
    });
    expect(result.diagnostics![0].message).toContain('LLM response was not valid JSON');
  });

  it('preserves partial protocolIntent from LLM JSON as a normalized pre-lowering plan', async () => {
    const llmOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      protocolIntent: {
        intentId: 'fire-assay',
        steps: [{ id: 'step-1', index: 1, text: 'Place a 96 well TC-coated plate on deck slot D.' }],
        resources: {
          labwareInstances: [
            {
              id: 'plate_D',
              labwareHint: '96 well TC-coated plate',
              deckSlot: 'D',
              initialOrientation: 'landscape',
            },
          ],
          materialDefinitions: [],
        },
        operations: [
          { id: 'op-place-plate', kind: 'place_labware', labware: 'plate_D' },
        ],
      },
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(llmOutput) } }],
      }),
    } as unknown as LlmClient;

    const pass = createAiPrecompilePass({ llmClient: mockLlmClient });
    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: {
        input: { prompt: 'Place a 96 well TC-coated plate on deck slot D.', attachments: [] },
        context: {},
        meta: {},
        outputs: new Map(),
        diagnostics: [],
      },
    });

    const output = result.output as AiPrecompileOutput;
    expect(output.protocolIntent).toMatchObject({
      kind: PROTOCOL_INTENT_KIND,
      version: PROTOCOL_INTENT_VERSION,
      intentId: 'fire-assay',
      resources: {
        labwareInstances: [{ id: 'plate_D', deckSlot: 'D' }],
        materialDefinitions: [],
        materialFormulations: [],
        materialAliquots: [],
        pipettes: [],
        tips: [],
        waste: [],
      },
      operations: [{ id: 'op-place-plate', kind: 'place_labware' }],
      patterns: [],
      assumptions: [],
      unresolved: [],
    });
    expect(output.candidateEvents).toEqual([]);
  });

  it('missing upstream entities is tolerated (treated as [])', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'transfer', volume: '100uL' }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: {
        prompt: 'transfer 100uL',
        attachments: [],
      },
      context: {},
      meta: {},
      outputs: new Map(), // No extract_entities output
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    expect(result.output).toBeDefined();
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'transfer', volume: '100uL' });
    expect(mockLlmClient.complete).toHaveBeenCalledTimes(1);
  });

  it('lowers LLM candidateActions into compiler candidateEvents while preserving action tags', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateActions: [
        {
          phrase: 'Add 100 uL wash buffer to each well',
          verb: 'add',
          object: 'wash buffer',
          amount: '100 uL',
          target: 'each well',
          section: 'protocol_steps',
        },
        {
          phrase: 'Incubate for 5 min at room temperature',
          verb: 'incubate',
          duration: '5 min',
          temperature: 'room temperature',
          section: 'protocol_steps',
        },
      ],
      taggedPhrases: [
        { phrase: 'Add', tag: 'verb', value: 'add' },
        { phrase: '100 uL', tag: 'quantity', value: '100 uL' },
      ],
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const pass = createAiPrecompilePass({ llmClient: mockLlmClient });
    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: {
        input: { prompt: 'Add 100 uL wash buffer to each well. Incubate for 5 min.', attachments: [] },
        context: {},
        meta: {},
        outputs: new Map(),
        diagnostics: [],
      },
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateActions).toHaveLength(2);
    expect(output.taggedPhrases).toHaveLength(2);
    expect(output.candidateEvents).toHaveLength(2);
    expect(output.candidateEvents[0]).toMatchObject({
      verb: 'add_material',
      source: 'llm_candidate_action',
      phrase: 'Add 100 uL wash buffer to each well',
      material: 'wash buffer',
      volume: '100 uL',
      target: 'each well',
    });
    expect(output.candidateEvents[1]).toMatchObject({
      verb: 'incubate',
      source: 'llm_candidate_action',
      duration: '5 min',
      temperature: 'room temperature',
    });
  });

  it('directives round-trip: mock LLM emits a reorient_labware directive', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      directives: [
        { kind: 'reorient_labware', params: { labwareHint: '96-well plate', orientation: 'portrait' } },
      ],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'turn the plate to portrait', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.directives).toHaveLength(1);
    expect(output.directives![0].kind).toBe('reorient_labware');
    expect(output.directives![0].params).toMatchObject({
      labwareHint: '96-well plate',
      orientation: 'portrait',
    });
  });

  it('downstreamCompileJobs round-trip: mock LLM emits two jobs', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      downstreamCompileJobs: [
        { kind: 'qPCR', description: 'quantitative PCR analysis' },
        { kind: 'GC-MS', description: 'gas chromatography-mass spectrometry' },
      ],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'run qPCR and GC-MS', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.downstreamCompileJobs).toHaveLength(2);
    expect(output.downstreamCompileJobs![0].kind).toBe('qPCR');
    expect(output.downstreamCompileJobs![1].kind).toBe('GC-MS');
  });

  it('patternEvents round-trip: mock LLM emits one quadrant_stamp', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [],
      candidateLabwares: [],
      unresolvedRefs: [],
      patternEvents: [
        {
          pattern: 'quadrant_stamp',
          fromLabwareHint: '96-well plate',
          toLabwareHint: '384-well plate',
          startCol: 1,
          startRow: 'A',
          count: 4,
        },
      ],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'stamp 96-well into quadrants of a 384-well', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.patternEvents).toHaveLength(1);
    expect(output.patternEvents![0].pattern).toBe('quadrant_stamp');
    expect(output.patternEvents![0].fromLabwareHint).toBe('96-well plate');
    expect(output.patternEvents![0].toLabwareHint).toBe('384-well plate');
  });

  it('regression detected: mock LLM emits dense physical-well enumeration', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'add_material', wells: ['B2', 'B3', 'B4', 'B5'] }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'add material to B2 B3 B4 B5', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'add_material', wells: ['B2', 'B3', 'B4', 'B5'] });
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'ai_precompile',
      severity: 'warning',
      code: 'ai_precompile_role_regression',
    });
    expect((result.diagnostics![0] as { message: string }).message).toContain('1 events');
  });

  it('role preferred: mock LLM emits role coordinate — no warning', async () => {
    const expectedOutput: AiPrecompileOutput = {
      candidateEvents: [{ verb: 'add_material', role: 'cell_region' }],
      candidateLabwares: [],
      unresolvedRefs: [],
    };

    const mockLlmClient = {
      complete: vi.fn().mockResolvedValue({
        choices: [{ message: { content: JSON.stringify(expectedOutput) } }],
      }),
    } as unknown as LlmClient;

    const deps: CreateAiPrecompilePassDeps = {
      llmClient: mockLlmClient,
    };

    const pass = createAiPrecompilePass(deps);

    const mockState: PipelineState = {
      input: { prompt: 'add material to cell region', attachments: [] },
      context: {},
      meta: {},
      outputs: new Map(),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'ai_precompile',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as AiPrecompileOutput;
    expect(output.candidateEvents).toHaveLength(1);
    expect(output.candidateEvents[0]).toMatchObject({ verb: 'add_material', role: 'cell_region' });
    expect(result.diagnostics).toBeUndefined();
  });
});

describe('createExpandBiologyVerbsPass', () => {
  it('expands seed and stain verbs to primitive events', () => {
    const pass = createExpandBiologyVerbsPass();
    
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [
            { verb: 'seed', cell_ref: 'HeLa', volume: '100uL' },
            { verb: 'stain', material_name: 'DAPI', volume: '50uL' },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'expand_biology_verbs',
      state: mockState,
    });

    // Result is synchronous
    const syncResult = result as { ok: boolean; output: { events: unknown[] }; diagnostics: unknown[] };
    
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output).toBeDefined();
    const output = syncResult.output as { events: unknown[] };
    expect(output.events).toHaveLength(3); // seed: 1 event, stain: 2 events
    expect(syncResult.diagnostics?.length).toBe(0); // No diagnostics expected
    
    // Verify all event types are valid
    const allowedTypes = ['create_container', 'add_material', 'transfer', 'incubate', 'mix', 'read'];
    for (const event of output.events) {
      const e = event as { event_type: string };
      expect(allowedTypes).toContain(e.event_type);
    }
  });

  it('produces unknown_biology_verb warning for unknown verbs', () => {
    const pass = createExpandBiologyVerbsPass();
    
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [
            { verb: 'unknown_verb', param1: 'value1' },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'expand_biology_verbs',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: { events: unknown[] }; diagnostics: unknown[] };
    
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output).toBeDefined();
    const output = syncResult.output as { events: unknown[] };
    expect(output.events).toHaveLength(0); // Unknown verb is dropped
    
    expect(syncResult.diagnostics).toBeDefined();
    expect(syncResult.diagnostics!.length).toBe(1);
    expect(syncResult.diagnostics![0]).toMatchObject({
      pass_id: 'expand_biology_verbs',
      severity: 'warning',
      code: 'unknown_biology_verb',
    });
    expect((syncResult.diagnostics![0] as { message: string }).message).toContain('unknown_verb');
  });

  it('handles empty candidateEvents gracefully', () => {
    const pass = createExpandBiologyVerbsPass();
    
    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { candidateEvents: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'expand_biology_verbs',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: { events: unknown[] }; diagnostics: unknown[] };
    
    expect(syncResult.ok).toBe(true);
    expect((syncResult.output as { events: unknown[] }).events).toHaveLength(0);
    expect(syncResult.diagnostics?.length).toBe(0);
  });

  it('pass id is expand_biology_verbs and family is expand', () => {
    const pass = createExpandBiologyVerbsPass();
    expect(pass.id).toBe('expand_biology_verbs');
    expect(pass.family).toBe('expand');
  });
});

describe('createFallbackSideEvidenceEventsPass', () => {
  it('emits conservative container and read events from side evidence when candidateEvents are empty', () => {
    const pass = createFallbackSideEvidenceEventsPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [],
          priorLabwareRefs: [
            { hint: 'generic_96_well_plate', kindHint: '96-well plate', contentHint: 'ELISA samples' },
          ],
          downstreamCompileJobs: [
            { kind: 'readout', description: 'ELISA absorbance reading', params: { wavelength_nm: 450 } },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'fallback_side_evidence_events',
      state: mockState,
    }) as { ok: boolean; output: { events: Array<{ event_type: string; details: Record<string, unknown> }> }; diagnostics: unknown[] };

    expect(result.ok).toBe(true);
    expect(result.output.events).toHaveLength(2);
    expect(result.output.events[0]).toMatchObject({
      event_type: 'create_container',
      details: {
        labwareType: 'generic_96_well_plate',
        source: 'ai_precompile_side_evidence',
      },
    });
    expect(result.output.events[1]).toMatchObject({
      event_type: 'read',
      details: {
        readout: 'readout',
        description: 'ELISA absorbance reading',
      },
    });
    expect(result.diagnostics[0]).toMatchObject({
      code: 'fallback_side_evidence_events',
      severity: 'warning',
    });
  });

  it('does not emit fallback events when normal event-producing passes already emitted events', () => {
    const pass = createFallbackSideEvidenceEventsPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [],
          priorLabwareRefs: [{ hint: 'generic_96_well_plate' }],
        }],
        ['mint_materials', {
          events: [{ eventId: 'evt-existing', event_type: 'add_material', details: {} }],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'fallback_side_evidence_events',
      state: mockState,
    }) as { ok: boolean; output: { events: unknown[] }; diagnostics?: unknown[] };

    expect(result.ok).toBe(true);
    expect(result.output.events).toHaveLength(0);
    expect(result.diagnostics?.length ?? 0).toBe(0);
  });

  it('does not emit fallback events when candidateEvents are present', () => {
    const pass = createFallbackSideEvidenceEventsPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateEvents: [{ verb: 'seed', material: 'cells' }],
          priorLabwareRefs: [{ hint: 'generic_96_well_plate' }],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'fallback_side_evidence_events',
      state: mockState,
    }) as { ok: boolean; output: { events: unknown[] } };

    expect(result.ok).toBe(true);
    expect(result.output.events).toHaveLength(0);
  });
});

describe('createLabwareResolvePass', () => {
  it('one match: resolvedLabwares has one entry, no labwareAdditions', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([
      { recordId: 'labware-001', title: '96-well plate' },
    ]);

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateLabwares: [{ hint: '96-well plate', reason: 'mentioned in prompt' }],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.resolvedLabwares).toHaveLength(1);
    expect(output.resolvedLabwares[0]).toMatchObject({
      hint: '96-well plate',
      recordId: 'labware-001',
      title: '96-well plate',
    });
    expect(output.labwareAdditions).toHaveLength(0);
    expect(mockSearchLabwareByHint).toHaveBeenCalledTimes(1);
    expect(mockSearchLabwareByHint).toHaveBeenCalledWith('96-well plate');
  });

  it('zero matches: labwareAdditions has one entry with reason', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateLabwares: [{ hint: 'custom reservoir', reason: 'user needs custom labware' }],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.labwareAdditions).toHaveLength(1);
    expect(output.labwareAdditions[0]).toMatchObject({
      recordId: 'custom reservoir',
      reason: 'user needs custom labware',
    });
    expect(output.resolvedLabwares).toHaveLength(0);
    expect(mockSearchLabwareByHint).toHaveBeenCalledTimes(1);
    expect(mockSearchLabwareByHint).toHaveBeenCalledWith('custom reservoir');
  });

  it('includes labware candidates lowered from ProtocolIntent resources', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const pass = createLabwareResolvePass({
      searchLabwareByHint: mockSearchLabwareByHint,
    });

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { candidateLabwares: [] }],
        ['lower_protocol_intent', {
          candidateLabwares: [
            { hint: '96 well TC-coated plate', reason: 'ProtocolIntent labware resource plate_D', deckSlot: 'D' },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.labwareAdditions).toEqual([
      {
        recordId: '96 well TC-coated plate',
        reason: 'ProtocolIntent labware resource plate_D',
        deckSlot: 'D',
      },
    ]);
    expect(mockSearchLabwareByHint).toHaveBeenCalledWith('96 well TC-coated plate');
  });

  it('zero matches without reason uses default reason', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateLabwares: [{ hint: 'new plate' }],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.labwareAdditions).toHaveLength(1);
    expect(output.labwareAdditions[0]).toMatchObject({
      recordId: 'new plate',
      reason: 'proposed from prompt',
    });
  });

  it('multi-match: resolvedLabwares has top match, emits ambiguous_labware_hint diagnostic', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([
      { recordId: 'labware-001', title: '96-well plate A' },
      { recordId: 'labware-002', title: '96-well plate B' },
      { recordId: 'labware-003', title: '96-well plate C' },
    ]);

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateLabwares: [{ hint: '96-well plate', reason: 'mentioned in prompt' }],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.resolvedLabwares).toHaveLength(1);
    expect(output.resolvedLabwares[0]).toMatchObject({
      hint: '96-well plate',
      recordId: 'labware-001',
      title: '96-well plate A',
    });
    expect(output.labwareAdditions).toHaveLength(0);
    
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.length).toBe(1);
    expect(result.diagnostics![0]).toMatchObject({
      pass_id: 'resolve_labware',
      severity: 'info',
      code: 'ambiguous_labware_hint',
    });
    expect((result.diagnostics![0] as { message: string }).message).toContain('96-well plate');
    expect((result.diagnostics![0] as { message: string }).message).toContain('96-well plate A');
    
    const details = (result.diagnostics![0] as { details: unknown }).details as {
      hint: string;
      chosen: { recordId: string; title: string };
      alternatives: Array<{ recordId: string; title: string }>;
    };
    expect(details.hint).toBe('96-well plate');
    expect(details.chosen.recordId).toBe('labware-001');
    expect(details.alternatives).toHaveLength(2);
  });

  it('pass id is resolve_labware and family is disambiguate', () => {
    const pass = createLabwareResolvePass({
      searchLabwareByHint: vi.fn(),
    });
    expect(pass.id).toBe('resolve_labware');
    expect(pass.family).toBe('disambiguate');
  });

  it('handles empty candidateLabwares gracefully', async () => {
    const mockSearchLabwareByHint = vi.fn();

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { candidateLabwares: [] }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.resolvedLabwares).toHaveLength(0);
    expect(output.labwareAdditions).toHaveLength(0);
    expect(mockSearchLabwareByHint).not.toHaveBeenCalled();
  });

  it('skips invalid hints (non-string or empty)', async () => {
    const mockSearchLabwareByHint = vi.fn().mockResolvedValue([]);

    const deps: CreateLabwareResolvePassDeps = {
      searchLabwareByHint: mockSearchLabwareByHint,
    };

    const pass = createLabwareResolvePass(deps);

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          candidateLabwares: [
            { hint: 'valid plate', reason: 'needs it' },
            { hint: '', reason: 'empty hint' },
            { hint: 123 as unknown as string, reason: 'invalid hint' },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = await pass.run({
      pass_id: 'resolve_labware',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as LabwareResolveOutput;
    expect(output.resolvedLabwares).toHaveLength(0);
    expect(output.labwareAdditions).toHaveLength(1); // Only the valid hint
    expect(mockSearchLabwareByHint).toHaveBeenCalledTimes(1);
    expect(mockSearchLabwareByHint).toHaveBeenCalledWith('valid plate');
  });
});

// ---------------------------------------------------------------------------
// createMintMaterialsPass tests
// ---------------------------------------------------------------------------

describe('createMintMaterialsPass', () => {
  it('empty mintMaterials produces empty events', () => {
    const pass = createMintMaterialsPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.events).toHaveLength(0);
  });

  it('no mintMaterials field produces empty events', () => {
    const pass = createMintMaterialsPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {}],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.events).toHaveLength(0);
  });

  it('96 samples minted produces 1 create_container + 96 add_material events', () => {
    const pass = createMintMaterialsPass();

    const directive: MintMaterialsDirective = {
      template: 'fecal-sample',
      count: 96,
      namingPattern: 'FS_{n}',
      placementLabwareHint: '96-well-deepwell-plate',
      wellSpread: 'all',
    };

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [directive] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    const events = syncResult.output.events;
    expect(events).toHaveLength(97); // 1 create_container + 96 add_material

    // Verify create_container
    const createContainerEvents = events.filter(
      (e) => (e as { event_type: string }).event_type === 'create_container',
    );
    expect(createContainerEvents).toHaveLength(1);
    expect(createContainerEvents[0].event_type).toBe('create_container');
    expect(createContainerEvents[0].details).toMatchObject({
      labwareType: '96-well-deepwell-plate',
    });

    // Verify add_material events
    const addMaterialEvents = events.filter(
      (e) => (e as { event_type: string }).event_type === 'add_material',
    );
    expect(addMaterialEvents).toHaveLength(96);

    // Verify materialIds are FS_1 through FS_96
    const materialIds = addMaterialEvents.map(
      (e) => (e as { details: { material: { materialId: string } } }).details.material.materialId,
    );
    for (let i = 1; i <= 96; i++) {
      expect(materialIds).toContain(`FS_${i}`);
    }

    // Verify destination wells cover A1..H12
    const wells = new Set(
      addMaterialEvents.map(
        (e) => (e as { details: { well: string } }).details.well,
      ),
    );
    const expectedWells = new Set<string>();
    for (let row = 0; row < 8; row++) {
      for (let col = 1; col <= 12; col++) {
        expectedWells.add(`${String.fromCharCode(65 + row)}${col}`);
      }
    }
    expect(wells).toEqual(expectedWells);
  });

  it('pass id is mint_materials and family is expand', () => {
    const pass = createMintMaterialsPass();
    expect(pass.id).toBe('mint_materials');
    expect(pass.family).toBe('expand');
  });

  // -----------------------------------------------------------------------
  // spec-030: Generalized mint_materials tests
  // -----------------------------------------------------------------------

  it('two directives produce combined events from both', () => {
    const pass = createMintMaterialsPass();

    const directiveA: MintMaterialsDirective = {
      template: 'fecal-sample',
      count: 8,
      namingPattern: 'FS_{n}',
      placementLabwareHint: '96-well-deepwell-plate',
      wellSpread: 'all',
    };
    const directiveB: MintMaterialsDirective = {
      template: 'buffer',
      count: 8,
      namingPattern: 'BF_{n}',
      placementLabwareHint: '96-well-deepwell-plate',
      wellSpread: 'all',
    };

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [directiveA, directiveB] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    const events = syncResult.output.events;

    // 1 create_container (deduplicated by hint) + 8 + 8 add_material = 17
    expect(events).toHaveLength(17);

    const createContainers = events.filter(
      (e) => (e as { event_type: string }).event_type === 'create_container',
    );
    expect(createContainers).toHaveLength(1);

    const addMaterials = events.filter(
      (e) => (e as { event_type: string }).event_type === 'add_material',
    );
    expect(addMaterials).toHaveLength(16);

    // Verify materialIds from both directives
    const materialIds = addMaterials.map(
      (e) => (e as { details: { material: { materialId: string } } }).details.material.materialId,
    );
    for (let i = 1; i <= 8; i++) {
      expect(materialIds).toContain(`FS_${i}`);
      expect(materialIds).toContain(`BF_${i}`);
    }
  });

  it('reusing existing labware produces zero create_container events', () => {
    const pass = createMintMaterialsPass();

    const directive: MintMaterialsDirective = {
      template: 'fecal-sample',
      count: 8,
      namingPattern: 'FS_{n}',
      placementLabwareHint: '96-well-deepwell-plate',
      wellSpread: 'all',
    };

    // Prior labState already has a 96-well-deepwell-plate named 'plate-1'
    const mockState: PipelineState = {
      input: {
        labState: {
          deck: [{ slot: 'target', labwareInstanceId: 'plate-1' }],
          mountedPipettes: [],
          labware: {
            'plate-1': {
              instanceId: 'plate-1',
              labwareType: '96-well-deepwell-plate',
              slot: 'target',
              orientation: 'landscape',
              wells: {},
            },
          },
          reservoirs: {},
          mintCounter: 0,
          turnIndex: 0,
        },
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [directive] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    const events = syncResult.output.events;

    // Zero create_container — labware already exists
    const createContainers = events.filter(
      (e) => (e as { event_type: string }).event_type === 'create_container',
    );
    expect(createContainers).toHaveLength(0);

    // 8 add_material events targeting the existing instance
    const addMaterials = events.filter(
      (e) => (e as { event_type: string }).event_type === 'add_material',
    );
    expect(addMaterials).toHaveLength(8);

    // Verify all add_material events target 'plate-1'
    for (const e of addMaterials) {
      expect((e as { details: { labwareInstanceId: string } }).details.labwareInstanceId).toBe('plate-1');
    }
  });

  it('wellSpread explicit with wellList places into exact wells', () => {
    const pass = createMintMaterialsPass();

    const directive: MintMaterialsDirective = {
      template: 'reagent',
      count: 3,
      namingPattern: 'RG_{n}',
      placementLabwareHint: '96-well-plate',
      wellSpread: 'explicit',
      wellList: ['A1', 'B5', 'G12'],
    };

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [directive] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: MintMaterialsPassOutput };
    expect(syncResult.ok).toBe(true);
    const events = syncResult.output.events;

    // 1 create_container + 3 add_material = 4
    expect(events).toHaveLength(4);

    const addMaterials = events.filter(
      (e) => (e as { event_type: string }).event_type === 'add_material',
    );
    expect(addMaterials).toHaveLength(3);

    // Verify exact well placement
    const wells = addMaterials.map(
      (e) => (e as { details: { well: string } }).details.well,
    );
    expect(wells).toEqual(['A1', 'B5', 'G12']);

    // Verify materialIds
    const materialIds = addMaterials.map(
      (e) => (e as { details: { material: { materialId: string } } }).details.material.materialId,
    );
    expect(materialIds).toEqual(['RG_1', 'RG_2', 'RG_3']);
  });

  it('name collision appends suffix and emits warning diagnostic', () => {
    const pass = createMintMaterialsPass();

    const directive: MintMaterialsDirective = {
      template: 'fecal-sample',
      count: 96,
      namingPattern: 'FS_{n}',
      placementLabwareHint: '96-well-deepwell-plate',
      wellSpread: 'all',
    };

    // Prior labState has materialId='FS_1' in well A1
    const mockState: PipelineState = {
      input: {
        labState: {
          deck: [{ slot: 'target', labwareInstanceId: 'plate-1' }],
          mountedPipettes: [],
          labware: {
            'plate-1': {
              instanceId: 'plate-1',
              labwareType: '96-well-deepwell-plate',
              slot: 'target',
              orientation: 'landscape',
              wells: {
                A1: [
                  { materialId: 'FS_1', kind: 'fecal-sample' },
                ],
              },
            },
          },
          reservoirs: {},
          mintCounter: 0,
          turnIndex: 0,
        },
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { mintMaterials: [directive] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'mint_materials',
      state: mockState,
    });

    const syncResult = result as {
      ok: boolean;
      output: MintMaterialsPassOutput;
      diagnostics: PassDiagnostic[] | undefined;
    };
    expect(syncResult.ok).toBe(true);

    // First emitted event should use disambiguated name
    const addMaterials = syncResult.output.events.filter(
      (e) => (e as { event_type: string }).event_type === 'add_material',
    );
    expect(addMaterials).toHaveLength(96);

    // First materialId should be FS_1_2 (since FS_1 already exists)
    const firstMaterialId = (addMaterials[0] as { details: { material: { materialId: string } } }).details.material.materialId;
    expect(firstMaterialId).toBe('FS_1_2');

    // Should have a warning diagnostic
    expect(syncResult.diagnostics).toBeDefined();
    expect(syncResult.diagnostics!.length).toBeGreaterThanOrEqual(1);
    const collisionDiag = syncResult.diagnostics!.find(
      d => d.code === 'mint_materials_name_collision',
    );
    expect(collisionDiag).toBeDefined();
    expect(collisionDiag!.severity).toBe('warning');
    expect(collisionDiag!.pass_id).toBe('mint_materials');
  });
});

// ---------------------------------------------------------------------------
// createApplyDirectivesPass tests
// ---------------------------------------------------------------------------

describe('createApplyDirectivesPass', () => {
  it('input directive [{kind: reorient_labware}] produces 1 DirectiveNode with generated id', () => {
    const pass = createApplyDirectivesPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          directives: [
            { kind: 'reorient_labware', params: { labwareHint: '96-well plate', orientation: 'portrait' } },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'apply_directives',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: ApplyDirectivesPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.directives).toHaveLength(1);
    expect(syncResult.output.directives[0]).toMatchObject({
      directiveId: 'dir_1',
      kind: 'reorient_labware',
      params: { labwareHint: '96-well plate', orientation: 'portrait' },
    });
  });

  it('multiple directives produce multiple DirectiveNodes with sequential ids', () => {
    const pass = createApplyDirectivesPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {
          directives: [
            { kind: 'reorient_labware', params: { labwareInstanceId: 'plate-1', orientation: 'portrait' } },
            { kind: 'mount_pipette', params: { mountSide: 'left', pipetteType: 'p1000Single' } },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'apply_directives',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: ApplyDirectivesPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.directives).toHaveLength(2);
    expect(syncResult.output.directives[0]!.directiveId).toBe('dir_1');
    expect(syncResult.output.directives[1]!.directiveId).toBe('dir_2');
  });

  it('includes directives lowered from ProtocolIntent operations', () => {
    const pass = createApplyDirectivesPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { directives: [] }],
        ['lower_protocol_intent', {
          directives: [
            { kind: 'reorient_labware', params: { labwareInstanceId: 'plate_D', orientation: 'portrait' } },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'apply_directives',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: ApplyDirectivesPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.directives).toEqual([
      {
        directiveId: 'dir_1',
        kind: 'reorient_labware',
        params: { labwareInstanceId: 'plate_D', orientation: 'portrait' },
      },
    ]);
  });

  it('empty directives produces empty array', () => {
    const pass = createApplyDirectivesPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', { directives: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'apply_directives',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: ApplyDirectivesPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.directives).toHaveLength(0);
  });

  it('no directives field produces empty array', () => {
    const pass = createApplyDirectivesPass();

    const mockState: PipelineState = {
      input: {},
      context: {},
      meta: {},
      outputs: new Map([
        ['ai_precompile', {}],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'apply_directives',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: ApplyDirectivesPassOutput };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.directives).toHaveLength(0);
  });

  it('pass id is apply_directives and family is expand', () => {
    const pass = createApplyDirectivesPass();
    expect(pass.id).toBe('apply_directives');
    expect(pass.family).toBe('expand');
  });
});

// ---------------------------------------------------------------------------
// lab_state pass — fold order tests
// ---------------------------------------------------------------------------

describe('createLabStatePass — fold order', () => {
  it('reorients labware then places materials according to new orientation', () => {
    const pass = createLabStatePass();

    const mockState: PipelineState = {
      input: {
        labState: {
          deck: [],
          mountedPipettes: [],
          labware: {
            'plate-1': {
              instanceId: 'plate-1',
              labwareType: '96-well-plate',
              slot: 'A1',
              orientation: 'landscape',
              wells: {},
            },
          },
          reservoirs: {},
          mintCounter: 0,
          turnIndex: 0,
        },
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['apply_directives', {
          directives: [
            {
              directiveId: 'dir_1',
              kind: 'reorient_labware',
              params: { labwareInstanceId: 'plate-1', orientation: 'portrait' },
            },
          ],
        }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'lab_state',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: { events: unknown[]; snapshotAfter: unknown } };
    expect(syncResult.ok).toBe(true);
    const output = syncResult.output as { snapshotAfter: { labware: Record<string, { orientation: string }> } };
    // After folding directives, orientation should be 'portrait'
    expect(output.snapshotAfter.labware['plate-1'].orientation).toBe('portrait');
    // turnIndex should be incremented
    expect(output.snapshotAfter.turnIndex).toBe(1);
  });

  it('empty directives and events produces snapshot with incremented turnIndex', () => {
    const pass = createLabStatePass();

    const mockState: PipelineState = {
      input: {
        labState: {
          deck: [],
          mountedPipettes: [],
          labware: {},
          reservoirs: {},
          mintCounter: 0,
          turnIndex: 0,
        },
      },
      context: {},
      meta: {},
      outputs: new Map([
        ['mint_materials', { events: [] }],
        ['expand_biology_verbs', { events: [] }],
        ['apply_directives', { directives: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'lab_state',
      state: mockState,
    });

    const syncResult = result as { ok: boolean; output: { snapshotAfter: { turnIndex: number } } };
    expect(syncResult.ok).toBe(true);
    expect(syncResult.output.snapshotAfter.turnIndex).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// lab_state pass — L2-LABSTATE-CONTENTS-1 legs (spec §5.2/§7)
// ---------------------------------------------------------------------------

/** Build the pass's mockState for the lab_state pass: the prior snapshot + the
 *  resolve_roles events the pass folds (the REAL expander output — the
 *  canonical-shape proof at the pass seam, never a hand-crafted shape). */
function labStatePassState(
  prior: LabStateSnapshot,
  events: PlateEventPrimitive[],
): PipelineState {
  return {
    input: { labState: prior },
    context: {},
    meta: {},
    outputs: new Map([
      ['resolve_roles', { events }],
      ['apply_directives', { directives: [] }],
    ]),
    diagnostics: [],
  };
}

/** A prior snapshot holding ONE 96-well plate (hand-built — the expander does
 *  not mint instanceIds; the fold's create handler does). The labwareId the
 *  symbolic add-material events carry is the plate TYPE token — the rung R3
 *  (unique declared labwareType) resolution the OQ-3 ratified live winner. */
function singlePlateSnapshot(): LabStateSnapshot {
  return {
    deck: [{ slot: 'A1', labwareInstanceId: 'PLATE-A' }],
    mountedPipettes: [],
    labware: {
      'PLATE-A': {
        instanceId: 'PLATE-A',
        labwareType: '96-well-plate',
        slot: 'A1',
        orientation: 'landscape',
        wells: {},
      },
    },
    reservoirs: {},
    mintCounter: 1,
    turnIndex: 0,
  };
}

describe('createLabStatePass — L2-LABSTATE-CONTENTS-1 (the canonical shape at the pass seam)', () => {
  it('threads the DATA rules: a REAL addMaterialExpander symbolic event writes contents (unique declared type, the OQ-3 live winner)', () => {
    const pass = createLabStatePass();
    const prior = singlePlateSnapshot();
    const instanceId = Object.keys(prior.labware)[0]!;
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: '96-well-plate', wells: 'A1..H1', material: 'A', volume_uL: 100 },
    });
    const result = pass.run({ pass_id: 'lab_state', state: labStatePassState(prior, events) });
    const out = result as { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // The 8 per-well events (the expander pre-expands the range string) all
    // folded onto the single instance via the DATA-declared rung — contents
    // are in the ledger (the dead-write the ruling names is gone).
    const wells = out.output.snapshotAfter.labware[instanceId]!.wells;
    const addWells = Object.keys(wells);
    expect(addWells).toHaveLength(8);
    for (const w of addWells) {
      expect(wells[w]![0]!.materialId).toBe('A'); // the verbatim string material (no invented id)
      expect(wells[w]![0]!.kind).toBe('A');
    }
    // A successful write => NO diagnostic (the never-guess surface only fires
    // on a no-op).
    expect(out.diagnostics ?? []).toHaveLength(0);
  });

  it('unknown plate (the control turn): no-op fold + a lab_state_unresolved_labware_reference diagnostic, NO contents (never-guess)', () => {
    const pass = createLabStatePass();
    const prior = singlePlateSnapshot();
    const instanceId = Object.keys(prior.labware)[0]!;
    const events = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: 'a-plate-that-was-never-placed', wells: 'A1..H1', material: 'X', volume_uL: 100 },
    });
    const result = pass.run({ pass_id: 'lab_state', state: labStatePassState(prior, events) });
    const out = result as { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // No contents written (the snapshot's labware is unchanged in its wells).
    expect(Object.keys(out.output.snapshotAfter.labware)).toEqual([instanceId]);
    expect(Object.keys(out.output.snapshotAfter.labware[instanceId]!.wells)).toHaveLength(0);
    // The 8 no-op events each surface the §7 never-guess diagnostic (the fold
    // is pure — the reporting rides the pass).
    const diags = out.diagnostics ?? [];
    expect(diags).toHaveLength(8);
    for (const d of diags) {
      expect(d.code).toBe('lab_state_unresolved_labware_reference');
      expect(d.severity).toBe('warning');
      expect(d.details).toMatchObject({ reason: 'labware_unresolved' });
      expect((d.details as { hint: string }).hint).toBe('a-plate-that-was-never-placed');
      expect((d.details as { event_type: string }).event_type).toBe('add_material');
    }
  });

  // D1 (advc fix-run 1, Mutant 4 class) at the PASS seam: the REAL
  // transferExpander destination-only output (no source_labware; top-level
  // labwareId = the TARGET) must fold to a labware_unresolved no-op + the
  // §7 diagnostic — and must NOT self-transfer inside the destination
  // plate. The pass's content-bearing test (DATA list + declared source
  // carrier) surfaces this shape as a diagnostic, so the wrong write is
  // visible (pre-fix the fold wrote silently AND the classifier returned
  // false, so no diagnostic existed at all).
  it('transfer destination-only (real expander, no source_labware): no-op + lab_state_unresolved_labware_reference diagnostic, NO write (D1)', () => {
    const pass = createLabStatePass();
    const prior = singlePlateSnapshot();
    const instanceId = Object.keys(prior.labware)[0]!;
    // Seed the destination plate's A1 so a self-transfer would be visible.
    const seeded = applyEventToLabState(prior, {
      eventId: 'evt-seed-d1-pass',
      event_type: 'add_material',
      details: {
        labwareInstanceId: instanceId,
        well: 'A1',
        material: { materialId: 'mat-seed', kind: 'seed', volumeUl: 100 },
      },
    });
    const events = transferExpander.expand({
      verb: 'transfer',
      params: { labware: '96-well-plate', source_well: 'A1', well: 'B1', volume_uL: 40 },
    });
    expect(events).toHaveLength(1);
    const d = events[0]!.details as Record<string, unknown>;
    expect(d.source_labware).toBeUndefined();
    expect(d.destination_labware).toBe('96-well-plate');
    expect(events[0]!.labwareId).toBe('96-well-plate');

    const result = pass.run({ pass_id: 'lab_state', state: labStatePassState(seeded, events) });
    const out = result as { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // NO write: A1 unchanged (100), B1 absent (no self-transfer A1->B1).
    const wells = out.output.snapshotAfter.labware[instanceId]!.wells;
    expect(wells['A1']).toEqual([{ materialId: 'mat-seed', kind: 'seed', volumeUl: 100 }]);
    expect(wells['B1']).toBeUndefined();
    // The §7 never-guess diagnostic (content-bearing transfer with an
    // unresolvable SOURCE side).
    const diags = out.diagnostics ?? [];
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('lab_state_unresolved_labware_reference');
    expect(diags[0]!.severity).toBe('warning');
    expect((diags[0]!.details as { reason: string }).reason).toBe('labware_unresolved');
  });

  it('absent DATA section (injected vocabulary) fails CLOSED to rung R1 ONLY: symbolic no-op + diagnostic, raw labwareInstanceId still writes', () => {
    // The fail-closed arm: a vocabulary whose labwareIdentityResolution section
    // is ABSENT => the loader returns the empty lists => the fold resolves rung
    // R1 ONLY (the raw instanceId path) — D5: an EMPTY `order` is treated
    // exactly as absent rules, so an absent section and a 2-arg fold call are
    // identical (the pre-fix fold ran ZERO rungs for an empty order — not even
    // R1 — contradicting the R1-only doc claim).
    const emptyResolution = () => ({ order: [] as readonly string[], tokenFields: [] as readonly string[] });
    const stubVocab = {
      labwareIdentityResolution: emptyResolution,
      labStateContentBearingEventTypes: () => ['add_material', 'transfer'] as readonly string[],
    } as unknown as NonNullable<Parameters<typeof createLabStatePass>[0]>['vocabulary'];
    const pass = createLabStatePass({ vocabulary: stubVocab });
    const prior = singlePlateSnapshot();
    const instanceId = Object.keys(prior.labware)[0]!;

    // (a) the symbolic (shipped) shape: R1 misses ('96-well-plate' is not an
    // instanceId) => no-op + the §7 diagnostic.
    const symbolic = addMaterialExpander.expand({
      verb: 'add_material',
      params: { labware: '96-well-plate', well: 'A1', material: 'A', volume_uL: 100 },
    });
    const r1 = pass.run({ pass_id: 'lab_state', state: labStatePassState(prior, symbolic) }) as
      { output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(Object.keys(r1.output.snapshotAfter.labware[instanceId]!.wells)).toHaveLength(0);
    expect(r1.diagnostics ?? []).toHaveLength(1);
    expect(r1.diagnostics![0]!.code).toBe('lab_state_unresolved_labware_reference');

    // (b) the RAW path (details.labwareInstanceId) still writes — the R1 rung
    // is always present, so the raw byte-stable contract is intact.
    const rawEvent: PlateEventPrimitive = {
      eventId: 'raw-1',
      event_type: 'add_material',
      details: {
        labwareInstanceId: instanceId,
        well: 'A1',
        material: 'RAW',
        volumeUl: 50,
      },
    };
    const r2 = pass.run({ pass_id: 'lab_state', state: labStatePassState(prior, [rawEvent]) }) as
      { output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(r2.output.snapshotAfter.labware[instanceId]!.wells['A1']![0]!.materialId).toBe('RAW');
    expect(r2.diagnostics ?? []).toHaveLength(0);
  });

  // D5 (advc fix-run 1): the R1-DEFAULT semantics for an empty `order`,
  // proven at the PASS seam — a symbolic hint that EQUALS an instanceId
  // resolves through rung R1 (a write, no diagnostic) even when the
  // vocabulary's section is absent (empty lists). The pre-fix pass path ran
  // ZERO rungs for an empty order, so this shape no-op'd while the 2-arg
  // fold call resolved it — code and docs now agree on R1-ONLY.
  it('absent DATA section: a symbolic hint that EQUALS an instanceId still resolves via rung R1 (the R1 default — the pre-fix gap is gone)', () => {
    const emptyResolution = () => ({ order: [] as readonly string[], tokenFields: [] as readonly string[] });
    const stubVocab = {
      labwareIdentityResolution: emptyResolution,
      labStateContentBearingEventTypes: () => ['add_material', 'transfer'] as readonly string[],
    } as unknown as NonNullable<Parameters<typeof createLabStatePass>[0]>['vocabulary'];
    const pass = createLabStatePass({ vocabulary: stubVocab });
    const prior = singlePlateSnapshot();
    const instanceId = Object.keys(prior.labware)[0]!;
    // The shipped shape with a hint that IS the instanceId (R1 rung).
    const ev: PlateEventPrimitive = {
      eventId: 'evt-r1-hint',
      event_type: 'add_material',
      labwareId: instanceId,
      details: {
        well: 'C1',
        material: 'A',
        volumeUl: 10,
      },
    };
    const r = pass.run({ pass_id: 'lab_state', state: labStatePassState(prior, [ev]) }) as
      { output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    // R1 resolves the hint to the instance: contents land, no diagnostic.
    expect(r.output.snapshotAfter.labware[instanceId]!.wells['C1']).toEqual([
      { materialId: 'A', kind: 'A', volumeUl: 10 },
    ]);
    expect(r.diagnostics ?? []).toHaveLength(0);
  });

  // ==========================================================================
  // L2-LABSTATE-CONTENTS-1 FIX RUN 3 — the REAL emit site (the pass's (a)
  // carrier) + the RED→GREEN repeat-create leg (the (b) idempotent reuse) at
  // the PASS seam. The legs are byte-shaped on the receipt wire shapes: a
  // create WITHOUT a carrier + a design-ref add_material (hint = the design's
  // resolved record id), with the resolve_labware slot carrying the resolved
  // design identity (recordId). The assertion is on the PASS OUTPUT for a
  // fixture whose resolvedLabwares carry a recordId — NEVER on a string literal
  // of the seed id (the recordId is derived from the pass's resolved output).
  // ==========================================================================
  it('fix3 (a) emit-site: a create whose resolvedLabwares carry a recordId ships details.labwareId = that recordId (the mint identityTokens carrier), and the R2 rung then EXACTLY matches a design-ref hint (ONE match)', () => {
    const pass = createLabStatePass();
    // The prior as the live drive commits it AFTER turn A: ONE 96-well plate
    // whose identityTokens carry the design's resolved recordId (turn A's
    // create carried the (a) emit-carrier, so the mint left the token). This
    // is the post-turn-A committed state the drive's turn 1 reads.
    const base = singlePlateSnapshot();
    const instanceId = Object.keys(base.labware)[0]!;
    const prior: LabStateSnapshot = {
      ...base,
      labware: {
        [instanceId]: { ...base.labware[instanceId]!, identityTokens: ['lbw-design-record'] },
      },
    };
    // The REAL expander output: a create (NO carrier — the shipped shape) + a
    // design-ref add_material (the hint is the design's resolved RECORD ID, not
    // the type token — what the live binder puts on the add).
    const createEv = {
      eventId: 'evt-create-fix3',
      event_type: 'create_container' as const,
      details: { slot: 'target', labwareType: '96-well-plate' },
    };
    const addEv = {
      eventId: 'evt-add-fix3',
      event_type: 'add_material' as const,
      labwareId: 'lbw-design-record',
      details: { well: 'A1', material: 'bead', labwareId: 'lbw-design-record', wells: ['A1'] },
    };
    // The resolve_labware slot carries the resolved DESIGN identity (the
    // recordId the compiler resolved — NOT a seed literal). The pass's (a)
    // carries it onto the create's details.labwareId (the mint's identityTokens
    // carrier), so the instance carries the token and the design-ref add
    // resolves via R2 (EXACTLY one match).
    const state = {
      input: { labState: prior },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [createEv, addEv] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-record', title: 'Generic 96 (test)' }] }],
      ]),
      diagnostics: [],
    };
    const out = pass.run({ pass_id: 'lab_state', state }) as
      { ok: boolean; output: { events: PlateEventPrimitive[]; snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // (a) THE EMIT SITE: the create the pass folded carries the resolved
    // recordId on details.labwareId (derived from the pass's resolvedLabwares
    // output, never a literal). The wire done-frame events (resolve_roles slot)
    // are untouched; this is the labStateDelta.events artifact.
    const foldedCreate = out.output.events.find((e) => e.event_type === 'create_container')!;
    const d = foldedCreate.details as Record<string, unknown>;
    expect(d.labwareId).toBe('lbw-design-record'); // the resolved recordId, NOT the seed literal
    // (b) IDEMPOTENT CREATE: the re-emitted create (carrier = the recordId)
    // resolves to the EXISTING prior instance (R2 exact — the instance's
    // identityTokens carry the token) => REUSE, no re-mint.
    expect(Object.keys(out.output.snapshotAfter.labware)).toEqual([instanceId]);
    expect(out.output.snapshotAfter.labware[instanceId]!.identityTokens).toEqual(['lbw-design-record']);
    // The design-ref add resolves via R2 (the instance's identityTokens carry
    // the token) to the SAME instance and writes A1 (ONE match — no tie).
    expect(Object.keys(out.output.snapshotAfter.labware[instanceId]!.wells)).toEqual(['A1']);
    expect(out.output.snapshotAfter.labware[instanceId]!.wells['A1']![0]!.materialId).toBe('bead');
    expect(out.diagnostics ?? []).toHaveLength(0);
  });

  it('fix3 turn-1 shape: 8 wire-shaped design-ref add_material events (A1..H1, top-level+details labwareId = the recordId) all resolve R2 (ONE match) and write the SAME instance — A1..H1 (the drive invariant)', () => {
    const pass = createLabStatePass();
    const base = singlePlateSnapshot();
    const instanceId = Object.keys(base.labware)[0]!;
    const prior: LabStateSnapshot = {
      ...base,
      labware: { [instanceId]: { ...base.labware[instanceId]!, identityTokens: ['lbw-design-record'] } },
    };
    // The SHIPPED wire shape (receipt turn 1): 8 add_material events, one per
    // well A1..H1, each top-level + details labwareId = the design recordId.
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const addEvents: PlateEventPrimitive[] = cols.map((c) => ({
      eventId: `evt-add-${c}1`,
      event_type: 'add_material' as const,
      labwareId: 'lbw-design-record',
      details: { well: `${c}1`, material: 'bead', labwareId: 'lbw-design-record', wells: [`${c}1`] },
    }));
    // The re-emitted create (no carrier) rides the same turn (the live drive
    // re-emits the placement every turn the plate is referenced).
    const createEv: PlateEventPrimitive = { eventId: 'evt-create-t1', event_type: 'create_container' as const, details: { slot: 'target', labwareType: '96-well-plate' } };
    const state = {
      input: { labState: prior },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [createEv, ...addEvents] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-record', title: 'Generic 96 (test)' }] }],
      ]),
      diagnostics: [],
    };
    const out = pass.run({ pass_id: 'lab_state', state }) as
      { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // Idempotent create (b): the re-emitted create reuses the SAME instance
    // (no re-mint) — ONE instance, and it is the prior's.
    expect(Object.keys(out.output.snapshotAfter.labware)).toEqual([instanceId]);
    // All 8 add_material events resolve via R2 (the instance's identityTokens
    // carry the recordId — ONE match, no tie) and write A1..H1 to the SAME
    // instance (the drive invariant: no tie, contents on the placed instance).
    expect(Object.keys(out.output.snapshotAfter.labware[instanceId]!.wells).sort()).toEqual(
      cols.map((c) => `${c}1`).sort(),
    );
    for (const c of cols) {
      expect(out.output.snapshotAfter.labware[instanceId]!.wells[`${c}1`]![0]!.materialId).toBe('bead');
    }
    expect(out.diagnostics ?? []).toHaveLength(0);
  });

  it('fix3 CONTROL (never-guess at the pass seam): a ghost-plate design-ref add (no matching instance/tokens, non-unique type) => no-op + lab_state_unresolved_labware_reference diagnostic; contents NEVER written to the seed plate (the §7 arm-lines>=1 equivalent)', () => {
    const pass = createLabStatePass();
    // A prior with the SEED plate (token lbw-design-record) + a second same-TYPE
    // instance carrying a DIFFERENT token (the ghost plate's own design) — the
    // ghost design-ref hint matches the ghost instance EXACTLY (R2, one match),
    // so it must NOT leak to the seed plate; and a hint matching NO token with a
    // non-unique type no-ops (never-guess). This is the fold's never-guess
    // surface at the pass seam (the live drive's turn X could not reach the
    // fold — see the report's control-leg diagnosis — so the unit leg is the
    // proof the fold never writes the seed plate on an unresolved design-ref).
    const base = singlePlateSnapshot();
    const seedId = Object.keys(base.labware)[0]!;
    const prior: LabStateSnapshot = {
      ...base,
      mintCounter: 2,
      deck: [...base.deck, { slot: 'A2', labwareInstanceId: 'GHOST' }],
      labware: {
        [seedId]: { ...base.labware[seedId]!, identityTokens: ['lbw-design-record'] },
        'GHOST': { instanceId: 'GHOST', labwareType: '96-well-plate', slot: 'A2', orientation: 'landscape', wells: {}, identityTokens: ['lbw-ghost-plate'] },
      },
    };
    // The ghost-plate design-ref add (hint = the ghost record id).
    const ghostAdd: PlateEventPrimitive = {
      eventId: 'evt-add-ghost-pass',
      event_type: 'add_material' as const,
      labwareId: 'lbw-ghost-plate',
      details: { well: 'C1', material: 'x', labwareId: 'lbw-ghost-plate', wells: ['C1'] },
    };
    const state = {
      input: { labState: prior },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [ghostAdd] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-record', title: 'seed' }] }],
      ]),
      diagnostics: [],
    };
    const out = pass.run({ pass_id: 'lab_state', state }) as
      { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(out.ok).toBe(true);
    // The ghost hint EXACTLY matches the GHOST instance (R2, one match) — it
    // writes the ghost plate and NEVER the seed plate.
    expect(Object.keys(out.output.snapshotAfter.labware['GHOST'].wells)).toEqual(['C1']);
    expect(Object.keys(out.output.snapshotAfter.labware[seedId].wells)).toHaveLength(0); // seed plate NEVER written
    expect(out.diagnostics ?? []).toHaveLength(0); // the ghost add resolved (R2 one-match) — no diagnostic
    // The never-guess no-op arm: a design-ref hint matching NO instance token
    // with a non-unique type (two same-type instances) => the fold no-ops and
    // the §7 diagnostic fires (lab_state_unresolved_labware_reference) — the
    // arm-lines>=1 channel the drive's control leg needs. NOTHING is written.
    const mysteryAdd: PlateEventPrimitive = {
      eventId: 'evt-add-mystery-pass',
      event_type: 'add_material' as const,
      labwareId: 'lbw-never-seen',
      details: { well: 'C1', material: 'y', labwareId: 'lbw-never-seen', wells: ['C1'] },
    };
    const mysteryState: PipelineState = {
      ...state,
      outputs: new Map([
        ['resolve_roles', { events: [mysteryAdd] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-record', title: 'seed' }] }],
      ]),
    };
    const outMystery = pass.run({ pass_id: 'lab_state', state: mysteryState }) as
      { ok: boolean; output: { snapshotAfter: LabStateSnapshot }; diagnostics?: PassDiagnostic[] };
    expect(outMystery.ok).toBe(true);
    const diags = outMystery.diagnostics ?? [];
    expect(diags).toHaveLength(1);
    expect(diags[0]!.code).toBe('lab_state_unresolved_labware_reference');
    expect(diags[0]!.severity).toBe('warning');
    expect((diags[0]!.details as { hint: string }).hint).toBe('lbw-never-seen');
    // NOTHING written: no third instance, both plates' wells untouched.
    expect(Object.keys(outMystery.output.snapshotAfter.labware)).toEqual([seedId, 'GHOST']);
    expect(Object.keys(outMystery.output.snapshotAfter.labware[seedId].wells)).toHaveLength(0);
  });

  it('fix3 (a) emit-site is INERT without a resolved recordId: an absent/empty resolve_labware slot leaves the create carrierless (byte-stable, pre-CL)', () => {
    const pass = createLabStatePass();
    const base = singlePlateSnapshot();
    const instanceId = Object.keys(base.labware)[0]!;
    const createEv = { eventId: 'evt-create-inert', event_type: 'create_container' as const, details: { slot: 'target', labwareType: '96-well-plate' } };
    const state = {
      input: { labState: base },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [createEv] }],
        ['apply_directives', { directives: [] }],
      ]),
      diagnostics: [],
    };
    const out = pass.run({ pass_id: 'lab_state', state }) as
      { output: { events: PlateEventPrimitive[]; snapshotAfter: LabStateSnapshot } };
    const foldedCreate = out.output.events.find((e) => e.event_type === 'create_container')!;
    expect((foldedCreate.details as Record<string, unknown>).labwareId).toBeUndefined(); // no carrier (inert)
    // Inert (no resolve_labware slot => no (a) carrier) => the create carries
    // NO identity carrier => the (b) reuse is inert => the base MINT path
    // re-mints (byte-stable pre-CL: every carrierless create re-mints).
    expect(Object.keys(out.output.snapshotAfter.labware)).toHaveLength(2);
    expect(Object.keys(out.output.snapshotAfter.labware)[0]!).toBe(instanceId);
  });

  it('fix3 (b) control (never-guess, no over-reuse): a create whose carrier matches NO existing instance (zero rung) re-mints; two distinct designs on one type stay DISTINCT (R2 exact, not R3 type)', () => {
    const pass = createLabStatePass();
    // A prior with TWO 96-well plates, EACH carrying a DIFFERENT design token
    // (two distinct designs placed on the same type). A create for design A
    // must reuse instance A (R2 exact) and NEVER collapse onto instance B (R3
    // type would tie; R2 exact picks A only).
    const base = singlePlateSnapshot();
    const aId = Object.keys(base.labware)[0]!;
    const prior: LabStateSnapshot = {
      ...base,
      mintCounter: 2,
      deck: [...base.deck, { slot: 'A2', labwareInstanceId: 'PLATE-B' }],
      labware: {
        [aId]: { ...base.labware[aId]!, identityTokens: ['lbw-design-A'] },
        'PLATE-B': { instanceId: 'PLATE-B', labwareType: '96-well-plate', slot: 'A2', orientation: 'landscape', wells: {}, identityTokens: ['lbw-design-B'] },
      },
    };
    // A create for design A (the pass's (a) carrier = the resolved recordId).
    const createEv = { eventId: 'evt-create-ctrl', event_type: 'create_container' as const, details: { slot: 'A1', labwareType: '96-well-plate' } };
    const state = {
      input: { labState: prior },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [createEv] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-A', title: 'design A' }] }],
      ]),
      diagnostics: [],
    };
    const out = pass.run({ pass_id: 'lab_state', state }) as
      { output: { snapshotAfter: LabStateSnapshot } };
    // Design A reuses instance A (R2 exact) — NO third instance, and instance
    // B is untouched (the R2 rung is identity-specific, never a type pick).
    expect(Object.keys(out.output.snapshotAfter.labware)).toEqual([aId, 'PLATE-B']);
    expect(out.output.snapshotAfter.labware[aId]!.identityTokens).toEqual(['lbw-design-A']);
    expect(out.output.snapshotAfter.labware['PLATE-B']!.identityTokens).toEqual(['lbw-design-B']);
    // The ZERO arm: a create for a design NO instance carries (a fresh record
    // id) yields ZERO at every rung => the base mint re-mints (never-guess —
    // no pick among the two same-type instances).
    const stateFresh = {
      input: { labState: prior },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [{ eventId: 'evt-create-fresh', event_type: 'create_container' as const, details: { slot: 'A3', labwareType: '96-well-plate' } }] }],
        ['apply_directives', { directives: [] }],
        ['resolve_labware', { resolvedLabwares: [{ hint: '96-well plate', recordId: 'lbw-design-C', title: 'design C' }] }],
      ]),
      diagnostics: [],
    };
    const outFresh = pass.run({ pass_id: 'lab_state', state: stateFresh }) as
      { output: { snapshotAfter: LabStateSnapshot } };
    expect(Object.keys(outFresh.output.snapshotAfter.labware)).toHaveLength(3); // the fresh design re-mints (zero rung => base mint)
  });
});
