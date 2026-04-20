import { describe, it, expect } from 'vitest';
import { getExpander } from './BiologyVerbExpander.js';
import './verbs/centrifugeVerbs.js';

describe('centrifugeVerbs', () => {
  it('spin expander returns one event with event_type === centrifuge', () => {
    const spinExpander = getExpander('spin');
    expect(spinExpander).toBeDefined();
    
    const result = spinExpander!.expand({
      verb: 'spin',
      params: {
        labware: 'plate-1',
        rpm: 3000,
        duration: 'PT10M',
        temperature: 4,
      },
    });

    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe('centrifuge');
    expect(result[0].details).toMatchObject({
      rpm: 3000,
      duration: 'PT10M',
      temperature: 4,
    });
    expect(result[0].labwareId).toBe('plate-1');
  });

  it('spin expander uses defaults when params are missing', () => {
    const spinExpander = getExpander('spin');
    expect(spinExpander).toBeDefined();
    
    const result = spinExpander!.expand({
      verb: 'spin',
      params: {},
    });

    expect(result).toHaveLength(1);
    expect(result[0].event_type).toBe('centrifuge');
    expect(result[0].details).toMatchObject({
      rpm: 300,
      duration: 'PT5M',
    });
  });

  it('pellet expander returns exactly two events: centrifuge then transfer', () => {
    const pelletExpander = getExpander('pellet');
    expect(pelletExpander).toBeDefined();
    
    const result = pelletExpander!.expand({
      verb: 'pellet',
      params: {
        labware: 'plate-1',
        waste_labware: 'waste-1',
        rpm: 4000,
        duration: 'PT15M',
        supernatant_volume: { value: 200, unit: 'uL' },
        wells: ['A1', 'B1'],
      },
    });

    expect(result).toHaveLength(2);
    
    // First event: centrifuge
    expect(result[0].event_type).toBe('centrifuge');
    expect(result[0].details).toMatchObject({
      rpm: 4000,
      duration: 'PT15M',
    });
    expect(result[0].labwareId).toBe('plate-1');

    // Second event: transfer
    expect(result[1].event_type).toBe('transfer');
    expect(result[1].details).toMatchObject({
      source_labware: 'plate-1',
      destination_labware: 'waste-1',
      volume: { value: 200, unit: 'uL' },
      wells: ['A1', 'B1'],
    });
  });

  it('pellet expander uses defaults when params are missing', () => {
    const pelletExpander = getExpander('pellet');
    expect(pelletExpander).toBeDefined();
    
    const result = pelletExpander!.expand({
      verb: 'pellet',
      params: {},
    });

    expect(result).toHaveLength(2);
    
    // First event: centrifuge with defaults
    expect(result[0].event_type).toBe('centrifuge');
    expect(result[0].details).toMatchObject({
      rpm: 300,
      duration: 'PT5M',
    });

    // Second event: transfer with defaults
    expect(result[1].event_type).toBe('transfer');
    expect(result[1].details).toMatchObject({
      volume: { value: 150, unit: 'uL' },
      wells: [],
    });
  });
});
