/**
 * useRecordHistory — records entity views to the recent store when the
 * route matches a known entity route. Consumed once at the app root.
 */
import { useEffect, useRef } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { recordView } from './recentStore'

const ROUTE_TO_KIND: Array<{
  pattern: string
  kind: string
  entityType: 'project' | 'run' | 'claim' | 'lab'
}> = [
  { pattern: '/project/:studyId', kind: 'study', entityType: 'project' },
  { pattern: '/runs/:runId', kind: 'run', entityType: 'run' },
  { pattern: '/claims/:claimId', kind: 'claim', entityType: 'claim' },
  { pattern: '/lab/:category/:entityId', kind: 'lab', entityType: 'lab' },
]

export function useRecordHistory() {
  const location = useLocation()
  const last = useRef<string>('')
  useEffect(() => {
    if (location.pathname === last.current) return
    last.current = location.pathname
    for (const r of ROUTE_TO_KIND) {
      const m = matchPath(r.pattern, location.pathname)
      if (!m) continue
      const id =
        (m.params.studyId ?? m.params.runId ?? m.params.claimId ?? m.params.entityId) as string | undefined
      if (!id) break
      recordView({ recordId: id, kind: r.kind, title: id, entityType: r.entityType })
      break
    }
  }, [location.pathname])
}
