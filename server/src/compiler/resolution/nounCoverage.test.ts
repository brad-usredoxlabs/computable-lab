/**
 * L2-CLARIFY-CARD-1 A2 — the slot-coverage gate (RED-first).
 *
 * The W12 silent-stage class: a PRESENT resolvable slot the engine silently
 * skipped (non-string value, resolutionEngine.ts:505-509; or a `many`-contract
 * entry whose noun is absent/blank) was never resolved, never asked about, and
 * still compiled to `complete` with the event carrying a bare label. A2 turns
 * every such drop into the SAME atomic bar (needs-clarification + zero events)
 * at the compiler-consumption point — deterministic, data-driven (declared
 * contracts + the pass's own output), zero verb/argument NAME literals.
 *
 * Harness idiom: cueResolutionGate.test.ts (parse -> compile over a
 * store-backed spine; fixture labels live ONLY in tests).
 */
import { describe, expect, it, vi } from 'vitest';
import { parseScientistIntent } from '../scientistIntent/parseScientistIntent.js';
import { compileScientistIntent } from '../scientistIntent/compileScientistIntent.js';
import { defaultScientistIntentVocabulary } from '../scientistIntent/vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/index.js';
import {
  unboundDeclaredSlots,
  unboundSlotValuePresent,
  UNBOUND_SLOT_REASON,
} from './nounCoverage.js';
import type { ScientistIntent } from '../scientistIntent/types.js';
import type { ResolveNounsOutput } from './resolveNounsPass.js';

const VOCAB = defaultScientistIntentVocabulary();

/** A hand-constructed parsed intent (bait 4's class: the reviewer builds the
 *  document directly — Ajv rejects non-strings on the YAML path, so the gate's
 *  counterexamples are pure-predicate inputs by construction). */
function intentOf(action: Record<string, unknown>): ScientistIntent {
  return {
    kind: 'scientist-intent',
    version: '0.1.0',
    intentId: 'a2-pure',
    actions: [{ action: 'add_material', ...action } as unknown as ScientistIntent['actions'][number]],
    unresolved: [],
  };
}

function outputOf(bindings: ResolveNounsOutput['bindings']): ResolveNounsOutput {
  return { bindings, resolvedByLabel: {}, clarifications: [], failures: [], blocked: false };
}

describe('a2.nounCoverage.pure (the slot-coverage predicate)', () => {
  it('a declared material slot whose value is a non-string object is UNBOUND (the bait-4 counterexample)', () => {
    const intent = intentOf({ material: { note: 'DMEM-like' }, volumeUl: 10 });
    const left = unboundDeclaredSlots(intent, VOCAB, outputOf([]));
    expect(left.map((s) => ({ ai: s.actionIndex, arg: s.argument }))).toEqual([
      { ai: 0, arg: 'material' },
    ]);
    // The synthesized label is the raw slot value (stringified), never a guess.
    expect(left[0]!.value).toBe(JSON.stringify({ note: 'DMEM-like' }));
  });

  it('a bound slot (same actionIndex+argument identity) returns nothing', () => {
    const intent = intentOf({ material: 'DMEM', volumeUl: 10 });
    const left = unboundDeclaredSlots(intent, VOCAB, outputOf([
      {
        verb: 'add_material',
        argument: 'material',
        label: 'DMEM',
        curie: 'local:MAT-dmem-1',
        confidence: 0.9,
        actionIndex: 0,
      },
    ]));
    expect(left).toEqual([]);
  });

  it('a present string slot with NO binding and NO output (bait 6: undefined = no proof of binding) is UNBOUND', () => {
    const intent = intentOf({ material: 'DMEM', volumeUl: 10 });
    const left = unboundDeclaredSlots(intent, VOCAB, undefined);
    expect(left.map((s) => s.argument)).toEqual(['material']);
  });

  it('declared ABSENCE is not present: the not-stated sentinel, blank string, empty array, and a missing slot are all covered', () => {
    for (const value of ['not-stated', '   ', [], undefined]) {
      const left = unboundDeclaredSlots(intentOf({ material: value, volumeUl: 10 }), VOCAB, outputOf([]));
      expect(left, `value=${JSON.stringify(value)} must not require a binding`).toEqual([]);
    }
  });

  it('wells slots NEVER require a resolve_nouns binding (empirically proven: the engine emits zero wells bindings — they are the resolve_wellsets pass\'s job)', () => {
    const intent = intentOf({ material: 'DMEM', volumeUl: 10, targetWells: ['A1', 'A2'] });
    const left = unboundDeclaredSlots(intent, VOCAB, outputOf([
      {
        verb: 'add_material',
        argument: 'material',
        label: 'DMEM',
        curie: 'local:MAT-dmem-1',
        confidence: 0.9,
        actionIndex: 0,
      },
    ]));
    expect(left).toEqual([]);
  });

  it('the value-present test: string non-blank / non-sentinel, non-empty array, finite number, and non-string object are PRESENT; undefined/null/blank/empty/NaN are not', () => {
    expect(unboundSlotValuePresent('DMEM')).toBe(true);
    expect(unboundSlotValuePresent('not-stated')).toBe(false);
    expect(unboundSlotValuePresent('   ')).toBe(false);
    expect(unboundSlotValuePresent(['A1'])).toBe(true);
    expect(unboundSlotValuePresent([])).toBe(false);
    expect(unboundSlotValuePresent(100)).toBe(true);
    expect(unboundSlotValuePresent(NaN)).toBe(false);
    expect(unboundSlotValuePresent({ x: 1 })).toBe(true);
    expect(unboundSlotValuePresent(undefined)).toBe(false);
    expect(unboundSlotValuePresent(null)).toBe(false);
  });
});

describe('a2.compile (the atomic arm at the compiler-consumption point)', () => {
  const emptyStore = () => ({
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async () => []),
  });

  async function compile(yaml: string) {
    const store = emptyStore();
    return compileScientistIntent(parseScientistIntent(yaml), {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
    });
  }

  it('A1 atomicity pin: a document whose resolvable slot the engine CANNOT bind compiles needs-clarification with ZERO events and a slot-identified fact', async () => {
    // Unseeded material: the engine clarifies (blocked), the bar arm fires.
    // The pin is the CONTRACT shorthandResultFromCompile relies on:
    // outcome + events:[] + the actionLocation identity.
    const compiled = await compile(`intentId: a2-a1
actions:
  - action: add_material
    material: "Zzno-such-reagent"
    volumeUl: 10
    targetWells: [A1]
`);
    expect(compiled.outcome).toBe('needs-clarification');
    expect(compiled.terminalArtifacts.events).toEqual([]);
    const fact = compiled.clarifications.find((c) => c.reason === 'unknown-noun');
    expect(fact).toBeDefined();
    expect(fact!.actionLocation).toMatchObject({
      actionIndex: 0,
      action: 'add_material',
      argument: 'material',
    });
  });

  it('A2 arm end-to-end: a CONSTRUCTED document whose resolvable slot the engine silently skips (non-string value — the bait-4 counterexample) rides A2 to the SAME atomic bar (needs-clarification, ZERO events, one fact with the engine\'s OWN reason code + the contract\'s actionLocation) — never a staged proposal', async () => {
    // The W12 silent-stage shape: a document whose `material` slot is PRESENT
    // (an object) yet the engine's doc-door silently skips it
    // (resolutionEngine.ts:505-509 — non-string values of a non-many arg stay
    // invisible). Today that document compiles past the engine unproved. A2,
    // at the compiler-consumption point, converts the drop into the bar.
    // Constructed directly (Ajv rejects non-strings on the YAML path — the
    // reviewer bait-4 constructs the parsed intent; the gate is the backstop
    // at the consumption seam, pure predicate over the parsed doc).
    const store = emptyStore();
    const doc: ScientistIntent = {
      kind: 'scientist-intent',
      version: '0.1.0',
      intentId: 'a2-arm-e2e',
      actions: [{
        action: 'add_material',
        material: { note: 'DMEM-like' },
        volumeUl: 10,
        targetWells: ['A1'],
      } as unknown as ScientistIntent['actions'][number]],
      unresolved: [],
    };
    const compiled = await compileScientistIntent(doc, {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
    });
    expect(compiled.outcome).toBe('needs-clarification');
    // Atomic: the staged proposal with the bare label NEVER ships.
    expect(compiled.terminalArtifacts.events).toEqual([]);
    const fact = compiled.clarifications.find((c) => c.actionLocation?.argument === 'material');
    expect(fact).toBeDefined();
    expect(fact!.reason).toBe(UNBOUND_SLOT_REASON);
    expect(fact!.label).toBe(JSON.stringify({ note: 'DMEM-like' }));
    expect(fact!.actionLocation).toMatchObject({
      actionIndex: 0,
      action: 'add_material',
      argument: 'material',
    });
  });

  it('INERT on the green shipped path: a fully bound document compiles complete with events (A2 adds no card)', async () => {
    const store = {
      get: vi.fn(async () => null),
      getRecord: vi.fn(async (id: string) =>
        id === 'MAT-dmem-1'
          ? {
              recordId: 'MAT-dmem-1',
              schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
              payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: [] },
            }
          : null,
      ),
      list: vi.fn(async () => [
        {
          recordId: 'MAT-dmem-1',
          schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
          payload: { kind: 'material', name: 'DMEM', title: 'DMEM', synonyms: [] },
        },
      ]),
    };
    const compiled = await compileScientistIntent(
      parseScientistIntent(`intentId: a2-inert
actions:
  - action: add_material
    material: "DMEM"
    volumeUl: 10
    targetWells: [A1]
`),
      { spine: createResolveSpineFromContext({ store: store as never }) as never },
    );
    expect(compiled.outcome).toBe('complete');
    expect(compiled.terminalArtifacts.events.length).toBeGreaterThan(0);
    expect(compiled.clarifications).toEqual([]);
  });
});
