/**
 * SHORTHAND-COMP-2 Task 10c (RED-first): the three places the model reads the
 * shorthand contract — the agent_intent tool def's `shorthand` description, the
 * forced-draft instruction, and the malformed-shorthand repair prompt — must all
 * carry the GENERATED vocabulary block (bait 1: assertions derive from
 * vocab.verbs()/toolActionEnum()/the types.ts union, never typed-out verb names;
 * set diffs BOTH directions, never lengths).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_INTENT_TOOL_DEF } from './submitSuggestionTool.js';
import { FORCED_DRAFT_TOOL_INSTRUCTION } from './AgentOrchestrator.js';
import { malformedShorthandRepairPrompt } from './shorthandChat.js';
import { ScientistIntentValidationError } from '../compiler/scientistIntent/parseScientistIntent.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';
import { unionVerbsFromSource } from '../compiler/scientistIntent/vocabularyMirrorDrift.test.js';

const TYPES_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'types.ts');

/** The verb lines a contract block carries (declaration order). */
function blockVerbs(text: string): string[] {
  return text
    .split('\n')
    .filter((l) => l.startsWith('- ') && l.includes(' — ') || (l.startsWith('- ') && !l.includes(':')))
    .map((l) => l.slice(2).split(' — ')[0]!.trim())
    .filter((v) => /^[a-z_]+$/.test(v));
}

function diffSets(a: readonly string[], b: readonly string[]): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return { onlyA: a.filter((v) => !setB.has(v)), onlyB: b.filter((v) => !setA.has(v)) };
}

describe('shorthand contract disclosure (generated, three sites)', () => {
  const vocab = defaultScientistIntentVocabulary();
  const block = vocab.contractBlock();

  const shorthandDesc = (AGENT_INTENT_TOOL_DEF.function.parameters as {
    properties: { shorthand?: { description?: string } };
  }).properties.shorthand?.description ?? '';

  it('the tool def shorthand description carries the generated block', () => {
    expect(shorthandDesc).toContain(block);
  });

  it('the forced-draft instruction carries the block interpolated ONCE (OQ1 ruling)', () => {
    expect(FORCED_DRAFT_TOOL_INSTRUCTION).toContain(block);
    const occurrences = FORCED_DRAFT_TOOL_INSTRUCTION.split(block).length - 1;
    expect(occurrences).toBe(1);
  });

  it('the repair prompt re-states the contract instead of re-asking blind', () => {
    const err = new ScientistIntentValidationError('boom', [new Error('unknown property count')]);
    const prompt = malformedShorthandRepairPrompt(err, 'intentId: x\nactions: []\n');
    expect(prompt).toContain(block);
    // The ONE canonical shape the schema accepts (Task 11's anchor).
    expect(prompt).toContain('- action: add_material');
    expect(prompt).toContain('volumeUl: 100');
  });

  it('set-equality BOTH directions at every site: disclosed verbs == toolActionEnum == types.ts union (bait 1)', () => {
    const union = unionVerbsFromSource(readFileSync(TYPES_PATH, 'utf-8'));
    for (const [name, text] of [
      ['tool def', shorthandDesc],
      ['forced draft', FORCED_DRAFT_TOOL_INSTRUCTION],
      ['repair prompt', malformedShorthandRepairPrompt(new ScientistIntentValidationError('x', []), 'intentId: x\nactions: []\n')],
    ] as const) {
      const disclosed = blockVerbs(text);
      const d = diffSets(disclosed, vocab.toolActionEnum());
      expect(d.onlyA, `${name}: disclosed but not in the enum: ${d.onlyA.join(', ')}`).toEqual([]);
      expect(d.onlyB, `${name}: enum verb missing from ${name}: ${d.onlyB.join(', ')}`).toEqual([]);
      const u = diffSets(disclosed, union);
      expect(u.onlyA).toEqual([]);
      expect(u.onlyB).toEqual([]);
    }
  });

  it('the four ratchet-measured prompt strings stay UNTOUCHED by the disclosure (bait 4)', async () => {
    // SUBMIT_SUGGESTION_TOOL_DEF / SUBMIT_SUGGESTION_INSTRUCTION are the
    // ratchet's strings; the block must never leak into them.
    const mod = await import('./submitSuggestionTool.js');
    expect(JSON.stringify(mod.SUBMIT_SUGGESTION_TOOL_DEF)).not.toContain(block);
    expect(mod.SUBMIT_SUGGESTION_INSTRUCTION).not.toContain(block);
  });
});
