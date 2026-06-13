import { describe, it, expect } from 'vitest';
import { parsePromptMentions } from './promptMentions.js';

describe('promptMentions — tube tokens', () => {
  it('parses a [[tube:...]] token as a tube mention (size literal)', () => {
    const mentions = parsePromptMentions('Put my sample in a [[tube:15 mL|15 mL tube]] please');
    expect(mentions).toHaveLength(1);
    expect(mentions[0]).toMatchObject({ type: 'tube', id: '15 mL', label: '15 mL tube' });
  });

  it('still parses other mention kinds alongside a tube token', () => {
    const mentions = parsePromptMentions('Add [[material:CHEBI:15377|water]] to a [[tube:2 mL|2 mL tube]]');
    expect(mentions.map((m) => m.type).sort()).toEqual(['material', 'tube']);
  });
});
