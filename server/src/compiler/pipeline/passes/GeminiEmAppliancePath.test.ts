import { describe, expect, it } from 'vitest';
import { createDeterministicPrecompilePass, type DeterministicPrecompileDeps } from './DeterministicPrecompilePass.js';
import {
  createDeterministicPlanConsolidationPass,
  createEmitInstrumentApplianceJobsPass,
  createEmitInstrumentRunFilesPass,
  createEvaluateInstrumentExecutionReadinessPass,
  createExpandBiologyVerbsPass,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';

import '../../artifacts/GeminiEmEmitter.js';

function makeMockDeps(): DeterministicPrecompileDeps {
  return {
    verbActionMapRegistry: {
      findVerbForToken: (token: string) => ({
        add: { verb: 'add_material', source: 'canonical' as const },
        read: { verb: 'read', source: 'canonical' as const },
      })[token.toLowerCase()],
    },
    labwareDefinitionRegistry: {
      findByName: (name: string) => (
        name === '96-well plate'
          ? { recordId: 'labware-96-plate' }
          : undefined
      ),
    },
    compoundClassRegistry: { findByName: () => undefined },
    ontologyTermRegistry: { searchLabel: () => [] },
    labwareInstanceLookup: async () => [],
  };
}

function makeState(prompt: string, outputs = new Map<string, unknown>()): PipelineState {
  return {
    input: { prompt },
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

describe('Gemini EM appliance path', () => {
  it('lowers a deterministic prompt into expanded read events, a Gemini EM run file, and an appliance job', async () => {
    const prompt = 'Add a 96-well plate to the target position. Read the target plate on the Gemini EM plate reader in fluorescence mode at 520 nm with 100 ms integration as a simulation.';

    const deterministic = createDeterministicPrecompilePass(makeMockDeps());
    const deterministicResult = await deterministic.run({
      pass_id: 'deterministic_precompile',
      state: makeState(prompt),
    });

    expect(deterministicResult.ok).toBe(true);
    const preConsolidationAiPrecompile = deterministicResult.secondaryOutputs?.ai_precompile;
    expect(preConsolidationAiPrecompile).toEqual(
      expect.objectContaining({
        candidateEvents: [
          expect.objectContaining({ verb: 'add_material', labware_id: 'labware-96-plate' }),
          expect.objectContaining({
            verb: 'read',
            labware_id: 'labware-96-plate',
            instrument: 'Gemini EM plate reader',
            simulate: true,
            mode: 'fluorescence',
            wavelengthNm: 520,
            integrationMs: 100,
          }),
        ],
      }),
    );

    const consolidate = createDeterministicPlanConsolidationPass();
    const consolidateResult = consolidate.run({
      pass_id: 'deterministic_plan_consolidation',
      state: makeState(prompt, new Map([
        ['deterministic_precompile', deterministicResult.output],
      ])),
    });

    expect(consolidateResult.ok).toBe(true);
    const aiPrecompile = consolidateResult.secondaryOutputs?.ai_precompile;
    expect(aiPrecompile).toEqual(
      expect.objectContaining({
        candidateEvents: [
          expect.objectContaining({ verb: 'add_material', labware_id: 'labware-96-plate' }),
          expect.objectContaining({
            verb: 'read',
            labware_id: 'labware-96-plate',
            instrument: 'Gemini EM plate reader',
            simulate: true,
            mode: 'fluorescence',
            wavelengthNm: 520,
            integrationMs: 100,
          }),
        ],
      }),
    );

    const expand = createExpandBiologyVerbsPass();
    const expandResult = expand.run({
      pass_id: 'expand_biology_verbs',
      state: makeState(prompt, new Map([['ai_precompile', aiPrecompile]])),
    });

    expect(expandResult.ok).toBe(true);
    const expanded = expandResult.output as { events: Array<{ event_type: string; details: Record<string, unknown>; labwareId?: string }> };
    expect(expanded.events).toContainEqual(
      expect.objectContaining({
        event_type: 'read',
        details: expect.objectContaining({
          instrument: 'Gemini EM plate reader',
          simulate: true,
          mode: 'fluorescence',
          wavelengthNm: 520,
          integrationMs: 100,
        }),
        labwareId: 'labware-96-plate',
      }),
    );

    const emit = createEmitInstrumentRunFilesPass();
    const emitResult = emit.run({
      pass_id: 'emit_instrument_run_files',
      state: makeState(prompt, new Map([
        ['resolve_roles', expanded],
        ['resolve_references', { resolvedRefs: [] }],
      ])),
    });

    expect(emitResult.ok).toBe(true);
    expect(emitResult.diagnostics).toEqual([]);
    const emitted = emitResult.output as { instrumentRunFiles: Array<{ instrument: string; wells: Array<{ well: string }>; runParameters?: Record<string, unknown> }> };
    expect(emitted.instrumentRunFiles).toHaveLength(1);
    expect(emitted.instrumentRunFiles[0]).toEqual(
      expect.objectContaining({
        instrument: 'Gemini EM plate reader',
        wells: expect.any(Array),
      }),
    );
    expect(emitted.instrumentRunFiles[0].wells).toHaveLength(96);
    expect(emitted.instrumentRunFiles[0].wells[0].well).toBe('A1');
    expect(emitted.instrumentRunFiles[0].wells[95].well).toBe('H12');
    expect(emitted.instrumentRunFiles[0].runParameters).toEqual({
      simulate: true,
      mode: 'fluorescence',
      wavelengthNm: 520,
      integrationMs: 100,
    });

    const appliance = createEmitInstrumentApplianceJobsPass();
    const applianceResult = appliance.run({
      pass_id: 'emit_instrument_appliance_jobs',
      state: makeState(prompt, new Map([
        ['emit_instrument_run_files', emitted],
      ])),
    });

    expect(applianceResult.ok).toBe(true);
    expect(applianceResult.diagnostics).toEqual([]);
    const applianceOutput = applianceResult.output as {
      instrumentApplianceJobs: Array<{
        adapterId: string;
        operation: string;
        request: { adapterId: string; outputPath?: string; parameters: Record<string, unknown> };
        sourceRunFile: { wells: Array<{ well: string }> };
      }>;
    };
    expect(applianceOutput.instrumentApplianceJobs).toHaveLength(1);
    expect(applianceOutput.instrumentApplianceJobs[0]).toEqual(
      expect.objectContaining({
        adapterId: 'molecular_devices_gemini',
        operation: 'active_read',
      }),
    );
    expect(applianceOutput.instrumentApplianceJobs[0].request).toEqual(
      expect.objectContaining({
        adapterId: 'molecular_devices_gemini',
        outputPath: 'records/inbox/gemini-em-active-read-1.csv',
        parameters: {
          mode: 'fluorescence',
          simulate: true,
          wavelengthNm: 520,
          integrationMs: 100,
        },
      }),
    );
    expect(applianceOutput.instrumentApplianceJobs[0].sourceRunFile.wells).toHaveLength(96);

    const readiness = createEvaluateInstrumentExecutionReadinessPass();
    const readinessResult = readiness.run({
      pass_id: 'evaluate_instrument_execution_readiness',
      state: makeState(prompt, new Map([
        ['emit_instrument_appliance_jobs', applianceOutput],
      ])),
    });

    expect(readinessResult.ok).toBe(true);
    expect(readinessResult.diagnostics).toBeUndefined();
    const readinessOutput = readinessResult.output as {
      instrumentApplianceJobs: Array<{ executionReadiness?: { status: string; executionMode?: string } }>;
      instrumentExecutionReadiness: Array<{ status: string; executionMode?: string }>;
    };
    expect(readinessOutput.instrumentExecutionReadiness).toEqual([
      expect.objectContaining({ status: 'ready', executionMode: 'simulate' }),
    ]);
    expect(readinessOutput.instrumentApplianceJobs[0].executionReadiness).toEqual(
      expect.objectContaining({ status: 'ready', executionMode: 'simulate' }),
    );
  });
});
