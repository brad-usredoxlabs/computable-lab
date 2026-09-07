/**
 * useRecordVisibility — lazily resolve a set of records' access visibility for
 * browse rows. Fetches /records/:id/access-policy per id, deduplicated, and
 * returns a map of recordId → visibility ('private' | 'shared' | 'public' | null).
 *
 * Distributed as a hook so browse surfaces can show a VisibilityBadge per row
 * without N+1 inline fetches or blocking initial list render.
 */
import { useEffect, useState } from 'react'
import { apiClient, type Visibility } from '../api/client'

export type RecordVisibility = Visibility | null

export function useRecordVisibilities(recordIds: string[]): Record<string, RecordVisibility> {
  const [vis, setVis] = useState<Record<string, RecordVisibility>>({})

  useEffect(() => {
    let cancelled = false
    const ids = Array.from(new Set(recordIds))
    Promise.all(
      ids.map((id) =>
        apiClient.getAccessPolicy(id).then(
          (p) => ({ id, vis: (p.direct ?? p.effective)?.visibility ?? null as Visibility | null }),
          () => ({ id, vis: null as Visibility | null }),
        ),
      ),
    ).then((results) => {
      if (cancelled) return
      const next: Record<string, RecordVisibility> = {}
      for (const r of results) next[r.id] = r.vis
      setVis(next)
    })
    return () => { cancelled = true }
  }, [recordIds.join('|')])

  return vis
}