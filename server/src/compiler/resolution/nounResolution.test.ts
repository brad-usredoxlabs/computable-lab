/**
 * SPINE-3 noun-resolution — the six §6 acceptance criteria (RED-first).
 *
 * Criteria (verbatim from the task list):
 * - noun-resolution.verb-constrained-domain
 * - noun-resolution.material-levels
 * - noun-resolution.local-term-identity
 * - noun-resolution.policy-is-data
 * - noun-resolution.ambiguity-and-failure
 * (noun-resolution.hint-parity lives in hintParity.test.ts.)
 *
 * Engine law inherited from SPINE-2: the engine reads policies()/argContracts()
 * data; it never branches on a verb, class, or domain NAME. Fixtures are COPIES
 * of the shipped vocabulary (never the shipped file itself).
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { loadScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { parseScientistIntent } from '../scientistIntent/parseScientistIntent.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from '../../resolve/types.js';
import {
  createFailureTrackingProvider,
  createSpineAdapter,
  createLabwareHintAdapter,
  createRegistryAdapter,
  createRoleAddressAdapter,
} from './adapters.js';
import { buildStrategyRegistry } from './strategies.js';
import {
  resolveNoun,
  resolveScientistIntentNouns,
  type EngineDeps,
  type ResolutionRequest,
} from './resolutionEngine.js';

const FIXTURES = 'src/compiler/resolution/fixtures';
const shippedVocab = () => loadScientistIntentVocabulary();
const fixtureVocab = (dir: string) =>
  loadScientistIntentVocabulary({ path: join(process.cwd(), FIXTURES, dir, 'scientist-intent-vocabulary.yaml') });

// ---------------------------------------------------------------------------
// Test plumbing: fake providers behind the REAL spine (no server needed).
// ---------------------------------------------------------------------------

function hits(...hs: ProviderHit[]): ResolveProvider {
  return async () => hs;
}

function throwing(message: string): ResolveProvider {
  return async () => {
    throw new Error(message);
  };
}

function spineWith(termProvider: ResolveProvider, recordProvider: ResolveProvider) {
  const tracker = { failed: false };
  const spine = createResolveSpine({
    termProvider: createFailureTrackingProvider(termProvider, tracker),
    recordProvider: createFailureTrackingProvider(recordProvider, tracker),
    localTimeoutMs: 500,
    remoteTimeoutMs: 500,
  });
  return { spine, tracker };
}

function depsFor(opts: {
  spine: ReturnType<typeof spineWith>['spine'];
  tracker: { failed: boolean };
  searchLabwareByHint?: (hint: string) => Promise<Array<{ recordId: string; title: string }>>;
  registries?: { labware?: Record<string, string>; compound?: Record<string, string> };
  levelFor?: (verb: string, argument: string) => ResolutionRequest['wantLevel'];
  vocab: ReturnType<typeof shippedVocab>;
}): EngineDeps {
  const adapters = [
    createSpineAdapter(opts.spine, opts.tracker),
    createLabwareHintAdapter(opts.searchLabwareByHint ?? (async () => [])),
    createRegistryAdapter({
      labwareDefinitionRegistry: {
        findByName: (name: string) => (opts.registries?.labware?.[name] ? { recordId: opts.registries.labware[name]! } : undefined),
      },
      compoundClassRegistry: {
        findByName: (name: string) => (opts.registries?.compound?.[name] ? { recordId: opts.registries.compound[name]! } : undefined),
      },
    }),
    createRoleAddressAdapter(),
  ];
  return {
    adapters,
    strategies: buildStrategyRegistry(),
    ...(opts.levelFor ? { levelFor: opts.levelFor } : {}),
  };
}

function request(over: Partial<ResolutionRequest> & { verb: string; argument: string; label: string; declared: ResolutionRequest['declared'] }): ResolutionRequest {
  const base = { actionIndex: 0, ...over };
  return {
    ...base,
    actionLocation: base.actionLocation ?? {
      actionIndex: base.actionIndex ?? 0,
      action: base.verb as never,
      argument: base.argument,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. noun-resolution.verb-constrained-domain
// PRIMARY LEG (production bridge): the SHIPPED vocabulary's own domain tags —
// transfer.labware declares domain: labware, read.instrument declares
// domain: instrument. ONE candidate pool (ambiguous label 'Gemini': a
// labware-kind term hit + an instrument-kind term hit, shaped exactly like
// production tier-0 hits from providers/terms.ts) → the domain filter itself
// rejects the labware-design candidate for the instrument arg and vice versa
// (asserted both directions, rejections named in traces). No fixture
// vocabulary edit is involved in this leg.
// SECOND LEG (ontology bridge axis): a fixture COPY flips domains to tags
// ONTOLOGY_DOMAINS declares (chemical/cellType) → the namespace axis bites.
// ---------------------------------------------------------------------------

describe('noun-resolution.verb-constrained-domain', () => {
  it('SHIPPED domain tags: same ambiguous label, transfer.labware (labware) vs read.instrument (instrument) => disjoint eligible sets from the domain filter', async () => {
    const vocab = shippedVocab();
    // The tags the shipped vocabulary ACTUALLY uses (grep: labware 74,
    // material 12, instrument 1 — no fixture flip involved).
    const labwareContract = vocab.argContracts('transfer').find((a) => a.name === 'labware')!;
    const instrumentContract = vocab.argContracts('read').find((a) => a.name === 'instrument')!;
    expect(labwareContract.domain).toBe('labware');
    expect(instrumentContract.domain).toBe('instrument');

    // ONE pool, ambiguous label 'Gemini': two tier-0 canonical-term hits
    // shaped exactly like production terms-provider hits (namespace 'local',
    // local:TERM-… curie, termKind = the term record's kind per
    // schema/core/term.schema.yaml). 'Gemini' names both a labware design and
    // an instrument in the lab's own vocabulary.
    const labwareDesign = { curie: 'local:TERM-Gemini-plate-a1b2', label: 'Gemini', namespace: 'local', level: 'unknown', termKind: 'labware' };
    const instrumentDesign = { curie: 'local:TERM-Gemini-reader-c3d4', label: 'Gemini', namespace: 'local', level: 'unknown', termKind: 'instrument' };
    const { spine, tracker } = spineWith(hits(labwareDesign, instrumentDesign), hits());
    const deps = depsFor({ spine, tracker, vocab });

    const asLabware = await resolveNoun(
      request({ verb: 'transfer', argument: 'labware', label: 'Gemini', declared: labwareContract }),
      vocab,
      deps,
    );
    const asInstrument = await resolveNoun(
      request({ verb: 'read', argument: 'instrument', label: 'Gemini', declared: instrumentContract }),
      vocab,
      deps,
    );

    const labwareCuries = asLabware.bindings.map((b) => b.curie);
    const instrumentCuries = asInstrument.bindings.map((b) => b.curie);
    // The labware-domain arg binds the labware-design term; the instrument-
    // design candidate is REJECTED by the domain filter and NAMED in a trace.
    expect(labwareCuries).toEqual(['local:TERM-Gemini-plate-a1b2']);
    expect(labwareCuries).not.toContain('local:TERM-Gemini-reader-c3d4');
    expect(asLabware.traces.some((t) => t.startsWith('domain-mismatch: local:TERM-Gemini-reader-c3d4') && t.includes('declared domain labware'))).toBe(true);
    // And the reverse: instrument-domain arg binds the instrument design,
    // labware design rejected + named.
    expect(instrumentCuries).toEqual(['local:TERM-Gemini-reader-c3d4']);
    expect(instrumentCuries).not.toContain('local:TERM-Gemini-plate-a1b2');
    expect(asInstrument.traces.some((t) => t.startsWith('domain-mismatch: local:TERM-Gemini-plate-a1b2') && t.includes('instrument'))).toBe(true);
    // disjoint both directions
    expect(labwareCuries.filter((c) => instrumentCuries.includes(c))).toEqual([]);
    expect(instrumentCuries.filter((c) => labwareCuries.includes(c))).toEqual([]);
  });

  it('ontology bridge axis (fixture copy flips to ONTOLOGY_DOMAINS tags): same ambiguous label + different declared argument domains => disjoint eligible sets', async () => {
    const vocab = fixtureVocab('vocab-domain-flip');
    // transfer.source is declared domain: chemical; transfer.labware domain: cellType (fixture flip).
    const sourceContract = vocab.argContracts('transfer').find((a) => a.name === 'source')!;
    const labwareContract = vocab.argContracts('transfer').find((a) => a.name === 'labware')!;
    expect(sourceContract.domain).toBe('chemical');
    expect(labwareContract.domain).toBe('cellType');

    // ONE pool: 'Gemini' matches a ChEBI hit (tier 0) and a CL hit (tier 1).
    const { spine, tracker } = spineWith(
      hits({ curie: 'CHEBI:12345', label: 'Gemini', namespace: 'CHEBI', level: 'concept', termKind: 'material' }),
      hits({ curie: 'CL:9999', label: 'Gemini', namespace: 'CL', level: 'concept' }),
    );
    const deps = depsFor({ spine, tracker, vocab });

    const asSource = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'Gemini', declared: sourceContract }),
      vocab,
      deps,
    );
    const asLabware = await resolveNoun(
      request({ verb: 'transfer', argument: 'labware', label: 'Gemini', declared: labwareContract }),
      vocab,
      deps,
    );

    const sourceCuries = asSource.bindings.map((b) => b.curie);
    const labwareCuries = asLabware.bindings.map((b) => b.curie);
    expect(sourceCuries).toContain('CHEBI:12345');
    expect(sourceCuries).not.toContain('CL:9999');
    expect(labwareCuries).toContain('CL:9999');
    expect(labwareCuries).not.toContain('CHEBI:12345');
    // disjoint both directions
    expect(sourceCuries.filter((c) => labwareCuries.includes(c))).toEqual([]);
    expect(labwareCuries.filter((c) => sourceCuries.includes(c))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. noun-resolution.material-levels
// Pool contains a tier-0 CONCEPT hit + an aliquot record hit; a contract
// requiring aliquot => the concept candidate is ABSENT from eligible AND named
// in a level-mismatch trace line; a concept-only pool yields a clarification,
// never a bind.
// ---------------------------------------------------------------------------

describe('noun-resolution.material-levels', () => {
  it('a concept match cannot satisfy an aliquot requirement; concept-only pool clarifies', async () => {
    const vocab = shippedVocab();
    const materialContract = vocab.argContracts('wash').find((a) => a.name === 'material')!;

    const { spine, tracker } = spineWith(
      hits({ curie: 'local:term-ethanol', label: 'ethanol', namespace: 'local', level: 'concept', termKind: 'material' }),
      hits({ curie: 'local:ali-77', label: 'ethanol aliquot 77', namespace: 'local', level: 'aliquot' }),
    );
    const deps = depsFor({ spine, tracker, vocab });

    const outcome = await resolveNoun(
      request({ verb: 'wash', argument: 'material', label: 'ethanol', declared: materialContract, wantLevel: 'aliquot' }),
      vocab,
      deps,
    );

    // The aliquot record binds; the concept candidate is NOT eligible.
    expect(outcome.bindings.map((b) => b.curie)).toEqual(['local:ali-77']);
    expect(outcome.bindings.some((b) => b.curie === 'local:term-ethanol')).toBe(false);
    // ...and it is NAMED in a level-mismatch trace line.
    expect(outcome.traces.some((t) => t.includes('level-mismatch') && t.includes('local:term-ethanol'))).toBe(true);

    // Concept-only pool: clarification, never a bind.
    const conceptOnly = spineWith(
      hits({ curie: 'local:term-ethanol', label: 'ethanol', namespace: 'local', level: 'concept', termKind: 'material' }),
      hits(),
    );
    const deps2 = depsFor({ spine: conceptOnly.spine, tracker: conceptOnly.tracker, vocab });
    const outcome2 = await resolveNoun(
      request({ verb: 'wash', argument: 'material', label: 'ethanol', declared: materialContract, wantLevel: 'aliquot' }),
      vocab,
      deps2,
    );
    expect(outcome2.bindings).toEqual([]);
    expect(outcome2.clarifications).toHaveLength(1);
    expect(outcome2.clarifications[0]!.label).toBe('ethanol');
  });
});

// ---------------------------------------------------------------------------
// 3. noun-resolution.local-term-identity
// Alias spellings (the F-praus family) all bind to ONE curie across four
// requests; mintAffordance appears in ZERO bindings; the engine performs no
// writes (write spy never fires).
// ---------------------------------------------------------------------------

describe('noun-resolution.local-term-identity', () => {
  it('alias spellings land on one canonical entity; no duplicate term coined', async () => {
    const vocab = shippedVocab();
    // wash.material declares domain: material — the shipped tag this term's
    // kind actually lands in (fix1: the domain bridge is live, so the alias
    // family rides a material-domain argument, not a labware-domain one).
    const materialContract = vocab.argContracts('wash').find((a) => a.name === 'material')!;

    // Tier-0 alias-first provider (the F-praus fix shape from providers/terms.ts):
    // every spelling resolves to the SAME canonical term record → same CURIE.
    const spellings = ['F praus', 'FPRAUS', 'f pruas', 'f praaus'];
    const aliasHit: ProviderHit = {
      curie: 'local:term-fpraus',
      label: 'Faecalibacterium prausnitzii',
      namespace: 'local',
      level: 'concept',
      termKind: 'material',
    };
    const { spine, tracker } = spineWith(hits(aliasHit), hits());
    const deps = depsFor({ spine, tracker, vocab });

    const bindings = [];
    for (const label of spellings) {
      const outcome = await resolveNoun(
        request({ verb: 'wash', argument: 'material', label, declared: materialContract }),
        vocab,
        deps,
      );
      bindings.push(...outcome.bindings);
    }
    expect(bindings).toHaveLength(spellings.length);
    const curies = new Set(bindings.map((b) => b.curie));
    expect([...curies]).toEqual(['local:term-fpraus']); // ONE canonical entity

    // mint affordance in ZERO bindings (engine never binds a mint).
    for (const b of bindings) {
      expect(b).not.toHaveProperty('mint');
      expect(b.curie).not.toBe('');
    }

    // No-write proof: the engine has no write dep — a store spy that the engine
    // could reach would have to be injected; it is not part of EngineDeps at all.
    // Assert the dependency surface itself carries no write capability.
    const depKeys = Object.keys(deps).sort();
    expect(depKeys).toEqual(['adapters', 'strategies']);
    for (const adapter of deps.adapters) {
      expect(Object.keys(adapter).sort()).toEqual(['gather', 'id']);
    }
  });

  it('doc-level: four alias actions through resolveScientistIntentNouns bind one curie', async () => {
    const vocab = shippedVocab();
    const doc = parseScientistIntent(`
intentId: alias-identity
actions:
  - { action: wash, material: "F praus" }
  - { action: wash, material: "FPRAUS" }
  - { action: wash, material: "f pruas" }
  - { action: wash, material: "f praaus" }
`);
    const aliasHit: ProviderHit = {
      curie: 'local:term-fpraus',
      label: 'Faecalibacterium prausnitzii',
      namespace: 'local',
      level: 'concept',
      termKind: 'material',
    };
    const { spine, tracker } = spineWith(hits(aliasHit), hits());
    const deps = depsFor({ spine, tracker, vocab });
    const outcome = await resolveScientistIntentNouns(doc, vocab, deps);
    const sourceBindings = outcome.bindings.filter((b) => b.argument === 'material');
    expect(sourceBindings).toHaveLength(4);
    expect(new Set(sourceBindings.map((b) => b.curie))).toEqual(new Set(['local:term-fpraus']));
  });
});

// ---------------------------------------------------------------------------
// 4. noun-resolution.policy-is-data
// Fixture COPY of the shipped vocabulary with strategyOrder swapped and the
// ambiguity strategyRef flipped; engine outcome flips (bind<->clarify /
// bind-A<->bind-B) with ZERO .ts changes; the SHIPPED vocabulary outcome is
// unchanged in the same run.
// ---------------------------------------------------------------------------

describe('noun-resolution.policy-is-data', () => {
  // Pool: the hint lookup yields candidate A (single match); the spine yields
  // candidate B (single tier-0 hit). Shipped strategyOrder runs hint_search
  // first -> binds A. The fixture copy swaps symbolic_label ahead of
  // hint_search -> binds B. Same engine code, same pool, zero TS diff.
  function pool() {
    return spineWith(
      hits({ curie: 'local:plate-B', label: 'Gemini plate', namespace: 'local', level: 'unknown' }),
      hits(),
    );
  }
  const searchLabwareByHint = async (hint: string) =>
    hint === 'Gemini' ? [{ recordId: 'LBW-A', title: 'Gemini reader deck slot' }] : [];

  it('strategyOrder swap flips WHICH candidate binds — shipped outcome unchanged', async () => {
    const shipped = shippedVocab();
    const flipped = fixtureVocab('vocab-policy-flip');
    expect(shipped.policies().strategyOrder).toEqual(['explicit_wells', 'hint_search', 'symbolic_label', 'ontology_resolution', 'mint_local']);
    expect(flipped.policies().strategyOrder).toEqual(['explicit_wells', 'symbolic_label', 'hint_search', 'ontology_resolution', 'mint_local', 'accept_top_ranked']);

    const contract = shipped.argContracts('read').find((a) => a.name === 'labware')!;

    const s = pool();
    const shippedOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      shipped,
      depsFor({ spine: s.spine, tracker: s.tracker, searchLabwareByHint, vocab: shipped }),
    );
    const f = pool();
    const flippedOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      flipped,
      depsFor({ spine: f.spine, tracker: f.tracker, searchLabwareByHint, vocab: flipped }),
    );

    expect(shippedOutcome.bindings.map((b) => b.curie)).toEqual(['LBW-A']); // hint_search first
    expect(flippedOutcome.bindings.map((b) => b.curie)).toEqual(['local:plate-B']); // symbolic_label first
  });

  it('ambiguity strategyRef flip changes the AMBIGUOUS-pool arm (clarify -> accept top)', async () => {
    const shipped = shippedVocab();
    const flipped = fixtureVocab('vocab-policy-flip');
    expect(shipped.policies().ambiguity.strategyRef).toBe('symbolic_label');
    expect(flipped.policies().ambiguity.strategyRef).toBe('accept_top_ranked');

    // Ambiguous pool: TWO hint matches in the acceptance band, no spine hit.
    const twoMatches = async (hint: string) =>
      hint === 'Gemini'
        ? [
            { recordId: 'LBW-A', title: 'Gemini reader A' },
            { recordId: 'LBW-B', title: 'Gemini reader B' },
          ]
        : [];
    const contract = shipped.argContracts('read').find((a) => a.name === 'labware')!;

    const s = spineWith(hits(), hits());
    const shippedOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      shipped,
      depsFor({ spine: s.spine, tracker: s.tracker, searchLabwareByHint: twoMatches, vocab: shipped }),
    );
    expect(shippedOutcome.bindings).toEqual([]);
    expect(shippedOutcome.clarifications).toHaveLength(1);
    expect(shippedOutcome.clarifications[0]!.reason).toBe('ambiguous-noun');

    const f = spineWith(hits(), hits());
    const flippedOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      flipped,
      depsFor({ spine: f.spine, tracker: f.tracker, searchLabwareByHint: twoMatches, vocab: flipped }),
    );
    expect(flippedOutcome.clarifications).toEqual([]);
    expect(flippedOutcome.bindings.map((b) => b.curie)).toEqual(['LBW-A']);
  });
});

// ---------------------------------------------------------------------------
// 6. noun-resolution.ambiguity-and-failure
// (i) two candidates in band => ZERO bindings, ONE clarification, ordered
//     candidates, byte-equal across two runs, no `chosen` field anywhere;
// (ii) adapter whose inner lookup THROWS => failures[] names adapter+term and
//     the clarification reason is `resolution-lookup-failed`;
// (iii) contrast: provider returns [] => mint affordance offered.
// ---------------------------------------------------------------------------

describe('noun-resolution.ambiguity-and-failure', () => {
  it('(i) two in-band candidates => clarification, stable ordered candidates, no arbitrary winner', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    const twoMatches = async () => [
      { recordId: 'LBW-B', title: 'Gemini reader B' },
      { recordId: 'LBW-A', title: 'Gemini reader A' },
    ];

    const runOnce = async () => {
      const { spine, tracker } = spineWith(hits(), hits());
      return resolveNoun(
        request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
        vocab,
        depsFor({ spine, tracker, searchLabwareByHint: twoMatches, vocab }),
      );
    };

    const first = await runOnce();
    const second = await runOnce();

    expect(first.bindings).toEqual([]);
    expect(first.clarifications).toHaveLength(1);
    const clarification = first.clarifications[0]!;
    expect(clarification.reason).toBe('ambiguous-noun');
    expect(clarification.label).toBe('Gemini');
    // stable ordered candidate list: score DESC then curie ASC (LBW-A < LBW-B)
    const candidateLabels = (clarification.candidates ?? []).map((c) => c.label);
    expect(candidateLabels).toEqual(['Gemini reader A', 'Gemini reader B']);
    // byte-equal across runs (stable ordering)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    // no `chosen` field anywhere in the outcome
    expect(JSON.stringify(first)).not.toContain('chosen');
    expect(clarification).not.toHaveProperty('chosen');
    // actionLocation carried from the request
    expect(clarification.actionLocation).toMatchObject({ actionIndex: 0, action: 'read', argument: 'labware' });
  });

  it('(ii) adapter lookup THROWS => failures[] names adapter+term, reason resolution-lookup-failed', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;

    // (a) labware-hint lookup throws
    const boom = async () => {
      throw new Error('labware index offline');
    };
    const s = spineWith(hits(), hits());
    const hintOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine: s.spine, tracker: s.tracker, searchLabwareByHint: boom, vocab }),
    );
    expect(hintOutcome.failures).toHaveLength(1);
    expect(hintOutcome.failures[0]!.kind).toBe('lookup_error');
    expect(hintOutcome.failures[0]!.adapter).toBe('labware-hint');
    expect(hintOutcome.failures[0]!.term).toBe('Gemini');
    expect(hintOutcome.failures[0]!.message).toContain('labware index offline');
    expect(hintOutcome.clarifications).toHaveLength(1);
    expect(hintOutcome.clarifications[0]!.reason).toBe('resolution-lookup-failed');
    expect(hintOutcome.bindings).toEqual([]);

    // (b) spine provider throws (captured through the failure-tracking wrapper)
    const t = spineWith(throwing('term index down'), hits());
    const spineOutcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine: t.spine, tracker: t.tracker, vocab }),
    );
    expect(spineOutcome.failures.some((f) => f.adapter === 'spine' && f.term === 'Gemini')).toBe(true);
    expect(spineOutcome.clarifications[0]!.reason).toBe('resolution-lookup-failed');
  });

  it('(iii) contrast: empty pool => unknown-noun clarification WITH mint affordance offered (distinct from lookup failure)', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('read').find((a) => a.name === 'labware')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine, tracker, vocab }),
    );
    expect(outcome.failures).toEqual([]);
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    const clarification = outcome.clarifications[0]!;
    expect(clarification.reason).toBe('unknown-noun');
    // mint affordance offered as a candidate
    const mintCandidate = (clarification.candidates ?? []).find((c) => c.label.includes('Create local term'));
    expect(mintCandidate).toBeDefined();
    // DISTINCT from the lookup-failure arm: that one carries NO mint affordance
    const boom = async () => {
      throw new Error('offline');
    };
    const s2 = spineWith(hits(), hits());
    const failed = await resolveNoun(
      request({ verb: 'read', argument: 'labware', label: 'Gemini', declared: contract }),
      vocab,
      depsFor({ spine: s2.spine, tracker: s2.tracker, searchLabwareByHint: boom, vocab }),
    );
    expect((failed.clarifications[0]!.candidates ?? []).some((c) => c.label.includes('Create local term'))).toBe(false);
  });

  it('role-address arm: known role expands, unknown role clarifies (stricter than pipeline pass-through)', async () => {
    const vocab = shippedVocab();
    const wellsContract = vocab.argContracts('transfer').find((a) => a.name === 'sourceWells')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const deps = depsFor({ spine, tracker, vocab });

    const known = await resolveNoun(
      request({ verb: 'transfer', argument: 'sourceWells', label: 'control_well', declared: wellsContract }),
      vocab,
      deps,
    );
    expect(known.bindings).toHaveLength(1);
    expect(known.bindings[0]!.addresses).toEqual(['A12']);

    const unknown = await resolveNoun(
      request({ verb: 'transfer', argument: 'sourceWells', label: 'bogus_role', declared: wellsContract }),
      vocab,
      deps,
    );
    expect(unknown.bindings).toEqual([]);
    expect(unknown.clarifications[0]!.reason).toBe('unknown-address');
  });

  it('near-miss typos surface as suggestExistingTerms evidence in the clarification (never merged, never auto-linked)', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('transfer').find((a) => a.name === 'source')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const deps = depsFor({ spine, tracker, vocab });
    deps.termsForSuggestions = async () => [
      { id: 'term-fpraus', preferredLabel: 'Faecalibacterium prausnitzii', aliases: ['F praus'] },
    ];

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'f pruas', declared: contract }),
      vocab,
      deps,
    );
    expect(outcome.bindings).toEqual([]);
    const clarification = outcome.clarifications[0]!;
    expect(clarification.reason).toBe('unknown-noun');
    // the near-miss suggestion rides the clarification candidate list as evidence
    const suggestion = (clarification.candidates ?? []).find((c) => c.label === 'Faecalibacterium prausnitzii');
    expect(suggestion).toBeDefined();
    // and the mint affordance is still offered alongside it
    expect((clarification.candidates ?? []).some((c) => c.label.includes('Create local term'))).toBe(true);
  });

  it('expected*Domain slots are EVALUATED: doc expectedSourceDomain vs declared domain disagreement is traced', async () => {
    const vocab = shippedVocab();
    // shipped transfer.source declares domain: labware; the doc claims cellType.
    const doc = parseScientistIntent(`
intentId: domain-slot
actions:
  - { action: transfer, source: Gemini, expectedSourceDomain: cellType }
`);
    const { spine, tracker } = spineWith(
      hits({ curie: 'CL:9999', label: 'Gemini', namespace: 'CL', level: 'unknown' }),
      hits(),
    );
    const outcome = await resolveScientistIntentNouns(doc, vocab, depsFor({ spine, tracker, vocab }));
    expect(outcome.traces.some((t) => t.startsWith('domain-expectation: declared labware vs doc expected cellType for transfer.source'))).toBe(true);
  });

  it('N3 quirk consumed + pinned: whitespace-only actionLocation.argument is dropped at parse; clarification still carries actionIndex+action', async () => {
    // Pinned characterization of parseScientistIntent.ts:130 (SPINE-1 NOTE N3):
    // a whitespace-only `argument` passes schema minLength but is DROPPED.
    const doc = parseScientistIntent(`
intentId: n3-pin
unresolved:
  - label: mystery
    reason: model could not name it
    actionLocation: { actionIndex: 0, action: transfer, argument: "   " }
actions:
  - { action: transfer, source: mystery, target: plate_A }
`);
    const loc = doc.unresolved[0]!.actionLocation!;
    expect(loc).toMatchObject({ actionIndex: 0, action: 'transfer' });
    expect(loc).not.toHaveProperty('argument'); // the drop, pinned

    // Engine consumption rule: a missing/blank argument location still bites —
    // the clarification carries actionIndex+action, argument omitted.
    const vocab = shippedVocab();
    const contract = vocab.argContracts('transfer').find((a) => a.name === 'source')!;
    const { spine, tracker } = spineWith(hits(), hits());
    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'mystery', declared: contract, actionLocation: { actionIndex: 0, action: 'transfer' } }),
      vocab,
      depsFor({ spine, tracker, vocab }),
    );
    const clarification = outcome.clarifications[0]!;
    expect(clarification.actionLocation).toMatchObject({ actionIndex: 0, action: 'transfer' });
    expect(clarification.actionLocation).not.toHaveProperty('argument');
  });

  it('input-integrity: actionLocation.action disagreeing with actions[actionIndex].action => clarification, not a bind', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('transfer').find((a) => a.name === 'source')!;
    const { spine, tracker } = spineWith(
      hits({ curie: 'local:term-x', label: 'mystery thing', namespace: 'local', level: 'unknown' }),
      hits(),
    );
    const outcome = await resolveNoun(
      request({
        verb: 'transfer',
        argument: 'source',
        label: 'mystery thing',
        declared: contract,
        actionLocation: { actionIndex: 0, action: 'wash', argument: 'source' }, // disagrees with verb
      }),
      vocab,
      depsFor({ spine, tracker, vocab }),
    );
    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications[0]!.reason).toBe('action-location-unreliable');
  });
});

// ---------------------------------------------------------------------------
// MINT-FLOOR-UI-1 — the mint floor is offered EXACTLY ONCE per noun on the
// wire. The two spine-gathering strategies (symbolic_label +
// ontology_resolution, strategies.ts:101-106/:111-116) each append the spine's
// per-call mint (ResolveSpine.ts:218), and the engine's per-strategy
// dedupeByCurie (:43-51) explicitly skips no-curie mint candidates — so N
// identical mint copies accumulate into the unknown-noun clarification. The
// blessed goldens bake the duplication in (2 identical mint candidates each).
// RED at baseline: the mint-shaped candidates number 2. Post-fix: exactly 1,
// survivor byte-unchanged, near-miss evidence leg untouched.
// ---------------------------------------------------------------------------

describe('noun-resolution.mint-floor-dedup (MINT-FLOOR-UI-1)', () => {
  it('the unknown-noun clarification offers the tier-5 mint affordance EXACTLY once per noun; survivor unchanged; near-miss evidence untouched', async () => {
    const vocab = shippedVocab();
    const contract = vocab.argContracts('transfer').find((a) => a.name === 'source')!;
    // REAL spine, fake providers: nothing matches 'mystery flask' => the
    // unknown-noun arm offers the mint. The label PASSES the nounShape bar
    // (the same shape the blessed unknown-local-term golden replays).
    const { spine, tracker } = spineWith(hits(), hits());
    const deps = depsFor({ spine, tracker, vocab });
    deps.termsForSuggestions = async () => [
      { id: 'term-mystery-flask-plus', preferredLabel: 'mystery flask+', aliases: [] },
    ];

    const outcome = await resolveNoun(
      request({ verb: 'transfer', argument: 'source', label: 'mystery flask', declared: contract }),
      vocab,
      deps,
    );

    expect(outcome.bindings).toEqual([]);
    expect(outcome.clarifications).toHaveLength(1);
    const clarification = outcome.clarifications[0]!;
    expect(clarification.reason).toBe('unknown-noun');

    const candidates = clarification.candidates ?? [];
    const mints = candidates.filter((c) => c.label.startsWith('Create local term'));
    // AC1: EXACTLY ONE mint-shaped candidate (RED at baseline: 2 — the
    // symbolic_label spine call and the ontology_resolution spine call each
    // contribute an identical copy).
    expect(mints).toHaveLength(1);
    // The survivor is byte-unchanged: same label shape, same 0.05 confidence.
    expect(mints[0]).toEqual({ label: 'Create local term “mystery flask”', confidence: 0.05 });

    // The dedup collapses ONLY identical tier-5 mint copies: the near-miss
    // suggestions leg rides the clarification untouched.
    const suggestion = candidates.find((c) => c.label === 'mystery flask+');
    expect(suggestion).toBeDefined();
    expect(suggestion!.confidence).toBe(0.9);
    expect(candidates.filter((c) => !c.label.startsWith('Create local term'))).toHaveLength(1);
  });
});
