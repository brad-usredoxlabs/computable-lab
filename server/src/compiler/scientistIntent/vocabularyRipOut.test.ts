/**
 * scientist-intent-vocabulary.rip-out + strategy-order flip + prompt-exclusivity.
 *
 * RIP-OUT (the item's core proof): removing a verb from a FIXTURE vocabulary
 * changes BOTH the prompt vocabulary AND parser acceptance with ZERO TypeScript
 * edits — the test file + fixtures only. Deleting a verb from YAML deletes it
 * from prompt and parser (CLAUDE.md rip-out rule).
 *
 * STRATEGY-ORDER FLIP: a fixture vocabulary+lint pair with strategyOrder entries
 * swapped reports the swapped order through policies(); the SHIPPED order is
 * unchanged; zero TS touched — precedence is data, not code (SPINE-3 consumes).
 *
 * PROMPT-EXCLUSIVITY: the captured mock-client system prompt contains
 * OUTPUT ONLY YAML + the generated verb block and NO line-DSL surface; no
 * parser module for any other grammar exists in the scientistIntent dir.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  loadScientistIntentVocabulary,
  defaultScientistIntentVocabulary,
  VOCABULARY_DATA_FILE,
} from './vocabulary.js';
import { parseScientistIntent, ScientistIntentValidationError } from './parseScientistIntent.js';
import { intentCompileSystemPrompt, compileFromSmallLlm } from './intentCompile.js';

const FIXTURES = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures');

const PELLET_DOC = `
intentId: ripout
actions:
  - { action: pellet, rpm: 1000 }
`;

const NO_PELLET_DOC = `
intentId: ripout-ok
actions:
  - { action: spin, rpm: 3000 }
  - { action: seed, source: cells }
`;

describe('scientist-intent-vocabulary.rip-out', () => {
  const fixtureVocab = loadScientistIntentVocabulary({
    path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE),
  });

  it('fixture vocabulary (copy minus pellet) has 30 verbs and lacks pellet', () => {
    expect(fixtureVocab.verbs()).toHaveLength(30);
    expect(fixtureVocab.has('pellet')).toBe(false);
  });

  it('prompt generated from the fixture vocabulary lacks pellet and contains the other 30', () => {
    const prompt = intentCompileSystemPrompt(fixtureVocab);
    expect(prompt).not.toMatch(/\bpellet\b/);
    const shipped = defaultScientistIntentVocabulary();
    for (const verb of shipped.verbs()) {
      if (verb === 'pellet') continue;
      expect(prompt, `verb ${verb}`).toContain(verb);
    }
  });

  it('parser rejects a pellet document through the fixture vocabulary (Ajv enum injection follows the fixture)', () => {
    expect(() => parseScientistIntent(PELLET_DOC, { vocabulary: fixtureVocab })).toThrow(
      ScientistIntentValidationError,
    );
  });

  it('a document without pellet still parses through the fixture vocabulary', () => {
    const doc = parseScientistIntent(NO_PELLET_DOC, { vocabulary: fixtureVocab });
    expect(doc.actions).toHaveLength(2);
  });

  it('the shipped vocabulary still accepts pellet (the rip-out was fixture-local)', () => {
    const doc = parseScientistIntent(PELLET_DOC);
    expect(doc.actions).toHaveLength(1);
    expect(doc.actions[0]?.action).toBe('pellet');
  });
});

describe('strategy-order flip (data, not code)', () => {
  it('a fixture vocabulary with strategyOrder swapped reports the swapped order through policies()', () => {
    const flipped = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-strategy-flip', VOCABULARY_DATA_FILE),
    });
    const shipped = defaultScientistIntentVocabulary();
    const shippedOrder = shipped.policies().strategyOrder;
    const flippedOrder = flipped.policies().strategyOrder;
    expect(flippedOrder).toEqual([...shippedOrder].reverse());
    expect(flippedOrder).not.toEqual(shippedOrder);
    // The shipped order is unchanged by the fixture's existence.
    expect(shippedOrder).toEqual([
      'explicit_wells',
      'hint_search',
      'symbolic_label',
      'ontology_resolution',
      'mint_local',
    ]);
    // Strategy refs still resolve against the flipped order (lint passed at load).
    expect(flippedOrder).toContain(flipped.policies().ambiguity.strategyRef);
    expect(flippedOrder).toContain(flipped.policies().hintAuthority.strategyRef);
  });
});

describe('prompt-exclusivity (scientist-intent YAML only, no line-DSL)', () => {
  it('the system prompt a real compile call sends contains OUTPUT ONLY YAML + the generated verb block', async () => {
    let capturedSystem = '';
    const llm = {
      complete: vi.fn(async (req: { messages: Array<{ role: string; content: string }> }) => {
        capturedSystem = req.messages[0]?.content ?? '';
        return {
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: 'emit_scientist_intent',
                  arguments: JSON.stringify({
                    intentId: 'excl',
                    actions: [{ action: 'incubate', duration: '10 min' }],
                  }),
                },
              }],
            },
          },],
        };
      }),
    };
    await compileFromSmallLlm({ prompt: 'incubate 10 minutes', llmClient: llm as never });

    expect(capturedSystem).toContain('OUTPUT ONLY YAML');
    const vocab = defaultScientistIntentVocabulary();
    for (const verb of vocab.verbs()) {
      expect(capturedSystem, `verb ${verb}`).toContain(verb);
    }
    // The block is the generated one (same renderer as the vocabulary API).
    expect(capturedSystem).toContain(vocab.promptVerbBlock());
    // No line-DSL / shorthand surface in the prompt.
    expect(capturedSystem).not.toMatch(/line-dsl|shorthand|->|=>/);
  });

  it('no parser module for any other grammar exists in the scientistIntent dir (bait 11)', () => {
    const dir = join(process.cwd(), 'src', 'compiler', 'scientistIntent');
    const files = readdirSync(dir, { recursive: true })
      .filter((f): f is string => typeof f === 'string' && f.endsWith('.ts') && !f.includes('.test.'));
    for (const file of files) {
      const text = readFileSync(join(dir, file), 'utf-8');
      expect(text, file).not.toMatch(/\bspawn\b|line-dsl|shorthand/i);
    }
  });
});
