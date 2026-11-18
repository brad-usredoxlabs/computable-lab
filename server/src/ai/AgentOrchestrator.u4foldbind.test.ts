/**
 * L2-P1-AMBIGUOUS-OPTIONS-1 / u4foldbind — the fold-resume arm must ride the
 * answered option's record id as an answeredSlot even when the fold produced
 * NO bindings (the r12 D1 live defect: pick an option → recompile re-asks the
 * identical ambiguous-noun question forever).
 *
 * Defect shape (pinned empirically at base 0217f4bc1, probe _probe.foldbind):
 * a DECLARED-kind slot (vocabulary `kind: wells`, e.g. add_material.targetWells)
 * splices through the declared arm (shorthandChat.ts:1510-1535) which writes
 * the slot and `continue`s BEFORE the binding block — so the fold returns a
 * NON-NULL document with `bindings: []` even when the answer carries the
 * chosen record id in its `ref`. The fold-resume arm gates the tier-1 direct
 * bind on `folded.bindings.length > 0` (AgentOrchestrator.ts:1729-1732), so
 * `answeredFromFold` is `[]` and the recompile compiles the held prompt with
 * NO answeredSlots → same resolution → same question, forever.
 *
 * FIX (this unit): when `folded.bindings.length === 0` but a fold answer
 * carries a record id in its `ref`, synthesize the AnsweredNounAnswer(s)
 * straight from the answer's ref (never a mint, never a guess) through the
 * SAME bindingsToAnsweredSlots mapper (the store.get guard keeps the
 * never-guess contract). A ref-less answer keeps today's behaviour
 * byte-identically.
 *
 * RED at base: the recompile (compileShorthandDeterministically, spied on the
 * module namespace — the workspaceAction OQ1 precedent for asserting
 * conditional-spreads on the compile handler's options) receives NO
 * answeredSlots key. GREEN after the fix: answeredSlots names the chosen
 * record id.
 */
// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createAgentOrchestrator } from './AgentOrchestrator.js';
import {
  factRequestId,
  holdShorthandIntent,
  parseShorthandForChat,
} from './shorthandChat.js';
import * as shorthandChatModule from './shorthandChat.js';
import { deriveContextCacheKey } from './systemPrompt.js';
import type { ScientistIntentUnresolvedFact } from '../compiler/scientistIntent/types.js';

// The held document: add_material whose targetWells is a DECLARED `kind:
// wells` slot holding a symbolic well-range LABEL (the form that bars — SPINE-7
// "a range string in a declared kind: wells slot is a symbolic well label to
// the engine and would bar again"). The fact rides that slot; the answer
// carries the chosen option's record identity in `ref` (the client answer
// shape — ClarificationPicker.tsx:536 / u2refcarry fixture — the record id in
// `ref.id`, never a mint).
const HOLD_YAML = [
  'intentId: add-seed-solution-u4foldbind',
  'actions:',
  '  - action: add_material',
  '    material: "Seed Solution"',
  '    volume: { value: 50, unit: uL }',
  '    targetWells: "A1:A12"',
].join('\n');

const FACT: ScientistIntentUnresolvedFact = {
  label: 'A1:A12',
  reason: 'ambiguous-noun',
  actionLocation: { actionIndex: 0, action: 'add_material', argument: 'targetWells' },
} as ScientistIntentUnresolvedFact;

const CHOSEN_RECORD = {
  recordId: 'LBW-96-plate-1',
  schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
  payload: {
    kind: 'labware',
    name: 'Generic 96 Well Plate',
    title: 'Generic 96 Well Plate',
    synonyms: ['96 well plate'],
  },
};

function mockStore() {
  return {
    get: vi.fn(async (id: string) => (id === CHOSEN_RECORD.recordId ? CHOSEN_RECORD : null)),
    getRecord: vi.fn(async (id: string) => (id === CHOSEN_RECORD.recordId ? CHOSEN_RECORD : null)),
    list: vi.fn(async () => [CHOSEN_RECORD]),
  };
}

function orchestratorDeps() {
  return { store: mockStore() as never };
}

const RUN_CHAT_REQUEST = {
  prompt: 'add 50 uL of seed solution to A1:A12',
  surface: 'run-workspace' as const,
  forceDraftTool: true,
  context: {
    labwares: [],
    eventSummary: 'No events yet.',
    vocabPackId: 'liquid-handling/v1',
    availableVerbs: ['add_material'],
    runId: 'RUN-u4foldbind-test',
  },
};

function holdR12Shaped() {
  const key = deriveContextCacheKey('run-workspace' as never, RUN_CHAT_REQUEST.context as never);
  const doc = parseShorthandForChat(HOLD_YAML);
  holdShorthandIntent(key, { yaml: HOLD_YAML, doc, clarifications: [FACT] });
}

function makeOrchestrator() {
  const completeStream = vi.fn(async function* () {
    yield {} as never;
  });
  return createAgentOrchestrator(
    { client: { complete: vi.fn(), completeStream } } as never,
    { getToolDefinitions: () => [], executeTool: vi.fn() } as never,
    { model: 'test-model', temperature: 0.1, maxTokens: 512 },
    { maxTurns: 2 },
    orchestratorDeps(),
  );
}

describe('L2-P1-AMBIGUOUS-OPTIONS-1 u4foldbind: fold-empty-bindings answers ride the recompile as answeredSlots', () => {
  it('RED: a ref-carrying option pick whose fold recorded NO binding must still give the recompile an answeredSlot naming the chosen record id', async () => {
    holdR12Shaped();
    const compileSpy = vi.spyOn(shorthandChatModule, 'compileShorthandDeterministically');
    try {
      const answer = {
        requestId: factRequestId(FACT),
        optionId: CHOSEN_RECORD.recordId,
        label: 'A1:A12',
        ref: { kind: 'record', id: CHOSEN_RECORD.recordId, type: 'labware', label: 'Generic 96 Well Plate' },
      };
      const result = await makeOrchestrator().run({
        ...RUN_CHAT_REQUEST,
        prompt: 'Use A1:A12 for targetWells.',
        clarificationAnswers: [answer],
      } as never);

      // The fold ran (non-null — the declared-wells arm spliced) and the
      // recompile went through the deterministic compile handler exactly once.
      expect(compileSpy).toHaveBeenCalled();
      const depsArg = compileSpy.mock.calls[0]![1] as { answeredSlots?: Array<Record<string, unknown>> };
      // THE DEFECT PIN: the recompile must receive an answeredSlot naming the
      // chosen record id — at base the gate on folded.bindings.length > 0
      // leaves the key ABSENT (the re-ask loop).
      expect(depsArg.answeredSlots).toEqual([
        {
          label: 'A1:A12',
          recordId: CHOSEN_RECORD.recordId,
          recordLabel: 'Generic 96 Well Plate',
        },
      ]);
      void result;
    } finally {
      compileSpy.mockRestore();
    }
  });

  it('ref-less option pick keeps byte-identical prior behaviour: the answeredSlots key stays ABSENT, never undefined', async () => {
    holdR12Shaped();
    const compileSpy = vi.spyOn(shorthandChatModule, 'compileShorthandDeterministically');
    try {
      const answer = {
        requestId: factRequestId(FACT),
        optionId: CHOSEN_RECORD.recordId,
        label: 'A1:A12',
      };
      await makeOrchestrator().run({
        ...RUN_CHAT_REQUEST,
        prompt: 'Use A1:A12 for targetWells.',
        clarificationAnswers: [answer],
      } as never);

      expect(compileSpy).toHaveBeenCalled();
      const depsArg = compileSpy.mock.calls[0]![1] as Record<string, unknown>;
      // Never-guess: no id in the answer's ref ⇒ no synthesized slot. The
      // conditional-spread discipline — ABSENT, not undefined.
      expect('answeredSlots' in depsArg).toBe(false);
    } finally {
      compileSpy.mockRestore();
    }
  });
});
