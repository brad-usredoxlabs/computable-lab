/**
 * BranchResolver — unit tests (Task 2, condition-first localization).
 *
 * Covers: sample-type branch picks the shared ∪ selected step set; a second
 * labware-format axis unions in; an unmatched choice → {ok:false, gap} (never
 * silent pass-through); a malformed predicate → unresolved (never silently in).
 */

import { describe, it, expect } from 'vitest';
import { resolveBranchAxes } from './BranchResolver.js';
import type { BranchAxisLike } from './BranchResolver.js';

const SAMPLE_AXIS: BranchAxisLike = {
  axisId: 'sample-type',
  label: 'Starting sample type',
  shared_stepIds: ['lyse-common'],
  conditions: [
    {
      id: 'bacterial',
      label: 'Bacterial DNA',
      predicate: { op: 'equals', path: '$.sampleType', value: 'bacterial dna' },
      then_stepIds: ['lys-bact', 'bind-1', 'wash-1', 'elute-1'],
    },
    {
      id: 'mammalian',
      label: 'Mammalian cell culture',
      predicate: { op: 'equals', path: '$.sampleType', value: 'mammalian cell culture' },
      then_stepIds: ['lyse-mam', 'grind-1', 'bind-1', 'wash-1', 'elute-1'],
    },
  ],
};

const LABWARE_AXIS: BranchAxisLike = {
  axisId: 'labware-format',
  label: 'Labware format',
  conditions: [
    { id: 'tubes', predicate: { op: 'equals', path: '$.labwareFormat', value: 'tubes-in-rack' }, then_stepIds: ['rack-mount'] },
    { id: 'plate96', predicate: { op: 'equals', path: '$.labwareFormat', value: '96-well' }, then_stepIds: ['plate-map'] },
  ],
};

describe('resolveBranchAxes', () => {
  it('mammalian choice → shared + mammalian branch starting steps (DROPS the bacterial branch)', () => {
    const r = resolveBranchAxes({
      branchAxes: [SAMPLE_AXIS],
      choices: { sampleType: 'mammalian cell culture' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activeStepIds).toEqual(['lyse-common', 'lyse-mam', 'grind-1', 'bind-1', 'wash-1', 'elute-1']);
    expect(r.activeStepIds).not.toContain('lys-bact');
    expect(r.resolutions[0]).toEqual({ axisId: 'sample-type', matched: true, branchIds: ['mammalian'] });
  });

  it('resolves both sample-type AND labware-format axes and unions the step set', () => {
    const r = resolveBranchAxes({
      branchAxes: [SAMPLE_AXIS, LABWARE_AXIS],
      choices: { sampleType: 'bacterial dna', labwareFormat: 'tubes-in-rack' },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.activeStepIds).toEqual(['lyse-common', 'lys-bact', 'bind-1', 'wash-1', 'elute-1', 'rack-mount']);
    expect(r.resolutions).toEqual([
      { axisId: 'sample-type', matched: true, branchIds: ['bacterial'] },
      { axisId: 'labware-format', matched: true, branchIds: ['tubes'] },
    ]);
  });

  it('an unmatched choice → ok:false + gap naming the unresolved axis (never silent)', () => {
    const r = resolveBranchAxes({ branchAxes: [SAMPLE_AXIS], choices: { sampleType: 'yeast spheroplast' } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.unresolvedAxes).toEqual(['sample-type']);
    expect(r.gap).toMatch(/sample-type/);
  });

  it('a malformed/unknown predicate never silently gates steps in', () => {
    const axis: BranchAxisLike = {
      axisId: 'broken',
      conditions: [{ id: 'x', predicate: { op: 'bogus_op' }, then_stepIds: ['a'] }],
    };
    const r = resolveBranchAxes({ branchAxes: [axis], choices: {} });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.unresolvedAxes).toEqual(['broken']);
  });

  it('missing shared steps on the axis still resolves when a branch matches', () => {
    const r = resolveBranchAxes({ branchAxes: [LABWARE_AXIS], choices: { labwareFormat: '96-well' } });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.activeStepIds).toEqual(['plate-map']);
  });

  it('no axes → ok with empty step set', () => {
    const r = resolveBranchAxes({ branchAxes: [], choices: {} });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.activeStepIds).toEqual([]);
  });
});