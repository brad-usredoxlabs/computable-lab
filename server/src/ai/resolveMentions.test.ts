import { describe, expect, it } from 'vitest';
import { buildResolvedContextMessage, type ResolvedMention } from './resolveMentions.js';

describe('buildResolvedContextMessage', () => {
  it('includes a mention whose record was fetched', () => {
    const mentions: ResolvedMention[] = [
      { raw: '[[material:MAT-1|Fenofibrate]]', kind: 'material', id: 'MAT-1', label: 'Fenofibrate', resolved: { name: 'Fenofibrate', domain: 'chemical' } },
    ];
    const msg = buildResolvedContextMessage(mentions);
    expect(msg).toContain('MAT-1');
    expect(msg).toContain('"domain"');
  });

  it('includes an explicit reference whose record could NOT be fetched (draft spec) as grounded-by-reference', () => {
    const mentions: ResolvedMention[] = [
      {
        raw: '[[material-spec:MSP-DRAFT-XYZ|DMEM + FBS]]',
        kind: 'material-spec',
        id: 'MSP-DRAFT-XYZ',
        label: 'DMEM + FBS',
        error: 'No entity found for material-spec:MSP-DRAFT-XYZ',
      },
    ];
    const msg = buildResolvedContextMessage(mentions);
    expect(msg).not.toBeNull();
    expect(msg).toContain('MSP-DRAFT-XYZ');
    expect(msg).toContain('DMEM + FBS');
    expect(msg).toContain('groundedByReference')
  });

  it('excludes selection mentions that carry no fetchable id', () => {
    const mentions: ResolvedMention[] = [
      { raw: '[[source]]', kind: 'selection', id: '', label: 'source' },
    ];
    expect(buildResolvedContextMessage(mentions)).toBeNull();
  });

  it('returns null when there is nothing to ground', () => {
    expect(buildResolvedContextMessage([])).toBeNull();
  });
});
