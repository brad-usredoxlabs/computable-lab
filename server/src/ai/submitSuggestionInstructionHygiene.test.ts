/**
 * HYGIENE-2 (RED-first): the unconditional draft-mode instruction and the
 * submit_suggestion records description must not name the legacy `event_graph`
 * drafting intent — the agent_intent tool def's own menu does that, so the
 * wording must hold on every surface class (mirrors the SH-PROMPT-HYGIENE-1
 * "choosing ONE intent from its menu" idiom). Prompt vocabulary hygiene only:
 * the `event_graph` INTENT itself stays in the enum (pin 5).
 *
 * Pins 1-2 are RED at base (they locate the residue); pins 3-5 are GREEN at
 * base (anchor stability, leak guard, routing intact). No surface composition,
 * no AgentOrchestrator import — this file reads the exported strings/defs only.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INTENT_TOOL_DEF,
  SUBMIT_SUGGESTION_INSTRUCTION,
  SUBMIT_SUGGESTION_TOOL_DEF,
} from './submitSuggestionTool.js';
import { defaultScientistIntentVocabulary } from '../compiler/scientistIntent/vocabulary.js';

describe('submit_suggestion instruction hygiene (HYGIENE-2)', () => {
  it('pin 1: the instruction carries no event_graph vocabulary', () => {
    expect(SUBMIT_SUGGESTION_INSTRUCTION).not.toMatch(/event_graph/);
  });

  it('pin 2: the submit_suggestion tool def serialization carries no event_graph vocabulary', () => {
    expect(JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)).not.toMatch(/event_graph/);
  });

  it('pin 3: the workstateComposeRules order anchor survives the rename', () => {
    expect(SUBMIT_SUGGESTION_INSTRUCTION.startsWith('FINALIZING YOUR ANSWER:')).toBe(true);
  });

  it('pin 4: the generated vocabulary block leaks into neither the instruction nor the tool def', () => {
    const block = defaultScientistIntentVocabulary().contractBlock();
    expect(SUBMIT_SUGGESTION_INSTRUCTION).not.toContain(block);
    expect(JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF)).not.toContain(block);
  });

  it('pin 5: the rename is vocabulary hygiene, not enum retirement — agent_intent still routes event_graph', () => {
    const intentEnum = (
      AGENT_INTENT_TOOL_DEF.function.parameters as {
        properties: { intent: { enum?: string[] } };
      }
    ).properties.intent.enum;
    expect(Array.isArray(intentEnum)).toBe(true);
    expect(intentEnum ?? []).toContain('event_graph');
  });
});
