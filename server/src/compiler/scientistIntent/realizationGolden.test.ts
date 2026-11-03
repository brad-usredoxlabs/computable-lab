/**
 * W2-7-REALIZATION-SPINE — T1 golden + T2 determinism + T4 rung grep + OQ3
 * deck observation. Headless; inline fixtures (goldens/ untouched).
 *
 * Harness canon: REAL parseScientistIntent (Ajv sole authority), REAL shipped
 * vocabulary, REAL pipeline YAML, store-backed spine via the production
 * createResolveSpineFromContext composition (IntentCompileHandlers.ts:59-62
 * precedent — createResolveSpine({}) is BANNED here). Zero vi.mock.
 *
 * The family fixture consumes the MERGED W2-6 axis machinery verbatim (M1):
 * branch_axes = deriveBranchAxes(steps) + deriveStepVariantAxes(steps,
 * sections) (question -> label per the pdt-axis-to-branch-axis mapping data
 * flow; choiceKey not carried into the BranchAxis arm). Axes are NOT
 * re-derived by hand.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { deriveBranchAxes } from '../../ingestion/vendor-protocol/deriveBranchAxes.js';
import { deriveStepVariantAxes } from '../../ingestion/vendor-protocol/deriveStepVariantAxes.js';
import {
  lowerRealization,
  realizeAndCompile,
  loadRealizationPolicy,
  type ProtocolPayloadLike,
  type LocalProtocolPayloadLike,
} from './realizeScientistIntent.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { recordingStore, stableStringify } from './goldens/replayKernel.js';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator } from '../../validation/AjvValidator.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const LOCAL_PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/local-protocol.schema.yaml';

// ---------------------------------------------------------------------------
// Fixtures (inline; the golden does NOT persist records — A2)
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
        // OQ2/M5 shape (a): { [axisId]: chosenValue } — merged R1 requires
        // matched -> nonEmpty choices; it does NOT read inside choices.
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

function goldenStore() {
  return recordingStore([
    { recordId: 'LAB-sample-plate', payload: { kind: 'labware', title: 'Sample Plate', synonyms: ['sample_plate', 'sample plate'] } },
    { recordId: 'LAB-reservoir', payload: { kind: 'labware', title: 'Reagent Reservoir', synonyms: ['reagent_reservoir', 'reagent reservoir'] } },
    { recordId: 'MAT-lysis', payload: { kind: 'material', title: 'Lysis Solution', synonyms: ['lysis_solution'] } },
    { recordId: 'ALI-wash', payload: { kind: 'aliquot', title: 'Wash Solution', label: 'wash_solution' } },
  ]);
}

// The goldens canon (replayKernel.ts:271) drops incidental random event ids
// `evt-${verb}-${Math.random().toString(36).slice(2,10)}` (BiologyVerbExpander.ts:74,
// a hard-stop file). The shipped regex's verb class `[a-z0-9_]+` misses the
// compound expander's hyphenated segments (`evt-wash-add-…`), so this test
// mirrors the canon with the extended verb class. Event COUNT and every value
// stay asserted; only incidental ids are normalized (task text: "only
// incidental ids/timestamps normalized").
const INCIDENTAL_EVENT_ID = /^evt-[a-z0-9_-]+-[a-z0-9]{8}(_r\d+)?$/;
function normalizeIncidental(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map((item) => normalizeIncidental(item));
  if (obj && typeof obj === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (key === 'eventId' && typeof value === 'string' && INCIDENTAL_EVENT_ID.test(value)) continue;
      out[key] = normalizeIncidental(value);
    }
    return out;
  }
  return obj;
}

async function schemaValidator() {
  const result = await loadAllSchemas({ basePath: join(process.cwd(), '..', 'schema') });
  expect(result.errors).toEqual([]);
  const registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  const validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
  return validator;
}

// ---------------------------------------------------------------------------
// T1 golden happy leg
// ---------------------------------------------------------------------------

describe('W2-7 T1 golden — family + robot answers -> local-protocol -> intent YAML -> run graph', () => {

  it('fixtures validate against the REAL merged schemas (protocol + local-protocol)', async () => {
    const validator = await schemaValidator();
    const fam = validator.validate(familyFixture(), PROTOCOL_ID);
    expect(fam.errors ?? []).toEqual([]);
    const lpr = validator.validate(realizationFixture(), LOCAL_PROTOCOL_ID);
    expect(lpr.errors ?? []).toEqual([]);
  });

  it('lowerRealization emits a contract-valid scientist-intent YAML (AC1)', async () => {
    const lowered = await lowerRealization({
      family: familyFixture() as unknown as ProtocolPayloadLike,
      realization: realizationFixture() as unknown as LocalProtocolPayloadLike,
    });
    expect('intentYaml' in lowered).toBe(true);
    if (!('intentYaml' in lowered)) return;

    // (a) the REAL Ajv contract accepts the emitted document
    const doc = parseScientistIntent(lowered.intentYaml);
    expect(doc.actions.length).toBeGreaterThanOrEqual(3);

    // (b) every action is an enum member — zero fabricated verbs
    const vocabulary = defaultScientistIntentVocabulary();
    for (const action of doc.actions) {
      expect(vocabulary.has(action.action)).toBe(true);
    }

    // profile-sourced SYMBOLIC labels rode the emission (gate+labels depth, OQ3)
    expect(lowered.intentYaml).toContain('sample_plate');
    expect(lowered.intentYaml).toContain('reagent_reservoir');
    expect(lowered.intentYaml).toContain('lbw-def-generic-96-well-plate');
    expect(lowered.intentYaml).toContain('lbw-def-generic-reservoir-1-v1');
    expect(lowered.activeStepIds).toContain('step-1');
    expect(lowered.activeStepIds).toContain('step-2b');
    expect(lowered.activeStepIds).not.toContain('step-2a');
  });

  it('branch_resolution: robot axis matched, branchIds are FAMILY condition ids, choices carry the recorded-choice carrier (AC3)', async () => {
    const lpr = realizationFixture();
    const family = familyFixture() as { branch_axes: Array<{ axisId: string; conditions: Array<{ id: string }> }> };
    const resolution = lpr.branch_resolution as Array<{ axisId: string; matched: boolean; branchIds: string[]; choices: Record<string, unknown> }>;
    for (const entry of resolution) {
      const axis = family.branch_axes.find((a) => a.axisId === entry.axisId)!;
      expect(entry.matched).toBe(true);
      expect(Object.keys(entry.choices).length).toBeGreaterThan(0);
      for (const branchId of entry.branchIds) {
        expect(axis.conditions.map((c) => c.id)).toContain(branchId);
      }
    }
    const robot = resolution.find((r) => r.axisId === 'branch-axis-step-1')!;
    expect(robot.choices['branch-axis-step-1']).toBe('robot');
  });

  it('realizeAndCompile -> compileScientistIntent outcome complete + non-empty events (AC1)', async () => {
    const recorder = goldenStore();
    const spine = createResolveSpineFromContext({ store: recorder.store as never });
    const result = await realizeAndCompile({
      family: familyFixture() as unknown as ProtocolPayloadLike,
      realization: realizationFixture() as unknown as LocalProtocolPayloadLike,
      compileDeps: { spine },
    });
    expect('compile' in result).toBe(true);
    if (!('compile' in result)) return;
    console.log('W27_CLARIFICATIONS', JSON.stringify(result.compile.clarifications, null, 1).slice(0, 1200));
    expect(result.compile.outcome).toBe('complete');
    expect(result.compile.terminalArtifacts.events.length).toBeGreaterThan(0);
    expect(recorder.writeCalls()).toBe(0);

    // OQ3 CAMT-at-claim observation: how deeply the frozen deck pass saw the
    // profile-sourced labels (recorded for the report; no pipeline edit).
    const artifacts = result.compile.terminalArtifacts;
    console.log('W27_DECK_OBSERVATION', JSON.stringify({
      deckLayoutPlan: artifacts.deckLayoutPlan ?? null,
      labwareAdditions: artifacts.labwareAdditions ?? null,
      labwareRequirements: artifacts.labwareRequirements ?? null,
      resourceManifestTipRacks: artifacts.resourceManifest?.tipRacks ?? null,
    }, null, 1).slice(0, 2000));
  });
});

// ---------------------------------------------------------------------------
// T2 determinism — BYTE compare, three runs (two in-process + YAML reload)
// ---------------------------------------------------------------------------

describe('W2-7 T2 determinism — identical inputs => byte-identical output (AC2)', () => {

  it('two full-chain runs + a fresh-policy-reload run are byte-equal', async () => {
    const run = async (policyPath?: string): Promise<{ yaml: string; artifacts: string; eventCount: number }> => {
      const recorder = goldenStore();
      const spine = createResolveSpineFromContext({ store: recorder.store as never });
      const policy = policyPath ? loadRealizationPolicy(policyPath) : undefined;
      const result = await realizeAndCompile({
        family: familyFixture() as unknown as ProtocolPayloadLike,
        realization: realizationFixture() as unknown as LocalProtocolPayloadLike,
        ...(policy ? { policy } : {}),
        compileDeps: { spine },
      });
      if (!('compile' in result)) throw new Error(`lowering failed: ${JSON.stringify(result.failures)}`);
      // The emitted YAML is compared RAW (the lowerer is pure). The run graph
      // is compared through the goldens harness's ONE pure normalizer
      // (replayKernel normalizeReplay/stableStringify — the shipped canon for
      // incidental random event ids minted by BiologyVerbExpander.ts:74, a
      // hard-stop file; "only incidental ids/timestamps normalized" per the
      // task text). Event COUNT and every value stay asserted.
      return {
        yaml: result.intentYaml,
        artifacts: stableStringify(normalizeIncidental(result.compile.terminalArtifacts)),
        eventCount: result.compile.terminalArtifacts.events.length,
      };
    };

    const runA = await run();
    const runB = await run();
    const runC = await run(join(process.cwd(), '..', 'schema', 'registry', 'realization', 'robot-realization.policy.yaml'));

    expect(runB.yaml).toBe(runA.yaml);
    expect(runC.yaml).toBe(runA.yaml);
    if (runB.artifacts !== runA.artifacts) { let i = 0; while (i < runA.artifacts.length && runA.artifacts[i] === runB.artifacts[i]) i++; console.log('W27_DET_DIFF at', i, JSON.stringify(runA.artifacts.slice(Math.max(0, i - 80), i + 120)), 'VS', JSON.stringify(runB.artifacts.slice(Math.max(0, i - 80), i + 120))); }
    expect(runB.artifacts).toBe(runA.artifacts);
    expect(runC.artifacts).toBe(runA.artifacts);
    expect(runA.eventCount).toBeGreaterThan(0);
    expect(runB.eventCount).toBe(runA.eventCount);
  });
});

// ---------------------------------------------------------------------------
// T4 (grep arm) — rung discipline: ZERO rung string literals in product TS
// ---------------------------------------------------------------------------

describe('W2-7 T4 rung discipline (AC3, bait #7)', () => {

  it('the product module contains ZERO rung string literals (rung vocabulary is W2-4 data)', () => {
    const sourcePath = fileURLToPath(new URL('./realizeScientistIntent.ts', import.meta.url));
    const source = readFileSync(sourcePath, 'utf-8');
    const hits = source.match(/VENDOR|DERIVED|INFERRED_INVARIANT|LOCAL_REALIZATION/g) ?? [];
    expect(hits).toEqual([]);
  });
});
