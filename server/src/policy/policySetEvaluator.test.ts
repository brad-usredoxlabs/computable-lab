// @vitest-environment node
/**
 * L2-JOURNEY-POLICY-1 (unit pseval2): red-first arms for the restrictive
 * policy-set evaluator. Every decision record is validated by the SAME Ajv
 * authority the schema seam uses (one instance, strict, allErrors + formats,
 * mirroring policySetSchema.test.ts:19-30) — no second Ajv, no fixtures.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { evaluatePolicySet, type PolicyAttributes, type PolicySetDoc } from './policySetEvaluator.js';

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/governance');
const load = async (name: string): Promise<Record<string, any>> =>
  parseYaml(await readFile(join(SCHEMA_DIR, name), 'utf8')) as Record<string, any>;

const policySetSchema = await load('policy-set.schema.yaml');
const pdrSchema = await load('policy-decision-record.schema.yaml');

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(policySetSchema);
ajv.addSchema(pdrSchema);
const validateSet = ajv.compile(policySetSchema);
const validatePdr = ajv.compile(pdrSchema);

const NOW = '2026-11-13T05:00:00Z';
const makeSet = (id: string, rules: Record<string, any>[], unclassified = 'deny'): PolicySetDoc =>
  parseYaml(JSON.stringify({
    kind: 'policy-set', id, label: 'lane2 evaluator probe', version: 1,
    effective_from: '2026-11-12T23:00:00Z',
    scope: { lab: 'LAB-0001', project: 'PROJ-0002' },
    rules, defaults: { unclassified }, conflict: { deny_wins: true },
  })) as PolicySetDoc;

const rule = (rule_id: string, match: Record<string, any>, execution: string, extra: Record<string, any> = {}) =>
  ({ rule_id, match, proposal: execution, execution, ...extra });

const ALLOW = rule('R-ALLOW', { record_kind: 'sequence-set' }, 'allow');
const DENY = rule('R-DENY', { record_kind: 'sequence-set' }, 'deny');
const ATTRS: PolicyAttributes = { capability: 'journey.execute-step', record_kind: 'sequence-set' };

describe('policySetEvaluator — deny wins / obligations / regulated sign-off / default / stale', () => {
  it('(a) deny wins: a matching deny beats a matching allow from another set; both rule ids named', () => {
    const allowSet = makeSet('PSET-TEST-ONE', [ALLOW]);
    const denySet = makeSet('PSET-TEST-TWO', [DENY]);
    [allowSet, denySet].forEach((s) => expect(validateSet(s), JSON.stringify(validateSet.errors)).toBe(true));
    const rec = evaluatePolicySet({ sets: [allowSet, denySet], attributes: ATTRS, now: NOW });
    expect(rec.outcome).toBe('blocked');
    expect(rec.matched_rule_ids.sort()).toEqual(['R-ALLOW', 'R-DENY']);
    expect(validatePdr({ ...rec }), JSON.stringify(validatePdr.errors)).toBe(true);
  });

  it('(b) obligations accumulate: union across matching rules, deduped, stable order', () => {
    const set = makeSet('PSET-TEST-ONE', [
      rule('R-A', { record_kind: 'sequence-set' }, 'allow', { obligations: ['record-evidence'] }),
      rule('R-B', { record_kind: 'sequence-set' }, 'allow', { obligations: ['notify-stakeholders', 'record-evidence'] }),
    ], 'allow');
    const rec = evaluatePolicySet({ sets: [set], attributes: ATTRS, now: NOW });
    expect(rec.outcome).toBe('allowed');
    expect(rec.remaining_obligations).toEqual(['record-evidence', 'notify-stakeholders']);
  });

  it('(c) regulated allow signs off: needs-confirmation + declared approver roles, never allowed', () => {
    const set = makeSet('PSET-TEST-ONE', [
      rule('R-REG', { regulated: true }, 'allow', {
        approval: { roles: ['supervisor', 'lab-manager'], approvers: 1, meaning: 'Regulated sign-off.', separation_of_duties: false },
      }),
    ], 'deny');
    expect(validateSet(set), JSON.stringify(validateSet.errors)).toBe(true);
    const rec = evaluatePolicySet({ sets: [set], attributes: { ...ATTRS, regulated: true }, now: NOW });
    expect(rec.outcome).toBe('needs-confirmation');
    expect(rec.remaining_obligations).toEqual(expect.arrayContaining(['supervisor', 'lab-manager']));
    expect(rec.matched_rule_ids).toEqual(['R-REG']);
  });

  it('(d) unclassified default: no match ⇒ configured restrictive default, matched_rule_ids empty', () => {
    const set = makeSet('PSET-TEST-ONE', [rule('R-ENV', { environment: 'lab' }, 'allow')]);
    const rec = evaluatePolicySet({ sets: [set], attributes: { environment: 'nightly-sandbox' }, now: NOW });
    expect(rec.outcome).toBe('blocked');
    expect(rec.matched_rule_ids).toEqual([]);
    expect(rec.policy_set_ref).toEqual({ id: 'PSET-TEST-ONE', version: 1 });
  });

  it('(e) stale inputs force blocked even when a rule would allow', () => {
    const set = makeSet('PSET-TEST-ONE', [rule('R-ALLOW', {}, 'allow')], 'allow');
    const rec = evaluatePolicySet({ sets: [set], attributes: { ...ATTRS, stale_inputs: ['stale-reagent-lot'] }, now: NOW });
    expect(rec.outcome).toBe('blocked');
    expect(rec.remaining_obligations).toContain('stale-reagent-lot');
  });

  it('(f) shipped schema agrees: empty-match default record validates; duplicated rule id fails uniqueItems', () => {
    const set = makeSet('PSET-TEST-ONE', [rule('R-ENV', { environment: 'lab' }, 'allow')]);
    const defaultRec = evaluatePolicySet({ sets: [set], attributes: { environment: 'nightly-sandbox' }, now: NOW });
    expect(validatePdr({ ...defaultRec }), JSON.stringify(validatePdr.errors)).toBe(true);
    const dup = { ...defaultRec, matched_rule_ids: ['R-ENV', 'R-ENV'] };
    expect(validatePdr(dup)).toBe(false);
    expect((validatePdr.errors ?? []).some((e) => e.instancePath === '/matched_rule_ids' && e.keyword === 'uniqueItems')).toBe(true);
  });
});
