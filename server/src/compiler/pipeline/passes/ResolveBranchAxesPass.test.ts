/**
 * ResolveBranchAxesPass — Task 5 tests (local-protocol-compile pipeline).
 *
 * Covers: the pass derives activeStepIds from the canonical protocol's
 * branch_axes + the local protocol's resolved branch_resolution; a canonical
 * protocol without branch_axes is a no-op (back-compat); branch_axes declared
 * but no branch_resolution BLOCKS; and expand_local_customizations filters the
 * expanded steps to the active branch set.
 */

import { describe, it, expect } from 'vitest';
import { createResolveBranchAxesPass } from './ResolveBranchAxesPass.js';
import { createExpandLocalCustomizationsPass } from './LocalProtocolPasses.js';
import type { PassRunArgs } from '../types.js';
import type { BranchAxisLike } from '../../protocol/BranchResolver.js';

const SAMPLE_AXIS: BranchAxisLike = {
  axisId: 'sample-type',
  label: 'Starting sample type',
  shared_stepIds: ['lyse-common'],
  conditions: [
    { id: 'bacterial', predicate: { op: 'equals', path: '$.sampleType', value: 'bacterial dna' }, then_stepIds: ['lys-bact', 'bind-1', 'wash-1', 'elute-1'] },
    { id: 'mammalian', predicate: { op: 'equals', path: '$.sampleType', value: 'mammalian cell culture' }, then_stepIds: ['lyse-mam', 'grind-1', 'bind-1', 'wash-1', 'elute-1'] },
  ],
};

const STEPS = [
  { stepId: 'lyse-common', kind: 'mix' },
  { stepId: 'lys-bact', kind: 'mix' },
  { stepId: 'lyse-mam', kind: 'mix' },
  { stepId: 'bind-1', kind: 'mix' },
  { stepId: 'grind-1', kind: 'mix' },
  { stepId: 'wash-1', kind: 'mix' },
  { stepId: 'elute-1', kind: 'mix' },
];

function stateFor(outputs: Record<string, unknown>): PassRunArgs {
  return {
    pass_id: 'test',
    state: {
      input: {},
      context: {},
      meta: {},
      outputs: new Map(Object.entries(outputs)),
      diagnostics: [],
    },
  };
}

describe('resolve_branch_axes pass', () => {
  it('derives activeStepIds from canonical branch_axes + LPR branch_resolution', () => {
    const pass = createResolveBranchAxesPass();
    const result = pass.run(stateFor({
      resolve_protocol_ref: {
        localProtocol: { payload: { branch_resolution: [{ axisId: 'sample-type', matched: true, branchIds: ['mammalian'] }] } },
        canonicalProtocol: { payload: { branch_axes: [SAMPLE_AXIS], steps: STEPS } },
      },
    }));
    expect(result.ok).toBe(true);
    const out = result.output as { branchActiveStepIds: string[] };
    expect(out.branchActiveStepIds).toEqual(['lyse-common', 'lyse-mam', 'grind-1', 'bind-1', 'wash-1', 'elute-1']);
    expect(out.branchActiveStepIds).not.toContain('lys-bact');
  });

  it('canonical protocol without branch_axes is a no-op (back-compat)', () => {
    const result = createResolveBranchAxesPass().run(stateFor({
      resolve_protocol_ref: {
        localProtocol: { payload: {} },
        canonicalProtocol: { payload: { steps: STEPS } },
      },
    }));
    expect(result.ok).toBe(true);
    expect((result.output as { branchActiveStepIds?: unknown }).branchActiveStepIds).toBeUndefined();
  });

  it('BLOCKS when branch_axes declared but local protocol has no branch_resolution', () => {
    const result = createResolveBranchAxesPass().run(stateFor({
      resolve_protocol_ref: {
        localProtocol: { payload: {} },
        canonicalProtocol: { payload: { branch_axes: [SAMPLE_AXIS], steps: STEPS } },
      },
    }));
    expect(result.ok).toBe(false);
    const diag = (result.diagnostics ?? [])[0];
    expect(diag?.code).toBe('BRANCH_RESOLUTION_MISSING');
  });
});

describe('expand_local_customizations branch filtering', () => {
  it('filters expanded steps to the resolved branch set', () => {
    const pass = createExpandLocalCustomizationsPass();
    const result = pass.run(stateFor({
      resolve_protocol_ref: {
        localProtocol: { payload: {} },
        canonicalProtocol: { payload: { kind: 'protocol', steps: STEPS, branch_axes: [SAMPLE_AXIS] } },
      },
      resolve_branch_axes: {
        branchActiveStepIds: ['lyse-common', 'lyse-mam', 'grind-1', 'bind-1', 'wash-1', 'elute-1'],
        branch_resolution: [{ axisId: 'sample-type', matched: true, branchIds: ['mammalian'] }],
      },
    }));
    expect(result.ok).toBe(true);
    const expanded = (result.output as { expandedProtocol: { steps: Array<{ stepId: string }> } }).expandedProtocol;
    const ids = expanded.steps.map((s) => s.stepId);
    // Filter preserves the canonical step order; drops the un-selected branch.
    expect(ids).toEqual(['lyse-common', 'lyse-mam', 'bind-1', 'grind-1', 'wash-1', 'elute-1']);
    expect(ids).not.toContain('lys-bact');
  });

  it('leaves steps untouched when no branch filter is present (back-compat)', () => {
    const pass = createExpandLocalCustomizationsPass();
    const result = pass.run(stateFor({
      resolve_protocol_ref: {
        localProtocol: { payload: {} },
        canonicalProtocol: { payload: { kind: 'protocol', steps: STEPS } },
      },
    }));
    expect(result.ok).toBe(true);
    const expanded = (result.output as { expandedProtocol: { steps: unknown[] } }).expandedProtocol;
    expect(expanded.steps).toHaveLength(STEPS.length);
  });
});