/**
 * Tests for BiologyVerbExpander module.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerVerbExpander,
  getExpander,
  listVerbs,
  _resetRegistryForTest,
  makeEventId,
  type BiologyVerbExpander,
  type PlateEventPrimitive,
} from './BiologyVerbExpander.js';

// Import expanders directly from simpleVerbs
import {
  seedExpander,
  incubateExpander,
  mixExpander,
  resuspendExpander,
  diluteExpander,
  countExpander,
  stainExpander,
  fixExpander,
  permeabilizeExpander,
  blockExpander,
  quenchExpander,
  labelExpander,
  transfectExpander,
} from './verbs/simpleVerbs.js';

// Allowed event types
const ALLOWED_EVENT_TYPES: PlateEventPrimitive['event_type'][] = [
  'create_container',
  'add_material',
  'transfer',
  'incubate',
  'mix',
  'read',
];

function assertValidEvents(events: PlateEventPrimitive[]): void {
  expect(events.length).toBeGreaterThan(0);
  for (const event of events) {
    expect(ALLOWED_EVENT_TYPES).toContain(event.event_type);
  }
}

describe('BiologyVerbExpander registry', () => {
  beforeEach(() => {
    _resetRegistryForTest();
  });

  it('registerVerbExpander adds an expander to the registry', () => {
    const mockExpander: BiologyVerbExpander = {
      verb: 'test_verb',
      expand: () => [],
    };
    registerVerbExpander(mockExpander);
    expect(getExpander('test_verb')).toBe(mockExpander);
  });

  it('registerVerbExpander throws on duplicate', () => {
    const expander1: BiologyVerbExpander = {
      verb: 'duplicate',
      expand: () => [],
    };
    const expander2: BiologyVerbExpander = {
      verb: 'duplicate',
      expand: () => [],
    };
    registerVerbExpander(expander1);
    expect(() => registerVerbExpander(expander2)).toThrow(
      "Verb expander for 'duplicate' already registered"
    );
  });

  it('getExpander returns undefined for unknown verb', () => {
    expect(getExpander('unknown_verb')).toBeUndefined();
  });

  it('listVerbs returns sorted list of registered verbs', () => {
    registerVerbExpander({ verb: 'zebra', expand: () => [] });
    registerVerbExpander({ verb: 'alpha', expand: () => [] });
    registerVerbExpander({ verb: 'middle', expand: () => [] });
    expect(listVerbs()).toEqual(['alpha', 'middle', 'zebra']);
  });

  it('_resetRegistryForTest clears the registry', () => {
    registerVerbExpander({ verb: 'test', expand: () => [] });
    expect(listVerbs().length).toBe(1);
    _resetRegistryForTest();
    expect(listVerbs().length).toBe(0);
  });
});

describe('BiologyVerbExpander makeEventId', () => {
  it('generates unique IDs with verb prefix', () => {
    const id1 = makeEventId('seed');
    const id2 = makeEventId('seed');
    expect(id1).toMatch(/^evt-seed-/);
    expect(id2).toMatch(/^evt-seed-/);
    expect(id1).not.toBe(id2); // Should be unique due to random
  });
});

describe('BiologyVerbExpander verb expanders', () => {
  const expanderMap = {
    seed: seedExpander,
    incubate: incubateExpander,
    mix: mixExpander,
    resuspend: resuspendExpander,
    dilute: diluteExpander,
    count: countExpander,
    stain: stainExpander,
    fix: fixExpander,
    permeabilize: permeabilizeExpander,
    block: blockExpander,
    quench: quenchExpander,
    label: labelExpander,
    transfect: transfectExpander,
  };

  for (const [verb, expander] of Object.entries(expanderMap)) {
    it(`expands '${verb}' to valid event types`, () => {
      const events = expander.expand({ verb, params: {} });
      assertValidEvents(events);
    });
  }

  describe('seed', () => {
    it('returns add_material event with cell_ref', () => {
      const events = seedExpander.expand({
        verb: 'seed',
        params: { cell_ref: 'HeLa', volume: '100uL' },
      });
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('add_material');
      expect(events[0].details.material).toBe('HeLa');
    });
  });

  describe('incubate', () => {
    it('returns incubate event with duration and temperature', () => {
      const events = incubateExpander.expand({
        verb: 'incubate',
        params: { duration: 'PT2H', temperature: 42 },
      });
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('incubate');
      expect(events[0].details.duration).toBe('PT2H');
      expect(events[0].details.temperature).toBe(42);
    });
  });

  describe('mix', () => {
    it('returns mix event with volume and cycles', () => {
      const events = mixExpander.expand({
        verb: 'mix',
        params: { volume: '50uL', cycles: 5 },
      });
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('mix');
      expect(events[0].details.volume).toBe('50uL');
      expect(events[0].details.cycles).toBe(5);
    });
  });

  describe('resuspend', () => {
    it('returns mix event with default cycles', () => {
      const events = resuspendExpander.expand({ verb: 'resuspend', params: {} });
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('mix');
      expect(events[0].details.cycles).toBe(10);
    });
  });

  describe('dilute', () => {
    it('returns add_material then mix events', () => {
      const events = diluteExpander.expand({
        verb: 'dilute',
        params: { diluent_volume: '100uL', diluent: 'PBS' },
      });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('mix');
    });
  });

  describe('count', () => {
    it('returns read event with readout=cell_count', () => {
      const events = countExpander.expand({ verb: 'count', params: {} });
      expect(events).toHaveLength(1);
      expect(events[0].event_type).toBe('read');
      expect(events[0].details.readout).toBe('cell_count');
    });
  });

  describe('stain', () => {
    it('returns add_material then incubate events', () => {
      const events = stainExpander.expand({
        verb: 'stain',
        params: { material_name: 'DAPI', volume: '50uL' },
      });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.duration).toBe('PT15M');
      expect(events[1].details.temperature).toBe(37);
    });
  });

  describe('fix', () => {
    it('returns add_material then incubate with temp=4', () => {
      const events = fixExpander.expand({ verb: 'fix', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.temperature).toBe(4);
    });
  });

  describe('permeabilize', () => {
    it('returns add_material then incubate', () => {
      const events = permeabilizeExpander.expand({ verb: 'permeabilize', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
    });
  });

  describe('block', () => {
    it('returns add_material then incubate with duration=PT1H', () => {
      const events = blockExpander.expand({ verb: 'block', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.duration).toBe('PT1H');
    });
  });

  describe('quench', () => {
    it('returns add_material then incubate with duration=PT10M', () => {
      const events = quenchExpander.expand({ verb: 'quench', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.duration).toBe('PT10M');
    });
  });

  describe('label', () => {
    it('returns add_material then incubate with duration=PT30M', () => {
      const events = labelExpander.expand({ verb: 'label', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.duration).toBe('PT30M');
    });
  });

  describe('transfect', () => {
    it('returns add_material then incubate with duration=PT24H', () => {
      const events = transfectExpander.expand({ verb: 'transfect', params: {} });
      expect(events).toHaveLength(2);
      expect(events[0].event_type).toBe('add_material');
      expect(events[1].event_type).toBe('incubate');
      expect(events[1].details.duration).toBe('PT24H');
    });
  });
});
