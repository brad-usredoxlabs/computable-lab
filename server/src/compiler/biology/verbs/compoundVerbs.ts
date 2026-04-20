/**
 * Compound biology verb expanders.
 * 
 * This module registers expanders for 7 compound biology verbs that expand
 * to richer sequences of primitive events:
 * - aliquot: N transfer events from source to target wells
 * - wash: transfer(wash_buffer → wells) + transfer(wells → waste)
 * - elute: transfer(elution_buffer → wells) + incubate + transfer(wells → collection)
 * - harvest: add_material(trypsin) + incubate + transfer(cells → destination)
 * - passage: harvest expansion + seed expansion (composed via getExpander)
 * - freeze: incubate at -80C
 * - thaw: incubate at 37C
 */

import { registerVerbExpander, makeEventId, type BiologyVerbExpander, type VerbInput, type PlateEventPrimitive, getExpander } from '../BiologyVerbExpander.js';

/**
 * aliquot: emit N transfer events from source to each target well.
 * Params: { source_labware, target_labware, volume_per_well, n_targets }
 */
const aliquotExpander: BiologyVerbExpander = {
  verb: 'aliquot',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      source_labware?: string;
      target_labware?: string;
      volume_per_well?: { value: number; unit: string } | string;
      n_targets?: number;
      target_wells?: string[];
    };
    const events: PlateEventPrimitive[] = [];
    const nTargets = p.n_targets ?? 1;
    const targetWells = p.target_wells ?? [];
    
    // Emit N transfer events, one per target well
    for (let i = 0; i < nTargets; i++) {
      const well = targetWells[i] ?? `well-${i}`;
      events.push({
        eventId: makeEventId(`aliquot-${i}`),
        event_type: 'transfer',
        details: {
          source_labware: p.source_labware,
          destination_labware: p.target_labware,
          volume: p.volume_per_well,
          source_well: well,
          destination_well: well,
        },
      });
    }
    
    return events;
  },
};
registerVerbExpander(aliquotExpander);

/**
 * wash: emit transfer(wash_buffer → wells) then transfer(wells → waste).
 * Params: { labware, wash_buffer_ref, wash_volume, waste_labware, wells }
 */
const washExpander: BiologyVerbExpander = {
  verb: 'wash',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      wash_buffer_ref?: string;
      wash_volume?: { value: number; unit: string } | string;
      waste_labware?: string;
      wells?: string[];
    };
    const events: PlateEventPrimitive[] = [];
    
    // Add wash buffer to wells
    events.push({
      eventId: makeEventId('wash-add'),
      event_type: 'add_material',
      details: {
        material_ref: p.wash_buffer_ref ?? 'wash-buffer',
        volume: p.wash_volume ?? { value: 100, unit: 'uL' },
        wells: p.wells ?? [],
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
    });
    
    // Transfer from wells to waste
    events.push({
      eventId: makeEventId('wash-remove'),
      event_type: 'transfer',
      details: {
        source_labware: p.labware,
        destination_labware: p.waste_labware,
        wells: p.wells ?? [],
      },
    });
    
    return events;
  },
};
registerVerbExpander(washExpander);

/**
 * elute: emit transfer(elution_buffer → wells) + incubate + transfer(wells → collection_labware).
 * Params: { labware, elution_buffer_ref, elution_volume, incubation_duration?, collection_labware, wells }
 */
const eluteExpander: BiologyVerbExpander = {
  verb: 'elute',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      elution_buffer_ref?: string;
      elution_volume?: { value: number; unit: string } | string;
      incubation_duration?: string;
      collection_labware?: string;
      wells?: string[];
    };
    const events: PlateEventPrimitive[] = [];
    
    // Add elution buffer to wells
    events.push({
      eventId: makeEventId('elute-add'),
      event_type: 'add_material',
      details: {
        material_ref: p.elution_buffer_ref ?? 'elution-buffer',
        volume: p.elution_volume ?? { value: 50, unit: 'uL' },
        wells: p.wells ?? [],
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
    });
    
    // Incubate
    events.push({
      eventId: makeEventId('elute-incubate'),
      event_type: 'incubate',
      details: {
        duration: p.incubation_duration ?? 'PT2M',
        temperature: 20,
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
      t_offset: p.incubation_duration ?? 'PT2M',
    });
    
    // Transfer from wells to collection labware
    events.push({
      eventId: makeEventId('elute-collect'),
      event_type: 'transfer',
      details: {
        source_labware: p.labware,
        destination_labware: p.collection_labware,
        wells: p.wells ?? [],
      },
    });
    
    return events;
  },
};
registerVerbExpander(eluteExpander);

/**
 * harvest: emit add_material(trypsin) + incubate + transfer(cells → destination_labware).
 * Params: { labware, destination_labware, trypsin_ref?, trypsin_volume?, incubation_duration?, wells }
 * 
 * Expansion order MUST be: add_material → incubate → transfer
 */
const harvestExpander: BiologyVerbExpander = {
  verb: 'harvest',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      destination_labware?: string;
      trypsin_ref?: string;
      trypsin_volume?: { value: number; unit: string } | string;
      incubation_duration?: string;
      wells?: string[];
    };
    const events: PlateEventPrimitive[] = [];
    
    // 1. add_material (trypsin/EDTA)
    events.push({
      eventId: makeEventId('harvest-trypsin'),
      event_type: 'add_material',
      details: {
        material_ref: p.trypsin_ref ?? 'trypsin-EDTA-0.25%',
        volume: p.trypsin_volume ?? { value: 50, unit: 'uL' },
        wells: p.wells ?? [],
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
    });
    
    // 2. incubate (37C)
    events.push({
      eventId: makeEventId('harvest-incubate'),
      event_type: 'incubate',
      details: {
        duration: p.incubation_duration ?? 'PT5M',
        temperature: 37,
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
      t_offset: p.incubation_duration ?? 'PT5M',
    });
    
    // 3. transfer (cells → destination_labware)
    events.push({
      eventId: makeEventId('harvest-transfer'),
      event_type: 'transfer',
      details: {
        source_labware: p.labware,
        destination_labware: p.destination_labware,
        wells: p.wells ?? [],
      },
    });
    
    return events;
  },
};
registerVerbExpander(harvestExpander);

/**
 * passage: compose harvest + seed expanders via getExpander().
 * Params: { source_labware, target_labware, cell_ref, target_volume, source_wells?, target_wells? }
 * 
 * This expander calls getExpander('harvest') and getExpander('seed') to avoid
 * duplicating their logic. Guards against missing expanders.
 */
const passageExpander: BiologyVerbExpander = {
  verb: 'passage',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const harvest = getExpander('harvest');
    const seed = getExpander('seed');
    
    // Guard against expanders being missing (import order matters in tests)
    if (!harvest || !seed) {
      return [];
    }
    
    const p = input.params as Record<string, unknown>;
    const events: PlateEventPrimitive[] = [];
    
    // Call harvest expander with source_labware → destination_labware (target_labware)
    const harvestEvents = harvest.expand({
      verb: 'harvest',
      params: {
        labware: p.source_labware,
        destination_labware: p.target_labware,
        wells: p.source_wells,
      },
    });
    events.push(...harvestEvents);
    
    // Call seed expander with target_labware and cell_ref
    const seedEvents = seed.expand({
      verb: 'seed',
      params: {
        labware: p.target_labware,
        cell_ref: p.cell_ref,
        volume: p.target_volume,
        wells: p.target_wells,
      },
    });
    events.push(...seedEvents);
    
    return events;
  },
};
registerVerbExpander(passageExpander);

/**
 * freeze: emit single incubate event with temperature=-80, atmosphere='freezer'.
 * Params: { labware, duration? }
 */
const freezeExpander: BiologyVerbExpander = {
  verb: 'freeze',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      duration?: string;
    };
    
    return [{
      eventId: makeEventId('freeze'),
      event_type: 'incubate',
      details: {
        duration: p.duration ?? 'PT24H',
        temperature: -80,
        atmosphere: 'freezer',
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
      t_offset: p.duration ?? 'PT24H',
    }];
  },
};
registerVerbExpander(freezeExpander);

/**
 * thaw: emit single incubate event with temperature=37, atmosphere='water_bath'.
 * Params: { labware, duration? }
 */
const thawExpander: BiologyVerbExpander = {
  verb: 'thaw',
  expand(input: VerbInput): PlateEventPrimitive[] {
    const p = input.params as {
      labware?: string;
      duration?: string;
    };
    
    return [{
      eventId: makeEventId('thaw'),
      event_type: 'incubate',
      details: {
        duration: p.duration ?? 'PT2M',
        temperature: 37,
        atmosphere: 'water_bath',
      },
      ...(p.labware ? { labwareId: p.labware } : {}),
      t_offset: p.duration ?? 'PT2M',
    }];
  },
};
registerVerbExpander(thawExpander);
