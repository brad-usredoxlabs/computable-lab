import { describe, it, expect } from 'vitest';
import { createCheckInstrumentCapabilitiesPass } from './CheckInstrumentCapabilities.js';
import type { PlateEventPrimitive } from '../../biology/BiologyVerbExpander.js';

function makeState(events: PlateEventPrimitive[]) {
  return {
    outputs: new Map([['expand_biology_verbs', { events }]]),
  };
}

describe('check_instrument_capabilities pass', () => {
  it('emits warning when orbital shaking exceeds 3000 rpm', async () => {
    const pass = createCheckInstrumentCapabilitiesPass();
    const events: PlateEventPrimitive[] = [{
      eventId: 'evt-1',
      event_type: 'mix',
      details: { mode: 'orbital_shaking', rpm: 5000, duration: 'PT5M' },
    }];
    const result = await pass.run({ state: makeState(events) as any, pass_id: 'check_instrument_capabilities' });
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!).toHaveLength(1);
    expect(result.diagnostics![0].code).toBe('no_instrument_capability');
  });

  it('passes when orbital shaking is within range', async () => {
    const pass = createCheckInstrumentCapabilitiesPass();
    const events: PlateEventPrimitive[] = [{
      eventId: 'evt-1',
      event_type: 'mix',
      details: { mode: 'orbital_shaking', rpm: 600, duration: 'PT5M' },
    }];
    const result = await pass.run({ state: makeState(events) as any, pass_id: 'check_instrument_capabilities' });
    expect(result.diagnostics).toBeUndefined();
  });

  it('passes when centrifuge is within range', async () => {
    const pass = createCheckInstrumentCapabilitiesPass();
    const events: PlateEventPrimitive[] = [{
      eventId: 'evt-1',
      event_type: 'centrifuge',
      details: { rpm: 10000, duration: 'PT10M' },
    }];
    const result = await pass.run({ state: makeState(events) as any, pass_id: 'check_instrument_capabilities' });
    expect(result.diagnostics).toBeUndefined();
  });

  it('emits warning when centrifuge exceeds 15000 rpm', async () => {
    const pass = createCheckInstrumentCapabilitiesPass();
    const events: PlateEventPrimitive[] = [{
      eventId: 'evt-1',
      event_type: 'centrifuge',
      details: { rpm: 20000, duration: 'PT10M' },
    }];
    const result = await pass.run({ state: makeState(events) as any, pass_id: 'check_instrument_capabilities' });
    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!).toHaveLength(1);
  });

  it('ignores events without capability requirements', async () => {
    const pass = createCheckInstrumentCapabilitiesPass();
    const events: PlateEventPrimitive[] = [
      { eventId: 'evt-1', event_type: 'add_material', details: { material: 'water' } },
      { eventId: 'evt-2', event_type: 'transfer', details: { volume: '100 uL' } },
    ];
    const result = await pass.run({ state: makeState(events) as any, pass_id: 'check_instrument_capabilities' });
    expect(result.diagnostics).toBeUndefined();
  });
});
