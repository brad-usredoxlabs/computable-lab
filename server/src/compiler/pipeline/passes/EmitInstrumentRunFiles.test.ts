/**
 * Tests for the emit_instrument_run_files pass.
 */

import { describe, it, expect } from 'vitest';
import { createEmitInstrumentRunFilesPass } from './ChatbotCompilePasses.js';
import type { PipelineState } from '../types.js';
import { emptyLabState } from '../../state/LabState.js';

// Side-effect import registers emitters for QuantStudio-5, QuantStudio, QS5
import '../../artifacts/QuantStudioEmitter.js';

describe('createEmitInstrumentRunFilesPass', () => {
  it('pass id is emit_instrument_run_files and family is emit', () => {
    const pass = createEmitInstrumentRunFilesPass();
    expect(pass.id).toBe('emit_instrument_run_files');
    expect(pass.family).toBe('emit');
  });

  it('empty events produces empty instrumentRunFiles', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events: [] }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: unknown[] };
    expect(output.instrumentRunFiles).toHaveLength(0);
  });

  it('QuantStudio read events produce a run file with wells', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'QuantStudio-5',
          well: 'A1',
          channelMap: { '1': 'FAM', '2': 'VIC' },
          target: '16S',
        },
      },
      {
        eventId: 'read-2',
        event_type: 'read',
        details: {
          instrument: 'QuantStudio-5',
          well: 'B2',
          target: 'GAPDH',
        },
      },
      // Non-read event should be ignored
      {
        eventId: 'add-1',
        event_type: 'add_material',
        details: {
          instrument: 'QuantStudio-5',
          well: 'C3',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: Array<{ instrument: string; wells: Array<{ well: string }> }> };
    expect(output.instrumentRunFiles).toHaveLength(1);
    expect(output.instrumentRunFiles[0].instrument).toBe('QuantStudio-5');
    expect(output.instrumentRunFiles[0].wells).toHaveLength(2);
    expect(output.instrumentRunFiles[0].wells[0].well).toBe('A1');
    expect(output.instrumentRunFiles[0].wells[1].well).toBe('B2');
  });

  it('unregistered instrument produces warning + empty run file', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'ThermoFisher-XYZ',
          well: 'A1',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: Array<{ instrument: string; wells: unknown[] }> };
    expect(output.instrumentRunFiles).toHaveLength(1);
    expect(output.instrumentRunFiles[0].instrument).toBe('ThermoFisher-XYZ');
    expect(output.instrumentRunFiles[0].wells).toHaveLength(0);

    // Check for warning diagnostic
    const warnings = result.diagnostics?.filter(d => d.code === 'unregistered_instrument');
    expect(warnings).toHaveLength(1);
    expect(warnings![0].severity).toBe('warning');
  });

  it('multiple instruments produce multiple run files', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'QuantStudio-5',
          well: 'A1',
        },
      },
      {
        eventId: 'read-2',
        event_type: 'read',
        details: {
          instrument: 'plate-reader',
          well: 'B2',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: Array<{ instrument: string; wells: unknown[] }> };
    expect(output.instrumentRunFiles).toHaveLength(2);

    // Find the QuantStudio run file
    const qsFile = output.instrumentRunFiles.find(f => f.instrument === 'QuantStudio-5');
    expect(qsFile).toBeDefined();
    expect(qsFile!.wells).toHaveLength(1);

    // Find the plate-reader run file (unregistered)
    const prFile = output.instrumentRunFiles.find(f => f.instrument === 'plate-reader');
    expect(prFile).toBeDefined();
    expect(prFile!.wells).toHaveLength(0);
  });

  it('alias QS5 resolves to the same emitter as QuantStudio-5', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'QS5',
          well: 'A1',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: Array<{ instrument: string; wells: Array<{ well: string }> }> };
    expect(output.instrumentRunFiles).toHaveLength(1);
    // The emitter returns instrument: 'QuantStudio-5'
    expect(output.instrumentRunFiles[0].instrument).toBe('QuantStudio-5');
    expect(output.instrumentRunFiles[0].wells).toHaveLength(1);
  });

  it('read events without instrument field are ignored', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          well: 'A1',
        },
      },
    ];

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: unknown[] };
    expect(output.instrumentRunFiles).toHaveLength(0);
  });

  it('96-well QuantStudio read events produce 96 wells', () => {
    const pass = createEmitInstrumentRunFilesPass();

    const events: Array<{ eventId: string; event_type: string; details: Record<string, unknown> }> = [];
    const rows = 'ABCDEFGH';
    for (let r = 0; r < 8; r++) {
      for (let c = 1; c <= 12; c++) {
        events.push({
          eventId: `read-${rows[r]}${c}`,
          event_type: 'read',
          details: {
            instrument: 'QuantStudio-5',
            well: `${rows[r]}${c}`,
            target: 'target',
          },
        });
      }
    }

    const mockState: PipelineState = {
      input: { labState: emptyLabState() },
      context: {},
      meta: {},
      outputs: new Map([
        ['resolve_roles', { events }],
        ['resolve_references', { resolvedRefs: [] }],
      ]),
      diagnostics: [],
    };

    const result = pass.run({
      pass_id: 'emit_instrument_run_files',
      state: mockState,
    });

    expect(result.ok).toBe(true);
    const output = result.output as { instrumentRunFiles: Array<{ wells: Array<{ well: string }> }> };
    expect(output.instrumentRunFiles).toHaveLength(1);
    expect(output.instrumentRunFiles[0].wells).toHaveLength(96);
  });
});
