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
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../../ai/index.js';
import { registerRoutes } from '../../api/routes.js';
import type { PolicyDecisionRecord, PolicyRule, PolicySetDoc } from '../../policy/policySetEvaluator.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';
import type { CompiledJourneyEnvelope } from './journeyEnvelope.js';
import {
  RULE_DISPATCH_POLICY_UNAVAILABLE,
  RULE_DISPATCH_UNCLASSIFIED,
  derivePolicyAttributes,
  guardJourneyDispatch,
  loadPolicySetsDir,
} from './journeyDispatch.js';

const SCRATCH_ROOT = '/home/brad/.jcc-dispatch-scratch';
const CAP = 'journey.fixture.dispatch';
const NOW = '2026-11-13T05:00:00Z';

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
interface DispatchBody { ok: boolean; record?: PolicyDecisionRecord; diagnostics: Array<{ rule: string; message: string }> }
const dispatch = async (app: FastifyInstance, extra: Record<string, unknown> = {}) => {
  const response = await app.inject({
    method: 'POST', url: '/api/journey/dispatch',
    payload: { document: document(), step_id: 'search', ...extra },
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
});
