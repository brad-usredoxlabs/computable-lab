/**
 * SPINE-1 characterization — TODAY's hint -> candidate -> deckSlot behavior on
 * the labware-hint lowering surface (ProtocolIntentLowering + resolve_labware +
 * plan_deck_layout). Sibling to ProtocolIntentLowering.test.ts; does NOT edit
 * that file's pins. These pins are what let SPINE-3 change hint handling without
 * regressing the working labware path.
 *
 * Pinned boundaries:
 * - candidateLabware(): hint = resolvedRecordId ?? labwareHint; role-bearing
 *   reason; deckSlot carried ONLY when present (compact() strips undefined —
 *   exactOptionalPropertyTypes: key absence asserted via Object.keys).
 * - tips/waste WITHOUT deckSlot are skipped (:207, :215 continue-guards).
 * - deckSlot reaches labwareAdditions when a hint resolves (one-match
 *   placement-on-slot, ChatbotCompilePasses.ts:1598-1603).
 * - plan_deck_layout first-wins on two hints claiming one slot.
 * - On the scientist-intent path normalizeScientistIntent NEVER sets deckSlot —
 *   candidates arrive only via lower_protocol_intent, deckSlot-free.
 * - Blockers suppress operation lowering but STILL emit candidateLabwares (:338-344).
 */
import { describe, expect, it } from 'vitest';
import type { PipelineState } from '../pipeline/types.js';
import type {
  ProtocolIntent,
  ProtocolIntentResources,
  ProtocolOperationIntent,
  ProtocolPatternIntent,
} from './ProtocolIntent.js';
import {
  createLowerProtocolIntentPass,
  lowerProtocolIntentLabwareCandidates,
  type ProtocolIntentLoweringOutput,
} from './ProtocolIntentLowering.js';
import {
  createLabwareResolvePass,
  createPlanDeckLayoutPass,
} from '../pipeline/passes/ChatbotCompilePasses.js';
import { parseScientistIntent } from '../scientistIntent/parseScientistIntent.js';
import { normalizeScientistIntent } from '../scientistIntent/normalizeScientistIntent.js';
import { compileScientistIntent } from '../scientistIntent/compileScientistIntent.js';
import { createResolveSpine } from '../../resolve/ResolveSpine.js';

interface IntentPatch {
  resources?: Partial<ProtocolIntentResources>;
  operations?: ProtocolOperationIntent[];
  patterns?: ProtocolPatternIntent[];
  unresolved?: ProtocolIntent['unresolved'];
  assumptions?: ProtocolIntent['assumptions'];
  steps?: ProtocolIntent['steps'];
  sourcePrompt?: string;
}

function protocolIntent(patch: IntentPatch): ProtocolIntent {
  return {
    kind: 'protocol_intent',
    version: '0.1.0',
    intentId: 'characterization-intent',
    ...(patch.sourcePrompt !== undefined ? { sourcePrompt: patch.sourcePrompt } : {}),
    steps: patch.steps ?? [],
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
    patterns: patch.patterns ?? [],
    assumptions: patch.assumptions ?? [],
    unresolved: patch.unresolved ?? [],
  };
}

function emptyState(outputs: Map<string, unknown>): PipelineState {
  return { input: {}, context: {}, meta: {}, outputs, diagnostics: [] };
}

describe('characterization.hint-to-candidate', () => {
  it('hint = resolvedRecordId ?? labwareHint; role-bearing reason; deckSlot key ABSENT when unset', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'lw_resolved', labwareHint: 'old hint', resolvedRecordId: 'LBW-9', role: 'source' },
          { id: 'lw_plain', labwareHint: 'plain hint' },
          { id: 'lw_slotted', labwareHint: 'slotted hint', deckSlot: 'C' },
        ],
      },
    });

    const candidates = lowerProtocolIntentLabwareCandidates(intent);
    expect(candidates).toHaveLength(3);

    // resolvedRecordId wins over labwareHint.
    expect(candidates[0]).toMatchObject({ hint: 'LBW-9', reason: 'ProtocolIntent source labware resource lw_resolved' });
    // compact() strips undefined deckSlot — key ABSENCE, not undefined value.
    expect(Object.keys(candidates[0]!).sort()).toEqual(['hint', 'reason']);
    expect(candidates[0]).not.toHaveProperty('deckSlot');

    // No role -> generic reason string.
    expect(candidates[1]).toMatchObject({ hint: 'plain hint', reason: 'ProtocolIntent labware resource lw_plain' });
    expect(Object.keys(candidates[1]!).sort()).toEqual(['hint', 'reason']);

    // deckSlot carried when present.
    expect(candidates[2]).toEqual({
      hint: 'slotted hint',
      reason: 'ProtocolIntent labware resource lw_slotted',
      deckSlot: 'C',
    });
  });

  it('tips and waste WITHOUT deckSlot are skipped (continue-guards :207, :215); with deckSlot they join', () => {
    const withoutSlots = protocolIntent({
      resources: { tips: [{ id: 'tips_x', label: '50 uL tips' }], waste: [{ id: 'waste_x', label: 'liquid waste' }] },
    });
    expect(lowerProtocolIntentLabwareCandidates(withoutSlots)).toEqual([]);

    const withSlots = protocolIntent({
      resources: {
        tips: [{ id: 'tips_y', label: '50 uL tips', deckSlot: 'B1' }],
        waste: [{ id: 'waste_y', label: 'liquid waste', deckSlot: 'A1' }],
      },
    });
    expect(lowerProtocolIntentLabwareCandidates(withSlots)).toEqual([
      { hint: '50 uL tips', reason: 'ProtocolIntent tip resource tips_y', deckSlot: 'B1' },
      { hint: 'liquid waste', reason: 'ProtocolIntent waste resource waste_y', deckSlot: 'A1' },
    ]);
  });
});

describe('characterization.deckSlot-passthrough', () => {
  it('deckSlot reaches labwareAdditions when a hint resolves (one-match placement-on-slot)', async () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [{ id: 'plate_D', labwareHint: '96 well plate', deckSlot: 'D', role: 'target' }],
      },
    });

    const lowerResult = createLowerProtocolIntentPass().run({
      pass_id: 'lower_protocol_intent',
      state: emptyState(new Map([['ai_precompile', { protocolIntent: intent }]])),
    }) as { ok: boolean; output: ProtocolIntentLoweringOutput };
    expect(lowerResult.output.candidateLabwares).toEqual([
      { hint: '96 well plate', reason: 'ProtocolIntent target labware resource plate_D', deckSlot: 'D' },
    ]);

    const resolveResult = await createLabwareResolvePass({
      searchLabwareByHint: async (hint) => (hint === '96 well plate' ? [{ recordId: 'LAB-plate-1', title: '96-well plate' }] : []),
    }).run({
      pass_id: 'resolve_labware',
      state: emptyState(new Map([['lower_protocol_intent', lowerResult.output]])),
    }) as { ok: boolean; output: { labwareAdditions?: Array<Record<string, unknown>>; resolvedLabwares?: Array<Record<string, unknown>> } };

    // One match + deckSlot -> resolved AND a placement addition carrying deckSlot.
    expect(resolveResult.output.resolvedLabwares).toEqual([
      { hint: '96 well plate', recordId: 'LAB-plate-1', title: '96-well plate' },
    ]);
    expect(resolveResult.output.labwareAdditions).toEqual([
      { recordId: 'LAB-plate-1', reason: 'ProtocolIntent target labware resource plate_D', deckSlot: 'D' },
    ]);
  });

  it('plan_deck_layout first-wins when two hints claim one slot (conflict recorded, first pinned)', async () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [
          { id: 'claim_a', labwareHint: 'hintA', deckSlot: 'B1' },
          { id: 'claim_b', labwareHint: 'hintB', deckSlot: 'B1' },
        ],
      },
    });

    const lowerResult = createLowerProtocolIntentPass().run({
      pass_id: 'lower_protocol_intent',
      state: emptyState(new Map([['ai_precompile', { protocolIntent: intent }]])),
    }) as { ok: boolean; output: ProtocolIntentLoweringOutput };

    // Zero matches -> additions carry the hint as recordId + deckSlot.
    const resolveResult = await createLabwareResolvePass({ searchLabwareByHint: async () => [] }).run({
      pass_id: 'resolve_labware',
      state: emptyState(new Map([['lower_protocol_intent', lowerResult.output]])),
    }) as { ok: boolean; output: { labwareAdditions?: Array<Record<string, unknown>> } };
    expect(resolveResult.output.labwareAdditions).toEqual([
      { recordId: 'hintA', reason: 'ProtocolIntent labware resource claim_a', deckSlot: 'B1' },
      { recordId: 'hintB', reason: 'ProtocolIntent labware resource claim_b', deckSlot: 'B1' },
    ]);

    const deckResult = createPlanDeckLayoutPass().run({
      pass_id: 'plan_deck_layout',
      state: emptyState(new Map([['resolve_labware', resolveResult.output]])),
    }) as {
      ok: boolean;
      output: { pinned: Array<{ slot: string; labwareHint: string }>; conflicts: Array<{ slot: string; candidates: string[] }> };
    };

    expect(deckResult.output.pinned).toEqual([{ slot: 'B1', labwareHint: 'hintA' }]);
    expect(deckResult.output.conflicts).toEqual([{ slot: 'B1', candidates: ['hintA', 'hintB'] }]);
  });

  it('on the scientist-intent path normalizeScientistIntent NEVER sets deckSlot (candidates are deckSlot-free)', async () => {
    // deckSlot arrives only via ProtocolIntent resources / the deterministic
    // precompile path (DeterministicPrecompilePass.ts:42,:294) — NOT via
    // normalizeScientistIntent. Pinned as today's boundary.
    const doc = parseScientistIntent(`
intentId: deck-absent
actions:
  - { action: transfer, source: mystery_source, target: mystery_target }
`);
    const normalized = normalizeScientistIntent(doc);
    const instances = normalized.protocolIntent?.resources.labwareInstances ?? [];
    expect(instances.length).toBeGreaterThan(0);
    for (const instance of instances) {
      expect(instance).not.toHaveProperty('deckSlot');
    }

    // SPINE-4 DELIBERATE GOLDEN CHANGE (compile leg only; the normalize-side
    // deckSlot pin above is untouched). BEFORE: unbindable hints minted
    // deckSlot-free labwareAdditions. AFTER: unbindable nouns bar the compile
    // atomically — resolve_labware never runs, so labwareAdditions is ABSENT
    // and the outcome is 'needs-clarification' with structured clarifications.
    const { terminalArtifacts, outcome, clarifications } = await compileScientistIntent(doc, {
      // SPINE-4 fix1/D1: deps.spine is REQUIRED (fail-loud registration).
      // Provider-less spine injected EXPLICITLY as the declared test seam —
      // the bar below is a REAL unresolved noun (no store can bind it), not
      // the D1 false-bar.
      spine: createResolveSpine({}),
      searchLabwareByHint: async () => [],
    });
    expect(outcome).toBe('needs-clarification');
    expect(Object.keys(terminalArtifacts)).not.toContain('labwareAdditions');
    expect(terminalArtifacts.events).toEqual([]);
    expect(clarifications.map((c) => c.label).sort()).toEqual(['mystery_source', 'mystery_target']);
  });
});

describe('characterization.blockers-keep-candidates', () => {
  it('a validation blocker suppresses operation lowering but candidateLabwares STILL emit (:338-344), deckSlot-free candidates included', () => {
    const intent = protocolIntent({
      resources: {
        labwareInstances: [{ id: 'plate_no_slot', labwareHint: '96 well plate' }],
        materialDefinitions: [{ id: 'cells', label: 'cells', kind: 'cell_line' }],
      },
      operations: [
        { id: 'op-load', kind: 'load_material', labware: 'plate_no_slot', targetWells: ['A1'], materialRef: 'missing_material' },
      ],
    });

    const result = createLowerProtocolIntentPass().run({
      pass_id: 'lower_protocol_intent',
      state: emptyState(new Map([
        ['ai_precompile', { protocolIntent: intent }],
        ['validate_protocol_intent', {
          status: 'blocked',
          findings: [],
          blockers: [{
            severity: 'error',
            code: 'dangling_material_reference',
            message: 'material reference does not resolve',
            path: 'operations.0.materialRef',
            blocksLowering: true,
          }],
        }],
      ])),
    }) as {
      ok: boolean;
      output: ProtocolIntentLoweringOutput;
      diagnostics?: Array<{ code: string }>;
    };

    expect(result.ok).toBe(true);
    expect(result.output.events).toEqual([]);
    expect(result.output.directives).toEqual([]);
    // Candidates survive the blocker — and the deckSlot-free candidate keeps
    // exactly {hint, reason} keys (compact() discipline).
    expect(result.output.candidateLabwares).toEqual([
      { hint: '96 well plate', reason: 'ProtocolIntent labware resource plate_no_slot' },
    ]);
    expect(Object.keys(result.output.candidateLabwares[0]!).sort()).toEqual(['hint', 'reason']);
    expect(result.diagnostics?.[0]?.code).toBe('protocol_intent_validation_blocker');
  });
});
