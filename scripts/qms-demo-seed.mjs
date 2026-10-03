#!/usr/bin/env node
/**
 * QMS-4 — Minimal DEMO seed for the light-qms-records-browser campaign.
 *
 * Spec: .hermes/plans/2026-10-03_qms-4-demo-seed-spec.md (authoritative).
 * Creates the minimal DEMO fixture set through the record API only:
 *   PER-DEMO-AUTHOR, PER-DEMO-REVIEWER, user→person linkage (write-once),
 *   DOC-DEMO-SOP, TRM-DEMO-GC, TRR-DEMO-1 (→ DOC-DEMO-SOP canon),
 *   EQP-DEMO-GC, CAL-DEMO-GC (→ EQP-DEMO-GC), GRANT-DEMO-AUTHOR,
 *   GRANT-DEMO-REVIEWER (minted via the verified local-admin actor path).
 *
 * Non-negotiables encoded here:
 *  - NO passwords, NO users, NO signature/audit records are ever written.
 *  - Every id carries a DEMO segment; every human title starts with "DEMO ".
 *  - Idempotency = skip-if-exists: a rerun NEVER updates an existing fixture.
 *    Only User.personRef linkage is writable, and write-ONCE (different
 *    existing personRef id ⇒ STOP, never overwrite another session's linkage).
 *  - Fail closed: any unresolvable reference or rejected prerequisite stops
 *    the seed with one message naming the missing config and the fix command.
 *  - The contract lives in the schema/lifecycle YAML; this script contains NO
 *    role→action table and NO state inference — just explicit payloads.
 *
 * Env: CL_API_BASE (default http://localhost:3001),
 *      CL_SEED_ADMIN_PASSWORD (optional; see §Auth in the spec).
 */
import { pathToFileURL } from 'node:url';

export const DEFAULT_BASE_URL = 'http://localhost:3001';
export const SCHEMA_BASE = 'https://computable-lab.com/schema/computable-lab/';

export const BRAD_ID = 'USR-BRAD';
export const LOCAL_ADMIN_ID = 'USR-LOCAL-ADMIN';
export const LOCAL_ADMIN_USERNAME = 'local-admin';

/** Exact §Auth stop text from the spec (verbatim contract). */
export const AUTH_STOP_MESSAGE =
  'STOP: the Local Admin bootstrap window is closed and CL_SEED_ADMIN_PASSWORD is not set. ' +
  'Either run: curl -s -X POST localhost:3001/api/auth/set-password ' +
  "-H 'x-user-id: USR-LOCAL-ADMIN' -H 'content-type: application/json' " +
  `-d '{"password":"<choose>"}' (bootstrap window only), or ` +
  'export CL_SEED_ADMIN_PASSWORD=<the admin password> and rerun.';

/**
 * Ordered fixture descriptors. `actor` is 'author' (x-user-id: USR-BRAD) or
 * 'admin' (the resolved local-admin actor path — see resolveAdminActor).
 * `requires` names ids that must read back 2xx before this fixture may be
 * created (fail-closed reference gate — never emit a dangling ref).
 */
export function buildFixtures(nowIso) {
  const iso = new Date(nowIso).toISOString();
  return [
    {
      key: 'PER-DEMO-AUTHOR',
      id: 'PER-DEMO-AUTHOR',
      actor: 'author',
      requires: [],
      schemaId: `${SCHEMA_BASE}person.schema.yaml`,
      payload: {
        kind: 'person',
        id: 'PER-DEMO-AUTHOR',
        displayName: 'DEMO Author (USR-BRAD)',
        status: 'active',
        notes: 'DEMO fixture — QMS-4, not real personnel.',
      },
    },
    {
      key: 'PER-DEMO-REVIEWER',
      id: 'PER-DEMO-REVIEWER',
      actor: 'author',
      requires: [],
      schemaId: `${SCHEMA_BASE}person.schema.yaml`,
      payload: {
        kind: 'person',
        id: 'PER-DEMO-REVIEWER',
        displayName: 'DEMO Reviewer (USR-LOCAL-ADMIN)',
        status: 'active',
        notes: 'DEMO fixture — QMS-4, not real personnel.',
      },
    },
    {
      key: 'LINK-USR-BRAD',
      linkage: {
        userId: BRAD_ID,
        personId: 'PER-DEMO-AUTHOR',
        actor: 'author',
      },
      requires: ['PER-DEMO-AUTHOR'],
    },
    {
      key: 'LINK-USR-LOCAL-ADMIN',
      linkage: {
        userId: LOCAL_ADMIN_ID,
        personId: 'PER-DEMO-REVIEWER',
        actor: 'admin',
      },
      requires: ['PER-DEMO-REVIEWER'],
    },
    {
      key: 'DOC-DEMO-SOP',
      id: 'DOC-DEMO-SOP',
      actor: 'author', // MUST be USR-BRAD so createdBy === authorRef.id (QMS-1 (e))
      requires: [],
      schemaId: `${SCHEMA_BASE}controlled-document.schema.yaml`,
      payload: {
        kind: 'controlled-document',
        id: 'DOC-DEMO-SOP',
        title: 'DEMO GC-FID Standard Injection SOP',
        state: 'draft',
        lifecycleId: 'document-controlled-signing',
        docType: 'sop',
        revision: 'Rev A (DEMO)',
        body: '<h2>DEMO GC-FID standard injection</h2><p>Sandbox-only fixture authored by QMS-4; not a real procedure.</p>',
        authorRef: { kind: 'record', type: 'user', id: BRAD_ID },
      },
    },
    {
      key: 'TRM-DEMO-GC',
      id: 'TRM-DEMO-GC',
      actor: 'author',
      requires: [],
      schemaId: `${SCHEMA_BASE}training-material.schema.yaml`,
      payload: {
        kind: 'training-material',
        id: 'TRM-DEMO-GC',
        title: 'DEMO GC-FID familiarisation deck',
        materialType: 'slide_deck',
        version: 'DEMO-1',
      },
    },
    {
      key: 'TRR-DEMO-1',
      id: 'TRR-DEMO-1',
      actor: 'author',
      requires: ['PER-DEMO-AUTHOR', 'DOC-DEMO-SOP'],
      schemaId: `${SCHEMA_BASE}training-record.schema.yaml`,
      payload: {
        kind: 'training-record',
        id: 'TRR-DEMO-1',
        personRef: { kind: 'record', type: 'person', id: 'PER-DEMO-AUTHOR' },
        trainingMaterialRef: { kind: 'record', type: 'controlled-document', id: 'DOC-DEMO-SOP' },
        status: 'completed',
        completedAt: iso,
        notes: 'DEMO fixture — trained against DOC-DEMO-SOP revision: Rev A (DEMO)',
      },
    },
    {
      key: 'EQP-DEMO-GC',
      id: 'EQP-DEMO-GC',
      actor: 'author',
      requires: [],
      schemaId: `${SCHEMA_BASE}equipment.schema.yaml`,
      payload: {
        kind: 'equipment',
        id: 'EQP-DEMO-GC',
        name: 'DEMO GC-FID system',
        status: 'active',
      },
    },
    {
      key: 'CAL-DEMO-GC',
      id: 'CAL-DEMO-GC',
      actor: 'author',
      requires: ['EQP-DEMO-GC', 'PER-DEMO-AUTHOR'],
      schemaId: `${SCHEMA_BASE}calibration-record.schema.yaml`,
      payload: {
        kind: 'calibration-record',
        id: 'CAL-DEMO-GC',
        equipmentRef: { kind: 'record', type: 'equipment', id: 'EQP-DEMO-GC' },
        performedAt: iso,
        status: 'pass',
        performedByRef: { kind: 'record', type: 'person', id: 'PER-DEMO-AUTHOR' },
        notes: 'DEMO fixture — not a real calibration.',
      },
    },
    {
      key: 'GRANT-DEMO-AUTHOR',
      id: 'GRANT-DEMO-AUTHOR',
      actor: 'admin', // grants require the verified local-admin/system actor (role-grant.lint.yaml)
      requires: ['USR-BRAD'],
      schemaId: `${SCHEMA_BASE}role-grant.schema.yaml`,
      payload: {
        kind: 'role-grant',
        recordId: 'GRANT-DEMO-AUTHOR',
        userId: BRAD_ID,
        roles: ['author'],
        lifecycleId: 'document-controlled-signing',
        notes: 'DEMO fixture.',
      },
    },
    {
      key: 'GRANT-DEMO-REVIEWER',
      id: 'GRANT-DEMO-REVIEWER',
      actor: 'admin',
      requires: ['USR-LOCAL-ADMIN'],
      schemaId: `${SCHEMA_BASE}role-grant.schema.yaml`,
      payload: {
        kind: 'role-grant',
        recordId: 'GRANT-DEMO-REVIEWER',
        userId: LOCAL_ADMIN_ID,
        roles: ['reviewer', 'approver'],
        lifecycleId: 'document-controlled-signing',
        notes:
          'DEMO fixture — holds both gated roles so one demo identity can complete the lap; ' +
          'USR-BRAD intentionally holds only "author" so the regulated denial lap (QMS-7) has a real under-granted actor.',
      },
    },
  ];
}

/**
 * Pure planning: given a map of id → existing payload (or undefined when the
 * GET was a 404), decide the action per fixture. skip-if-exists is absolute —
 * an existing fixture is NEVER updated. Linkage is write-once.
 */
export function planActions(existing, fixtures = buildFixtures(new Date().toISOString())) {
  return fixtures.map((fixture) => {
    if (fixture.linkage) {
      const current = existing.get(fixture.linkage.userId);
      if (!current) return { fixture, action: 'user-missing' };
      const ref = current.personRef;
      if (ref && typeof ref === 'object' && ref.id === fixture.linkage.personId) {
        return { fixture, action: 'skip' };
      }
      if (ref && typeof ref === 'object' && ref.id !== fixture.linkage.personId) {
        return { fixture, action: 'linkage-conflict', foundId: ref.id };
      }
      return { fixture, action: 'link' };
    }
    return { fixture, action: existing.has(fixture.id) ? 'skip' : 'create' };
  });
}

async function api(fetchImpl, baseUrl, method, route, { headers = {}, body } = {}) {
  const res = await fetchImpl(`${baseUrl}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, ok: res.status >= 200 && res.status < 300, json };
}

const stopMessageForMissing = (what, wantedBy) =>
  `STOP: ${wantedBy} requires ${what}, but ${what} could not be created or read back from the record API. ` +
  `Fix: start the server and rerun: CL_API_BASE=${process.env.CL_API_BASE ?? DEFAULT_BASE_URL} node scripts/qms-demo-seed.mjs ` +
  `(if ${what} exists but is broken, restore it in the data repo — the seed never substitutes a different record).`;

/**
 * §Auth resolution (never guess):
 *  1. CL_SEED_ADMIN_PASSWORD → POST /api/auth/login → x-cl-session token.
 *  2. else x-user-id: USR-LOCAL-ADMIN AND GET /api/me must VERIFY
 *     userId==='USR-LOCAL-ADMIN' && isSystem===true (bootstrap window open).
 *  3. else STOP with AUTH_STOP_MESSAGE (the header silently degrades to
 *     USR-BRAD once an admin credential exists — detect, never discover).
 */
export async function resolveAdminActor({ baseUrl, fetchImpl, env }) {
  const password = env.CL_SEED_ADMIN_PASSWORD;
  if (password !== undefined && password !== '') {
    const login = await api(fetchImpl, baseUrl, 'POST', '/api/auth/login', {
      body: { username: LOCAL_ADMIN_USERNAME, password },
    });
    if (!login.ok || !login.json?.token) {
      return {
        stop:
          `STOP: CL_SEED_ADMIN_PASSWORD is set but POST /api/auth/login for username ` +
          `'${LOCAL_ADMIN_USERNAME}' failed (HTTP ${login.status}: ` +
          `${JSON.stringify(login.json ?? {})}). Fix: export CL_SEED_ADMIN_PASSWORD=<the correct admin password> ` +
          `or unset it while the bootstrap window is open, then rerun.`,
      };
    }
    return { headers: { 'x-cl-session': login.json.token }, mode: 'session' };
  }
  const me = await api(fetchImpl, baseUrl, 'GET', '/api/me', {
    headers: { 'x-user-id': LOCAL_ADMIN_ID },
  });
  if (me.ok && me.json?.userId === LOCAL_ADMIN_ID && me.json?.isSystem === true) {
    return { headers: { 'x-user-id': LOCAL_ADMIN_ID }, mode: 'bootstrap-header' };
  }
  return { stop: AUTH_STOP_MESSAGE };
}

/**
 * Run the seed. Testable via fetchImpl injection; process.exit lives only in
 * the CLI tail below, never here.
 */
export async function runSeed({ baseUrl = process.env.CL_API_BASE ?? DEFAULT_BASE_URL, fetchImpl = fetch, env = {} } = {}) {
  const fixtures = buildFixtures(new Date().toISOString());
  const summary = []; // { key, status: 'created'|'skipped'|'STOPPED'|'not-run', note? }
  const finished = (key, status, note) => summary.push({ key, status, ...(note ? { note } : {}) });
  const stopAll = (stoppedKey, message) => {
    finished(stoppedKey, 'STOPPED', message);
    for (const f of fixtures) {
      if (!summary.some((s) => s.key === f.key)) finished(f.key, 'not-run');
    }
    return { summary, stopped: true, stopReason: message };
  };

  const author = { headers: { 'x-user-id': BRAD_ID } };
  const admin = await resolveAdminActor({ baseUrl, fetchImpl, env });
  if (admin.stop) return stopAll('AUTH', admin.stop);
  const headersFor = (actor) => (actor === 'admin' ? admin.headers : author.headers);

  const readRecord = async (id) => api(fetchImpl, baseUrl, 'GET', `/api/records/${encodeURIComponent(id)}`);

  for (const fixture of fixtures) {
    // Fail-closed reference gate: every referenced id must read back 2xx.
    for (const req of fixture.requires) {
      const check = await api(fetchImpl, baseUrl, 'GET', `/api/records/${encodeURIComponent(req)}`, {
        headers: headersFor(fixture.actor),
      });
      if (!check.ok) {
        return stopAll(
          fixture.key,
          stopMessageForMissing(req, fixture.key) + ` [read-back HTTP ${check.status}]`,
        );
      }
    }

    if (fixture.linkage) {
      const { userId, personId, actor } = fixture.linkage;
      const got = await readRecord(userId);
      if (!got.ok) {
        return stopAll(fixture.key, stopMessageForMissing(userId, fixture.key) + ` [read HTTP ${got.status}]`);
      }
      const currentPayload = got.json?.record?.payload ?? {};
      const [plan] = planActions(new Map([[userId, currentPayload]]), [fixture]);
      if (plan.action === 'skip') {
        finished(fixture.key, 'skipped', `${userId}.personRef already → ${personId}`);
        continue;
      }
      if (plan.action === 'linkage-conflict') {
        return stopAll(
          fixture.key,
          `STOP: ${userId}.personRef is already linked to ${plan.foundId}, not ${personId}. ` +
            `The seed never overwrites another session's linkage. Fix the data repo or unlink via the app, then rerun.`,
        );
      }
      const merged = {
        ...currentPayload,
        personRef: { kind: 'record', type: 'person', id: personId },
      };
      const put = await api(fetchImpl, baseUrl, 'PUT', `/api/records/${encodeURIComponent(userId)}`, {
        headers: headersFor(actor),
        body: { payload: merged, message: 'QMS-4 DEMO seed: link user to DEMO person (write-once)' },
      });
      if (!put.ok) {
        return stopAll(
          fixture.key,
          `STOP: linking ${userId} → ${personId} was rejected by the server ` +
            `(HTTP ${put.status}: ${JSON.stringify(put.json ?? {})}). Reporting verbatim per spec — not proceeding with a half-linkage.`,
        );
      }
      finished(fixture.key, 'created', `${userId}.personRef → ${personId}`);
      continue;
    }

    const exists = await api(fetchImpl, baseUrl, 'GET', `/api/records/${encodeURIComponent(fixture.id)}`, {
      // Existence and read-back must use the fixture's own actor: role-grant
      // records are privileged and read back 404 to non-admin actors.
      headers: headersFor(fixture.actor),
    });
    if (exists.ok) {
      finished(fixture.key, 'skipped');
      continue;
    }
    if (exists.status !== 404) {
      return stopAll(
        fixture.key,
        `STOP: GET /api/records/${fixture.id} returned HTTP ${exists.status} ` +
          `(expected 200 or 404). ${JSON.stringify(exists.json ?? {})}`,
      );
    }
    const created = await api(fetchImpl, baseUrl, 'POST', '/api/records', {
      headers: headersFor(fixture.actor),
      body: { schemaId: fixture.schemaId, payload: fixture.payload, message: 'QMS-4 DEMO seed' },
    });
    if (!created.ok || created.json?.success === false) {
      return stopAll(
        fixture.key,
        `STOP: creating ${fixture.id} failed (HTTP ${created.status}: ${JSON.stringify(created.json ?? {})}). ` +
          `If a schema/lint gate rejected it, the named contract changed — fix the ${fixture.schemaId} contract, do not mutate the payload.`,
      );
    }
    // Read-back confirmation: a fixture that cannot be read back is a STOP
    // (never let a dangling reference depend on it).
    const back = await api(fetchImpl, baseUrl, 'GET', `/api/records/${encodeURIComponent(fixture.id)}`, {
      headers: headersFor(fixture.actor),
    });
    if (!back.ok) {
      return stopAll(fixture.key, stopMessageForMissing(fixture.id, 'the seed (read-back)') + ` [read-back HTTP ${back.status}]`);
    }
    finished(fixture.key, 'created');
  }

  return { summary, stopped: false, adminMode: admin.mode };
}

/** CLI: prints the id → created|skipped|STOPPED table; exits non-zero on STOP. */
export function formatSummary(summary) {
  const width = Math.max(...summary.map((s) => s.key.length));
  const lines = summary.map((s) => `  ${s.key.padEnd(width)}  ${s.status}${s.note ? `  (${s.note})` : ''}`);
  return ['Seed summary:', ...lines].join('\n');
}

const isMain =
  typeof process !== 'undefined' &&
  process.argv?.[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  const baseUrl = process.env.CL_API_BASE ?? DEFAULT_BASE_URL;
  console.log(`QMS-4 DEMO seed → ${baseUrl}`);
  const result = await runSeed({ baseUrl, env: process.env });
  console.log(formatSummary(result.summary));
  if (result.stopped) {
    console.error(result.stopReason);
    process.exit(1);
  }
  console.log(`Admin actor mode: ${result.adminMode}. All fixtures resolved.`);
}
