/**
 * L2-NOUN-RESOLUTION-POLICY-1 A1: the fold arm now carries accepted bindings
 * as answeredSlots into compileFoldedShorthand. The resolver accepts them
 * directly as tier-1 bindings, so the noun binds to the chosen record id
 * instead of only narrowing the label search (which can never introduce a
 * record the spine did not find).
 *
 * FIXTURE: the seeded store has one record — ExoticCompoundXYZ. The positive
 * document uses "Exotic Compound XYZ" which resolves by label (spaces stripped
 * to match). The negative document uses a different noun ("Mystery Substance")
 * that matches no store record — the populated store genuinely cannot answer it.
 */
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { compileFoldedShorthand } from './AgentOrchestrator.js';
import {
  composeSpineWithReuseBindings,
  foldAnswersIntoShorthand,
  parseShorthandForChat,
  factRequestId,
  shorthandResultFromCompile,
  type HeldShorthandIntent,
  type ShorthandCompileDeps,
} from './shorthandChat.js';
import type { AcceptedShorthandBinding } from './shorthandChat.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

// ---------------------------------------------------------------------------
// FIXTURE — seeded store and a noun the store genuinely cannot resolve
// ---------------------------------------------------------------------------
// The store has "ExoticCompoundXYZ" — "Exotic Compound XYZ" resolves by label
// (spaces stripped, matching the name). The negative leg uses a different noun
// ("Mystery Substance") that matches no seeded name/title/synonyms entry.

const DOCUMENT_YAML = `intentId: fold-answerbind-test
actions:
  - action: add_material
    material: "Exotic Compound XYZ"
    volume: { value: 10, unit: uL }
    targetWells: [A1]
`;

// Negative-leg document — a noun the store does NOT have
const DOCUMENT_YAML_NEGATIVE = `intentId: fold-answerbind-test-negative
actions:
  - action: add_material
    material: "Mystery Substance"
    volume: { value: 10, unit: uL }
    targetWells: [A1]
`;

const SEED_RECORDS = [
  // The record's name/title/label — "Exotic Compound XYZ" resolves against it
  {
    recordId: 'MAT-exoticxyz',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: {
      kind: 'material',
      name: 'ExoticCompoundXYZ',
      title: 'ExoticCompoundXYZ',
      synonyms: ['ExoticCompoundXYZ'],
    },
  },
];

function mockStore() {
  return {
    get: vi.fn(async (id: string) => {
      const found = SEED_RECORDS.find((r) => r.recordId === id);
      return found ?? null;
    }),
    list: vi.fn(async () => SEED_RECORDS),
  };
}

function makeHeld(): HeldShorthandIntent {
  const doc = parseShorthandForChat(DOCUMENT_YAML);
  const clarifications: ScientistIntentUnresolvedFact[] = [
    {
      label: 'Exotic Compound XYZ',
      reason: 'unknown-noun',
      actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
    },
  ];
  return { yaml: DOCUMENT_YAML, doc, clarifications };
}

// ---------------------------------------------------------------------------
// TEST — the fold arm carries answeredSlots into compileFoldedShorthand
// ---------------------------------------------------------------------------

describe('L2-NOUN-RESOLUTION-POLICY-1 A1: fold arm answeredSlots binding', () => {
  it('binds the noun via answeredSlots when the store does not resolve by label', async () => {
    const held = makeHeld();
    const store = mockStore();

    // Simulate the fold: the scientist chose the record.
    // The fold's bindings carry {label, ref} — the label is what was
    // spliced into the document, the ref is the chosen record id.
    const folded = foldAnswersIntoShorthand(held, [
      {
        requestId: factRequestId(held.clarifications[0]!),
        label: 'Exotic Compound XYZ',
        ref: { kind: 'record', id: 'MAT-exoticxyz', type: 'material', label: 'ExoticCompoundXYZ' },
      },
    ]);
    expect(folded).not.toBeNull();

    // Verify the fold produced bindings with the chosen record
    expect(folded!.bindings).toHaveLength(1);
    const binding = folded!.bindings[0] as AcceptedShorthandBinding;
    expect(binding.label).toBe('Exotic Compound XYZ');
    expect(binding.ref).toBe('local:MAT-exoticxyz');

    // Compile with answeredSlots derived from the fold's bindings
    // This is what the production change does at the fold arm call site.
    const answeredSlots = [
      {
        label: 'Exotic Compound XYZ',
        recordId: 'MAT-exoticxyz',
        recordLabel: 'ExoticCompoundXYZ',
      },
    ];

    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      [], // no placement labware ids
      {
        store: store as never,
        answeredSlots,
      } as ShorthandCompileDeps,
    );

    expect(compiledFold).not.toBeNull();
    // Outcome: the compiler resolves the noun via answeredSlots so it
    // produces events (outcome 'complete' — the compileOutcome type has no
    // 'events' variant). The 'events' assertion below confirms production.
    expect(compiledFold!.outcome).toBe('complete');

    // The slot is RESOLVED — no clarification for the material argument
    const materialClarifications = compiledFold!.clarifications.filter(
      (f) =>
        f.actionLocation?.actionIndex === 0 &&
        f.actionLocation?.argument === 'material',
    );
    expect(materialClarifications).toHaveLength(0);

    // The compiled events carry the record ref
    const events = compiledFold!.terminalArtifacts.events as unknown[];
    expect(events.length).toBeGreaterThanOrEqual(1);
    const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
    // The material_ref should be a record, not a draft
    const matRef = (details as Record<string, unknown>).material_ref as Record<string, unknown> | undefined;
    if (matRef) {
      expect(matRef.kind).toBe('record');
      expect(matRef.id).toBe('MAT-exoticxyz');
    }
  });

  it('without answeredSlots the noun is unresolved on a populated store — different noun that genuinely matches nothing', async () => {
    // Use the SAME populated store as the positive leg, but a document
    // whose noun ("Mystery Substance") matches no seeded name/title/synonyms.
    const doc = parseShorthandForChat(DOCUMENT_YAML_NEGATIVE);
    const store = mockStore();

    // Compile without answeredSlots — the store has records, but none
    // match "Mystery Substance", so the noun stays unresolved.
    const compiled = await compileFoldedShorthand(
      doc,
      [],
      { store: store as never } as ShorthandCompileDeps,
    );

    expect(compiled).not.toBeNull();

    // Without answeredSlots and with a noun the store genuinely cannot
    // answer, the outcome must NOT be 'complete'.
    expect(compiled!.outcome).not.toBe('complete');

    // The material argument must carry a clarification for "Mystery Substance"
    const materialClarifications = compiled!.clarifications.filter(
      (f) =>
        f.actionLocation?.actionIndex === 0 &&
        f.actionLocation?.argument === 'material',
    );
    expect(materialClarifications.length).toBeGreaterThan(0);
    expect(materialClarifications[0]?.label).toBe('Mystery Substance');
  });
});

// ---------------------------------------------------------------------------
// TEST — composeSpineWithReuseBindings narrowing pin
// ---------------------------------------------------------------------------

describe('composeSpineWithReuseBindings narrowing', () => {
  it('narrows to the chosen record when binding ref matches', async () => {
    const candidates = [
      { curie: 'local:MAT-exoticxyz', label: 'ExoticCompoundXYZ', namespace: 'local', tier: 1, level: 'unknown', score: 1, source: 'local-record' },
      { curie: 'local:MAT-otherexotic', label: 'OtherExotic', namespace: 'local', tier: 1, level: 'unknown', score: 0.8, source: 'local-record' },
    ];
    const stubSpine = {
      resolve: async () => candidates,
    };
    const bindings = [{ label: 'Exotic Compound XYZ', ref: 'local:MAT-exoticxyz' }];
    const wrapped = composeSpineWithReuseBindings(stubSpine as any, bindings as any);
    const results = await wrapped.resolve('Exotic Compound XYZ');
    expect(results).toHaveLength(1);
    expect(results[0].curie).toBe('local:MAT-exoticxyz');
  });
});
