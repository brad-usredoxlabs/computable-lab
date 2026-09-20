/**
 * An instrument is placed through `equipmentRequirements`, never as an event.
 *
 * Reported failure (2026-09-20): asked to put the lab's Eppendorf ThermoMixer on the
 * deck, the model emitted a `place_tube` event whose `details.labwareId` was an
 * instrument id (the generic heater-shaker it had seen on the bench), with a note
 * claiming it was the ThermoMixer. The instrument it was told to use was in
 * <resolved_context>, so the conversion prefers the named one.
 */
import { describe, expect, it } from 'vitest';
import { gateEquipmentPlacementEvents, preferNamedEquipment } from './equipmentPlacementGate.js';
import { parseSubmitSuggestionArgs } from './submitSuggestionTool.js';

const USAGE = { promptTokens: 1, completionTokens: 1 };

function placeTube(labwareId: string) {
  return {
    eventId: 'e1',
    event_type: 'place_tube',
    verb: 'place_tube',
    details: { labwareId, wells: ['A1'] },
    notes: 'Placing the Eppendorf ThermoMixer® C on the deck as requested.',
  };
}

describe('gateEquipmentPlacementEvents', () => {
  it('converts a tube event that references a minted instrument into a placement', () => {
    const result = gateEquipmentPlacementEvents([
      placeTube('eqp:CL:heater_shaker:mu93hr7z:ypzwpx'),
    ]);
    expect(result.events).toEqual([]);
    expect(result.equipmentRequirements).toEqual([{ classCurie: 'equipment:heater_shaker' }]);
    expect(result.notes.join(' ')).toMatch(/instrument has no wells/i);
  });

  it('converts a record-id reference and keeps the record', () => {
    const result = gateEquipmentPlacementEvents([placeTube('EQP-EPPENDORF-THERMOMIXER-C-3776')]);
    expect(result.equipmentRequirements).toEqual([{ recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776' }]);
  });

  it('uses the instrument the USER named, with the user\'s own label, and says it did', () => {
    const result = gateEquipmentPlacementEvents(
      [placeTube('eqp:CL:heater_shaker:mu93hr7z:ypzwpx')],
      {
        namedEquipmentIds: ['EQP-EPPENDORF-THERMOMIXER-C-3776'],
        namedEquipmentLabels: { 'EQP-EPPENDORF-THERMOMIXER-C-3776': 'Eppendorf ThermoMixer® C' },
      },
    );
    expect(result.equipmentRequirements).toEqual([
      { recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776', handle: 'Eppendorf ThermoMixer® C' },
    ]);
    expect(result.notes.join(' ')).toContain('using the instrument you named');
  });

  it('leaves ordinary labware events completely alone', () => {
    const plate = {
      eventId: 'e2',
      event_type: 'add_material',
      verb: 'add_material',
      details: { labwareId: 'lbw-seed-plate-96-flat', wells: ['A1'] },
    };
    const result = gateEquipmentPlacementEvents([placeTube('eqp-1'), plate]);
    expect(result.events).toEqual([plate]);
    expect(result.equipmentRequirements).toEqual([{ recordId: 'eqp-1' }]);
  });

  it('sees the nested target spelling and dedupes repeated references', () => {
    const nested = {
      eventId: 'e3',
      event_type: 'transfer',
      verb: 'transfer',
      details: { target: { labwareId: 'EQP-HEATER-SHAKER' } },
    };
    const result = gateEquipmentPlacementEvents([nested, placeTube('EQP-HEATER-SHAKER')]);
    expect(result.events).toEqual([]);
    expect(result.equipmentRequirements).toEqual([{ recordId: 'EQP-HEATER-SHAKER' }]);
  });
});

describe('preferNamedEquipment — a named record beats a stand-in', () => {
  const named = {
    namedEquipmentIds: ['EQP-EPPENDORF-THERMOMIXER-C-3776'],
    namedEquipmentLabels: { 'EQP-EPPENDORF-THERMOMIXER-C-3776': 'Eppendorf ThermoMixer C' },
  };

  it('replaces a generic stand-in with the instrument the user named', () => {
    const result = preferNamedEquipment(
      [{ classCurie: 'equipment:heater_shaker', handle: 'bath 1' }],
      named,
    );
    expect(result.equipmentRequirements).toEqual([
      { recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776', handle: 'Eppendorf ThermoMixer C' },
    ]);
    expect(result.notes.join(' ')).toMatch(/instead of the generic equipment:heater_shaker stand-in/);
  });

  it('leaves a draft that already names the record alone', () => {
    const requirements = [{ recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776' }];
    const result = preferNamedEquipment(requirements, named);
    expect(result.equipmentRequirements).toBe(requirements);
    expect(result.notes).toEqual([]);
  })

  it('does not touch a draft that places only records', () => {
    const requirements = [{ recordId: 'EQP-WATER-BATH' }];
    const result = preferNamedEquipment(requirements, named);
    expect(result.equipmentRequirements).toBe(requirements);
  })

  it('stays out of the way when the user named nothing (or several things)', () => {
    const requirements = [{ classCurie: 'equipment:water_bath' }];
    expect(preferNamedEquipment(requirements, {}).equipmentRequirements).toBe(requirements);
    expect(
      preferNamedEquipment(requirements, { namedEquipmentIds: ['EQP-A', 'EQP-B'] }).equipmentRequirements,
    ).toBe(requirements);
  })
})

describe('parseSubmitSuggestionArgs — instrument-as-event repair', () => {
  it('repairs the reported draft: no bogus tube event, and the named instrument placed', () => {
    const result = parseSubmitSuggestionArgs(
      { intent: 'event_graph', events: [placeTube('eqp:CL:heater_shaker:mu93hr7z:ypzwpx')] },
      USAGE,
      1,
      1,
      { namedEquipmentIds: ['EQP-EPPENDORF-THERMOMIXER-C-3776'] },
    );
    expect(result.events ?? []).toEqual([]);
    expect(result.equipmentRequirements).toEqual([{ recordId: 'EQP-EPPENDORF-THERMOMIXER-C-3776' }]);
    expect(result.notes?.join(' ')).toMatch(/instrument has no wells/i);
  });

  it('reports the channel error in the notes rather than dropping the turn silently', () => {
    const result = parseSubmitSuggestionArgs(
      { intent: 'event_graph', events: [placeTube('EQP-WATER-BATH')] },
      USAGE,
      1,
      1,
    );
    expect(result.notes?.join(' ')).toContain('EQP-WATER-BATH');
  });
});
