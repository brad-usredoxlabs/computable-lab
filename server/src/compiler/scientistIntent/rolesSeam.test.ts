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
import { parseScientistIntent } from './parseScientistIntent.js';
import { normalizeScientistIntent } from './normalizeScientistIntent.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { createResolveNounsPass, MISSING_REQUIRED_ARGUMENT_REASON } from '../resolution/resolveNounsPass.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
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
