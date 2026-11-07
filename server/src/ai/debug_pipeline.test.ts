
import { describe, it, expect, vi } from 'vitest';
import { runChatbotCompile } from './server/src/ai/runChatbotCompile.js';
import type { ExtractionRunnerService, RunExtractionServiceArgs } from './server/src/extract/ExtractionRunnerService.js';
import type { LlmClient } from './server/src/compiler/pipeline/passes/ChatbotCompilePasses.js';
import type { RecordFilter, RecordEnvelope } from './server/src/store/types.js';

vi.mock('./server/src/compiler/resolution/eligibility/policy.js', async () => {
  const actual = await vi.importActual('./server/src/compiler/resolution/eligibility/policy.js');
  return { ...(actual as object), loadMaterialEligibilityIfPresent: () => null };
});

describe('debug', () => {
  it('check pipeline output', async () => {
    const compEntries = [
      { component_ref: { kind: 'record', type: 'material', id: 'SOLUTE-1' }, role: 'solute' },
      { component_ref: { kind: 'record', type: 'material', id: 'SOLVENT-1' }, role: 'solvent' },
    ];
    const matSpec = {
      recordId: 'MAT-RED', kind: 'material-spec',
      schemaId: 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml',
      payload: { formulation: { composition: compEntries } },
    } as RecordEnvelope;
    const mock = { 
      list: vi.fn(async (f: RecordFilter | undefined) => f?.kind === 'material-spec' ? [matSpec] : []),
      get: vi.fn(async () => null),
    };
    const deps = {
      extractionService: { run: vi.fn(async () => ({ target_kind: '', source: '', candidates: [], diagnostics: [] })) } as unknown as ExtractionRunnerService,
      llmClient: { complete: vi.fn(async () => { throw new Error('no LLM'); }) } as unknown as LlmClient,
      searchLabwareByHint: vi.fn(async () => []),
      store: mock,
    };
    const result = await runChatbotCompile({
      prompt: 'Add [[aliquot:MAT-RED|RedMat]] to [[labware:lw-1|Plate]]',
      mentions: [
        { type: 'material', entityKind: 'aliquot', id: 'MAT-RED', label: 'RedMat' },
        { type: 'labware', id: 'lw-1', label: 'Plate' },
      ],
      editorLabwares: [{ labwareId: 'lw-1', labwareType: 'plate_96', name: 'Plate' }],
      deps,
    });
    console.log('=== passOutputs keys ===', Object.keys(result.passOutputs));
    console.log('=== resolve_nouns ===', JSON.stringify(result.passOutputs['resolve_nouns'] ? { resolvedByLabel: result.passOutputs['resolve_nouns'].resolvedByLabel } : 'MISSING', null, 2).slice(0, 1000));
    console.log('=== events ===');
    for (const e of result.events) {
      console.log(JSON.stringify({ event_type: e.event_type, details: e.details }, null, 2).slice(0, 300));
    }
    console.log('=== resolve_roles events ===');
    const rr = result.passOutputs['resolve_roles'];
    if (rr && rr.events) {
      for (const e of rr.events) {
        console.log(JSON.stringify({ event_type: e.event_type, details: e.details }, null, 2).slice(0, 300));
      }
    }
    expect(true).toBe(true);
  });
});
