/**
 * GC-13 (leg D) — GcEvidenceHandoff: the evidence hand-off affordance
 * mounted inside the GC results flow-back (orch D1 re-anchor: inside
 * app/src/run/gc/, rendered per analysis-run row of gc-results-<isenId>).
 *
 * Flow (spec D1): output-artifact chips (name + dataKind) per run ->
 * "Full context" (the D2 GcProvenancePanel) / "Add as evidence…" (the D3
 * authoring form). Fetch discipline (D7/bait #5): the affordance is CLOSED
 * at mount and fires ZERO fetches; the run is fetched once per open, the
 * AOUT chips fetched after the open (user-triggered, the GC-12 refresh
 * idiom). No AI, no defaults: the stance and the target are the
 * scientist's explicit choice (D6); the form starts empty.
 *
 * Hardcode boundary (bait #4): no kind names / verdicts / source-type
 * mapping in this file beyond the payload built BY the scientist form
 * handler — the mapping table lives in gcEvidenceSources.ts (data).
 */
import { useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { ApiError } from '../../shared/api/errors'
import type { RecordRef } from '../../shared/ref/RefBadge'
import { GcProvenancePanel } from './GcProvenancePanel'
import { schemaKind } from '../../claims/claimEvidenceModel'
import {
  EVIDENCE_SCHEMA_ID,
  EVIDENCE_SOURCE_TYPE_ENUM,
  EVIDENCE_TARGET_TYPES,
  evidenceSourceTypeFor,
} from './gcEvidenceSources'

type Stance = 'supports' | 'refutes' | 'assesses'

interface ArtifactChip {
  id: string
  type: string
  name: string
  dataKind: string
  error: string | null
}

function asRecordRef(v: unknown): RecordRef | null {
  if (v === null || typeof v !== 'object') return null
  const r = v as Record<string, unknown>
  if (r.kind !== 'record' || typeof r.id !== 'string' || typeof r.type !== 'string') return null
  const label = typeof r.label === 'string' ? r.label : undefined
  return { kind: 'record', id: r.id, type: r.type, ...(label !== undefined ? { label } : {}) }
}

/** Pull the server lint result off a create rejection (ApiError carries
 *  .lint; a plain rejection may carry details.lint — the 422 body). */
function lintFromError(e: unknown): { valid: boolean; violations: Array<{ ruleId?: string; message: string }> } | null {
  const er = e as { lint?: unknown; details?: { lint?: unknown } } | null
  const cand = er?.lint ?? er?.details?.lint
  if (cand !== null && typeof cand === 'object' && (cand as { valid?: boolean }).valid === false) {
    const c = cand as { valid: boolean; violations: Array<{ ruleId?: string; message: string }> }
    return c
  }
  return null
}

/** D3 authoring form: the scientist picks ONE stance, the target
 *  (id + assertion|claim kind), and adds the WHY-arm sources explicitly.
 *  The artifact source is PRE-DERIVED from the OQ-1 data table (that is
 *  derivation, not a stance default — D6). */
function GcEvidenceForm({
  runId,
  artifact,
  onCreated,
}: {
  runId: string
  artifact: RecordRef
  onCreated: (evidenceId: string) => void
}) {
  const [stance, setStance] = useState<Stance | null>(null)
  const [targetId, setTargetId] = useState('')
  const [targetType, setTargetType] = useState<(typeof EVIDENCE_TARGET_TYPES)[number] | null>(null)
  const [extraSources, setExtraSources] = useState<Array<{ type: string; ref: RecordRef }>>([])
  const [extraId, setExtraId] = useState('')
  const [extraError, setExtraError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [lintError, setLintError] = useState<{ ruleId?: string; message: string }[] | null>(null)
  const [created, setCreated] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const artifactType = evidenceSourceTypeFor(artifact.type, EVIDENCE_SOURCE_TYPE_ENUM)
  const artifactSource: { type: string; ref: RecordRef } | null =
    artifactType !== null ? { type: artifactType, ref: artifact } : null

  const addExtraSource = async () => {
    const id = extraId.trim()
    if (id === '') return
    setExtraError(null)
    try {
      const env = await apiClient.getRecord(id)
      const kind = (env.payload as Record<string, unknown>).kind
      const type = typeof kind === 'string' ? evidenceSourceTypeFor(kind, EVIDENCE_SOURCE_TYPE_ENUM) : null
      if (type === null) {
        setExtraError(`record '${id}' has no declared evidence source type (kind '${String(kind)}') — the type is never invented`)
        return
      }
      setExtraSources((prev) => [...prev, { type, ref: { kind: 'record', id, type: String(kind) } }])
      setExtraId('')
    } catch (e) {
      setExtraError(e instanceof Error ? e.message : String(e))
    }
  }

  const submit = async () => {
    setError(null)
    setLintError(null)
    if (stance === null) {
      setError('Choose the stance explicitly (supports / refutes / assesses) — the form never decides for the scientist')
      return
    }
    if (targetId.trim() === '' || targetType === null) {
      setError('Name the target assertion or claim (id + kind)')
      return
    }
    const sources = [
      ...(artifactSource !== null ? [artifactSource] : []),
      ...extraSources,
    ]
    if (sources.length === 0) {
      setError('The bundle declares no source')
      return
    }
    const id = `EVD-GC13-${runId.replace(/[^A-Z0-9]/gi, '')}-${Date.now().toString(36)}`
    const payload: Record<string, unknown> = {
      kind: 'evidence',
      id,
      [stance]: [{ kind: 'record', id: targetId.trim(), type: targetType }],
      sources,
      ...(notes.trim() !== '' ? { quality: { notes: notes.trim() } } : {}),
    }
    setBusy(true)
    try {
      const res = await apiClient.createRecord(EVIDENCE_SCHEMA_ID, payload)
      setCreated(res.record.recordId)
      onCreated(res.record.recordId)
    } catch (e) {
      const lint = lintFromError(e)
      if (lint !== null && Array.isArray(lint.violations)) {
        // The lint-invalid response (422) is shown VERBATIM — the required-
        // context floor is the server's, never re-implemented in the form.
        setLintError(lint.violations)
      } else {
        setError(e instanceof ApiError ? `${e.message} (${e.status})` : e instanceof Error ? e.message : String(e))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div data-testid="gc-evidence-form" className="gc-ev-form">
      <div data-testid="gc-evidence-form-sources" className="gc-ev-form__sources">
        <span className="gc-ev-form__label">Sources</span>
        {artifactSource !== null && (
          <span data-testid="gc-evidence-form-source" className="gc-ev-form__source">
            <a href={`/record/${encodeURIComponent(artifactSource.ref.id)}`}>{artifactSource.ref.id}</a>{' '}
            (type: {artifactSource.type})
          </span>
        )}
        {artifactSource === null && (
          <span data-testid="gc-evidence-form-source-unmapped" className="gc-ev-form__source">
            no source type declared for this artifact kind — the bundle cannot be authored from it here
          </span>
        )}
        {extraSources.map((s) => (
          <span key={`${s.type}:${s.ref.id}`} data-testid="gc-evidence-form-extra-source" className="gc-ev-form__source">
            <a href={`/record/${encodeURIComponent(s.ref.id)}`}>{s.ref.id}</a> (type: {s.type})
          </span>
        ))}
        <span className="gc-ev-form__extra">
          <input
            data-testid="gc-evidence-form-extra-source-id"
            value={extraId}
            onChange={(e) => setExtraId(e.target.value)}
            placeholder="Add a context source record id (the WHY arm, e.g. a measurement-context)"
          />
          <button type="button" data-testid="gc-evidence-form-extra-source-add" onClick={() => void addExtraSource()}>
            Add
          </button>
        </span>
        {extraError !== null && (
          <span data-testid="gc-evidence-form-extra-source-error" className="gc-ev-form__error">
            {extraError}
          </span>
        )}
      </div>
      <div className="gc-ev-form__stance">
        <span className="gc-ev-form__label">Stance (choose one — explicit act, never defaulted)</span>
        {(['supports', 'refutes', 'assesses'] as Stance[]).map((s) => (
          <label key={s} data-testid={`gc-evidence-form-stance-${s}`}>
            <input
              type="radio"
              name={`gc-ev-stance-${runId}`}
              checked={stance === s}
              onChange={() => setStance(s)}
            />
            {s}
            {stance === s ? (
              <span data-testid={`gc-evidence-form-stance-${s}-checked`} />
            ) : null}
          </label>
        ))}
      </div>
      <div className="gc-ev-form__target">
        <span className="gc-ev-form__label">Target</span>
        <input
          data-testid="gc-evidence-form-target-id"
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          placeholder="assertion or claim record id"
        />
        {EVIDENCE_TARGET_TYPES.map((t) => (
          <label key={t}>
            <input
              type="radio"
              name={`gc-ev-target-${runId}`}
              data-testid={`gc-evidence-form-target-type-${t}`}
              checked={targetType === t}
              onChange={() => setTargetType(t)}
            />
            {t}
          </label>
        ))}
      </div>
      <input
        data-testid="gc-evidence-form-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="QC note (optional)"
      />
      {error !== null && (
        <span data-testid="gc-evidence-form-error" className="gc-ev-form__error">
          {error}
        </span>
      )}
      {lintError !== null && (
        <span data-testid="gc-evidence-form-lint-error" className="gc-ev-form__error gc-ev-form__lint-error">
          {lintError.map((v) => (
            <span key={v.ruleId ?? v.message} className="gc-ev-form__lint-violation">
              {v.ruleId !== undefined ? `[${v.ruleId}] ` : ''}
              {v.message}
            </span>
          ))}
        </span>
      )}
      <button
        type="button"
        data-testid="gc-evidence-form-submit"
        disabled={busy || created !== null}
        onClick={() => void submit()}
      >
        {created !== null ? 'Bundle created' : busy ? 'Creating…' : 'Create evidence bundle'}
      </button>
      {created !== null && (
        <span data-testid="gc-evidence-form-created" className="gc-ev-form__created">
          created <a href={`/record/${encodeURIComponent(created)}`}>{created}</a>
        </span>
      )}
    </div>
  )
}

export function GcEvidenceHandoff({
  isenId,
  runId,
  onBundleCreated,
}: {
  isenId: string
  runId: string
  onBundleCreated: () => void
}) {
  const [open, setOpen] = useState(false)
  const [chips, setChips] = useState<ArtifactChip[] | null>(null)
  const [openError, setOpenError] = useState<string | null>(null)
  const [provenanceFor, setProvenanceFor] = useState<RecordRef | null>(null)
  const [authorFor, setAuthorFor] = useState<RecordRef | null>(null)
  // The reciprocal run->claim links (G7): evidence bundles whose sources
  // point at THIS run, with the claim each stance array names. Fetched
  // only after the user opens the affordance (never at mount — D7).
  const [linkedClaims, setLinkedClaims] = useState<Array<{ evidenceId: string; claimId: string }>>([])
  const [claimsError, setClaimsError] = useState<string | null>(null)

  // Opened = the user asked: fetch the run ONCE, then its artifacts.
  // Closed = zero fetches (D7 mount pin — this component is inside the
  // gc-results rows, which mount with the section).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const { record } = await apiClient.getAnalysisRun(runId)
        const payload = record.payload as Record<string, unknown>
        const refs = Array.isArray(payload.outputArtifactRefs)
          ? payload.outputArtifactRefs.map(asRecordRef).filter((r): r is RecordRef => r !== null)
          : []
        const out: ArtifactChip[] = []
        for (const ref of refs) {
          try {
            const env = await apiClient.getRecord(ref.id)
            const p = env.payload as Record<string, unknown>
            if (!cancelled)
              out.push({
                id: ref.id,
                type: ref.type,
                name: typeof p['name'] === 'string' ? p['name'] : ref.id,
                dataKind: typeof p['dataKind'] === 'string' ? p['dataKind'] : '',
                error: null,
              })
          } catch (e) {
            if (!cancelled)
              out.push({
                id: ref.id,
                type: ref.type,
                name: ref.id,
                dataKind: '',
                error: e instanceof Error ? e.message : String(e),
              })
          }
        }
        if (!cancelled) setChips(out)
      } catch (e) {
        if (!cancelled) setOpenError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, runId])

  // The reciprocal back-links (run -> claim): after the user opens, use the
  // EXISTING related-record scan on THIS run (the back-navigation machinery,
  // RelatedRecordsHandlers — the reciprocal of the claim workspace's
  // getRelatedRecords(claimId)). The scan is a superset (any string field
  // matching the runId, bait #7), so each candidate is schemaId-filtered to
  // evidence and re-read before believing that a source points at the run.
  // User-triggered only (never at mount — D7).
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        const { related } = await apiClient.getRelatedRecords(runId)
        const evidenceIds = [
          ...new Set(related.filter((r) => schemaKind(r.schemaId) === 'evidence').map((r) => r.recordId)),
        ]
        const hits: Array<{ evidenceId: string; claimId: string }> = []
        for (const eid of evidenceIds) {
          const env = await apiClient.getRecord(eid)
          const p = env.payload as Record<string, unknown>
          const sources = Array.isArray(p['sources']) ? p['sources'] : []
          const pointsAtRun = sources.some((s) => {
            if (s === null || typeof s !== 'object') return false
            const r = (s as Record<string, unknown>)['ref']
            return r !== null && typeof r === 'object' && (r as { id?: unknown }).id === runId
          })
          if (!pointsAtRun) continue
          for (const stance of ['supports', 'refutes', 'assesses'] as const) {
            const arr = Array.isArray(p[stance]) ? p[stance] : []
            for (const t of arr) {
              if (
                t !== null &&
                typeof t === 'object' &&
                (t as { type?: unknown }).type === 'claim' &&
                typeof (t as { id?: unknown }).id === 'string'
              ) {
                hits.push({ evidenceId: eid, claimId: (t as { id: string }).id })
              }
            }
          }
        }
        if (!cancelled) setLinkedClaims(hits)
      } catch (e) {
        if (!cancelled) setClaimsError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, runId])

  return (
    <div data-testid={`gc-evidence-handoff-${isenId}`} className="gc-ev">
      <button
        type="button"
        data-testid="gc-evidence-handoff-open"
        onClick={() => setOpen(true)}
      >
        Evidence hand-off
      </button>
      {open && (
        <div className="gc-ev__body">
          {openError !== null && (
            <span data-testid="gc-evidence-handoff-error" className="gc-ev__error">
              {openError}
            </span>
          )}
          {chips === null && openError === null && <span className="gc-ev__loading">loading run outputs…</span>}
          {linkedClaims.length > 0 && (
            <div data-testid="gc-evidence-linked-claims" className="gc-ev__claims">
              <span className="gc-ev__claims-label">Backed by (claim links)</span>
              {linkedClaims.map((lc) => (
                <span key={`${lc.evidenceId}:${lc.claimId}`} className="gc-ev__claim">
                  <a href={`/record/${encodeURIComponent(lc.evidenceId)}`}>{lc.evidenceId}</a> →{' '}
                  <a href={`/claims/${encodeURIComponent(lc.claimId)}`} data-testid={`gc-evidence-claim-link-${lc.claimId}`}>
                    {lc.claimId}
                  </a>
                </span>
              ))}
            </div>
          )}
          {claimsError !== null && (
            <span data-testid="gc-evidence-linked-claims-error" className="gc-ev__error">
              claim back-links unavailable: {claimsError}
            </span>
          )}
          {chips !== null && chips.length === 0 && (
            <span data-testid="gc-evidence-handoff-no-outputs" className="gc-ev__empty">
              this run declares no output artifacts — nothing to hand off
            </span>
          )}
          {chips !== null &&
            chips.map((c) => (
              <div key={c.id} data-testid={`gc-evidence-artifact-chip-${c.id}`} className="gc-ev__chip">
                <span data-testid="gc-evidence-artifact-chip">
                  <a href={`/record/${encodeURIComponent(c.id)}`}>{c.name}</a>
                  {c.dataKind !== '' ? <span className="gc-ev__chip-kind"> {c.dataKind}</span> : null}
                </span>
                {c.error !== null && <span className="gc-ev__error"> {c.error}</span>}
                <button
                  type="button"
                  data-testid="gc-evidence-full-context"
                  onClick={() => {
                    setProvenanceFor({ kind: 'record', id: c.id, type: c.type })
                    setAuthorFor(null)
                  }}
                >
                  Full context
                </button>
                <button
                  type="button"
                  data-testid="gc-evidence-add-as-evidence"
                  onClick={() => {
                    setAuthorFor({ kind: 'record', id: c.id, type: c.type })
                    setProvenanceFor(null)
                  }}
                >
                  Add as evidence…
                </button>
              </div>
            ))}
          {provenanceFor !== null && <GcProvenancePanel artifactRef={provenanceFor} />}
          {authorFor !== null && (
            <GcEvidenceForm
              runId={runId}
              artifact={authorFor}
              onCreated={() => onBundleCreated()}
            />
          )}
        </div>
      )}
    </div>
  )
}
