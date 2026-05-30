/**
 * Mint-gate (#11): ungrounded references surface as teaching warnings rather
 * than silently becoming bare free-text materials.
 */
import { describe, it, expect } from 'vitest';
import { diagnosticsForUngroundedNouns } from './DeterministicPrecompilePass.js';

type Noun = { phrase: string; kind: string; confidence?: number; recordId?: string };
const nouns = (...n: Noun[]) => n as unknown as Parameters<typeof diagnosticsForUngroundedNouns>[0];

describe('diagnosticsForUngroundedNouns (mint-gate)', () => {
  it('warns (does not block) on an unresolved noun, pointing to the resolve tool', () => {
    const out = diagnosticsForUngroundedNouns(nouns({ phrase: 'fenofibrate', kind: 'unresolved' }));
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe('warning'); // medium-hard: not an error/block
    expect(out[0]!.code).toBe('ungrounded_reference');
    expect(out[0]!.message).toContain('fenofibrate');
    expect(out[0]!.message).toContain('resolve tool');
    expect(out[0]!.details).toMatchObject({ phrase: 'fenofibrate' });
  });

  it('does not flag grounded nouns (ontology / record / labware)', () => {
    const out = diagnosticsForUngroundedNouns(
      nouns(
        { phrase: 'fenofibrate', kind: 'ontology', recordId: 'CHEBI:5001' },
        { phrase: 'plate A', kind: 'labware', recordId: 'LW-1' },
        { phrase: 'aspirin', kind: 'compound', recordId: 'CMP-1' },
      ),
    );
    expect(out).toHaveLength(0);
  });

  it('skips empty/too-short phrases to avoid noise', () => {
    const out = diagnosticsForUngroundedNouns(nouns({ phrase: 'x', kind: 'unresolved' }, { phrase: '  ', kind: 'unresolved' }));
    expect(out).toHaveLength(0);
  });

  it('flags only the unresolved nouns in a mixed list', () => {
    const out = diagnosticsForUngroundedNouns(
      nouns(
        { phrase: 'DMEM', kind: 'unresolved' },
        { phrase: 'plate', kind: 'labware', recordId: 'LW-2' },
        { phrase: 'mystery reagent', kind: 'unresolved' },
      ),
    );
    expect(out.map((d) => d.details?.phrase)).toEqual(['DMEM', 'mystery reagent']);
  });
});
