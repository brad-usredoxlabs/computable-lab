/**
 * ClaimWorkspace — individual claim view at /claims/:claimId.
 *
 * GC-13 (leg E): the dead-chrome kill. The old hardcoded placeholders
 * ("No supporting evidence yet." / "No linked runs." / "No revision context
 * yet.") rendered while data existed — a defect (spec D4 / gate G6/G8). Now:
 *
 *  - Evidence Ledger: evidence bundles that take a stance toward THIS claim —
 *    directly (supports[]/refutes[]/assesses[] naming the claim) or via the
 *    claim's assertions (bundle -> assertion -> claim_ref join, the D1 join
 *    semantics reused in claimEvidenceModel.ts). Supporting / Contradictory
 *    groups, each row linking /record/:evidenceId (the reciprocal
 *    claim->evidence leg).
 *  - Connections / Runs: the bundles' sources pointing at analysis-runs,
 *    linked /gc-run/:runId (GATEFIX-D5, gate G7: the reciprocal run->claim
 *    back-link must land on the GC evidence surface — the run's evidence /
 *    claims back-links — NOT the /runs/:runId Run·Design plate canvas,
 *    which serves `run` records).
 *  - Honest empty arms when a group has no data (absence is visible, never
 *    a silent placeholder).
 *
 * The related-records scan is a full O(N) exact-string match (bait #7): its
 * refField output is NOT typed — this component filters by schemaId and
 * re-reads each payload before believing it (client.ts:3974 +
 * RelatedRecordsHandlers.ts semantics).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AppShell } from '../shared/shell'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import {
  runIdsFromEvidence,
  schemaKind,
  stanceTowardClaim,
} from './claimEvidenceModel'
import './ClaimWorkspace.css'

interface EvidenceRow {
  id: string
  stance: 'supports' | 'refutes' | 'assesses'
}

export function ClaimWorkspace() {
  const { claimId } = useParams<{ claimId: string }>()
  const [claim, setClaim] = useState<RecordEnvelope | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [bundles, setBundles] = useState<EvidenceRow[]>([])
  const [runIds, setRunIds] = useState<string[]>([])
  const [relatedClaimIds, setRelatedClaimIds] = useState<string[]>([])
  const [relatedError, setRelatedError] = useState<string | null>(null)

  useEffect(() => {
    if (!claimId) return
    setLoading(true)
    setError(null)
    setBundles([])
    setRunIds([])
    setRelatedClaimIds([])
    setRelatedError(null)
    apiClient.getRecord(claimId)
      .then(async (record) => {
        setClaim(record)
        // The related scan (read-only; the O(N) full-store scan is the
        // existing inverse-reference machinery — no second reverse index).
        let related: Array<{ recordId: string; schemaId: string }> = []
        try {
          const res = await apiClient.getRelatedRecords(claimId)
          related = res.related
        } catch (e) {
          setRelatedError(e instanceof Error ? e.message : String(e))
        }
        const evidenceIds = [
          ...new Set(
            related.filter((r) => schemaKind(r.schemaId) === 'evidence').map((r) => r.recordId),
          ),
        ]
        const assertionIds = [
          ...new Set(
            related.filter((r) => schemaKind(r.schemaId) === 'assertion').map((r) => r.recordId),
          ),
        ]
        // Re-read each payload (the scan output is untyped). Failures are
        // loud arms, never fabricated rows.
        const loaded = await Promise.all(
          [...evidenceIds, ...assertionIds].map(async (id) => {
            try {
              return await apiClient.getRecord(id)
            } catch {
              return null
            }
          }),
        )
        const evdPayloads = loaded
          .filter((env): env is RecordEnvelope => env !== null && schemaKind(env.schemaId) === 'evidence')
          .map((env) => env.payload as Record<string, unknown>)
        const asnPayloads = loaded
          .filter((env): env is RecordEnvelope => env !== null && schemaKind(env.schemaId) === 'assertion')
          .map((env) => env.payload as Record<string, unknown>)
        // The claim's assertions (claim_ref names THIS claim).
        const claimAssertionIds = asnPayloads
          .filter((p) => {
            const cr = p['claim_ref']
            return cr !== null && typeof cr === 'object' && (cr as { id?: unknown }).id === claimId
          })
          .map((p) => String((p['id'] as string) ?? ''))
          .filter((id) => id !== '')
        // FIX4 (defect 3): the claim scan is SINGLE-HOP — a bundle that
        // targets one of the claim's ASSERTIONS never references the claim
        // id, so it can never appear in the claim's related set
        // (RelatedRecordsHandlers scans each record's OWN payload). The
        // second hop: scan each of the claim's assertions, keep the
        // evidence candidates, re-read them. (A failed second-hop scan is
        // folded into relatedError — the ledger then renders its failure
        // arm instead of a false empty arm.)
        const secondHopIds: string[] = []
        for (const asId of claimAssertionIds) {
          try {
            const res = await apiClient.getRelatedRecords(asId)
            for (const r of res.related) {
              // FIX2d (NEW-4): a bundle that targets BOTH the claim and one of
              // its assertions is in the claim's related set (first hop) AND
              // the assertion's related set (second hop) — dedupe against
              // evidenceIds or it renders twice with the same key={b.id}.
              if (
                schemaKind(r.schemaId) === 'evidence' &&
                r.recordId !== claimId &&
                !evidenceIds.includes(r.recordId) &&
                !secondHopIds.includes(r.recordId)
              ) {
                secondHopIds.push(r.recordId)
              }
            }
          } catch (e) {
            setRelatedError((prev) => prev ?? (e instanceof Error ? e.message : String(e)))
          }
        }
        const secondHop = await Promise.all(
          secondHopIds.map(async (id) => {
            try {
              const env = await apiClient.getRecord(id)
              return env !== null && schemaKind(env.schemaId) === 'evidence' ? env : null
            } catch {
              return null
            }
          }),
        )
        const secondHopPayloads = secondHop
          .filter((env): env is RecordEnvelope => env !== null)
          .map((env) => env.payload as Record<string, unknown>)
        const rows: EvidenceRow[] = []
        for (const p of [...evdPayloads, ...secondHopPayloads]) {
          const stance = stanceTowardClaim(p, claimId, new Set(claimAssertionIds))
          if (stance !== null) {
            const id = String(p['id'] ?? '')
            if (id !== '') rows.push({ id, stance })
          }
        }
        setBundles(rows)
        setRunIds(runIdsFromEvidence([...evdPayloads, ...secondHopPayloads]))
        setRelatedClaimIds(
          related
            .filter((r) => schemaKind(r.schemaId) === 'claim')
            .map((r) => r.recordId)
            .filter((id) => id !== claimId),
        )
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => setLoading(false))
  }, [claimId])

  const payload = claim?.payload as Record<string, unknown> | null
  const statement = typeof payload?.statement === 'string' ? payload.statement : '(no statement)'
  const status = typeof payload?.status === 'string' ? payload.status : 'unknown'

  const supporting = bundles.filter((b) => b.stance === 'supports')
  const refuting = bundles.filter((b) => b.stance === 'refutes')
  const assessing = bundles.filter((b) => b.stance === 'assesses')

  const ledgerRows = (rows: EvidenceRow[], group: 'supporting' | 'contradictory') =>
    rows.length === 0 ? (
      <p className="claim-workspace__empty" data-testid={`claim-evidence-group-${group}-empty`}>
        No evidence bundle takes this stance toward the claim.
      </p>
    ) : (
      <ul className="claim-workspace__evidence-list">
        {rows.map((b) => (
          <li key={b.id} data-testid="claim-evidence-row" className="claim-workspace__evidence-row">
            <a href={`/record/${encodeURIComponent(b.id)}`} data-testid="claim-evidence-link">
              {b.id}
            </a>
            <span className="claim-workspace__evidence-stance">{b.stance}</span>
          </li>
        ))}
      </ul>
    )

  const workspaceContent = (
    <div className="claim-workspace" data-testid="claim-workspace">
      {error ? (
        <p className="claim-workspace__error">{error}</p>
      ) : loading ? (
        <p className="claim-workspace__hint">Loading claim…</p>
      ) : !claim || !payload ? (
        <p className="claim-workspace__hint">Claim not found.</p>
      ) : (
        <>
          <header className="claim-workspace__header">
            <div className="claim-workspace__type-badge">C</div>
            <div>
              <h1 className="claim-workspace__statement">{statement}</h1>
              <span className="claim-workspace__id">{claimId}</span>
            </div>
            <span className={`claim-workspace__status claim-workspace__status--${status}`}>
              {status}
            </span>
          </header>

          <section className="claim-workspace__section" data-testid="claim-evidence-ledger">
            <h2 className="claim-workspace__section-title">Evidence Ledger</h2>
            {/* FIX4 (defect 7): a failed related scan must NOT render the
                false "no evidence" empty state — the scan that would have
                found the bundles failed. Render the failure LOUD and
                suppress the empty arms (the absence is unknown, not
                proven). */}
            {relatedError !== null && (
              <p className="claim-workspace__error" data-testid="claim-evidence-ledger-error">
                Evidence ledger unavailable: the related-record scan failed ({relatedError}).
                No absence of evidence is asserted while that scan is down.
              </p>
            )}
            {relatedError === null && bundles.length === 0 && (
              <p className="claim-workspace__empty" data-testid="claim-evidence-empty">
                No evidence bundle targets this claim (directly or via its assertions) yet.
              </p>
            )}
            <div className="claim-workspace__evidence-groups">
              <div className="claim-workspace__evidence-group" data-testid="claim-evidence-group-supporting">
                <h3>Supporting</h3>
                {relatedError === null && ledgerRows(supporting, 'supporting')}
              </div>
              <div className="claim-workspace__evidence-group" data-testid="claim-evidence-group-contradictory">
                <h3>Contradictory</h3>
                {relatedError === null &&
                  (refuting.length === 0 && assessing.length === 0 ? (
                    <p className="claim-workspace__empty" data-testid="claim-evidence-group-contradictory-empty">
                      No evidence bundle contradicts or assesses this claim.
                    </p>
                  ) : (
                    <ul className="claim-workspace__evidence-list">
                      {[...refuting, ...assessing].map((b) => (
                        <li key={b.id} data-testid="claim-evidence-row" className="claim-workspace__evidence-row">
                          <a href={`/record/${encodeURIComponent(b.id)}`} data-testid="claim-evidence-link">
                            {b.id}
                          </a>
                          <span className="claim-workspace__evidence-stance">{b.stance}</span>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
            </div>
          </section>

          <section className="claim-workspace__section" data-testid="claim-connections">
            <h2 className="claim-workspace__section-title">Connections</h2>
            <div className="claim-workspace__connections-grid">
              <div>
                <h3>Runs</h3>
                {relatedError === null &&
                  (runIds.length === 0 ? (
                    <p className="claim-workspace__empty" data-testid="claim-connections-runs-empty">
                      No evidence bundle points at an analysis run yet.
                    </p>
                  ) : (
                    <ul className="claim-workspace__connections-list">
                      {runIds.map((rid) => (
                        <li key={rid} className="claim-workspace__connections-row">
                          {/* GATEFIX-D5 (gate G7): the bundle's source is an
                              analysis-run (runIdsFromEvidence filters on the
                              declared source type). /runs/:runId serves the
                              Run·Design workspace — the plate canvas for
                              `run` records — so the analysis-run id must land
                              on the GC evidence surface (GcEvidenceRunPage)
                              that renders this run's evidence context (its
                              evidence/claim back-links), never the plate
                              canvas (shot 14-b3-g7: "Click to choose
                              labware", "No protocol attached"). */}
                          <a href={`/gc-run/${encodeURIComponent(rid)}`} data-testid={`claim-run-link-${rid}`}>
                            {rid}
                          </a>
                          <span className="claim-workspace__connections-kind">analysis-run</span>
                        </li>
                      ))}
                    </ul>
                  ))}
              </div>
              <div>
                <h3>Related Claims</h3>
                {/* FIX2a (NEW-1, defect-7 class): the related-claim ids come
                    from the SAME related-record scan as the evidence rows —
                    while it failed, the absence of related claims is UNKNOWN,
                    never asserted. The failure is loud (the Connections error
                    arm below); the empty arm is suppressed like the rest. */}
                {relatedError === null &&
                  (relatedClaimIds.length === 0 ? (
                  <p className="claim-workspace__empty" data-testid="claim-connections-claims-empty">
                    No related claim found in the related-record scan.
                  </p>
                ) : (
                  <ul className="claim-workspace__connections-list">
                    {relatedClaimIds.map((cid) => (
                      <li key={cid} className="claim-workspace__connections-row">
                        <a href={`/claims/${encodeURIComponent(cid)}`}> {cid}</a>
                        <span className="claim-workspace__connections-kind">claim</span>
                      </li>
                    ))}
                  </ul>
                  ))}
              </div>
              {relatedError !== null && (
                <p className="claim-workspace__error" data-testid="claim-connections-error">
                  related-record scan failed: {relatedError}
                </p>
              )}
            </div>
          </section>

          <section className="claim-workspace__section" data-testid="claim-history">
            <h2 className="claim-workspace__section-title">History</h2>
            <p className="claim-workspace__hint">
              Revision history rides the record host (/record/:id revisions) — not duplicated here.
            </p>
          </section>
        </>
      )}
    </div>
  )

  return (
    <AppShell
      brand="Claim"
      layout="workspace"
      leftPane={workspaceContent}
    />
  )
}
