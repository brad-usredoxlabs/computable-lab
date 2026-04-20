/**
 * Tests for compound biology verb expanders.
 * 
 * Tests all 7 compound verbs: aliquot, wash, elute, harvest, passage, freeze, thaw.
 * Verifies event count, event_type allowlist compliance, and specific ordering requirements.
 */

import { describe, it, expect } from 'vitest';
import { getExpander, type PlateEventPrimitive, _resetRegistryForTest } from './BiologyVerbExpander.js';

// Import the expanders for side-effect registration (must be top-level)
import './verbs/compoundVerbs.js';
import './verbs/simpleVerbs.js';

// Allowed event types per the ContextEngine allowlist
const ALLOWED_EVENT_TYPES: Set<string> = new Set([
  'create_container',
  'add_material',
  'transfer',
  'incubate',
  'mix',
  'read',
]);

/**
 * Helper to verify all events in an array have allowed event_type values.
 */
function assertEventTypesAllowed(events: PlateEventPrimitive[]): void {
  for (const event of events) {
    expect(ALLOWED_EVENT_TYPES.has(event.event_type), 
      `Event type '${event.event_type}' is not in the allowed set`).toBe(true);
  }
}

describe('Compound Biology Verb Expanders', () => {
  describe('aliquot', () => {
    it('should emit N transfer events for N target wells', () => {
      const expander = getExpander('aliquot');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'aliquot',
        params: {
          source_labware: 'source-plate',
          target_labware: 'target-plate',
          volume_per_well: { value: 50, unit: 'uL' },
          n_targets: 3,
          target_wells: ['A1', 'B1', 'C1'],
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 3 transfer events
      expect(events.length).toBe(3);
      
      // All events should be transfer type
      for (const event of events) {
        expect(event.event_type).toBe('transfer');
      }
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should default to 1 target when n_targets not specified', () => {
      const expander = getExpander('aliquot');
      const input = {
        verb: 'aliquot',
        params: {
          source_labware: 'source',
          target_labware: 'target',
        },
      };
      
      const events = expander!.expand(input);
      expect(events.length).toBe(1);
      expect(events[0].event_type).toBe('transfer');
    });
  });

  describe('wash', () => {
    it('should emit 2 events: add_material then transfer', () => {
      const expander = getExpander('wash');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'wash',
        params: {
          labware: 'plate-1',
          wash_buffer_ref: 'pbs-buffer',
          wash_volume: { value: 100, unit: 'uL' },
          waste_labware: 'waste-reservoir',
          wells: ['A1', 'B1'],
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 2 events
      expect(events.length).toBe(2);
      
      // First event should be add_material
      expect(events[0].event_type).toBe('add_material');
      
      // Second event should be transfer
      expect(events[1].event_type).toBe('transfer');
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });
  });

  describe('elute', () => {
    it('should emit 3 events: add_material, incubate, transfer', () => {
      const expander = getExpander('elute');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'elute',
        params: {
          labware: 'column-1',
          elution_buffer_ref: 'elution-buffer',
          elution_volume: { value: 50, unit: 'uL' },
          incubation_duration: 'PT3M',
          collection_labware: 'collection-tube',
          wells: ['A1'],
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 3 events
      expect(events.length).toBe(3);
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should have correct event type sequence for elute', () => {
      const expander = getExpander('elute');
      const input = {
        verb: 'elute',
        params: {
          labware: 'column-1',
          collection_labware: 'collection-tube',
        },
      };
      
      const events = expander!.expand(input);
      
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[2].event_type).toBe('transfer');
    });
  });

  describe('harvest', () => {
    it('should emit 3 events: add_material, incubate, transfer', () => {
      const expander = getExpander('harvest');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'harvest',
        params: {
          labware: 'culture-plate',
          destination_labware: 'collection-tube',
          trypsin_ref: 'trypsin-EDTA-0.25%',
          trypsin_volume: { value: 50, unit: 'uL' },
          incubation_duration: 'PT5M',
          wells: ['A1', 'B1', 'C1'],
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 3 events
      expect(events.length).toBe(3);
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should have correct event type ORDER: add_material → incubate → transfer', () => {
      const expander = getExpander('harvest');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'harvest',
        params: {
          labware: 'culture-plate',
          destination_labware: 'collection-tube',
        },
      };
      
      const events = expander!.expand(input);
      
      // HARVEST ORDERING TEST: Assert exact sequence
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[2].event_type).toBe('transfer');
    });

    it('should use default trypsin-EDTA when not specified', () => {
      const expander = getExpander('harvest');
      const input = {
        verb: 'harvest',
        params: {
          labware: 'plate-1',
          destination_labware: 'tube-1',
        },
      };
      
      const events = expander!.expand(input);
      
      expect(events[0].event_type).toBe('add_material');
      const details = events[0].details as Record<string, unknown>;
      expect(details.material_ref).toBe('trypsin-EDTA-0.25%');
    });
  });

  describe('passage', () => {
    it('should compose harvest + seed expanders', () => {
      const expander = getExpander('passage');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'passage',
        params: {
          source_labware: 'source-plate',
          target_labware: 'target-plate',
          cell_ref: 'HeLa',
          target_volume: { value: 500, unit: 'uL' },
          source_wells: ['A1', 'B1'],
          target_wells: ['A1'],
        },
      };
      
      const events = expander!.expand(input);
      
      // passage = harvest (3 events) + seed (1 event) = 4 events
      expect(events.length).toBe(4);
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should have harvest events first, then seed events', () => {
      const expander = getExpander('passage');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'passage',
        params: {
          source_labware: 'source-plate',
          target_labware: 'target-plate',
          cell_ref: 'HeLa',
          target_volume: { value: 500, unit: 'uL' },
        },
      };
      
      const events = expander!.expand(input);
      
      // First 3 events should be harvest's output (add_material, incubate, transfer)
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[2].event_type).toBe('transfer');
      
      // 4th event should be seed's output (add_material)
      expect(events[3].event_type).toBe('add_material');
    });
  });

  describe('freeze', () => {
    it('should emit 1 incubate event', () => {
      const expander = getExpander('freeze');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'freeze',
        params: {
          labware: 'cryovial-1',
          duration: 'PT24H',
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 1 event
      expect(events.length).toBe(1);
      
      // Should be incubate type
      expect(events[0].event_type).toBe('incubate');
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should have temperature=-80 and atmosphere=freezer', () => {
      const expander = getExpander('freeze');
      const input = {
        verb: 'freeze',
        params: {
          labware: 'cryovial-1',
        },
      };
      
      const events = expander!.expand(input);
      
      const details = events[0].details as Record<string, unknown>;
      expect(details.temperature).toBe(-80);
      expect(details.atmosphere).toBe('freezer');
    });
  });

  describe('thaw', () => {
    it('should emit 1 incubate event', () => {
      const expander = getExpander('thaw');
      expect(expander).toBeDefined();
      
      const input = {
        verb: 'thaw',
        params: {
          labware: 'cryovial-1',
          duration: 'PT2M',
        },
      };
      
      const events = expander!.expand(input);
      
      // Should emit exactly 1 event
      expect(events.length).toBe(1);
      
      // Should be incubate type
      expect(events[0].event_type).toBe('incubate');
      
      // Verify event types are in allowed set
      assertEventTypesAllowed(events);
    });

    it('should have temperature=37 and atmosphere=water_bath', () => {
      const expander = getExpander('thaw');
      const input = {
        verb: 'thaw',
        params: {
          labware: 'cryovial-1',
        },
      };
      
      const events = expander!.expand(input);
      
      const details = events[0].details as Record<string, unknown>;
      expect(details.temperature).toBe(37);
      expect(details.atmosphere).toBe('water_bath');
    });
  });
});
