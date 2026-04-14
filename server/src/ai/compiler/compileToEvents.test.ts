/**
 * Unit tests for compileToEvents.
 */

import { describe, it, expect } from 'vitest';
import { compileToEvents, type PlateEventDraft } from './compileToEvents.js';
import type { ParsedIntent } from './parseIntent.js';
import type { ResolvedMention } from '../resolveMentions.js';

describe('compileToEvents', () => {
  const baseIntent: ParsedIntent = {
    verb: 'add_material',
    volume: { value: 100, unit: 'uL' },
    wells: ['A1'],
    materialRef: {
      kind: 'material-spec',
      id: 'MSP-X',
      label: 'Clofibrate 1mM',
    },
    labwareRef: {
      kind: 'instance',
      id: 'LBW-1',
      label: 'Plate 1',
    },
    postActions: [],
    unresolvedSlots: [],
    rawPrompt: 'Add 100uL of [[material-spec:MSP-X|Clofibrate]] to A1 of [[labware:LBW-1|Plate 1]]',
  };

  const baseMentions: ResolvedMention[] = [];

  it('Case A: full slots - bypass emits event', () => {
    const result = compileToEvents(baseIntent, baseMentions);
    
    expect(result.bypass).toBe(true);
    expect(result.events.length).toBe(1);
    
    const event = result.events[0] as PlateEventDraft;
    expect(event.event_type).toBe('add_material');
    expect(event.details.labwareId).toBe('LBW-1');
    expect(event.details.wells).toEqual(['A1']);
    expect(event.details.volume).toEqual({ value: 100, unit: 'uL' });
    expect(event.details.material_spec_ref).toBe('MSP-X');
    expect(event.t_offset).toBe('PT0M');
    expect(result.notes).toContain('Compiled by deterministic intent parser (bypassed LLM)');
  });

  it('Case B: missing volume - bypass=false', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      volume: undefined,
      unresolvedSlots: ['volume'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toContain('volume');
  });

  it('Case C: labware is definition - bypass=false, reason mentions labwareInstance', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      labwareRef: {
        kind: 'definition',
        id: 'def-plate-96',
        label: '96-well plate',
      },
      unresolvedSlots: ['labwareInstance'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toContain('labware instance');
  });

  it('missing wells - bypass=false', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      wells: undefined,
      unresolvedSlots: ['wells'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toContain('wells');
  });

  it('missing material - bypass=false', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      materialRef: undefined,
      unresolvedSlots: ['material'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toContain('material');
  });

  it('missing labware - bypass=false', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      labwareRef: undefined,
      unresolvedSlots: ['labware'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toContain('labware');
  });

  it('verb not supported - bypass=false', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      verb: 'unknown',
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(false);
    expect(result.reason).toBe('verb not supported by compiler');
  });

  it('materialRef kind aliquot - uses aliquot_ref', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      materialRef: {
        kind: 'aliquot',
        id: 'ALIOT-42',
        label: 'Aliot 42',
      },
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(true);
    const event = result.events[0] as PlateEventDraft;
    expect(event.details.aliquot_ref).toBe('ALIOT-42');
    expect(event.details.material_spec_ref).toBeUndefined();
    expect(event.details.material_ref).toBeUndefined();
  });

  it('materialRef kind material - uses material_ref', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      materialRef: {
        kind: 'material',
        id: 'MAT-99',
        label: 'Material 99',
      },
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(true);
    const event = result.events[0] as PlateEventDraft;
    expect(event.details.material_ref).toBe('MAT-99');
    expect(event.details.material_spec_ref).toBeUndefined();
    expect(event.details.aliquot_ref).toBeUndefined();
  });

  it('post-action set_source_location - note included', () => {
    const intent: ParsedIntent = {
      ...baseIntent,
      postActions: ['set_source_location'],
    };
    
    const result = compileToEvents(intent, baseMentions);
    
    expect(result.bypass).toBe(true);
    expect(result.notes).toContain('Post-action requested: set_source_location (not yet implemented by compiler)');
  });
});
