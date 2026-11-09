/**
 * Tests for ClaimWorkspace — the individual claim view at /claims/:claimId.
 *
 * Coverage: rendering the claim payload, and the workspace tab strip staying
 * visible on the claim detail surface (the "zero tabs on every surface"
 * regression fix).
 */

import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import type { RecordEnvelope } from '../types/kernel'
import { ClaimWorkspace } from './ClaimWorkspace'

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
    getRelatedRecords: vi.fn(),
    listRecordsByKind: vi.fn(),
    // AppShell's SurfaceIndicator (trunk drift: the old shell had none) —
    // the house pattern from RegistryHostPage.test.tsx.
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

const EVD_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
const ASN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'
const CLAIM_SCHEMA = 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

// The default related-scan is empty; tests that seed a ledger override it
// per-test (mockImplementation replaces the default for that test only).
beforeEach(() => {
  vi.mocked(apiClient.getRelatedRecords).mockResolvedValue({ related: [] } as never)
})

/** Seed a workspace where the claim has ONE assertion (ASN-1) and TWO
 *  evidence bundles: EVD-DIRECT supports the claim directly; EVD-VIA
 *  supports the assertion (claim_ref -> CLM-1). The related-record scan
 *  is modelled with the REAL handler's SINGLE-HOP semantics
 *  (RelatedRecordsHandlers.ts: findRefFields over each record's OWN
 *  payload): a record appears in X's related set only if its own payload
 *  references X. EVD-VIA names ASN-1 (not CLM-1) — it is NOT in CLM-1's
 *  related set; the workspace must find it with the SECOND hop (the scan
 *  over the claim's assertions + re-read). Related-record scan noise (a
 *  claim ref that is not evidence, an assertion with no claim_ref) must
 *  not crash or mislabel anything (bait #7: the scan is untyped). */
function seedLedger() {
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    switch (id) {
      case 'CLM-1':
        return claimRecord({
          recordId: 'CLM-1',
          statement: 'Rotenone increases ROS in viable cells',
          status: 'proposed',
        })
      case 'ASN-1':
        return {
          recordId: 'ASN-1',
          schemaId: ASN_SCHEMA,
          payload: {
            kind: 'assertion',
            id: 'ASN-1',
            scope: 'single_context',
            claim_ref: { kind: 'record', id: 'CLM-1', type: 'claim' },
            context_refs: [{ kind: 'record', id: 'CTX-1', type: 'context' }],
          },
        } as never
      case 'EVD-DIRECT':
        return {
          recordId: 'EVD-DIRECT',
          schemaId: EVD_SCHEMA,
          payload: {
            kind: 'evidence',
            id: 'EVD-DIRECT',
            supports: [{ kind: 'record', id: 'CLM-1', type: 'claim' }],
            sources: [
              {
                type: 'result',
                ref: { kind: 'record', id: 'ANR-R1', type: 'analysis-run' },
              },
              {
                type: 'context',
                ref: { kind: 'record', id: 'CTX-1', type: 'context' },
              },
            ],
          },
        } as never
      case 'EVD-VIA':
        return {
          recordId: 'EVD-VIA',
          schemaId: EVD_SCHEMA,
          payload: {
            kind: 'evidence',
            id: 'EVD-VIA',
            supports: [{ kind: 'record', id: 'ASN-1', type: 'assertion' }],
            sources: [
              {
                type: 'file',
                ref: { kind: 'record', id: 'DREF-1', type: 'data-reference' },
              },
              {
                type: 'context',
                ref: { kind: 'record', id: 'CTX-1', type: 'context' },
              },
            ],
          },
        } as never
      case 'ASN-NO-CLAIM':
        return {
          recordId: 'ASN-NO-CLAIM',
          schemaId: ASN_SCHEMA,
          payload: { kind: 'assertion', id: 'ASN-NO-CLAIM', scope: 'global' },
        } as never
      default:
        throw new Error(`404: ${id}`)
    }
  })
  // SINGLE-HOP semantics: CLM-1's related set holds only records whose
  // OWN payload references CLM-1 (EVD-DIRECT's supports; ASN-1's
  // claim_ref; ASN-NO-CLAIM's claim_ref noise; CLM-9's predicate noise).
  // EVD-VIA references only ASN-1/CTX-1/DREF-1 — it is ABSENT from
  // CLM-1's set (the real handler cannot emit it there). ASN-1's set
  // holds EVD-VIA (its supports names ASN-1) — the second hop's target.
  vi.mocked(apiClient.getRelatedRecords).mockImplementation(async (id: string) => {
    switch (id) {
      case 'CLM-1':
        return {
          related: [
            { recordId: 'EVD-DIRECT', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[0]' },
            { recordId: 'ASN-1', schemaId: ASN_SCHEMA, kind: 'assertion', title: 'assertion', refField: 'claim_ref' },
            { recordId: 'ASN-NO-CLAIM', schemaId: ASN_SCHEMA, kind: 'assertion', title: 'orphan', refField: 'claim_ref' },
            { recordId: 'CLM-9', schemaId: CLAIM_SCHEMA, kind: 'claim', title: 'noise', refField: 'predicate' },
          ],
        } as never
      case 'ASN-1':
        return {
          related: [
            { recordId: 'EVD-VIA', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[0]' },
          ],
        } as never
      default:
        return { related: [] } as never
    }
  })
}

function renderClaimRoute() {
  return render(
    <MemoryRouter initialEntries={['/claims/CLM-1']}>
      <Routes>
        <Route
          path="/claims/:claimId"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <ClaimWorkspace />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

function claimRecord(payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId: 'CLM-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/claim.schema.yaml',
    meta: { kind: 'claim' },
    payload,
  }
}

describe('ClaimWorkspace', () => {
  it('renders the claim statement and status', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({
        recordId: 'CLM-1',
        statement: 'Rotenone increases ROS in viable cells',
        status: 'proposed',
      }),
    )
    renderClaimRoute()
    expect(await screen.findByText('Rotenone increases ROS in viable cells')).toBeDefined()
    expect(screen.getByText('proposed')).toBeDefined()
    expect(screen.getByTestId('claim-workspace')).toBeDefined()
  })

  it('keeps the workspace tab strip visible (reported "zero tabs" bug)', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({ recordId: 'CLM-1', statement: 'x', status: 'proposed' }),
    )
    renderClaimRoute()
    await screen.findByTestId('claim-workspace')
    expect(screen.getByTestId('workspace-tab-strip')).toBeDefined()
  })

  // ---- GC-13 (leg E): the dead-chrome kill — real data, both directions ----

  it('wires the Evidence Ledger from real records: Supporting groups direct + via-assertion bundles, each linking /record/:id (D4). The via-assertion bundle is reachable ONLY by the second hop — the single-hop claim scan cannot see it (RelatedRecordsHandlers semantics).', async () => {
    seedLedger()
    renderClaimRoute()
    const supporting = await screen.findByTestId('claim-evidence-group-supporting')
    const rows = screen.getAllByTestId('claim-evidence-row')
    const ids = rows.map((r) => r.textContent).filter((t) => t !== undefined)
    // EVD-DIRECT is the claim's direct support (the single-hop scan sees
    // it); EVD-VIA reaches the claim THROUGH its assertion — the second
    // hop (the scan over ASN-1 + re-read) is the only path to it.
    expect(ids.join(' ')).toContain('EVD-DIRECT')
    expect(ids.join(' ')).toContain('EVD-VIA')
    // the second hop fired against the assertion, not the claim
    expect(apiClient.getRelatedRecords).toHaveBeenCalledWith('ASN-1')
    // each row links the evidence record (the reciprocal claim->evidence leg)
    const links = screen.getAllByTestId('claim-evidence-link')
    expect(links.map((l) => l.getAttribute('href')).sort()).toEqual([
      '/record/EVD-DIRECT',
      '/record/EVD-VIA',
    ])
    expect(supporting).toBeDefined()
  })

  it('wires the Connections/Runs group from the bundles sources: the reciprocal run link targets the GC evidence surface /gc-run/:runId — NOT the Run·Design canvas /runs/:runId (GATEFIX-D5, gate G7)', async () => {
    seedLedger()
    renderClaimRoute()
    const link = await screen.findByTestId('claim-run-link-ANR-R1')
    // ANR-R1 is an ANALYSIS-RUN record (the bundle's source type pins it).
    // /runs/:runId serves the Run·Design workspace — the plate-design
    // canvas for a `run` record — so an analysis-run id landing there is
    // a kind-mismatched dead end (gate D5: "Click to choose labware",
    // "No protocol attached", no GC evidence context). The reciprocal
    // link must land on the surface that renders the run's GC evidence
    // context (its evidence/claim back-links).
    expect(link).toHaveAttribute('href', '/gc-run/ANR-R1')
    expect(screen.getByTestId('claim-connections')).toBeDefined()
  })

  it('a claim with no bundles renders the HONEST empty arm (not the old placeholder while data exists)', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({ recordId: 'CLM-1', statement: 'lonely claim', status: 'proposed' }),
    )
    vi.mocked(apiClient.getRelatedRecords).mockResolvedValue({ related: [] } as never)
    renderClaimRoute()
    expect(await screen.findByTestId('claim-evidence-empty')).toHaveTextContent(
      'No evidence bundle targets this claim',
    )
    expect(screen.getByTestId('claim-connections-runs-empty')).toHaveTextContent(
      'No evidence bundle points at an analysis run yet.',
    )
    // the OLD dead placeholders are gone from the source (bait: G8)
    expect(screen.queryByText('No supporting evidence yet.')).toBeNull()
    expect(screen.queryByText('No linked runs.')).toBeNull()
  })

  it('the orphan assertion (no claim_ref) and the related-scan noise never crash or mislabel (bait #7: untyped scan, schemaId-filtered)', async () => {
    seedLedger()
    renderClaimRoute()
    await screen.findByTestId('claim-evidence-group-supporting')
    // ASN-NO-CLAIM is NOT a ledger row (it is not evidence); CLM-9 noise is
    // not rendered as a bundle. The ledger holds exactly the two bundles.
    const links = screen.getAllByTestId('claim-evidence-link')
    expect(links).toHaveLength(2)
  })

  // ---- FIX4 (defect 7): a failed related scan must NOT assert "no evidence" ----

  it('a 5xx on the related scan renders an explicit ledger error arm and suppresses the false empty arms (defect 7: no "no evidence" while the scan that would find evidence failed)', async () => {
    vi.mocked(apiClient.getRecord).mockResolvedValue(
      claimRecord({ recordId: 'CLM-1', statement: 'lonely claim', status: 'proposed' }),
    )
    vi.mocked(apiClient.getRelatedRecords).mockRejectedValue(new Error('503: related-record scan failed'))
    renderClaimRoute()
    // the ledger says the scan FAILED — a loud arm, never a fact
    expect(await screen.findByTestId('claim-evidence-ledger-error')).toHaveTextContent(
      'related-record scan failed',
    )
    // the false empty arms are SUPPRESSED: the ledger cannot claim the
    // absence of evidence (or of runs) when the scan that would find them
    // failed.
    expect(screen.queryByTestId('claim-evidence-empty')).toBeNull()
    expect(screen.queryByTestId('claim-evidence-group-supporting-empty')).toBeNull()
    expect(screen.queryByTestId('claim-evidence-group-contradictory-empty')).toBeNull()
    expect(screen.queryByTestId('claim-connections-runs-empty')).toBeNull()
    // FIX2a (NEW-1, defect-7 class): the Related Claims empty arm is the same
    // lie while the scan is down — its absence is asserted from the SAME
    // related-record scan that failed. Suppressed too.
    expect(screen.queryByTestId('claim-connections-claims-empty')).toBeNull()
    // and the Connections section carries the same failure (loud, not hidden)
    expect(screen.getByTestId('claim-connections-error')).toHaveTextContent('503')
  })

  // ---- FIX2d (NEW-4): a bundle targeting BOTH the claim and one of its
  // ---- assertions is reachable by the first hop AND the second hop — it must
  // ---- render exactly ONCE (the old code pushed it from both lists: duplicate
  // ---- row + duplicate React key={b.id}).

  it('a bundle targeting BOTH the claim and one of its assertions renders exactly ONE ledger row (no duplicate row / duplicate key)', async () => {
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      switch (id) {
        case 'CLM-1':
          return claimRecord({ recordId: 'CLM-1', statement: 'dual-target claim', status: 'proposed' })
        case 'ASN-1':
          return {
            recordId: 'ASN-1',
            schemaId: ASN_SCHEMA,
            payload: {
              kind: 'assertion',
              id: 'ASN-1',
              scope: 'single_context',
              claim_ref: { kind: 'record', id: 'CLM-1', type: 'claim' },
            },
          } as never
        // Dual-target (schema-legal: multi-`supports`): names the claim AND
        // one of the claim's assertions. The single-hop claim scan sees it
        // (its own payload references CLM-1) AND the assertion second hop
        // surfaces it (its payload references ASN-1).
        case 'EVD-DUAL':
          return {
            recordId: 'EVD-DUAL',
            schemaId: EVD_SCHEMA,
            payload: {
              kind: 'evidence',
              id: 'EVD-DUAL',
              supports: [
                { kind: 'record', id: 'CLM-1', type: 'claim' },
                { kind: 'record', id: 'ASN-1', type: 'assertion' },
              ],
              sources: [
                { type: 'result', ref: { kind: 'record', id: 'ANR-R1', type: 'analysis-run' } },
                { type: 'context', ref: { kind: 'record', id: 'CTX-1', type: 'context' } },
              ],
            },
          } as never
        default:
          throw new Error(`404: ${id}`)
      }
    })
    // SINGLE-HOP semantics, both hops see EVD-DUAL.
    vi.mocked(apiClient.getRelatedRecords).mockImplementation(async (id: string) => {
      switch (id) {
        case 'CLM-1':
          return {
            related: [
              { recordId: 'EVD-DUAL', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[0]' },
              { recordId: 'ASN-1', schemaId: ASN_SCHEMA, kind: 'assertion', title: 'assertion', refField: 'claim_ref' },
            ],
          } as never
        case 'ASN-1':
          return {
            related: [
              { recordId: 'EVD-DUAL', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[1]' },
            ],
          } as never
        default:
          return { related: [] } as never
      }
    })
    renderClaimRoute()
    await screen.findByTestId('claim-evidence-group-supporting')
    const links = screen.getAllByTestId('claim-evidence-link')
    // EXACTLY ONE row for EVD-DUAL — the second-hop filter drops the id the
    // claim's own related set already yielded (the duplicate key is gone).
    expect(links).toHaveLength(1)
    expect(links[0]).toHaveAttribute('href', '/record/EVD-DUAL')
  })
})
