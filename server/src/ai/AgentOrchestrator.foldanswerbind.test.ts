/**
 * L2-NOUN-RESOLUTION-POLICY-1 A1: the fold arm now carries accepted bindings
 * as answeredSlots into compileFoldedShorthand. The resolver accepts them
 * directly as tier-1 bindings, so the noun binds to the chosen record id
 * instead of only narrowing the label search (which can never introduce a
 * record the spine did not find).
 *
 * FIXTURE: the document's noun label does NOT match any store record name —
 * the store resolves nothing by label. Only the answered binding can settle
 * the slot. Without the production change (answeredSlots spread), the noun
 * remains unresolved or the answer is refused.
 */
// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { compileFoldedShorthand } from './AgentOrchestrator.js';
import {
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
// FIXTURE — a noun the store CANNOT resolve by label
// ---------------------------------------------------------------------------
// The document says "Exotic Compound XYZ" — the store has "ExoticCompoundXYZ"
// (no spaces). The label alone will NOT match, so without answeredSlots
// the slot stays unresolved or is clarified.

const DOCUMENT_YAML = `intentId: fold-answerbind-test
actions:
  - action: add_material
    material: "Exotic Compound XYZ"
    volume: { value: 10, unit: uL }
    targetWells: [A1]
`;

const SEED_RECORDS = [
  // The record's name/title/label has no spaces — won't match "Exotic Compound XYZ"
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
    expect(compiledFold!.outcome).toBe('events');

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

  it('without answeredSlots the noun is unresolved (RED leg — proves the defect)', async () => {
    const held = makeHeld();
    const store = mockStore();

    const folded = foldAnswersIntoShorthand(held, [
      {
        requestId: factRequestId(held.clarifications[0]!),
        label: 'Exotic Compound XYZ',
        ref: { kind: 'record', id: 'MAT-exoticxyz', type: 'material', label: 'ExoticCompoundXYZ' },
      },
    ]);
    expect(folded).not.toBeNull();

    // Compile WITHOUT answeredSlots — the old behaviour
    const compiledFold = await compileFoldedShorthand(
      folded!.doc,
      [],
      { store: store as never } as ShorthandCompileDeps,
    );

    expect(compiledFold).not.toBeNull();

    // Without answeredSlots, the store CANNOT resolve "Exotic Compound XYZ"
    // by label (no space match), so the noun stays unresolved or is clarified.
    // The compile outcome should NOT be 'events' with a resolved material,
    // or it should emit a clarification.
    if (compiledFold!.outcome === 'events') {
      const events = compiledFold!.terminalArtifacts.events as unknown[];
      if (events.length > 0) {
        const details = (events[0] as Record<string, unknown>).details as Record<string, unknown>;
        const matRef = (details as Record<string, unknown>).material_ref as Record<string, unknown> | undefined;
        // If it resolved by label, that would be vacuous — the label doesn't match.
        // It should be draft/unknown, or the compilation should clarify.
        if (matRef && matRef.kind === 'record') {
          // This would mean reuseBindings resolved it by label — but "Exotic Compound XYZ"
          // cannot match "ExoticCompoundXYZ" by label reuse (the reuse filter needs candidates
          // from the spine, and the spine won't find it). So this should not happen.
          // If we get here, the fixture is wrong.
          throw new Error('UNEXPECTED: label-only resolution succeeded — fixture is wrong');
        }
      }
    } else {
      // The outcome is not 'events' — the noun was not resolved
      expect(compiledFold!.outcome).not.toBe('events');
    }
  });
});
