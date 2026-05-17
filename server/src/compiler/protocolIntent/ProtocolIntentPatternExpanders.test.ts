import { describe, expect, it } from 'vitest';
import {
  createExpandProtocolIntentPatternsPass,
  expandProtocolIntentPattern,
} from './ProtocolIntentPatternExpanders.js';
import type { ProtocolPatternIntent } from './ProtocolIntent.js';

describe('ProtocolIntentPatternExpanders', () => {
  it('expands source wells to duplicate target columns', () => {
    const pattern: ProtocolPatternIntent = {
      id: 'pattern-duplicate-columns',
      kind: 'source_wells_to_duplicate_target_columns',
      sourceLabware: 'reservoir_C',
      targetLabware: 'plate_D',
      sourceWells: ['1', '2'],
      targetColumnPairs: [[1, 2], [3, 4]],
      params: { volumeUl: 200 },
    };

    const events = expandProtocolIntentPattern(pattern);

    expect(events).toHaveLength(32);
    expect(events[0]).toMatchObject({
      event_type: 'transfer',
      details: {
        source_labware: 'reservoir_C',
        destination_labware: 'plate_D',
        source_well: '1',
        well: 'A1',
        volumeUl: 200,
        protocolIntentPatternKind: 'source_wells_to_duplicate_target_columns',
      },
    });
    expect(events[15].details).toMatchObject({ source_well: '1', well: 'H2' });
    expect(events[16].details).toMatchObject({ source_well: '2', well: 'A3' });
  });

  it('expands media swap duplicate columns into remove and replace transfers', () => {
    const pattern: ProtocolPatternIntent = {
      id: 'pattern-media-swap',
      kind: 'media_swap_duplicate_columns',
      sourceLabware: 'reservoir_C',
      targetLabware: 'plate_D',
      sourceWells: ['1'],
      targetColumnPairs: [[1, 2]],
      params: {
        removeVolumeUl: 200,
        replacementVolumeUl: 200,
        waste: 'default_waste',
      },
    };

    const events = expandProtocolIntentPattern(pattern);

    expect(events).toHaveLength(32);
    expect(events[0]).toMatchObject({
      event_type: 'transfer',
      details: {
        source_labware: 'plate_D',
        destination_labware: 'default_waste',
        source_well: 'A1',
        volumeUl: 200,
        phase: 'remove_media',
      },
    });
    expect(events[1]).toMatchObject({
      event_type: 'transfer',
      details: {
        source_labware: 'reservoir_C',
        destination_labware: 'plate_D',
        source_well: '1',
        well: 'A1',
        phase: 'replace_media',
      },
    });
  });

  it('expands serial dilution into mixes, row-to-row transfers, and final waste discard', () => {
    const pattern: ProtocolPatternIntent = {
      id: 'pattern-serial',
      kind: 'serial_dilution',
      targetLabware: 'plate_D',
      rows: ['A', 'B', 'C'],
      ratio: '4:1',
      params: {
        targetColumn: '1',
        transferVolumeUl: 25,
        finalAspirateToWasteUl: 25,
        mix: { cycles: 5, volumeUl: 125 },
      },
    };

    const events = expandProtocolIntentPattern(pattern);

    expect(events.map((event) => event.event_type)).toEqual([
      'mix',
      'transfer',
      'mix',
      'transfer',
      'mix',
      'transfer',
    ]);
    expect(events[0].details).toMatchObject({ well: 'A1', cycles: 5, volumeUl: 125 });
    expect(events[1].details).toMatchObject({ source_well: 'A1', well: 'B1', volumeUl: 25 });
    expect(events[5].details).toMatchObject({
      source_labware: 'plate_D',
      destination_labware: 'default_waste',
      source_well: 'C1',
      phase: 'final_discard',
    });
  });

  it('expands repeat_rows into row transfer plus mix events', () => {
    const pattern: ProtocolPatternIntent = {
      id: 'pattern-repeat-resazurin',
      kind: 'repeat_rows',
      sourceLabware: 'reservoir_C',
      targetLabware: 'plate_D',
      rows: ['A', 'B'],
      operation: 'add_resazurin_and_mix',
      params: {
        sourceWell: '8',
        materialRef: 'resazurin',
        volumeUl: 10,
        columns: [1, 2, 3],
        mix: { cycles: 5, volumeUl: 125 },
      },
    };

    const events = expandProtocolIntentPattern(pattern);

    expect(events).toHaveLength(4);
    expect(events[0]).toMatchObject({
      event_type: 'transfer',
      details: {
        source_labware: 'reservoir_C',
        destination_labware: 'plate_D',
        source_well: '8',
        wells: ['A1', 'A2', 'A3'],
        source_material_ref: 'resazurin',
        volumeUl: 10,
      },
    });
    expect(events[1]).toMatchObject({
      event_type: 'mix',
      details: {
        wells: ['A1', 'A2', 'A3'],
        cycles: 5,
        volumeUl: 125,
      },
    });
  });

  it('provides a pipeline pass over protocolIntentStatePlan patterns', () => {
    const pass = createExpandProtocolIntentPatternsPass();
    const result = pass.run({
      pass_id: 'expand_protocol_intent_patterns',
      state: {
        input: {},
        context: {},
        meta: {},
        diagnostics: [],
        outputs: new Map([
          ['protocol_intent_state_plan', {
            protocolIntentStatePlan: {
              patternsPendingExpansion: [
                {
                  id: 'pattern-repeat',
                  kind: 'repeat_rows',
                  targetLabware: 'plate_D',
                  rows: ['A'],
                  params: { columns: [1], volumeUl: 10 },
                },
              ],
            },
          }],
        ]),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toMatchObject({
      events: [
        {
          event_type: 'transfer',
          details: {
            destination_labware: 'plate_D',
            wells: ['A1'],
            volumeUl: 10,
          },
        },
      ],
    });
  });

  it('suppresses pattern event expansion when ProtocolIntent validation is blocked', () => {
    const pass = createExpandProtocolIntentPatternsPass();
    const result = pass.run({
      pass_id: 'expand_protocol_intent_patterns',
      state: {
        input: {},
        context: {},
        meta: {},
        diagnostics: [],
        outputs: new Map([
          ['validate_protocol_intent', {
            status: 'blocked',
            blockers: [
              {
                severity: 'error',
                code: 'dangling_labware_reference',
                message: 'pattern source labware is missing',
                path: 'patterns.0.sourceLabware',
                blocksLowering: true,
              },
            ],
          }],
          ['protocol_intent_state_plan', {
            protocolIntentStatePlan: {
              patternsPendingExpansion: [
                {
                  id: 'pattern-repeat',
                  kind: 'repeat_rows',
                  targetLabware: 'plate_D',
                  rows: ['A'],
                  params: { columns: [1], volumeUl: 10 },
                },
              ],
            },
          }],
        ]),
      },
    });

    expect(result.ok).toBe(true);
    expect(result.output).toEqual({ events: [] });
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'protocol_intent_validation_blocker',
        pass_id: 'expand_protocol_intent_patterns',
      }),
    ]);
  });
});
