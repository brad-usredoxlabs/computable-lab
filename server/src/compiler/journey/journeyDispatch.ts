/**
 * L2-JOURNEY-POLICY-1 (unit psdispatch3): the journey dispatch guard.
 *
 * A compiled envelope is handed on ONLY through guardJourneyDispatch. The guard
 * reads declared policy sets from a directory (each admitted by the shipped
 * policy-set schema through the same Ajv authority the schema seam uses), derives
 * the evaluated attributes from the envelope plus the admitted capability
 * descriptor — never from a request body — runs the committed evaluator, and
 * refuses anything the evaluator does not return as `allowed`. A decision belongs
 * to dispatch: a rendered card is not an authority. No policy-set id, rule id or
 * capability id is hardcoded here.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv2020, { type ValidateFunction } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type {
  ApprovalAuthority, CompilerPolicyActionSettingKey, PolicyAction, PolicyActionDecision,
  PolicyDecisionDisposition, PolicySettingOrigin,
} from '../../policy/types.js';
import { evaluatePolicySet, type PolicyAttributes, type PolicyDecisionRecord, type PolicySetDoc } from '../../policy/policySetEvaluator.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import { checkEnvelopeAuthorization, type CompiledJourneyEnvelope, type JourneyEnvelopeDiagnostic } from './journeyEnvelope.js';

export const RULE_DISPATCH_REFUSED = 'journey_dispatch_refused';
export const RULE_DISPATCH_UNCLASSIFIED = 'journey_dispatch_unclassified';
export const RULE_DISPATCH_POLICY_UNAVAILABLE = 'journey_dispatch_policy_unavailable';
export const RULE_DISPATCH_CAPABILITY_UNAVAILABLE = 'journey_dispatch_capability_unavailable';

const SCHEMA_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '../../../../schema/governance');
type PolicyEffectKind = NonNullable<PolicyAttributes['effect_kind']>;
/** The closed effect-kind union is the policy schema's; this binds it, it does not re-declare it. */
const EFFECT_KINDS: readonly PolicyEffectKind[] = ['read', 'external_disclosure', 'workflow_state_change', 'domain_mutation', 'compute_submission', 'deployment'];

/** ONE Ajv authority: policy-set.schema.yaml, strict + formats, as the schema seam compiles it. */
async function compilePolicySetSchema(): Promise<ValidateFunction> {
  const schema = parse(await readFile(join(SCHEMA_DIR, 'policy-set.schema.yaml'), 'utf8')) as object;
  const ajv = new Ajv2020({ strict: true, allErrors: true });
  addFormats(ajv);
  return ajv.compile(schema);
}

/**
 * Read every *.yaml in dir and admit it. Fail closed: an unreadable directory, an
 * unparseable file or a schema violation throws with the offending file and JSON
 * path — a policy set that cannot be read is never an empty permission. Re-read
 * per call, so a YAML edit is visible without a restart.
 */
export async function loadPolicySetsDir(dir: string): Promise<PolicySetDoc[]> {
  const validate = await compilePolicySetSchema();
  const names = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith('.yaml'))
    .map((entry) => entry.name)
    .sort();
  const sets: PolicySetDoc[] = [];
  for (const file of names) {
    const doc: unknown = parse(await readFile(join(dir, file), 'utf8'));
    if (!validate(doc)) {
      const detail = (validate.errors ?? [])
        .map((error) => `${error.instancePath === '' ? '/' : error.instancePath}: ${error.message ?? error.keyword}`)
        .join('; ');
      throw new Error(`${file}: ${detail}`);
    }
    sets.push(doc as PolicySetDoc);
  }
  return sets;
}

/** Declared effects, read from the descriptor only, in a stable order. */
function declaredEffects(capability: CapabilityDescriptor): PolicyEffectKind[] {
  const raw = capability.effects;
  if (!Array.isArray(raw)) return [];
  const effects: PolicyEffectKind[] = [];
  for (const value of raw) {
    if (typeof value === 'string' && (EFFECT_KINDS as readonly string[]).includes(value) && !effects.includes(value as PolicyEffectKind)) {
      effects.push(value as PolicyEffectKind);
    }
  }
  return effects;
}

/** The one record kind the descriptor declares for its outputs, when exactly one is declared. */
function declaredRecordKind(capability: CapabilityDescriptor): string | undefined {
  const ports = capability.ports;
  const outputs: unknown[] = ports !== null && typeof ports === 'object' && Array.isArray((ports as { output?: unknown }).output)
    ? (ports as { output: unknown[] }).output
    : [];
  const kinds = new Set<string>();
  for (const port of outputs) {
    const recordType = port !== null && typeof port === 'object' ? (port as { record_type?: unknown }).record_type : undefined;
    if (typeof recordType === 'string' && recordType.length > 0) kinds.add(recordType);
  }
  return kinds.size === 1 ? [...kinds][0] : undefined;
}

/**
 * Every attribute policy may see, derived from the compiled envelope and the
 * admitted descriptor. There is no third argument: a caller (or a request body)
 * cannot claim an actor role, a regulated flag or an environment. An attribute no
 * authority declares is ABSENT, and an absent attribute matches no rule, so the
 * set's restrictive default governs. One entry per declared effect, so a
 * capability that both reads and discloses is judged under both.
 */
export function derivePolicyAttributes(
  envelope: CompiledJourneyEnvelope,
  capability: CapabilityDescriptor,
): { effects: PolicyEffectKind[]; attributes: Omit<PolicyAttributes, 'effect_kind'> } {
  const recordKind = declaredRecordKind(capability);
  const complete = envelope.bindings.every((binding) => binding.declared_version === binding.resolved_version);
  return {
    effects: declaredEffects(capability),
    attributes: {
      capability: capability.capability_id,
      provenance_completeness: complete ? 'complete' : 'incomplete',
      ...(recordKind === undefined ? {} : { record_kind: recordKind }),
    },
  };
}

export interface JourneyDispatchOutcome {
  allowed: boolean;
  record: PolicyDecisionRecord;
  diagnostics: JourneyEnvelopeDiagnostic[];
}

/** blocked > needs-confirmation > allowed; the combined record is the worst one. */
const RESTRICTIVENESS: Record<PolicyDecisionDisposition, number> = { allowed: 0, 'needs-confirmation': 1, blocked: 2 };

/**
 * Equal outcomes are ordered by whether the record NAMES a rule: "blocked by
 * R-…" is the same decision as the unclassified default but carries the reason
 * the refusal names. Still one real evaluator record per effect — nothing merged.
 */
function moreRestrictive(next: PolicyDecisionRecord, worst: PolicyDecisionRecord): boolean {
  const delta = RESTRICTIVENESS[next.outcome] - RESTRICTIVENESS[worst.outcome];
  return delta !== 0 ? delta > 0 : next.matched_rule_ids.length > worst.matched_rule_ids.length;
}

/**
 * The shipped comparison, called — not copied. The envelope preserves only
 * origin_profile_id (journeyEnvelope.ts:26-29), so the decision carries exactly
 * the fields the envelope recorded; checkEnvelopeAuthorization reads disposition
 * and origin.profileId only (journeyEnvelope.ts:136-137). Nothing is inferred.
 */
function decisionFor(recorded: NonNullable<CompiledJourneyEnvelope['authorization']>, outcome: PolicyDecisionDisposition): PolicyActionDecision {
  return {
    action: recorded.action as PolicyAction,
    target: recorded.target,
    disposition: outcome,
    authority: recorded.authority as ApprovalAuthority,
    settingKey: recorded.setting_key as CompilerPolicyActionSettingKey,
    // The envelope kept the profile id only; the comparison reads nothing else.
    origin: { profileId: recorded.origin_profile_id } as PolicySettingOrigin,
    rationale: recorded.rationale,
  };
}

function refusalDiagnostics(envelope: CompiledJourneyEnvelope, record: PolicyDecisionRecord): JourneyEnvelopeDiagnostic[] {
  if (record.outcome === 'allowed') return [];
  const matched = record.matched_rule_ids;
  const diagnostics: JourneyEnvelopeDiagnostic[] = [{
    rule: matched.length === 0 ? RULE_DISPATCH_UNCLASSIFIED : RULE_DISPATCH_REFUSED,
    message: matched.length === 0
      ? `step ${envelope.step_id}: no policy rule matched the attributes derived for capability ${envelope.capability_ref}; the declared unclassified default refuses dispatch (${record.outcome})`
      : `step ${envelope.step_id}: policy set ${record.policy_set_ref.id} v${record.policy_set_ref.version} refuses dispatch (${record.outcome}) on rule(s) ${matched.join(', ')}`,
    step_id: envelope.step_id,
  }];
  const recorded = envelope.authorization;
  if (recorded !== undefined) {
    const checked = checkEnvelopeAuthorization(envelope, decisionFor(recorded, record.outcome));
    if (!checked.valid) diagnostics.push(...checked.diagnostics);
  }
  return diagnostics;
}

/**
 * Decide ONE dispatch. `sets` must be non-empty: the caller (the route) refuses
 * an unreadable or empty policy-set directory before reaching this guard, so an
 * empty policy surface never becomes a pass. `allowed` is true only for
 * `allowed`; needs-confirmation is refused here and completed by a person.
 */
export function guardJourneyDispatch(input: {
  envelope: CompiledJourneyEnvelope;
  capability: CapabilityDescriptor;
  sets: PolicySetDoc[];
  now: string;
}): JourneyDispatchOutcome {
  const { envelope, capability, sets, now } = input;
  const derived = derivePolicyAttributes(envelope, capability);
  const effects: Array<PolicyEffectKind | undefined> = derived.effects.length === 0 ? [undefined] : derived.effects;
  const records = effects.map((effect) => evaluatePolicySet({
    sets,
    attributes: effect === undefined ? derived.attributes : { ...derived.attributes, effect_kind: effect },
    now,
  }));
  const record = records.reduce((worst, next) => (moreRestrictive(next, worst) ? next : worst));
  return { allowed: record.outcome === 'allowed', record, diagnostics: refusalDiagnostics(envelope, record) };
}

/**
 * L2-JOURNEY-NOUN-CREATE-1 (unit capguard): an availability precondition, read
 * from the admitted descriptor ONLY. A descriptor that exists in
 * config/journey/capabilities/ is not a capability the journey may EXECUTE —
 * status.available_now: false means declared, not enabled (schema/workflow/
 * capability-descriptor.schema.yaml:104 makes status required, so an ABSENT
 * status is a malformed descriptor and must NOT read as permission: only
 * exactly `true` passes). This is a precondition, not a policy outcome: the
 * route consults it AHEAD of loadPolicySetsDir and it returns a diagnostic —
 * never a PolicyDecisionRecord — because no policy set is evaluated here and
 * fabricating one would claim an evaluation that never happened. It is
 * deliberately NOT called from inside guardJourneyDispatch.
 */
export function refuseUnavailableCapability(
  capability: CapabilityDescriptor,
  stepId: string,
): JourneyEnvelopeDiagnostic | undefined {
  const availableNow: unknown = (capability.status as { available_now?: unknown } | undefined)?.available_now;
  if (availableNow === true) return undefined;
  return {
    rule: RULE_DISPATCH_CAPABILITY_UNAVAILABLE,
    message: `step ${stepId}: capability ${capability.capability_id} is declared but not enabled (status.available_now: false); dispatch is refused as an execution precondition before any policy set is evaluated`,
    step_id: stepId,
  };
}
