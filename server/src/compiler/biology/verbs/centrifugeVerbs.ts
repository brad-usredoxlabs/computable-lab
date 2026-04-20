import { registerVerbExpander, makeEventId, type BiologyVerbExpander, type VerbInput, type PlateEventPrimitive } from '../BiologyVerbExpander.js';

const spinExpander: BiologyVerbExpander = {
  verb: 'spin',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as { labware?: string; rpm?: number; duration?: string; temperature?: number };
    return [{
      eventId: makeEventId('spin'),
      event_type: 'centrifuge',
      details: {
        rpm: p.rpm ?? 300,
        duration: p.duration ?? 'PT5M',
        ...(typeof p.temperature === 'number' ? { temperature: p.temperature } : {}),
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
    }];
  },
};

const pelletExpander: BiologyVerbExpander = {
  verb: 'pellet',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      waste_labware?: string;
      rpm?: number;
      duration?: string;
      supernatant_volume?: { value: number; unit: string };
      wells?: string[];
    };
    return [
      {
        eventId: makeEventId('pellet-spin'),
        event_type: 'centrifuge',
        details: { rpm: p.rpm ?? 300, duration: p.duration ?? 'PT5M' },
        ...(p.labware ? { labwareId: p.labware } : {}),
      },
      {
        eventId: makeEventId('pellet-aspirate'),
        event_type: 'transfer',
        details: {
          source_labware: p.labware,
          destination_labware: p.waste_labware,
          volume: p.supernatant_volume ?? { value: 150, unit: 'uL' },
          wells: p.wells ?? [],
        },
      },
    ];
  },
};

registerVerbExpander(spinExpander);
registerVerbExpander(pelletExpander);
