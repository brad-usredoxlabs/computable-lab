// @vitest-environment node
/**
 * L2-JOURNEY-HUMANTASK-1 (unit htcdispose3): apply a human task's DECLARED
 * `on_cancel` / `on_defer` as ONE pure decision. RED-first: (a,b) cancel ->
 * cancelled / journey continues or ends; (c,d) defer -> deferred / continues
 * or ends; (e) a committed receipt makes the disposition REFUSED with no
 * status (anti-partial-record); (f) an undeclared disposition is refused,
 * naming it; (g) an absent on_cancel is refused, never defaulted; (h) the
 * declared dispositions are total, one status each.
 */
import { describe, expect, it } from 'vitest';
import type { HumanTaskReceipt } from './humanTaskCompletion.js';
import {
  decideHumanTaskDisposition,
  DECLARED_JOURNEY_DISPOSITIONS,
  RULE_HUMAN_TASK_DISPOSITION_AFTER_COMPLETION,
  RULE_HUMAN_TASK_DISPOSITION_UNDECLARED,
} from './humanTaskDisposition.js';

/** Contract fragment the decision reads; only the two lifecycle keys matter. */
function contract(overrides: Record<string, unknown> = {}): unknown {
  return { on_cancel: 'keep_journey_active', on_defer: 'end_journey', ...overrides };
}

/** A real committed receipt value — built with unit 2's type, no stub cast. */
const RECEIPT: HumanTaskReceipt = {
  kind: 'human-task-receipt',
  task_id: 'HT-1',
  record_id: 'REC-COLLECTION-1',
  member_refs: [{ record_id: 'REC-A', revision_id: 'REV-A' }],
  completed_at: '2026-11-13T06:00:00.000Z',
  schema_id: 'https://computable-lab.com/schema/computable-lab/collection.schema.yaml',
};

describe('decideHumanTaskDisposition', () => {
  it('(a) cancel with on_cancel keep_journey_active cancels and keeps the journey active', () => {
    const out = decideHumanTaskDisposition({ task_id: 'HT-1', disposition: 'cancel', contract: contract() });
    expect(out).toEqual({ ok: true, task_status: 'cancelled', journey_continues: true });
  });

  it('(b) cancel with on_cancel end_journey ends the journey', () => {
    const out = decideHumanTaskDisposition({
      task_id: 'HT-1', disposition: 'cancel', contract: contract({ on_cancel: 'end_journey' }),
    });
    expect(out).toEqual({ ok: true, task_status: 'cancelled', journey_continues: false });
  });

  it('(c) defer with on_defer keep_journey_active defers and keeps the journey active', () => {
    const out = decideHumanTaskDisposition({
      task_id: 'HT-1', disposition: 'defer', contract: contract({ on_defer: 'keep_journey_active' }),
    });
    expect(out).toEqual({ ok: true, task_status: 'deferred', journey_continues: true });
  });

  it('(d) defer with on_defer end_journey ends the journey', () => {
    const out = decideHumanTaskDisposition({ task_id: 'HT-1', disposition: 'defer', contract: contract() });
    expect(out).toEqual({ ok: true, task_status: 'deferred', journey_continues: false });
  });

  it('(e) a task carrying a completion receipt is refused with no status', () => {
    const out = decideHumanTaskDisposition({
      task_id: 'HT-1', disposition: 'cancel', contract: contract(), receipt: RECEIPT,
    });
    expect(out.ok).toBe(false);
    expect(out).toMatchObject({
      diagnostics: [{ rule: RULE_HUMAN_TASK_DISPOSITION_AFTER_COMPLETION, task_id: 'HT-1' }],
    });
    expect('task_status' in out).toBe(false);
  });

  it('(f) an undeclared disposition value is refused, naming the value', () => {
    const out = decideHumanTaskDisposition({
      task_id: 'HT-1', disposition: 'resume' as 'cancel', contract: contract(),
    });
    if (out.ok) throw new Error('unreachable');
    expect(out.diagnostics).toHaveLength(1);
    expect(out.diagnostics[0]?.rule).toBe(RULE_HUMAN_TASK_DISPOSITION_UNDECLARED);
    expect(out.diagnostics[0]?.message).toContain("'resume'");
    expect('task_status' in out).toBe(false);
  });

  it('(g) an absent on_cancel key is refused, never defaulted to continuing', () => {
    const out = decideHumanTaskDisposition({
      task_id: 'HT-1', disposition: 'cancel', contract: { on_defer: 'keep_journey_active' },
    });
    if (out.ok) throw new Error('unreachable');
    expect(out.diagnostics[0]?.rule).toBe(RULE_HUMAN_TASK_DISPOSITION_UNDECLARED);
    expect('task_status' in out).toBe(false);
  });

  it('(h) the declared dispositions are total: each yields its own status', () => {
    const statuses = DECLARED_JOURNEY_DISPOSITIONS.map((disposition) => {
      const out = decideHumanTaskDisposition({ task_id: 'HT-1', disposition, contract: contract() });
      if (!out.ok) throw new Error(`unexpected refusal for ${disposition}`);
      return out.task_status;
    });
    expect(statuses).toEqual(['cancelled', 'deferred']);
  });
});
