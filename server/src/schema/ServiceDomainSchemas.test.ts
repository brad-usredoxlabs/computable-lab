import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadSchemasFromContent } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js';
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js';

// Lab-sync record graph: core services (party/request/sample/receipt/report),
// Test Your Food domain specializations, and the sync event mirror.
// See specs/computable-lab-party-request-schema-spec.md + specs/lab-sync-api.md.
const SERVICE_SCHEMA_PATHS = [
  'core/common.schema.yaml',
  'core/datatypes/ref.schema.yaml',
  'services/party.schema.yaml',
  'services/request.schema.yaml',
  'services/requested-service.schema.yaml',
  'services/sample.schema.yaml',
  'services/sample-receipt.schema.yaml',
  'services/report.schema.yaml',
  'domains/test-your-food/customer.schema.yaml',
  'domains/test-your-food/order.schema.yaml',
  'domains/test-your-food/sample-registration.schema.yaml',
  'domains/test-your-food/evidence-document.schema.yaml',
  'integration/lab-sync-event.schema.yaml',
] as const;

const BASE = 'https://computable-lab.com/schema/computable-lab';

async function loadServiceSchemas() {
  const schemaRoot = join(process.cwd(), 'schema');
  const contents = new Map<string, string>();
  for (const path of SERVICE_SCHEMA_PATHS) {
    contents.set(path, await readFile(join(schemaRoot, path), 'utf8'));
  }
  return loadSchemasFromContent(contents);
}

describe('lab-sync service & domain schemas', () => {
  it('load and resolve all $ref dependencies', async () => {
    const result = await loadServiceSchemas();
    expect(result.errors.map(e => `${e.path}: ${e.error}`)).toEqual([]);
    expect(result.entries).toHaveLength(SERVICE_SCHEMA_PATHS.length);

    const registry = createSchemaRegistry();
    registry.addSchemas(result.entries);
    const order = registry.getTopologicalOrder();
    // Every schema resolves in topological order (dependencies first).
    expect(order).toHaveLength(SERVICE_SCHEMA_PATHS.length);

    const customer = registry.getById(`${BASE}/domains/test-your-food/customer.schema.yaml`);
    expect(customer).toBeDefined();
    const deps = registry.getDependencies(`${BASE}/domains/test-your-food/customer.schema.yaml`);
    expect(deps).toContain(`${BASE}/party.schema.yaml`);
  });

  it('validate representative party/request/sample/order/customer/report/event payloads', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const ref = (id: string, type: string) => ({ kind: 'record', id, type });

    const party = {
      kind: 'party',
      recordId: 'PARTY-0018',
      name: 'Acme Nutrition LLC',
      partyType: 'organization',
      status: 'active',
      contacts: [{ channel: 'email', value: 'orders@acme.example', isPrimary: true }],
    };
    expect(validator.validate(party, `${BASE}/party.schema.yaml`).valid).toBe(true);

    const request = {
      kind: 'request',
      recordId: 'REQ-2026-00427',
      requesterRef: ref('PARTY-0018', 'party'),
      requestedAt: '2026-09-26T17:42:31-04:00',
      requestedServices: [{ lineId: 'tyforl_1a2b3c', service: 'fatty_acid_profile', matrix: 'cf:fat-matrix', sampleCount: 2 }],
      lifecycleId: 'service-request',
      status: 'submitted',
      source: { system: 'test-your-food.com', remoteId: 'tyfored_9f3a21', remoteRevision: 1 },
    };
    expect(validator.validate(request, `${BASE}/request.schema.yaml`).valid).toBe(true);

    const customer = {
      kind: 'customer',
      recordId: 'CUST-0018',
      extends: 'party',
      name: 'Jane Smith',
      partyType: 'person',
      status: 'active',
      contacts: [{ channel: 'email', value: 'jane@example.com' }],
      addresses: [{ city: 'Austin', region: 'TX', country: 'US' }],
      source: { system: 'test-your-food.com', remoteId: 'tyf-cus_8d19' },
    };
    expect(validator.validate(customer, `${BASE}/domains/test-your-food/customer.schema.yaml`).valid).toBe(true);
    // Commercial fields must not leak onto the party shape: customer forbids payment.
    expect(validator.validate({ ...customer, payment: { status: 'paid' } }, `${BASE}/domains/test-your-food/customer.schema.yaml`).valid).toBe(false);

    const order = {
      kind: 'order',
      recordId: 'ORD-2026-00427',
      extends: 'request',
      requesterRef: ref('CUST-0018', 'customer'),
      customerRef: ref('CUST-0018', 'customer'),
      requestedServices: [{ lineId: 'tyforl_1a2b3c', service: 'fatty_acid_profile', matrix: 'cf:fat-matrix', sampleCount: 2 }],
      lifecycleId: 'tyf-order',
      status: 'awaiting_sample',
      payment: { status: 'paid' },
      sampleKit: { status: 'shipped' },
      totalAmount: 250.0,
      currency: 'USD',
      affiliateCode: 'AA-ANGELACRES',
      source: { system: 'test-your-food.com', remoteId: 'tyfored_9f3a21', remoteRevision: 4 },
    };
    expect(validator.validate(order, `${BASE}/domains/test-your-food/order.schema.yaml`).valid).toBe(true);
    // Order must not silently drop the lifecycle declaration.
    const { lifecycleId: _drop, ...orderNoLifecycle } = order;
    expect(validator.validate(orderNoLifecycle, `${BASE}/domains/test-your-food/order.schema.yaml`).valid).toBe(false);

    const registration = {
      kind: 'sample-registration',
      recordId: 'REG-2026-00911',
      orderRef: ref('ORD-2026-00427', 'order'),
      identifier: { system: 'tyf-barcode', value: 'TYF-9F7A21' },
      customerDescription: { matrix: 'cf:fat-matrix', description: 'Extra virgin olive oil from opened bottle' },
      registeredAt: '2026-09-27T16:18:04-04:00',
    };
    expect(validator.validate(registration, `${BASE}/domains/test-your-food/sample-registration.schema.yaml`).valid).toBe(true);
    // Barcode format enforced by the domain schema.
    expect(validator.validate(
      { ...registration, identifier: { system: 'tyf-barcode', value: 'tyf-9f7a21' } },
      `${BASE}/domains/test-your-food/sample-registration.schema.yaml`,
    ).valid).toBe(false);

    const sample = {
      kind: 'sample',
      recordId: 'SMP-2026-01231',
      requestRef: ref('ORD-2026-00427', 'order'),
      identifiers: [{ system: 'tyf-barcode', value: 'TYF-9F7A21' }],
      submittedDescription: { matrix: 'cf:fat-matrix', description: 'Extra virgin olive oil from opened bottle' },
      receipt: { receivedAt: '2026-09-29T09:14:22-04:00', receivedByRef: ref('PER-brad', 'person'), conditionAcceptable: true },
      lifecycleId: 'lab-sample',
      status: 'accessioned',
    };
    expect(validator.validate(sample, `${BASE}/sample.schema.yaml`).valid).toBe(true);

    const receipt = {
      kind: 'sample-receipt',
      recordId: 'RCPT-2026-00911',
      identifier: { system: 'tyf-barcode', value: 'TYF-9F7A21' },
      requestRef: ref('ORD-2026-00427', 'order'),
      sampleRef: ref('SMP-2026-01231', 'sample'),
      receivedAt: '2026-09-29T09:14:22-04:00',
      receivedByRef: ref('PER-brad', 'person'),
      condition: { acceptable: true },
    };
    expect(validator.validate(receipt, `${BASE}/sample-receipt.schema.yaml`).valid).toBe(true);

    const report = {
      kind: 'report',
      recordId: 'RPT-2026-00331',
      requestRef: ref('ORD-2026-00427', 'order'),
      sampleRefs: [ref('SMP-2026-01231', 'sample')],
      revision: 1,
      status: 'released',
      releasedAt: '2026-09-29T11:04:21-04:00',
    };
    expect(validator.validate(report, `${BASE}/report.schema.yaml`).valid).toBe(true);

    const event = {
      kind: 'lab-sync-event',
      recordId: 'LSYN-000001',
      eventId: 'evt_TYF_000123',
      direction: 'inbound',
      cursor: 123,
      eventType: 'order.created',
      occurredAt: '2026-09-26T17:42:31-04:00',
      payload: { order_remote_id: 'tyfored_9f3a21' },
      processing: { status: 'applied', affectedRecordIds: ['ORD-2026-00427'], processedAt: '2026-09-26T17:43:00-04:00' },
    };
    expect(validator.validate(event, `${BASE}/lab-sync-event.schema.yaml`).valid).toBe(true);
    // Numeric DB ids must not be accepted as event ids.
    expect(validator.validate({ ...event, eventId: '123' }, `${BASE}/lab-sync-event.schema.yaml`).valid).toBe(false);
  });

  it('customer carries website-minted aliases and verification without rewriting identity', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const customer = {
      kind: 'customer',
      recordId: 'CUST-0018',
      extends: 'party',
      name: 'Jane Smith',
      partyType: 'person',
      status: 'active',
      contacts: [{ channel: 'email', value: 'jane@example.com' }],
      // Legacy email-derived remoteId stays on source; the website handle arrives via aliases.
      source: { system: 'test-your-food.com', remoteId: 'email:jane@example.com' },
    };
    const customerSchemaId = `${BASE}/domains/test-your-food/customer.schema.yaml`;

    const aliased = {
      ...customer,
      aliases: [{ system: 'test-your-food.com', remoteId: 'tyfcus_' + '0'.repeat(32) }],
    };
    expect(validator.validate(aliased, customerSchemaId).valid).toBe(true);

    // Aliases accept tyfcus_* handles only — an email-derived id must fail the pattern.
    expect(validator.validate(
      { ...customer, aliases: [{ system: 'test-your-food.com', remoteId: 'email:x@y.z' }] },
      customerSchemaId,
    ).valid).toBe(false);

    // verifiedAt is an optional website-verified email timestamp.
    expect(validator.validate(
      { ...aliased, verifiedAt: '2026-09-27T10:00:00-04:00' },
      customerSchemaId,
    ).valid).toBe(true);
  });

  it('sample-registration carries website-minted sampleId, lineId, and slot', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const registration = {
      kind: 'sample-registration',
      recordId: 'REG-2026-00911',
      orderRef: { kind: 'record', id: 'ORD-2026-00427', type: 'order' },
      identifier: { system: 'tyf-barcode', value: 'TYF-9F7A21' },
      registeredAt: '2026-09-27T16:18:04-04:00',
    };
    const registrationSchemaId = `${BASE}/domains/test-your-food/sample-registration.schema.yaml`;

    expect(validator.validate(
      { ...registration, sampleId: 'smp_1A2b_3', lineId: 'tyforl_77_01', slot: 2 },
      registrationSchemaId,
    ).valid).toBe(true);

    // Slots are one-based: one purchased kit = one slot.
    expect(validator.validate(
      { ...registration, slot: 0 },
      registrationSchemaId,
    ).valid).toBe(false);

    // sampleId is a URL-safe handle, never free text.
    expect(validator.validate(
      { ...registration, sampleId: 'bad id!' },
      registrationSchemaId,
    ).valid).toBe(false);
  });

  it('lab-sync-event accepts needs_review processing status', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const event = {
      kind: 'lab-sync-event',
      recordId: 'LSYN-0001',
      eventId: 'evt_TYF_1',
      direction: 'inbound',
      eventType: 'order.created',
      processing: { status: 'needs_review' },
    };
    expect(validator.validate(event, `${BASE}/lab-sync-event.schema.yaml`).valid).toBe(true);
  });

  it('lifecycles for request, sample, and order load and govern their declared states', async () => {
    const engine = new LifecycleEngine();
    const count = loadLifecyclesFromDir(join(process.cwd(), 'schema', 'core', 'lifecycles'), engine);
    expect(count).toBeGreaterThan(2);
    expect(engine.isLoaded('service-request')).toBe(true);
    expect(engine.isLoaded('lab-sample')).toBe(true);
    expect(engine.isLoaded('tyf-order')).toBe(true);

    // Spec-level assertions straight from the lifecycle YAML (declarative truth).
    const lifecycleRoot = join(process.cwd(), 'schema', 'core', 'lifecycles');
    const svc = parseYaml(await readFile(join(lifecycleRoot, 'service-request.lifecycle.yaml'), 'utf8')) as
      { states: Array<{ id: string }>; transitions: Array<{ from: string | string[]; to: string }> };
    expect(svc.states.map(s => s.id)).toContain('submitted');
    // Forward-only: no back-edge into the initial state.
    expect(svc.transitions.some(t => t.to === 'submitted')).toBe(false);

    const sample = parseYaml(await readFile(join(lifecycleRoot, 'lab-sample.lifecycle.yaml'), 'utf8')) as
      { states: Array<{ id: string }> };
    expect(sample.states.map(s => s.id)).toEqual(
      expect.arrayContaining(['registered', 'received', 'accessioned', 'consumed']),
    );

    const order = parseYaml(await readFile(join(lifecycleRoot, 'tyf-order.lifecycle.yaml'), 'utf8')) as
      { states: Array<{ id: string }>; transitions: Array<{ from: string | string[]; to: string }> };
    // Mirrors lab-sync-api.md §4 ladder.
    expect(order.states.map(s => s.id)).toEqual(
      expect.arrayContaining([
        'pending_payment', 'paid', 'awaiting_sample', 'sample_registered', 'in_transit',
        'sample_received', 'in_testing', 'testing_complete', 'reported', 'rejected', 'cancelled',
      ]),
    );
    // 'reported' only reachable from testing_complete (report release is the sole trigger).
    expect(order.transitions.filter(t => t.to === 'reported')
      .every(t => (Array.isArray(t.from) ? t.from : [t.from]).join() === 'testing_complete')).toBe(true);
  });

  it('lint specs for the new kinds load and fire on violating records', async () => {
    const schemaRoot = join(process.cwd(), 'schema');
    const result = await loadAllLintSpecs({ basePath: schemaRoot, recursive: true });
    // Pre-existing repo-wide specs may have their own issues; ours must be clean.
    const ourErrors = result.errors.filter(e => /party|request|sample|lab-sync-event|order/.test(e.path));
    expect(ourErrors.map(e => `${e.path}: ${e.error}`)).toEqual([]);

    const names = result.specs.map(s => s.name);
    for (const expected of ['party', 'request', 'sample', 'lab-sync-event', 'order']) {
      expect(names).toContain(expected);
    }

    const engine = new LintEngine();
    for (const { name, spec } of result.specs) {
      engine.addSpec(name, spec);
    }

    // Order past sample_received without sampleRefs must fail its lint rule.
    const stale = {
      kind: 'order',
      recordId: 'ORD-2026-00999',
      extends: 'request',
      requesterRef: { kind: 'record', id: 'CUST-0018', type: 'customer' },
      lifecycleId: 'tyf-order',
      status: 'sample_received',
      source: { system: 'test-your-food.com', remoteId: 'tyfored_x', remoteRevision: 2 },
    };
    const findings = engine.lint(stale, `${BASE}/domains/test-your-food/order.schema.yaml`);
    expect(findings.violations.some((f: { ruleId: string; severity: string }) => f.ruleId === 'order-received-has-sample' && f.severity === 'error')).toBe(true);

    const withSample = { ...stale, sampleRefs: [{ kind: 'record', id: 'SMP-2026-01231', type: 'sample' }] };
    const clean = engine.lint(withSample, `${BASE}/domains/test-your-food/order.schema.yaml`);
    expect(clean.violations.some((f: { ruleId: string }) => f.ruleId === 'order-received-has-sample')).toBe(false);
  });

  it('mapping.yaml covers the vocabulary the sync worker will translate', async () => {
    // Monorepo root, robust to vitest cwd being server/ or the root.
    const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
    const mapping = parseYaml(await readFile(join(repoRoot, 'config', 'lab-sync', 'mapping.yaml'), 'utf8'));
    expect(mapping.sourceSystem).toBe('test-your-food.com');
    // Service slugs from lab-sync-api.md §2.
    expect(Object.keys(mapping.services).sort()).toEqual(['fatty-acid-analysis', 'pesticide-screening']);
    expect(mapping.services['fatty-acid-analysis'].code).toBe('fatty_acid_profile');
    expect(mapping.services['pesticide-screening'].code).toBe('pesticide_panel');
    // Matrix slugs from lab-sync-api.md §2 identity rules.
    expect(Object.keys(mapping.matrices).sort()).toEqual(
      ['dairy', 'eggs', 'fat', 'grain', 'meat', 'processed', 'vegetable'],
    );
    for (const term of Object.values(mapping.matrices as Record<string, { term: string }>)) {
      expect(term.term).toMatch(/^cf:[a-z0-9-]+$/);
    }
    expect(mapping.identifiers['tyf-barcode'].pattern).toBe('^TYF-[A-Z0-9]{6}$');
  });

  it('tyf.evidence/1 export document validates and pins its wire shape', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }
    const evidenceSchemaId = `${BASE}/domains/test-your-food/evidence-document.schema.yaml`;

    const sha = (seed: string) => (seed.repeat(32)).slice(0, 64);
    const document = {
      schema_version: 'tyf.evidence/1',
      viewer_version: 1,
      sample_id: 'smp_1A2b_3',
      barcode: 'TYF-9F7A21',
      events: [{
        id: 'evt_0001',
        type: 'sample.received',
        occurred_at: '2026-09-29T09:14:22-04:00',
        sample_id: 'smp_1A2b_3',
        record_ids: ['rec_0001'],
      }],
      records: [{
        id: 'rec_0001',
        type: 'sample',
        sample_id: 'smp_1A2b_3',
        data: { matrix: 'cf:fat-matrix' },
      }],
      source_revisions: [{ record_id: 'rec_0001', commit: 'a'.repeat(40) }],
      artifacts: [
        { id: 'art_graph_1', kind: 'graph', name: 'graph.json', sha256: sha('ab'), size: 1024 },
        { id: 'art_trace_1', kind: 'trace', name: 'trace.json', sha256: sha('cd'), size: 2048 },
        { id: 'art_script_1', kind: 'script', name: 'analysis.py', sha256: sha('ef'), size: 512 },
        { id: 'art_inputs_1', kind: 'inputs', name: 'inputs.zip', sha256: sha('01'), size: 4096 },
        { id: 'art_zip_1', kind: 'zip', name: 'bundle.zip', sha256: sha('23'), size: 8192 },
      ],
    };
    expect(validator.validate(document, evidenceSchemaId).valid).toBe(true);

    // What the schema CAN pin. The cross-sample EQUALITY rule (every
    // event/record sample_id must equal the document sample_id) is
    // cross-instance and not expressible in JSON Schema — it is enforced
    // by the builder (build.test.ts asserts other-sample strings absent
    // from serialized output), not here.
    const { sample_id: _dropSample, ...recordNoScope } = document.records[0];
    expect(validator.validate(
      { ...document, records: [recordNoScope] },
      evidenceSchemaId,
    ).valid).toBe(false);

    // additionalProperties: false — the document is a closed wire contract.
    expect(validator.validate(
      { ...document, extra_key: 'leak' },
      evidenceSchemaId,
    ).valid).toBe(false);

    // Artifact kinds are a closed enum.
    expect(validator.validate(
      { ...document, artifacts: [...document.artifacts, { id: 'art_exe_1', kind: 'exe', name: 'run.exe', sha256: sha('45'), size: 1 }] },
      evidenceSchemaId,
    ).valid).toBe(false);

    // sha256 must be a full 64-hex digest.
    expect(validator.validate(
      { ...document, artifacts: [{ ...document.artifacts[0], sha256: sha('ab').slice(0, 63) }, ...document.artifacts.slice(1)] },
      evidenceSchemaId,
    ).valid).toBe(false);

    // viewer_version is pinned: the website viewer contract is version 1.
    expect(validator.validate({ ...document, viewer_version: 2 }, evidenceSchemaId).valid).toBe(false);
  });

  it('report revisions carry evidenceFiles for the export bundle', async () => {
    const result = await loadServiceSchemas();
    const validator = createValidator({ strict: false });
    for (const entry of result.entries) {
      validator.addSchema(entry.schema, entry.id);
    }

    const report = {
      kind: 'report',
      recordId: 'RPT-2026-00331',
      requestRef: { kind: 'record', id: 'ORD-2026-00427', type: 'order' },
      revision: 1,
      status: 'approved',
    };
    expect(validator.validate(report, `${BASE}/report.schema.yaml`).valid).toBe(true);

    const withEvidence = {
      ...report,
      evidenceFiles: [{ id: 'art_graph_1', kind: 'graph', name: 'graph.json', path: '/lab/evidence/graph.json' }],
    };
    expect(validator.validate(withEvidence, `${BASE}/report.schema.yaml`).valid).toBe(true);

    // kind is the same closed enum as the evidence document's artifacts.
    expect(validator.validate(
      { ...report, evidenceFiles: [{ id: 'art_x_1', kind: 'bogus', name: 'x.bin', path: '/lab/evidence/x.bin' }] },
      `${BASE}/report.schema.yaml`,
    ).valid).toBe(false);
  });
});
