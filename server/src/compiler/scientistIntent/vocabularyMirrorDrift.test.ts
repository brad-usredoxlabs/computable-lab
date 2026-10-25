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

/**
 * HEDGE-TYPE-1 fix1/D1: the ARGUMENTS (required-vs-optional) block lines from
 * a prompt text — the generated prompt's block AND the mirror's block extract
 * the same way, so the two can be BYTE-compared line by line. Without this
 * leg, a vocabulary arg-contract change would silently desync the mirror's
 * required-vs-optional marks (the exact contract-vs-data class this item
 * closes, one layer over).
 */
export function argContractBlockLines(text: string): string[] {
  const m = text.match(/ARGUMENTS \([^\n]*\n([\s\S]*?)\n\n/);
  return m ? m[1].split('\n') : [];
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

  // HEDGE-TYPE-1 fix1/D1: the mirror's ARGUMENTS block is ENFORCED, not merely
  // hand-matched. The generated block comes from vocab.verbs()/argContracts();
  // the mirror's copy must be BYTE-identical line-for-line, so a future
  // vocabulary arg-contract change (a renamed arg, a required<->optional flip,
  // a new/removed arg) cannot leave the mirror teaching stale marks.
  it('(f) mirror ARGUMENTS block == generated promptArgContractBlock(vocab) — BYTE-identical line-for-line', () => {
    const registry = parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string };
    const generated = argContractBlockLines(INTENT_COMPILE_SYSTEM_PROMPT);
    const mirror = argContractBlockLines(registry.content);
    expect(generated.length).toBeGreaterThan(0);
    expect(mirror.length).toBe(generated.length);
    const mismatched = generated
      .map((line, i) => ({ i, generated: line, mirror: mirror[i] }))
      .filter((r) => r.generated !== r.mirror);
    expect(mismatched).toEqual([]);
    // And the mirror's own block must still agree with the vocabulary data it
    // claims to mirror (required args unmarked, optional args carry '?').
    for (const verb of vocab.verbs()) {
      const line = mirror.find((l) => l.startsWith(`- ${verb}`));
      expect(line, `mirror ARGUMENTS line for ${verb}`).toBeDefined();
      for (const a of vocab.argContracts(verb)) {
        const rendered = `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${a.domain})` : ''}`;
        expect(line!, `${verb}.${a.name}`).toContain(rendered);
      }
    }
  });

  it('MUTATION LEG (D1): a stale mirror ARGUMENTS line (optional mark flipped) makes the byte-compare go RED', () => {
    const shippedText = readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8');
    // Flip ONE required-vs-optional mark in the mirror's copy of the bead_beat
    // line (duration?:scalar -> duration:scalar) — exactly the desync class a
    // future vocabulary change would produce.
    const staleText = shippedText.replace('- bead_beat — labware?:resolvable(labware), material?:resolvable(material), duration?:scalar', '- bead_beat — labware?:resolvable(labware), material?:resolvable(material), duration:scalar');
    expect(staleText).not.toBe(shippedText); // the mutation applied
    const stale = parseYaml(staleText) as { content: string };
    const generated = argContractBlockLines(INTENT_COMPILE_SYSTEM_PROMPT);
    const mirror = argContractBlockLines(stale.content);
    expect(mirror.length).toBe(generated.length);
    const mismatched = generated
      .map((line, i) => ({ i, generated: line, mirror: mirror[i] }))
      .filter((r) => r.generated !== r.mirror);
    // The byte-compare assertion the GREEN leg uses would FAIL here:
    expect(mismatched.length).toBe(1);
    expect(mismatched[0]!.mirror).toContain('- bead_beat — ');
    expect(mismatched[0]!.mirror).toContain('duration:scalar');
    expect(mismatched[0]!.generated).toContain('duration?:scalar');
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
