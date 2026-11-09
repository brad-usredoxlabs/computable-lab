/**
 * WELLSET-RESOLVER-1 — the RED->GREEN legs (spec RED plan 1-6) + the
 * FIX RUN 1 (advc cycle-1) pins.
 *
 * Legs 3-6 drive the PURE resolver core and the pipeline pass over an injected
 * fixture ledger (the spec's declared method: "unit suite over a fixture
 * ledger"); leg 3 additionally rides compileScientistIntent end-to-end so the
 * republished resolve_roles slot (the real downstream consumer) is pinned.
 *
 * FIX RUN 1 pins (advc D1/D2/D7): the pending-draft layer carries the LIVE
 * expander shape (symbolic top-level labwareId — simpleVerbs.ts :526/:616),
 * the cross-turn union folds onto the committed record, the ambiguity card's
 * candidates are resolved RECORDS only, the answered leg drives a real
 * recompile and converges, and two same-verb actions attribute the resolved
 * set to the event that declared the token.
 *
 * Vacuous-green guard (report 3b): every ledger exercised here is NON-EMPTY
 * and legs 3/4 include the PENDING-DRAFT layer (the current document's own
 * events) beside the committed layer — the union is never []==[].
 *
 * Token discipline: the token string appears in this TEST FIXTURE (allowed —
 * the hardcode sweep exempts fixtures); the pass itself only ever reads the
 * vocabulary's wellsetValueTokens DATA list.
 */
import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadScientistIntentVocabulary,
  defaultScientistIntentVocabulary,
  VOCABULARY_DATA_FILE,
  VOCABULARY_SCHEMA_FILE,
} from './vocabulary.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import { createResolveWellsetsPass } from './resolveWellsetsPass.js';
import {
  resolveWellsets,
  resolveContentsWellset,
  buildContentsLedger,
  columnAlignedGroups,
  AMBIGUOUS_CONTENTS_WELLSET_REASON,
  UNATTRIBUTED_WELLSET_TOKEN_REASON,
} from './wellsetResolver.js';
import { emptyLabState, type LabStateSnapshot } from '../state/LabState.js';
import type { PlateEventPrimitive } from '../biology/BiologyVerbExpander.js';
import type { PipelineState } from '../pipeline/types.js';
import type { ScientistIntentNormalized } from './normalizeScientistIntent.js';

const TOKEN = 'all-wells-containing-materials';

// The row letters (test-side fixture math, mirrors the resolver's own row set).
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
const col = (n: number, rows: readonly string[] = ROWS): string[] => rows.map((r) => `${r}${n}`);

/** A committed-layer snapshot with materials on `wells` of labware `instanceId`
 *  (optionally typed `labwareType` — the declared identity the pending-draft
 *  layer's symbolic hint folds onto, the labwareType-match precedent). */
function committedLabState(
  instanceId: string,
  wells: readonly string[],
  extra?: LabStateSnapshot['labware'],
  labwareType?: string,
): LabStateSnapshot {
  const base = emptyLabState();
  return {
    ...base,
    labware: {
      ...extra,
      [instanceId]: {
        instanceId,
        labwareType: labwareType ?? 'microplate-96',
        slot: '1',
        orientation: 'landscape',
        wells: Object.fromEntries(
          wells.map((w) => [w, [{ materialId: 'MAT-fixture', volumeUl: 50 }]]),
        ),
      },
    },
  };
}

/** A pending-draft add_material event in the shape the LIVE expander produces
 *  (FIX RUN 1 / advc D1): simpleVerbs.ts :526/:616 emit
 *  `labwareId = params.labware_id ?? params.labware` — the SYMBOLIC hint on
 *  the event TOP level, no details.labwareInstanceId. `labwareHint` is what
 *  the scientist typed ('plate'); pass a committed instanceId where the live
 *  create/add sequence shared the id. */
function pendingAddMaterial(labwareHint: string, wells: readonly string[]): PlateEventPrimitive {
  return {
    eventId: `add-${labwareHint}-${wells[0]}`,
    event_type: 'add_material',
    details: { wells: [...wells], material: 'MAT-fixture' },
    labwareId: labwareHint,
  };
}

/** A post-expansion mix event with NO concrete wells (the resolver's target). */
function mixEvent(labwareId?: string, eventId = 'mix-1'): PlateEventPrimitive {
  return {
    eventId,
    event_type: 'mix',
    details: { volume: 75, cycles: 3 },
    ...(labwareId ? { labwareId } : {}),
  };
}

/** A normalized candidateEvent carrying the declared token on the declared
 *  kind:wellset arg (the carrier shape normalize produces at its seam — the
 *  token rides the candidate VERBATIM as `wells`). */
function tokenCandidate(labwareHint?: string): Record<string, unknown> {
  return {
    verb: 'mix',
    wells: TOKEN,
    cycles: 3,
    volume: 75,
    ...(labwareHint ? { labware: labwareHint, labware_id: labwareHint } : {}),
  };
}

function runPass(opts: {
  events: PlateEventPrimitive[];
  candidateEvents: Record<string, unknown>[];
  priorLabState?: LabStateSnapshot;
  vocabulary?: ReturnType<typeof defaultScientistIntentVocabulary>;
  nounsSlot?: { resolvedByLabel?: Record<string, { recordId?: unknown }> };
  labwareSlot?: { resolvedLabwares?: Array<{ hint: string; recordId: string }> };
  scientistAnswers?: Readonly<Record<string, string>>;
}): {
  ok: boolean;
  output?: { events?: PlateEventPrimitive[] };
  secondaryOutputs?: Record<string, unknown>;
  diagnostics?: Array<{ code: string; details?: Record<string, unknown> }>;
} {
  const pass = createResolveWellsetsPass({
    vocabulary: opts.vocabulary ?? defaultScientistIntentVocabulary(),
  });
  const outputs = new Map<string, unknown>();
  outputs.set('resolve_roles', { events: opts.events });
  outputs.set('ai_precompile', {
    candidateEvents: opts.candidateEvents,
  } as ScientistIntentNormalized);
  if (opts.nounsSlot) outputs.set('resolve_nouns', opts.nounsSlot);
  if (opts.labwareSlot) outputs.set('resolve_labware', opts.labwareSlot);
  const state = {
    input: {
      ...(opts.priorLabState ? { labState: opts.priorLabState } : {}),
      ...(opts.scientistAnswers ? { scientistAnswers: opts.scientistAnswers } : {}),
    },
    context: {},
    meta: {},
    outputs,
    diagnostics: [],
  } as unknown as PipelineState;
  const result = pass.run({ pass_id: 'resolve_wellsets', state });
  if (result instanceof Promise) throw new Error('resolve_wellsets pass must be synchronous');
  return result as ReturnType<typeof runPass>;
}

// ---------------------------------------------------------------------------
// Leg 1 — the schema door (RED at base: the enum did NOT admit `wellset`)
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 1 — schema door: kind: wellset is vocabulary DATA', () => {
  it('the shipped vocabulary declares mix.wells kind: wellset + the token list', () => {
    const vocab = defaultScientistIntentVocabulary();
    const wellsArg = vocab.argContracts('mix').find((c) => c.name === 'wells');
    expect(wellsArg, 'mix must declare the wells wellset carrier').toBeDefined();
    expect(wellsArg!.kind).toBe('wellset');
    expect(wellsArg!.required).toBe(false);
    expect(wellsArg!.domain).toBe('labware');
    expect(vocab.wellsetValueTokens()).toEqual([TOKEN]);
  });

  // FIX RUN 1 (advc D8): the material-bearing taxonomy is vocabulary DATA —
  // the TS hardcode it replaces had no declared source.
  it('the shipped vocabulary declares the material-bearing event types (D8 DATA)', () => {
    const vocab = defaultScientistIntentVocabulary();
    expect([...vocab.materialBearingEventTypes()].sort())
      .toEqual(['add_material', 'dispense', 'multi_dispense']);
  });

  it('RED pin: the BASE meta-schema (enum WITHOUT wellset) REJECTS the shipped vocabulary', () => {
    // The loader validates schema+lint beside the data file (opts.path
    // discipline, never the process singleton). Restore the pre-item enum in a
    // temp dir and prove the door is Ajv DATA, not the TS union: the SAME
    // vocabulary document fails structural validation at the base enum.
    const dir = mkdtempSync(join(tmpdir(), 'wellset-leg1-'));
    const srcDir = join(process.cwd(), 'schema', 'scientist-intent');
    cpSync(join(srcDir, VOCABULARY_SCHEMA_FILE), join(dir, VOCABULARY_SCHEMA_FILE));
    cpSync(join(srcDir, 'scientist-intent-vocabulary.lint.yaml'), join(dir, 'scientist-intent-vocabulary.lint.yaml'));
    cpSync(join(srcDir, VOCABULARY_DATA_FILE), join(dir, VOCABULARY_DATA_FILE));
    const schemaFile = join(dir, VOCABULARY_SCHEMA_FILE);
    const schemaText = readFileSync(schemaFile, 'utf-8');
    expect(schemaText).toContain('enum: [resolvable, scalar, wells, quantity, wellset]');
    writeFileSync(
      schemaFile,
      schemaText.replace('enum: [resolvable, scalar, wells, quantity, wellset]', 'enum: [resolvable, scalar, wells, quantity]'),
      'utf-8',
    );
    expect(() => loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) }))
      .toThrow(/failed schema validation/);
  });

  it('the token list is read PER LOAD: a vocabulary copy without the section loads with an EMPTY token list', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wellset-leg1b-'));
    const srcDir = join(process.cwd(), 'schema', 'scientist-intent');
    cpSync(join(srcDir, VOCABULARY_SCHEMA_FILE), join(dir, VOCABULARY_SCHEMA_FILE));
    cpSync(join(srcDir, 'scientist-intent-vocabulary.lint.yaml'), join(dir, 'scientist-intent-vocabulary.lint.yaml'));
    const dataText = readFileSync(join(srcDir, VOCABULARY_DATA_FILE), 'utf-8');
    const stripped = dataText.replace(/^wellsetValueTokens:\n\s+- .*\n/m, '');
    expect(stripped).not.toContain(`${TOKEN}\n`);
    writeFileSync(join(dir, VOCABULARY_DATA_FILE), stripped, 'utf-8');
    const vocab = loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) });
    expect(vocab.wellsetValueTokens()).toEqual([]);
    // The arg still declares (the optional slot governs the TOKENS, not the arg).
    expect(vocab.argContracts('mix').some((c) => c.kind === 'wellset')).toBe(true);
  });

  // D8 fail-closed arm: strip the DATA section and the pending layer is EMPTY
  // (the committed layer survives; no hardcoded fallback taxonomy refills it).
  it('D8 per-load: a vocabulary copy without materialBearingEventTypes contributes NO pending wells', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wellset-leg1c-'));
    const srcDir = join(process.cwd(), 'schema', 'scientist-intent');
    cpSync(join(srcDir, VOCABULARY_SCHEMA_FILE), join(dir, VOCABULARY_SCHEMA_FILE));
    cpSync(join(srcDir, 'scientist-intent-vocabulary.lint.yaml'), join(dir, 'scientist-intent-vocabulary.lint.yaml'));
    const dataText = readFileSync(join(srcDir, VOCABULARY_DATA_FILE), 'utf-8');
    const stripped = dataText.replace(/^materialBearingEventTypes:\n(\s+- .*\n)+/m, '');
    expect(stripped).not.toContain('materialBearingEventTypes:');
    writeFileSync(join(dir, VOCABULARY_DATA_FILE), stripped, 'utf-8');
    const vocab = loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) });
    expect(vocab.materialBearingEventTypes()).toEqual([]);
    const result = resolveWellsets({
      events: [pendingAddMaterial('LWI-9', col(4)), mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: committedLabState('LWI-9', col(1)),
      vocabulary: vocab,
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    // Only the committed layer survives: the pending A4:B4 never leaks through
    // a hardcoded fallback taxonomy (fail-closed, never guess).
    expect(mix.details.wells).toEqual(col(1));
  });
});

// ---------------------------------------------------------------------------
// Leg 2 — the carrier: normalize carries the token string pre-resolution
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 2 — the token rides the normalize seam pre-resolution', () => {
  it('mix {wells: <token>} parses and the candidate event carries the TOKEN STRING (not a well list, not dropped, not barred)', () => {
    const doc = parseScientistIntent(`
intentId: leg2-carrier
actions:
  - action: mix
    labware: plate
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    const out = normalizeScientistIntent(doc, { vocabulary: defaultScientistIntentVocabulary() });
    // COMP-1 Task 16(b) exemption: the declared token on the declared wellset
    // arg has a downstream consumer — it must NOT bar as unrealized.
    expect(out.clarifications ?? [], 'the declared token must not bar').toEqual([]);
    const candidate = out.candidateEvents.find((c) => c.verb === 'mix');
    expect(candidate, 'a mix candidate event must exist').toBeDefined();
    expect(candidate!['wells']).toBe(TOKEN);
  });

  it('parse carries a declared wellset arg VERBATIM (the whitelist extension is vocabulary-DATA scoped)', () => {
    const doc = parseScientistIntent(`
intentId: leg2-parse
actions:
  - action: mix
    labware: plate
    cycles: 3
    wells: ${TOKEN}
`);
    expect(doc.actions[0]).toMatchObject({ wells: TOKEN });
  });

  it('a NON-token scalar on a verb with NO declared wellset carrier STILL bars (exemption is DATA-scoped)', () => {
    // Drive normalize directly: parse's whitelist already drops an undeclared
    // wells scalar; the (b) bar's own door (a raw action record reaching
    // normalize — the chatbot-chain shape) must stay RED for non-tokens.
    const out = normalizeScientistIntent({
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'leg2-guard',
      actions: [{ action: 'spin', wells: 'not-a-well-address', rpm: 300 } as never],
      unresolved: [],
    }, { vocabulary: defaultScientistIntentVocabulary() });
    const bar = (out.clarifications ?? []).find((f) => f.reason === 'unrealized-declared-argument');
    expect(bar, 'the base (b) bar must survive for undeclared values').toBeDefined();
    expect(bar!.actionLocation?.argument).toBe('wells');
  });
});

// ---------------------------------------------------------------------------
// Leg 3 — the resolver: committed A1:H1 + PENDING A2:H2 -> the A1:H2 union
// (Brad's worked example verbatim; non-empty ledger incl. the pending layer)
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 3 — fixture ledger resolves the token to the A1:H2 union', () => {
  // FIX RUN 1 / advc D1: the pending layer uses the LIVE expander shape — the
  // SYMBOLIC hint 'plate' on the event top level (simpleVerbs.ts :526/:616),
  // never a committed instanceId. The committed plate declares its type
  // 'plate' (the live create_container labwareType the hint names), which is
  // the DECLARED evidence the ledger folds the hint onto LWI-1 — a single
  // identity, so the cross-turn union is the A1:H2 set (the D1 blocker's
  // reviewer case 1: the union lands on the mix, A1:H1 is never dropped).
  const prior = committedLabState('LWI-1', col(1), undefined, 'plate');
  const pending = pendingAddMaterial('plate', col(2));

  it('the pure core: token resolves to the union WITH the labware binding', () => {
    const result = resolveWellsets({
      events: [pending, mixEvent('plate')],
      candidateEvents: [tokenCandidate('plate')],
      priorLabState: prior,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    // The union: committed A1:H1 folded with pending A2:H2 onto LWI-1 —
    // never A2:B2-only (the D1 silent narrowing), never a clarification.
    expect(mix.details.wells).toEqual([...col(1), ...col(2)].sort());
    // The shipped event carries a RESOLVED record binding (not just the hint).
    expect(mix.details.labwareId).toBe('LWI-1');
    expect(result.ambiguous).toEqual([]);
    expect(result.applied).toHaveLength(1);
    // The pending-draft layer MUST have contributed (vacuous-green guard):
    // without it the union would be only A1:H1.
    expect((mix.details.wells as string[]).filter((w) => w.endsWith('2'))).toEqual(col(2));
    // Committed-only sanity: dropping the pending event shrinks the set.
    const committedOnly = resolveContentsWellset(
      buildContentsLedger(prior, [], defaultScientistIntentVocabulary().materialBearingEventTypes()),
    );
    expect(committedOnly.wells).toEqual(col(1));
    expect(committedOnly.labwareId).toBe('LWI-1');
  });

  it('the fold is declared-evidence only: an unmappable symbolic hint does NOT create a second labware (D1)', () => {
    // The committed plate is typed 'microplate-96' (NOT the hint 'plate'),
    // the document declares no create for 'plate' and no slot resolves it:
    // the pending bucket stays UNRESOLVED -> never-guess clarification,
    // never a silent wrong set and never a fabricated second plate.
    const result = resolveWellsets({
      events: [pendingAddMaterial('plate', col(2)), mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: committedLabState('LWI-1', col(1)),
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.unresolved).toEqual(['plate']);
    // Honest candidates: the resolved records only (LWI-1), never 'plate'.
    expect(result.ambiguous[0]!.records.map((r) => r.instanceId)).toEqual(['LWI-1']);
  });

  it('the fold follows the document slot: resolve_labware hint->recordId merges the buckets', () => {
    // No type match, but the resolve_labware slot resolves 'plate' to LWI-1
    // (the document resolves its own hint): ONE bucket, the A1:H2 union.
    const result = resolveWellsets({
      events: [pendingAddMaterial('plate', col(2)), mixEvent()],
      candidateEvents: [tokenCandidate('plate')],
      priorLabState: committedLabState('LWI-1', col(1)),
      vocabulary: defaultScientistIntentVocabulary(),
      labwareSlot: { resolvedLabwares: [{ hint: 'plate', recordId: 'LWI-1' }] },
    });
    expect(result.ambiguous).toEqual([]);
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.wells).toEqual([...col(1), ...col(2)].sort());
    expect(mix.details.labwareId).toBe('LWI-1');
  });

  it('the pass republishes the concrete wells to the resolve_roles slot (the real downstream seam)', () => {
    const res = runPass({
      events: [pending, mixEvent('plate')],
      candidateEvents: [tokenCandidate('plate')],
      priorLabState: prior,
    });
    expect(res.ok).toBe(true);
    const republished = res.secondaryOutputs?.['resolve_roles'] as { events: PlateEventPrimitive[] };
    expect(republished, 'the pass must republish the resolve_roles slot').toBeDefined();
    const mix = republished.events.find((e) => e.event_type === 'mix')!;
    expect((mix.details.wells as string[]).length).toBe(16);
    expect(mix.details.labwareId).toBe('LWI-1');
  });

  it('END-TO-END: compileScientistIntent with priorLabState ships a complete mix event carrying the resolved union', async () => {
    const doc = parseScientistIntent(`
intentId: leg3-e2e
actions:
  - action: mix
    labware: plate
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    const { terminalArtifacts, outcome, clarifications } = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async (hint: string) => [{ recordId: `LAB-${hint}`, title: hint }],
      priorLabState: prior,
    });
    expect(clarifications).toEqual([]);
    expect(outcome).toBe('complete');
    const mix = terminalArtifacts.events.find((e) => e.event_type === 'mix') as
      { details: Record<string, unknown> } | undefined;
    expect(mix, 'a mix event must ship').toBeDefined();
    const wells = mix!.details.wells as string[];
    expect(wells.length, 'NON-vacuous union (acceptance 2)').toBeGreaterThan(0);
    expect(wells).toEqual(col(1)); // committed-only here (doc has no add_material event)
    expect(mix!.details.volume).toBe(75);
    expect(mix!.details.cycles).toBe(3);
  });

  it('no token anywhere => byte-identical passthrough (the common case)', () => {
    const events = [pending, mixEvent('plate')];
    const result = resolveWellsets({
      events,
      candidateEvents: [{ verb: 'mix', cycles: 3 }],
      priorLabState: prior,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.events).toEqual(events);
    expect(result.applied).toEqual([]);
    expect(result.ambiguous).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Leg 4 — never-guess: two contents-bearing labware -> ZERO wells + ONE
// clarification with the NEW reason-code constant; the answered leg drives a
// REAL recompile and converges (FIX RUN 1 / advc D2).
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 4 — ambiguous two-plate contents set never-guesses', () => {
  const twoPlates: LabStateSnapshot = {
    ...emptyLabState(),
    labware: {
      ...committedLabState('LWI-1', col(1)).labware,
      ...committedLabState('LWI-2', col(2)).labware,
    },
  };

  it('the pure core: ambiguous => zero wells materialized', () => {
    const result = resolveWellsets({
      events: [pendingAddMaterial('LWI-1', col(3)), mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: twoPlates,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.wells).toBeUndefined();
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.token).toBe(TOKEN);
    expect(result.ambiguous[0]!.records.map((r) => r.instanceId).sort()).toEqual(['LWI-1', 'LWI-2']);
  });

  it('the pass bars with ONE clarification carrying the NEW reason-code constant', () => {
    const res = runPass({
      events: [pendingAddMaterial('LWI-1', col(3)), mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: twoPlates,
    });
    expect(res.ok).toBe(false);
    expect(res.diagnostics).toHaveLength(1);
    const facts = res.diagnostics![0]!.details?.['clarifications'] as Array<{
      label: string; reason: string; candidates: Array<{ label: string; ref?: string }>;
      actionLocation?: Record<string, unknown>;
    }>;
    expect(facts).toHaveLength(1);
    // The NEW reason-code constant — not just a shape: the exact OQ-3 value.
    expect(facts[0]!.reason).toBe(AMBIGUOUS_CONTENTS_WELLSET_REASON);
    expect(facts[0]!.reason).toBe('ambiguous-contents-wellset');
    expect(facts[0]!.label).toBe(TOKEN);
    // D11: candidates are RESOLVED RECORDS only (with their record refs).
    expect(facts[0]!.candidates.map((c) => c.label).sort()).toEqual(['LWI-1', 'LWI-2']);
    expect(facts[0]!.candidates.every((c) => typeof c.ref === 'string')).toBe(true);
    expect(facts[0]!.actionLocation).toMatchObject({ action: 'mix', argument: 'wells' });
  });

  it('D11: the fact rides the readings arm so the card offers the RECORDS as options', () => {
    const res = runPass({
      events: [pendingAddMaterial('LWI-1', col(3)), mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: twoPlates,
    });
    const fact = (res.diagnostics![0]!.details?.['clarifications'] as Array<
      Record<string, unknown>
    >)[0]!;
    const readings = fact['readings'] as Array<{ id: string; label: string }>;
    expect(readings.map((r) => r.id).sort()).toEqual(['LWI-1', 'LWI-2']);
  });

  it('END-TO-END: the bar surfaces as the needs-clarification 422 arm', async () => {
    const doc = parseScientistIntent(`
intentId: leg4-e2e
actions:
  - action: mix
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    const { outcome, clarifications, terminalArtifacts } = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async () => [],
      priorLabState: twoPlates,
    });
    expect(outcome).toBe('needs-clarification');
    const card = clarifications.find((c) => c.reason === AMBIGUOUS_CONTENTS_WELLSET_REASON);
    expect(card, 'the ambiguous card must ride the existing unresolved-fact envelope').toBeDefined();
    // Atomic bar: no half-resolved graph ships.
    expect(terminalArtifacts.events).toEqual([]);
  });

  // FIX RUN 1 / advc D2 (replaces the fake pre-pinned "ANSWERED leg"): the
  // answer rides the EXISTING readings channel (§14.2 scientistAnswers: key =
  // the fact's label = the token, value = the chosen record id) onto a REAL
  // compileScientistIntent RECOMPILE — it resolves the set and converges
  // WITHOUT re-raising (no bar loop).
  it('ANSWERED leg (drives the real recompile): the chosen record converges, no re-fire', async () => {
    const doc = parseScientistIntent(`
intentId: leg4-answered
actions:
  - action: mix
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    // First compile: the never-guess bar.
    const first = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async () => [],
      priorLabState: twoPlates,
    });
    expect(first.outcome).toBe('needs-clarification');
    const card = first.clarifications.find((c) => c.reason === AMBIGUOUS_CONTENTS_WELLSET_REASON)!;
    expect(card, 'the ambiguous card fired first').toBeDefined();

    // The scientist picks LWI-2 from the card's reading options.
    const second = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async () => [],
      priorLabState: twoPlates,
      scientistAnswers: { [card.label]: 'LWI-2' },
    });
    // Converges: no re-fire of the ambiguity (nor of any other card).
    expect(second.clarifications).toEqual([]);
    expect(second.outcome).toBe('complete');
    const mix = second.terminalArtifacts.events.find((e) => e.event_type === 'mix') as
      { details: Record<string, unknown> } | undefined;
    expect(mix, 'the answered mix ships').toBeDefined();
    // Restricted to the CHOSEN plate: exactly LWI-2's contents. Never a
    // re-raise, never a guess: LWI-1's wells never materialize.
    expect(mix!.details.wells).toEqual(col(2));
    expect((mix!.details.wells as string[]).some((w) => w.endsWith('1') || w.endsWith('3'))).toBe(false);
  });

  it('D1+D2: answering the unresolved-hint card converges — the bucket folds onto the chosen record', () => {
    // Case 1b answered: the card named 'plate' unresolved; the scientist
    // chose LWI-1 from the record options. The answer re-pins AND folds the
    // hint's bucket onto the chosen record -> the A1:H2 union ships, the
    // never-guess arm is gone (no re-fire), no second labware was created.
    const result = resolveWellsets({
      events: [pendingAddMaterial('plate', col(2)), mixEvent()],
      candidateEvents: [tokenCandidate('plate')],
      priorLabState: committedLabState('LWI-1', col(1)),
      vocabulary: defaultScientistIntentVocabulary(),
      scientistAnswers: { [TOKEN]: 'LWI-1' },
    });
    expect(result.ambiguous).toEqual([]);
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.wells).toEqual([...col(1), ...col(2)].sort());
    expect(mix.details.labwareId).toBe('LWI-1');
  });

  it('D1: a SYMBOLIC labwareId on the event is NEVER a pin (no silent narrowing)', () => {
    // The mix event carries the symbolic hint 'plate' (the live expander
    // shape); the ledger spans two plates. The hint must NOT pin the ledger
    // to the pending bucket (the D1 blocker): the set stays AMBIGUOUS.
    const result = resolveWellsets({
      events: [pendingAddMaterial('LWI-1', col(3)), { ...mixEvent(), labwareId: 'plate' }],
      candidateEvents: [tokenCandidate('plate')],
      priorLabState: twoPlates,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.ambiguous).toHaveLength(1);
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.wells).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Leg 5 — single-plate binding: the set PLUS the labware binding lands on the
// event (Q3 fold).
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 5 — single-plate set + labware binding', () => {
  it('one contents-bearing labware => {wells, labwareId} and the binding lands on the event', () => {
    const vocab = defaultScientistIntentVocabulary();
    const ledger = buildContentsLedger(committedLabState('LWI-9', col(4)), [], vocab.materialBearingEventTypes());
    const resolution = resolveContentsWellset(ledger);
    expect(resolution.wells).toEqual(col(4));
    expect(resolution.labwareId).toBe('LWI-9');

    const result = resolveWellsets({
      events: [mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: committedLabState('LWI-9', col(4)),
      vocabulary: vocab,
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.labwareId).toBe('LWI-9');
    expect(mix.details.wells).toEqual(col(4));
  });

  it('a deck-bound event keeps ITS binding (never clobbered by the resolver)', () => {
    const result = resolveWellsets({
      events: [{ ...mixEvent(), details: { volume: 75 }, labwareId: 'DECK-PLATE' }],
      candidateEvents: [tokenCandidate()],
      priorLabState: committedLabState('LWI-9', col(4)),
      vocabulary: defaultScientistIntentVocabulary(),
      nounsSlot: { resolvedByLabel: { 'DECK-PLATE': { recordId: 'DECK-PLATE' } } },
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.labwareId).toBe('DECK-PLATE');
    expect(mix.details.labwareId).toBeUndefined();
    // The set is still the contents set (the binding question is separate).
    expect(mix.details.wells).toEqual(col(4));
  });
});

// ---------------------------------------------------------------------------
// Leg 6 — 8-channel column-aligned expansion; single-channel flattening fails
// (the B8 mirror).
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 leg 6 — column-aligned 8-channel expansion', () => {
  it('full columns A..H group as 8-channel ops', () => {
    const groups = columnAlignedGroups([...col(1), ...col(2)]);
    expect(groups.full).toBe(true);
    expect(groups.columns).toEqual([col(1), col(2)]);
    for (const c of groups.columns) {
      expect(c.length).toBe(8);
      expect(c).toEqual([...ROWS].map((r) => `${r}${c[0]![1]}`));
    }
  });

  it('a row-spread single-channel flattening is NOT column-aligned (the B8 mirror fails closed)', () => {
    const rowSpread = ROWS.map((r) => `${r}1`).concat(ROWS.map((r) => `${r}2`.replace('2', '2')));
    // A1,B1,...,H1,A2..H2 mixes two FULL columns — build a genuinely partial
    // column set instead: one well short of full.
    const partial = [...ROWS.slice(0, 7).map((r) => `${r}1`), ...rowSpread.slice(8)];
    const groups = columnAlignedGroups(partial);
    expect(groups.full).toBe(false);
    const flattening = resolveContentsWellset(
      buildContentsLedger(
        committedLabState('LWI-1', partial),
        [],
        defaultScientistIntentVocabulary().materialBearingEventTypes(),
      ),
    );
    expect(flattening.columnAligned, 'partial columns emit NO 8-channel shape').toBeUndefined();
  });

  it('the resolver writes wellColumns + channels:8 on a column-aligned contents set', () => {
    const result = resolveWellsets({
      events: [mixEvent()],
      candidateEvents: [tokenCandidate()],
      priorLabState: committedLabState('LWI-1', [...col(1), ...col(2)]),
      vocabulary: defaultScientistIntentVocabulary(),
    });
    const mix = result.events.find((e) => e.event_type === 'mix')!;
    expect(mix.details.wellColumns).toEqual([col(1), col(2)]);
    expect(mix.details.channels).toBe(8);
  });
});

// ---------------------------------------------------------------------------
// FIX RUN 1 (advc D7) + FIX RUN 2 (advc D12) — the candidate->event join is an
// IDENTITY join, never silence: two same-verb actions and the skew arms.
// ---------------------------------------------------------------------------
describe('WELLSET-RESOLVER-1 D7/D12 — candidate->event attribution by identity, never silence', () => {
  const single: LabStateSnapshot = committedLabState('LWI-1', col(4));

  it('the token on the SECOND mix action writes the set onto the SECOND event only', () => {
    // Action 1: an explicit well list (materialized by the document, not the
    // resolver). Action 2: the token. The join is per-verb ordinal: the
    // resolved set lands on the event that DECLARED the token.
    const explicit: PlateEventPrimitive = {
      eventId: 'mix-a',
      event_type: 'mix',
      details: { volume: 75, cycles: 3, wells: ['A9'] },
    };
    const result = resolveWellsets({
      events: [explicit, mixEvent(undefined, 'mix-b')],
      candidateEvents: [
        { verb: 'mix', wells: ['A9'], cycles: 3, volume: 75 },
        tokenCandidate(),
      ],
      priorLabState: single,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    const a = result.events.find((e) => e.eventId === 'mix-a')!;
    const b = result.events.find((e) => e.eventId === 'mix-b')!;
    expect(a.details.wells).toEqual(['A9']); // untouched — explicitly declared
    expect(b.details.wells).toEqual(col(4)); // the token event got the set
    expect(b.details.labwareId).toBe('LWI-1');
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]!.eventId).toBe('mix-b');
  });

  // FIX RUN 2 (advc D12): the arm that used to be SILENT is now the RED->GREEN
  // pin of the clarification arm. A candidate whose well arg lost the token
  // can never be attributed — the resolver holds a COMPUTED set and must say
  // so (UNATTRIBUTED_WELLSET_TOKEN_REASON). "applied: [], no wells, no card"
  // was the vacuous-green acceptance failure; it is now a bar.
  it('D12 RED->GREEN: dropped-token join => UNATTRIBUTED clarification, never silence', () => {
    // The lowering chain lost the token from the candidate's `wells` arg
    // (it survived only under params) — the token-verbatim join fails and
    // the set is never attributed to a possibly-wrong event.
    const result = resolveWellsets({
      events: [mixEvent(undefined, 'mix-a'), mixEvent(undefined, 'mix-b')],
      candidateEvents: [
        { verb: 'mix', cycles: 3, volume: 75 },
        { verb: 'mix', params: { wells: TOKEN }, cycles: 3, volume: 75 },
      ],
      priorLabState: single,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.applied).toHaveLength(0);
    for (const e of result.events) expect(e.details.wells).toBeUndefined();
    // NEVER-SILENT (D12): the computed set raises the honest fact instead of
    // vanishing into an empty applied list.
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.reason).toBe(UNATTRIBUTED_WELLSET_TOKEN_REASON);
    expect(result.ambiguous[0]!.token).toBe(TOKEN);
  });

  it('D12: count mismatch (expander fan-out / verb drop) => UNATTRIBUTED facts, never a wrong-event write', () => {
    // Two mix candidates, ONE mix event (the other verb candidate was an
    // unknown-verb drop): the 1:1 order invariant is broken — the join
    // refuses instead of guessing which event owned the token. FIX RUN 2:
    // the refusal is now LOUD (one never-silent fact per unattributable
    // token), never a silent empty applied list.
    const result = resolveWellsets({
      events: [mixEvent(undefined, 'mix-a')],
      candidateEvents: [tokenCandidate(), tokenCandidate()],
      priorLabState: single,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.applied).toHaveLength(0);
    expect(result.events[0]!.details.wells).toBeUndefined();
    expect(result.ambiguous).toHaveLength(2); // one honest fact per candidate
    expect(result.ambiguous.every((a) => a.reason === UNATTRIBUTED_WELLSET_TOKEN_REASON)).toBe(true);
  });

  // The D12 reproduction itself (reviewer probe /tmp/ws-adv2-probe2.ts): a doc
  // with `resuspend` + `mix wells: <token>` => TWO event_type:'mix' events vs
  // ONE 'mix' candidate. The verb-ordinal join rejected the token (count skew)
  // and shipped the mix with no wells, no binding and no card.
  it('D12: resuspend+mix skew resolves by DECLARED PROVENANCE — the token lands on the mix event, the resuspend event is untouched', () => {
    // The expand pass stamps details.sourceActionIndex = the emitting
    // candidate's ai_precompile index (opt-in on the scientist-intent
    // registry). The join correlates on THAT identity, not on the
    // event_type/count.
    const events: PlateEventPrimitive[] = [
      { eventId: 'mix-from-resuspend', event_type: 'mix', details: { volume: '100', cycles: 10, sourceActionIndex: 0 }, labwareId: 'plate' },
      { eventId: 'mix-from-mix', event_type: 'mix', details: { volume: 75, cycles: 3, sourceActionIndex: 1 }, labwareId: 'plate' },
    ];
    const result = resolveWellsets({
      events,
      candidateEvents: [
        { verb: 'resuspend', labware: 'plate', volume: '100' },
        tokenCandidate('plate'),
      ],
      priorLabState: single,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.ambiguous).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(result.applied[0]!.eventId).toBe('mix-from-mix');
    const a = result.events.find((e) => e.eventId === 'mix-from-resuspend')!;
    const b = result.events.find((e) => e.eventId === 'mix-from-mix')!;
    expect(a.details.wells).toBeUndefined(); // resuspend untouched
    expect(b.details.wells).toEqual(col(4)); // the token's own event got the set
  });

  it('D12: provenance present but the token event absent (fan-out / drop) => UNATTRIBUTED, never the neighbour event', () => {
    // Provenance present on the list => the ordinal fallback is OFF: an
    // unmatchable candidate must NOT steal the same-event-type neighbour.
    const events: PlateEventPrimitive[] = [
      { eventId: 'mix-other', event_type: 'mix', details: { volume: '100', cycles: 10, sourceActionIndex: 0 }, labwareId: 'plate' },
    ];
    const result = resolveWellsets({
      events,
      candidateEvents: [
        { verb: 'resuspend', labware: 'plate', volume: '100' },
        tokenCandidate('plate'),
      ],
      priorLabState: single,
      vocabulary: defaultScientistIntentVocabulary(),
    });
    expect(result.applied).toHaveLength(0);
    expect(events[0]!.details.wells).toBeUndefined();
    const written = result.events.find((e) => e.eventId === 'mix-other')!;
    expect(written.details.wells).toBeUndefined();
    expect(result.ambiguous).toHaveLength(1);
    expect(result.ambiguous[0]!.reason).toBe(UNATTRIBUTED_WELLSET_TOKEN_REASON);
  });

  it('D12: provenance is STRIPPED by the pass — no shipped event carries the join identity', () => {
    const res = runPass({
      events: [
        { eventId: 'mix-from-resuspend', event_type: 'mix', details: { volume: '100', cycles: 10, sourceActionIndex: 0 }, labwareId: 'plate' },
        { eventId: 'mix-1', event_type: 'mix', details: { volume: 75, cycles: 3, sourceActionIndex: 1 }, labwareId: 'plate' },
      ],
      candidateEvents: [
        { verb: 'resuspend', labware: 'plate', volume: '100' },
        tokenCandidate('plate'),
      ],
      priorLabState: single,
    });
    expect(res.ok).toBe(true);
    const republished = res.secondaryOutputs?.['resolve_roles'] as { events: PlateEventPrimitive[] };
    expect(republished).toBeDefined();
    for (const e of republished.events) {
      expect(e.details.sourceActionIndex).toBeUndefined();
    }
    const mix = republished.events.find((e) => e.eventId === 'mix-1')!;
    expect(mix.details.wells).toEqual(col(4));
  });

  it('END-TO-END D12: real compileScientistIntent with resuspend + token mix — correct-identity join, zero clarifications', async () => {
    const doc = parseScientistIntent(`
intentId: d12-e2e
actions:
  - action: resuspend
    labware: plate
    volume: 100
  - action: mix
    labware: plate
    cycles: 3
    volume: 75
    wells: ${TOKEN}
`);
    const prior = committedLabState('LWI-1', col(1), undefined, 'plate');
    const { outcome, clarifications, terminalArtifacts } = await compileScientistIntent(doc, {
      spine: createResolveSpine({}),
      searchLabwareByHint: async (hint: string) => [{ recordId: `LAB-${hint}`, title: hint }],
      priorLabState: prior,
    });
    expect(clarifications).toEqual([]);
    expect(outcome).toBe('complete');
    const mixes = terminalArtifacts.events.filter((e) => e.event_type === 'mix') as
      Array<{ details: Record<string, unknown> }> | never[];
    expect(mixes.length).toBeGreaterThanOrEqual(1);
    // ONE mix carries the resolved union; NONE ships empty-handed silently.
    const withWells = mixes.filter((m) => Array.isArray(m.details.wells) && (m.details.wells as string[]).length > 0);
    expect(withWells).toHaveLength(1);
    expect(withWells[0]!.details.wells).toEqual(col(1));
    // The join identity never ships.
    for (const m of mixes) expect(m.details.sourceActionIndex).toBeUndefined();
  });
});
