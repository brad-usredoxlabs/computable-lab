/**
 * RunProtocolList — the run surface's protocols in payload order (lead first),
 * plus the attach/detach affordance. Mutations name the PLANNED-RUN id
 * (run → plannedRunRef → PLR), never the run record id; after a mutation the
 * list is re-read from the server (returned `protocolRefs` order, labels from
 * the PLR record), never guessed locally. Publishes nothing into
 * ProtocolSelectionContext (that context names ONE protocol). Reads stay
 * best-effort; a failed MUTATION leaves the rendered list untouched.
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
  display: 'inline-flex', alignItems: 'center', gap: '8px', margin: 0, padding: 0,
  listStyle: 'none', fontSize: '11px', color: 'var(--cl-text)',
}
const rowStyle: CSSProperties = { whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '4px' }
const controlStyle: CSSProperties = {
  fontSize: '11px', color: 'var(--cl-text)', background: 'transparent',
  border: '1px solid var(--cl-border)', borderRadius: '4px', padding: '0 6px', cursor: 'pointer',
}
const pickerStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '11px' }

function sameRefs(a: ReadProtocolRef[], b: ReadProtocolRef[]): boolean {
  return a.length === b.length && a.every((ref, i) => ref.id === b[i]?.id && ref.label === b[i]?.label)
}

/** Server order wins; labels come from the fresh PLR read, never from the picker. */
function orderRefs(ids: string[], fresh: ReadProtocolRef[]): ReadProtocolRef[] {
  const byId = new Map(fresh.map((ref) => [ref.id, ref]))
  const seen = new Set<string>()
  const out: ReadProtocolRef[] = []
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(byId.get(id) ?? { id })
  }
  return out
}

function toCandidate(env: { recordId: string; payload: Record<string, unknown> }): ReadProtocolRef {
  const label = [env.payload.label, env.payload.title, env.payload.name].find(
    (value): value is string => typeof value === 'string' && value.length > 0,
  )
  return label ? { id: env.recordId, label } : { id: env.recordId }
}

/** Resolve run → plannedRunRef → PLR and read its ordered protocol refs. */
async function readRunProtocols(runId: string): Promise<{ plannedRunId: string; refs: ReadProtocolRef[] } | null> {
  const runEnv = await apiClient.getRecord(runId)
  const run = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
  const plr = run?.plannedRunRef as { id?: string } | undefined
  if (typeof plr?.id !== 'string') return null
  // /api/records/:id 404s for tree-store records; only /ui/record/:id serves the PLR.
  const plrResp = await apiClient.getRecordWithUI(plr.id)
  const payload = (plrResp.record?.payload ?? null) as Record<string, unknown> | null
  return { plannedRunId: plr.id, refs: protocolRefsOf(payload) }
}

export function RunProtocolList({ runId }: RunProtocolListProps) {
  const [refs, setRefs] = useState<ReadProtocolRef[]>([])
  const [plannedRunId, setPlannedRunId] = useState<string | null>(null)
  const [candidates, setCandidates] = useState<ReadProtocolRef[] | null>(null)
  const [picking, setPicking] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const read = await readRunProtocols(runId)
        if (cancelled || !read) return
        setPlannedRunId(read.plannedRunId)
        setRefs((prev) => (sameRefs(prev, read.refs) ? prev : read.refs))
      } catch {
        // Best-effort read: nothing renderable, so stay blank (unchanged).
        if (!cancelled) setRefs([])
      }
    }
    void load()
    return () => { cancelled = true }
  }, [runId])

  const mutate = async (url: string, init: RequestInit) => {
    setBusy(true)
    try {
      const res = await fetch(url, init)
      if (!res.ok) return
      const body = (await res.json()) as { protocolRefs?: unknown }
      const ids = Array.isArray(body?.protocolRefs)
        ? body.protocolRefs.filter((value): value is string => typeof value === 'string')
        : null
      const read = await readRunProtocols(runId)
      if (read) setRefs(ids ? orderRefs(ids, read.refs) : read.refs)
    } catch {
      // Best-effort: a failed mutation leaves the rendered list untouched.
    } finally {
      setBusy(false)
    }
  }

  const openPicker = () => {
    setPicking(true)
    if (candidates !== null) return
    void (async () => {
      try {
        const { records } = await apiClient.listRecordsByKind('local-protocol')
        setCandidates(records.map(toCandidate))
      } catch {
        setCandidates([])
      }
    })()
  }

  const attach = () => {
    if (!plannedRunId || !selectedId) return
    void mutate(`/api/runs/${encodeURIComponent(plannedRunId)}/protocols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ protocolId: selectedId }),
    })
  }

  const detach = (protocolId: string) => {
    if (!plannedRunId) return
    const base = `/api/runs/${encodeURIComponent(plannedRunId)}/protocols`
    void mutate(`${base}/${encodeURIComponent(protocolId)}`, { method: 'DELETE' })
  }

  // A run with no planned run has no protocol surface at all (unchanged).
  if (!plannedRunId) return null

  const heading = refs.length === 0 ? 'No methods' : refs.length === 1 ? '1 method' : `${refs.length} methods`

  return (
    <div style={wrapStyle}>
      <h4 style={headingStyle}>{heading}</h4>
      {refs.length > 0 && (
        <ol style={listStyle} aria-label="Methods followed">
          {refs.map((ref, i) => (
            <li key={ref.id} style={rowStyle} data-lead={i === 0 ? 'true' : undefined}>
              <span>{ref.label ?? ref.id}{i === 0 ? ' (lead)' : ''}</span>
              <button
                type="button" style={controlStyle} aria-label={`Detach ${ref.label ?? ref.id}`}
                disabled={busy} onClick={() => detach(ref.id)}
              >
                Detach
              </button>
            </li>
          ))}
        </ol>
      )}
      {picking ? (
        <span style={pickerStyle}>
          <select aria-label="Method to attach" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Select method…</option>
            {(candidates ?? []).map((candidate) => (
              <option key={candidate.id} value={candidate.id}>{candidate.label ?? candidate.id}</option>
            ))}
          </select>
          <button type="button" style={controlStyle} disabled={busy || !selectedId} onClick={attach}>Attach</button>
          <button type="button" style={controlStyle} onClick={() => setPicking(false)}>Cancel</button>
        </span>
      ) : (
        <button type="button" style={controlStyle} disabled={busy} onClick={openPicker}>Attach a method</button>
      )}
    </div>
  )
}
