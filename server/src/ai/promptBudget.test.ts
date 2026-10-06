/**
 * The draft prompt has a BUDGET, and this test is why.
 *
 * Measured 2026-09-20: a one-sentence request ("add 200uL of DMEM in a
 * checkerboard pattern across wells A2-D8") was preceded by ~67,000 chars of
 * instruction and schema — 9,351–11,572 tokens of prefill for ~10 tokens of
 * intent. A small model cannot sift that; the model's own output then had to pass
 * 13 post-hoc stages that enforce what the prose was asking it to avoid.
 *
 * Brad's ruling: the right size is "the smallest amount that gets it right" —
 * that remains the DIRECTION. Method for finding the real number: lower it in
 * 2,000-char steps while the acceptance sentence (Phase 4: draftFriction.test.ts)
 * still yields one acceptable draft for the target model; when it stops, back off
 * one step and set that as the budget.
 *
 * RATCHET (Brad's 2026-10-06 F2 disposition): this test is no longer a
 * permanently-red tripwire against the retired 12,000 starter — it is a two-way
 * ratchet. The ceiling is the measured prompt size + 5%; bloat beyond the ceiling
 * fails, and a ceiling that has drifted stale-high relative to a shrunk prompt
 * ALSO fails, so the constant only ever moves DOWN, in the same commit as any
 * shrink. Real prompt reduction stays a SEPARATE future snappiness task and must
 * not be smuggled into ratchet commits.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_SUGGESTION_INSTRUCTION, SUBMIT_SUGGESTION_TOOL_DEF } from './submitSuggestionTool.js';

/**
 * RATCHET CEILING — provenance:
 * measured 2026-10-06 at claim-time trunk cl/integration-2 @ cbacebab:
 *   44,934 chars = agent 24,038 + material-rules 3,849 + instruction 3,061 + schema 13,986
 *   (measured by THIS test's own path: the two files under server/prompts/ +
 *    SUBMIT_SUGGESTION_INSTRUCTION + JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF))
 * formula: floor(measured x 1.05) = floor(47180.70) = 47180  (Brad's ratchet: current + 5%)
 * Rule: this number only moves DOWN. Bloat over the ceiling fails; when the measured
 * total shrinks, the stale-high ceiling fails too — lower it in the SAME commit.
 */
const CORE_PROMPT_CEILING_CHARS = 47_180;

/**
 * The ratchet's decision as a pure function, so BOTH directions are unit-testable
 * without touching prompt files. Integer arithmetic only (no floats): the band is
 * [measured, floor(measured x 1.05)] pinned at the ceiling.
 * Returns an actionable violation message, or null when the state is legal.
 */
function ratchetViolation(measured: number, ceiling: number): string | null {
  // Guard 1 (bloat): the prompt may grow only into the recorded slack.
  if (measured > ceiling) {
    return (
      `prompt grew past the ceiling (${measured} > ${ceiling}) — reduce it or, ` +
      `with Brad's sign-off, re-ratchet UP deliberately in a separate decision`
    );
  }
  // Guard 2 (ratchet): the ceiling must stay within 5% of what is actually
  // measured — integer arithmetic (ceiling x 100 <= measured x 105), no floats.
  if (ceiling * 100 <= measured * 105) {
    return null;
  }
  return (
    `prompt shrank (${measured}) — the ceiling ${ceiling} is stale-high; ` +
    `lower CORE_PROMPT_CEILING_CHARS to floor(${measured} x 1.05) in this commit`
  );
}

/** The repo root, so the test reads the REAL prompt files. */
const REPO_ROOT = resolve(__dirname, '../../..');

describe('the ratchet guards (pure helper — both directions)', () => {
  it('bloat +1 over the ceiling is a violation', () => {
    const v = ratchetViolation(47_181, 47_180);
    expect(v).not.toBeNull();
    expect(v).toMatch(/grew past the ceiling/);
  });

  it('bloat far over the ceiling is a violation', () => {
    expect(ratchetViolation(60_000, 47_180)).toMatch(/grew past the ceiling/);
  });

  it('stale-high ceiling after a 1-char shrink is a violation (ceiling-lowering path)', () => {
    // The trunk numbers minus one char: 44,933 x 105 = 4,717,965 < 47,180 x 100.
    const v = ratchetViolation(44_933, 47_180);
    expect(v).not.toBeNull();
    expect(v).toMatch(/lower CORE_PROMPT_CEILING_CHARS/);
  });

  it('measured exactly at the ceiling is clean (equality edge)', () => {
    expect(ratchetViolation(47_180, 47_180)).toBeNull();
  });

  it('the trunk state sits inside the band: clean', () => {
    expect(ratchetViolation(44_934, 47_180)).toBeNull();
  });
});

describe('the draft prompt stays small enough for a small model', () => {
  it('core instruction + templates + tool schema fit the ratchet ceiling', () => {
    // Read the template files directly: this test must not depend on the loader's
    // export, which lives in a file another session is mid-edit on.
    const readPrompt = (name: string): string => {
      const path = resolve(REPO_ROOT, 'server/prompts', name);
      return existsSync(path) ? readFileSync(path, 'utf8') : '';
    };
    const agentTemplate = readPrompt('event-graph-agent.md');
    const materialRules = readPrompt('material-system-rules.md');
    const schema = JSON.stringify(SUBMIT_SUGGESTION_TOOL_DEF);
    const total = agentTemplate.length + materialRules.length + SUBMIT_SUGGESTION_INSTRUCTION.length + schema.length;

    // Printed deliberately: this number is the plan's headline measurement.
    console.log(
      `draft prompt budget: ${total} chars ` +
        `(agent ${agentTemplate.length} + material-rules ${materialRules.length} + ` +
        `instruction ${SUBMIT_SUGGESTION_INSTRUCTION.length} + schema ${schema.length}) — ` +
        `ceiling ${CORE_PROMPT_CEILING_CHARS} (headroom ${CORE_PROMPT_CEILING_CHARS - total})`,
    );

    const violation = ratchetViolation(total, CORE_PROMPT_CEILING_CHARS);
    expect(violation, violation ?? 'ratchet clean').toBeNull();
  });
});
