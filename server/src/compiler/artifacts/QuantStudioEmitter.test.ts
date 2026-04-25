/**
 * Tests for the QuantStudio instrument emitter.
 */

import { describe, it, expect } from 'vitest';
import {
  getInstrumentEmitter,
  type InstrumentEmitter,
} from './InstrumentRunFile.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { ResolvedReference } from '../pipeline/CompileContracts.js';

// Side-effect import registers emitters for QuantStudio-5, QuantStudio, QS5
import './QuantStudioEmitter.js';

describe('QuantStudioEmitter', () => {
  it('registers emitters for QuantStudio-5, QuantStudio, and QS5', () => {
    expect(getInstrumentEmitter('QuantStudio-5')).toBeDefined();
    expect(getInstrumentEmitter('QuantStudio')).toBeDefined();
    expect(getInstrumentEmitter('QS5')).toBeDefined();
    expect(getInstrumentEmitter('quantstudio-5')).toBeDefined();
    expect(getInstrumentEmitter('quantstudio')).toBeDefined();
    expect(getInstrumentEmitter('qs5')).toBeDefined();
  });

  it('returns undefined for unregistered instrument', () => {
    expect(getInstrumentEmitter('ThermoFisher-XYZ')).toBeUndefined();
  });

  it('produces a run file with wells from matching read events', () => {
    const emitter = getInstrumentEmitter('QuantStudio-5')!;
    const events: PlateEventPrimitive[] = [
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
      // Non-matching event should be filtered out
      {
        eventId: 'read-3',
        event_type: 'read',
        details: {
          instrument: 'plate-reader',
          well: 'C3',
        },
      },
      // Non-read event should be filtered out
      {
        eventId: 'evt-4',
        event_type: 'add_material',
        details: {
          instrument: 'QuantStudio-5',
          well: 'D4',
        },
      },
    ];
    const resolvedRefs: ResolvedReference[] = [];

    const result = emitter(events, resolvedRefs);

    expect(result.instrument).toBe('QuantStudio-5');
    expect(result.wells).toHaveLength(2);
    expect(result.wells[0]).toEqual({
      well: 'A1',
      channelMap: { '1': 'FAM', '2': 'VIC' },
      target: '16S',
    });
    expect(result.wells[1]).toEqual({
      well: 'B2',
      target: 'GAPDH',
    });
    expect(result.analysisRules).toBeUndefined();
  });

  it('uses well "?" when well field is missing', () => {
    const emitter = getInstrumentEmitter('QuantStudio')!;
    const events: PlateEventPrimitive[] = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'QuantStudio',
        },
      },
    ];

    const result = emitter(events, []);
    expect(result.wells[0].well).toBe('?');
  });

  it('sets analysisRules to empty array when assay ref is present', () => {
    const emitter = getInstrumentEmitter('QS5')!;
    const events: PlateEventPrimitive[] = [
      {
        eventId: 'read-1',
        event_type: 'read',
        details: {
          instrument: 'QS5',
          well: 'A1',
        },
      },
    ];
    const resolvedRefs: ResolvedReference[] = [
      {
        kind: 'assay',
        label: '16S-qPCR-panel',
        resolvedId: '16s-qpcr-v1',
        resolvedName: '16S qPCR Panel v1',
      },
    ];

    const result = emitter(events, resolvedRefs);
    expect(result.analysisRules).toEqual([]);
  });

  it('handles empty events array', () => {
    const emitter = getInstrumentEmitter('QuantStudio-5')!;
    const result = emitter([], []);
    expect(result.instrument).toBe('QuantStudio-5');
    expect(result.wells).toHaveLength(0);
  });

  it('alias QS5 resolves to the same emitter', () => {
    const emitter1 = getInstrumentEmitter('QuantStudio-5');
    const emitter2 = getInstrumentEmitter('QS5');
    expect(emitter1).toBe(emitter2);
  });
});
