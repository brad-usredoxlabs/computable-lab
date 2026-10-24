/**
 * MATRES-PANEL fix2/D1+D2 — the two declared mirrors of the spine's
 * MaterialLevel union must equal the union itself, as SET DIFFS (never
 * lengths — vocabularyMirrorDrift idiom).
 *
 * Mirrors checked (removing ANY from this list is a review fail):
 *  (a) server/src/resolve/types.ts MaterialLevel union literals (source-text
 *      extraction — the same method as unionVerbsFromSource in
 *      vocabularyMirrorDrift.test.ts)
 *  (b) the vocabulary meta-schema's arg `level` slot enum
 *      (schema/scientist-intent/scientist-intent-vocabulary.schema.yaml,
 *      yaml-parsed). The schema's OWN description states it "mirrors
 *      server/src/resolve/types.ts MaterialLevel verbatim" and "mirrors the TS
 *      union honestly rather than narrowing to firing values (OQ2
 *      disposition)" — this pin makes that stated contract enforced, so the
 *      TS slot (ScientistIntentArgContract.level?: MaterialLevel) can never
 *      type-permit a level Ajv rejects.
 *  (c) the MCP resolve tool's zod `level` enum
 *      (src/mcp/tools/resolveTool.ts) — the agent's entry point to the same
 *      spine must accept every level the spine carries.
 *
 * Every diff must be EMPTY in BOTH directions. No literal level list appears
 * in this file: both sides are DERIVED from their declaration sites, so the
 * pin itself cannot drift into a fourth copy.
 *
 * Mutation legs (test-the-test): the shipped schema text with 'vendor-product'
 * dropped from the level enum, and the shipped tool text with it dropped from
 * the zod enum, each make the corresponding diff go RED naming vendor-product.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

const TYPES_PATH = join(process.cwd(), 'src', 'resolve', 'types.ts');
const VOCAB_SCHEMA_PATH = join(
  process.cwd(), 'schema', 'scientist-intent', 'scientist-intent-vocabulary.schema.yaml',
);
const RESOLVE_TOOL_PATH = join(process.cwd(), 'src', 'mcp', 'tools', 'resolveTool.ts');

/** (a) types.ts MaterialLevel union literals, declaration order. */
export function materialLevelUnionFromSource(src: string): string[] {
  const m = src.match(/export type MaterialLevel =\s*([^;]+);/);
  return m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]) : [];
}

/** (b) meta-schema verbs[*].args[*].items... level enum from schema TEXT
 *  (mutation-leg friendly: takes the text, not the pre-parsed shipped file). */
export function schemaLevelEnumFromText(text: string): string[] {
  const doc = parseYaml(text) as Record<string, unknown>;
  const verbs = (doc.properties as Record<string, unknown>).verbs as Record<string, unknown>;
  const verbItems = verbs.items as Record<string, unknown>;
  const args = (verbItems.properties as Record<string, unknown>).args as Record<string, unknown>;
  const argItems = args.items as Record<string, unknown>;
  const level = (argItems.properties as Record<string, unknown>).level as Record<string, unknown>;
  return level.enum as string[];
}

/** (c) resolveTool.ts zod `level: z.enum([...])` literals from tool TEXT. */
export function zodLevelEnumFromSource(src: string): string[] {
  const m = src.match(/level:\s*z\s*\.enum\(\[([^\]]*)\]\)/s);
  return m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((x) => x[1]) : [];
}

function diffSets(a: readonly string[], b: readonly string[]): { onlyA: string[]; onlyB: string[] } {
  const setA = new Set(a);
  const setB = new Set(b);
  return {
    onlyA: a.filter((v) => !setB.has(v)),
    onlyB: b.filter((v) => !setA.has(v)),
  };
}

describe('material-level mirror drift (types.ts union vs declared mirrors)', () => {
  const union = materialLevelUnionFromSource(readFileSync(TYPES_PATH, 'utf-8'));

  it('the union extraction is non-vacuous (every declared member present)', () => {
    expect(union.length).toBeGreaterThanOrEqual(5);
  });

  it('meta-schema level enum == MaterialLevel union — set diff empty BOTH directions', () => {
    const schemaEnum = schemaLevelEnumFromText(readFileSync(VOCAB_SCHEMA_PATH, 'utf-8'));
    const d = diffSets(union, schemaEnum);
    expect(d.onlyA, 'levels the TS union carries but the meta-schema enum rejects').toEqual([]);
    expect(d.onlyB, 'levels the meta-schema enum allows but the TS union lacks').toEqual([]);
  });

  it('MCP resolve tool zod level enum == MaterialLevel union — set diff empty BOTH directions', () => {
    const zodEnum = zodLevelEnumFromSource(readFileSync(RESOLVE_TOOL_PATH, 'utf-8'));
    const d = diffSets(union, zodEnum);
    expect(d.onlyA, 'levels the TS union carries but the MCP tool input rejects').toEqual([]);
    expect(d.onlyB, 'levels the MCP tool input accepts but the TS union lacks').toEqual([]);
  });

  it('MUTATION LEG (schema): meta-schema enum missing vendor-product makes the diff go RED naming it', () => {
    const shippedText = readFileSync(VOCAB_SCHEMA_PATH, 'utf-8');
    const staleText = shippedText.replace('aliquot, vendor-product, unknown]', 'aliquot, unknown]');
    expect(staleText).not.toBe(shippedText); // the mutation applied
    const staleEnum = schemaLevelEnumFromText(staleText);
    const d = diffSets(union, staleEnum);
    // The assertion the GREEN leg uses would FAIL here: the union carries the
    // member, the stale enum rejects it.
    expect(d.onlyA).toEqual(['vendor-product']);
    expect(d.onlyB).toEqual([]);
  });

  it('MUTATION LEG (tool): zod enum missing vendor-product makes the diff go RED naming it', () => {
    const shippedText = readFileSync(RESOLVE_TOOL_PATH, 'utf-8');
    const staleText = shippedText.replace("'vendor-product', ", '');
    expect(staleText).not.toBe(shippedText); // the mutation applied
    const staleEnum = zodLevelEnumFromSource(staleText);
    const d = diffSets(union, staleEnum);
    expect(d.onlyA).toEqual(['vendor-product']);
    expect(d.onlyB).toEqual([]);
  });
});
