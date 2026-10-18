/**
 * SPINE-6 goldens — the clarification bar replayed through the REAL
 * POST /intent/compile-from-prompt handler (spec §5, fixtures 3-6; fixture 5
 * amended per SPINE-6-ruling-amendment-l2t0140 to
 * golden.intent-to-clarification.labware-hint-lookup-failure).
 *
 * Hermetic (ros.test.ts convention); ONLY the model client and the store are
 * harness-controlled; parse/vocabulary/pipeline/engine/spine run REAL; zero
 * module mocking (spec §11.1). Every case asserts the §5 bar contract at the RESPONSE
 * level: (a) merged 422 NEEDS_CLARIFICATION, (b) clarifications deep-equal
 * VERBATIM engine output, (c) atomic zero-artifact via Object.keys (never
 * toEqual-with-undefined — exactOptionalPropertyTypes), (d) zero store writes,
 * (e) outcome provably NOT 'complete' via the shared classifier exported from
 * replayKernel (the same function the live smoke uses — bait §11.11).
 */
import { describe, expect, it } from 'vitest';
import {
  assertClarificationIsNotSuccess,
  classifyCompileResponse,
  deepEqualGolden,
  fixtureFromManifest,
  loadManifest,
  recordFromManifest,
  runGolden,
} from './replayKernel.js';

const manifest = loadManifest();

/** §5(c): the shipped minimal artifact surface on the bar — key ABSENCE via
 *  Object.keys, never toEqual-with-undefined. */
function assertBarZeroArtifact(terminalArtifacts: Record<string, unknown>): void {
  expect(Object.keys(terminalArtifacts).sort()).toEqual(['directives', 'events', 'gaps', 'protocolIntent']);
  expect(terminalArtifacts['events']).toEqual([]);
  expect(terminalArtifacts['gaps']).toEqual([]);
  for (const key of ['labwareAdditions', 'deckLayoutPlan', 'resourceManifest', 'instrumentRunFiles', 'labStateDelta']) {
    expect(Object.keys(terminalArtifacts)).not.toContain(key);
  }
}

/** §5(a)+(e): the merged bar status + the shared not-success classifier. */
function assertBar(run: Awaited<ReturnType<typeof runGolden>>): Record<string, unknown> {
  expect(run.status).toBe(422);
  const payload = run.payload;
  expect(payload['error']).toBe('NEEDS_CLARIFICATION');
  expect(payload['outcome']).toBe('needs-clarification');
  const verdict = classifyCompileResponse(run.status, payload);
  assertClarificationIsNotSuccess(verdict);
  return payload;
}

describe('golden.intent-to-clarification.ambiguous-material', () => {
  it('golden.intent-to-clarification.ambiguous-material', async () => {
    // Fixture 3 (untouched by both rulings): 'standard plate' substring-matches
    // two store labware records; policies.ambiguity.mode: clarify => the engine
    // clarifies with BOTH in-band candidates (verbatim engine output).
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.ambiguous-material');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(1);
    const item = clarifications[0]!;
    expect(item['label']).toBe('standard plate');
    expect(item['reason']).toBe('ambiguous-noun');
    expect(item['candidates']).toEqual([
      { label: 'standard plate alpha', confidence: 1 },
      { label: 'standard plate beta', confidence: 1 },
    ]);
    expect(item['actionLocation']).toEqual({ actionIndex: 0, action: 'transfer', argument: 'source' });

    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.ambiguous-material');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});

describe('golden.intent-to-clarification.unknown-local-term', () => {
  it('golden.intent-to-clarification.unknown-local-term', async () => {
    // Fixture 4 (untouched): nothing matches 'mystery flask' => the engine's
    // unknown-noun arm offers the mint affordance (Create local term, 0.05).
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.unknown-local-term');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(1);
    const item = clarifications[0]!;
    expect(item['label']).toBe('mystery flask');
    expect(item['reason']).toBe('unknown-noun');
    const candidates = item['candidates'] as Array<Record<string, unknown>>;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toEqual({ label: 'Create local term “mystery flask”', confidence: 0.05 });
    // MINT-FLOOR-UI-1: the mint affordance is offered EXACTLY once per noun on
    // the wire (RED at baseline: the engine accumulates two identical copies —
    // one per spine-gathering strategy).
    expect(candidates.filter((c) => String(c['label']).startsWith('Create local term'))).toHaveLength(1);
    expect(item['actionLocation']).toEqual({ actionIndex: 0, action: 'transfer', argument: 'source' });

    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.unknown-local-term');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});

describe('golden.intent-to-clarification.labware-hint-lookup-failure', () => {
  it('golden.intent-to-clarification.labware-hint-lookup-failure', async () => {
    // Amended fixture 5 (ruling amendment l2t0140, clauses 1-5): the harness
    // store THROWS on store.list({kind:'labware'}) => createLabwareLookup
    // throws => the labware-hint adapter records failed:true (adapters.ts
    // :133-140) => the engine failure arm (resolutionEngine.ts:206-207).
    // CONTRAST ARM (clause 4, the leg's soul): the SAME canned intent names a
    // store-unresolvable MATERIAL noun (add_material.material is NOT
    // hintEligible — the failing adapter never runs for it) => the SAME 422
    // pins 'unknown-noun' WITH the 0.05 mint offer. Honest failure-vs-unknown
    // distinction, pinned as SHIPPED, in one response, zero product edit.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.labware-hint-lookup-failure');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(3);

    // Clause 3: EVERY failing hintEligible-arg clarification carries reason
    // VERBATIM 'resolution-lookup-failed', its actionLocation, and NO mint
    // offer (the failure arm never mints — lookup error != unknown noun).
    const failingArgs = clarifications.filter((c) => c['reason'] === 'resolution-lookup-failed');
    expect(failingArgs).toHaveLength(2);
    for (const item of failingArgs) {
      expect(item['reason']).toBe('resolution-lookup-failed');
      const loc = item['actionLocation'] as Record<string, unknown>;
      expect(loc['actionIndex']).toBe(0);
      expect(loc['action']).toBe('transfer');
      expect(['source', 'target']).toContain(loc['argument']);
      expect(Object.keys(item)).not.toContain('candidates');
    }
    expect(failingArgs.map((c) => (c['actionLocation'] as Record<string, unknown>)['argument']).sort())
      .toEqual(['source', 'target']);

    // Clause 4 contrast arm: the material arg pins the shipped contrast
    // VERBATIM — 'unknown-noun' WITH the mint offer (confidence 0.05).
    const contrast = clarifications.find((c) => c['label'] === 'mystery reagent')!;
    expect(contrast['reason']).toBe('unknown-noun');
    expect(contrast['actionLocation']).toEqual({ actionIndex: 1, action: 'add_material', argument: 'material' });
    const candidates = contrast['candidates'] as Array<Record<string, unknown>>;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toEqual({ label: 'Create local term “mystery reagent”', confidence: 0.05 });
    // MINT-FLOOR-UI-1: exactly ONE mint affordance per noun on the wire
    // (RED at baseline: two identical copies accumulate).
    expect(candidates.filter((c) => String(c['label']).startsWith('Create local term'))).toHaveLength(1);

    // Clause 5: atomic zero-artifact + zero writes + golden deep-equal over
    // the WHOLE 422 body.
    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.labware-hint-lookup-failure');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});

describe('golden.intent-to-clarification.material-level-mismatch', () => {
  it('golden.intent-to-clarification.material-level-mismatch', async () => {
    // SPINE-8 re-homed fixture (ruling item 2): the SHIPPED vocabulary declares
    // wash.material level: aliquot (vocabulary DATA — the single source of the
    // (verb,arg)->MaterialLevel mapping, consumed by the resolve_nouns pass's
    // deps.levelFor supplier). The fixture store carries 'ethanol' ONLY as a
    // concept-level `material` record (records.ts KIND_LEVEL: material->concept;
    // the records provider sets NO termKind — vendor-kind terms are provably
    // absent by construction). The engine's levelFilter arm
    // (resolutionEngine.ts:94-111, reached via the vocabulary-declared wantLevel
    // — NO test-hand-built wantLevel) drops the concept candidate => the
    // EXISTING unknown-noun arm clarifies with the mint offer. NON-VACUITY:
    // pre-wire this exact fixture BINDS the concept record (200) — the RED
    // capture in the SPINE-8 report is the mutation control.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.material-level-mismatch');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(1);
    const item = clarifications[0]!;
    expect(item['label']).toBe('ethanol');
    // The engine's ACTUAL reason (no invented reason code — spec §9.6): the
    // level-mismatch evidence is the levelFilter trace + this pre-wire control;
    // the clarification itself rides the existing unknown-noun arm.
    expect(item['reason']).toBe('unknown-noun');
    expect(item['actionLocation']).toEqual({ actionIndex: 0, action: 'wash', argument: 'material' });
    const candidates = item['candidates'] as Array<Record<string, unknown>>;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toEqual({ label: 'Create local term “ethanol”', confidence: 0.05 });
    // MINT-FLOOR-UI-1: exactly ONE mint affordance per noun on the wire
    // (RED at baseline: two identical copies accumulate).
    expect(candidates.filter((c) => String(c['label']).startsWith('Create local term'))).toHaveLength(1);

    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.material-level-mismatch');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});

describe('golden.intent-to-clarification.model-unresolved-passthrough', () => {
  it('golden.intent-to-clarification.model-unresolved-passthrough', async () => {
    // Fixture 6 (stands EXACTLY as ruled; P6 verbatim-reachable): a
    // schema-valid `unresolved:` entry (scientist-intent.schema.yaml :165)
    // survives reconcileModelUnresolved (resolveNounsPass.ts:262) VERBATIM —
    // no actionLocation invented, no candidates minted.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.model-unresolved-passthrough');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(1);
    const item = clarifications[0]!;
    expect(item['label']).toBe('incubation duration');
    expect(item['reason']).toBe('the scientist did not state how long to incubate');
    expect(Object.keys(item)).not.toContain('actionLocation');
    expect(Object.keys(item)).not.toContain('candidates');

    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.model-unresolved-passthrough');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});

describe('golden.intent-to-clarification.unresolvable-mixture-component', () => {
  it('golden.intent-to-clarification.unresolvable-mixture-component', async () => {
    // COMP-4 Stage B fixture: the SHIPPED vocabulary declares
    // add_material.composition cardinality: many (vocabulary DATA — the
    // resolve_nouns door iterates it, one request per entry, each label read
    // from the declared itemNounField). Three of the four components are
    // seeded; 'Equine Serum' matches nothing => the EXISTING unknown-noun arm
    // clarifies naming the COMPONENT (label is the component name, NOT the
    // argument), the pass bars atomically, and the cascade barrier skips every
    // downstream pass: zero events, zero writes, no partial mint.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.unresolvable-mixture-component');
    const run = await runGolden(fixture);
    const payload = assertBar(run);

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    expect(clarifications).toHaveLength(1);
    const item = clarifications[0]!;
    expect(item['label']).toBe('Equine Serum');
    expect(item['reason']).toBe('unknown-noun');
    expect(item['actionLocation']).toEqual({ actionIndex: 0, action: 'add_material', argument: 'composition' });
    const candidates = item['candidates'] as Array<Record<string, unknown>>;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]).toEqual({ label: 'Create local term “Equine Serum”', confidence: 0.05 });
    // MINT-FLOOR-UI-1: exactly ONE mint affordance per noun on the wire
    // (RED at baseline: two identical copies accumulate).
    expect(candidates.filter((c) => String(c['label']).startsWith('Create local term'))).toHaveLength(1);

    assertBarZeroArtifact(payload['terminalArtifacts'] as Record<string, unknown>);
    expect(run.spies.writeCalls).toBe(0);

    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.unresolvable-mixture-component');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);
  });
});
