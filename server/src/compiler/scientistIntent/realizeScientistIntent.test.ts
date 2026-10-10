/**
 * W2-7-REALIZATION-SPINE — T3 fail-loud arms, T4 rung/lint arm, T5 verb
 * non-vacuity, T6 policy-is-data. Every arm is RED at base (the module did not
 * exist) and asserts the ACTIONABLE error text naming what + where.
 * Fixtures mirror realizationGolden.test.ts (same derived axes, M1).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import {
  lowerRealization,
  loadRealizationPolicy,
  type ProtocolPayloadLike,
  type LocalProtocolPayloadLike,
  type RealizationFailure,
} from './realizeScientistIntent.js';
import { parseScientistIntent, ScientistIntentValidationError } from './parseScientistIntent.js';
import { deriveBranchAxes } from '../../ingestion/vendor-protocol/deriveBranchAxes.js';
import { deriveStepVariantAxes } from '../../ingestion/vendor-protocol/deriveStepVariantAxes.js';
import { LintEngine } from '../../lint/LintEngine.js';
import type { LintSpec } from '../../lint/types.js';

const LOCAL_PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';
const LOCAL_LINT_PATH = join(process.cwd(), '..', 'schema', 'workflow', 'local-protocol.lint.yaml');

// ---------------------------------------------------------------------------
// Fixtures (same shape as realizationGolden.test.ts)
// ---------------------------------------------------------------------------

const CANDIDATE_STEPS = [
  { id: 'step-1', stepNumber: 1, sectionId: 'sec-96', sourceText: 'Lyse the samples.', branches: ['a. spin column', 'b. plate', 'c. robot'] },
  { id: 'step-2', stepNumber: 2, sectionId: 'sec-96', sourceText: 'For bead beating, follow step 2a. For vortexing, follow step 2b.' },
  { id: 'step-2a', stepNumber: 2, substep: 'a', sectionId: 'sec-96', sourceText: 'Bead beat the lysate.' },
  { id: 'step-2b', stepNumber: 2, substep: 'b', sectionId: 'sec-96', sourceText: 'Vortex the lysate.' },
];
const CANDIDATE_SECTIONS = [{ id: 'sec-96', title: 'ZymoBIOMICS 96 MagBead DNA' }];

function prov(pageStart: number): Record<string, unknown> {
  return { kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-zymo-magbead', pageStart };
}

function familyFixture(): Record<string, unknown> {
  const axes = [
    ...deriveBranchAxes(CANDIDATE_STEPS),
    ...deriveStepVariantAxes(CANDIDATE_STEPS, CANDIDATE_SECTIONS).map((axis) => ({
      axisId: axis.axisId,
      label: axis.question,
      conditions: axis.conditions,
    })),
  ];
  return {
    kind: 'protocol',
    recordId: 'PRT-zymo-w27-family',
    protocolLayer: 'universal',
    title: 'ZymoBIOMICS 96 MagBead DNA (universal family)',
    branch_axes: axes,
    steps: [
      { stepId: 'add-lysis', label: 'Add lysis solution', ordinal: 1, kind: 'other', intent: {
        semanticVerb: { canonical: 'add_material' },
        materialNeeds: [{ need: 'lysis_solution' }],
        provenance: [prov(1)],
      } },
      { stepId: 'step-1', label: 'Lyse the samples', ordinal: 2, kind: 'other', intent: {
        semanticVerb: { canonical: 'transfer' },
        constraints: [{
          class: 'capacity',
          bindingKind: 'hard_bound',
          overridePolicy: 'never-override',
          bound: { value: 200, unit: 'uL', dimension: 'volume' },
          subject: { ref: 'cf:well', role: 'sample_plate', dimensionKey: 'sample_plate:volume', bindingPolicyKey: 'never-override:hard_bound' },
        }],
        provenance: [prov(2)],
      } },
      { stepId: 'step-2a', label: 'Bead beat the lysate', ordinal: 3, kind: 'other', intent: {
        semanticVerb: { canonical: 'mix' },
        materialNeeds: [{ need: 'beads', capabilityRequirement: { kind: 'ontology', id: 'CL:bead_beater', namespace: 'CL', label: 'bead beater' } }],
        provenance: [prov(3)],
      } },
      { stepId: 'step-2b', label: 'Vortex the lysate', ordinal: 4, kind: 'other', intent: {
        semanticVerb: { canonical: 'mix' },
        provenance: [prov(4)],
      } },
      { stepId: 'wash-beads', label: 'Wash the beads', ordinal: 5, kind: 'other', intent: {
        semanticVerb: { canonical: 'wash' },
        materialNeeds: [{ need: 'wash_solution' }],
        provenance: [prov(5)],
      } },
    ],
  };
}

function realizationFixture(): Record<string, unknown> {
  return {
    kind: 'local-protocol',
    recordId: 'LPR-zymo-robot-96',
    protocolLayer: 'lab',
    title: 'ZymoBIOMICS 96 on the ASSIST PLUS (robot realization)',
    status: 'active',
    inherits_from: { kind: 'record', type: 'protocol', id: 'PRT-zymo-w27-family' },
    branch_resolution: [
      {
        axisId: 'branch-axis-step-1',
        matched: true,
        branchIds: ['branch-3'],
        choices: {
          'branch-axis-step-1': 'robot',
          sample_count: { value: 96, unit: 'wells', dimension: 'count' },
        },
      },
      {
        axisId: 'axis-step-2-variant',
        matched: true,
        branchIds: ['vortexing'],
        choices: { 'axis-step-2-variant': 'vortexing' },
      },
    ],
    labwares: [
      { role: 'sample_plate', ref: { kind: 'record', type: 'labware', id: 'LAB-sample-plate' } },
      { role: 'reagent_reservoir', ref: { kind: 'record', type: 'labware', id: 'LAB-reservoir' } },
      { role: 'sample plate definition', ref: { kind: 'record', type: 'labware-definition', id: 'lbw-def-generic-96-well-plate' } },
      { role: 'reservoir definition', ref: { kind: 'record', type: 'labware-definition', id: 'lbw-def-generic-reservoir-1-v1' } },
      { role: 'reservoir definition alt', ref: { kind: 'record', type: 'labware-definition', id: 'lbw-def-generic-12-well-reservoir' } },
    ],
    equipment: [
      { role: 'multichannel pipette', ref: { kind: 'record', type: 'pipette-capability', id: 'pipette-capability/p20-multi-8' } },
    ],
    materials: [
      { role: 'lysis_solution', ref: { kind: 'record', type: 'material', id: 'MAT-lysis' } },
      { role: 'wash_solution', ref: { kind: 'record', type: 'aliquot', id: 'ALI-wash' } },
    ],
  };
}

function cloneFixture<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}

function codes(result: { failures?: RealizationFailure[] }): string[] {
  return (result.failures ?? []).map((f) => f.code);
}
function messages(result: { failures?: RealizationFailure[] }): string {
  return (result.failures ?? []).map((f) => f.message).join('\n');
}

async function lower(family: Record<string, unknown>, realization: Record<string, unknown>) {
  return lowerRealization({
    family: family as unknown as ProtocolPayloadLike,
    realization: realization as unknown as LocalProtocolPayloadLike,
  });
}

// ---------------------------------------------------------------------------
// T3 fail-loud arms (AC4)
// ---------------------------------------------------------------------------

describe('W2-7 T3 fail-loud arms (AC4)', () => {

  it('(a1) missing capability: the p20-multi-8 equipment row removed -> REALIZATION_CAPABILITY_MISSING naming role + capability', async () => {
    const lpr = cloneFixture(realizationFixture());
    lpr.equipment = [];
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_CAPABILITY_MISSING');
    const text = messages(result);
    expect(text).toContain('pipette-capability/p20-multi-8');
    expect(text).toContain('equipment');
    expect(text).toContain('robot-assist-plus-96');
    expect('intentYaml' in result).toBe(false);
  });

  it('(a2) bead-beater branch selected without the CL: capability bound -> REALIZATION_CAPABILITY_MISSING (CL:bead_beater arm)', async () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<Record<string, unknown>>;
    resolution[1].branchIds = ['bead-beating'];
    resolution[1].choices = { 'axis-step-2-variant': 'bead-beating' };
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_CAPABILITY_MISSING');
    const text = messages(result);
    expect(text).toContain('CL:bead_beater');
    expect(text).toContain('step-2a');
  });

  it('(b) count/volume conflation (dimension count + unit uL) fails at the shipped Quantity SCHEMA (Ajv path), never a TS branch', async () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<{ choices: Record<string, unknown> }>;
    // The classic collapse: the count answer carries a VOLUME unit.
    resolution[0].choices.sample_count = { value: 200, unit: 'uL', dimension: 'count' };
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_ANSWER_INVALID');
    const text = messages(result);
    // The Ajv errors rode the failure verbatim — the quantity schema's
    // if/then unit enum (count -> cells|beads|wells|...) rejected uL.
    expect(text).toContain('quantity schema');
    expect(text).toContain('Ajv');
    expect(text).toContain('uL');
    expect('intentYaml' in result).toBe(false);
  });

  it('(c) guessed default: sample_count omitted -> REALIZATION_ANSWER_MISSING BEFORE compile; the frozen pipeline alone never asks', async () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<{ choices: Record<string, unknown> }>;
    delete resolution[0].choices.sample_count;
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_ANSWER_MISSING');
    const text = messages(result);
    expect(text).toContain('sample_count');
    expect(text).toContain('branch_resolution[].choices');
    expect('intentYaml' in result).toBe(false);

    // Bypass probe: the SAME family lowered WITH the answer compiles — the
    // refusal is the upstream gate (OQ4(a)); ChatbotCompilePasses' 8-sample
    // default stays untouched (proved by the noBypass suite's diff-empty arm).
    const ok = await lower(familyFixture(), realizationFixture());
    expect('intentYaml' in ok).toBe(true);
  });

  it('(d) unresolved required axis: a declared axis with no matched resolution -> REALIZATION_BRANCH_UNRESOLVED naming axisId + question, zero YAML', async () => {
    const lpr = cloneFixture(realizationFixture());
    lpr.branch_resolution = (lpr.branch_resolution as Array<Record<string, unknown>>).slice(0, 1);
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_BRANCH_UNRESOLVED');
    const text = messages(result);
    expect(text).toContain('axis-step-2-variant');
    // the axis question rode the error (family label = the derived question)
    expect(text).toContain('variant');
    expect('intentYaml' in result).toBe(false);
  });

  it('(d+) masquerading branch id: a vendor step id in branchIds fails loudly', async () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<{ branchIds: string[] }>;
    resolution[0].branchIds = ['step-1'];
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_BRANCH_ID_MASQUERADE');
    expect(messages(result)).toContain('never from vendor candidate step ids');
  });

  it('(e) disallowed substitution: hard_bound under lab-may-relax (undeclared pair) -> REALIZATION_SUBSTITUTION_DISALLOWED citing class + policy id', async () => {
    const family = cloneFixture(familyFixture());
    const steps = family.steps as Array<{ stepId: string; intent: Record<string, unknown> }>;
    const survivor = steps.find((s) => s.stepId === 'step-1')!;
    survivor.intent.constraints = [{
      class: 'capacity',
      bindingKind: 'hard_bound',
      overridePolicy: 'lab-may-relax',
      bound: { value: 200, unit: 'uL', dimension: 'volume' },
      subject: { ref: 'cf:well', role: 'sample_plate', dimensionKey: 'sample_plate:volume', bindingPolicyKey: 'lab-may-relax:hard_bound' },
    }];
    const lpr = cloneFixture(realizationFixture());
    lpr.overrides = { substitutions: [{ role: 'sample_plate', material_ref: { kind: 'record', type: 'material', id: 'MAT-other' }, rationale: 'lab swapped the plate' }] };
    const result = await lower(family, lpr);
    expect(codes(result)).toContain('REALIZATION_SUBSTITUTION_DISALLOWED');
    const text = messages(result);
    expect(text).toContain('capacity');
    expect(text).toContain('hard_bound');
    expect(text).toContain('lab-may-relax:hard_bound');
    expect(text).toContain('policyBindingKey');
  });

  it('(e-flip) permissive pair (lab-may-relax:vendor_default) passes and is recorded', async () => {
    const family = cloneFixture(familyFixture());
    const steps = family.steps as Array<{ stepId: string; intent: Record<string, unknown> }>;
    const survivor = steps.find((s) => s.stepId === 'step-1')!;
    survivor.intent.constraints = [{
      class: 'vendor_default',
      bindingKind: 'vendor_default',
      overridePolicy: 'lab-may-relax',
      bound: { value: 200, unit: 'uL', dimension: 'volume' },
      subject: { ref: 'cf:well', role: 'sample_plate', dimensionKey: 'sample_plate:volume', bindingPolicyKey: 'lab-may-relax:vendor_default' },
    }];
    const lpr = cloneFixture(realizationFixture());
    lpr.overrides = { substitutions: [{ role: 'sample_plate', material_ref: { kind: 'record', type: 'material', id: 'MAT-other' }, rationale: 'lab swapped the plate' }] };
    const result = await lower(family, lpr);
    expect(result.failures ?? []).toEqual([]);
    expect('intentYaml' in result).toBe(true);
  });

  it('inherits_from mismatch -> REALIZATION_INHERITS_MISMATCH', async () => {
    const lpr = cloneFixture(realizationFixture());
    (lpr.inherits_from as Record<string, unknown>).id = 'PRT-some-other-family';
    const result = await lower(familyFixture(), lpr);
    expect(codes(result)).toContain('REALIZATION_INHERITS_MISMATCH');
  });
});

// ---------------------------------------------------------------------------
// T4 rung discipline + W2-4 R1 satisfaction (AC3)
// ---------------------------------------------------------------------------

describe('W2-7 T4 — W2-4 lint R1 fires on a matched-without-choices realization (satisfies, never duplicates)', () => {

  function localEngine(): LintEngine {
    const spec = parseYaml(readFileSync(LOCAL_LINT_PATH, 'utf-8')) as LintSpec;
    const engine = new LintEngine();
    engine.addSpec('local-protocol', spec);
    return engine;
  }

  it('the T3d-style payload (matched, choices absent) is a prov-local-choices-recorded ERROR', () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<Record<string, unknown>>;
    delete resolution[0].choices;
    const result = localEngine().lint(lpr, LOCAL_PROTOCOL_ID);
    const errors = result.violations.filter((v) => v.severity === 'error');
    expect(errors.some((v) => v.ruleId === 'prov-local-choices-recorded')).toBe(true);
  });

  it('the same payload with choices: {} fires too (PathResolver.isEmpty semantics — {} is EMPTY)', () => {
    const lpr = cloneFixture(realizationFixture());
    const resolution = lpr.branch_resolution as Array<Record<string, unknown>>;
    resolution[0].choices = {};
    const result = localEngine().lint(lpr, LOCAL_PROTOCOL_ID);
    expect(result.violations.some((v) => v.ruleId === 'prov-local-choices-recorded')).toBe(true);
  });

  it('W2-7 golden payload is R1-GREEN (zero prov-local ERRORs) — the shape (a) carrier satisfies merged R1', () => {
    const result = localEngine().lint(realizationFixture(), LOCAL_PROTOCOL_ID);
    const errors = result.violations.filter((v) => v.severity === 'error');
    expect(errors.filter((v) => v.ruleId.startsWith('prov-local-'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T5 verb-adjudication non-vacuity (two independent doors)
// ---------------------------------------------------------------------------

describe('W2-7 T5 verb adjudication (bait #5)', () => {

  it('canonical flipped to `heat` -> REALIZATION_VERB_UNADJUDICATED (protocol_semantic_only, never folded to incubate)', async () => {
    const family = cloneFixture(familyFixture());
    const steps = family.steps as Array<{ stepId: string; intent: Record<string, unknown> }>;
    steps[1].intent.semanticVerb = { canonical: 'heat' };
    const result = await lower(family, realizationFixture());
    expect(codes(result)).toContain('REALIZATION_VERB_UNADJUDICATED');
    expect(messages(result)).toContain('heat');
    expect(messages(result)).toContain('protocol_semantic_only');
  });

  it('canonical flipped to neologism `vortex` -> refused at L5 AND by the real Ajv contract (two doors)', async () => {
    const family = cloneFixture(familyFixture());
    const steps = family.steps as Array<{ stepId: string; intent: Record<string, unknown> }>;
    steps[1].intent.semanticVerb = { canonical: 'vortex' };
    const result = await lower(family, realizationFixture());
    expect(codes(result)).toContain('REALIZATION_VERB_UNADJUDICATED');
    expect(messages(result)).toContain('vortex');

    // Door 2: a document that DID carry the fabricated verb is rejected by the
    // frozen contract itself.
    const fabricated = 'intentId: w27-fake\nactions:\n  - action: vortex\n    labware: sample_plate\n';
    expect(() => parseScientistIntent(fabricated)).toThrow(ScientistIntentValidationError);
  });

  it('same_operation canonical `shake` maps via the adjudication table (data lookup, not a TS verb list)', async () => {
    const family = cloneFixture(familyFixture());
    const steps = family.steps as Array<{ stepId: string; intent: Record<string, unknown> }>;
    // step-2b (the selected vortex-variant step) carries no volume constraint,
    // so the mapped verb lowers cleanly.
    steps[3].intent.semanticVerb = { canonical: 'shake' };
    const result = await lower(family, realizationFixture());
    expect('intentYaml' in result).toBe(true);
    if ('intentYaml' in result) expect(result.intentYaml).toContain('action: shake');
  });
});

// ---------------------------------------------------------------------------
// T6 policy-is-data (bait #6): the binding lives in the YAML, not the code
// ---------------------------------------------------------------------------

describe('W2-7 T6 policy-is-data (AC: substitution policy + bindings ride data)', () => {

  it('editing the policy YAML scaleBinding (robot -> robot-opentrons-ot2-96) changes the emitted labels with ZERO code edits', async () => {
    const policyPath = join(process.cwd(), '..', 'schema', 'registry', 'realization', 'robot-realization.policy.yaml');
    const original = readFileSync(policyPath, 'utf-8');
    const tempPath = join(tmpdir(), `w27-policy-swap-${process.pid}.yaml`);
    try {
      const swapped = original.replace('scaleProfileId: robot-assist-plus-96', 'scaleProfileId: robot-opentrons-ot2-96');
      expect(swapped).not.toBe(original);
      writeFileSync(tempPath, swapped, 'utf-8');

      const policy = loadRealizationPolicy(tempPath);
      const result = await lowerRealization({
        family: familyFixture() as unknown as ProtocolPayloadLike,
        realization: realizationFixture() as unknown as LocalProtocolPayloadLike,
        policy,
      });
      expect('intentYaml' in result).toBe(true);
      if (!('intentYaml' in result)) return;
      // The OT-2 profile's OWN reagent source (12-well reservoir) rode the labels.
      expect(result.intentYaml).toContain('lbw-def-generic-12-well-reservoir');
      expect(result.intentYaml).not.toContain('lbw-def-generic-reservoir-1-v1');
      expect(result.scaleProfile?.id).toBe('robot-opentrons-ot2-96');
    } finally {
      // The shipped policy file is byte-untouched (the swap lived in a temp copy).
      expect(readFileSync(policyPath, 'utf-8')).toBe(original);
    }
  });
});
