// @vitest-environment node
/**
 * L2-JOURNEY-POLICY-1 (unit psdispatch2) — POST /api/journey/dispatch.
 * Render is not authority: an envelope carrying a recorded `allowed`
 * authorization is REFUSED when the declared policy set says otherwise, and the
 * evaluated attributes come from the envelope + admitted descriptor, NEVER from
 * the request body. Real registerRoutes; sets/descriptors live on disk under
 * /home/brad/.jp-dispatch2-scratch (never /tmp — inode exhaustion 2026-11-05).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { AGENT_ALLOWED_TOOLS } from '../../ai/index.js';
import { registerRoutes } from '../../api/routes.js';
import { dispatchAttributes } from './journeyDispatch.js';
import type { CapabilityDescriptor } from './capabilityCatalogue.js';

const SCRATCH_ROOT = '/home/brad/.jp-dispatch2-scratch';
const CAP = 'journey.fixture.dispatch';

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

const descriptorDoc = () => ({
  capability_id: CAP, version: '1.0.0', display_name: CAP,
  justification: 'Dispatch fixture: the admitted capability the envelope names.',
  ports: { input: [{ kind: 'any' }], output: [] },
  implementation: { handler_kind: 'agent_tool', handler_ref: AGENT_ALLOWED_TOOLS[0] },
  effects: ['read'], permissions: ['records.read'], availability: {},
  surfaces: ['journey.catalogue'], idempotency: 'pure', retry: 'none',
  reconciliation: 'not_required', evidence: ['validation_report'],
  status: { declared: true, implemented: true, available_now: true, browser_certified: false },
});

const rule = (ruleId: string, match: Record<string, unknown>, execution: string) => ({
  rule_id: ruleId, match, proposal: execution, execution,
});
const policySet = (rules: unknown[], unclassified = 'deny') => ({
  kind: 'policy-set', id: 'PSET-JPD-FIXTURE', label: 'dispatch fixture set', version: 1,
  effective_from: '2026-01-01T00:00:00Z', scope: { lab: 'fixture-lab', project: 'fixture-project' },
  rules, defaults: { unclassified }, conflict: { deny_wins: true },
});

/** The card-rendered envelope: its recorded authorization always says allowed. */
const envelope = (over: Record<string, unknown> = {}) => ({
  journey_id: 'journey-dispatch-fixture', revision: 1, step_id: 's1',
  capability_ref: CAP, capability_version: '1.0.0', bindings: [],
  authorization: {
    action: 'auto-create', target: 'journey-dispatch-fixture/s1', disposition: 'allowed',
    authority: 'project-owner', setting_key: 'allowAutoCreate',
    origin_profile_id: 'render-card', rationale: 'the card rendered, so the UI showed a run button',
  },
  ...over,
});

const apps: FastifyInstance[] = [];
const dirs: string[] = [];
async function scratchDir(prefix: string): Promise<string> {
  const dir = await mkdtemp(join(SCRATCH_ROOT, `${prefix}-`));
  dirs.push(dir);
  return dir;
}
async function buildApp(policyDir: string): Promise<FastifyInstance> {
  const catDir = await scratchDir('catalogue');
  await writeFile(join(catDir, 'fixture.yaml'), stringify(descriptorDoc()), 'utf8');
  const app = Fastify();
  await app.register(async (instance) => {
    registerRoutes(instance, { ...stubRouteOptions(), journeyCatalogueDir: catDir, journeyPolicySetDir: policyDir });
  }, { prefix: '/api' });
  await app.ready();
  apps.push(app);
  return app;
}
async function dispatch(app: FastifyInstance, body: unknown) {
  const r = await app.inject({ method: 'POST', url: '/api/journey/dispatch', payload: body as object });
  return { status: r.statusCode, body: r.json() as Record<string, any> };
}

beforeAll(async () => { await mkdir(SCRATCH_ROOT, { recursive: true }); });
afterAll(async () => {
  for (const app of apps) await app.close();
  for (const dir of dirs) await rm(dir, { recursive: true, force: true });
});

describe('POST /api/journey/dispatch (L2-JOURNEY-POLICY-1 unit psdispatch2)', () => {
  it('(a) render is not authority: recorded allowed + matching deny rule => refused, deny rule named', async () => {
    const dir = await scratchDir('sets');
    await writeFile(join(dir, 'deny.yaml'), stringify(policySet([rule('R-DENY-CAP', { capability: CAP }, 'deny')])), 'utf8');
    const { status, body } = await dispatch(await buildApp(dir), { envelope: envelope(), regulated: false });
    expect(status).toBe(200);
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0].rule).toBe('journey_dispatch_policy_blocked');
    expect(body.decision.matched_rule_ids).toContain('R-DENY-CAP');
    expect(body.decision.outcome).toBe('blocked');
    // the body's regulated:false changed nothing — attributes came from envelope+descriptor
    expect(body.decision.evaluated_attributes).toEqual({ capability: CAP, effect_kind: 'read' });
  });

  it('(b) no rule matches => refused via the declared default with matched_rule_ids []', async () => {
    const dir = await scratchDir('sets');
    await writeFile(join(dir, 'nomatch.yaml'), stringify(policySet([rule('R-NEVER', { environment: 'env-nothing-pins' }, 'allow')])), 'utf8');
    const { body } = await dispatch(await buildApp(dir), { envelope: envelope() });
    expect(body.ok).toBe(false);
    expect(body.decision.matched_rule_ids).toEqual([]);
    expect(body.diagnostics[0].rule).toBe('journey_dispatch_policy_blocked');
    expect(body.diagnostics[0].message.toLowerCase()).toContain('default');
  });

  it('(c) allowing set => ok:true and the returned envelope records allowed', async () => {
    const dir = await scratchDir('sets');
    await writeFile(join(dir, 'allow.yaml'), stringify(policySet([rule('R-ALLOW-CAP', { capability: CAP }, 'allow')])), 'utf8');
    const { status, body } = await dispatch(await buildApp(dir), { envelope: envelope() });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.envelope.authorization.disposition).toBe('allowed');
    expect(body.decision.outcome).toBe('allowed');
  });

  it('(d) execution: confirm => approval-required refusal carrying the decision (no approval store this rev)', async () => {
    const dir = await scratchDir('sets');
    await writeFile(join(dir, 'confirm.yaml'), stringify(policySet([rule('R-CONFIRM-CAP', { capability: CAP }, 'confirm')])), 'utf8');
    const { body } = await dispatch(await buildApp(dir), { envelope: envelope() });
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0].rule).toBe('journey_dispatch_approval_required');
    expect(body.decision.outcome).toBe('needs-confirmation');
  });

  it('(e) moved current input version => the shipped stale rule, relayed unchanged', async () => {
    const dir = await scratchDir('sets');
    await writeFile(join(dir, 'allow.yaml'), stringify(policySet([rule('R-ALLOW-CAP', { capability: CAP }, 'allow')])), 'utf8');
    const env = envelope({ bindings: [{ port_index: 0, declared_version: 'v1', resolved_version: 'v7' }] });
    const { body } = await dispatch(await buildApp(dir), { envelope: env, current_inputs: [{ port_index: 0, version: 'v8' }] });
    expect(body.ok).toBe(false);
    expect(body.diagnostics[0].rule).toBe('journey_envelope_stale_input');
  });

  it('(f) fail-closed: absent dir, empty dir, >1 set => refused, never ok:true', async () => {
    const missing = join(await scratchDir('sets'), 'not-created');
    const absent = await dispatch(await buildApp(missing), { envelope: envelope() });
    expect(absent.body.ok).toBe(false);
    expect(absent.body.diagnostics[0].rule).toBe('journey_policy_unavailable');

    const empty = await dispatch(await buildApp(await scratchDir('sets')), { envelope: envelope() });
    expect(empty.body.ok).toBe(false);
    expect(empty.body.diagnostics[0].rule).toBe('journey_policy_unavailable');

    const two = await scratchDir('sets');
    await writeFile(join(two, 'a.yaml'), stringify({ ...policySet([rule('R-A', { capability: CAP }, 'allow')]), id: 'PSET-A' }), 'utf8');
    await writeFile(join(two, 'b.yaml'), stringify({ ...policySet([rule('R-B', { capability: CAP }, 'allow')]), id: 'PSET-B' }), 'utf8');
    const ambiguous = await dispatch(await buildApp(two), { envelope: envelope() });
    expect(ambiguous.body.ok).toBe(false);
    expect(ambiguous.body.diagnostics[0].rule).toBe('journey_policy_ambiguous');
    expect(ambiguous.body.diagnostics[0].message).toContain('PSET-A');
    expect(ambiguous.body.diagnostics[0].message).toContain('PSET-B');
  });

  it('(g) malformed request body => 400 with journey_dispatch_request_invalid', async () => {
    const { status, body } = await dispatch(await buildApp(await scratchDir('sets')), { envelope: 'not-an-envelope' });
    expect(status).toBe(400);
    expect(body.diagnostics[0].rule).toBe('journey_dispatch_request_invalid');
  });

  it('pure legs: ambiguous effects refuse with the effects named; a cardless envelope is not permission', () => {
    const env = envelope() as unknown as Parameters<typeof dispatchAttributes>[0];
    const two = { capability_id: CAP, effects: ['read', 'domain_mutation'], implementation: { handler_kind: 'agent_tool', handler_ref: 'x' } } as unknown as CapabilityDescriptor;
    const refused = dispatchAttributes(env, two);
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.diagnostic.rule).toBe('journey_policy_effect_ambiguous');
      expect(refused.diagnostic.message).toContain('read');
      expect(refused.diagnostic.message).toContain('domain_mutation');
    }
  });
});
