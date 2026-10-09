/**
 * SPINE-7-ROLES-SEAM goldens — the wells-label → engine-binding → role-carrying
 * lowering → resolve_roles AUTHORITATIVE wells chain replayed through the REAL
 * POST /intent/compile-from-prompt handler (ruling acceptance items 1-3).
 *
 * Hermetic (SPINE-6 goldens convention): ONLY the model client and the record
 * store are harness-controlled; the Ajv parse, the shipped vocabulary
 * singleton, the pipeline YAML, the SPINE-3 engine, and the store-backed spine
 * all run REAL. ZERO vi.mock (spec §11.1 idiom — mocking any of them voids the
 * REAL-route criterion).
 *
 * D4 CLEARANCE (AS-LANE2-SPINE4-D4-ROLES-SEAM-COVERAGE closes ONLY here):
 * the emitted event's wells EQUAL the real engine binding's addresses
 * (mirror pin: the same fixture store run through the real resolve_nouns pass
 * exposes resolvedByLabel[label].addresses), the scalar is provably NOT
 * lowered as an address array (no `wells` key on the emitted event), and the
 * fallback defaultRoleResolver value is pinned SEPARATELY. The authoritative
 * branch is mutation-proved at the seam on test-local state (no product file
 * is touched, so the restore is byte-clean by construction — SPINE-3 restore
 * discipline): (M1) a slot whose addresses DIFFER from the fallback moves the
 * emitted well with the SLOT (the authoritative arm, not the fallback);
 * (M2) a slot key that does not equal details.role falls back to
 * defaultRoleResolver; (M3) with the role-carrying producer removed the event
 * passes through with NO well. The shipped rules make a "provably different
 * default" impossible for the only reachable single-address binding
 * (control_well: the engine's wells arm IS defaultRoleResolver — probe 3), so
 * the ruling's spy/mirror pin arm is the honest clearance path and M1 supplies
 * the provably-different value.
 */
import { describe, expect, it } from 'vitest';
import {
  classifyCompileResponse,
  countHintEligibleLabeledArgs,
  deepEqualGolden,
  fixtureFromManifest,
  loadManifest,
  lookupAgainstFixtureStore,
  recordFromManifest,
  runGolden,
} from './replayKernel.js';
import type { GoldenFixture } from './replayKernel.js';
import { parseScientistIntent } from '../parseScientistIntent.js';
import { defaultScientistIntentVocabulary } from '../vocabulary.js';
import { createResolveNounsPass } from '../../resolution/resolveNounsPass.js';
import { createResolveSpineFromContext } from '../../../resolve/index.js';
import { recordingStore } from './replayKernel.js';
import { defaultRoleResolver } from '../../roles/RoleResolver.js';
import { createResolveRolesPass } from '../../pipeline/passes/ChatbotCompilePasses.js';
import type { PipelineState } from '../../pipeline/types.js';
import type { ResolvedNounBinding, ResolveNounsOutput } from '../../resolution/resolveNounsPass.js';

const manifest = loadManifest();

/** Fresh pass-level state for the mutation legs: an event already lowered with
 *  details.role (the shipped producer shape pinned in rolesSeam.test.ts) plus
 *  a resolve_nouns slot built per-leg. Each leg builds its OWN state object —
 *  the mutation is test-local, product files are never touched, so the
 *  restore is byte-clean by construction (SPINE-3 restore discipline). */
function rolesState(slot: ResolveNounsOutput | undefined): PipelineState {
  const outputs = new Map<string, unknown>();
  if (slot) outputs.set('resolve_nouns', slot);
  outputs.set('expand_biology_verbs', {
    events: [{
      eventId: 'evt-transfer-mutationleg',
      event_type: 'transfer',
      details: { role: 'control_well', destination_labware: 'destination plate', volume: { value: 50, unit: 'uL' } },
      labwareId: 'destination plate',
    }],
  });
  return { input: {}, context: {}, meta: {}, outputs, diagnostics: [] } as never;
}

function slotWith(addresses: string[], label = 'control_well'): ResolveNounsOutput {
  const binding: ResolvedNounBinding = {
    verb: 'transfer',
    argument: 'targetWells',
    label,
    recordId: `well:${addresses[0]}`,
    addresses,
    actionIndex: 0,
  };
  return {
    bindings: [],
    resolvedByLabel: { [label]: binding },
    clarifications: [],
    failures: [],
    blocked: false,
  };
}

/** Mirror pin: the REAL resolve_nouns pass against the SAME fixture store —
 *  the engine binding the slot must carry (keyed by LABEL). */
async function engineSlotForFixture(fixture: GoldenFixture, doc: string) {
  const recorder = recordingStore(fixture.store.records);
  const spine = createResolveSpineFromContext({ store: recorder.store as never });
  const intent = parseScientistIntent(doc);
  const pass = createResolveNounsPass({
    intent,
    vocabulary: defaultScientistIntentVocabulary(),
    spine,
  });
  const res = await pass.run({
    pass_id: 'resolve_nouns',
    state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] } as never,
  });
  return (res.output as { resolvedByLabel: Record<string, Record<string, unknown>>; blocked: boolean });
}

describe('golden.intent-to-graph.roles-seam', () => {
  it('golden.intent-to-graph.roles-seam', async () => {
    // Acceptance (1) ROUTE-REACHABILITY + (2) D4 CLEARANCE.
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-graph.roles-seam');

    // Setup invariant (fixture-1 idiom): hint arm misses => spine arm binds.
    expect(await lookupAgainstFixtureStore(fixture, 'source plate')).toEqual([]);
    expect(await lookupAgainstFixtureStore(fixture, 'destination plate')).toEqual([]);

    const run = await runGolden(fixture);

    // (1) 200 complete through the real route with a SCALAR wells label.
    expect(run.status).toBe(200);
    expect(run.payload['outcome']).toBe('complete');
    expect(Object.keys(run.payload)).not.toContain('error');
    expect(Object.keys(run.payload)).not.toContain('clarifications');

    // localMacro holds the normalized scalar (parse REAL, scalar canonicalized).
    const localMacro = run.payload['localMacro'] as { actions: Array<Record<string, unknown>> };
    expect(localMacro.actions[0]!['targetWells']).toBe('control_well');

    // FULL 200 body deep-equal vs the blessed record.
    const record = recordFromManifest(manifest, 'golden.intent-to-graph.roles-seam');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    // (2) D4: the emitted event's wells EQUAL the real engine binding's
    // addresses — mirror pin against the same store through the real pass.
    const slot = await engineSlotForFixture(fixture, `
intentId: golden-roles-seam
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    targetWells: control_well
`);
    expect(slot.blocked).toBe(false);
    const binding = slot.resolvedByLabel['control_well'];
    expect(binding).toBeDefined();
    expect(binding!['argument']).toBe('targetWells');
    expect(binding!['recordId']).toBe('well:A12');
    const engineAddresses = binding!['addresses'] as string[];
    expect(engineAddresses).toEqual(['A12']);

    const ta = run.payload['terminalArtifacts'] as Record<string, unknown>;
    const events = ta['events'] as Array<Record<string, unknown>>;
    expect(events).toHaveLength(engineAddresses.length); // one event per engine address
    const emitted = events[0]!;
    const details = emitted['details'] as Record<string, unknown>;
    expect(details['well']).toBe(engineAddresses[0]); // EQUAL the engine binding
    // The scalar was NOT lowered as an address array: no wells array anywhere.
    expect(Object.keys(details)).not.toContain('wells');
    expect(Object.keys(details)).not.toContain('source_wells');
    // role is CONSUMED by the expansion: the resolve_roles pass clears it
    // (`role: undefined`, ChatbotCompilePasses :2440). In the live payload the
    // key survives with an undefined value; the shipped route JSON-serializes
    // and drops it (SPINE-1 key-absence-vs-undefined convention), so the
    // absence is asserted on the blessed record's event details.
    expect(details['role']).toBeUndefined();
    const blessedDetails = (record.body['terminalArtifacts'] as { events: Array<Record<string, unknown>> }).events[0]!['details'] as Record<string, unknown>;
    expect(Object.keys(blessedDetails)).not.toContain('role');
    // Volume provenance stays byte-exact (bait §11.3).
    expect(details['volume']).toEqual({ value: 50, unit: 'uL' });
    expect(emitted['labwareId']).toBe('destination plate');

    // Fallback mirror: defaultRoleResolver(role, resolve-roles ctx on the
    // route — empty labState => landscape/96-well) is pinned separately so
    // the authoritative-vs-fallback mutation leg has a named baseline.
    expect(defaultRoleResolver('control_well', { orientation: 'landscape', labwareType: '96-well-plate' }))
      .toEqual(['A12']);

    // Hint-spy arithmetic (fixture-1 clause 5 idiom): bound labels took the
    // authoritative arm with no second searchLabwareByHint lookup.
    const n = countHintEligibleLabeledArgs(fixture.modelOutput);
    expect(n).toBe(2); // transfer.source, transfer.target (targetWells is NOT hintEligible)
    expect(run.spies.labwareListCalls - run.spies.materialListCalls - n).toBe(0);

    expect(run.spies.writeCalls).toBe(0);
  });
});

describe('SPINE-7 D4 mutation legs — the authoritative branch is not vacuous', () => {
  it('M1: a slot whose addresses DIFFER from the fallback moves the emitted well with the SLOT', async () => {
    // The shipped fallback for 'control_well' is ['A12'] (pinned below in the
    // golden). A slot carrying a DIFFERENT address can only surface in the
    // emitted well through the authoritative arm (ChatbotCompilePasses
    // :2410-2412) — the fallback could never produce B5.
    const res = await createResolveRolesPass().run({
      pass_id: 'resolve_roles',
      state: rolesState(slotWith(['B5'])),
    });
    const events = (res.output as { events: Array<{ eventId: string; details: Record<string, unknown>} > }).events;
    expect(events).toHaveLength(1);
    expect(events[0]!.details['well']).toBe('B5');
    expect(events[0]!.details['well']).not.toBe('A12'); // NOT the fallback
    expect(events[0]!.eventId).toBe('evt-transfer-mutationleg_r0'); // regenerated id
  });

  it('M2: a slot key that does not equal details.role falls back to defaultRoleResolver', async () => {
    // The KEYING CONTRACT: resolvedByLabel is keyed by the engine-bound LABEL
    // and the consumer indexes by details.role. A mismatched key must take the
    // fallback arm — proving the golden's equality is what makes the arm live.
    const res = await createResolveRolesPass().run({
      pass_id: 'resolve_roles',
      state: rolesState(slotWith(['B5'], 'some_other_label')),
    });
    const events = (res.output as { events: Array<{ eventId: string; details: Record<string, unknown>} > }).events;
    expect(events).toHaveLength(1);
    expect(events[0]!.details['well']).toBe('A12'); // the fallback default
    expect(events[0]!.eventId).toBe('evt-transfer-mutationleg_r0');
  });

  it('M3: with the role-carrying producer removed (no details.role), the event passes through with NO well', async () => {
    const outputs = new Map<string, unknown>();
    outputs.set('resolve_nouns', slotWith(['B5']));
    outputs.set('expand_biology_verbs', {
      events: [{
        eventId: 'evt-transfer-mutationleg',
        event_type: 'transfer',
        details: { destination_labware: 'destination plate', volume: { value: 50, unit: 'uL' } },
        labwareId: 'destination plate',
      }],
    });
    const state = { input: {}, context: {}, meta: {}, outputs, diagnostics: [] } as never;
    const res = await createResolveRolesPass().run({ pass_id: 'resolve_roles', state });
    const events = (res.output as { events: Array<{ eventId: string; details: Record<string, unknown>} > }).events;
    expect(events).toHaveLength(1);
    expect(Object.keys(events[0]!.details)).not.toContain('well'); // no expansion happened
    expect(events[0]!.eventId).toBe('evt-transfer-mutationleg'); // untouched
  });
});

describe('golden.intent-to-clarification.missing-required-address', () => {
  it('golden.intent-to-clarification.missing-required-address', async () => {
    // Acceptance (3): shipped vocabulary declares aliquot.targetWells required
    // => MISSING_REQUIRED_ARGUMENT_REASON sweep fires on the 422 arm through
    // the real route — NEVER the 500 arm (serial_dilution-quantity-to-500 trap).
    const fixture = fixtureFromManifest(manifest, 'golden.intent-to-clarification.missing-required-address');
    const run = await runGolden(fixture);

    expect(run.status).toBe(422);
    const payload = run.payload;
    expect(payload['error']).toBe('NEEDS_CLARIFICATION');
    expect(payload['outcome']).toBe('needs-clarification');
    expect(classifyCompileResponse(run.status, payload)).toBe('NOT_SUCCESS_CLARIFICATION');

    const clarifications = payload['clarifications'] as Array<Record<string, unknown>>;
    const sweep = clarifications.filter((c) => c['reason'] === 'missing-required-argument');
    expect(sweep).toHaveLength(1);
    expect(sweep[0]).toEqual({
      label: 'targetWells',
      reason: 'missing-required-argument',
      actionLocation: { actionIndex: 0, action: 'aliquot', argument: 'targetWells' },
    });

    // Atomic zero-artifact (SPINE-6 §5(c) idiom): key ABSENCE via Object.keys.
    const ta = payload['terminalArtifacts'] as Record<string, unknown>;
    expect(Object.keys(ta).sort()).toEqual(['directives', 'events', 'gaps', 'protocolIntent']);
    expect(ta['events']).toEqual([]);
    expect(ta['gaps']).toEqual([]);
    for (const key of ['labwareAdditions', 'deckLayoutPlan', 'resourceManifest', 'instrumentRunFiles', 'labStateDelta']) {
      expect(Object.keys(ta)).not.toContain(key);
    }

    // localMacro held (OQ4) + verbatim clarifications deep-equal the record.
    const record = recordFromManifest(manifest, 'golden.intent-to-clarification.missing-required-address');
    const eq = deepEqualGolden(run, record);
    expect(eq.diff ?? '').toBe('');
    expect(eq.ok).toBe(true);

    expect(run.spies.writeCalls).toBe(0);
  });
});
