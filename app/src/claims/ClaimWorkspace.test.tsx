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
 *  supports the assertion (claim_ref -> CLM-1). Related-record scan noise
 *  (a claim ref that is not evidence, an assertion with no claim_ref) must
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
  vi.mocked(apiClient.getRelatedRecords).mockResolvedValue({
    related: [
      { recordId: 'EVD-DIRECT', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[0]' },
      { recordId: 'EVD-VIA', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'bundle', refField: 'supports[0]' },
      { recordId: 'ASN-1', schemaId: ASN_SCHEMA, kind: 'assertion', title: 'assertion', refField: 'claim_ref' },
      { recordId: 'ASN-NO-CLAIM', schemaId: ASN_SCHEMA, kind: 'assertion', title: 'orphan', refField: 'claim_ref' },
      { recordId: 'CLM-9', schemaId: CLAIM_SCHEMA, kind: 'claim', title: 'noise', refField: 'predicate' },
    ],
  } as never)
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

  it('wires the Evidence Ledger from real records: Supporting groups direct + via-assertion bundles, each linking /record/:id (D4)', async () => {
    seedLedger()
    renderClaimRoute()
    const supporting = await screen.findByTestId('claim-evidence-group-supporting')
    const rows = screen.getAllByTestId('claim-evidence-row')
    const ids = rows.map((r) => r.textContent).filter((t) => t !== undefined)
    // EVD-DIRECT is the claim's direct support; EVD-VIA reaches the claim
    // THROUGH its assertion (claim_ref join — the D1 join semantics reused).
    expect(ids.join(' ')).toContain('EVD-DIRECT')
    expect(ids.join(' ')).toContain('EVD-VIA')
    // each row links the evidence record (the reciprocal claim->evidence leg)
    const links = screen.getAllByTestId('claim-evidence-link')
    expect(links.map((l) => l.getAttribute('href')).sort()).toEqual([
      '/record/EVD-DIRECT',
      '/record/EVD-VIA',
    ])
    expect(supporting).toBeDefined()
  })

  it('wires the Connections/Runs group from the bundles sources: analysis-run links /runs/:runId (the reciprocal run->claim back-link)', async () => {
    seedLedger()
    renderClaimRoute()
    const link = await screen.findByTestId('claim-run-link-ANR-R1')
    expect(link).toHaveAttribute('href', '/runs/ANR-R1')
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
})
