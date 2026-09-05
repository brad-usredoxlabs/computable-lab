import { describe, expect, it } from 'vitest';
import { getEventSummary, type PlateEvent } from './events.js';

function addEvent(overrides: Partial<PlateEvent['details']> = {}): PlateEvent {
  return {
    eventId: 'evt-1',
    event_type: 'add_material',
    t_offset: 'PT0M',
    details: {
      wells: ['A1'],
      material_ref: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
      volume: { value: 100, unit: 'uL' },
      count: 50000,
      ...overrides,
    },
  };
}

describe('getEventSummary (biological add-material)', () => {
  it('renders count + condition chips + estimate mechanism for a biological seed', () => {
    const evt = addEvent({
      count_estimate: { measuredBy: 'hemocytometer', isEstimate: true },
      condition_refs: [
        { kind: 'record', id: 'anoxic', type: 'term', label: 'anoxic' },
        { kind: 'record', id: 'organ-on-a-chip', type: 'term', label: 'organ-on-a-chip' },
      ],
      biological_type: { kind: 'record', id: 'TERM-heparg-4abc', type: 'term', label: 'HepaRG' },
    });
    const s = getEventSummary(evt);
    expect(s).toContain('HepaRG');
    expect(s).toContain('50000');
    expect(s).toContain('100 uL');
    expect(s).toContain('hemocytometer');
    expect(s).toContain('anoxic');
    expect(s).toContain('organ-on-a-chip');
  });

  it('omits estimate/conditions when absent (chemical/volume-first unchanged)', () => {
    const s = getEventSummary(addEvent({ count: undefined, count_estimate: undefined, condition_refs: undefined }));
    expect(s).toContain('100 uL');
    expect(s).not.toContain('est.');
    expect(s).not.toContain('anoxic');
  });

  it('falls back to volume-only text for a chemical (no count, no estimate)', () => {
    const s = getEventSummary(addEvent({ count: undefined, volume: { value: 50, unit: 'uL' } }));
    expect(s).toContain('50 uL');
    expect(s).not.toContain(' · ');
  });
});