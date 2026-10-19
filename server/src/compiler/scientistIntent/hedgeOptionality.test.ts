/**
 * HEDGE-TYPE-1 (RED-first) — the generated emitter hedge rule honors the
 * vocabulary's DECLARED optionality (W28-A5i Q2, verified-by (a)+(b) + the
 * RED string pins).
 *
 * Root cause pinned by the decision: the generated system prompt rule
 * ("If a parameter is ambiguous or missing, put it under unresolved instead
 * of inventing it") makes the model hedge ABSENT OPTIONAL parameters every
 * draw, while the vocabulary declares those args required:false and the
 * engine's own required-argument sweep (resolveNounsPass) exempts exactly
 * that class. Under deterministic emission that manufactures a permanent
 * gate wall: a model unresolved entry becomes an unresolved_ref gap / a kept
 * clarification and flips the compile off 'complete'.
 *
 * This file pins the fix contract at the PROMPT-DATA level (zero engine
 * changes — a resolveNounsPass/resolutionEngine diff is itself the defect):
 *  1. the generated prompt FORBIDS hedging the absence of an OPTIONAL
 *     parameter (omit the field instead);
 *  2. the generated prompt MANDATES actionLocation {actionIndex, action,
 *     argument} + the scientist's exact label + reason 'not-stated' for
 *     stated-but-uncommitted nouns;
 *  3. the anti-fabrication core stays BYTE-present ("instead of inventing
 *     it", "Do not add wells/volumes the scientist did not state.");
 *  4. the old offending rule line is GONE from prompt AND mirror;
 *  5. the generated verb block marks required-vs-optional per arg, GENERATED
 *     from vocabulary.argContracts (assertions iterate vocab data — zero
 *     verb/arg name literals in the test);
 *  6. the registry mirror carries the same posture (lock-step);
 *  7. acceptance (a): a fake-LLM intent whose actions OMIT optional params
 *     with NO unresolved entries compiles outcome 'complete' on the
 *     bead_beat-without-duration/cycles macro shape (characterization: the
 *     engine already tolerates declared-optional absence — the wall was the
 *     emission contract);
 *  8. companion (FLIPPED by PARAM-FOLD-2 / W28-A5k Q3): the SAME shape WITH a
 *     not-stated hedge on an ABSENT declared-optional converges on the
 *     data-compliant outcome — no clarification, no gap, 'complete'. (The old
 *     pin "a hedge bars" characterized the wall W28-A5j ruled a defect.)
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  intentCompileSystemPrompt,
  INTENT_COMPILE_SYSTEM_PROMPT,
  compileFromSmallLlm,
} from './intentCompile.js';
import {
  defaultScientistIntentVocabulary,
  loadScientistIntentVocabulary,
  VOCABULARY_DATA_FILE,
} from './vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/ResolveSpine.js';

const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);
const FIXTURES = join(process.cwd(), 'src', 'compiler', 'scientistIntent', 'fixtures');

function mirrorContent(): string {
  return (parseYaml(readFileSync(REGISTRY_TEMPLATE_PATH, 'utf-8')) as { content: string }).content;
}

/** The generated ARGUMENTS (required-vs-optional) block lines, if present. */
function argContractLines(prompt: string): string[] {
  const m = prompt.match(/ARGUMENTS \([^\n]*\n([\s\S]*?)\n\n/);
  return m ? m[1].split('\n') : [];
}

// ---------------------------------------------------------------------------
// RED string pins: the hedge posture the emitter contract must teach
// ---------------------------------------------------------------------------

describe('hedge-type-1 generated prompt posture (string pins)', () => {
  it('RED pin: the offending blanket rule is GONE from the generated prompt', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).not.toContain(
      'If a parameter is ambiguous or missing, put it under unresolved',
    );
  });

  // FIX RUN (adversarial c1 / D2): the RED pin literals are RESTORED to the
  // strict patterns written at 587423f1 — the product now fits the pinned
  // contract instead of the contract being fitted to the product.
  it('RED pin: the generated prompt FORBIDS hedging the absence of an OPTIONAL parameter', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/NEVER hedge the absence of an OPTIONAL parameter/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/omit the field/);
  });

  it('RED pin: the generated prompt mandates actionLocation + exact label + not-stated reason', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/\{actionIndex:[^\n]*action:[^\n]*argument:/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/EXACTLY the scientist's own word/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/not-stated/);
  });

  it('RED pin: hedging is scoped to STATED-but-uncommitted facts or REQUIRED absences', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/Hedge under unresolved ONLY what the scientist STATED/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/REQUIRED parameter/);
  });

  it('ANTI-FABRICATION CORE stays byte-present (scope WHEN to speak, never WHAT to invent)', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toContain('instead of inventing it');
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toContain('Do not add wells/volumes the scientist did not state.');
  });
});

describe('hedge-type-1 registry mirror lock-step (same posture in the YAML mirror)', () => {
  const mirror = mirrorContent();

  it('RED pin: the offending blanket rule is GONE from the mirror', () => {
    expect(mirror).not.toContain('If any parameter is ambiguous or missing');
  });

  // FIX RUN (adversarial c1 / D2+D3): strict pins restored; the MIRROR is now
  // reflowed/worded so each pinned phrase is contiguous in the parsed block
  // scalar AND byte-identical to the generated prompt (a YAML block scalar
  // PRESERVES the line break when the continuation line is MORE indented than
  // the block base — the old wrapped wording is exactly what forced the
  // fragment split; the reflow removes the cause, not the assertion).
  it('RED pin: the mirror carries the optional-hedge prohibition', () => {
    expect(mirror).toMatch(/NEVER hedge the absence of an OPTIONAL parameter/);
    expect(mirror).toMatch(/omit the field/);
  });

  it('RED pin: the mirror carries the actionLocation mandate + not-stated reason', () => {
    expect(mirror).toMatch(/\{actionIndex:[^\n]*action:[^\n]*argument:/);
    expect(mirror).toMatch(/EXACTLY the scientist's own word/);
    expect(mirror).toMatch(/not-stated/);
  });

  it('mirror anti-fabrication core stays byte-present — IDENTICAL wording to the generated prompt', () => {
    expect(mirror).toContain('instead of inventing it');
    expect(mirror).toContain('Do not add wells/volumes the scientist did not state.');
  });
});

// ---------------------------------------------------------------------------
// Generated required-vs-optional verb block (zero verb/arg name literals:
// every assertion iterates the vocabulary's own declared data)
// ---------------------------------------------------------------------------

describe('hedge-type-1 generated ARGUMENTS block (required-vs-optional from argContracts)', () => {
  const vocab = defaultScientistIntentVocabulary();
  const prompt = intentCompileSystemPrompt(vocab);
  const lines = argContractLines(prompt);

  it('RED pin: the prompt carries a generated ARGUMENTS block', () => {
    expect(lines.length).toBeGreaterThan(0);
    expect(prompt).toMatch(/OPTIONAL/);
    expect(prompt).toMatch(/REQUIRED/);
  });

  it('every declared verb has a block line (SET diff both directions, bait-safe)', () => {
    const blockVerbs = new Set(
      lines.filter((l) => l.startsWith('- ')).map((l) => l.slice(2).split(' — ')[0]!.trim()),
    );
    const enumVerbs = new Set(vocab.verbs());
    expect([...enumVerbs].filter((v) => !blockVerbs.has(v))).toEqual([]);
    expect([...blockVerbs].filter((v) => !enumVerbs.has(v))).toEqual([]);
  });

  it('per-verb args mirror argContracts exactly: required args unmarked, optional args carry ?', () => {
    for (const verb of vocab.verbs()) {
      const line = lines.find((l) => l.startsWith(`- ${verb}`));
      expect(line, `block line for ${verb}`).toBeDefined();
      for (const a of vocab.argContracts(verb)) {
        const rendered = `${a.name}${a.required ? '' : '?'}:${a.kind}${a.domain ? `(${a.domain})` : ''}`;
        expect(line!, `${verb}.${a.name}`).toContain(rendered);
      }
    }
  });

  it('the block is generated from data: a fixture vocabulary minus a verb loses its line (rip-out posture)', () => {
    // FIX RUN (adversarial c1 / D4): REAL mutation leg, mirroring
    // vocabularyMirrorDrift's — the shipped vocabulary HAS a pellet line; the
    // vocab-minus-pellet FIXTURE's generated block does NOT. The block reads
    // vocab.verbs()/argContracts(), so removing the verb from data removes
    // the line with zero TypeScript edits.
    const shipped = defaultScientistIntentVocabulary();
    const fixtureVocab = loadScientistIntentVocabulary({
      path: join(FIXTURES, 'vocab-minus-pellet', VOCABULARY_DATA_FILE),
    });
    expect(fixtureVocab.has('pellet')).toBe(false);

    const shippedLines = argContractLines(intentCompileSystemPrompt(shipped));
    const fixtureLines = argContractLines(intentCompileSystemPrompt(fixtureVocab));
    expect(shippedLines.some((l) => l.startsWith('- pellet'))).toBe(true);
    expect(fixtureLines.some((l) => l.startsWith('- pellet'))).toBe(false);

    // Set diff both directions: fixture block verbs == shipped block verbs minus pellet.
    const blockVerb = (l: string) => l.slice(2).split(' — ')[0]!.trim();
    const shippedVerbs = shippedLines.filter((l) => l.startsWith('- ')).map(blockVerb);
    const fixtureVerbs = fixtureLines.filter((l) => l.startsWith('- ')).map(blockVerb);
    expect(fixtureVerbs).toEqual(shippedVerbs.filter((v) => v !== 'pellet'));
    expect(fixtureVerbs).not.toContain('pellet');
  });
});

// ---------------------------------------------------------------------------
// Acceptance (a): fake-LLM compile on the bead_beat-without-duration/cycles
// macro shape — omit-optional with NO unresolved entries compiles 'complete'
// (characterization: downstream expansion already tolerates declared-optional
// absence; the wall was the emission contract, not the engine).
// ---------------------------------------------------------------------------

const LABWARE_LABEL = 'Microcentrifuge tube';

function singleLabwareStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async () => null),
    list: vi.fn(async (filter?: { kind?: string; schemaId?: string }) => {
      if (filter?.schemaId) return [];
      return [{
        recordId: 'LAB-mct-1',
        schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
        payload: { kind: 'labware', name: LABWARE_LABEL },
        meta: { kind: 'labware' },
      }];
    }),
  };
}

function stubIntentLlm(actions: unknown[], unresolved?: unknown[]) {
  return {
    complete: vi.fn(async () => ({
      choices: [{
        message: {
          content: null,
          tool_calls: [{
            function: {
              name: 'emit_scientist_intent',
              arguments: JSON.stringify({
                intentId: 'bead-beat-no-optional-params',
                actions,
                ...(unresolved ? { unresolved } : {}),
              }),
            },
          }],
        },
      }],
    })),
  };
}

const BEAD_ACTIONS_NO_OPTIONALS = [{ action: 'bead_beat', labware: LABWARE_LABEL }];

async function compileWithFakeLlm(actions: unknown[], unresolved?: unknown[]) {
  const store = singleLabwareStore();
  return compileFromSmallLlm({
    prompt: 'Bead-beat the microcentrifuge tube',
    llmClient: stubIntentLlm(actions, unresolved) as never,
    deps: {
      spine: createResolveSpineFromContext({ store: store as never }) as never,
      searchLabwareByHint: async (h: string) => [{ recordId: 'LAB-mct-1', title: h }],
    },
  });
}

describe('hedge-type-1 acceptance (a): declared-optional absence compiles complete (fake LLM)', () => {
  it('bead_beat WITHOUT duration/cycles and with NO unresolved entries compiles outcome complete', async () => {
    const { intent, compile } = await compileWithFakeLlm(BEAD_ACTIONS_NO_OPTIONALS);

    // The emission omitted the declared-optional args and hedged NOTHING.
    expect(intent.unresolved ?? []).toEqual([]);
    expect(compile.clarifications).toEqual([]);
    expect(compile.outcome).toBe('complete');
    // The macro expanded: bead_beat lowers to a mix event (downstream expansion
    // tolerates the declared-optional absence).
    expect(compile.terminalArtifacts.events.length).toBeGreaterThan(0);
    expect(compile.terminalArtifacts.events.some((e) => e.event_type === 'mix')).toBe(true);
  });

  // FLIP (PARAM-FOLD-2 / W28-A5k Q3): this test's PRE-FOLD pin — "the SAME
  // shape WITH a hedge bars" — characterized the wall W28-A5j ruled a defect.
  // The fold now converges the hedged emission on the data-compliant outcome
  // at BOTH channels (clarifications AND the raw gaps source in normalize):
  // the vocabulary declares the absence legal, so the hedge is moot.
  it('PARAM-FOLD-2 convergence: a not-stated hedge on an absent declared-optional yields the data-compliant outcome — no clarification, no gap, complete', async () => {
    const hedge = [{
      label: 'duration',
      reason: 'not-stated',
      actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'duration' },
    }];
    const { compile } = await compileWithFakeLlm(BEAD_ACTIONS_NO_OPTIONALS, hedge);
    // Emitter-compliance and emitter-violation produce the SAME compile
    // (W28-A5j Q2 convergence, now true on the gaps side too, W28-A5k Q1).
    expect(compile.outcome).toBe('complete');
    expect(compile.clarifications).toEqual([]);
    // No unresolved_ref ghost anywhere: the raw source (normalize) folded it.
    expect(compile.terminalArtifacts.gaps).toEqual([]);
    expect(compile.normalized.unresolvedRefs).toEqual([]);
    expect(compile.terminalArtifacts.protocolIntent?.unresolved ?? []).toEqual([]);
    // The macro still expands: the fold changes the fact's fate, not the events.
    expect(compile.terminalArtifacts.events.length).toBeGreaterThan(0);
    expect(compile.terminalArtifacts.events.some((e) => e.event_type === 'mix')).toBe(true);
  });
});
