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
 * 12,000 chars is a STARTER. Method for finding the real number: lower it in
 * 2,000-char steps while the acceptance sentence (Phase 4: draftFriction.test.ts)
 * still yields one acceptable draft for the target model; when it stops, back off
 * one step and set that as the budget.
 */
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SUBMIT_SUGGESTION_INSTRUCTION, SUBMIT_SUGGESTION_TOOL_DEF } from './submitSuggestionTool.js';

const CORE_BUDGET_CHARS = 12_000;

/** The repo root, so the test reads the REAL prompt files. */
const REPO_ROOT = resolve(__dirname, '../../..');

describe('the draft prompt stays small enough for a small model', () => {
  it('core instruction + templates + tool schema fit the budget', () => {
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
        `instruction ${SUBMIT_SUGGESTION_INSTRUCTION.length} + schema ${schema.length}) — budget ${CORE_BUDGET_CHARS}`,
    );
    expect(total).toBeLessThan(CORE_BUDGET_CHARS);
  });
});
