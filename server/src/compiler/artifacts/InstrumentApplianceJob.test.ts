import { describe, expect, it } from 'vitest';
import {
  createGeminiEmActiveReadJob,
  evaluateInstrumentExecutionReadiness,
  isGeminiEmInstrument,
} from './InstrumentApplianceJob.js';
import type { InstrumentRunFile } from './InstrumentRunFile.js';

describe('InstrumentApplianceJob', () => {
  it('recognizes Gemini EM instrument aliases', () => {
    expect(isGeminiEmInstrument('Gemini EM plate reader')).toBe(true);
    expect(isGeminiEmInstrument('Molecular Devices Gemini EM')).toBe(true);
    expect(isGeminiEmInstrument('QuantStudio-5')).toBe(false);
  });

  it('creates a Gemini EM active-read job from a run file', () => {
    const runFile: InstrumentRunFile = {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }, { well: 'H12' }],
    };

    const job = createGeminiEmActiveReadJob(runFile, 0, {
      mode: 'fluorescence',
      wavelengthNm: 520,
    });

    expect(job).toEqual(
      expect.objectContaining({
        kind: 'instrument-appliance-job',
        jobId: 'gemini-em-active-read-1',
        adapterId: 'molecular_devices_gemini',
        operation: 'active_read',
        instrument: 'Gemini EM plate reader',
      }),
    );
    expect(job.request).toEqual({
      adapterId: 'molecular_devices_gemini',
      instrumentRef: {
        kind: 'record',
        id: 'instrument/gemini-em-plate-reader',
        type: 'instrument',
      },
      outputPath: 'records/inbox/gemini-em-active-read-1.csv',
      parameters: {
        mode: 'fluorescence',
        wavelengthNm: 520,
      },
    });
    expect(job.sourceRunFile.wells).toEqual([{ well: 'A1' }, { well: 'H12' }]);
  });

  it('uses Gemini run-file parameters when explicit request parameters are omitted', () => {
    const runFile: InstrumentRunFile = {
      instrument: 'Gemini EM plate reader',
      wells: [{ well: 'A1' }],
      runParameters: {
        simulate: true,
        mode: 'absorbance',
        wavelengthNm: 450,
        integrationMs: 250,
        unsupported: true,
      },
    };

    const job = createGeminiEmActiveReadJob(runFile, 0);

    expect(job.request.parameters).toEqual({
      simulate: true,
      mode: 'absorbance',
      wavelengthNm: 450,
      integrationMs: 250,
    });
  });

  it('marks a fully specified simulated Gemini EM job ready', () => {
    const job = createGeminiEmActiveReadJob(
      {
        instrument: 'Gemini EM plate reader',
        wells: [{ well: 'A1' }, { well: 'H12' }],
      },
      0,
      {
        simulate: true,
        mode: 'fluorescence',
        wavelengthNm: 520,
      },
    );

    expect(evaluateInstrumentExecutionReadiness(job)).toEqual({
      jobId: 'gemini-em-active-read-1',
      status: 'ready',
      executionMode: 'simulate',
      requiresConfirmation: false,
      blockers: [],
    });
  });

  it('blocks missing execution mode and invalid wells', () => {
    const job = createGeminiEmActiveReadJob(
      {
        instrument: 'Gemini EM plate reader',
        wells: [{ well: 'A0' }, { well: 'I1' }],
      },
      0,
      {
        mode: 'fluorescence',
        wavelengthNm: 520,
      },
    );

    const readiness = evaluateInstrumentExecutionReadiness(job);

    expect(readiness.status).toBe('blocked');
    expect(readiness.blockers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_wells' }),
        expect.objectContaining({ code: 'missing_execution_mode' }),
      ]),
    );
  });

  it('requires confirmation for live Gemini EM execution', () => {
    const job = createGeminiEmActiveReadJob(
      {
        instrument: 'Gemini EM plate reader',
        wells: [{ well: 'A1' }],
      },
      0,
      {
        simulate: false,
        mode: 'luminescence',
      },
    );

    expect(evaluateInstrumentExecutionReadiness(job)).toEqual(
      expect.objectContaining({
        status: 'ready',
        executionMode: 'live',
        requiresConfirmation: true,
        blockers: [],
      }),
    );
  });
});
