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
import { parseShorthandForChat, compileShorthandDeterministically } from '../../ai/shorthandChat.js';
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
    .replace(/<the scientist's own word for the thing you could not commit to>/g, 'parity thing')
    .replace(/<thing you could not commit to>/g, 'parity thing')
    .replace(/<not-stated \| ambiguous \| contradicts-the-text>/g, 'not-stated')
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

/**
 * SHORTHAND-COMP-2 Task 13 (headless equivalent of the task-list's "one-shot
 * shape acceptance on the corpus-frozen goldens"): Brad's two run-chat prompts,
 * written AS the ONE taught `action:` shape, must clear the chat parse door and
 * the deterministic compile with NO shape complaint — no validation throw, no
 * re-ask, and every clarification the compile raises is a NOUN bar carrying an
 * actionLocation (composition CONTENT is SHORTHAND-COMP-3's business; SHAPE
 * validity is this item's).
 */
describe('one-shot shape acceptance on both Brad prompts (headless)', () => {
  // Prompt 1: "Add 50uL of 50% Thermo trypsin-EDTA / 50% Thermo DMEM with 10%
  // FBS containing 200 HepG2 cells per uL to each well."
  const PROMPT1_DOC = `intentId: add-trypsin-dmem-fbs-hepg2
actions:
  - action: add_material
    labware: plate
    material: "HepG2 cells in Thermo trypsin-EDTA / Thermo DMEM + FBS"
    volumeUl: 50
    targetWells: [A1]
    params:
      composition:
        - { material: "Thermo trypsin-EDTA", role: other, fraction: "50%" }
        - { material: "Thermo DMEM", role: buffer_component, fraction: "50%" }
        - { material: "Thermo FBS", role: additive, fraction: "10%" }
        - material: "HepG2 cells"
          role: cells
          quantity: { value: 10000, unit: cells, dimension: count }
`;

  // Prompt 2: "…200 HepG2 cells per uL. I need to seed each well with 10,000
  // HepG2 cells."
  const PROMPT2_DOC = `intentId: seed-hepg2-10000-cells-per-well
actions:
  - action: seed
    labware: plate
    material: "HepG2 cell suspension"
    volumeUl: 50
    targetWells: [A1]
    params:
      quantity: { value: 10000, unit: cells, dimension: count }
      counter_density: { numerator: { value: 200, unit: cells, dimension: count }, denominator: { value: 1, unit: uL, dimension: volume } }
`;

  const mockStore = () => ({
    get: async () => null,
    getRecord: async () => null,
    list: async () => [],
  });

  it.each([
    ['prompt 1 (the 50uL mixture)', PROMPT1_DOC],
    ['prompt 2 (seed 10,000 cells)', PROMPT2_DOC],
  ] as const)('%s parses on the FIRST pass — no shape rejection, no re-ask', async (_name, doc) => {
    const parsed = parseShorthandForChat(doc);
    expect(parsed.actions.length).toBeGreaterThan(0);
    // params (and therefore the composition/quantity content) survived the door.
    expect((parsed.actions[0] as unknown as Record<string, unknown>).params).toBeDefined();

    const compiled = await compileShorthandDeterministically(parsed, { store: mockStore() as never });
    expect(compiled).not.toBeNull();
    const result = compiled!;
    // No compile error, and every bar is a NOUN bar with an actionLocation —
    // nothing in the pipeline complains about the SHAPE.
    expect(result.outcome).not.toBe('error');
    for (const fact of result.clarifications) {
      expect(fact.actionLocation, `shape-class clarification raised: ${fact.reason}`).toBeDefined();
    }
  });
});
