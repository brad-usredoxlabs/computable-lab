/**
 * QMS-6 — SignOffReceipt: read-only sign-off evidence for one record
 * (delta R6/D7).
 *
 * Classification contract: a signature is an APPLIED approval ONLY if its id
 * appears in the `data.signatureRefs` of one of the record's
 * `lifecycle_transition` audit events. A minted signature with no matching
 * transition event is an ORPHAN — never an approval. Signatures without a
 * verifiable snapshot (no subject.revisionRef.id / subject.contentHash) are
 * historical evidence only and cannot authorize new transitions.
 *
 * Read surface (client.ts is NOT ours to extend):
 *   apiClient.listRecordsByKind('signature', N)      — client.ts:2069 (GET /records?kind=…)
 *   apiClient.listRecordsByKind('audit-event', N)    — same
 * filtered client-side: SIG.subject.recordId === recordId,
 * EVT.subjectId === recordId && EVT.action === 'lifecycle_transition'.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'

interface SignOffReceiptProps {
  recordId: string
  /** Bump to refetch after a transition attempt (sign-ok/PUT-fail split). */
  refreshKey?: number
}

interface ReceiptRow {
  signatureId: string
  signedBy: string
  action: string
  targetState?: string
  revisionId?: string
  contentHash?: string
  status: 'applied' | 'orphan'
  viaEvent?: string
}

const LIST_LIMIT = 200

export function SignOffReceipt({ recordId, refreshKey = 0 }: SignOffReceiptProps) {
  const [rows, setRows] = useState<ReceiptRow[]>([])
  const [loaded, setLoaded] = useState(false)

  const load = useCallback(async () => {
    try {
      const [sigs, events] = await Promise.all([
        apiClient.listRecordsByKind('signature', LIST_LIMIT),
        apiClient.listRecordsByKind('audit-event', LIST_LIMIT),
      ])

      // Applied = referenced by a lifecycle_transition event for THIS record.
      const appliedRefs = new Map<string, string | undefined>() // signatureRef -> transition target state
      for (const evt of events.records) {
        const p = evt.payload as Record<string, unknown>
        if (p.subjectId !== recordId || p.action !== 'lifecycle_transition') continue
        const refs = (p.data as { signatureRefs?: unknown } | undefined)?.signatureRefs
        if (Array.isArray(refs)) {
          const to = (p.data as { to?: unknown } | undefined)?.to
          for (const ref of refs) {
            if (typeof ref === 'string') appliedRefs.set(ref, typeof to === 'string' ? to : undefined)
          }
        }
      }

      const mine: ReceiptRow[] = []
      for (const sig of sigs.records) {
        const p = sig.payload as Record<string, unknown>
        const subject = (p.subject ?? {}) as Record<string, unknown>
        if (subject.recordId !== recordId) continue
        const revisionRef = (subject.revisionRef ?? {}) as { id?: unknown }
        mine.push({
          signatureId: sig.recordId,
          signedBy: typeof p.signedBy === 'string' ? p.signedBy : 'unknown',
          action: typeof p.action === 'string' ? p.action : 'unknown',
          targetState: typeof subject.targetState === 'string' ? subject.targetState : undefined,
          revisionId: typeof revisionRef.id === 'string' ? revisionRef.id : undefined,
          contentHash: typeof subject.contentHash === 'string' ? subject.contentHash : undefined,
          status: appliedRefs.has(sig.recordId) ? 'applied' : 'orphan',
          viaEvent: appliedRefs.get(sig.recordId),
        })
      }
      setRows(mine)
    } catch {
      setRows([])
    } finally {
      setLoaded(true)
    }
  }, [recordId])

  useEffect(() => {
    setLoaded(false)
    void load()
  }, [load, refreshKey])

  if (!loaded) return null
  if (rows.length === 0) {
    return (
      <div data-testid="sign-off-receipt" className="text-xs text-gray-500">
        No signatures on record for this document.
      </div>
    )
  }

  return (
    <div data-testid="sign-off-receipt" className="text-xs text-gray-600">
      <div className="font-medium text-gray-700">Sign-off receipt</div>
      <ul className="mt-1 space-y-1">
        {rows.map(r => (
          <li key={r.signatureId} className="rounded border border-gray-200 bg-white px-2 py-1">
            <span className={r.status === 'applied' ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
              {r.status === 'applied' ? `Applied → ${r.viaEvent ?? 'effective'}` : 'Orphan (minted, not an approval)'}
            </span>
            <span className="ml-2 text-gray-500">
              {r.signatureId} · {r.signedBy} · action {r.action}
              {r.targetState ? ` · → ${r.targetState}` : ''}
            </span>
            {r.revisionId || r.contentHash ? (
              <span className="ml-2 text-gray-400" title="Snapshot bound at signing">
                {r.revisionId ? `snapshot ${r.revisionId}` : ''}
                {r.contentHash ? ` ${r.contentHash.slice(0, 12)}` : ''}
              </span>
            ) : (
              <span className="ml-2 text-red-500">historical evidence only — does not authorize</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
