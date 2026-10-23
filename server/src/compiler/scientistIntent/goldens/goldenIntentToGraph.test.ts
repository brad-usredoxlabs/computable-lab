/**
 * SPINE-6 goldens — the intent-to-GRAPH arc replayed through the REAL
 * POST /intent/compile-from-prompt handler (spec §4.2 fixtures 1-2, amended
 * fixture 1 per SPINE-6-ruling-amendment-l2t0140).
 *
 * All tests are hermetic — no real AI calls, no disk IO beyond fixture-local
 * data (ros.test.ts convention). The ONLY harness seams are the model client
 * (canned tool-call replay) and the record store; the Ajv parse, the shipped
 * vocabulary singleton, the pipeline YAML, the SPINE-3 engine, and the
 * store-backed spine all run REAL (spec §4.1 — mocking any of them voids
 * the REAL-route criterion; §8 grep enforces).
 */
import { describe, expect, it } from 'vitest';
import {
  classifyCompileResponse,
  countHintEligibleLabeledArgs,
  deepEqualGolden,
  fixtureFromManifest,
  loadManifest,
  lookupAgainstFixtureStore,
  manifestHashMismatches,
  recordFromManifest,
  runGolden,
} from './replayKernel.js';

const manifest = loadManifest();

describe('golden.intent-to-graph.transfer-read', () => {
  it('golden.intent-to-graph.transfer-read', async () => {
    // Amended fixture 1 (ruling amendment l2t0140, clauses 1-6): the transfer+
    // read arc through the real handler; store seeds are TITLE+SYNONYMS-ONLY
    // so the hint arm MISSES and the engine binding demonstrably came from the
    // spine arm (clause 2's in-test setup invariant). The golden pins TODAY's
    // shipped behavior (defaultRoleResolver path included), byte-exact after
    // normalization. NO body-level recordId assertion of any kind (clause 6).
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.transfer-read');

    // Clause 2 setup invariant: createLabwareLookup(label) => [] for BOTH
    // seeded labels (the lookup reads payload.name/aliases only). Proof the
    // binding came from the spine arm, not the hint search.
    expect(await lookupAgainstFixtureStore(fixture, 'source plate')).toEqual([]);
    expect(await lookupAgainstFixtureStore(fixture, 'destination plate')).toEqual([]);

    const run = await runGolden(fixture);

    // Clause 3: 200 + outcome 'complete' + no error field.
    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('error');
    expect(Object.keys(run.payload)).not.toContain('clarifications');

    // Clause 4: FULL 200 body deep-equal as the shipped chain assembles it.
    const record = recordFromManifest(manifest, 'golden.intent-to-graph.transfer-read');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    // Typed anchors (bait §11.3: a broken normalizer can't bless drift):
    // volumes byte-exact; symbolic labware identities; deck + resources as
    // shipped; protocolIntent labwareInstances pinned.
    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(2);
    const transfer = events[0]!;
    const transferDetails = transfer['details'] as Record<string, unknown>;
    expect(transferDetails['volume']).toEqual({ value: 50, unit: 'uL' });
    expect(transferDetails['volumeUl']).toBe(50);
    expect(transfer['labwareId']).toBe('destination plate');
    const read = events[1]!;
    expect(read['labwareId']).toBe('source plate');
    expect((read['details'] as Record<string, unknown>)['mode']).toBe('absorbance');
    // Emitted wells for role-consuming events: whatever the shipped
    // deterministic chain produces (defaultRoleResolver path included) —
    // pinned byte-exact via the deep-equal above; no wells invented here.
    expect(ta['deckLayoutPlan']).toEqual({
      pinned: [],
      autoFilled: [{ slot: 'A1', labwareHint: 'unknown', reason: 'tipRack' }],
      conflicts: [],
    });
    expect(ta['resourceManifest']).toEqual({
      tipRacks: [{ pipetteType: 'unknown', rackCount: 1 }],
      reservoirLoads: [],
      consumables: [],
    });
    const protocolIntent = ta['protocolIntent'] as { resources: { labwareInstances: unknown } };
    expect(protocolIntent.resources.labwareInstances).toEqual([
      { id: 'source plate', labwareHint: 'source plate', role: 'source', resolutionStatus: 'candidate' },
      { id: 'destination plate', labwareHint: 'destination plate', role: 'target', resolutionStatus: 'candidate' },
    ]);

    // Clause 5: the :1631-consumer store-spy arithmetic at the store level —
    // every bound label took the authoritative arm with NO second
    // searchLabwareByHint lookup.
    const n = countHintEligibleLabeledArgs(fixture.modelOutput);
    expect(n).toBe(3); // transfer.source, transfer.target, read.labware
    expect(run.spies.labwareListCalls - run.spies.materialListCalls - n).toBe(0);

    // Zero writes (§5(d) discipline applies to every replay test).
    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('golden.intent-to-graph.labware-hint-regression', () => {
  it('golden.intent-to-graph.labware-hint-regression', async () => {
    // Fixture 2 (untouched by both rulings): the labwareHint-carrying shape
    // (route test :129-151 / hintParity pin). *Hint companions are EVIDENCE
    // only — the engine's doc-door reads the declared arg field, so no label
    // is engine-bound and resolve_labware takes the SEARCH arm. Post-SPINE-4
    // merged behavior pinned: the shared hint triggers exactly ONE
    // searchLabwareByHint lookup (labwareListCalls - materialListCalls = 1).
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.labware-hint-regression');
    const run = await runGolden(fixture);

    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('error');

    const record = recordFromManifest(manifest, 'golden.intent-to-graph.labware-hint-regression');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    // Search-spy call pattern (the fixture-2 idiom): unbound hint => the
    // search arm runs exactly once for the shared 'hint plate' hint.
    expect(run.spies.searchLabwareByHintCalls).toBe(1);

    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const details = events[0]!['details'] as Record<string, unknown>;
    expect(details['volume']).toEqual({ value: 25, unit: 'uL' });
    expect(events[0]!['labwareId']).toBe('hint plate');

    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('golden.intent-to-graph.mixfrac-canonical-flat', () => {
  it('golden.intent-to-graph.mixfrac-canonical-flat', async () => {
    // MIXFRAC-1 GOLDEN-A RECORD leg (§14.2, fix1/D2/D3 per adversarial review
    // l2t1855 + orchestrator ruling): the ANSWER-DRIVEN leg. The fixture
    // carries the SAME ambiguous declared document as the bar leg (110% +
    // nested 90:10 on the medium entry) and request.answers selects the
    // in-house-recipe reading (key = the bar's own label, value = the reading
    // id `preceding-noun-recipe`). The answer machinery settles the bar and
    // the SELECTED reading drives the final document: the carried composition
    // is rewritten to that reading's flat derived view (nested children
    // expanded, the absorbed supplement line dropped) and the snapshot emits
    // the ruling's FLAT entries Trypsin-EDTA 50 / DMEM 45 / FBS 5 with the
    // ratified source strings "50% of the mixture" / "45% of the mixture" /
    // "5% of the mixture" byte-stable (OQ-4: the app's shape parser consumes
    // this form verbatim), cells entry unchanged (roles are MIXROLE-1's
    // ground — pinned as the pipeline emits). The DECLARED nested truth stays
    // in the held localMacro (§14.2: flat is derived, declared is nested);
    // the nested form NEVER rides a snapshot entry.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.mixfrac-canonical-flat');

    // The leg's premise: the request ANSWERS select the reading — the flat
    // view is NOT a canned modelOutput (fix1/D3: canned encoding is not
    // ratified).
    expect(fixture.request.answers['Trypsin-EDTA, DMEM, FBS']).toBe('preceding-noun-recipe');
    const declaredComposition = (fixture.modelOutput['actions'] as Array<Record<string, unknown>>)[0]!['params'] as Record<string, unknown>;
    expect(declaredComposition['composition']).toHaveLength(4);

    const run = await runGolden(fixture);

    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('clarifications');

    const record = recordFromManifest(manifest, 'golden.intent-to-graph.mixfrac-canonical-flat');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    // The held localMacro keeps the DECLARED nested truth (the answer drove
    // the derived view; the scientist's declared document was never rewritten).
    const localMacro = run.payload['localMacro'] as Record<string, unknown>;
    const macroComposition = ((localMacro['actions'] as Array<Record<string, unknown>>)[0]!['params'] as Record<string, unknown>)['composition'] as Array<Record<string, unknown>>;
    expect(macroComposition).toHaveLength(4);
    const declaredMedium = macroComposition[1]!;
    expect(Array.isArray(declaredMedium['composition'])).toBe(true);
    expect((declaredMedium['composition'] as Array<Record<string, unknown>>).map((c) => String(c['fraction']))).toEqual(['90%', '10%']);

    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const details = events[0]!['details'] as Record<string, unknown>;
    const snapshot = details['composition_snapshot'] as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(4);
    const byLabel = new Map(snapshot.map((entry) => [
      String((entry['component_ref'] as Record<string, unknown>)['label']),
      entry,
    ]));
    expect((byLabel.get('Trypsin-EDTA')!['source'] as string)).toBe('50% of the mixture');
    expect((byLabel.get('DMEM')!['source'] as string)).toBe('45% of the mixture');
    expect((byLabel.get('FBS')!['source'] as string)).toBe('5% of the mixture');
    // The cells entry carries no fraction source (count stays a count).
    expect(Object.keys(byLabel.get('HepG2 cells')!)).not.toContain('source');
    // The nested form NEVER rides a snapshot entry (§14.2).
    for (const entry of snapshot) expect(Object.keys(entry)).not.toContain('composition');

    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('golden.intent-to-graph.mixfrac-final-volume', () => {
  it('golden.intent-to-graph.mixfrac-final-volume', async () => {
    // MIXFRAC-1 GOLDEN-B compiled leg (spec §7.2 + §14.2): the one-sided
    // finalVolumePhrases arm ("bring to 10% FBS final") settles the parse to
    // the whole-mixture supplement reading WITHOUT a clarification — the
    // carried composition fractions are REWRITTEN to the computed re-base
    // (45/45/10, sum 100 by construction) and the snapshot emits the ratified
    // source form byte-stably.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.mixfrac-final-volume');
    const run = await runGolden(fixture);

    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('clarifications');

    const record = recordFromManifest(manifest, 'golden.intent-to-graph.mixfrac-final-volume');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const details = events[0]!['details'] as Record<string, unknown>;
    const snapshot = details['composition_snapshot'] as Array<Record<string, unknown>>;
    expect(snapshot).toHaveLength(3);
    const byLabel = new Map(snapshot.map((entry) => [
      String((entry['component_ref'] as Record<string, unknown>)['label']),
      entry,
    ]));
    expect((byLabel.get('Trypsin-EDTA')!['source'] as string)).toBe('45% of the mixture');
    expect((byLabel.get('DMEM')!['source'] as string)).toBe('45% of the mixture');
    expect((byLabel.get('FBS')!['source'] as string)).toBe('10% of the mixture');

    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('golden.intent-to-graph.cells-rate-per-volume (CELLRATE-1)', () => {
  it('the canonical rate utterance round-trips as DECLARED RATE DATA — counter_density declared, NO count key, no computed total (THE WALL)', async () => {
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.cells-rate-per-volume');
    const run = await runGolden(fixture);

    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('clarifications');

    const record = recordFromManifest(manifest, 'golden.intent-to-graph.cells-rate-per-volume');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const details = events[0]!['details'] as Record<string, unknown>;
    // The rate survives the wire + parse + compile as declared data.
    expect(details['counter_density']).toEqual({ value: 200, unit: 'cells/uL', basis: 'count_per_volume' });
    // THE WALL pin: the stored event keeps what the scientist declared — no
    // count key, and the computed total appears NOWHERE in the payload.
    expect(Object.keys(details)).not.toContain('count')
    expect(JSON.stringify(run.normalized)).not.toContain('20000')

    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('golden.manifest.versions-current', () => {
  it('golden.manifest.versions-current', () => {
    // Spec §4.2/§4.3 (bait §11.5): rule/spec drift fails CI LOUD instead of
    // silently re-blessing. Every manifest-pinned file re-hashed vs manifest.
    const mismatches = manifestHashMismatches(manifest);
    expect(mismatches).toEqual([]);
  });
});
