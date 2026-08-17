/**
 * ProtocolCompiler — branch-first localization (Task 4).
 *
 * Asserts that lowerToLabProtocol resolves branch axes as PHASE-0: the
 * resulting lab-protocol step set contains shared ∪ selected-branch steps
 * (un-selected branch steps are DROPPED), the branch resolution + selected
 * branch id flow onto the local protocol, and an unresolved axis BLOCKS the
 * localization with a diagnostic (never a silent pass-through).
 */

import { describe, expect, it } from 'vitest';
import { ProtocolCompiler } from './ProtocolCompiler.js';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import type { PolicyProfile } from '../../policy/types.js';

function envelope<T extends { id?: string; recordId?: string; kind: string }>(schemaId: string, payload: T): RecordEnvelope<T> {
  return {
    recordId: payload.id ?? payload.recordId ?? `${payload.kind}-record`,
    schemaId,
    payload,
    meta: { kind: payload.kind },
  };
}

function createStore(records: RecordEnvelope[]): Pick<RecordStore, 'list'> {
  return {
    async list(filter) {
      return records.filter((record) => {
        if (!filter?.kind) return true;
        return (record.payload as { kind?: string }).kind === filter.kind;
      });
    },
  };
}

const permissiveRemediation: PolicyProfile[] = [
  { id: 'org-remediation-allow', scope: 'organization', scopeId: 'org-1', settings: { allowRemediation: 'allow' } },
];

const STEPS = [
  { stepId: 'lyse-common', kind: 'mix', semanticVerb: { canonical: 'mix' } },
  { stepId: 'lys-bact', kind: 'mix', semanticVerb: { canonical: 'mix' } },
  { stepId: 'lyse-mam', kind: 'mix', semanticVerb: { canonical: 'mix' } },
  { stepId: 'bind-1', kind: 'mix', semanticVerb: { canonical: 'mix' } },
  { stepId: 'grind-1', kind: 'mix', semanticVerb: { canonical: 'mix' } },
];

const BRANCH_AXES = [
  {
    axisId: 'sample-type',
    label: 'Starting sample type',
    shared_stepIds: ['lyse-common'],
    conditions: [
      { id: 'bacterial', predicate: { op: 'equals', path: '$.sampleType', value: 'bacterial dna' }, then_stepIds: ['lys-bact', 'bind-1'] },
      { id: 'mammalian', predicate: { op: 'equals', path: '$.sampleType', value: 'mammalian cell culture' }, then_stepIds: ['lyse-mam', 'bind-1', 'grind-1'] },
    ],
  },
];

function branchedProtocolEnvelope(): RecordEnvelope {
  return {
    recordId: 'PRO-000001',
    schemaId: 'schema://protocol',
    payload: {
      protocolLayer: 'universal',
      kind: 'protocol',
      recordId: 'PRO-000001',
      title: 'Branched protocol',
      steps: STEPS,
      branch_axes: BRANCH_AXES,
    },
    meta: { kind: 'protocol' },
  };
}

function makeCompiler(): ProtocolCompiler {
  return new ProtocolCompiler(createStore([]));
}

function stepIdsOf(result: { steps: Array<{ stepId: string }> }): string[] {
  return result.steps.map((s) => s.stepId);
}

describe('ProtocolCompiler branch-first localization', () => {
  it('mammalian choice → lab steps = shared + mammalian branch (bacterial branch dropped)', async () => {
    const compiler = makeCompiler();
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: branchedProtocolEnvelope(),
      context: { branchChoices: { sampleType: 'mammalian cell culture' }, policyProfiles: permissiveRemediation },
    });
    expect(stepIdsOf(result)).toEqual(['lyse-common', 'lyse-mam', 'bind-1', 'grind-1']);
    expect(stepIdsOf(result)).not.toContain('lys-bact');
    expect(result.branchResolution).toEqual([
      { axisId: 'sample-type', matched: true, branchIds: ['mammalian'] },
    ]);
    // resolution flows onto the local protocol
    const lpr = result.localProtocol.branch_resolution as Array<Record<string, unknown>>;
    expect(lpr).toBeDefined();
    expect(lpr[0]).toMatchObject({ axisId: 'sample-type', matched: true, branchIds: ['mammalian'] });
  });

  it('an unresolved branch choice BLOCKS localization with a diagnostic', async () => {
    const compiler = makeCompiler();
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: branchedProtocolEnvelope(),
      context: { branchChoices: { sampleType: 'yeast spheroplast' }, policyProfiles: permissiveRemediation },
    });
    expect(result.status).toBe('blocked');
    expect(result.steps).toEqual([]);
    expect(result.diagnostics.some((d) => d.code === 'BRANCH_AXIS_UNRESOLVED' && d.message.includes('sample-type'))).toBe(true);
  });

  it('a protocol WITHOUT branch_axes is unaffected (back-compat)', async () => {
    const compiler = makeCompiler();
    const envelope = branchedProtocolEnvelope();
    delete (envelope.payload as Record<string, unknown>).branch_axes;
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: envelope,
      context: { branchChoices: {}, policyProfiles: permissiveRemediation },
    });
    // all steps flow through, no branch filter, no branch_resolution
    expect(stepIdsOf(result)).toHaveLength(STEPS.length);
    expect(result.branchResolution).toBeUndefined();
    expect(result.localProtocol.branch_resolution).toBeUndefined();
  });

  it('F3: branch-triggered inserted step compiles in + branch resources are returned', async () => {
    const envelope = branchedProtocolEnvelope();
    const axes = (envelope.payload as Record<string, unknown>).branch_axes as Array<Record<string, unknown>>;
    (axes[0] as { conditions?: Array<Record<string, unknown>> }).conditions![1] = {
      ...(axes[0] as { conditions: Array<Record<string, unknown>> }).conditions![1],
      insert_steps: [{ stepId: 'pre-freeze', kind: 'incubate', label: 'Freeze at -80C' }],
      then_resourceRefs: [
        { role: 'bead-beater', ref: { kind: 'record', id: 'EQP-beadbeater-1', type: 'equipment' } },
      ],
    };
    const compiler = makeCompiler();
    const result = await compiler.lowerToLabProtocol({
      protocolEnvelope: envelope,
      context: { branchChoices: { sampleType: 'mammalian cell culture' }, policyProfiles: permissiveRemediation },
    });
    // inserted step appears in the compiled step set
    expect(stepIdsOf(result)).toContain('pre-freeze');
    // branch resources surfaced on the result + local protocol
    expect(result.branchResources?.map((r) => r.role)).toContain('bead-beater');
    expect(
      (result.localProtocol as unknown as { branch_resources?: Array<{ role: string }> }).branch_resources?.map((r) => r.role),
    ).toContain('bead-beater');
  });
});