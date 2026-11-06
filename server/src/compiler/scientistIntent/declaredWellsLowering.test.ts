/**
 * L2-L2-VACUOUS-PINS-DEBT u1b — declared `kind: wells` argument lowering pin.
 *
 * STEP 0 baseline: prove the action builder currently ignores declared
 * `kind: wells` arguments in the step's own intent payload, so
 * `action.targetWells` is absent and the required-argument sweep fires
 * `missing-required-argument`.
 *
 * After the fix: the generic lowering reads `vocabulary.argContracts(verb)`,
 * selects contracts whose declared `kind` is a well-coordinate kind, and
 * copies the step's own intent payload value VERBATIM into `action[contract.name]`.
 */
import { describe, it, expect } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { lowerRealization } from './realizeScientistIntent.js';

// ---------------------------------------------------------------------------
// Minimal fixtures — only what the action builder needs
// ---------------------------------------------------------------------------

function buildFixture(targetWells: unknown) {
  const recordId = 'PRT-addmat';
  return {
    family: {
      recordId,
      steps: [
        {
          stepId: 'step-add',
          label: 'Add material',
          ordinal: 1,
          kind: 'other',
          intent: {
            semanticVerb: { canonical: 'add_material' },
            materialNeeds: [{ need: 'reagent' }],
            targetWells: targetWells,
          },
        },
      ],
    },
    realization: {
      recordId: 'LPR-addmat',
      inherits_from: { kind: 'record', type: 'protocol', id: recordId },
      // Answers the lowering's required-answer gate demands; shape copied from
      // realizationGolden.test.ts:116-147, not from its content.
      branch_resolution: [
        {
          axisId: 'branch-axis-step-1',
          matched: true,
          branchIds: ['branch-1'],
          choices: {
            'branch-axis-step-1': 'manual',
            sample_count: { value: 96, unit: 'wells', dimension: 'count' },
          },
        },
      ],
      labwares: [
        { role: 'sample_plate', ref: { kind: 'record', type: 'labware', id: 'LAB-sample-plate' } },
        { role: 'reagent_reservoir', ref: { kind: 'record', type: 'labware', id: 'LAB-reservoir' } },
      ],
    },
  };
}

// ---------------------------------------------------------------------------
// T1 — string range (e.g. 'A1:H12')
// ---------------------------------------------------------------------------

describe('declared kind:wells lowering — string range', () => {
  it('action carries targetWells from the step intent payload (string)', async () => {
    const { family, realization } = buildFixture('A1:H12');
    const result = await lowerRealization({
      family: family as any,
      realization: realization as any,
    });
    expect('failures' in result).toBe(false);
    if ('failures' in result) return;

    const doc = parseYaml(result.intentYaml);
    const actions = doc.actions as Array<Record<string, unknown>>;
    expect(actions.length).toBeGreaterThanOrEqual(1);
    const addAction = actions.find(
      (a: Record<string, unknown>) => a.action === 'add_material'
    );
    expect(addAction).toBeDefined();
    // The targetWells value must land verbatim — string stays string
    expect(addAction!.targetWells).toBe('A1:H12');
  });
});

// ---------------------------------------------------------------------------
// T2 — array of well labels (e.g. ['A1', 'A2'])
// ---------------------------------------------------------------------------

describe('declared kind:wells lowering — array value', () => {
  it('action carries targetWells from the step intent payload (array)', async () => {
    const { family, realization } = buildFixture(['A1', 'A2']);
    const result = await lowerRealization({
      family: family as any,
      realization: realization as any,
    });
    expect('failures' in result).toBe(false);
    if ('failures' in result) return;

    const doc = parseYaml(result.intentYaml);
    const actions = doc.actions as Array<Record<string, unknown>>;
    expect(actions.length).toBeGreaterThanOrEqual(1);
    const addAction = actions.find(
      (a: Record<string, unknown>) => a.action === 'add_material'
    );
    expect(addAction).toBeDefined();
    // Array stays array — verbatim copy, no expansion
    expect(addAction!.targetWells).toEqual(['A1', 'A2']);
  });
});
