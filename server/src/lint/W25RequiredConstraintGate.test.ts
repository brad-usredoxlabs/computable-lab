/**
 * W2-5 T2 — required-constraint data-gate (spec §6 T2).
 *
 * Harness COPY of server/src/lint/ProtocolLintRules.test.ts: parse the REAL
 * schema/workflow/protocol.lint.yaml from disk (the same file the server loads
 * at boot via LintSpecLoader) into a LintEngine and lint inline fixture
 * payloads directly — no HTTP.
 *
 * Obligation (§2.3): prove a draft whose payload trips a required-constraint
 * protocol.lint rule yields a refused promotion with THAT rule's id surfaced,
 * against the MERGED W2-3 rule set (step-intent and legacy families). The store-side
 * block (store.create refuses on lint errors at promotion time,
 * RecordStoreImpl.ts:492-504) is proven end-to-end by T1(a)
 * (W25DraftLifecyclePromotion.test.ts arm (a): 422 PROMOTION_LINT_BLOCKED
 * with rule_id legacy-literal-bounded in body.details.lint_findings).
 * W2-5 ADDS NOTHING to protocol.lint.yaml (neighbor's surface).
 */

import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { LintEngine } from './LintEngine.js';
import type { LintSpec } from './types.js';

const PROTOCOL = 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

const PROTOCOL_LINT_PATH = fileURLToPath(
  new URL('../../../schema/workflow/protocol.lint.yaml', import.meta.url),
);

function loadProtocolLintSpec(): LintSpec {
  const parsed = parseYaml(readFileSync(PROTOCOL_LINT_PATH, 'utf-8')) as LintSpec;
  if (typeof parsed.lintVersion !== 'number' || !Array.isArray(parsed.rules)) {
    throw new Error('Invalid lint spec: protocol.lint.yaml');
  }
  return parsed;
}

function protocolEngine(): LintEngine {
  const eng = new LintEngine();
  eng.addSpec('protocol', loadProtocolLintSpec());
  return eng;
}

// Fixtures shaped exactly like what CandidatePromoter mints at promotion:
// the candidate.draft spread + kind/recordId override (CandidatePromoter.ts
// :145-149) — i.e. the payload store.create will lint at promotion time.
function promotedLiteralPayload(): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'CAN-protocol-w25-t2',
    title: 'Literal vendor draft (unresolved: not intent-bearing)',
    roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['plate'] }] },
    steps: [
      { stepId: 'wash-1', label: 'Wash', ordinal: 1, kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 },
    ],
  };
}

function promotedIntentPayload(): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'CAN-protocol-w25-t2-ok',
    title: 'Intent-bearing draft',
    steps: [
      {
        stepId: 'inc-batch',
        label: 'Incubate the batch',
        ordinal: 1,
        kind: 'incubate',
        intent: {
          semanticVerb: { ref: { kind: 'record', type: 'verb-definition', id: 'VERB-INCUBATE' }, canonical: 'incubate' },
          provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w25-demo', pageStart: 1 }],
        },
      },
    ],
  };
}

describe('W2-5 T2: required-constraint gate fires on the promoted payload (lint DATA, merged W2-3 rules)', () => {
  it('the merged legacy-literal-bounded rule FIRES on a literal (non-intent) promoted payload, with rule id + instance path', async () => {
    const eng = protocolEngine();
    const r = await eng.lint(promotedLiteralPayload(), PROTOCOL);
    expect(r.valid).toBe(false);
    const firing = r.violations.filter((x) => x.ruleId === 'legacy-literal-bounded' && x.severity === 'error');
    expect(firing.length).toBeGreaterThanOrEqual(1);
    // Actionable: the message names the record and the offending step ids —
    // this is the finding T1(a) surfaces verbatim in body.details.lint_findings.
    expect(firing[0]!.message).toContain('CAN-protocol-w25-t2');
    expect(firing[0]!.message).toContain('wash-1');
    expect(firing[0]!.message).toContain('intent');
  });

  it('an intent-bearing promoted payload does NOT trip the required-constraint closure (gate is data, not a blanket block)', async () => {
    const eng = protocolEngine();
    const r = await eng.lint(promotedIntentPayload(), PROTOCOL);
    expect(r.violations.filter((x) => x.ruleId === 'legacy-literal-bounded')).toEqual([]);
  });

  it('the gate lives in DATA: protocol.lint.yaml carries the rule; W2-5 authored nothing here', () => {
    const spec = loadProtocolLintSpec();
    const rule = spec.rules.find((r) => r.id === 'legacy-literal-bounded');
    expect(rule, 'merged W2-3 rule must exist in the trunk file').toBeDefined();
    expect(rule!.severity).toBe('error');
  });
});
