/**
 * SPINE-7-ROLES-SEAM — unit legs (RED-first).
 *
 * Leg 1 (wire + engine): a schema-valid document carrying a SCALAR wells label
 * parses, the parse layer normalizes it into the engine's EXISTING scalar arm,
 * and the real resolve_nouns pass exposes the engine binding (addresses +
 * recordId) keyed by LABEL in resolvedByLabel.
 * Leg 2 producer half: normalizeScientistIntent (scientist-intent chain only)
 * carries the well label into the candidate event as `role` (the key
 * resolve_roles reads at ChatbotCompilePasses.ts :2390/:2410) and does NOT map
 * the scalar into the expander's array wells params.
 * Leg 3 (vocabulary data): the shipped vocabulary declares a required address
 * (kind: wells) argument so the MISSING_REQUIRED_ARGUMENT_REASON sweep is
 * route-reachable.
 *
 * No vi.mock anywhere: parse, vocabulary, engine, spine run REAL.
 */
import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent, UNREALIZED_WELL_LABEL_REASON } from './normalizeScientistIntent.js';
import { compileScientistIntent } from './compileScientistIntent.js';
import { defaultScientistIntentVocabulary, loadScientistIntentVocabulary } from './vocabulary.js';
import { createResolveNounsPass, MISSING_REQUIRED_ARGUMENT_REASON } from '../resolution/resolveNounsPass.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import { getExpander } from '../biology/BiologyVerbExpander.js';
import { recordingStore } from './goldens/replayKernel.js';

const SCALAR_DOC = `
intentId: spine7-scalar-wells
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    targetWells: control_well
`;

function storeBackedPass(intent: ReturnType<typeof parseScientistIntent>) {
  const recorder = recordingStore([
    { recordId: 'LAB-source-plate', payload: { kind: 'labware', title: 'Source Plate', synonyms: ['source plate'] } },
    { recordId: 'LAB-dest-plate', payload: { kind: 'labware', title: 'Destination Plate', synonyms: ['destination plate'] } },
  ]);
  const spine = createResolveSpineFromContext({ store: recorder.store as never });
  const pass = createResolveNounsPass({
    intent,
    vocabulary: defaultScientistIntentVocabulary(),
    spine,
  });
  return { pass, recorder };
}

describe('SPINE-7 leg 1 — scalar wells label on the wire reaches the engine scalar arm', () => {
  it('parse: a schema-valid scalar targetWells survives normalization as the trimmed string', () => {
    const intent = parseScientistIntent(SCALAR_DOC);
    const action = intent.actions[0]!;
    // The parse layer must hand the ENGINE the scalar (the doc-level door at
    // resolutionEngine.ts :243-244 skips anything that is not a string).
    expect(action.targetWells).toBe('control_well');
  });

  it('engine: the real resolve_nouns pass binds the scalar label and the slot exposes addresses + recordId keyed by LABEL', async () => {
    const intent = parseScientistIntent(SCALAR_DOC);
    const { pass } = storeBackedPass(intent);
    const res = await pass.run({
      pass_id: 'resolve_nouns',
      state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] } as never,
    });
    const out = res.output as { resolvedByLabel: Record<string, Record<string, unknown>>; blocked: boolean };
    expect(out.blocked).toBe(false);
    const entry = out.resolvedByLabel['control_well'];
    expect(entry).toBeDefined();
    expect(entry!['argument']).toBe('targetWells');
    expect(entry!['addresses']).toEqual(['A12']);
    expect(entry!['recordId']).toBe('well:A12');
  });
});

describe('SPINE-7 leg 2 producer — role-carrying lowering on the scientist-intent chain', () => {
  it('normalizeScientistIntent carries the scalar wells label as candidate `wellRole` and does not map it into array wells params', () => {
    const intent = parseScientistIntent(SCALAR_DOC);
    const normalized = normalizeScientistIntent(intent);
    const candidate = normalized.candidateEvents[0]!;
    expect(candidate['verb']).toBe('transfer');
    // details.role == engine-bound label == resolvedByLabel key (the KEYING CONTRACT).
    expect(candidate['wellRole']).toBe('control_well');
    // The scalar must NOT masquerade as an address array for the expander.
    expect(candidate['wells']).toBeUndefined();
    expect(candidate['target_wells']).toBeUndefined();
    expect(Object.keys(candidate)).not.toContain('role');
  });

  it('array form is unchanged: wells params carried, NO role key (chatbot-chain shape)', () => {
    const intent = parseScientistIntent(`
intentId: spine7-array-form
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    targetWells: [A1, B2]
`);
    const candidate = normalizeScientistIntent(intent).candidateEvents[0]!;
    expect(candidate['wells']).toEqual(['A1', 'B2']);
    expect(Object.keys(candidate)).not.toContain('role');
  });
});

describe('SPINE-7 leg 3 — shipped vocabulary declares a required address arg', () => {
  it('aliquot.targetWells is declared required: true (data), making the sweep route-reachable', () => {
    const vocab = defaultScientistIntentVocabulary();
    const contract = vocab.argContracts('aliquot').find((a) => a.name === 'targetWells');
    expect(contract).toBeDefined();
    expect(contract!.kind).toBe('wells');
    expect(contract!.required).toBe(true);
  });

  it('requiredArgumentClarifications fires for an aliquot missing targetWells (stable reason + actionLocation)', () => {
    const intent = parseScientistIntent(`
intentId: spine7-missing-address
actions:
  - action: aliquot
    source: source plate
    target: destination plate
    volumeUl: 10
`);
    const { pass } = storeBackedPass(intent);
    // The sweep runs inside the real pass; run it and read the bar diagnostic.
    return pass.run({
      pass_id: 'resolve_nouns',
      state: { input: {}, context: {}, meta: {}, outputs: new Map(), diagnostics: [] } as never,
    }).then((res) => {
      expect(res.ok).toBe(false);
      const clarifications = (res.output as { clarifications: Array<Record<string, unknown>> }).clarifications;
      const item = clarifications.find((c) => c['reason'] === MISSING_REQUIRED_ARGUMENT_REASON);
      expect(item).toBeDefined();
      expect(item!['label']).toBe('targetWells');
      expect(item!['actionLocation']).toEqual({ actionIndex: 0, action: 'aliquot', argument: 'targetWells' });
    });
  });
});

// ===========================================================================
// FIX RUN 1 (adversarial l2t1050) — D1/D2/D4 legs.
// ===========================================================================

describe('SPINE-7 fix1/D1 — scalar sourceWells is never silently dropped', () => {
  it('scalar sourceWells: NO silent drop — the producer emits the structured unrealized-well-label clarification (engine binds it, zero clarification, yet no consumer exists)', () => {
    const intent = parseScientistIntent(`
intentId: spine7f1-scalar-source
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    sourceWells: control_well
`);
    const normalized = normalizeScientistIntent(intent);
    const candidate = normalized.candidateEvents[0]!;
    // The value is NOT silently dropped into a raw candidate key either: a
    // label is not an address array, so no source_wells key rides.
    expect(Object.keys(candidate)).not.toContain('source_wells');
    expect(Object.keys(candidate)).not.toContain('wellRole');
    // Instead the producer surfaces it: structured clarification with the
    // stable reason code and a filled actionLocation (SPINE-1 shape).
    expect(normalized.clarifications).toBeDefined();
    expect(normalized.clarifications).toEqual([
      {
        label: 'control_well',
        reason: UNREALIZED_WELL_LABEL_REASON,
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'sourceWells' },
      },
    ]);
  });

  it('array sourceWells form stays byte-identical: source_wells carried verbatim, NO clarification key', () => {
    const intent = parseScientistIntent(`
intentId: spine7f1-array-source
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    sourceWells: [A1, B2]
    targetWells: [C1]
`);
    const normalized = normalizeScientistIntent(intent);
    const candidate = normalized.candidateEvents[0]!;
    expect(candidate['source_wells']).toEqual(['A1', 'B2']);
    expect(candidate['wells']).toEqual(['C1']);
    expect(Object.keys(candidate)).not.toContain('wellRole');
    // Key absence (exactOptionalPropertyTypes discipline): no clarifications
    // key at all when nothing is unrealized.
    expect(Object.keys(normalized)).not.toContain('clarifications');
  });

  it('route arm: the unrealized label bars atomically on the 422 needs-clarification arm (engine bound it cleanly — the producer bar alone), NEVER 500', async () => {
    const intent = parseScientistIntent(`
intentId: spine7f1-route-bar
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    sourceWells: control_well
`);
    const recorder = recordingStore([
      { recordId: 'LAB-source-plate', payload: { kind: 'labware', title: 'Source Plate', synonyms: ['source plate'] } },
      { recordId: 'LAB-dest-plate', payload: { kind: 'labware', title: 'Destination Plate', synonyms: ['destination plate'] } },
    ]);
    const spine = createResolveSpineFromContext({ store: recorder.store as never });
    const result = await compileScientistIntent(intent, { spine });
    // 422 arm semantics at the compile layer: needs-clarification with the
    // structured clarification verbatim and ZERO artifacts (atomic bar).
    expect(result.outcome).toBe('needs-clarification');
    expect(result.clarifications).toEqual([
      {
        label: 'control_well',
        reason: UNREALIZED_WELL_LABEL_REASON,
        actionLocation: { actionIndex: 0, action: 'transfer', argument: 'sourceWells' },
      },
    ]);
    expect(result.terminalArtifacts.events).toEqual([]);
    expect(result.terminalArtifacts.gaps).toEqual([]);
    expect(Object.keys(result.terminalArtifacts)).not.toContain('labwareAdditions');
    expect(Object.keys(result.terminalArtifacts)).not.toContain('deckLayoutPlan');
    expect(Object.keys(result.terminalArtifacts)).not.toContain('instrumentRunFiles');
    // The engine itself bound the label (no engine clarification): the bar is
    // the producer's, proving the drop path is closed on the route.
    expect(result.clarifications.some((c) => c.reason !== UNREALIZED_WELL_LABEL_REASON)).toBe(false);
  });
});

describe('SPINE-7 fix1/D2 — aliquotExpander consumes BOTH wells carriers', () => {
  it('array carrier (scientist-intent `wells`): bound addresses REPLACE the well-0 placeholder pair; n_targets defaults to carrier length', () => {
    const expander = getExpander('aliquot')!;
    const events = expander.expand({
      verb: 'aliquot',
      params: {
        source_labware: 'source-plate',
        target_labware: 'target-plate',
        volume_per_well: { value: 50, unit: 'uL' },
        wells: ['A1', 'B1', 'C1'],
      },
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.details['source_well'])).toEqual(['A1', 'B1', 'C1']);
    expect(events.map((e) => e.details['destination_well'])).toEqual(['A1', 'B1', 'C1']);
    expect(events.some((e => Object.values(e.details).some((v) => typeof v === 'string' && v.startsWith('well-'))))).toBe(false);
  });

  it('array carrier (shipped `target_wells` shape) unchanged: consumed as before, placeholder only when NO carrier exists', () => {
    const expander = getExpander('aliquot')!;
    const events = expander.expand({
      verb: 'aliquot',
      params: {
        source_labware: 'source-plate',
        target_labware: 'target-plate',
        volume_per_well: { value: 50, unit: 'uL' },
        n_targets: 3,
        target_wells: ['A1', 'B1', 'C1'],
      },
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => e.details['source_well'])).toEqual(['A1', 'B1', 'C1']);
    // No-carrier leg: the shipped default-1 placeholder behavior is pinned.
    const placeholder = expander.expand({
      verb: 'aliquot',
      params: { source_labware: 'source', target_labware: 'target' },
    });
    expect(placeholder).toHaveLength(1);
    expect(placeholder[0]!.details['source_well']).toBe('well-0');
  });

  it('scalar carrier (wellRole): lowers ONE role-carrying transfer event (details.role == engine-bound label) — NO placeholder wells ride', () => {
    const expander = getExpander('aliquot')!;
    const events = expander.expand({
      verb: 'aliquot',
      params: {
        source_labware: 'source-plate',
        target_labware: 'target-plate',
        volume_per_well: { value: 50, unit: 'uL' },
        wellRole: 'control_well',
      },
    });
    expect(events).toHaveLength(1);
    const details = events[0]!.details as Record<string, unknown>;
    expect(details['role']).toBe('control_well');
    expect(Object.keys(details)).not.toContain('source_well');
    expect(Object.keys(details)).not.toContain('destination_well');
  });

  it('route: an aliquot with a SCALAR targetWells compiles complete and the emitted event carries the engine-bound address (placeholder well-0 pair replaced); missing targetWells still bars (422 sweep)', async () => {
    const intent = parseScientistIntent(`
intentId: spine7f2-aliquot-scalar
actions:
  - action: aliquot
    source: source plate
    target: destination plate
    volumeUl: 50
    targetWells: control_well
`);
    const recorder = recordingStore([
      { recordId: 'LAB-source-plate', payload: { kind: 'labware', title: 'Source Plate', synonyms: ['source plate'] } },
      { recordId: 'LAB-dest-plate', payload: { kind: 'labware', title: 'Destination Plate', synonyms: ['destination plate'] } },
    ]);
    const spine = createResolveSpineFromContext({ store: recorder.store as never });
    const result = await compileScientistIntent(intent, { spine });
    expect(result.outcome).toBe('complete');
    const events = result.terminalArtifacts.events as unknown as Array<Record<string, unknown>>;
    expect(events).toHaveLength(1);
    const details = events[0]!['details'] as Record<string, unknown>;
    // The engine binding (role-address arm for control_well) reached the
    // compiled event through details.role -> resolve_roles authoritative arm.
    expect(details['well']).toBe('A12');
    expect(Object.keys(details)).not.toContain('source_well');
    expect(Object.keys(details)).not.toContain('destination_well');
    expect(JSON.stringify(details)).not.toContain('well-0');

    // Missing required targetWells still bars on the sweep (422 arm).
    const missing = parseScientistIntent(`
intentId: spine7f2-aliquot-missing
actions:
  - action: aliquot
    source: source plate
    target: destination plate
    volumeUl: 50
`);
    const missingResult = await compileScientistIntent(missing, { spine });
    expect(missingResult.outcome).toBe('needs-clarification');
    expect(missingResult.clarifications.some((c) => c.reason === MISSING_REQUIRED_ARGUMENT_REASON)).toBe(true);
  });
});

describe('SPINE-7 fix1/D4 — the producer reads the INJECTED vocabulary instance', () => {
  it('a fixture vocabulary that reclassifies transfer.targetWells as resolvable (not wells) flips the producer classification: the scalar rides as a raw `wells` value, NO wellRole', () => {
    const fixtureVocab = loadScientistIntentVocabulary({
      path: join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures', 'vocab-wells-flip', 'scientist-intent-vocabulary.yaml'),
    });
    // Precondition: the fixture really differs from the shipped singleton.
    const shipped = defaultScientistIntentVocabulary().argContracts('transfer').find((a) => a.name === 'targetWells')!;
    const flipped = fixtureVocab.argContracts('transfer').find((a) => a.name === 'targetWells')!;
    expect(shipped.kind).toBe('wells');
    expect(flipped.kind).toBe('resolvable');

    const intent = parseScientistIntent(`
intentId: spine7f4-vocab-inject
actions:
  - action: transfer
    source: source plate
    target: destination plate
    volumeUl: 50
    targetWells: control_well
`);
    const normalized = normalizeScientistIntent(intent, { vocabulary: fixtureVocab });
    const candidate = normalized.candidateEvents[0]!;
    // Under the injected contract the scalar is NOT a wells label: it passes
    // through as the raw value on the `wells` key and no wellRole is written.
    expect(candidate['wells']).toBe('control_well');
    expect(Object.keys(candidate)).not.toContain('wellRole');
    // And with the shipped singleton the same document DOES produce wellRole
    // (the flip is the mutation proof, not an accident of the document).
    const shippedRun = normalizeScientistIntent(intent);
    expect(shippedRun.candidateEvents[0]!['wellRole']).toBe('control_well');
    expect(Object.keys(shippedRun.candidateEvents[0]!)).not.toContain('wells');
  });
});
