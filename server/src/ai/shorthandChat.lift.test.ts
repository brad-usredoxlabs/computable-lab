/**
 * SHORTHAND-COMP-2 Task 9 (RED-first): the run-chat turn must lift model
 * aliases BEFORE the Ajv door, exactly like every other consumer
 * (the corpus capture and the headless route both lift first).
 * The lift canonicalizes aliases — it NEVER launders inventions.
 */
import { describe, expect, it } from 'vitest';
import { parseShorthandForChat, foldAnswersIntoShorthand, type HeldShorthandIntent } from './shorthandChat.js';
import { ScientistIntentValidationError } from '../compiler/scientistIntent/parseScientistIntent.js';

describe('chat shorthand parse lifts model aliases', () => {
  it('accepts the legacy `verb:` key', () => {
    const doc = parseShorthandForChat('intentId: seed\nactions:\n  - verb: add_material\n    material: DMEM\n    volumeUl: 100\n');
    expect(doc.actions[0]!.action).toBe('add_material');
  });

  it('accepts the verb-as-map-key shape the headless prompt teaches', () => {
    const doc = parseShorthandForChat('intentId: seed\nactions:\n  - add_material:\n      material: DMEM\n      volumeUl: 100\n');
    expect(doc.actions[0]!.action).toBe('add_material');
  });

  it('still rejects a fabricated verb (the lift canonicalizes aliases, never launders inventions)', () => {
    expect(() => parseShorthandForChat('intentId: x\nactions:\n  - action: seed_cells\n    material: DMEM\n')).toThrow(ScientistIntentValidationError);
  });

  it('lift is IDEMPOTENT on an already-canonical document (the fold leg re-parses through it)', () => {
    const canonical = 'intentId: fold\nactions:\n  - action: add_material\n    material: "DMEM"\n    volumeUl: 100\n    targetWells: [A1]\n';
    const once = parseShorthandForChat(canonical);
    const twice = parseShorthandForChat(JSON.stringify(once));
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('the fold leg keeps its null-return contract through the lifted re-parse (bait 8 / DEFECT-4 guard)', () => {
    // The answer fills the verb slot with a NON-vocabulary label: the folded
    // document is genuinely invalid, so the fold must return null (never a
    // crash, never a repaired re-parse) — the caller takes the permitted
    // extraction-only fallback.
    const held: HeldShorthandIntent = {
      yaml: 'intentId: fold-null\nactions:\n  - action: add_material\n    material: DMEM\n',
      doc: {
        kind: 'scientist-intent',
        version: '0.1.0',
        intentId: 'fold-null',
        actions: [{ action: 'add_material', material: 'DMEM' } as never],
        unresolved: [],
      },
      clarifications: [{
        label: 'DMEM',
        reason: 'unbound noun',
        actionLocation: { actionIndex: 0, action: 'add_material', argument: 'action' },
      } as never],
    };
    const folded = foldAnswersIntoShorthand(held, [{ requestId: 'unresolved-1', label: 'not_a_verb' } as never]);
    expect(folded).toBeNull();
  });
});
