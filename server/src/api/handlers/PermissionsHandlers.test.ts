/**
 * QMS8-A — GET /settings/permissions aggregate (RED-first tests).
 *
 * Style precedent: LifecycleHandlers.test.ts (unit harness with fake store +
 * real engine) and OwnershipPolicyHandlers.test.ts (route smoke proving the
 * ROUTE exists via real registerRoutes + fastify.inject, not just the service).
 *
 * Fixtures are test data only: 'doc-review', 'USR-TEST-*', 'thing' live HERE,
 * never in the handler (D9 no-literal boundary — the handler reads the store,
 * the engine's loaded specs, and the registry, and echoes what they say).
 */
import { describe, expect, it, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js'
import { KindLifecycleRegistry } from '../../registry/KindLifecycleRegistry.js'
import type { LifecycleSpec } from '../../lifecycle/types.js'
import type { AppConfig } from '../../config/types.js'
import { createPermissionsHandlers, type PermissionsResponse } from './PermissionsHandlers.js'
import { registerRoutes } from '../routes.js'

// Inline spec (LifecycleHandlers.test.ts style): draft -> in_review -> approved.
const SPEC: LifecycleSpec = {
  lifecycleVersion: 1,
  id: 'doc-review',
  states: [
    { id: 'draft', initial: true },
    { id: 'in_review' },
    { id: 'approved' },
  ],
  transitions: [
    { from: 'draft', to: 'in_review', role: 'author', label: 'Submit for Review' },
    { from: 'in_review', to: 'approved', role: 'reviewer', label: 'Approve' },
  ],
}

// Seeded role-grant envelopes (payload shapes mirror schema/identity/
// role-grant.schema.yaml: userId, roles, optional lifecycleId/grantedBy/notes,
// FAIRCommon title as the human label).
const GRANT_A = {
  recordId: 'GRANT-TEST-A',
  payload: {
    kind: 'role-grant',
    recordId: 'GRANT-TEST-A',
    userId: 'USR-TEST-BRAD',
    lifecycleId: 'doc-review',
    roles: ['author'],
    grantedBy: 'USR-TEST-ADMIN',
    notes: 'demo grant',
    title: 'Brad author grant',
  },
}
const GRANT_B = {
  recordId: 'GRANT-TEST-B',
  payload: {
    kind: 'role-grant',
    recordId: 'GRANT-TEST-B',
    userId: 'USR-TEST-OTHER',
    roles: ['quality_manager'],
    grantedBy: 'USR-TEST-ADMIN',
  },
}

function makeEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  engine.loadLifecycle(SPEC)
  return engine
}

function makeRegistry(engine: LifecycleEngine): KindLifecycleRegistry {
  return new KindLifecycleRegistry(
    {
      registryVersion: 1,
      lifecycleId: 'doc-review',
      defaultState: 'draft',
      kinds: [{ kind: 'thing' }],
    },
    { lifecycle: engine, knownKinds: new Set(['thing']) },
  )
}

function reply() {
  return {
    status: vi.fn(),
    send: vi.fn((x: unknown) => x),
  }
}

function harness(options: {
  grants?: unknown[]
  registry?: KindLifecycleRegistry | undefined
  config?: AppConfig | undefined
  userId?: string | null
}) {
  const engine = makeEngine()
  const store = { list: vi.fn(async () => options.grants ?? [GRANT_A, GRANT_B]) }
  const handlers = createPermissionsHandlers({
    store: store as never,
    engine,
    getKindLifecycleRegistry: () => options.registry,
    getAppConfig: () => options.config,
    resolveRequestUser: vi.fn(async () =>
      options.userId === null
        ? null
        : { userId: options.userId ?? 'USR-TEST-BRAD', isSystem: false },
    ),
  })
  return { handlers, store, engine }
}

const request = () => ({ params: {}, query: {}, headers: {} }) as never

describe('PermissionsHandlers.getPermissions', () => {
  it('returns 401 when the request user cannot be resolved', async () => {
    const { handlers, store } = harness({ userId: null })
    const r = reply()

    const body = await handlers.getPermissions(request(), r as never)

    expect(r.status).toHaveBeenCalledWith(401)
    expect(body).toMatchObject({ error: 'UNAUTHENTICATED' })
    expect(store.list).not.toHaveBeenCalled()
  })

  it('surfaces seeded role-grant records in `grants` (same store read path as RoleResolver)', async () => {
    const { handlers, store } = harness({ registry: makeRegistry(makeEngine()) })
    const r = reply()

    const body = (await handlers.getPermissions(request(), r as never)) as PermissionsResponse

    expect(store.list).toHaveBeenCalledWith(expect.objectContaining({ kind: 'role-grant' }))
    expect(body.grants).toHaveLength(2)
    const a = body.grants.find(g => g.recordId === 'GRANT-TEST-A')
    expect(a).toMatchObject({
      userId: 'USR-TEST-BRAD',
      lifecycleId: 'doc-review',
      roles: ['author'],
      grantedBy: 'USR-TEST-ADMIN',
      notes: 'demo grant',
      label: 'Brad author grant',
    })
    // Unscoped grant: no lifecycleId key at all (exactOptionalPropertyTypes).
    const b = body.grants.find(g => g.recordId === 'GRANT-TEST-B')
    expect(b).toBeDefined()
    expect(Object.prototype.hasOwnProperty.call(b, 'lifecycleId')).toBe(false)
  })

  it('declaredRoles for each loaded lifecycle are the distinct transition roles of its spec', async () => {
    const { handlers } = harness({ registry: makeRegistry(makeEngine()) })
    const r = reply()

    const body = (await handlers.getPermissions(request(), r as never)) as PermissionsResponse

    const docReview = body.lifecycles.find(l => l.id === 'doc-review')
    expect(docReview).toBeDefined()
    expect([...(docReview?.declaredRoles ?? [])].sort()).toEqual(['author', 'reviewer'])
  })

  it('coverage echo matches the loaded KindLifecycleRegistry and maps its kinds onto the covered lifecycle', async () => {
    const engine = makeEngine()
    const { handlers } = harness({ registry: makeRegistry(engine) })
    const r = reply()

    const body = (await handlers.getPermissions(request(), r as never)) as PermissionsResponse

    expect(body.coverage).toEqual({ lifecycleId: 'doc-review', kinds: ['thing'] })
    const docReview = body.lifecycles.find(l => l.id === 'doc-review')
    expect(docReview?.kinds).toEqual(['thing'])
  })

  it('degrades honestly when coverage failed to load: coverage null, lifecycle kinds []', async () => {
    const { handlers } = harness({ registry: undefined })
    const r = reply()

    const body = (await handlers.getPermissions(request(), r as never)) as PermissionsResponse

    expect(body.coverage).toBeNull()
    const docReview = body.lifecycles.find(l => l.id === 'doc-review')
    expect(docReview?.kinds).toEqual([])
  })

  it('bundle echoes the configured policyBundleId; null when no config is present', async () => {
    const withConfig = harness({
      registry: makeRegistry(makeEngine()),
      config: { lab: { policyBundleId: 'POL-TEST-BUNDLE' } } as AppConfig,
    })
    const bodyWith = (await withConfig.handlers.getPermissions(request(), reply() as never)) as PermissionsResponse
    expect(bodyWith.bundle).toMatchObject({ policyBundleId: 'POL-TEST-BUNDLE' })

    const without = harness({ registry: makeRegistry(makeEngine()), config: undefined })
    const bodyWithout = (await without.handlers.getPermissions(request(), reply() as never)) as PermissionsResponse
    expect(bodyWithout.bundle).toBeNull()
  })

  it('route smoke: real registerRoutes + fastify.inject GET /api/settings/permissions -> 200 aggregate (QMS-7 lesson: prove the ROUTE exists)', async () => {
    const engine = makeEngine()
    const store = { list: vi.fn(async () => [GRANT_A, GRANT_B]) }
    const handlers = createPermissionsHandlers({
      store: store as never,
      engine,
      getKindLifecycleRegistry: () => makeRegistry(engine),
      getAppConfig: () => undefined,
      resolveRequestUser: vi.fn(async () => ({ userId: 'USR-TEST-BRAD', isSystem: false })),
    })
    const noop = async () => ({})
    const app: FastifyInstance = Fastify()
    await app.register(async (instance) => {
      registerRoutes(instance, {
        recordHandlers: {
          listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
          getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
          listClaims: noop, checkClaimDuplicates: noop,
        } as never,
        schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
        validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
        schemaCount: () => 0,
        ruleCount: () => 0,
        permissionsHandlers: handlers,
      });
    }, { prefix: '/api' })
    await app.ready()
    try {
      const res = await app.inject({
        method: 'GET',
        url: '/api/settings/permissions',
        headers: { 'x-user-id': 'USR-TEST-BRAD' },
      })
      expect(res.statusCode).toBe(200)
      const json = res.json() as PermissionsResponse
      expect(json.grants.map(g => g.recordId)).toContain('GRANT-TEST-A')
      expect(json.lifecycles.find(l => l.id === 'doc-review')?.declaredRoles).toEqual(['author', 'reviewer'])
      expect(json.coverage).toEqual({ lifecycleId: 'doc-review', kinds: ['thing'] })
    } finally {
      await app.close()
    }
  })
})
