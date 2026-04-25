import { describe, it, expect } from 'vitest';
import { readExpander } from './simpleVerbs.js';

describe('read verb expander', () => {
  it('emits a read event with instrument only (no assayId)', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: { instrument: 'plate-reader' },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].details).toEqual({ instrument: 'plate-reader' });
    expect(events[0].details.channelMap).toBeUndefined();
    expect(events[0].details.analysisRules).toBeUndefined();
  });

  it('emits a read event with instrument and well', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: { instrument: 'QuantStudio-5', well: 'A1' },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].details).toEqual({ instrument: 'QuantStudio-5', well: 'A1' });
  });

  it('emits a read event with instrument + assayId, channelMap populated from 16S-qPCR-panel', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: {
        instrument: 'QuantStudio-5',
        assayId: '16S-qPCR-panel',
        well: 'A2',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].details.instrument).toBe('QuantStudio-5');
    expect(events[0].details.well).toBe('A2');

    // channelMap should be populated from the assay-spec
    const channelMap = events[0].details.channelMap as Record<string, Record<string, string>> | undefined;
    expect(channelMap).toBeDefined();
    expect(channelMap!.A2.FAM).toBe('F.prausnitzii');
    expect(channelMap!.A2.CY5).toBe('R.bromii');
    expect(channelMap!.A2.VIC).toBe('E.rectale');
    expect(channelMap!.A2.ABY).toBe('P.copri');

    // analysisRules should be populated from the assay-spec
    const analysisRules = events[0].details.analysisRules as Array<{ kind: string; params: Record<string, unknown> }> | undefined;
    expect(analysisRules).toBeDefined();
    expect(analysisRules).toHaveLength(1);
    expect(analysisRules![0].kind).toBe('normalize_to');
    expect(analysisRules![0].params.reference_well).toBe('A1');
    expect(analysisRules![0].params.reference_target).toBe('16S');
  });

  it('emits a read event with a non-existent assayId (graceful degradation)', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: {
        instrument: 'plate-reader',
        assayId: 'nonexistent-assay',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].details.instrument).toBe('plate-reader');
    // channelMap and analysisRules should be undefined when assay not found
    expect(events[0].details.channelMap).toBeUndefined();
    expect(events[0].details.analysisRules).toBeUndefined();
  });

  it('emits a read event with labwareId', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: {
        instrument: 'plate-reader',
        labware_id: 'plate-1',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].labwareId).toBe('plate-1');
  });

  it('FIRE-cellular-redox assayId populates analysisRules (no channelMap)', () => {
    const events = readExpander.expand({
      verb: 'read',
      params: {
        instrument: 'plate-reader',
        assayId: 'FIRE-cellular-redox',
      },
    });

    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('read');
    expect(events[0].details.instrument).toBe('plate-reader');

    // FIRE assay has no channelMaps, so channelMap should be undefined
    expect(events[0].details.channelMap).toBeUndefined();

    // analysisRules should be populated from the assay-spec
    const analysisRules = events[0].details.analysisRules as Array<{ kind: string }> | undefined;
    expect(analysisRules).toBeDefined();
    expect(analysisRules!.length).toBe(5);
    expect(analysisRules![0].kind).toBe('viability_readout');
  });
});
