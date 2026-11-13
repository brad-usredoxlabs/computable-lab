/**
 * L2-JOURNEY-POLICY-1 (unit pseval2): the restrictive policy-set evaluator.
 * ONE entry point turns declared policy sets + declared attributes into one
 * PolicyDecisionRecord. Pure — no fs, no clock (now is passed in), no env.
 * Vocabulary is borrowed, never re-declared: PolicyDisposition /
 * PolicyDecisionDisposition from ./types.js. No record kind, capability id,
 * lab or project name appears here; matching is generic equality over the
 * rule's declared `match` object.
 */
import type { PolicyDecisionDisposition, PolicyDisposition } from './types.js';

export interface PolicyRule {
  rule_id: string;
  match: Record<string, string | boolean>;
  proposal: PolicyDisposition;
  execution: PolicyDisposition;
  approval?: { roles: string[]; approvers: number; meaning: string; separation_of_duties: boolean };
  obligations?: string[];
  evidence_retention?: string;
}

export interface PolicySetDoc {
  kind: 'policy-set';
  id: string;
  label: string;
  version: number;
  effective_from: string;
  scope: { lab: string; project: string };
  rules: PolicyRule[];
  defaults: { unclassified: PolicyDisposition };
  conflict: { deny_wins: true };
}

/** The closed match vocabulary plus the evaluator-only reauthorization channel. */
export interface PolicyAttributes {
  capability?: string;
  effect_kind?: 'read' | 'external_disclosure' | 'workflow_state_change' | 'domain_mutation' | 'compute_submission' | 'deployment';
  record_kind?: string;
  regulated?: boolean;
  actor_role?: string;
  provenance_completeness?: string;
  environment?: string;
  /** Declared HERE, not in policy-set.schema.yaml: stale inputs force reauthorization. */
  stale_inputs?: string[];
}

export interface PolicyDecisionRecord {
  kind: 'policy-decision-record';
  id: string;
  policy_set_ref: { id: string; version: number };
  evaluated_attributes: Omit<PolicyAttributes, 'stale_inputs'>;
  matched_rule_ids: string[];
  outcome: PolicyDecisionDisposition;
  remaining_obligations: string[];
  evaluated_at: string;
}

/** dispositions → outcomes, using ONLY the two shipped vocabularies. */
const OUTCOME: Record<PolicyDisposition, PolicyDecisionDisposition> = {
  allow: 'allowed',
  confirm: 'needs-confirmation',
  deny: 'blocked',
};

interface MatchedRule {
  rule: PolicyRule;
  setIndex: number;
}

/** match-field equality over the keys the rule declares; absent key = wildcard. */
const ruleMatches = (rule: PolicyRule, attributes: PolicyAttributes): boolean =>
  Object.entries(rule.match).every(([key, want]) => attributes[key as keyof PolicyAttributes] === want);

export function evaluatePolicySet(input: {
  sets: PolicySetDoc[];
  attributes: PolicyAttributes;
  now: string;
}): PolicyDecisionRecord {
  const { sets, attributes, now } = input;
  const primary = sets[0];
  if (!primary) throw new Error('policySetEvaluator: no policy set declared');

  const matched: MatchedRule[] = sets.flatMap((set, setIndex) =>
    set.rules.filter((rule) => ruleMatches(rule, attributes)).map((rule) => ({ rule, setIndex })),
  );

  const { stale_inputs: staleInputs, ...evaluatedAttributes } = attributes;
  const stale = staleInputs && staleInputs.length > 0 ? [...new Set(staleInputs)] : [];
  const matchedRuleIds = matched.map(({ rule }) => rule.rule_id);

  // (d) UNCLASSIFIED: no rule matched ⇒ the set's DECLARED restrictive default.
  // No rule id is synthesised — a default is not a rule. Declared stale inputs
  // still force blocked here, before any classification: they are not a rule,
  // but they are never allowed to vanish into a default.
  if (matched.length === 0) {
    return {
      kind: 'policy-decision-record',
      id: `PDR-${primary.id.replace(/^PSET-/, '')}`,
      policy_set_ref: { id: primary.id, version: primary.version },
      evaluated_attributes: evaluatedAttributes,
      matched_rule_ids: [],
      outcome: stale.length > 0 ? OUTCOME.deny : OUTCOME[primary.defaults.unclassified],
      remaining_obligations: stale,
      evaluated_at: now,
    };
  }

  const obligations: string[] = [];
  const addObligations = (items: readonly string[]): void => {
    for (const item of items) if (!obligations.includes(item)) obligations.push(item);
  };
  for (const { rule } of matched) addObligations(rule.obligations ?? []);

  // (b) obligations accumulate above; (a) deny wins any matching allow;
  // (e) declared stale inputs force blocked regardless of a matching allow.
  let outcome: PolicyDecisionDisposition;
  if (stale.length > 0) {
    outcome = 'blocked';
    addObligations(stale);
  } else if (matched.some(({ rule }) => rule.execution === 'deny')) {
    outcome = 'blocked';
  } else if (
    attributes.regulated === true &&
    matched.some(({ rule }) => rule.execution === 'allow')
  ) {
    // (c) a regulated allow is never upgraded: it signs off via declared approver roles.
    outcome = 'needs-confirmation';
    addObligations(
      matched.flatMap(({ rule }) => (rule.execution === 'allow' ? rule.approval?.roles ?? [] : [])),
    );
  } else {
    outcome = OUTCOME[matched.some(({ rule }) => rule.execution === 'confirm') ? 'confirm' : 'allow'];
  }

  return {
    kind: 'policy-decision-record',
    id: `PDR-${primary.id.replace(/^PSET-/, '')}`,
    policy_set_ref: { id: primary.id, version: primary.version },
    evaluated_attributes: evaluatedAttributes,
    matched_rule_ids: matchedRuleIds,
    outcome,
    remaining_obligations: obligations,
    evaluated_at: now,
  };
}
