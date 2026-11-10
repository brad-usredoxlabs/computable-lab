/**
 * RunProtocolList — the run surface's READ-ONLY view of the protocols a run
 * follows, in payload order with the lead first.
 *
 * The list is the canonical written form (`localProtocolRefs` on the planned
 * run); this component only reads. It resolves run → plannedRunRef → PLR
 * payload and hands it to `protocolRefsOf`. It publishes nothing into
 * ProtocolSelectionContext (that context names ONE protocol) and offers no
 * attach/detach affordance. Best-effort like RunProtocolStepsLoader: any
 * failure or an empty list renders nothing.
 */

import { useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import { apiClient } from '../shared/api/client'
import { protocolRefsOf, type ReadProtocolRef } from './runProtocolRefs'

export interface RunProtocolListProps {
  runId: string
}

const wrapStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '0 8px' }
const headingStyle: CSSProperties = { margin: 0, fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)' }
const listStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  margin: 0,
  padding: 0,
  listStyle: 'none',
  fontSize: '11px',
  color: 'var(--cl-text)',
}

function sameRefs(a: ReadProtocolRef[], b: ReadProtocolRef[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref.id === b[i]?.id && ref.label === b[i]?.label)
}

export function RunProtocolList({ runId }: RunProtocolListProps) {
  const [refs, setRefs] = useState<ReadProtocolRef[]>([])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const runEnv = await apiClient.getRecord(runId)
        const run = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
        const plr = run?.plannedRunRef as { id?: string } | undefined
        if (typeof plr?.id !== 'string') return
        const plrEnv = await apiClient.getRecord(plr.id)
        if (cancelled) return
        const payload = (plrEnv?.payload ?? plrEnv) as Record<string, unknown> | null
        const next = protocolRefsOf(payload)
        setRefs((prev) => (sameRefs(prev, next) ? prev : next))
      } catch {
        if (!cancelled) setRefs((prev) => (prev.length === 0 ? prev : []))
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [runId])

  if (refs.length === 0) return null

  return (
    <div style={wrapStyle}>
      <h4 style={headingStyle}>{refs.length === 1 ? '1 protocol' : `${refs.length} protocols`}</h4>
      <ol style={listStyle} aria-label="Protocols followed">
        {refs.map((ref, i) => (
          <li key={ref.id} style={{ whiteSpace: 'nowrap' }} data-lead={i === 0 ? 'true' : undefined}>
            {ref.label ?? ref.id}
            {i === 0 ? ' (lead)' : ''}
          </li>
        ))}
      </ol>
    </div>
  )
}
