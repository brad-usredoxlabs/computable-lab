import { describe, expect, it } from 'vitest';
import { CompilerKernel } from './CompilerKernel.js';
import type { CandidateBinding, CompilerKernelRequest, NormalizedIntent } from './types.js';

type MaterialIntent = {
  materialName: string;
  quantity_uL: number;
};

type MaterialCandidate = {
  recordId: string;
  kind: 'material' | 'placeholder';
};

type PlanStep = {
  kind: 'bind' | 'transfer';
  detail: string;
};

describe('CompilerKernel', () => {
  it('assembles a typed compilation result with missing facts, policy evaluation, and provenance', () => {
    const kernel = new CompilerKernel();
    const normalizedIntent: NormalizedIntent<MaterialIntent> = {
      domain: 'materials',
      intentId: 'intent-1',
      version: '1',
      summary: 'Dispense buffer into plate A1',
      payload: {
        materialName: 'PBS',
        quantity_uL: 50,
      },
      requiredFacts: ['destinationWell', 'execution.platform'],
      assumptions: ['room-temperature buffer'],
    };
    const bindings: CandidateBinding<MaterialCandidate>[] = [
      {
        bindingId: 'binding-1',
        slot: 'buffer',
        candidateType: 'material',
        candidateId: 'MAT-001',
        resolution: 'substitution',
        payload: {
          recordId: 'MAT-001',
          kind: 'material',
        },
        confidence: 0.82,
        provenance: [
          {
            kind: 'record',
            id: 'MAT-001',
            label: 'PBS buffer',
          },
        ],
      },
      {
        bindingId: 'binding-2',
        slot: 'plate',
        candidateType: 'labware',
        candidateId: 'placeholder-plate',
        resolution: 'placeholder',
        payload: {
          recordId: 'placeholder-plate',
          kind: 'placeholder',
        },
        provenance: [
          {
            kind: 'catalog',
            id: 'plate-catalog-entry',
          },
        ],
      },
    ];
    const request: CompilerKernelRequest<MaterialIntent, MaterialCandidate, PlanStep> = {
      normalizedIntent,
      candidateBindings: bindings,
      plan: {
        planId: 'plan-1',
        steps: [
          { kind: 'bind', detail: 'Bind source material' },
          { kind: 'transfer', detail: 'Transfer to destination well' },
        ],
        executionBlockers: ['No active liquid handler is attached to the run.'],
      },
      policyProfiles: [
        {
          id: 'org-default',
          scope: 'organization',
          scopeId: 'org-1',
          settings: {
            allowSubstitutions: 'confirm',
            allowPlaceholders: 'deny',
            approvalAuthority: 'lab-manager',
          },
        },
        {
          id: 'run-override',
          scope: 'run',
          scopeId: 'run-7',
          settings: {
            allowSubstitutions: 'allow',
          },
        },
      ],
      activeScope: {
        organizationId: 'org-1',
        runId: 'run-7',
      },
      knownFacts: {
        destinationWell: 'A1',
      },
      provenance: {
        actor: 'compiler-test',
        notes: [
          {
            stage: 'bind',
            message: 'Used search candidates from the material registry.',
          },
        ],
      },
    };

    const result = kernel.evaluateRequest(request);

    expect(result.normalizedIntent.payload.materialName).toBe('PBS');
    expect(result.candidateBindings[0]?.payload.recordId).toBe('MAT-001');
    expect(result.policy.decisions.map((decision) => decision.disposition)).toEqual([
      'allowed',
      'blocked',
    ]);
    expect(result.diagnostics.some((diagnostic) => diagnostic.outcome === 'needs-missing-fact')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.outcome === 'policy-blocked')).toBe(true);
    expect(result.diagnostics.some((diagnostic) => diagnostic.outcome === 'execution-blocked')).toBe(true);
    expect(result.provenance.actor).toBe('compiler-test');
    expect(result.provenance.sources.some((source) => source.kind === 'policy-profile' && source.id === 'run-override')).toBe(true);
    expect(result.outcome).toBe('policy-blocked');
  });
});
