// @vitest-environment node
/**
 * L2-JOURNEY-POLICY-1 (unit psdispatch3): red-first arms for the dispatch guard.
 * The guard is the ONLY place a compiled envelope is handed on; these cases pin
 * that render is not authority, that no caller-supplied attribute moves the
 * outcome, and that a missing policy set refuses instead of passing. Policy-set
 * fixtures are inline temp dirs written by this test (never config/).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../../ai/index.js';
import { registerRoutes } from '../../api/routes.js';
import type { PolicyDecisionRecord, PolicyRule, PolicySetDoc } from '../../policy/policySetEvaluator.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import type { CompiledJourneyEnvelope } from './journeyEnvelope.js';
import {
  RULE_DISPATCH_POLICY_UNAVAILABLE,
  RULE_DISPATCH_REFUSED,
  RULE_DISPATCH_UNCLASSIFIED,
  RULE_DISPATCH_CAPABILITY_UNAVAILABLE,
  derivePolicyAttributes,
  guardJourneyDispatch,
  loadPolicySetsDir,
  refuseUnavailableCapability,
} from './journeyDispatch.js';

const SCRATCH_ROOT = '/home/brad/.jcc-dispatch-scratch';
const CAP = 'journey.fixture.dispatch';
const NOW = '2026-11-13T05:00:00Z';
/** The SHIPPED descriptors the noun-create declaration admits (config/journey/capabilities/).
 * Read per test, never hand-copied: a flipped status in config is exactly what this unit guards. */
const SHIPPED_CAPABILITIES_DIR = join(__dirname, '../../../../config/journey/capabilities');
const loadShippedDescriptor = async (name: string): Promise<CapabilityDescriptor> =>
  parse(await readFile(join(SHIPPED_CAPABILITIES_DIR, name), 'utf8')) as CapabilityDescriptor;

/** Valid against schema/governance/policy-set.schema.yaml; only id/rules vary. */
const makeSet = (id: string, rules: PolicyRule[], unclassified: 'allow' | 'confirm' | 'deny' = 'deny'): PolicySetDoc => ({
  kind: 'policy-set', id, label: 'lane2 dispatch probe', version: 1,
  effective_from: '2026-11-12T23:00:00Z',
  scope: { lab: 'LAB-0001', project: 'PROJ-0002' },
  rules, defaults: { unclassified }, conflict: { deny_wins: true },
});
const rule = (rule_id: string, match: PolicyRule['match'], execution: 'allow' | 'confirm' | 'deny', extra: Partial<PolicyRule> = {}): PolicyRule =>
  ({ rule_id, match, proposal: execution, execution, ...extra });

const capability = (effects: string[], recordType?: string): CapabilityDescriptor => ({
  capability_id: CAP, version: '1.0.0',
  implementation: { handler_kind: 'agent_tool', handler_ref: AGENT_ALLOWED_TOOLS[0]! },
  effects,
  ...(recordType === undefined ? {} : {
    ports: { input: [], output: [{ version: '1.0.0', record_id: 'rec-1', record_type: recordType, receipt_id: 'rcpt-1' }] },
  }),
});
const envelope = (bindings: CompiledJourneyEnvelope['bindings'] = []): CompiledJourneyEnvelope => ({
  journey_id: 'journey-dispatch-fixture', revision: 1, step_id: 'search',
  capability_ref: CAP, capability_version: '1.0.0', bindings,
});

describe('guardJourneyDispatch', () => {
  it('(a) a denied effect is refused while the review card exists; the record names the rule', () => {
    const card = { rendered: true, surface: 'journey.review', action: 'dispatch' };
    const sets = [makeSet('PSET-LANE2-ONE', [rule('R-NO-EGRESS', { effect_kind: 'external_disclosure' }, 'deny')])];
    const result = guardJourneyDispatch({ envelope: envelope(), capability: capability(['read', 'external_disclosure']), sets, now: NOW });
    expect(card.rendered).toBe(true);
    expect(result.allowed).toBe(false);
    expect(result.record.outcome).toBe('blocked');
    expect(result.record.matched_rule_ids).toEqual(['R-NO-EGRESS']);
    expect(result.record.evaluated_attributes.effect_kind).toBe('external_disclosure');
    expect(result.diagnostics[0]!.message).toContain('R-NO-EGRESS');
  });

  it('(b) an effect no rule classifies is denied by the declared default and says no rule matched', () => {
    const sets = [makeSet('PSET-LANE2-ONE', [rule('R-LAB', { environment: 'lab' }, 'allow')])];
    const result = guardJourneyDispatch({ envelope: envelope(), capability: capability(['deployment']), sets, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.record.matched_rule_ids).toEqual([]);
    expect(result.record.outcome).toBe('blocked');
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.rule).toBe(RULE_DISPATCH_UNCLASSIFIED);
    expect(result.diagnostics[0]!.message).toContain('no policy rule matched');
  });

  it('(c) allow and deny both match: deny wins and both rule ids are named', () => {
    const sets = [
      makeSet('PSET-LANE2-ONE', [rule('R-ALLOW', { capability: CAP }, 'allow')]),
      makeSet('PSET-LANE2-TWO', [rule('R-DENY', { capability: CAP }, 'deny')]),
    ];
    const result = guardJourneyDispatch({ envelope: envelope(), capability: capability(['read']), sets, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.record.outcome).toBe('blocked');
    expect([...result.record.matched_rule_ids].sort()).toEqual(['R-ALLOW', 'R-DENY']);
  });

  it('(d) obligations from two sets accumulate on the decision record', () => {
    const sets = [
      makeSet('PSET-LANE2-ONE', [rule('R-A', { capability: CAP }, 'allow', { obligations: ['record-evidence'] })]),
      makeSet('PSET-LANE2-TWO', [rule('R-B', { capability: CAP }, 'allow', { obligations: ['notify-stakeholders'] })]),
    ];
    const result = guardJourneyDispatch({ envelope: envelope(), capability: capability(['read']), sets, now: NOW });
    expect(result.allowed).toBe(true);
    expect(result.record.outcome).toBe('allowed');
    expect(result.record.remaining_obligations).toEqual(['record-evidence', 'notify-stakeholders']);
  });

  it('(e) attributes come from the envelope + descriptor only: neither role nor regulated is derivable', () => {
    const derived = derivePolicyAttributes(envelope(), capability(['read'], 'sequence-set'));
    expect(derived.effects).toEqual(['read']);
    expect(derived.attributes).toEqual({ capability: CAP, record_kind: 'sequence-set', provenance_completeness: 'complete' });
    expect(derived.attributes).not.toHaveProperty('actor_role');
    expect(derived.attributes).not.toHaveProperty('regulated');
    // A set that allows only regulated work cannot be satisfied by a body claim.
    const sets = [makeSet('PSET-LANE2-ONE', [rule('R-REG', { regulated: true }, 'allow')])];
    const result = guardJourneyDispatch({ envelope: envelope(), capability: capability(['read']), sets, now: NOW });
    expect(result.allowed).toBe(false);
    expect(result.record.evaluated_attributes.regulated).toBeUndefined();
    expect(result.record.matched_rule_ids).toEqual([]);
  });

  it('(g) an unreadable policy-set dir throws; it never returns an empty pass', async () => {
    await mkdir(SCRATCH_ROOT, { recursive: true });
    const missing = join(await mkdtemp(join(SCRATCH_ROOT, 'policy-')), 'not-created');
    await expect(loadPolicySetsDir(missing)).rejects.toThrow();
  });
});

/**
 * L2-JOURNEY-NOUN-CREATE-1 (unit capguard): declared-as-enabled is not enabled.
 * A descriptor that EXISTS in config/journey/capabilities/ is not a capability
 * the journey may EXECUTE; status.available_now: false means declared, not
 * enabled. The predicate is an execution precondition the route consults AHEAD
 * of policy — it returns a diagnostic, never a PolicyDecisionRecord (no policy
 * set is evaluated, and none may be fabricated to carry the refusal).
 */
describe('refuseUnavailableCapability', () => {
  const stepId = 'choose-creation-path';
  it('(h) the SHIPPED material-create descriptor is refused; the message names the capability, available_now: false and the step', async () => {
    const descriptor = await loadShippedDescriptor('material-create.yaml');
    expect(descriptor.status as object).toEqual({ declared: true, implemented: false, available_now: false, browser_certified: false });
    const refusal = refuseUnavailableCapability(descriptor, stepId);
    expect(refusal).not.toBeUndefined();
    expect(refusal!.rule).toBe(RULE_DISPATCH_CAPABILITY_UNAVAILABLE);
    expect(refusal!.message).toContain('journey.material-create');
    expect(refusal!.message).toContain('available_now: false');
    expect(refusal!.message).toContain(stepId);
    expect(refusal!.step_id).toBe(stepId);
  });

  it('(h) the SHIPPED noun-create-from-document descriptor is refused the same way', async () => {
    const descriptor = await loadShippedDescriptor('noun-create-from-document.yaml');
    const refusal = refuseUnavailableCapability(descriptor, stepId);
    expect(refusal!.rule).toBe(RULE_DISPATCH_CAPABILITY_UNAVAILABLE);
    expect(refusal!.message).toContain('journey.noun-create-from-document');
  });

  it('(i) the SHIPPED available descriptor is NOT refused: available_now === true hands on', async () => {
    const descriptor = await loadShippedDescriptor('material-library-search.yaml');
    expect((descriptor.status as { available_now?: unknown }).available_now).toBe(true);
    expect(refuseUnavailableCapability(descriptor, stepId)).toBeUndefined();
  });

  it('(i) a missing status object is NOT available: the schema makes status required, so an absent status is a malformed descriptor and must not read as permission', () => {
    const malformed = { capability_id: 'journey.malformed', version: '1.0.0', implementation: { handler_kind: 'agent_tool', handler_ref: AGENT_ALLOWED_TOOLS[0]! } };
    const refusal = refuseUnavailableCapability(malformed as CapabilityDescriptor, stepId);
    expect(refusal).not.toBeUndefined();
    expect(refusal!.rule).toBe(RULE_DISPATCH_CAPABILITY_UNAVAILABLE);
    expect(refusal!.message).toContain('journey.malformed');
  });

  it('(i) a status object with available_now missing is NOT available either (only exactly true reads as permission)', () => {
    const partial = { capability_id: 'journey.partial', version: '1.0.0', implementation: { handler_kind: 'agent_tool', handler_ref: AGENT_ALLOWED_TOOLS[0]! }, status: { declared: true, implemented: true, browser_certified: false } };
    expect(refuseUnavailableCapability(partial as CapabilityDescriptor, stepId)!.rule).toBe(RULE_DISPATCH_CAPABILITY_UNAVAILABLE);
  });
});

/** Minimal stubs for the unconditional registerRoutes registrations. */
function stubRouteOptions() {
  const noop = async () => ({});
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop, listDanglingReferences: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
  };
}

/** A document the shipped lint admits, naming CAP as its one automatic step. */
const document = () => ({
  journey_id: 'journey-dispatch-fixture', revision: 1,
  authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
  request_anchor: { message_id: 'msg-1', verbatim_text: 'search the register' },
  objective: 'search the register', completion_contract: ['the search record is committed'],
  parameters: [],
  steps: [{ id: 'search', capability_ref: CAP, input_ports: [], interaction_mode: 'automatic', output_ports: [] }],
  alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
  return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
  assumptions: [], unresolved_questions: [],
});

const apps: FastifyInstance[] = [];
const dirs: string[] = [];
const scratch = async (): Promise<string> => {
  await mkdir(SCRATCH_ROOT, { recursive: true });
  const dir = await mkdtemp(join(SCRATCH_ROOT, 'dispatch-'));
  dirs.push(dir);
  return dir;
};
const writeCatalogue = async (): Promise<string> => {
  const dir = await scratch();
  await writeFile(join(dir, 'dispatch.yaml'), stringify({
    capability_id: CAP, version: '1.0.0', display_name: CAP,
    justification: 'Dispatch fixture: a YAML-only capability that policy may refuse.',
    ports: { input: [], output: [] },
    implementation: { handler_kind: 'agent_tool', handler_ref: AGENT_ALLOWED_TOOLS[0]! },
    effects: ['read'], permissions: ['journey.read'], availability: {}, surfaces: ['journey.dispatch'],
    idempotency: 'pure', retry: 'none', reconciliation: 'not_required',
    evidence: ['validation_report'],
    status: { declared: true, implemented: true, available_now: true, browser_certified: false },
  }), 'utf8');
  return dir;
};
const writePolicyDir = async (sets: PolicySetDoc[]): Promise<string> => {
  const dir = await scratch();
  for (const [index, set] of sets.entries()) await writeFile(join(dir, `set-${index}.yaml`), stringify(set), 'utf8');
  return dir;
};
const buildApp = async (journeyCatalogueDir: string, journeyPolicySetDir: string): Promise<FastifyInstance> => {
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, { ...stubRouteOptions(), journeyCatalogueDir, journeyPolicySetDir });
  }, { prefix: '/api' });
  await app.ready();
  apps.push(app);
  return app;
};
interface DispatchBody { ok: boolean; record?: PolicyDecisionRecord; diagnostics: Array<{ rule: string; message: string; step_id?: string }> }
const dispatch = async (app: FastifyInstance, extra: Record<string, unknown> = {}) => {
  const response = await app.inject({
    method: 'POST', url: '/api/journey/dispatch',
    payload: { document: document(), step_id: 'search', ...extra },
  });
  return { status: response.statusCode, body: response.json() as DispatchBody };
};
/** A lint-valid document whose ONE automatic step names the given capability;
 * used against the REAL shipped catalogue so the descriptor is the shipped one. */
const shippedDocument = (stepId: string, capabilityRef: string) => ({
  journey_id: 'journey-dispatch-shipped', revision: 1,
  authoring_actor: { actor_kind: 'person', actor_id: 'operator-1' },
  request_anchor: { message_id: 'msg-cap', verbatim_text: 'create the material' },
  objective: 'dispatch a step against the shipped catalogue', completion_contract: ['the step is dispatched'],
  parameters: [],
  steps: [{ id: stepId, capability_ref: capabilityRef, input_ports: [], interaction_mode: 'automatic', output_ports: [] }],
  alternatives: { options: [{ alternative_id: 'alt-a', summary: 'a single declared option' }], selection_authority: 'user' },
  return_contract: { checkpoint_ref: 'cp-1', permitted_result_types: ['completed'], require_explicit_resume: true },
  assumptions: [], unresolved_questions: [],
});
const dispatchShipped = async (app: FastifyInstance, stepId: string, capabilityRef: string) => {
  const response = await app.inject({
    method: 'POST', url: '/api/journey/dispatch',
    payload: { document: shippedDocument(stepId, capabilityRef), step_id: stepId },
  });
  return { status: response.statusCode, body: response.json() as DispatchBody };
};

afterAll(async () => {
  for (const app of apps) await app.close();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe('POST /api/journey/dispatch', () => {
  it('(f) forbidden envelope: 403 { ok: false } with the matched rule; allowed envelope: 200 + record', async () => {
    const catalogue = await writeCatalogue();
    const denying = await writePolicyDir([makeSet('PSET-LANE2-ONE', [rule('R-DENY-READ', { effect_kind: 'read' }, 'deny')])]);
    const forbidden = await dispatch(await buildApp(catalogue, denying), { role: 'admin', attributes: { actor_role: 'admin', regulated: false } });
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.ok).toBe(false);
    expect(forbidden.body.record!.outcome).toBe('blocked');
    expect(forbidden.body.record!.matched_rule_ids).toContain('R-DENY-READ');
    // The body's `role`/`attributes` claims reached no decision attribute.
    expect(forbidden.body.record!.evaluated_attributes.actor_role).toBeUndefined();
    expect(forbidden.body.record!.evaluated_attributes.regulated).toBeUndefined();

    const allowing = await writePolicyDir([makeSet('PSET-LANE2-ONE', [rule('R-ALLOW-READ', { effect_kind: 'read' }, 'allow')])]);
    const permitted = await dispatch(await buildApp(catalogue, allowing));
    expect(permitted.status).toBe(200);
    expect(permitted.body.ok).toBe(true);
    expect(permitted.body.record!.outcome).toBe('allowed');
  });

  it('(g) a missing policy-set directory refuses with a diagnostic naming it', async () => {
    const catalogue = await writeCatalogue();
    const missing = join(await scratch(), 'not-created');
    const { status, body } = await dispatch(await buildApp(catalogue, missing));
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0]!.rule).toBe(RULE_DISPATCH_POLICY_UNAVAILABLE);
    expect(body.diagnostics[0]!.message).toContain(missing);
  });

  it('(g) an empty policy-set directory is an unclassified default deny, never a pass', async () => {
    const catalogue = await writeCatalogue();
    const { status, body } = await dispatch(await buildApp(catalogue, await writePolicyDir([])));
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0]!.message).toContain('no policy set declared');
  });

  /**
   * L2-JOURNEY-NOUN-CREATE-1 (unit capguard) route leg. The route consults
   * refuseUnavailableCapability AHEAD of loadPolicySetsDir, against the REAL
   * shipped catalogue (options.journeyCatalogueDir is left at the default): a
   * step naming journey.material-create (available_now: false in
   * config/journey/capabilities/material-create.yaml) is refused before any
   * policy set is read — 403, one diagnostic, NO record key (no policy set was
   * evaluated; nothing is fabricated to carry the refusal).
   * NOTE: the shipped noun-create declaration's own step "choose-creation-path"
   * is human_in_the_loop, which the envelope guard refuses at 400 (it is never
   * pre-compiled) BEFORE capability resolution; this leg therefore dispatches a
   * lint-valid AUTOMATIC step that names the SAME shipped descriptor — the
   * descriptor under guard is the shipped one either way.
   */
  it('(j) a step naming the shipped journey.material-create is refused BEFORE policy: 403, the named rule, no record key', async () => {
    const app = await buildApp(SHIPPED_CAPABILITIES_DIR, await writePolicyDir([
      makeSet('PSET-LANE2-ONE', [rule('R-ALLOW-DM', { effect_kind: 'domain_mutation' }, 'allow')]),
    ]));
    const { status, body } = await dispatchShipped(app, 'choose-creation-path', 'journey.material-create');
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    expect(body.diagnostics).toHaveLength(1);
    expect(body.diagnostics[0]!.rule).toBe(RULE_DISPATCH_CAPABILITY_UNAVAILABLE);
    expect(body.diagnostics[0]!.message).toContain('journey.material-create');
    expect(body.diagnostics[0]!.message).toContain('available_now: false');
    expect(body.diagnostics[0]!.message).toContain('choose-creation-path');
    // No policy set was evaluated or fabricated: the record key is ABSENT.
    expect(body).not.toHaveProperty('record');
  });

  it('(j) the same request against an AVAILABLE capability is NOT refused by the new rule: it reaches policy and the deny wins, with the pre-change body shape', async () => {
    const app = await buildApp(SHIPPED_CAPABILITIES_DIR, await writePolicyDir([
      makeSet('PSET-LANE2-ONE', [rule('R-DENY-READ', { effect_kind: 'read' }, 'deny')]),
    ]));
    const { status, body } = await dispatchShipped(app, 'search', 'journey.material-library-search');
    expect(status).toBe(403);
    expect(body.ok).toBe(false);
    // Exactly the pre-change policy refusal shape: a REAL evaluated record.
    expect(body.diagnostics[0]!.rule).toBe(RULE_DISPATCH_REFUSED);
    expect(body.diagnostics[0]!.message).toContain('R-DENY-READ');
    expect(body.record!.outcome).toBe('blocked');
    expect(body.record!.matched_rule_ids).toEqual(['R-DENY-READ']);
    expect(body.record!.evaluated_attributes.capability).toBe('journey.material-library-search');
  });
});
