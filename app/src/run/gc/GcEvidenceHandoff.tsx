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
import { useCallback, useEffect, useState } from 'react'
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
// GC-13 gatefix3 (gate2 D1): the hand-off's OWN stylesheet — the gc-ev__*
// rules used to live in GcEvidenceRunPage.css scoped under .gc-evidence-run
// (only /gc-run renders that class), so the GC-12 results surface got bare
// markup. Imported here (by the component itself) so every mount site
// (the GC-12 GcRunSheetSection AND the /gc-run landing) reaches them.
import './GcEvidenceHandoff.css'

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

/** FIX6 (defect 9): the EvidenceSource.type enum as the REAL schema
 *  declares it (getSchema — the runtime source, not a mirror). The
 *  drift test (gcEvidenceSources.test.ts) pins the mirror table against
 *  the same file. */
async function realEvidenceSourceEnum(): Promise<string[] | null> {
  try {
    const info = await apiClient.getSchema(EVIDENCE_SCHEMA_ID)
    const defs = (info.schema as { $defs?: Record<string, unknown> } | undefined)?.$defs
    const src = defs?.['EvidenceSource'] as
      | { properties?: { type?: { enum?: unknown } } }
      | undefined
    const enumList = src?.properties?.['type']?.enum
    if (!Array.isArray(enumList)) return null
    return enumList.filter((v): v is string => typeof v === 'string')
  } catch {
    return null
  }
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
  // FIX2c (NEW-3): the selected artifact is the bundle's SUBJECT. When its
  // kind has no declared evidence source type, submit is DISABLED (the
  // sources arm's "cannot be authored" text is the visible reason) and the
  // submit() guard below hard-refuses — a run-only bundle is never POSTed.
  const [submitRefused, setSubmitRefused] = useState(false)
  // FIX6 (defect 9): the source-type enum as the schema declares it at
  // runtime (getSchema — the real runtime source the spec demands; the
  // hardcoded table in gcEvidenceSources.ts is the mirror, pinned by the
  // drift test). Loaded when the form mounts (user-triggered — the form
  // itself only opens on the scientist's "Add as evidence…" act).
  const [sourceEnum, setSourceEnum] = useState<readonly string[] | null>(null)
  const [enumError, setEnumError] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const real = await realEvidenceSourceEnum()
      if (cancelled) return
      if (real !== null && real.length > 0) {
        setSourceEnum(real)
      } else {
        setEnumError(
          'cannot load the evidence schema (the source-type vocabulary) — source types are never invented',
        )
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // The enum in force: the REAL schema enum when it loaded; the mirrored
  // table as the declared twin until then (the drift test keeps them equal).
  const enumValues = sourceEnum ?? EVIDENCE_SOURCE_TYPE_ENUM

  const artifactType = evidenceSourceTypeFor(artifact.type, enumValues)
  const artifactSource: { type: string; ref: RecordRef } | null =
    artifactType !== null ? { type: artifactType, ref: artifact } : null

  const addExtraSource = async () => {
    const id = extraId.trim()
    if (id === '') return
    setExtraError(null)
    try {
      const env = await apiClient.getRecord(id)
      const kind = (env.payload as Record<string, unknown>).kind
      const type = typeof kind === 'string' ? evidenceSourceTypeFor(kind, enumValues) : null
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

  /** FIX6 (defect 10, the spec's OR-clause): the typed target id is
   *  RESOLVED before submit (a real GET) and its record kind must match
   *  the chosen target type — a mismatch or a missing record is refused
   *  LOUD (the free-text hole: a typo used to POST a bundle whose target
   *  does not exist as the chosen kind). Returns an error string, or null
   *  when the target resolves cleanly. */
  async function resolveTargetKind(
    id: string,
    expectedType: string,
  ): Promise<string | null> {
    let env: { payload: Record<string, unknown> }
    try {
      env = await apiClient.getRecord(id)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      return `target '${id}' does not resolve (${msg}) — the id is never POSTed unresolved`
    }
    const kind = (env.payload as Record<string, unknown>).kind
    if (typeof kind !== 'string' || kind !== expectedType) {
      return `target '${id}' is a '${String(kind)}' record, not a '${expectedType}' — the record kind must match the chosen target type`
    }
    return null
  }

  // FIX5 (defect 4a): the authored bundle carries the RUN as an explicit
  // result source (type from the OQ-1 data table — the run IS the bundle's
  // primary anchor, and the single-hop related scan only surfaces a bundle
  // whose OWN payload references the run). Derivation, not a stance
  // default (D6). The run source is added ONCE, after the artifact.
  const runSource: { type: string; ref: RecordRef } | null = (() => {
    const runType = evidenceSourceTypeFor('analysis-run', EVIDENCE_SOURCE_TYPE_ENUM)
    return runType !== null ? { type: runType, ref: { kind: 'record', id: runId, type: 'analysis-run' } } : null
  })()

  const submit = async () => {
    setError(null)
    setLintError(null)
    // FIX2c (NEW-3): the selected artifact is the bundle's SUBJECT — if its
    // kind has no declared source type the bundle cannot be authored from
    // it here. Hard refusal (the button is also disabled; this guard keeps
    // a programmatic submit from POSTing a run-only bundle).
    if (artifactSource === null) {
      setSubmitRefused(true)
      setError(
        'the selected artifact has no declared evidence source type — the bundle cannot be authored from it here (a run-only bundle would never reference the selected artifact)',
      )
      return
    }
    setSubmitRefused(false)
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
      ...(runSource !== null && !extraSources.some((s) => s.ref.id === runId) ? [runSource] : []),
      ...extraSources,
    ]
    if (sources.length === 0) {
      setError('The bundle declares no source')
      return
    }
    // FIX6 (defect 10): the typed target id is RESOLVED before submit and
    // its record kind must match the chosen target type — a mismatch is
    // refused LOUD (a typo used to POST a bundle whose target does not
    // exist as that kind).
    const targetErr = await resolveTargetKind(targetId.trim(), targetType)
    if (targetErr !== null) {
      setError(targetErr)
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
      {enumError !== null && (
        <span data-testid="gc-evidence-form-enum-error" className="gc-ev-form__error">
          {enumError}
        </span>
      )}
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
        // FIX2c (NEW-3): disabled while the selected artifact's kind has no
        // declared source type (the sources arm above is the visible reason)
        // or after a hard refusal.
        disabled={busy || created !== null || artifactSource === null || submitRefused}
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
  initialOpen = false,
  initialRun,
}: {
  /** The SEQUENCE-CONTEXT id the hand-off is mounted in (the
   *  instrument-sequence-entry row id). Serves the testid scope
   *  (`gc-evidence-handoff-${isenId}`) AND the provenance walk's ISEN
   *  lineage hops — and ONLY a real ISEN id may be passed: a run id or
   *  any other record id here would be fetched and RENDERED as an
   *  instrument-sequence-entry hop (the run masquerading as a sequence
   *  row — adversarial review defect 2). A caller that has no sequence
   *  context (the /gc-run direct-run landing — a bare analysis-run names
   *  no sequence row) passes NO isenId: the testid falls back to the
   *  run id (testid scope only) and the ISEN lineage hops render their
   *  honest named-gap arm. */
  isenId?: string
  runId: string
  onBundleCreated: () => void
  /** GC-13 gate-fix (D5): the direct-run landing surface (GcEvidenceRunPage)
   *  opens the body at mount — the evidence context IS the point of the
   *  deep-link landing, so the back-links / chips need no second click.
   *  The GC-12 results flow-back (GcResultsList) keeps the default (closed
   *  at mount — the D7 pin there is untouched). */
  initialOpen?: boolean
  /** GATEFIX2 (adversarial review defect 3): the caller's ALREADY-FETCHED,
   *  kind-verified analysis-run payload (GcEvidenceRunPage reads the run
   *  for its own kind gate before this component mounts). When present,
   *  the open-act chip read REUSES it instead of firing a second
   *  getAnalysisRun — the landing issues exactly ONE run read. Absent
   *  (the GC-12 GcRunSheetSection flow — that call site has no verified
   *  record to hand down), the open act fetches the run itself, exactly
   *  as before: the GC-12 D7 zero-fetch pin and the open-once-read
   *  contract are byte-identical.
   *
   *  Deliberately a PAYLOAD (Record<string, unknown>), not a recordId:
   *  the provenance walk re-reads the run by its REF (the artifact's
   *  runRef — refs, never cached copies), so the hand-off's only run read
   *  is the chip-list open act — the one this seam dedupes. */
  initialRun?: Record<string, unknown>
}) {
  const [open, setOpen] = useState(initialOpen)
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
  //
  // GATEFIX2 (adversarial review defect 3): when the caller hands down an
  // ALREADY-FETCHED, kind-verified payload (initialRun — the
  // GcEvidenceRunPage kind gate reads the run before this mounts), REUSE
  // it — no second getAnalysisRun. The landing then issues exactly ONE
  // run read. Absent (the GC-12 GcRunSheetSection flow — that call site
  // has no verified record to hand down) the open act fetches the run
  // itself, exactly as before. (The provenance walk re-reads the run by
  // its REF on demand — the panel's own read, deduped internally by
  // byRef — and is unaffected by this seam.)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    void (async () => {
      try {
        let payload: Record<string, unknown>
        if (initialRun !== undefined) {
          // the caller's verified payload — the run was already read
          // (the page's kind gate); reuse, never re-read.
          payload = initialRun
        } else {
          const { record } = await apiClient.getAnalysisRun(runId)
          payload = record.payload as Record<string, unknown>
        }
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
  // FIX5 (defect 4b): a bundle's stance may target an ASSERTION (the form
  // offers assertion as a first-class target) — the claim for the back link
  // then rides that assertion's claim_ref (re-read; a failed re-read is a
  // loud scan failure, never a silent skip). Re-runs after a bundle create
  // (the just-authored bundle must appear without a page reload).
  // User-triggered only (never at mount — D7).
  const refreshLinkedClaims = useCallback(async () => {
    let scanError: string | null = null
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
            if (t === null || typeof t !== 'object') continue
            const target = t as { id?: unknown; type?: unknown }
            if (typeof target.id !== 'string') continue
            if (target.type === 'claim') {
              hits.push({ evidenceId: eid, claimId: target.id })
              continue
            }
            if (target.type === 'assertion') {
              // Second hop: the assertion's claim_ref names the claim.
              try {
                const asnEnv = await apiClient.getRecord(target.id)
                const claimRef = (asnEnv.payload as Record<string, unknown>)['claim_ref']
                if (
                  claimRef !== null &&
                  typeof claimRef === 'object' &&
                  typeof (claimRef as { id?: unknown }).id === 'string'
                ) {
                  hits.push({ evidenceId: eid, claimId: (claimRef as { id: string }).id })
                }
              } catch {
                // The assertion (or its claim_ref) is unreadable — the
                // scan cannot resolve this bundle's claim; be loud.
                scanError = `cannot resolve the claim behind assertion '${target.id}' for bundle '${eid}'`
              }
            }
          }
        }
      }
      setLinkedClaims(hits)
      setClaimsError(scanError)
    } catch (e) {
      setClaimsError(e instanceof Error ? e.message : String(e))
    }
  }, [runId])

  useEffect(() => {
    if (!open) return
    void refreshLinkedClaims()
  }, [open, runId, refreshLinkedClaims])

  // GATEFIX2 (adversarial review defect 2): the testid scope and the
  // provenance ISEN hop are SEPARATE concerns. The scope needs SOME
  // stable id (the GC-12 rows carry the ISEN id; the /gc-run direct-run
  // landing has no sequence context and falls back to the run id —
  // scope only, never provenance). The provenance hop keys off a REAL
  // instrument-sequence-entry id ONLY: when no isenId is passed, the
  // panel walks without it and the ISEN lineage hops render their
  // honest named-gap arm (a bare analysis-run names no sequence row).
  const testScope = isenId !== undefined ? isenId : runId

  return (
    <div data-testid={`gc-evidence-handoff-${testScope}`} className="gc-ev">
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
          {provenanceFor !== null && (
            <GcProvenancePanel artifactRef={provenanceFor} isenId={isenId} />
          )}
          {authorFor !== null && (
            <GcEvidenceForm
              runId={runId}
              artifact={authorFor}
              onCreated={() => {
                // The just-authored bundle (whose sources now reference
                // this run) must appear in the back links without a page
                // reload — re-run the scan (user-triggered, D7).
                void refreshLinkedClaims()
                onBundleCreated()
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
