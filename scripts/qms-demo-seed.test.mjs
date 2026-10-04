/**
 * QMS-4 seed tests — built-in node:test, zero deps.
 * Run: node --test scripts/qms-demo-seed.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFixtures,
  planActions,
  runSeed,
  AUTH_STOP_MESSAGE,
  BRAD_ID,
  LOCAL_ADMIN_ID,
  QMS_ADMIN_ID,
} from './qms-demo-seed.mjs';

const NOW = '2026-10-03T10:10:17.000Z';

// ---------------------------------------------------------------------------
// Schema-pattern assertions (patterns mirrored from schema/ in the spec tick;
// the live POST /records Ajv+lint run remains the structural authority).
// ---------------------------------------------------------------------------

const ID_PATTERNS = {
  person: /^PER-[A-Z0-9][A-Z0-9_-]*$/,
  'controlled-document': /^DOC-[A-Z0-9][A-Z0-9_-]*$/,
  'training-material': /^TRM-[A-Z0-9][A-Z0-9_-]*$/,
  'training-record': /^TRR-[A-Z0-9][A-Z0-9_-]*$/,
  equipment: /^EQP-[A-Z0-9][A-Z0-9_-]*$/,
  'calibration-record': /^CAL-[A-Z0-9][A-Z0-9_-]*$/,
  'role-grant': /^GRANT-[A-Z0-9][A-Z0-9_-]*$/,
};

test('every fixture payload id matches its schema pattern', () => {
  const fixtures = buildFixtures(NOW);
  for (const f of fixtures) {
    if (!f.payload) continue;
    const id = f.payload.id ?? f.payload.recordId;
    assert.ok(ID_PATTERNS[f.payload.kind], `no pattern known for kind ${f.payload.kind}`);
    assert.match(id, ID_PATTERNS[f.payload.kind], `${id} violates ${f.payload.kind} id pattern`);
    assert.match(id, /DEMO/, `${id} must carry a DEMO segment`);
  }
});

test('every titled fixture title starts with "DEMO "', () => {
  for (const f of buildFixtures(NOW)) {
    if (f.payload?.title) assert.match(f.payload.title, /^DEMO /, f.id);
    if (f.payload?.displayName) assert.match(f.payload.displayName, /^DEMO /, f.id);
  }
});

test('required-field sets per schema (DOC/TRR/EQP/CAL/GRANT + PER/TRM)', () => {
  const byKey = new Map(buildFixtures(NOW).map((f) => [f.key, f]));
  const req = (key, fields) => {
    const p = byKey.get(key).payload;
    for (const field of fields) assert.ok(field in p, `${key} missing required '${field}'`);
  };
  req('DOC-DEMO-SOP', ['kind', 'id', 'title', 'state', 'lifecycleId']);
  req('TRR-DEMO-1', ['kind', 'id', 'personRef', 'trainingMaterialRef', 'status', 'completedAt']);
  req('EQP-DEMO-GC', ['kind', 'id', 'name', 'status']);
  req('CAL-DEMO-GC', ['kind', 'id', 'equipmentRef', 'performedAt', 'status']);
  req('GRANT-DEMO-AUTHOR', ['kind', 'recordId', 'userId', 'roles']);
  req('GRANT-DEMO-REVIEWER', ['kind', 'recordId', 'userId', 'roles']);
  req('PER-DEMO-AUTHOR', ['kind', 'id', 'displayName', 'status']);
  req('TRM-DEMO-GC', ['kind', 'id', 'title', 'materialType']);

  const doc = byKey.get('DOC-DEMO-SOP').payload;
  assert.equal(doc.lifecycleId, 'document-controlled-signing');
  assert.equal(doc.state, 'draft');
  assert.equal(doc.authorRef.id, BRAD_ID, 'authorRef must be a USR-* id (QMS-1 (e))');

  const trr = byKey.get('TRR-DEMO-1').payload;
  assert.equal(trr.trainingMaterialRef.type, 'controlled-document');
  assert.equal(trr.trainingMaterialRef.id, 'DOC-DEMO-SOP', 'TRR points at the SOP canon (QMS-1 (g\'))');
  assert.match(trr.notes, /revision: Rev A \(DEMO\)/, 'trained-against revision recorded in notes');

  const cal = byKey.get('CAL-DEMO-GC').payload;
  assert.equal(cal.equipmentRef.id, 'EQP-DEMO-GC');

  const grantR = byKey.get('GRANT-DEMO-REVIEWER').payload;
  assert.deepEqual(grantR.roles, ['reviewer', 'approver']);
  assert.equal(byKey.get('GRANT-DEMO-AUTHOR').payload.roles.join(), 'author');
});

test('planActions: skip-if-exists is absolute; linkage is write-once', () => {
  const fixtures = buildFixtures(NOW);
  const existing = new Map([['DOC-DEMO-SOP', { state: 'effective' }]]); // advanced lifecycle
  const plans = planActions(existing, fixtures);
  const doc = plans.find((p) => p.fixture.key === 'DOC-DEMO-SOP');
  assert.equal(doc.action, 'skip', 'an existing fixture is NEVER updated, whatever its state');

  const linked = planActions(
    new Map([[BRAD_ID, { personRef: { kind: 'record', type: 'person', id: 'PER-DEMO-AUTHOR' } }]]),
    fixtures,
  ).find((p) => p.fixture.key === 'LINK-USR-BRAD');
  assert.equal(linked.action, 'skip', 'already-correct personRef ⇒ no PUT');

  const conflict = planActions(
    new Map([[BRAD_ID, { personRef: { kind: 'record', type: 'person', id: 'PER-SOMEONE-ELSE' } }]]),
    fixtures,
  ).find((p) => p.fixture.key === 'LINK-USR-BRAD');
  assert.equal(conflict.action, 'linkage-conflict', 'different personRef ⇒ STOP, never overwrite');

  const unset = planActions(new Map([[BRAD_ID, {}]]), fixtures).find((p) => p.fixture.key === 'LINK-USR-BRAD');
  assert.equal(unset.action, 'link', 'unset personRef ⇒ set it once');
});

// ---------------------------------------------------------------------------
// Fake server to drive runSeed() end-to-end without HTTP.
// ---------------------------------------------------------------------------

function makeFakeStore({ existingRecords = new Map(), meResponses } = {}) {
  const records = new Map(existingRecords); // id → payload
  const requests = []; // { method, route, headers, body }
  const grantsByAdminOnly = true;

  const fetchImpl = async (url, init = {}) => {
    const { method = 'GET', headers = {}, body } = init;
    const parsed = new URL(url);
    const route = parsed.pathname;
    const json = body ? JSON.parse(body) : undefined;
    requests.push({ method, route, headers, body: json });
    const reply = (status, obj) =>
      new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

    if (method === 'POST' && route === '/api/auth/login') {
      return reply(200, { success: true, token: 'FAKE-TOKEN', userId: LOCAL_ADMIN_ID });
    }
    if (method === 'GET' && route === '/api/me') {
      const me = meResponses ? meResponses(headers) : { userId: LOCAL_ADMIN_ID, isSystem: true };
      return reply(200, me);
    }
    if (method === 'GET' && route.startsWith('/api/records/')) {
      const id = decodeURIComponent(route.slice('/api/records/'.length));
      const payload = records.get(id);
      if (!payload) return reply(404, { error: 'NOT_FOUND' });
      return reply(200, { record: { recordId: id, payload } });
    }
    if (method === 'POST' && route === '/api/records') {
      const p = json?.payload ?? {};
      const id = p.recordId ?? p.id;
      if (p.kind === 'role-grant' && grantsByAdminOnly) {
        const me = meResponses ? meResponses(headers) : { userId: LOCAL_ADMIN_ID, isSystem: true };
        const adminish =
          headers['x-cl-session'] === 'FAKE-TOKEN' ||
          (headers['x-user-id'] === LOCAL_ADMIN_ID && me.userId === LOCAL_ADMIN_ID && me.isSystem === true);
        if (!adminish) return reply(403, { error: 'GRANT_FORBIDDEN' });
        records.set(id, { ...p, grantedBy: headers['x-cl-session'] ? LOCAL_ADMIN_ID : headers['x-user-id'] });
        return reply(200, { success: true });
      }
      records.set(id, { ...p, createdBy: headers['x-user-id'] ?? BRAD_ID });
      return reply(200, { success: true });
    }
    if (method === 'PUT' && route.startsWith('/api/records/')) {
      const id = decodeURIComponent(route.slice('/api/records/'.length));
      if (!records.has(id)) return reply(404, { error: 'NOT_FOUND' });
      records.set(id, { ...records.get(id), ...json.payload });
      return reply(200, { success: true });
    }
    return reply(400, { error: 'UNHANDLED', route, method });
  };

  return { fetchImpl, records, requests };
}

test('run 1 on an empty store creates everything; grants minted via admin actor', async () => {
  const store = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
  });
  const result = await runSeed({ baseUrl: 'http://fake', fetchImpl: store.fetchImpl, env: {} });
  assert.equal(result.stopped, false, result.stopReason);
  for (const s of result.summary) assert.equal(s.status, 'created', `${s.key}: ${s.status} ${s.note ?? ''}`);

  assert.equal(store.records.get('DOC-DEMO-SOP').createdBy, BRAD_ID, 'doc created as USR-BRAD');
  assert.equal(store.records.get('GRANT-DEMO-AUTHOR').grantedBy, LOCAL_ADMIN_ID);
  assert.equal(store.records.get('GRANT-DEMO-REVIEWER').grantedBy, LOCAL_ADMIN_ID);
  assert.equal(store.records.get(BRAD_ID).personRef.id, 'PER-DEMO-AUTHOR');
  assert.equal(store.records.get(QMS_ADMIN_ID).personRef.id, 'PER-DEMO-REVIEWER');
  assert.equal(store.records.get('GRANT-DEMO-REVIEWER').userId, QMS_ADMIN_ID,
    'reviewer/approver grant targets the ordinary login-capable actor');
});

test('run 2 against a populated store issues NO POST/PUT — every fixture skipped', async () => {
  const store1 = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
  });
  await runSeed({ baseUrl: 'http://fake', fetchImpl: store1.fetchImpl, env: {} });

  // Simulate a fixture that ADVANCED its lifecycle since run 1 (must not revert).
  store1.records.set('DOC-DEMO-SOP', { ...store1.records.get('DOC-DEMO-SOP'), state: 'effective' });

  const store2 = makeFakeStore({ existingRecords: store1.records });
  const result = await runSeed({ baseUrl: 'http://fake', fetchImpl: store2.fetchImpl, env: {} });
  assert.equal(result.stopped, false, result.stopReason);
  for (const s of result.summary) assert.equal(s.status, 'skipped', `${s.key}: ${s.status}`);

  const writes = store2.requests.filter((r) => (r.method === 'POST' && r.route === '/api/records') || r.method === 'PUT');
  assert.deepEqual(writes, [], 'rerun must issue zero POST/PUT for existing fixtures');
  assert.equal(store2.records.get('DOC-DEMO-SOP').state, 'effective', 'advanced state preserved');
});

test('linkage write-once over HTTP: correct personRef ⇒ no PUT; different ⇒ STOP', async () => {
  // Already-correct linkage: no PUT at all.
  const okStore = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', personRef: { kind: 'record', type: 'person', id: 'PER-DEMO-AUTHOR' } }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', personRef: { kind: 'record', type: 'person', id: 'PER-DEMO-REVIEWER' } }],
    ]),
  });
  const okResult = await runSeed({ baseUrl: 'http://fake', fetchImpl: okStore.fetchImpl, env: {} });
  assert.equal(okResult.stopped, false);
  assert.deepEqual(okStore.requests.filter((r) => r.method === 'PUT'), []);

  // Conflicting linkage on USR-BRAD: STOP, no PUT, remaining fixtures not-run.
  const badStore = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', personRef: { kind: 'record', type: 'person', id: 'PER-OTHER' } }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user' }],
    ]),
  });
  const badResult = await runSeed({ baseUrl: 'http://fake', fetchImpl: badStore.fetchImpl, env: {} });
  assert.equal(badResult.stopped, true);
  assert.match(badResult.stopReason, /already linked to PER-OTHER/);
  assert.deepEqual(badStore.requests.filter((r) => r.method === 'PUT'), [], 'must not force-overwrite linkage');
  assert.equal(badResult.summary.find((s) => s.key === 'LINK-USR-BRAD').status, 'STOPPED');
});

test('no request body anywhere contains a password key; only login could carry one', async () => {
  // Drive the CL_SEED_ADMIN_PASSWORD branch too, so the login route exists.
  const store = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
  });
  const result = await runSeed({
    baseUrl: 'http://fake',
    fetchImpl: store.fetchImpl,
    env: { CL_SEED_ADMIN_PASSWORD: 'sentinel-not-stored-in-records' },
  });
  assert.equal(result.stopped, false, result.stopReason);

  const containsPasswordKey = (obj) =>
    obj !== null && typeof obj === 'object'
      ? Object.entries(obj).some(([k, v]) => k === 'password' || containsPasswordKey(v))
      : false;
  for (const req of store.requests) {
    const mayCarry = req.method === 'POST' && req.route === '/api/auth/login';
    if (!mayCarry) {
      assert.equal(containsPasswordKey(req.body), false, `${req.method} ${req.route} body contains a password key`);
    }
  }
  const login = store.requests.find((r) => r.route === '/api/auth/login');
  assert.ok(login, 'password env must be exercised via the login route only');
  assert.equal(login.body.username, 'local-admin');
  assert.equal(login.body.password, 'sentinel-not-stored-in-records');
});

test('admin STOP fires when /api/me reports a non-admin or non-system identity', async () => {
  const store = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
    // The trap: with an admin credential the header degrades to USR-BRAD.
    meResponses: () => ({ userId: BRAD_ID, isSystem: false }),
  });
  const result = await runSeed({ baseUrl: 'http://fake', fetchImpl: store.fetchImpl, env: {} });
  assert.equal(result.stopped, true);
  assert.equal(result.stopReason, AUTH_STOP_MESSAGE);
  assert.match(result.stopReason, /^STOP: /);
  assert.match(result.stopReason, /CL_SEED_ADMIN_PASSWORD/);
  // The stop text names set-password only to explain why the bootstrap-window
  // call CANNOT work; it must not instruct the operator to run it.
  assert.match(result.stopReason, /set-password CANNOT/);
  assert.doesNotMatch(result.stopReason, /curl .*set-password/);
  // Nothing was written at all.
  assert.deepEqual(store.requests.filter((r) => r.method === 'POST' || r.method === 'PUT'), []);
});

test('fail-closed: a missing referenced prerequisite stops the seed naming it', async () => {
  // Store that 404s EQP-DEMO-GC even after 'create' (simulate broken persistence).
  const base = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
  });
  const brokenFetch = async (url, init = {}) => {
    const res = await base.fetchImpl(url, init);
    if ((init.method ?? 'GET') === 'GET' && url.endsWith('/api/records/EQP-DEMO-GC')) {
      return new Response(JSON.stringify({ error: 'NOT_FOUND' }), { status: 404 });
    }
    return res;
  };
  const result = await runSeed({ baseUrl: 'http://fake', fetchImpl: brokenFetch, env: {} });
  assert.equal(result.stopped, true);
  assert.match(result.stopReason, /^STOP: /);
  assert.match(result.stopReason, /EQP-DEMO-GC/);
  assert.equal(result.summary.find((s) => s.key === 'EQP-DEMO-GC').status, 'STOPPED',
    'seed stops at the broken prerequisite read-back');
  assert.equal(result.summary.find((s) => s.key === 'CAL-DEMO-GC').status, 'not-run',
    'CAL-DEMO-GC never runs rather than emitting a dangling equipmentRef');
  for (const key of ['GRANT-DEMO-AUTHOR', 'GRANT-DEMO-REVIEWER']) {
    assert.equal(result.summary.find((s) => s.key === key).status, 'not-run');
  }
});

test('the seed never writes signature or audit-event records', async () => {
  const store = makeFakeStore({
    existingRecords: new Map([
      [BRAD_ID, { recordId: BRAD_ID, kind: 'user', username: 'brad' }],
      [LOCAL_ADMIN_ID, { recordId: LOCAL_ADMIN_ID, kind: 'user', username: 'local-admin' }],
      [QMS_ADMIN_ID, { recordId: QMS_ADMIN_ID, kind: 'user', username: 'qms-admin' }],
    ]),
  });
  await runSeed({ baseUrl: 'http://fake', fetchImpl: store.fetchImpl, env: {} });
  const kinds = [...store.records.values()].map((p) => p.kind);
  assert.ok(!kinds.includes('signature'));
  assert.ok(!kinds.includes('audit-event'));
  assert.ok(!store.requests.some((r) => r.route.startsWith('/api/signatures')));
  assert.ok(!store.requests.some((r) => r.route.startsWith('/auth/set-password')));
});
