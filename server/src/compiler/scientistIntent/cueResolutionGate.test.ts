/**
 * SH-QA-1 — the resolution-aware mixture-cue gate (RED-first).
 *
 * The honest rule (spec §A, OQ1 ruling ADOPTED): the blob bar fires ONLY on
 * material labels the resolution engine does NOT bind. The cue MATCHING stays
 * 100% DATA (config/drafting/mixture-material-cues.yaml, byte-identical); the
 * firing DECISION moves to where resolve-vs-mint is known — inside
 * createResolveNounsPass.run(), as a generic slot-identity join (the same
 * boundKeys machinery reconcileModelUnresolved already applies to model
 * hedges). No gate flag in the cue YAML, no exempt additions, no per-record
 * hardcode, zero verb/arg/domain/reason NAME literals in the pass.
 *
 * Harness idiom: declaredArgumentReachability / compositionArgResolution —
 * parseScientistIntent -> compileScientistIntent over a store-backed spine
 * (createResolveSpineFromContext + mockStore). Fixture labels live ONLY in
 * tests (rip-out rule).
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from './parseScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import {
  MIXTURE_BLOB_MATERIAL_REASON,
  UNREALIZED_DECLARED_ARGUMENT_REASON,
  normalizeScientistIntent,
} from './normalizeScientistIntent.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import {
  createResolveNounsPass,
  UNRESOLVED_ARGUMENTS_CODE,
  RESOLVE_NOUNS_PASS_ID,
  MISSING_REQUIRED_ARGUMENT_REASON,
  type ResolveNounsOutput,
} from '../resolution/resolveNounsPass.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import type { ScientistIntent } from './types.js';
import type { BoundNoun, EngineOutcome } from '../resolution/types.js';
import type { PassRunArgs } from '../pipeline/types.js';

/** The blob reason pinned as a WIRE literal (the test pins the contract
 *  string, same idiom as declaredArgumentReachability.test.ts). */
const BLOB = MIXTURE_BLOB_MATERIAL_REASON;

/** Test seeds ONLY. These are the task's verbatim sibling shapes — real
 *  catalogued formulation labels whose names carry the spaced cue " in ". */
const SEED_RECORDS = [
  {
    recordId: 'MAT-clofibrate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: '1 mM Clofibrate in DMSO',
      title: '1 mM Clofibrate in DMSO',
      synonyms: ['1 mm clofibrate in dmso'],
    },
  },
  {
    recordId: 'MAT-lysozyme-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: '5 mg/mL Lysozyme in PBS',
      title: '5 mg/mL Lysozyme in PBS',
      synonyms: ['5 mg/ml lysozyme in pbs'],
    },
  },
  {
    recordId: 'MAT-triton-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: '0.1% Triton X-100 in water',
      title: '0.1% Triton X-100 in water',
      synonyms: ['0.1% triton x-100 in water'],
    },
  },
];

function mockStore(seeds: typeof SEED_RECORDS) {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => seeds.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      seeds.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
  };
}

async function compileWith(seeds: typeof SEED_RECORDS, yaml: string) {
  const store = mockStore(seeds);
  return {
    compiled: await compileScientistIntent(parseScientistIntent(yaml), {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
    }),
    store,
  };
}

const clofibrateDoc = (material: string, intentId: string) => `intentId: ${intentId}
actions:
  - action: add_material
    material: "${material}"
    volumeUl: 10
    targetWells: [A2]
`;

// ---------------------------------------------------------------------------
// T1 (THE blocker, RED-first): a seeded catalogued formulation label that
// carries the spaced cue " in " compiles CLEAN — the blob bar is gated out
// because the resolution engine BINDS the slot. Today's RED:
// needs-clarification carrying unrealized-mixture-blob-material.
// ---------------------------------------------------------------------------
describe('shqa1.t1-resolved-formulation-no-longer-blob-bars', () => {
  it('T1: "1 mM Clofibrate in DMSO" against a seeded catalogued record compiles complete with ZERO clarifications', async () => {
    const { compiled } = await compileWith(SEED_RECORDS, clofibrateDoc('1 mM Clofibrate in DMSO', 'shqa1-t1'));
    expect(compiled.clarifications.filter((c) => c.reason === BLOB)).toEqual([]);
    expect(compiled.clarifications).toEqual([]);
    expect(compiled.outcome).toBe('complete');
    expect(compiled.terminalArtifacts.events.length).toBeGreaterThan(0);
  });

  it('T1b: sibling shape "5 mg/mL lysozyme in PBS" (seeded) compiles complete, no blob fact', async () => {
    const { compiled } = await compileWith(SEED_RECORDS, clofibrateDoc('5 mg/mL lysozyme in PBS', 'shqa1-t1b'));
    expect(compiled.clarifications.filter((c) => c.reason === BLOB)).toEqual([]);
    expect(compiled.outcome).toBe('complete');
  });

  it('T1c: sibling shape "0.1% Triton X-100 in water" (seeded) compiles complete, no blob fact', async () => {
    const { compiled } = await compileWith(SEED_RECORDS, clofibrateDoc('0.1% Triton X-100 in water', 'shqa1-t1c'));
    expect(compiled.clarifications.filter((c) => c.reason === BLOB)).toEqual([]);
    expect(compiled.outcome).toBe('complete');
  });
});

// ---------------------------------------------------------------------------
// T2 (B1 bait): the gate does NOT blunt the bar. An UNRESOLVED cue-bearing
// label with no composition still bars: unknown-noun FIRST, blob fact on the
// SAME slot after it (the pinned two-fact same-slot first bar), the message
// cites the cue found, and NO record is minted.
// ---------------------------------------------------------------------------
describe('shqa1.t2-genuine-blob-still-bars (B1)', () => {
  it('T2: the same shapes against an EMPTY store bar with unknown-noun THEN blob on slot 0:material', async () => {
    const { compiled, store } = await compileWith([], clofibrateDoc('1 mM Clofibrate in DMSO', 'shqa1-t2'));
    expect(compiled.outcome).toBe('needs-clarification');
    expect(compiled.terminalArtifacts.events).toEqual([]);
    const reasons = compiled.clarifications.map((c) => c.reason);
    expect(reasons).toContain('unknown-noun');
    expect(reasons).toContain(BLOB);
    // Order pinned: the engine fact first, the gated producer fact appended
    // after it — the SAME end-of-list position the old append produced.
    expect(reasons).toEqual(['unknown-noun', BLOB]);
    for (const fact of compiled.clarifications) {
      expect(fact.actionLocation).toMatchObject({ actionIndex: 0, argument: 'material' });
    }
    // The blob message cites the cue found (DATA, not a TS literal).
    const blobFact = compiled.clarifications.find((c) => c.reason === BLOB)!;
    expect((blobFact as { message?: string }).message ?? '').toContain('" in "');
    // No partial mint: the store stayed empty (nothing was written).
    expect(await store.list()).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// T3: the channel split at the producer. The blob fact rides
// `resolutionGatedClarifications`, NOT `clarifications`; every other producer
// reason (unrealized-well-label, unrealized-declared-argument) stays on
// `clarifications` byte-identically.
// ---------------------------------------------------------------------------
describe('shqa1.t3-producer-channel-split', () => {
  it('T3: the blob fact rides resolutionGatedClarifications and NOT clarifications', () => {
    const normalized = normalizeScientistIntent(
      parseScientistIntent(clofibrateDoc('1 mM Clofibrate in DMSO', 'shqa1-t3')),
    );
    expect((normalized.clarifications ?? []).filter((c) => c.reason === BLOB)).toEqual([]);
    const gated = normalized.resolutionGatedClarifications ?? [];
    expect(gated.filter((c) => c.reason === BLOB)).toHaveLength(1);
    expect(gated[0]!.actionLocation).toMatchObject({ actionIndex: 0, argument: 'material' });
  });

  it('T3: the other producer reasons stay on clarifications byte-identically', () => {
    const normalized = normalizeScientistIntent(
      parseScientistIntent(`intentId: shqa1-t3-other
actions:
  - action: add_material
    material: Test Thing
    volume: 50 uL
    targetWells: [A1]
`),
    );
    const otherBars = (normalized.clarifications ?? []).filter((c) => c.reason === UNREALIZED_DECLARED_ARGUMENT_REASON);
    expect(otherBars).toHaveLength(1);
    // No cue on this label ⇒ no gated channel at all (key ABSENT, exactOptionalPropertyTypes).
    expect('resolutionGatedClarifications' in normalized).toBe(false);
  });

  it('T3: a blob AND another producer fact coexist on their own channels', () => {
    const normalized = normalizeScientistIntent(
      parseScientistIntent(`intentId: shqa1-t3-both
actions:
  - action: add_material
    material: "1 mM Clofibrate in DMSO"
    volume: 50 uL
    targetWells: [A1]
`),
    );
    expect((normalized.clarifications ?? []).map((c) => c.reason)).toEqual([UNREALIZED_DECLARED_ARGUMENT_REASON]);
    expect((normalized.resolutionGatedClarifications ?? []).map((c) => c.reason)).toEqual([BLOB]);
  });
});

// ---------------------------------------------------------------------------
// T4 (B4 bait — mutation-proof): the gate is the slot-identity join, not
// label matching and not a name table. Engine-stub legs with NO store:
// a binding for slot 0:material suppresses the gated fact EVEN with a
// different label; a binding on another slot does NOT suppress it; no
// binding ⇒ the gated fact survives in the bar diagnostic. A gated fact
// WITHOUT actionLocation is KEPT (never silently dropped).
// ---------------------------------------------------------------------------
const gatedBlobFact = {
  label: 'Gamma/Delta Mixture (50:50)',
  reason: BLOB,
  actionLocation: { actionIndex: 0, action: 'add_material' as const, argument: 'material' },
};

function unitIntent(actions: ScientistIntent['actions']): ScientistIntent {
  return { kind: 'scientist-intent', version: '0.1.0', intentId: 'shqa1-t4', actions, unresolved: [] };
}

const unitRunArgs: PassRunArgs = {
  pass_id: RESOLVE_NOUNS_PASS_ID,
  state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] },
};

function stubEngine(outcome: EngineOutcome) {
  return async (): Promise<EngineOutcome> => outcome;
}

function binding(over: Partial<BoundNoun>): BoundNoun {
  return {
    verb: 'add_material',
    argument: 'material',
    label: 'Something Else Entirely',
    curie: 'local:MAT-x-1',
    confidence: 0.9,
    actionIndex: 0,
    ...over,
  };
}

async function runGatedPass(bindings: BoundNoun[], gated: readonly typeof gatedBlobFact[]) {
  return createResolveNounsPass({
    intent: unitIntent([{ action: 'add_material', material: gated[0]?.label ?? 'x', volumeUl: 10 }]),
    vocabulary: defaultScientistIntentVocabulary(),
    spine: createResolveSpine({}), // declared test seam
    resolve: stubEngine({ bindings, clarifications: [], failures: [], traces: [] }),
    ...(gated.length > 0 ? { resolutionGatedClarifications: gated } : {}),
  }).run(unitRunArgs);
}

describe('shqa1.t4-gate-is-a-slot-identity-join (B4)', () => {
  it('T4: a binding for slot 0:material suppresses the gated fact WITHOUT any store — even when the binding label differs', async () => {
    const result = await runGatedPass([binding({})], [gatedBlobFact]);
    expect(result.ok).toBe(true);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications).toEqual([]);
    expect(output.blocked).toBe(false);
  });

  it('T4 counter-leg: NO binding ⇒ the gated fact survives in the bar diagnostic', async () => {
    const result = await runGatedPass([], [gatedBlobFact]);
    expect(result.ok).toBe(false);
    const diag = result.diagnostics.find((d) => d.code === UNRESOLVED_ARGUMENTS_CODE);
    expect(diag).toBeDefined();
    const facts = (diag!.details!['clarifications'] as Array<{ reason: string }>) ?? [];
    expect(facts.filter((f) => f.reason === BLOB)).toHaveLength(1);
  });

  it('T4 counter-leg: a binding on a DIFFERENT slot does not suppress the gated fact (identity, not label)', async () => {
    const result = await runGatedPass([binding({ actionIndex: 1, argument: 'labware' })], [gatedBlobFact]);
    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications.filter((f) => f.reason === BLOB)).toHaveLength(1);
  });

  it('T4 (B4): a gated fact WITHOUT actionLocation is KEPT, never silently dropped', async () => {
    const labelOnly = { label: gatedBlobFact.label, reason: BLOB };
    const result = await runGatedPass([binding({ label: gatedBlobFact.label })], [labelOnly as typeof gatedBlobFact]);
    expect(result.ok).toBe(false);
    const output = result.output as ResolveNounsOutput;
    expect(output.clarifications.filter((f) => f.reason === BLOB)).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// T5 (COMP-4 composition): unresolved composition entries survive the gate
// (their slot is unbound) and blob-on-material is unaffected.
// ---------------------------------------------------------------------------
describe('shqa1.t5-comp4-composition-entries-survive-the-gate', () => {
  it('T5: unresolved composition entries each keep their clarification (slot 0:composition unbound)', async () => {
    const { compiled } = await compileWith([], `intentId: shqa1-t5-comp
actions:
  - action: add_material
    material: "Alpha Base Solution"
    volumeUl: 50
    targetWells: [A1]
    composition:
      - { material: "component one", role: solvent, fraction: "50%" }
      - { material: "component two", role: diluent, fraction: "50%" }
`);
    expect(compiled.outcome).toBe('needs-clarification');
    const compFacts = compiled.clarifications.filter(
      (c) => c.actionLocation?.argument === 'composition',
    );
    expect(compFacts).toHaveLength(2);
    expect(compFacts.map((c) => c.label)).toEqual(['component one', 'component two']);
    // The two siblings share the slot identity but differ by label — they are
    // distinct facts, never merged (B1/B5).
    expect(compiled.clarifications.filter((c) => c.reason === BLOB)).toHaveLength(0);
  });

  it('T5: blob-on-material is unaffected by a bound composition exemption leg (no composition ⇒ still gated-then-barred)', async () => {
    const { compiled } = await compileWith([], clofibrateDoc('1 mM Clofibrate in DMSO', 'shqa1-t5-blob'));
    expect(compiled.clarifications.filter((c) => c.reason === BLOB)).toHaveLength(1);
  });
});
