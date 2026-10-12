/**
 * scientist-intent-vocabulary.mirror-drift — the shipped vocabulary vs every
 * remaining mirror copy, as SET DIFFS (never lengths — SPINE-1 bait 4/7).
 *
 * Copies checked (removing ANY from this list is a review fail):
 *  (a) types.ts ScientistIntentActionKind union literals (source-text extraction)
 *  (b) wire-schema enum (schema/workflow/scientist-intent.schema.yaml, yaml-parsed)
 *  (c) tool-schema enum (buildScientistIntentToolSchema() output)
 *  (d) the system prompt's ALLOWED ACTIONS block (intentCompile.ts)
 *  (e) registry template verb block (schema/registry/prompt-templates/intent.compile.system.yaml)
 *
 * Every diff must be EMPTY in BOTH directions; (a)(b) additionally pin
 * declaration order against fixtures/verb-inventory.yaml.
 *
 * Mutation leg (test-the-test): a temp copy of the wire-schema text with one
 * verb removed makes the diff assertion go RED.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { buildScientistIntentToolSchema, INTENT_COMPILE_SYSTEM_PROMPT } from './intentCompile.js';

const WIRE_SCHEMA_PATH = join(process.cwd(), 'schema', 'workflow', 'scientist-intent.schema.yaml');
const TYPES_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'types.ts');
const INTENT_COMPILE_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'intentCompile.ts');
const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);
const INVENTORY_PATH = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures', 'verb-inventory.yaml');

/** (a) types.ts union literals, declaration order (SPINE-1's extraction method). */
export function unionVerbsFromSource(src: string): string[] {
  const m = src.match(/export type ScientistIntentActionKind =\s*([\s\S]*?);\n/);
  return m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
}

/** (b) wire-schema $defs/actionVerb enum from schema TEXT (mutation-leg friendly). */
export function wireEnumFromText(text: string): string[] {
  const doc = parseYaml(text) as Record<string, unknown>;
  const defs = doc.$defs as Record<string, unknown>;
  return (defs.actionVerb as { enum: string[] }).enum;
}

/** (c) tool-schema action enum from buildScientistIntentToolSchema() output. */
export function toolEnumFromSchema(schema: Record<string, unknown>): string[] {
  const props = schema.properties as Record<string, unknown>;
  const items = (props.actions as Record<string, unknown>).items as Record<string, unknown>;
  const action = (items.properties as Record<string, unknown>).action as Record<string, unknown>;
  return action.enum as string[];
}

/** (d)/(e) ALLOWED ACTIONS verb tokens from a prompt text. */
export function promptBlockVerbs(text: string): string[] {
  const m = text.match(/ALLOWED ACTIONS[^\n]*\n([\s\S]*?)\n\s*\n/);
  if (!m) return [];
  return m[1].split('\n').flatMap((line) => line.split('|')).map((t) => t.trim()).filter((t) => t.length > 0);
}

function diffSets(a: readonly string[], b: readonly string[]): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((v) => !setB.has(v)),
    onlyB: b.filter((v) => !setA.has(v)),
  };
}

describe('scientist-intent-vocabulary.mirror-drift', () => {
  const vocab = defaultScientistIntentVocabulary();
  const inventory = (parseYaml(readFileSync(INVENTORY_PATH, 'utf-8')) as { verbs: string[] }).verbs;

  it('vocabulary == (a) types.ts union — set diff empty BOTH directions, order pinned', () => {
    const union = unionVerbsFromSource(readFileSync(TYPES_PATH, 'utf-8'));
    const d = diffSets(vocab.verbs(), union);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
    expect(union).toEqual(inventory); // declaration order (bait 10)
  });

  it('vocabulary == (b) wire-schema enum — set diff empty BOTH directions, order pinned', () => {
    const wire = wireEnumFromText(readFileSync(WIRE_SCHEMA_PATH, 'utf-8'));
    const d = diffSets(vocab.verbs(), wire);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
    expect(wire).toEqual(inventory);
  });

  it('vocabulary == (c) tool-schema enum — set diff empty BOTH directions', () => {
    const tool = toolEnumFromSchema(buildScientistIntentToolSchema());
    const d = diffSets(vocab.verbs(), tool);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
  });

  it('vocabulary == (d) system-prompt ALLOWED ACTIONS block — set diff empty BOTH directions', () => {
    const block = promptBlockVerbs(INTENT_COMPILE_SYSTEM_PROMPT);
    const d = diffSets(vocab.verbs(), block);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
  });

  it('vocabulary == (e) registry template verb block — set diff empty BOTH directions', () => {
    const registry = parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string };
    const block = promptBlockVerbs(registry.content);
    const d = diffSets(vocab.verbs(), block);
    expect(d.onlyA).toEqual([]);
    expect(d.onlyB).toEqual([]);
  });

  it('MUTATION LEG: a stale mirror (one verb removed from the wire-schema text) makes the diff go RED', () => {
    const shippedText = readFileSync(WIRE_SCHEMA_PATH, 'utf-8');
    const staleText = shippedText.replace('    - pellet\n', '');
    expect(staleText).not.toBe(shippedText); // the mutation applied
    const staleEnum = wireEnumFromText(staleText);
    const d = diffSets(vocab.verbs(), staleEnum);
    // The diff assertion that the GREEN legs use would FAIL here:
    expect(d.onlyA).toEqual(['pellet']); // vocabulary has it, stale mirror does not
    expect(d.onlyB).toEqual([]);
    // And the order pin would trip too (length 30 != 31).
    expect(staleEnum).not.toEqual(inventory);
  });
});
