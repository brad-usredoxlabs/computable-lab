/**
 * SHORTHAND-COMP-2 Task 11 (RED-first): no prompt in the repo may teach a
 * document shape the wire schema REJECTS.
 *
 * The hole this closes: vocabularyMirrorDrift.test.ts (d)/(e) set-diff only the
 * ALLOWED ACTIONS verb blocks — never the SHAPE — which is how intentCompile.ts
 * could teach verb-as-map-key (`- add_material:` + "NEVER write a literal
 * 'action:'") while the registry mirror and the wire schema taught/required
 * `action:`. The map-key form is an accepted INPUT (the lift absorbs it —
 * pinned at scientistIntent.test.ts:308 and re-pinned here), but it is NEVER
 * TAUGHT: a taught shape must pass the strict Ajv door, because the model
 * copies what the prompt shows it.
 *
 * Method: extract the YAML example each prompt teaches (headless system prompt,
 * registry template, repair prompt, tool-def description), normalize the
 * placeholder tokens, and feed EACH through parseScientistIntent (strict).
 * Then pin the alias door: the map-key shape still parses through
 * parseShorthandForChat (the lift), and a fabricated verb still does not.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { describe, expect, it } from 'vitest';
import { INTENT_COMPILE_SYSTEM_PROMPT } from './intentCompile.js';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { parseScientistIntent } from './parseScientistIntent.js';
import { parseShorthandForChat } from '../../ai/shorthandChat.js';
import { malformedShorthandRepairPrompt } from '../../ai/shorthandChat.js';
import { ScientistIntentValidationError } from './parseScientistIntent.js';
import { AGENT_INTENT_TOOL_DEF } from '../../ai/submitSuggestionTool.js';

const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);

/** Replace the prompts' placeholder tokens with schema-valid stand-ins. */
function normalizePlaceholders(text: string): string {
  const vocab = defaultScientistIntentVocabulary();
  return text
    .replace(/<short id>/g, 'parity')
    .replace(/<one of the verbs below>/g, vocab.verbs()[0]!)
    .replace(/^\s*<parameters>\s*\n/gm, '')
    .replace(/<thing you could not commit to>/g, 'parity thing')
    .replace(/<why>/g, 'parity reason');
}

/** The TOP-LEVEL SHAPE YAML block a prompt teaches. */
function taughtShape(promptText: string): string {
  const m = promptText.match(/TOP-LEVEL SHAPE[^\n]*\n([\s\S]*?)\n\n/);
  if (!m) throw new Error('no TOP-LEVEL SHAPE block found in the taught prompt');
  return m[1]!;
}

/** The canonical example block the repair prompt carries. */
function repairPromptExample(): string {
  const prompt = malformedShorthandRepairPrompt(
    new ScientistIntentValidationError('probe', []),
    'intentId: x\nactions: []\n',
  );
  const m = prompt.match(/The shape the schema accepts[^\n]*\n(intentId:[\s\S]*?)\nACTIONS /);
  if (!m) throw new Error('no canonical example found in the repair prompt');
  return m[1]!;
}

/** The example block the tool-def shorthand description carries. */
function toolDefExample(): string {
  const desc = (AGENT_INTENT_TOOL_DEF.function.parameters as {
    properties: { shorthand?: { description?: string } };
  }).properties.shorthand?.description ?? '';
  const m = desc.match(/The document shape the schema accepts[^\n]*\n(intentId:[\s\S]*?)\n\nACTIONS /);
  if (!m) throw new Error('no example found in the tool-def shorthand description');
  return m[1]!;
}

describe('prompt shape parity — every taught shape parses (strict Ajv)', () => {
  const registryContent = (parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string }).content;

  const taught: Array<[string, string]> = [
    ['headless system prompt (intentCompile.ts)', taughtShape(INTENT_COMPILE_SYSTEM_PROMPT)],
    ['registry template (intent.compile.system.yaml)', taughtShape(registryContent)],
    ['repair prompt (malformedShorthandRepairPrompt)', repairPromptExample()],
    ['tool def (AGENT_INTENT_TOOL_DEF shorthand description)', toolDefExample()],
  ];

  it.each(taught)('%s teaches a shape the wire schema ACCEPTS (strict door)', (_name, example) => {
    const doc = normalizePlaceholders(example);
    expect(() => parseScientistIntent(doc)).not.toThrow();
  });

  it('every taught shape carries the `action:` key (the ONE taught shape — verb is the VALUE)', () => {
    for (const [name, example] of taught) {
      expect(example, name).toMatch(/- action:/);
    }
    // The headless prompt no longer forbids the key the schema requires.
    expect(INTENT_COMPILE_SYSTEM_PROMPT).not.toMatch(/NEVER write a literal 'action:'/);
  });

  it('the map-key alias shape is still ACCEPTED as input through the lift (never taught, never rejected)', () => {
    const mapKeyDoc = 'intentId: alias\nactions:\n  - add_material:\n      material: "Lysis Solution"\n      volume_ul: "550"\n';
    const doc = parseShorthandForChat(mapKeyDoc);
    expect(doc.actions[0]!.action).toBe('add_material');
    // verb: alias too (probe P4 semantics on the lifted path).
    const verbKeyDoc = 'intentId: alias\nactions:\n  - verb: transfer\n    source: block\n    target: plate\n';
    expect(parseShorthandForChat(verbKeyDoc).actions[0]!.action).toBe('transfer');
  });

  it('the lift never launders a fabricated verb (the strict door stays the authority)', () => {
    expect(() => parseShorthandForChat('intentId: x\nactions:\n  - action: seed_cells\n')).toThrow(ScientistIntentValidationError);
  });
});
