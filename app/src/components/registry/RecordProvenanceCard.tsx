/**
 * RecordProvenanceCard — the registry's "where did this come from" affordance.
 *
 * Registry records carry envelope `meta` (createdAt/createdBy/updatedAt,
 * contentSha/gitCommit, path) and FAIRCommon payload timestamps; the audit trail
 * itself is the repo's git history plus record-revision snapshots
 * (`GET /records/:id/revisions`). This card surfaces those facts read-only and
 * collapsed by default. It INVENTS nothing: a create draft has no record id and
 * renders nothing, and an unavailable revision count renders no row.
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import './RecordProvenanceCard.css'

export interface RecordProvenanceMeta {
  createdAt?: string
  createdBy?: string
  updatedAt?: string
  contentSha?: string
  gitCommit?: string
  commitSha?: string
  path?: string
}

export interface RecordProvenanceCardProps {
  recordId: string
  meta?: RecordProvenanceMeta
  payload?: Record<string, unknown>
}

function Row({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div className="provenance__row">
      <dt className="provenance__label">{label}</dt>
      <dd className="provenance__value" title={title ?? value}>
        {value}
      </dd>
    </div>
  )
}

export function RecordProvenanceCard({ recordId, meta, payload }: RecordProvenanceCardProps) {
  const [revisions, setRevisions] = useState<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setRevisions(null)
    if (!recordId) return () => { cancelled = true }
    apiClient
      .listRecordRevisions(recordId)
      .then((r) => { if (!cancelled) setRevisions(r.records.length) })
      .catch(() => { if (!cancelled) setRevisions(null) })
    return () => { cancelled = true }
  }, [recordId])

  const p = payload ?? {}
  const createdBy = meta?.createdBy ?? (typeof p.createdBy === 'string' ? p.createdBy : undefined)
  const createdAt = meta?.createdAt ?? (typeof p.createdAt === 'string' ? p.createdAt : undefined)
  const updatedAt = meta?.updatedAt ?? (typeof p.updatedAt === 'string' ? p.updatedAt : undefined)
  const sha = meta?.gitCommit ?? meta?.contentSha ?? meta?.commitSha

  if (!recordId || (!createdBy && !createdAt && !updatedAt && !sha && !meta?.path)) return null

  return (
    <details className="provenance" data-testid="record-provenance">
      <summary className="provenance__summary">Provenance</summary>
      <dl className="provenance__rows">
        {createdBy ? <Row label="Created by" value={createdBy} /> : null}
        {createdAt ? <Row label="Created" value={createdAt} /> : null}
        {updatedAt ? <Row label="Updated" value={updatedAt} /> : null}
        {sha ? <Row label="Content" value={sha.slice(0, 12)} title={sha} /> : null}
        {meta?.path ? <Row label="File" value={meta.path} /> : null}
        {revisions !== null && revisions > 0 ? (
          <Row label="Revisions" value={String(revisions)} />
        ) : null}
      </dl>
    </details>
  )
}
