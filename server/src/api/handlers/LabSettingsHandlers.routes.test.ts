/**
 * QMS-8-POLICY-BUNDLE-SWITCH — route-level tests for PATCH /settings/lab.
 *
 * Defect L1-A (ruling 20261010): SettingsPage called apiClient.patchLabSettings
 * against a route that did not exist (live probe at base 14637f6d:
 * PATCH /api/settings/lab -> 404 {"message":"Route PATCH:/api/settings/lab not found"}).
 *
 * These tests run the REAL registration path (registerRoutes from
 * server/src/api/routes.ts) with the REAL PolicyBundleService loaded from
 * schema/core/policy-bundles (data, not a hardcoded list) and the REAL
 * ConfigHandlers writer (writeConfigYaml atomic tmp+rename + in-memory
 * reassign + onConfigUpdate) against a temp config file.
 *
 * FIX-RUN-1 (adversarial defect 3): identity resolution here is the SHIPPED
 * LocalIdentityService (server.ts:493 constructs it the same way — store +
 * SessionStore) over a fake RecordStore, NOT a stub. The old stub returned
 * {userId:null} for a headerless request; the shipped resolver instead falls
 * back to the first active user or the bootstrap USR-LOCAL-ADMIN with
 * isSystem:true (LocalIdentityService.ts:103-138). Only the shipped semantics
 * can prove the gate fails closed in production.
 *
 * Process lesson (QMS-7): a service-level test passed while the shipped route
 * was absent. This file proves the ROUTE exists and behaves — GET-after-PATCH
 * in the SAME process is the live-accessor proof (the snapshot trap: a handler
 * that captured appConfig at construction would keep serving the stale bundle
 * after a successful write).
 */
import { describe, expect, it } from 'vitest'
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { stringify } from 'yaml'
import { ConfigHandlers } from './configHandlers.js'
import { createLabSettingsHandlers } from './LabSettingsHandlers.js'
import { registerRoutes } from '../routes.js'
import { PolicyBundleService } from '../../policy/PolicyBundleService.js'
import { RoleResolver } from '../../security/RoleResolver.js'
import { LocalIdentityService, USER_SCHEMA_ID, type ResolvedRequestUser } from '../../security/LocalIdentityService.js'
import { SessionStore } from '../../security/SessionStore.js'
import { AuditEventService } from '../../governance/AuditEventService.js'
import { DEFAULT_CONFIG } from '../../config/types.js'
import type { RecordEnvelope, RecordStore } from '../../store/types.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const BUNDLES_DIR = resolve(__dirname, '../../../../schema/core/policy-bundles')

/** Minimal handler stubs for the unconditional registerRoutes registrations. */
function stubRouteOptions() {
  const noop = async () => ({})
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
  }
}

/** Active user envelope shaped exactly like LocalIdentityService's own bootstrap record. */
function userEnvelope(recordId: string): RecordEnvelope {
  const now = new Date().toISOString()
  return {
    recordId,
    schemaId: USER_SCHEMA_ID,
    payload: {
      kind: 'user',
      recordId,
      username: recordId.toLowerCase(),
      displayName: recordId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    },
    meta: { createdAt: now, updatedAt: now, createdBy: 'system' },
  }
}

/** In-memory user store covering exactly the calls LocalIdentityService makes
 *  (list({kind:'user'}), get, create) — the shipped resolver runs UNMODIFIED over it. */
function fakeUserStore(users: Map<string, RecordEnvelope>) {
  return {
    list: async (filter?: { kind?: string }) =>
      filter?.kind && filter.kind !== 'user' ? [] : [...users.values()],
    get: async (recordId: string) => users.get(recordId) ?? null,
    create: async ({ envelope }: { envelope: RecordEnvelope }) => {
      users.set(envelope.recordId, envelope)
      return { success: true as const, envelope }
    },
  } as unknown as RecordStore
}

interface HarnessOptions {
  grants?: Record<string, string[]>
  /** Pre-existing active users (empty map = the bootstrap-only fresh-install state). */
  users?: RecordEnvelope[]
  /** Skip loadFromDir: the empty/absent bundle-registry state. */
  emptyRegistry?: boolean
  /** Force the identity resolver to throw (store-failure state). */
  resolverThrows?: boolean
}

interface Harness {
  app: FastifyInstance
  dir: string
  configPath: string
  /** Mirrors server.ts ctx: onConfigUpdate REASSIGNS this — a snapshot-captured
   *  handler would not see it (the snapshot trap). */
  live: { current: typeof DEFAULT_CONFIG }
  /** Records created through the harness store (audit-event receipts land here). */
  created: RecordEnvelope[]
  /** The real SessionStore (server.ts:493 pattern) — mint tokens via create(). */
  sessionStore: SessionStore
  cleanup: () => Promise<void>
}

async function buildHarness(options: HarnessOptions = {}): Promise<Harness> {
  const { grants = {}, users = [], emptyRegistry = false, resolverThrows = false } = options
  const dir = await mkdtemp(join(tmpdir(), 'qms8-labsettings-'))
  const configPath = join(dir, 'config.yaml')
  const baseConfig = structuredClone(DEFAULT_CONFIG)
  await writeFile(configPath, stringify(baseConfig), 'utf-8')

  const live = { current: baseConfig }

  const bundleService = new PolicyBundleService()
  if (!emptyRegistry) {
    const loaded = bundleService.loadFromDir(BUNDLES_DIR)
    if (loaded < 4) throw new Error(`Expected the 4 shipped policy bundles, loaded ${loaded}`)
  }

  // The real config-writer path: atomic tmp+rename + in-memory reassign +
  // onConfigUpdate (which reassigns the live ref, exactly like server.ts).
  const configHandlers = new ConfigHandlers(configPath, baseConfig, async (updated) => {
    live.current = updated
  })

  const grantStore = {
    list: async () => Object.entries(grants).map(
      ([userId, roles]) => ({ recordId: `GRANT-${userId}`, payload: { kind: 'role-grant', userId, roles } }) as unknown as RecordEnvelope,
    ),
  } as unknown as RecordStore
  const roleResolver = new RoleResolver(grantStore)

  // Audit sink: captures what AuditEventService would persist (docs §1
  // policy_bundle_changed contract) without a real record store.
  const created: RecordEnvelope[] = []
  const auditStore = {
    create: async ({ envelope }: { envelope: RecordEnvelope }) => {
      created.push(envelope)
      return { success: true as const, envelope }
    },
  } as unknown as RecordStore
  const auditService = new AuditEventService(auditStore)

  // SHIPPED identity resolution (adversarial defect 3): the real
  // LocalIdentityService over a fake user store + the real SessionStore —
  // constructed exactly as server.ts:493 does. NO stub.
  const userMap = new Map(users.map((u) => [u.recordId, u]))
  const sessionStore = new SessionStore(dir)
  const identityService = new LocalIdentityService(fakeUserStore(userMap), sessionStore)
  const resolveRequestUser = resolverThrows
    ? (async (): Promise<ResolvedRequestUser> => { throw new Error('store unavailable') })
    : (request: FastifyRequest) => identityService.resolveRequestUser(request)

  const handlers = createLabSettingsHandlers({
    // LIVE accessor, not a snapshot (server.ts:755 pattern).
    getAppConfig: () => live.current,
    bundleService,
    // Persistence reuses the PATCH /api/config writer (same wiring as server.ts).
    patchConfig: (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) =>
      configHandlers.patchConfig(request as unknown as Parameters<typeof configHandlers.patchConfig>[0], reply),
    resolveRequestUser,
    roleResolver,
    auditService,
  })

  const app = Fastify()
  await app.register(async (instance) => {
    registerRoutes(instance, { ...stubRouteOptions(), labSettingsHandlers: handlers })
  }, { prefix: '/api' })
  await app.ready()

  return { app, dir, configPath, live, created, sessionStore, cleanup: async () => { await app.close(); await rm(dir, { recursive: true, force: true }) } }
}

/** Populated lane-like state: an active admin user + an active non-admin user. */
const POPULATED_USERS = [userEnvelope('USR-QMS-ADMIN'), userEnvelope('USR-BRAD')]
const ADMIN_GRANTS = { 'USR-QMS-ADMIN': ['admin'], 'USR-BRAD': ['author'] }

describe('PATCH /api/settings/lab — route-level (QMS-8)', () => {
  it('route exists: PATCH is registered (RED baseline at 14637f6d was 404 Route PATCH not found)', async () => {
    const h = await buildHarness()
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-LOCAL-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-SANDBOX' }),
      })
      expect(res.statusCode).not.toBe(404)
      expect(res.statusCode).toBe(200)
    } finally {
      await h.cleanup()
    }
  })

  it('known bundle id: 200 LabSettings body; GET /settings/lab reflects the new bundle IN THE SAME PROCESS (live accessor proof); config.yaml on disk updated (atomic writer proof)', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const before = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(before.json().policyBundleId).toBe('POL-SANDBOX')

      const patch = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(patch.statusCode).toBe(200)
      const body = patch.json()
      expect(body.policyBundleId).toBe('POL-REGULATED')
      expect(body.activePolicyBundle?.id).toBe('POL-REGULATED')
      expect(body.materialTracking).toBeDefined()

      // THE snapshot-trap proof: same process, no restart.
      const after = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(after.json().policyBundleId).toBe('POL-REGULATED')
      expect(after.json().activePolicyBundle?.id).toBe('POL-REGULATED')

      // Persistence went through the config writer, not a hand-edit.
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-REGULATED')
      // In-memory config was reassigned via onConfigUpdate.
      expect(h.live.current.lab?.policyBundleId).toBe('POL-REGULATED')

      // docs §1 contract: the switch is audited as policy_bundle_changed {from,to}.
      const audits = h.created.filter((e) => (e.payload as Record<string, unknown>).action === 'policy_bundle_changed')
      expect(audits.length).toBe(1)
      const auditPayload = audits[0]!.payload as Record<string, unknown>
      expect(auditPayload.data).toEqual({ from: 'POL-SANDBOX', to: 'POL-REGULATED' })
      expect(auditPayload.actor).toBe('USR-QMS-ADMIN')
    } finally {
      await h.cleanup()
    }
  })

  it('round trip: sandbox -> regulated -> sandbox, each step visible via GET in the same process', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      for (const id of ['POL-REGULATED', 'POL-SANDBOX']) {
        const patch = await h.app.inject({
          method: 'PATCH',
          url: '/api/settings/lab',
          headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
          payload: JSON.stringify({ policyBundleId: id }),
        })
        expect(patch.statusCode).toBe(200)
        const get = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
        expect(get.json().policyBundleId).toBe(id)
      }
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('unknown bundle id: 400 naming the bad id AND the known ids from the bundle registry (data, not a hardcoded list)', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-NOPE' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error).toBeTruthy()
      expect(body.message).toContain('POL-NOPE')
      for (const known of ['POL-SANDBOX', 'POL-NOTEBOOK', 'POL-TRACKED', 'POL-REGULATED']) {
        expect(body.message).toContain(known)
      }
      // Bundle unchanged.
      const get = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(get.json().policyBundleId).toBe('POL-SANDBOX')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('body guards: multi-key body -> 400; non-object body -> 400; non-string policyBundleId -> 400', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const multi = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED', repositories: [] }),
      })
      expect(multi.statusCode).toBe(400)

      const notObject = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify('POL-REGULATED'),
      })
      expect(notObject.statusCode).toBe(400)

      const wrongType = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 42 }),
      })
      expect(wrongType.statusCode).toBe(400)
    } finally {
      await h.cleanup()
    }
  })

  it('authz gate: actor without the admin role -> 403 {error:FORBIDDEN, message}; bundle unchanged', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-BRAD' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      const body = res.json()
      expect(body.error).toBe('FORBIDDEN')
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)

      const get = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(get.json().policyBundleId).toBe('POL-SANDBOX')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
      // A denied switch is never audited as a change.
      expect(h.created.filter((e) => (e.payload as Record<string, unknown>).action === 'policy_bundle_changed').length).toBe(0)
    } finally {
      await h.cleanup()
    }
  })

  it('authz gate fails closed: unresolvable identity -> 403 FORBIDDEN; unknown bundle id is refused with 400 BEFORE the gate', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const noIdentity = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-MISSING' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(noIdentity.statusCode).toBe(403)
      expect(noIdentity.json().error).toBe('FORBIDDEN')

      // Cheatsheet §1 order: unknown id 400 checked before the guard.
      const unknownFirst = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-MISSING' },
        payload: JSON.stringify({ policyBundleId: 'POL-NOPE' }),
      })
      expect(unknownFirst.statusCode).toBe(400)
      expect(unknownFirst.json().message).toContain('POL-NOPE')
    } finally {
      await h.cleanup()
    }
  })

  // ---------------------------------------------------------------------
  // FIX-RUN-1 (adversarial defects 1/2/4): the fail-closed proofs below run
  // the SHIPPED LocalIdentityService semantics — the old stub could not see
  // these states.
  // ---------------------------------------------------------------------

  it('FAILS CLOSED (defect 1): headerless request on a BOOTSTRAP-ONLY store -> 403 FORBIDDEN, nothing persisted. The shipped resolver falls back to USR-LOCAL-ADMIN with isSystem:true (LocalIdentityService.ts:125-138); an implicit fallback is NOT a credential for a privileged config write.', async () => {
    const h = await buildHarness() // no users, no grants: the fresh-install state ensureLocalAdminUser exists for
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      const body = res.json()
      expect(body.error).toBe('FORBIDDEN')
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)

      // Nothing was persisted — the switch never happened.
      const get = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(get.json().policyBundleId).toBe('POL-SANDBOX')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
      expect(onDisk).not.toContain('POL-REGULATED')
      expect(h.created.filter((e) => (e.payload as Record<string, unknown>).action === 'policy_bundle_changed').length).toBe(0)
    } finally {
      await h.cleanup()
    }
  })

  it('FAILS CLOSED (defect 1): headerless request on a POPULATED store -> 403 FORBIDDEN. The shipped fallback resolves to the first active user (USR-BRAD, non-admin); the fallback is never an admin grant.', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toBe('FORBIDDEN')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('authenticated system access survives (defect 1 boundary): valid session token for an admin user, NO x-user-id header -> 200. The gate requires a credential, not the absence of one.', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS })
    try {
      const token = await h.sessionStore.create('USR-QMS-ADMIN')
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-cl-session': token },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().policyBundleId).toBe('POL-REGULATED')
    } finally {
      await h.cleanup()
    }
  })

  it('FAILS CLOSED (defect 4): resolver exception -> 403 {error:FORBIDDEN,message}, never a 500', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS, resolverThrows: true })
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      const body = res.json()
      expect(body.error).toBe('FORBIDDEN')
      expect(typeof body.message).toBe('string')
      expect(body.message.length).toBeGreaterThan(0)
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('FAILS CLOSED (defect 1 residual): empty-string identity header -> 403 FORBIDDEN. x-user-id:"" is defined but falsy inside the shipped resolver (LocalIdentityService.ts:98-123), which then falls back to the bootstrap admin — an empty header is NOT a credential.', async () => {
    const h = await buildHarness() // bootstrap-only store: the fallback would resolve to USR-LOCAL-ADMIN isSystem:true
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': '' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toBe('FORBIDDEN')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('FAILS CLOSED (defect 1 residual): a PRESENTED-BUT-INVALID session token must not be rescued by the bootstrap fallback. The shipped resolver treats an unknown token as "no session" and falls back to USR-LOCAL-ADMIN isSystem:true (LocalIdentityService.ts:85-96 then :125-138); a failed credential is a denial, not a grant.', async () => {
    const h = await buildHarness() // bootstrap-only store
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-cl-session': 'cl-sess-not-a-real-token' },
        payload: JSON.stringify({ policyBundleId: 'POL-REGULATED' }),
      })
      expect(res.statusCode).toBe(403)
      expect(res.json().error).toBe('FORBIDDEN')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
    } finally {
      await h.cleanup()
    }
  })

  it('EMPTY REGISTRY (defect 2): with no bundles loaded, EVERY id is refused with 400 — an unknown policy state is never persisted', async () => {
    const h = await buildHarness({ grants: ADMIN_GRANTS, users: POPULATED_USERS, emptyRegistry: true })
    try {
      const res = await h.app.inject({
        method: 'PATCH',
        url: '/api/settings/lab',
        headers: { 'content-type': 'application/json', 'x-user-id': 'USR-QMS-ADMIN' },
        payload: JSON.stringify({ policyBundleId: 'POL-NOPE-NOT-REAL' }),
      })
      expect(res.statusCode).toBe(400)
      const body = res.json()
      expect(body.error).toBeTruthy()
      expect(body.message).toContain('POL-NOPE-NOT-REAL')

      // The unknown id never reaches config — in memory or on disk.
      const get = await h.app.inject({ method: 'GET', url: '/api/settings/lab' })
      expect(get.json().policyBundleId).toBe('POL-SANDBOX')
      const onDisk = await readFile(h.configPath, 'utf-8')
      expect(onDisk).toContain('policyBundleId: POL-SANDBOX')
      expect(onDisk).not.toContain('POL-NOPE-NOT-REAL')
      expect(h.created.filter((e) => (e.payload as Record<string, unknown>).action === 'policy_bundle_changed').length).toBe(0)
    } finally {
      await h.cleanup()
    }
  })
})
