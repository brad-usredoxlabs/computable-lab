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
 *  8. companion characterization: the SAME shape WITH a hedge bars — proving
 *     the hedge (not the engine) is what manufactures the wall.
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
import { defaultScientistIntentVocabulary } from './vocabulary.js';
import { createResolveSpineFromContext } from '../../resolve/ResolveSpine.js';

const REGISTRY_TEMPLATE_PATH = join(
  process.cwd(), 'schema', 'registry', 'prompt-templates', 'intent.compile.system.yaml',
);

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

  it('RED pin: the generated prompt FORBIDS hedging the absence of an OPTIONAL parameter', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/NEVER hedge the absence of a parameter[^\n]*marks OPTIONAL/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/omit the field/);
  });

  it('RED pin: the generated prompt mandates actionLocation + exact label + not-stated reason', () => {
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/actionLocation[^\n]*actionIndex[^\n]*action[^\n]*argument/);
    expect(INTENT_COMPILE_SYSTEM_PROMPT).toMatch(/EXACTLY the scientist's own/);
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

  it('RED pin: the mirror carries the optional-hedge prohibition', () => {
    expect(mirror).toMatch(/NEVER hedge the absence of a parameter[^\n]*marks OPTIONAL/);
    expect(mirror).toMatch(/omit the field/);
  });

  it('RED pin: the mirror carries the actionLocation mandate + not-stated reason', () => {
    expect(mirror).toMatch(/actionLocation[^\n]*actionIndex[^\n]*action[^\n]*argument/);
    expect(mirror).toMatch(/EXACTLY the scientist's own/);
    expect(mirror).toMatch(/not-stated/);
  });

  it('mirror anti-fabrication core stays byte-present', () => {
    expect(mirror).toContain('instead of inventing');
    // YAML block-scalar folding keeps this rule wrapped across lines; both
    // fragments must stay byte-present.
    expect(mirror).toContain('Do NOT add wells or volumes the');
    expect(mirror).toContain('scientist did not state.');
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
    // Same authority as promptVerbBlock(): the block reads vocab.verbs()/
    // argContracts(), so a vocabulary without a verb has no line for it.
    const fixtureVocab = defaultScientistIntentVocabulary(); // shipped instance (cache identity)
    const fixturePrompt = intentCompileSystemPrompt(fixtureVocab);
    for (const verb of fixtureVocab.verbs()) {
      expect(argContractLines(fixturePrompt).some((l) => l.startsWith(`- ${verb}`)), verb).toBe(true);
    }
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

  it('companion characterization: the SAME shape WITH a hedge bars — the hedge, not the engine, manufactures the wall', async () => {
    const hedge = [{
      label: 'duration',
      reason: 'not-stated',
      actionLocation: { actionIndex: 0, action: 'bead_beat', argument: 'duration' },
    }];
    const { compile } = await compileWithFakeLlm(BEAD_ACTIONS_NO_OPTIONALS, hedge);
    // A kept model hedge is a clarification/gap: outcome is NOT complete.
    expect(compile.outcome).not.toBe('complete');
    expect(compile.clarifications.length).toBeGreaterThan(0);
  });
});
