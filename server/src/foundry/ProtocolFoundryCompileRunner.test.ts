import { describe, expect, it } from 'vitest';
import { extractPresegmentedFoundryCandidates } from './ProtocolFoundryCompileRunner.js';

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
