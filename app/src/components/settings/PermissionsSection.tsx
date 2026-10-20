/**
 * PermissionsSection — Settings "Permissions & roles" (QMS8-A).
 *
 * Read-first: ONE fetch of GET /settings/permissions on mount renders
 *   - a row-per-grant table (user label joined from user records, roles,
 *     lifecycle binding — a blank lifecycleId renders honestly as "all
 *     lifecycles" — grantedBy, notes),
 *   - a governance panel: per LOADED lifecycle its declared roles + governed
 *     kinds (from the coverage echo) + the active policy bundle,
 *   - the INERT flag: a role the grant's bound lifecycle does NOT declare is
 *     flagged `role — not declared by <lifecycleId> (inert)` so a mis-bound
 *     grant is visible, not silently dead.
 *
 * No grant authoring here (the generic record surface owns that — the hint
 * sentence says so; there is no duplicate editor). Client-side user filter
 * only — no server filter.
 *
 * Error law (OwnershipPolicySection precedent): a server refusal renders as a
 * row ABOVE the controls and the Refresh control stays operable — never dead
 * chrome. A refusal is ALSO not a data source: while `response` is null the
 * section renders NO data claims — neither the "no grants: …" empty state nor
 * the governance panel's "no lifecycle coverage loaded" / "no policy bundle
 * configured" fallbacks. Those assertions are truthful only when a response
 * was actually received (loaded-and-empty vs load-failed are distinct).
 * Coverage/bundle nulls from a real response degrade honestly, not crash.
 *
 * No kind/role/lifecycle/user literals in this file (D9) — every rendered
 * value comes from the aggregate or the user records.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient, type PermissionsLifecycleView, type PermissionsResponse, type UserSummary } from '../../shared/api/client'

export function PermissionsSection() {
  const [response, setResponse] = useState<PermissionsResponse | null>(null)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [userFilter, setUserFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      // User names are a best-effort join (live-probed readable by any local
      // user); a failure here must not sink the aggregate — rows fall back
      // to the raw USR- id.
      const [permissions, userSummaries] = await Promise.all([
        apiClient.getPermissions(),
        apiClient.listUsers().catch(() => [] as UserSummary[]),
      ])
      setResponse(permissions)
      setUsers(userSummaries)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const [permissions, userSummaries] = await Promise.all([
          apiClient.getPermissions(),
          apiClient.listUsers().catch(() => [] as UserSummary[]),
        ])
        if (!cancelled) {
          setResponse(permissions)
          setUsers(userSummaries)
        }
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => { cancelled = true }
  }, [])

  const userLabel = useCallback((userId: string): string => {
    const match = users.find((u) => u.recordId === userId)
    if (match?.displayName) return match.displayName
    if (match?.username) return match.username
    return userId
  }, [users])

  const declaredRolesFor = useCallback((lifecycleId: string): string[] => {
    return response?.lifecycles.find((l) => l.id === lifecycleId)?.declaredRoles ?? []
  }, [response])

  if (loading) {
    return (
      <div className="info-row">
        <span className="info-row__value">Loading...</span>
      </div>
    )
  }

  const grants = response?.grants ?? []
  // "Loaded and empty" vs "load failed" (adv review defect 1): the empty
  // state and the governance fallback rows are data claims and only render
  // when a response was actually received. On a refusal `response` stays
  // null and the error row is the ONLY content claim on the page.
  const loaded = response !== null
  const lifecycles: PermissionsLifecycleView[] = response?.lifecycles ?? []
  const coverage = response?.coverage ?? null
  const bundle = response?.bundle ?? null

  const filter = userFilter.trim().toLowerCase()
  const visibleGrants = filter
    ? grants.filter((g) =>
        userLabel(g.userId).toLowerCase().includes(filter) ||
        g.userId.toLowerCase().includes(filter))
    : grants

  return (
    <div className="permissions-section">
      {/* Error law: the refusal row sits ABOVE the controls; controls stay
          operable so a retry can succeed on the same page. */}
      {loadError && (
        <div className="info-row" data-testid="permissions-load-error" role="alert">
          <span className="info-row__value" style={{ color: '#c92a2a' }}>{loadError}</span>
        </div>
      )}

      <div className="info-row">
        <span className="info-row__label">Grants</span>
        <span className="info-row__value">
          Read-only view. Creating or editing a grant happens on the generic record surface (kind role-grant).
        </span>
      </div>

      <div className="permissions-controls">
        <input
          type="text"
          data-testid="permissions-user-filter"
          placeholder="Filter by user"
          value={userFilter}
          onChange={(e) => setUserFilter(e.target.value)}
        />
        <button
          className="btn btn-secondary"
          data-testid="permissions-refresh"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>

      {visibleGrants.length === 0 ? (
        loaded ? (
          <div className="info-row" data-testid="permissions-empty">
            <span className="info-row__value">
              {grants.length === 0
                ? 'no grants: everyone resolves to no-role; drafts-only is the only power'
                : 'no grants match this filter'}
            </span>
          </div>
        ) : null
      ) : (
        <table className="permissions-table" data-testid="permissions-table">
          <thead>
            <tr>
              <th>user</th>
              <th>roles</th>
              <th>lifecycle</th>
              <th>granted by</th>
              <th>notes</th>
            </tr>
          </thead>
          <tbody>
            {visibleGrants.map((grant) => {
              const binding = grant.lifecycleId ?? null
              const declared = binding ? declaredRolesFor(binding) : null
              return (
                <tr key={grant.recordId} data-testid={`permissions-grant-row-${grant.recordId}`}>
                  <td>{userLabel(grant.userId)}</td>
                  <td>
                    {grant.roles.map((role) => {
                      const inert = declared !== null && !declared.includes(role)
                      return inert ? (
                        <span
                          key={role}
                          className="permissions-role permissions-role--inert"
                          data-testid={`permissions-role-inert-${grant.recordId}-${role}`}
                          style={{ color: '#c92a2a' }}
                        >
                          {role} — not declared by {binding} (inert)
                        </span>
                      ) : (
                        <span key={role} className="permissions-role">
                          {role}
                        </span>
                      )
                    })}
                  </td>
                  <td>{binding ?? 'all lifecycles'}</td>
                  <td>{grant.grantedBy ? userLabel(grant.grantedBy) : '—'}</td>
                  <td>{grant.notes ?? '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {/* Governance rows are data claims too: they echo the loaded
          registry/coverage/bundle and only render when a response arrived. */}
      {loaded && (
      <div className="permissions-governance" data-testid="permissions-governance">
        <table className="permissions-governance-table">
          <thead>
            <tr>
              <th>lifecycle</th>
              <th>declared roles</th>
              <th>governed kinds</th>
            </tr>
          </thead>
          <tbody>
            {lifecycles.map((lifecycle) => (
              <tr key={lifecycle.id} data-testid={`permissions-lifecycle-row-${lifecycle.id}`}>
                <td>{lifecycle.id}</td>
                <td>{lifecycle.declaredRoles.join(', ')}</td>
                <td>{lifecycle.kinds.length > 0 ? lifecycle.kinds.join(', ') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="info-row">
          <span className="info-row__label">Coverage</span>
          <span className="info-row__value">
            {coverage ? `${coverage.lifecycleId}: ${coverage.kinds.join(', ')}` : 'no lifecycle coverage loaded'}
          </span>
        </div>
        <div className="info-row">
          <span className="info-row__label">Active policy bundle</span>
          <span className="info-row__value">
            {bundle
              ? [bundle.policyBundleId, bundle.label, bundle.level !== undefined ? `level ${bundle.level}` : null]
                  .filter((part): part is string => typeof part === 'string' && part.length > 0)
                  .join(' · ')
              : 'no policy bundle configured'}
          </span>
        </div>
      </div>
      )}
    </div>
  )
}
