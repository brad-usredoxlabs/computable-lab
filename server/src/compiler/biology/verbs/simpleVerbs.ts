/**
 * Simple biology verb expanders.
 * 
 * This module registers expanders for 13 simple biology verbs that can be
 * lowered to primitive event types. Each expander is kept under 20 lines.
 */

import { registerVerbExpander, makeEventId, type BiologyVerbExpander, type PlateEventPrimitive, type VerbInput } from '../BiologyVerbExpander.js';

/**
 * Shared helper for verbs that do add_material + incubate.
 * Creates two events: add_material followed by incubate.
 */
function addMaterialAndIncubate(
  verb: string,
  input: VerbInput,
  defaultDurationIso: string,
  defaultTempC: number
): PlateEventPrimitive[] {
  const { params } = input;
  const materialName = (params.material_name || params.reagent || params[`${verb}_reagent`] || `${verb}_agent`) as string;
  const volume = params.volume as string | undefined;
  const duration = (params.incubation_duration || params.duration || defaultDurationIso) as string;
  const temp = (params.temperature ?? defaultTempC) as number;
  
  const events: PlateEventPrimitive[] = [];
  
  // add_material event
  events.push({
    eventId: makeEventId(`${verb}_add`),
    event_type: 'add_material',
    details: {
      material: materialName,
      ...(volume ? { volume } : {}),
    },
    labwareId: params.labware_id as string | undefined,
  });
  
  // incubate event
  events.push({
    eventId: makeEventId(`${verb}_incubate`),
    event_type: 'incubate',
    details: {
      duration,
      temperature: temp,
      ...(params.atmosphere ? { atmosphere: params.atmosphere } : {}),
    },
    labwareId: params.labware_id as string | undefined,
    t_offset: duration,
  });
  
  return events;
}

/**
 * seed: add_material event for seeding cells into wells.
 */
export const seedExpander: BiologyVerbExpander = {
  verb: 'seed',
  expand(input) {
    const { params } = input;
    const material = (params.cell_ref || params.material_ref || params.cells) as string;
    const volume = params.volume as string | undefined;
    const labwareId = params.labware_id as string | undefined;
    
    return [{
      eventId: makeEventId('seed'),
      event_type: 'add_material',
      details: {
        material,
        ...(volume ? { volume } : {}),
      },
      labwareId,
    }];
  },
};

/**
 * incubate: single incubate event.
 */
export const incubateExpander: BiologyVerbExpander = {
  verb: 'incubate',
  expand(input) {
    const { params } = input;
    const duration = (params.duration || params.incubation_duration || 'PT1H') as string;
    const temp = (params.temperature ?? 37) as number;
    
    return [{
      eventId: makeEventId('incubate'),
      event_type: 'incubate',
      details: {
        duration,
        temperature: temp,
        ...(params.atmosphere ? { atmosphere: params.atmosphere } : {}),
      },
      labwareId: params.labware_id as string | undefined,
      t_offset: duration,
    }];
  },
};

/**
 * mix: single mix event.
 */
export const mixExpander: BiologyVerbExpander = {
  verb: 'mix',
  expand(input) {
    const { params } = input;
    const volume = params.volume as string | undefined;
    const cycles = params.cycles as number | undefined;
    
    return [{
      eventId: makeEventId('mix'),
      event_type: 'mix',
      details: {
        ...(volume ? { volume } : {}),
        ...(cycles ? { cycles } : {}),
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * resuspend: single mix event (same as mix).
 */
export const resuspendExpander: BiologyVerbExpander = {
  verb: 'resuspend',
  expand(input) {
    const { params } = input;
    const volume = params.volume as string | undefined;
    const cycles = params.cycles ?? 10; // default many cycles for resuspend
    
    return [{
      eventId: makeEventId('resuspend'),
      event_type: 'mix',
      details: {
        ...(volume ? { volume } : {}),
        cycles,
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * dilute: add_material (diluent) then mix.
 */
export const diluteExpander: BiologyVerbExpander = {
  verb: 'dilute',
  expand(input) {
    const { params } = input;
    const diluentVolume = params.diluent_volume as string | undefined;
    const material = params.diluent || 'diluent';
    const cycles = params.cycles ?? 5;
    
    return [
      {
        eventId: makeEventId('dilute_add'),
        event_type: 'add_material',
        details: {
          material,
          ...(diluentVolume ? { volume: diluentVolume } : {}),
        },
        labwareId: params.labware_id as string | undefined,
      },
      {
        eventId: makeEventId('dilute_mix'),
        event_type: 'mix',
        details: {
          cycles,
        },
        labwareId: params.labware_id as string | undefined,
      },
    ];
  },
};

/**
 * count: single read event with readout='cell_count'.
 */
export const countExpander: BiologyVerbExpander = {
  verb: 'count',
  expand(input) {
    const { params } = input;
    return [{
      eventId: makeEventId('count'),
      event_type: 'read',
      details: {
        readout: 'cell_count',
        ...(params.value ? { value: params.value } : {}),
      },
      labwareId: params.labware_id as string | undefined,
    }];
  },
};

/**
 * stain: add_material (stain) then incubate.
 */
export const stainExpander: BiologyVerbExpander = {
  verb: 'stain',
  expand(input) {
    return addMaterialAndIncubate('stain', input, 'PT15M', 37);
  },
};

/**
 * fix: add_material (fixative) then incubate.
 */
export const fixExpander: BiologyVerbExpander = {
  verb: 'fix',
  expand(input) {
    return addMaterialAndIncubate('fix', input, 'PT15M', 4);
  },
};

/**
 * permeabilize: add_material (permeabilization_buffer) then incubate.
 */
export const permeabilizeExpander: BiologyVerbExpander = {
  verb: 'permeabilize',
  expand(input) {
    return addMaterialAndIncubate('permeabilize', input, 'PT15M', 37);
  },
};

/**
 * block: add_material (blocking_buffer) then incubate.
 */
export const blockExpander: BiologyVerbExpander = {
  verb: 'block',
  expand(input) {
    return addMaterialAndIncubate('block', input, 'PT1H', 20);
  },
};

/**
 * quench: add_material (quencher) then incubate.
 */
export const quenchExpander: BiologyVerbExpander = {
  verb: 'quench',
  expand(input) {
    return addMaterialAndIncubate('quench', input, 'PT10M', 20);
  },
};

/**
 * label: add_material (label_reagent) then incubate.
 */
export const labelExpander: BiologyVerbExpander = {
  verb: 'label',
  expand(input) {
    return addMaterialAndIncubate('label', input, 'PT30M', 37);
  },
};

/**
 * transfect: add_material (transfection_reagent+DNA complex) then incubate.
 */
export const transfectExpander: BiologyVerbExpander = {
  verb: 'transfect',
  expand(input) {
    return addMaterialAndIncubate('transfect', input, 'PT24H', 37);
  },
};

// Register all 13 expanders at module import time
registerVerbExpander(seedExpander);
registerVerbExpander(incubateExpander);
registerVerbExpander(mixExpander);
registerVerbExpander(resuspendExpander);
registerVerbExpander(diluteExpander);
registerVerbExpander(countExpander);
registerVerbExpander(stainExpander);
registerVerbExpander(fixExpander);
registerVerbExpander(permeabilizeExpander);
registerVerbExpander(blockExpander);
registerVerbExpander(quenchExpander);
registerVerbExpander(labelExpander);
registerVerbExpander(transfectExpander);
