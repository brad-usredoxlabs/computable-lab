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
