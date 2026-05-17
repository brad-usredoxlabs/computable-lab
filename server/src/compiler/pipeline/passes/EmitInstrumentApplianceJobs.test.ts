import { describe, expect, it } from 'vitest';
import {
  createEmitInstrumentApplianceJobsPass,
  createEvaluateInstrumentExecutionReadinessPass,
} from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';

function makeState(outputs = new Map<string, unknown>()): PipelineState {
  return {
    input: {},
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  };
}

describe('createEmitInstrumentApplianceJobsPass', () => {
  it('pass id is emit_instrument_appliance_jobs and family is emit', () => {
    const pass = createEmitInstrumentApplianceJobsPass();
    expect(pass.id).toBe('emit_instrument_appliance_jobs');
    expect(pass.family).toBe('emit');
  });

  it('emits Gemini EM active-read jobs and skips unsupported instruments', () => {
    const pass = createEmitInstrumentApplianceJobsPass();
    const result = pass.run({
      pass_id: 'emit_instrument_appliance_jobs',
      state: makeState(new Map([
        ['emit_instrument_run_files', {
          instrumentRunFiles: [
            { instrument: 'QuantStudio-5', wells: [{ well: 'A1' }] },
            { instrument: 'Gemini EM plate reader', wells: [{ well: 'A1' }, { well: 'A2' }] },
          ],
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([]);
    const output = result.output as {
      instrumentApplianceJobs: Array<{
        jobId: string;
        request: { adapterId: string; outputPath?: string };
        sourceRunFile: { wells: unknown[] };
      }>;
    };
    expect(output.instrumentApplianceJobs).toHaveLength(1);
    expect(output.instrumentApplianceJobs[0].jobId).toBe('gemini-em-active-read-1');
    expect(output.instrumentApplianceJobs[0].request).toEqual(
      expect.objectContaining({
        adapterId: 'molecular_devices_gemini',
        outputPath: 'records/inbox/gemini-em-active-read-1.csv',
      }),
    );
    expect(output.instrumentApplianceJobs[0].sourceRunFile.wells).toHaveLength(2);
  });

  it('warns when a Gemini EM run file has no wells', () => {
    const pass = createEmitInstrumentApplianceJobsPass();
    const result = pass.run({
      pass_id: 'emit_instrument_appliance_jobs',
      state: makeState(new Map([
        ['emit_instrument_run_files', {
          instrumentRunFiles: [
            { instrument: 'Gemini EM plate reader', wells: [] },
          ],
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'empty_gemini_em_run_file',
      }),
    ]);
    const output = result.output as { instrumentApplianceJobs: unknown[] };
    expect(output.instrumentApplianceJobs).toHaveLength(1);
  });
});

describe('createEvaluateInstrumentExecutionReadinessPass', () => {
  it('annotates ready Gemini EM appliance jobs', () => {
    const pass = createEvaluateInstrumentExecutionReadinessPass();
    const result = pass.run({
      pass_id: 'evaluate_instrument_execution_readiness',
      state: makeState(new Map([
        ['emit_instrument_appliance_jobs', {
          instrumentApplianceJobs: [{
            kind: 'instrument-appliance-job',
            jobId: 'gemini-em-active-read-1',
            adapterId: 'molecular_devices_gemini',
            operation: 'active_read',
            instrument: 'Gemini EM plate reader',
            request: {
              adapterId: 'molecular_devices_gemini',
              instrumentRef: { kind: 'record', id: 'instrument/gemini-em-plate-reader' },
              parameters: {
                simulate: true,
                mode: 'fluorescence',
                wavelengthNm: 520,
              },
            },
            sourceRunFile: {
              instrument: 'Gemini EM plate reader',
              wells: [{ well: 'A1' }],
            },
          }],
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toBeUndefined();
    const output = result.output as {
      instrumentApplianceJobs: Array<{ executionReadiness?: { status: string; executionMode?: string } }>;
      instrumentExecutionReadiness: Array<{ status: string; executionMode?: string }>;
    };
    expect(output.instrumentExecutionReadiness).toEqual([
      expect.objectContaining({ status: 'ready', executionMode: 'simulate' }),
    ]);
    expect(output.instrumentApplianceJobs[0].executionReadiness).toEqual(
      expect.objectContaining({ status: 'ready', executionMode: 'simulate' }),
    );
  });

  it('warns and annotates blocked Gemini EM appliance jobs', () => {
    const pass = createEvaluateInstrumentExecutionReadinessPass();
    const result = pass.run({
      pass_id: 'evaluate_instrument_execution_readiness',
      state: makeState(new Map([
        ['emit_instrument_appliance_jobs', {
          instrumentApplianceJobs: [{
            kind: 'instrument-appliance-job',
            jobId: 'gemini-em-active-read-1',
            adapterId: 'molecular_devices_gemini',
            operation: 'active_read',
            instrument: 'Gemini EM plate reader',
            request: {
              adapterId: 'molecular_devices_gemini',
              instrumentRef: { kind: 'record', id: 'instrument/gemini-em-plate-reader' },
              parameters: { mode: 'fluorescence' },
            },
            sourceRunFile: {
              instrument: 'Gemini EM plate reader',
              wells: [{ well: 'A1' }],
            },
          }],
        }],
      ])),
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'instrument_execution_blocked',
      }),
    ]);
    const output = result.output as {
      instrumentExecutionReadiness: Array<{ status: string; blockers: Array<{ code: string }> }>;
    };
    expect(output.instrumentExecutionReadiness[0]).toEqual(
      expect.objectContaining({
        status: 'blocked',
        blockers: expect.arrayContaining([
          expect.objectContaining({ code: 'missing_execution_mode' }),
          expect.objectContaining({ code: 'missing_wavelength' }),
        ]),
      }),
    );
  });
});
