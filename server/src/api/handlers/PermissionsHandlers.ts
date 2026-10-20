/**
 * PermissionsHandlers — GET /settings/permissions (QMS8-A).
 *
 * A thin READ-ONLY aggregate for the Settings "Permissions & roles" section:
 *   grants      — every role-grant record, read via the SAME store path
 *                 RoleResolver.ts:18 uses (store.list({kind:'role-grant'})).
 *                 No parallel ACL logic is added here and the generic
 *                 /records surface's ACL filtering is untouched; this endpoint
 *                 intentionally echoes the org-chart projection the server's
 *                 own role resolution already sees.
 *   lifecycles  — one entry per LOADED lifecycle spec: id + declaredRoles =
 *                 the distinct `role` values across its transitions (plain
 *                 reads of engine-loaded YAML facts, specFor-style — never a
 *                 re-parse in TS, never an invented role) + kinds from the
 *                 loaded coverage where covered (else []).
 *   coverage    — echo of ctx.kindLifecycleRegistry (lifecycleId + kinds),
 *                 null when the coverage failed to load: the section must
 *                 degrade honestly, not crash.
 *   bundle      — echo of the configured policyBundleId (same live-accessor
 *                 pattern as LabSettingsHandlers), null when no config.
 *
 * NO authorization concept is invented and NO kind/role/lifecycle literals
 * live in this file (D9): every value in the response comes from loaded data.
 * Auth gate: any resolvable local user may READ (resolveRequestUser, the same
 * resolver the lifecycle handlers use); unresolvable identity -> 401.
 */
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { RecordStore } from '../../store/types.js'
import type { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js'
import type { KindLifecycleRegistry } from '../../registry/KindLifecycleRegistry.js'
import type { AppConfig } from '../../config/types.js'
import type { PolicyBundleService } from '../../policy/PolicyBundleService.js'
import type { ResolvedRequestUser } from '../../security/LocalIdentityService.js'

export interface PermissionsGrantView {
  recordId: string
  userId: string
  roles: string[]
  lifecycleId?: string
  grantedBy?: string
  notes?: string
  label?: string
}

export interface PermissionsLifecycleView {
  id: string
  declaredRoles: string[]
  kinds: string[]
}

export interface PermissionsCoverageView {
  lifecycleId: string
  kinds: string[]
}

export interface PermissionsBundleView {
  policyBundleId: string
  label?: string
  level?: number
}

export interface PermissionsResponse {
  grants: PermissionsGrantView[]
  lifecycles: PermissionsLifecycleView[]
  coverage: PermissionsCoverageView | null
  bundle: PermissionsBundleView | null
}

export interface PermissionsHandlerOptions {
  store: RecordStore
  engine: LifecycleEngine
  /** LIVE accessor (LabSettingsHandlers pattern): coverage may be absent when
   *  its load failed at boot — the handler then echoes null. */
  getKindLifecycleRegistry: () => KindLifecycleRegistry | undefined
  /** LIVE accessor: onConfigUpdate reassigns ctx.appConfig. */
  getAppConfig: () => AppConfig | undefined
  /** Optional: enriches the bundle echo with the LOADED bundle's label/level
   *  (the same PolicyBundleService instance LabSettingsHandlers reads — one
   *  instance, one truth). Absent -> the echo carries the id only. */
  bundleService?: PolicyBundleService
  /** Same resolver the lifecycle handlers use; null/absent userId -> 401. */
  resolveRequestUser: (request: FastifyRequest) => Promise<ResolvedRequestUser | null>
}

export interface PermissionsHandlers {
  getPermissions(request: FastifyRequest, reply: FastifyReply): Promise<unknown>
}

export function createPermissionsHandlers(options: PermissionsHandlerOptions): PermissionsHandlers {
  const { store, engine, getKindLifecycleRegistry, getAppConfig, bundleService, resolveRequestUser } = options

  /** Plain read of a loaded spec: the distinct transition `role` values, in
   *  declaration order. A report of YAML facts — nothing is decided here. */
  function declaredRolesFor(lifecycleId: string): string[] {
    const spec = engine.specFor(lifecycleId)
    if (!spec) return []
    const roles = new Set<string>()
    for (const transition of spec.transitions) {
      if (typeof transition.role === 'string' && transition.role.length > 0) {
        roles.add(transition.role)
      }
    }
    return [...roles]
  }

  function toGrant(envelope: { recordId?: string; payload?: unknown }): PermissionsGrantView | null {
    const p = (envelope.payload ?? {}) as Record<string, unknown>
    const recordId = typeof envelope.recordId === 'string' ? envelope.recordId : undefined
    const userId = typeof p.userId === 'string' ? p.userId : undefined
    if (!recordId || !userId) return null
    const roles = Array.isArray(p.roles) ? p.roles.filter((r): r is string => typeof r === 'string') : []
    const lifecycleId = typeof p.lifecycleId === 'string' && p.lifecycleId.length > 0 ? p.lifecycleId : undefined
    const grantedBy = typeof p.grantedBy === 'string' && p.grantedBy.length > 0 ? p.grantedBy : undefined
    const notes = typeof p.notes === 'string' && p.notes.length > 0 ? p.notes : undefined
    const label = typeof p.title === 'string' && p.title.length > 0 ? p.title : undefined
    return {
      recordId,
      userId,
      roles,
      ...(lifecycleId !== undefined ? { lifecycleId } : {}),
      ...(grantedBy !== undefined ? { grantedBy } : {}),
      ...(notes !== undefined ? { notes } : {}),
      ...(label !== undefined ? { label } : {}),
    }
  }

  return {
    /** GET /settings/permissions — read-only aggregate, any authenticated
     *  local user (401 otherwise). */
    async getPermissions(request, reply) {
      const user = await resolveRequestUser(request)
      if (!user?.userId) {
        reply.status(401)
        return { error: 'UNAUTHENTICATED', message: 'A valid local user is required' }
      }

      // Same single read path RoleResolver.ts:18 uses. No ACL logic added.
      const envelopes = await store.list({ kind: 'role-grant', limit: 10000 })
      const grants: PermissionsGrantView[] = []
      for (const envelope of envelopes) {
        const view = toGrant(envelope)
        if (view) grants.push(view)
      }

      const registry = getKindLifecycleRegistry()
      const coverage: PermissionsCoverageView | null = registry
        ? { lifecycleId: registry.lifecycle, kinds: registry.kinds() }
        : null

      // Enumerate the engine's LOADED specs (engine.loadedIds() — a plain
      // report of what loadLifecycle() registered, no policy).
      const lifecycles: PermissionsLifecycleView[] = engine.loadedIds().map((id) => ({
        id,
        declaredRoles: declaredRolesFor(id),
        kinds: coverage && coverage.lifecycleId === id ? coverage.kinds : [],
      }))

      const config = getAppConfig()
      const policyBundleId = config?.lab?.policyBundleId
      let bundle: PermissionsBundleView | null = null
      if (typeof policyBundleId === 'string' && policyBundleId.length > 0) {
        const loaded = bundleService?.getBundle(policyBundleId)
        bundle = {
          policyBundleId,
          ...(loaded?.label !== undefined ? { label: loaded.label } : {}),
          ...(loaded?.level !== undefined ? { level: loaded.level } : {}),
        }
      }

      return reply.send({ grants, lifecycles, coverage, bundle })
    },
  }
}
