/**
 * W2-6-SEMANTIC-PASS — T1/T3/T5/T6 unit harness (spec §6, W4).
 *
 * A fake InferenceClient records every CompletionRequest — NO HTTP at all.
 * The Zymo candidate is decoded from the real golden PDF (same chain
 * ZymoGoldenE2E.test.ts proves), so the completeness arms run against the
 * REAL full candidate.
 *
 * Arms:
 *  T1  full-candidate capture (A1/D4): exactly ONE complete() call; the user
 *      message contains literally all 17 step ids, both branchy steps' branch
 *      sentences, all 3 section ids incl. the specifications-section content,
 *      both table ids + headers, all 20/10/10 material/equipment/labware ids,
 *      source.pageCount; NO 'activeStep' concept anywhere in the built prompt.
 *  T3  Zymo golden draft leg (A2/A3): canned intent-step answer -> pass ->
 *      XDR persisted; draft payload validates against the MERGED protocol
 *      schema via Ajv AND zero ERROR-severity findings from LintEngine at
 *      protocol scope; branch_axes deep-equal the deterministic
 *      deriveBranchAxes+deriveStepVariantAxes output (Zymo: the step-1/step-4
 *      shared question is ONE axis); all axes retained.
 *  T5  anchor discipline: (a) pageStart beyond pageCount, (b) ref.id of
 *      another document, (c) ref pointing at a nonexistent sectionId,
 *      (d) correct copy kept verbatim — (a-c) ref dropped + span recorded +
 *      draft survives unanchored; VPC record sha byte-identical in every arm.
 *  T6  nothing-asked / nothing-deleted / axes-discarded: omitted step ->
 *      SEMANTIC_PASS_STEP_COVERAGE with ZERO writes; model-minted
 *      branch_axes/questions/activeStepIds -> stripped, family axes ==
 *      deterministic axes, strips recorded; finish_reason 'length' ->
 *      SEMANTIC_PASS_TRUNCATED naming maxTokens, zero writes; prose-only ->
 *      SEMANTIC_PASS_PARSE_FAILED, zero writes.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator } from '../../validation/AjvValidator.js';
import { LintEngine } from '../../lint/LintEngine.js';
import type { LintSpec } from '../../lint/types.js';
import {
  buildSemanticFamilyPrompt,
  runSemanticFamilyPass,
  SEMANTIC_PASS_NO_CANDIDATE,
  SEMANTIC_PASS_TRUNCATED,
  SEMANTIC_PASS_PARSE_FAILED,
  type SemanticPassDeps,
} from './SemanticFamilyPass.js';
import {
  SEMANTIC_PASS_ANCHOR_UNRESOLVED,
  SEMANTIC_PASS_AXES_DISCARDED,
  SEMANTIC_PASS_STEP_COVERAGE,
} from './semanticPassGuards.js';
import { loadZymoCandidate, fakeInferenceClient, zymoIntentAnswer as zymoIntentAnswerShared } from './semanticPassFixtures.js';
import type { ProtocolCandidate } from './types.js';

const PROTOCOL_ID = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';
const CANDIDATE_ID = 'CAN-w26-zymo';

const schemaRoot = join(process.cwd(), '..', 'schema');
const protocolLintPath = join(schemaRoot, 'workflow', 'protocol.lint.yaml');

let candidate: ProtocolCandidate;
let validator: ReturnType<typeof createValidator>;

beforeAll(async () => {
  candidate = await loadZymoCandidate();
  const result = await loadAllSchemas({ basePath: schemaRoot });
  expect(result.errors).toEqual([]);
  const registry = createSchemaRegistry();
  registry.addSchemas(result.entries);
  validator = createValidator({ strict: false });
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
}, 120000);

// ---------------------------------------------------------------------------
// In-memory store double (get/create only — the pass never updates/deletes)
// ---------------------------------------------------------------------------

function fakeStore(seed: Record<string, unknown>) {
  const records = new Map<string, Record<string, unknown>>();
  records.set(CANDIDATE_ID, seed);
  const writes: string[] = [];
  return {
    store: {
      async get(recordId: string) {
        const payload = records.get(recordId);
        return payload ? { recordId, schemaId: 'x', payload } : null;
      },
      async create(options: { envelope: { recordId: string; payload: Record<string, unknown> } }) {
        writes.push(options.envelope.recordId);
        records.set(options.envelope.recordId, options.envelope.payload);
        return { success: true as const };
      },
    } as unknown as SemanticPassDeps['store'],
    records,
    writes,
  };
}

function inference(over: Record<string, unknown> = {}) {
  return { baseUrl: 'http://inference.invalid/v1', model: 'configured-model', ...over };
}

// ---------------------------------------------------------------------------
// Canned answers over the Zymo candidate
// ---------------------------------------------------------------------------

/** Shared fixture answer over the decoded Zymo candidate (see
 *  semanticPassFixtures.ts): 17 intent steps, two DERIVED intents WITH copied
 *  anchors, one invariant conclusion WITHOUT an anchor. */
function zymoIntentAnswer() {
  return zymoIntentAnswerShared(candidate, CANDIDATE_ID);
}

function protocolLintEngine(): LintEngine {
  const spec = parseYaml(readFileSync(protocolLintPath, 'utf-8')) as LintSpec;
  const eng = new LintEngine();
  eng.addSpec('protocol', spec);
  return eng;
}

// ---------------------------------------------------------------------------

describe('W2-6 T1: full-candidate capture (A1 / D4)', () => {
  it('exactly ONE complete() call whose user message carries the FULL candidate', async () => {
    const { store } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client, calls } = fakeInferenceClient({ content: JSON.stringify(zymoIntentAnswer()) });

    const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    expect(result.ok).toBe(true);

    // ONE call, no loop, no re-ask.
    expect(calls.length).toBe(1);

    const req = calls[0]!.request;
    const messages = req.messages as Array<{ role: string; content: string }>;
    expect(messages.map(m => m.role)).toEqual(['system', 'user']);
    const user = messages[1]!.content;

    // All 17 step ids, literally.
    for (const step of candidate.steps) {
      expect(user).toContain(step.id);
    }
    // Both branchy steps' branch sentences, literally (the filtered legacy
    // route drops these — the full candidate must carry them).
    const branchy = candidate.steps.filter(s => (s.branches ?? []).length >= 2);
    expect(branchy.map(s => s.id)).toEqual(['step-1', 'step-4']);
    for (const step of branchy) {
      for (const branch of step.branches) expect(user).toContain(branch);
    }
    // All 3 section ids incl. the specifications section.
    for (const section of candidate.sections) {
      expect(user).toContain(section.id);
      expect(user).toContain(section.title);
    }
    expect(candidate.sections.map(s => s.kind)).toContain('specifications');
    // Both table ids + headers.
    for (const table of candidate.tables) {
      expect(user).toContain(table.id);
      for (const header of table.headers) expect(user).toContain(header);
    }
    // All 20/10/10 material/equipment/labware ids.
    expect(candidate.materials).toHaveLength(20);
    expect(candidate.equipment).toHaveLength(10);
    expect(candidate.labware).toHaveLength(10);
    for (const item of [...candidate.materials, ...candidate.equipment, ...candidate.labware]) {
      expect(user).toContain(item.id);
    }
    // source.pageCount rides the payload.
    expect(user).toContain(String(candidate.source.pageCount));

    // NO activeStepIds concept anywhere in the built prompt (system or user).
    const whole = messages.map(m => m.content).join('\n');
    expect(whole).not.toMatch(/activeStep/i);
  });

  it('buildSemanticFamilyPrompt serializes the whole candidate JSON verbatim', () => {
    const built = buildSemanticFamilyPrompt(candidate as unknown as Record<string, unknown>, CANDIDATE_ID);
    expect(built.user.startsWith(JSON.stringify(candidate))).toBe(true);
    expect(built.user).toContain('ID INDEX');
    expect(built.user).toContain(CANDIDATE_ID);
    expect(built.system).not.toMatch(/activeStep/i);
  });

  it('SEMANTIC_PASS_NO_CANDIDATE when the record is absent or the wrong kind', async () => {
    const { store } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client } = fakeInferenceClient();
    const missing = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: 'CAN-nope' });
    if (missing.ok) expect.unreachable();
    expect(missing.error).toBe(SEMANTIC_PASS_NO_CANDIDATE);

    const { store: wrongStore } = fakeStore({ kind: 'protocol', recordId: CANDIDATE_ID });
    const wrong = await runSemanticFamilyPass({ store: wrongStore, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    if (wrong.ok) expect.unreachable();
    expect(wrong.error).toBe(SEMANTIC_PASS_NO_CANDIDATE);
  });
});

describe('W2-6 T3: Zymo golden draft leg (A2 / A3)', () => {
  it('pass lands an XDR whose protocol draft validates (Ajv) + zero lint ERRORS + deterministic axes', async () => {
    const { store, records, writes } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client } = fakeInferenceClient({ content: JSON.stringify(zymoIntentAnswer()) });

    const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.recordId).toMatch(/^XDR-/);
    expect(writes).toEqual([result.recordId]);

    const xdr = records.get(result.recordId)!;
    expect(xdr.kind).toBe('extraction-draft');
    const candidates = xdr.candidates as Array<Record<string, unknown>>;
    expect(candidates).toHaveLength(1);
    expect(candidates[0]!.target_kind).toBe('protocol');

    const protocolDraft = candidates[0]!.draft as Record<string, unknown>;

    // Ajv against the MERGED protocol schema (the same whole-tree validator
    // harness Wave2ProtocolIntentSchema.test.ts uses).
    const validation = validator.validate(protocolDraft, PROTOCOL_ID);
    expect(validation.errors ?? []).toEqual([]);

    // LintEngine at protocol scope: zero ERROR-severity findings (the
    // anchor-less invariant step rides the W2-3 provenance-visible WARNING).
    const lint = protocolLintEngine().lint(protocolDraft, PROTOCOL_ID);
    const errors = lint.violations.filter(f => f.severity === 'error');
    expect(errors.map(e => `${e.ruleId}: ${e.message}`)).toEqual([]);
    const warnings = lint.violations.filter(f => f.severity === 'warning');
    expect(warnings.some(f => f.ruleId === 'intent-step-provenance-visible')).toBe(true);

    // Axes: deep-equal the deterministic derivation; Zymo's step-1/step-4
    // shared question is ONE axis (the grouping suite's own claim); all axes
    // retained.
    const { deriveBranchAxes } = await import('./deriveBranchAxes.js');
    const { deriveStepVariantAxes } = await import('./deriveStepVariantAxes.js');
    const expectedAxes = [
      ...deriveBranchAxes(candidate.steps),
      ...deriveStepVariantAxes(candidate.steps, candidate.sections),
    ];
    expect(protocolDraft.branch_axes).toEqual(expectedAxes);
    expect(expectedAxes.length).toBe(1);
    const axis = expectedAxes[0]!;
    expect(axis.axisId).not.toContain('step-1');
    expect(axis.conditions.map(c => c.then_stepIds)).toEqual([['step-1', 'step-4'], ['step-1', 'step-4']]);
    expect(result.diagnostics.axesCount).toBe(1);

    // 17 intent steps mirrored, all with the intent discriminator.
    const steps = protocolDraft.steps as Array<Record<string, unknown>>;
    expect(steps).toHaveLength(17);
    expect(steps.every(s => 'intent' in s)).toBe(true);
    // The invariant conclusion stands unanchored (provenance absent = data).
    expect(steps[16]!.intent).not.toHaveProperty('provenance');
  });
});

describe('W2-6 T5: anchor discipline (drop-not-rewrite)', () => {
  interface Arm {
    name: string;
    mutate: (answer: ReturnType<typeof zymoIntentAnswer>) => void;
    expectDropped: boolean;
  }
  const arms: Arm[] = [
    {
      name: 'pageStart beyond source.pageCount',
      mutate: (a) => {
        const intent = a.steps[0]!.intent as Record<string, unknown>;
        intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: CANDIDATE_ID, pageStart: candidate.source.pageCount + 1 }];
      },
      expectDropped: true,
    },
    {
      name: 'ref.id names another document',
      mutate: (a) => {
        const intent = a.steps[1]!.intent as Record<string, unknown>;
        intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-some-other-doc', pageStart: 2 }];
      },
      expectDropped: true,
    },
    {
      name: 'sectionId names a nonexistent section',
      mutate: (a) => {
        const intent = a.steps[2]!.intent as Record<string, unknown>;
        intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: CANDIDATE_ID, pageStart: 2, sectionId: 'section-does-not-exist' }];
      },
      expectDropped: true,
    },
    {
      name: 'correct copied anchor is kept verbatim',
      mutate: (a) => {
        const intent = a.steps[3]!.intent as Record<string, unknown>;
        intent.provenance = [{ kind: 'record', type: 'vendor-protocol-candidate', id: CANDIDATE_ID, pageStart: 2, sectionId: 'section-protocol' }];
      },
      expectDropped: false,
    },
  ];

  for (const arm of arms) {
    it(`(${arm.name})`, async () => {
      const { store, records } = fakeStore(candidate as unknown as Record<string, unknown>);
      const shaBefore = JSON.stringify(candidate);
      const answer = zymoIntentAnswer();
      arm.mutate(answer);
      const { client } = fakeInferenceClient({ content: JSON.stringify(answer) });

      const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const xdr = records.get(result.recordId)!;
      const protocolDraft = (xdr.candidates as Array<Record<string, unknown>>)[0]!.draft as Record<string, unknown>;
      const steps = protocolDraft.steps as Array<Record<string, unknown>>;
      const mutatedIndex = arms.indexOf(arm);
      const intent = steps[mutatedIndex]!.intent as Record<string, unknown>;

      if (arm.expectDropped) {
        // Ref dropped, intent stands unanchored, span recorded.
        expect(intent).not.toHaveProperty('provenance');
        expect(result.diagnostics.spans.some(s => s.reason === SEMANTIC_PASS_ANCHOR_UNRESOLVED && s.path.startsWith(`steps[${mutatedIndex}]`))).toBe(true);
      } else {
        expect(intent.provenance).toEqual([{ kind: 'record', type: 'vendor-protocol-candidate', id: CANDIDATE_ID, pageStart: 2, sectionId: 'section-protocol' }]);
        expect(result.diagnostics.spans.some(s => s.reason === SEMANTIC_PASS_ANCHOR_UNRESOLVED)).toBe(false);
      }

      // T5-e read-only proof: the VPC record is byte-identical before/after.
      expect(JSON.stringify(records.get(CANDIDATE_ID))).toBe(shaBefore);
    });
  }
});

describe('W2-6 T6: nothing-asked / nothing-deleted / axes-discarded', () => {
  it('canned answer omitting a step -> SEMANTIC_PASS_STEP_COVERAGE, ZERO writes (OQ2 (a))', async () => {
    const { store, writes } = fakeStore(candidate as unknown as Record<string, unknown>);
    const answer = zymoIntentAnswer();
    answer.steps.splice(7, 1); // drop step-8
    const { client, calls } = fakeInferenceClient({ content: JSON.stringify(answer) });

    const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    if (result.ok) expect.unreachable();
    expect(result.error).toBe(SEMANTIC_PASS_STEP_COVERAGE);
    if (result.ok) return;
    expect(result.details?.missingStepIds).toEqual(['step-8']);
    expect(writes).toEqual([]);
    expect(calls.length).toBe(1); // refused AFTER the one call, never a re-ask
  });

  it('model-minted branch_axes/questions/activeStepIds are stripped; family axes == deterministic axes; strips recorded', async () => {
    const { store, records } = fakeStore(candidate as unknown as Record<string, unknown>);
    const answer = zymoIntentAnswer() as Record<string, unknown> & ReturnType<typeof zymoIntentAnswer>;
    answer.branch_axes = [{ axisId: 'model-invented-axis', label: 'Model question', conditions: [{ id: 'branch-1', predicate: { op: 'equals', path: '$.branchSelection', value: 'x' }, then_stepIds: ['step-1'] }] }];
    answer.questions = ['Which plate do you use?'];
    answer.activeStepIds = ['step-1', 'step-2'];
    const { client } = fakeInferenceClient({ content: JSON.stringify(answer) });

    const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const xdr = records.get(result.recordId)!;
    const protocolDraft = (xdr.candidates as Array<Record<string, unknown>>)[0]!.draft as Record<string, unknown>;
    expect(protocolDraft).not.toHaveProperty('questions');
    expect(protocolDraft).not.toHaveProperty('activeStepIds');
    // The model axis never escapes into the family: axes == deterministic.
    const { deriveBranchAxes } = await import('./deriveBranchAxes.js');
    expect(protocolDraft.branch_axes).toEqual(deriveBranchAxes(candidate.steps));
    expect(result.diagnostics.spans.filter(s => s.reason === SEMANTIC_PASS_AXES_DISCARDED).map(s => s.path).sort())
      .toEqual(['$.activeStepIds', '$.branch_axes', '$.questions']);
  });

  it("finish_reason 'length' -> SEMANTIC_PASS_TRUNCATED naming maxTokens, zero writes", async () => {
    const { store, writes } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client } = fakeInferenceClient({ content: '{"steps": [{"stepId"', finishReason: 'length' });

    const result = await runSemanticFamilyPass({ store, client, inference: inference({ maxTokens: 4096 }) }, { candidateRecordId: CANDIDATE_ID });
    if (result.ok) expect.unreachable();
    expect(result.error).toBe(SEMANTIC_PASS_TRUNCATED);
    if (result.ok) return;
    expect(result.message).toContain('maxTokens');
    expect(writes).toEqual([]);
  });

  it('prose-only answer -> SEMANTIC_PASS_PARSE_FAILED, zero writes', async () => {
    const { store, writes } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client } = fakeInferenceClient({ content: 'I cannot produce a protocol from this document.' });

    const result = await runSemanticFamilyPass({ store, client, inference: inference() }, { candidateRecordId: CANDIDATE_ID });
    if (result.ok) expect.unreachable();
    expect(result.error).toBe(SEMANTIC_PASS_PARSE_FAILED);
    expect(writes).toEqual([]);
  });
});

describe('W2-6 thinking-level refusal + config seam (D7 / bait 4)', () => {
  it('an unknown defaultThinkingLevel is REFUSED (never downgraded), zero writes', async () => {
    const { store, writes } = fakeStore(candidate as unknown as Record<string, unknown>);
    const { client, calls } = fakeInferenceClient({ content: JSON.stringify(zymoIntentAnswer()) });
    const result = await runSemanticFamilyPass(
      { store, client, inference: inference({ defaultThinkingLevel: 'ultra', thinkingLevels: { off: { enableThinking: false } } }) },
      { candidateRecordId: CANDIDATE_ID },
    );
    if (result.ok) expect.unreachable();
    expect(result.error).toBe('SEMANTIC_PASS_UNKNOWN_THINKING_LEVEL');
    expect(result.message).toContain('ultra');
    expect(writes).toEqual([]);
    expect(calls.length).toBe(0); // refused BEFORE any call
  });

  it('resolveSemanticPassInference: block merges over the profile; absent block = the profile verbatim', async () => {
    const { resolveSemanticPassInference } = await import('./SemanticFamilyPass.js');
    const base = {
      inference: { baseUrl: 'http://profile.invalid/v1', model: 'profile-model' },
      agent: {},
    } as const;
    // Absent block -> the active profile inference, untouched.
    expect(resolveSemanticPassInference(base as never)).toEqual(base.inference);
    // Partial block -> only the named fields override; the rest rides the profile.
    const merged = resolveSemanticPassInference({ ...base, semanticPass: { model: 'pass-model' } } as never);
    expect(merged.model).toBe('pass-model');
    expect(merged.baseUrl).toBe('http://profile.invalid/v1');
    // Full block -> both override.
    const full = resolveSemanticPassInference({ ...base, semanticPass: { model: 'pass-model', baseUrl: 'http://pass.invalid/v1', maxTokens: 8192 } } as never);
    expect(full.baseUrl).toBe('http://pass.invalid/v1');
    expect(full.maxTokens).toBe(8192);
  });

  it('loader validation: a valid semanticPass block passes; a malformed one is a ConfigValidationError', async () => {
    const { validateConfig, ConfigValidationError } = await import('../../config/loader.js');
    const good = {
      server: { port: 1, host: 'x', logLevel: 'error', dataDir: '/tmp/x', workspaceDir: '/tmp/x/w', cors: { enabled: false } },
      schemas: {},
      repositories: [],
      ai: {
        inference: { baseUrl: 'http://x.invalid/v1', model: 'm' },
        semanticPass: { model: 'pass-model', maxTokens: 8192, thinkingLevels: { deep: { enableThinking: true } }, defaultThinkingLevel: 'deep' },
      },
    };
    expect(() => validateConfig(good)).not.toThrow();
    const bad = structuredClone(good);
    (bad.ai as Record<string, unknown>).semanticPass = { maxTokens: 'many' };
    expect(() => validateConfig(bad)).toThrow(ConfigValidationError);
  });
});
