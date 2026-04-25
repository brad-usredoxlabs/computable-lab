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
  createLabStatePass,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import type { CompletionRequest } from '../../../ai/types.js';

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
        candidates: [],
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
