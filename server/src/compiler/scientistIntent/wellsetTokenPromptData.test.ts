/**
 * L2-LABSTATE-CONTENTS-1 FIX RUN 2 (RED-first) — the wellset-token TEACHING
 * lives in the VOCABULARY DATA and is rendered by the ONE contract renderer
 * every live producer site already reads.
 *
 * REPOINTED from L2-WELLSET-TOKEN-EMIT-1 (this file's previous pin, WEM-1
 * 7400c5b6): WEM-1 taught the token in the registry template's PARAMETERS
 * region — a region the drift gate does not cover, that the live chat path
 * never reads, and whose generated headless twin never received the line (a
 * mirror that lies about its generated source). Architect ruling
 * decisions/LABSTATE-TOKENSITE-gate-l2t2355-ruling.md Q1/Q4 (Brad-approved
 * option A): the teaching's ONE data home is the vocabulary's OPTIONAL
 * per-arg `teaching:` annotation on the kind:wellset carrier, rendered
 * generically by contractBlock() — the same generated block the forced-draft
 * instruction (AgentOrchestrator.ts), the agent_intent tool def `shorthand`
 * description (submitSuggestionTool.ts) and the malformed-shorthand repair
 * prompt (shorthandChat.ts) already embed. The WEM-1 PARAMETERS hunk is
 * REVERTED; the mutation leg is PRESERVED (rebased onto the new home).
 *
 * Pins (all derived from vocabulary DATA — zero verb names, zero token
 * literals in this file, set/structural assertions only):
 *  1. the token list stays single-homed in wellsetValueTokens (unchanged);
 *  2. every kind:wellset arg declares a `teaching` string, and the teaching
 *     text NEVER re-lists a token literal (one authority for the token value;
 *     the renderer composes it from the data list);
 *  3. contractBlock() renders the teaching as an extra indented line under
 *     the verb line, carrying every declared token (the kind-driven token
 *     render) — derived from vocab.argContracts()/wellsetValueTokens();
 *  4. the meta-schema admits `teaching`: a schema copy WITHOUT the key (the
 *     pre-change meta) REJECTS a data copy carrying it (the fixture-mutation
 *     idiom — the meta change is load-bearing, not decorative);
 *  5. MUTATION LEG (test-the-test): stripping the `teaching` field from a
 *     temp vocabulary copy makes the teaching line DISAPPEAR from
 *     contractBlock() (the render is keyed off the FIELD's presence, not a
 *     verb or arg name);
 *  6. SINGLE-HOME GUARD: the reverted registry template carries ZERO
 *     declared-token literals (the WEM-1 hunk stays reverted; no second home
 *     may silently reappear).
 */
import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  defaultScientistIntentVocabulary,
  loadScientistIntentVocabulary,
  VOCABULARY_DATA_FILE,
  VOCABULARY_SCHEMA_FILE,
  VOCABULARY_LINT_FILE,
} from './vocabulary.js';

const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);
const VOCAB_DIR = join(process.cwd(), 'schema', 'scientist-intent');

/** The registry template's prompt text, yaml-parsed (the WEM-1 mirror pin's
 *  load idiom — reused here for the SINGLE-HOME guard only). */
function templateContent(): string {
  return (parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string }).content;
}

/** Every (verb, arg) pair whose declared KIND is wellset — found GENERICALLY
 *  through argContracts(), never through a verb-name or arg-name lookup. */
function wellsetArgContracts(vocab = defaultScientistIntentVocabulary()) {
  const found: Array<{ verb: string; arg: ReturnType<typeof vocab.argContracts>[number] }> = [];
  for (const verb of vocab.verbs()) {
    for (const arg of vocab.argContracts(verb)) {
      if (arg.kind === 'wellset') found.push({ verb, arg });
    }
  }
  return found;
}

/** The indented teaching line contractBlock() renders for one arg (derived,
 *  never typed out): the line keyed by `<argName>: ` after the verb line. */
function teachingLine(block: string, argName: string): string | undefined {
  return block.split('\n').find((l) => l.startsWith('  ') && l.slice(2).startsWith(`${argName}: `));
}

describe('LABSTATE-CONTENTS-1 fix run 2 — the wellset teaching is vocabulary DATA rendered by contractBlock', () => {
  const vocab = defaultScientistIntentVocabulary();
  const tokens = vocab.wellsetValueTokens();
  const wellsetArgs = wellsetArgContracts();

  it('the token list stays single-homed in wellsetValueTokens (the DATA home is intact)', () => {
    expect(tokens.length).toBeGreaterThan(0);
    for (const t of tokens) expect(typeof t).toBe('string');
  });

  it('EVERY kind:wellset arg declares a teaching string, and the teaching NEVER re-lists a token literal (one authority for the token value)', () => {
    expect(wellsetArgs.length).toBeGreaterThan(0); // the generic hunt found the carriers
    for (const { verb, arg } of wellsetArgs) {
      expect(typeof arg.teaching, `${verb}.${arg.name} declares teaching`).toBe('string');
      const teaching = arg.teaching ?? '';
      expect(teaching.length).toBeGreaterThan(0);
      // The teaching's CONTRACT (ruling Q1): a contents-derived phrase maps
      // to the declared token (never a literal well list) and labware is
      // omitted unless the scientist names it.
      expect(teaching, `${verb}.${arg.name} teaches the anti-list discipline`).toMatch(/never/i);
      expect(teaching, `${verb}.${arg.name} names the literal-list failure`).toMatch(/literal well (list|range)/i);
      expect(teaching, `${verb}.${arg.name} teaches the labware-omission clause`).toMatch(/labware/i);
      // The teaching references the token generically — the VALUE stays in
      // wellsetValueTokens (a second authority would drift).
      for (const token of tokens) {
        expect(teaching, `${verb}.${arg.name} teaching must not re-list token "${token}"`).not.toContain(token);
      }
    }
  });

  it('contractBlock() renders one indented teaching line per teaching arg, carrying every declared token (the kind-driven token render, derived from DATA)', () => {
    const block = vocab.contractBlock();
    for (const { verb, arg } of wellsetArgs) {
      const lines = block.split('\n');
      const verbIdx = lines.findIndex((l) => l.startsWith(`- ${verb}`));
      expect(verbIdx, `verb line for ${verb}`).toBeGreaterThanOrEqual(0);
      const line = teachingLine(block, arg.name);
      expect(line, `teaching line for ${verb}.${arg.name}`).toBeDefined();
      // The teaching line sits UNDER the verb line (declaration order).
      expect(lines.indexOf(line!)).toBeGreaterThan(verbIdx);
      // The line carries the declared teaching text...
      expect(line).toContain(arg.teaching);
      // ...and, kind-driven, EVERY declared token (membership stays in the
      // data list — the renderer composes them in, zero literals in TS).
      for (const token of tokens) expect(line, `teaching line carries token "${token}"`).toContain(token);
    }
    // A verb with NO teaching arg renders NO extra line (the block grows only
    // where the DATA declares teaching): verb-line count still == verb count.
    const verbLines = block.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(verbLines).toBe(vocab.verbs().length);
  });

  it('the meta-schema ADMITS teaching — and the PRE-CHANGE meta (key removed) REJECTS the shipped doc (the meta change is load-bearing)', () => {
    // Pre-change meta copy: strip `teaching:` from the arg-item properties
    // (additionalProperties:false / unevaluatedProperties:false then reject the
    // shipped data — proving vocabulary.ts's read rides a sanctioned slot).
    const dir = join(tmpdir(), `vocab-teaching-meta-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      const shippedData = readFileSync(join(VOCAB_DIR, VOCABULARY_DATA_FILE), 'utf-8');
      const shippedMeta = readFileSync(join(VOCAB_DIR, VOCABULARY_SCHEMA_FILE), 'utf-8');
      const preChangeMeta = shippedMeta.replace(/^([ \t]*)teaching:[^\n]*\n(?:\1[ \t]+.*\n)+/m, '');
      expect(preChangeMeta, 'the meta copy actually lost the teaching key').not.toBe(shippedMeta);
      writeFileSync(join(dir, VOCABULARY_DATA_FILE), shippedData);
      writeFileSync(join(dir, VOCABULARY_SCHEMA_FILE), preChangeMeta);
      copyFileSync(join(VOCAB_DIR, VOCABULARY_LINT_FILE), join(dir, VOCABULARY_LINT_FILE));
      expect(() => loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) }))
        .toThrow(/failed schema validation/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('MUTATION LEG (test-the-test): a vocabulary copy WITHOUT the teaching field renders NO teaching line (the render keys off the FIELD, not a verb or arg name)', () => {
    const dir = join(tmpdir(), `vocab-teaching-stripped-${Date.now()}`);
    mkdirSync(dir, { recursive: true });
    try {
      const shippedData = readFileSync(join(VOCAB_DIR, VOCABULARY_DATA_FILE), 'utf-8');
      const stripped = shippedData.replace(/^([ \t]*)teaching:[^\n]*\n(?:\1[ \t]+.*\n)+/m, '');
      expect(stripped, 'the data copy actually lost the teaching field').not.toBe(shippedData);
      writeFileSync(join(dir, VOCABULARY_DATA_FILE), stripped);
      for (const f of [VOCABULARY_SCHEMA_FILE, VOCABULARY_LINT_FILE]) {
        copyFileSync(join(VOCAB_DIR, f), join(dir, f));
      }
      const strippedVocab = loadScientistIntentVocabulary({ path: join(dir, VOCABULARY_DATA_FILE) });
      const block = strippedVocab.contractBlock();
      for (const { arg } of wellsetArgs) {
        expect(teachingLine(block, arg.name), `stripped copy must render no ${arg.name} teaching line`).toBeUndefined();
      }
      // ...while the verb line itself survives unchanged (the arg contract is
      // still disclosed — only the teaching annotation is gone).
      const base = vocab.contractBlock();
      for (const { verb } of wellsetArgs) {
        const verbLine = (l: string) => l.startsWith(`- ${verb} — `) ? l : '';
        expect(block.split('\n').find(verbLine)).toBe(base.split('\n').find(verbLine));
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('SINGLE-HOME GUARD: the reverted registry template carries ZERO declared-token literals (the WEM-1 PARAMETERS hunk stays reverted)', () => {
    const content = templateContent();
    for (const token of tokens) {
      expect(content, `template must not re-home the token "${token}"`).not.toContain(token);
    }
  });
});
