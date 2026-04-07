import { describe, expect, it } from 'vitest';
import { buildSystemPrompt } from './systemPrompt.js';

describe('buildSystemPrompt', () => {
  it('formats well-state concentration truth and counts explicitly', () => {
    const prompt = buildSystemPrompt({
      labwares: [],
      eventSummary: 'No events yet.',
      vocabPackId: 'liquid-handling/v1',
      availableVerbs: ['transfer'],
      wellStateSnapshot: [
        {
          labwareId: 'plate-1',
          labwareName: 'Assay Plate',
          wellId: 'A1',
          totalVolume_uL: 50,
          materials: [
            {
              label: 'Clofibrate',
              volume_uL: 10,
              concentrationUnknown: true,
              aliquotRefId: 'ALQ-001',
            },
            {
              label: 'Cells',
              volume_uL: 40,
              concentration: { value: 25000, unit: 'cells/mL', basis: 'count_per_volume' },
              count: 1000,
            },
          ],
          eventCount: 2,
          harvested: false,
        },
      ],
    });

    expect(prompt).toContain('concentration=unknown');
    expect(prompt).toContain('aliquot=ALQ-001');
    expect(prompt).toContain('25000 cells/mL');
    expect(prompt).toContain('count=1000.000');
  });
});
