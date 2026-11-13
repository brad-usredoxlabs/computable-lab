// @vitest-environment node
/**
 * L2-JOURNEY-POLICY-1 (unit ps-schema): the policy set and the policy decision
 * record are two CLOSED, self-contained schemas whose disposition vocabularies
 * are pinned to the shipped server policy types. Ajv (one instance, strict,
 * allErrors) is the sole authority: a set with no restrictive default, a
 * regulated allow without approval, or a rule matching an AI-supplied field
 * must be rejected BEFORE any evaluator exists.
 *
 * No $ref into common.schema.yaml (relative-ref resolution risk under
 * strict: true in this node test; the common ref is unrelated to this seam).
 * The vocabulary pin imports the SHIPPED types, so a schema-local re-typing of
 * either disposition enum is impossible — change one side and this file goes RED.
 */
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import type { PolicyDecisionDisposition, PolicyDisposition } from '../policy/types.js';

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../schema/governance');
const load = async (name: string): Promise<Record<string, any>> =>
  parseYaml(await readFile(join(SCHEMA_DIR, name), 'utf8')) as Record<string, any>;

const policySetSchema = await load('policy-set.schema.yaml');
const pdrSchema = await load('policy-decision-record.schema.yaml');

const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(policySetSchema);
ajv.addSchema(pdrSchema);
const validateSet = ajv.compile(policySetSchema);
const validatePdr = ajv.compile(pdrSchema);

const errorsFor = (validate: ReturnType<typeof ajv.compile>, doc: unknown) => {
  validate(doc);
  return validate.errors ?? [];
};

/** Valid 2-rule set: one regulated confirm-with-approval, one deny. */
const validSet = (): Record<string, any> => ({
  kind: 'policy-set',
  id: 'PSET-LAB2-ALPHA',
  label: 'Lane 2 journey policy',
  version: 1,
  effective_from: '2026-11-12T23:00:00Z',
  scope: { lab: 'LAB-0001', project: 'PROJ-0002' },
  rules: [
    {
      rule_id: 'R1',
      match: {
        capability: 'journey.execute-step',
        effect_kind: 'domain_mutation',
        record_kind: 'sequence-set',
        regulated: true,
        actor_role: 'run-operator',
        provenance_completeness: 'verified',
        environment: 'production',
      },
      proposal: 'confirm',
      execution: 'confirm',
      approval: {
        roles: ['supervisor', 'lab-manager'],
        approvers: 2,
        meaning: 'Two distinct regulated roles must approve before execution.',
        separation_of_duties: true,
      },
      obligations: ['notify-stakeholders', 'record-evidence'],
      evidence_retention: '90d',
    },
    {
      rule_id: 'R2',
      match: { effect_kind: 'external_disclosure', regulated: false },
      proposal: 'deny',
      execution: 'deny',
    },
  ],
  defaults: { unclassified: 'deny' },
  conflict: { deny_wins: true },
});

/** Valid decision record for the set above. */
const validPdr = (): Record<string, any> => ({
  kind: 'policy-decision-record',
  id: 'PDR-0001',
  policy_set_ref: { id: 'PSET-LAB2-ALPHA', version: 1 },
  evaluated_attributes: {
    capability: 'journey.execute-step',
    effect_kind: 'domain_mutation',
    record_kind: 'sequence-set',
    regulated: true,
    actor_role: 'run-operator',
    provenance_completeness: 'verified',
    environment: 'production',
  },
  matched_rule_ids: ['R1'],
  outcome: 'needs-confirmation',
  remaining_obligations: ['notify-stakeholders'],
  evaluated_at: '2026-11-13T01:00:00Z',
});

describe('policy-set + policy-decision-record schemas (Ajv is the sole authority)', () => {
  it('(a) accepts a valid 2-rule set (regulated confirm w/ approval; deny)', () => {
    expect(validateSet(validSet()), JSON.stringify(validateSet.errors)).toBe(true);
  });

  it('(b) rejects a set missing defaults.unclassified, at /required', () => {
    const doc = validSet();
    delete doc.defaults.unclassified;
    expect(validateSet(doc)).toBe(false);
    expect(errorsFor(validateSet, doc).some((e) => e.instancePath === '/defaults' && e.keyword === 'required')).toBe(true);
  });

  it('(c) rejects a regulated:true + execution:allow rule without approval, at /rules/0/approval', () => {
    const doc = validSet();
    doc.rules[0].execution = 'allow';
    delete doc.rules[0].approval;
    expect(validateSet(doc)).toBe(false);
    expect(errorsFor(validateSet, doc).some((e) => e.instancePath === '/rules/0/approval' && e.keyword === 'required')).toBe(true);
  });

  it('(d) rejects a rule whose match carries ai_supplied_tier (closed match)', () => {
    const doc = validSet();
    doc.rules[0].match.ai_supplied_tier = 'L3-override';
    expect(validateSet(doc)).toBe(false);
    expect(errorsFor(validateSet, doc).find((e) => e.instancePath === '/rules/0/match' && e.keyword === 'additionalProperties')?.params?.additionalProperty).toBe('ai_supplied_tier');
  });

  it('(e) rejects a root-level tier: override (closed root)', () => {
    const doc = validSet();
    doc.tier = 'override';
    expect(validateSet(doc)).toBe(false);
    expect(errorsFor(validateSet, doc).find((e) => e.instancePath === '' && e.keyword === 'additionalProperties')?.params?.additionalProperty).toBe('tier');
  });

  it('(f) accepts a valid decision record; rejects outcome: allow (wrong vocabulary)', () => {
    expect(validatePdr(validPdr()), JSON.stringify(validatePdr.errors)).toBe(true);
    const doc = validPdr();
    doc.outcome = 'allow';
    expect(validatePdr(doc)).toBe(false);
    expect(errorsFor(validatePdr, doc).some((e) => e.instancePath === '/outcome' && e.keyword === 'enum')).toBe(true);
  });

  it('pins both disposition vocabularies to the shipped server policy types', () => {
    const dispositions: Record<PolicyDisposition, true> = { allow: true, confirm: true, deny: true };
    expect(Object.keys(dispositions).sort()).toEqual(
      (policySetSchema.properties.rules.items.properties.proposal.enum as string[]).slice().sort(),
    );
    const outcomes: Record<PolicyDecisionDisposition, true> = {
      allowed: true,
      'needs-confirmation': true,
      blocked: true,
    };
    expect(Object.keys(outcomes).sort()).toEqual(
      (pdrSchema.properties.outcome.enum as string[]).slice().sort(),
    );
  });
});
