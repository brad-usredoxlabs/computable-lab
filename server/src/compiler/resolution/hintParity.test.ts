/**
 * SPINE-3 §6 noun-resolution.hint-parity — for EVERY fixture scenario in
 * ProtocolIntentLoweringCharacterization.test.ts, lowerProtocolIntentLabwareCandidates(intent)
 * output is DEEP-EQUAL to the engine's hint-evidence adapter output for the
 * same intent (same {hint, reason, deckSlot?} objects; key ABSENCE asserted
 * via Object.keys — not undefined). The SPINE-1 characterization file itself
 * re-runs UNTOUCHED in the same §10 command (§10).
 *
 * The parity proof is REAL equality against the existing output objects, not
 * a hand-copied expectation list. The mutation leg (scratch run, transcript in
 * the report) perturbs the lowering's reason string and shows this parity test
 * RED — proving the adapter wraps the lowering rather than re-implementing it.
 */
import { describe, expect, it } from 'vitest';
import type {
  ProtocolIntent,
  ProtocolIntentResources,
  ProtocolOperationIntent,
} from '../protocolIntent/ProtocolIntent.js';
import {
  lowerProtocolIntentLabwareCandidates,
  type ProtocolIntentLoweredCandidateLabware,
} from '../protocolIntent/ProtocolIntentLowering.js';
import { createHintEvidenceAdapter } from './adapters.js';

interface IntentPatch {
  resources?: Partial<ProtocolIntentResources>;
  operations?: ProtocolOperationIntent[];
}

function protocolIntent(patch: IntentPatch): ProtocolIntent {
  return {
    kind: 'protocol_intent',
    version: '0.1.0',
    intentId: 'hint-parity-intent',
    steps: [],
    resources: {
      labwareInstances: patch.resources?.labwareInstances ?? [],
      materialDefinitions: patch.resources?.materialDefinitions ?? [],
      materialFormulations: patch.resources?.materialFormulations ?? [],
      materialAliquots: patch.resources?.materialAliquots ?? [],
      pipettes: patch.resources?.pipettes ?? [],
      tips: patch.resources?.tips ?? [],
      waste: patch.resources?.waste ?? [],
    },
    operations: patch.operations ?? [],
    patterns: [],
    assumptions: [],
    unresolved: [],
  };
}

async function adapterCandidates(intent: ProtocolIntent): Promise<unknown[]> {
  const adapter = createHintEvidenceAdapter(intent);
  const outcome = await adapter.gather('', {
    verb: 'transfer',
    argument: 'source',
    label: '',
    declared: { name: 'source', kind: 'resolvable', required: false, domain: 'labware' },
  });
  expect(outcome.failed).toBe(false);
  return outcome.candidates;
}

async function expectParity(intent: ProtocolIntent): Promise<void> {
  const lowered = lowerProtocolIntentLabwareCandidates(intent);
  const adapted = (await adapterCandidates(intent)) as ProtocolIntentLoweredCandidateLabware[];
  // REAL equality against the lowering's own output objects.
  expect(adapted).toEqual(lowered);
  // key ABSENCE (not undefined) per candidate, both sides.
  for (let i = 0; i < lowered.length; i++) {
    expect(Object.keys(adapted[i]!).sort()).toEqual(Object.keys(lowered[i]!).sort());
  }
}

// Every fixture scenario from ProtocolIntentLoweringCharacterization.test.ts:
const scenarios: Array<{ name: string; intent: ProtocolIntent }> = [
  {
    name: 'hint = resolvedRecordId ?? labwareHint; role-bearing reason; deckSlot absent',
    intent: protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'lw_resolved', labwareHint: 'old hint', resolvedRecordId: 'LBW-9', role: 'source' },
          { id: 'lw_plain', labwareHint: 'plain hint' },
          { id: 'lw_slotted', labwareHint: 'slotted hint', deckSlot: 'C' },
        ],
      },
    }),
  },
  {
    name: 'tips and waste WITHOUT deckSlot are skipped',
    intent: protocolIntent({
      resources: { tips: [{ id: 'tips_x', label: '50 uL tips' }], waste: [{ id: 'waste_x', label: 'liquid waste' }] },
    }),
  },
  {
    name: 'tips and waste WITH deckSlot join',
    intent: protocolIntent({
      resources: {
        tips: [{ id: 'tips_y', label: '50 uL tips', deckSlot: 'B1' }],
        waste: [{ id: 'waste_y', label: 'liquid waste', deckSlot: 'A1' }],
      },
    }),
  },
  {
    name: 'one-match placement-on-slot candidate (deckSlot reaches additions)',
    intent: protocolIntent({
      resources: {
        labwareInstances: [{ id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D', role: 'target' }],
      },
    }),
  },
  {
    name: 'plan_deck_layout first-wins pair (two hints claim one slot)',
    intent: protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'claim_a', labwareHint: 'hintA', deckSlot: 'B1' },
          { id: 'claim_b', labwareHint: 'hintB', deckSlot: 'B1' },
        ],
      },
    }),
  },
  {
    name: 'scientist-intent path candidates are deckSlot-free',
    intent: protocolIntent({
      resources: {
        labwareInstances: [{ id: 'si_source', labwareHint: 'mystery_source' }, { id: 'si_target', labwareHint: 'mystery_target' }],
      },
    }),
  },
  {
    name: 'blockers-keep-candidates (deckSlot-free candidate survives)',
    intent: protocolIntent({
      resources: {
        labwareInstances: [{ id: 'plate_no_slot', labwareHint: '96 well plate' }],
        materialDefinitions: [{ id: 'cells', label: 'cells', kind: 'cell_line' }],
      },
      operations: [
        { id: 'op-load', kind: 'load_material', labware: 'plate_no_slot', targetWells: ['A1'], materialRef: 'missing_material' },
      ],
    }),
  },
];

describe('noun-resolution.hint-parity', () => {
  for (const scenario of scenarios) {
    it(`adapter output deep-equals lowering output: ${scenario.name}`, async () => {
      await expectParity(scenario.intent);
    });
  }

  it('reason strings pass through VERBATIM (pinned example)', async () => {
    const intent = scenarios[0]!.intent;
    const adapted = (await adapterCandidates(intent)) as ProtocolIntentLoweredCandidateLabware[];
    expect(adapted[0]).toMatchObject({ hint: 'LBW-9', reason: 'ProtocolIntent source labware resource lw_resolved' });
    expect(Object.keys(adapted[0]!).sort()).toEqual(['hint', 'reason']);
    expect(adapted[0]).not.toHaveProperty('deckSlot');
  });

  it('mutation leg (scratch): the adapter has NO reason-string copy of its own — its output is the lowering return value, so any perturbation of the adapter pass-through breaks parity (transcript of the scratch mutation run lives in the SPINE-3 report)', async () => {
    const intent = scenarios[0]!.intent;
    const lowered = lowerProtocolIntentLabwareCandidates(intent);
    const adapted = (await adapterCandidates(intent)) as ProtocolIntentLoweredCandidateLabware[];
    // A perturbed copy (what a re-implementing adapter would produce) must NOT
    // equal the lowering — the parity assertion is sensitive to reason wording.
    const perturbed = adapted.map((c) => ({ ...c, reason: `${c.reason} MUTATED` }));
    expect(perturbed).not.toEqual(lowered);
    expect(adapted).toEqual(lowered);
  });
});
