import { describe, expect, it } from 'vitest';
import {
  createFoundryLabwareLookup,
  extractPresegmentedFoundryCandidates,
} from './ProtocolFoundryCompileRunner.js';

describe('extractPresegmentedFoundryCandidates', () => {
  it('extracts protocol-action candidates from presegmented protocol text without using final event semantics', () => {
    const candidates = extractPresegmentedFoundryCandidates([
      'Rules:',
      '- Do not create material-instance records.',
      'Protocol text:',
      'Add 100 uL wash buffer to each well.',
      'Incubate the plate for 30 minutes at room temperature.',
    ].join('\n'));

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      target_kind: 'protocol-action',
      draft: {
        phrase: 'Add 100 uL wash buffer to each well.',
        verb: 'transfer',
        source: 'foundry_presegmented_text',
      },
    });
    expect(candidates[1]?.draft).toMatchObject({
      verb: 'incubate',
    });
  });
});

describe('createFoundryLabwareLookup', () => {
  it('resolves deterministic Foundry labware aliases', async () => {
    const lookup = createFoundryLabwareLookup();

    await expect(lookup('generic_96_well_plate')).resolves.toEqual([
      { recordId: 'lbw-def-generic-96-well-plate', title: 'lbw-def-generic-96-well-plate' },
    ]);
    await expect(lookup('generic_24x1_5ml_tube_rack')).resolves.toEqual([
      { recordId: 'lbw-def-generic-50x1p5ml-tube-rack', title: 'lbw-def-generic-50x1p5ml-tube-rack' },
    ]);
  });

  it('searches registry-backed labware definitions without throwing', async () => {
    const lookup = createFoundryLabwareLookup();

    const matches = await lookup('96 well plate');
    expect(matches.some((match) => match.recordId === 'lbw-def-generic-96-well-plate')).toBe(true);
  });
});
