/**
 * GC-13 gate-fix (D5, gate G7) — GcEvidenceRunPage: the reciprocal
 * claim -> analysis-run landing surface.
 *
 * The gate defect: following the claim workspace's Connections "Runs"
 * link (/runs/ANR-TEST-GC13-214258) landed on the Run·Design workspace —
 * the plate-design canvas ("Click to choose labware", "No protocol
 * attached") for an ANALYSIS-RUN record: no GC results, no evidence row,
 * no gc-evidence-claim-link*.
 *
 * Pins (this file):
 *  - an analysis-run record with a GC evidence chain lands on the GC
 *    evidence surface: the run's evidence/claim back-links — the
 *    gc-evidence-claim-link* anchors — are PRESENT (the shipped
 *    GcEvidenceHandoff is open at mount: no second click needed), the
 *    run's declared output artifact renders as a chip, and the
 *    plate-design canvas is NOT the landing;
 *  - the "Full context" affordance (shipped, on the artifact chip) opens
 *    the SHIPPED GcProvenancePanel — reused, not re-implemented;
 *  - a record that is NOT an analysis-run renders a named refusal arm
 *    (id + actual kind) — never the plate canvas, never invented
 *    context;
 *  - a run with no declared outputs renders the shipped hand-off's
 *    honest empty arm; a failed run read renders the loud error arm.
 *
 * Gate-fix2 pins (adversarial review cycle-1):
 *  - the literal 'analysis-run' kind chip renders ONLY when the read
 *    succeeded AND payload.kind === 'analysis-run' — the refusal arm
 *    (a `run` record) and the failed-read arm badge NO kind (defect 1:
 *    the shipped header badged a kind the page just refused);
 *  - the Full-context panel does NOT render the run's own id as an
 *    instrument-sequence-entry hop (defect 2: the run id must not
 *    masquerade as an ISEN — the ISEN lineage hops are the honest
 *    named-gap arm, because a bare analysis-run names no sequence row);
 *  - the landing issues exactly ONE getAnalysisRun for the run (defect 3:
 *    the hand-off reuses the page's already-fetched, kind-verified
 *    record — no double read);
 *  - the plate-canvas absence is pinned at the App-route level
 *    (GcEvidenceRunPage.route.test.tsx — the real router proves the
 *    landing is not RunWorkspacePage); the isolated render pins the
 *    positive D5 claim (the GC evidence section IS the landing) instead
 *    of vacuous text-absence pins (defect 4).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcEvidenceRunPage } from './GcEvidenceRunPage'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getAnalysisRun: vi.fn(),
    getRecord: vi.fn(),
    getRelatedRecords: vi.fn(),
    // AppShell's SurfaceIndicator (trunk drift: the old shell had none) —
    // the house pattern from RegistryHostPage.test.tsx.
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
  },
}))

const ANR = 'ANR-GC13-E'
const AOUT = 'AOUT-GC13-E'
const EVD = 'EVD-GC13-E'
const ASN = 'ASN-GC13-E'
const CLM = 'CLM-GC13-E'

const EVD_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
const ASN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'

const RUN_PAYLOAD = {
  kind: 'analysis-run',
  id: ANR,
  title: 'GC-13 gate witness run',
  status: 'succeeded',
  outputArtifactRefs: [{ kind: 'record', id: AOUT, type: 'analysis-output-artifact' }],
}

/** The GC evidence chain: the run declares one output artifact; the
 *  bundle EVD-GC13-E supports the assertion ASN-GC13-E (claim_ref ->
 *  CLM-GC13-E) and carries the run as an explicit result source (the
 *  shape the shipped form authors — FIX5). The related-scan semantics
 *  mirror RelatedRecordsHandlers (a record appears in the run's set only
 *  because its OWN payload references the run). */
function seedEvidenceChain() {
  vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
    record: { recordId: ANR, payload: RUN_PAYLOAD },
  } as never)
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    switch (id) {
      case AOUT:
        return {
          recordId: AOUT,
          schemaId: 'x',
          payload: {
            kind: 'analysis-output-artifact',
            id: AOUT,
            name: 'calibration_model',
            dataKind: 'model',
            runRef: { kind: 'record', id: ANR, type: 'analysis-run' },
          },
        } as never
      case EVD:
        return {
          recordId: EVD,
          schemaId: EVD_SCHEMA,
          payload: {
            kind: 'evidence',
            id: EVD,
            supports: [{ kind: 'record', id: ASN, type: 'assertion' }],
            sources: [
              { type: 'result', ref: { kind: 'record', id: AOUT, type: 'analysis-output-artifact' } },
              { type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } },
            ],
          },
        } as never
      case ASN:
        return {
          recordId: ASN,
          schemaId: ASN_SCHEMA,
          payload: {
            kind: 'assertion',
            id: ASN,
            claim_ref: { kind: 'record', id: CLM, type: 'claim' },
          },
        } as never
      default:
        throw new Error(`404: ${id}`)
    }
  })
  vi.mocked(apiClient.getRelatedRecords).mockImplementation(async (id: string) => {
    // The run's related set: the bundle (its sources name the run) — the
    // single-hop scan's real semantics.
    if (id === ANR) {
      return {
        related: [{ recordId: EVD, schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[1].ref' }],
      } as never
    }
    return { related: [] } as never
  })
}

function renderPage(runId: string) {
  return render(
    <MemoryRouter initialEntries={[`/gc-run/${runId}`]}>
      <Routes>
        <Route
          path="/gc-run/:runId"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <GcEvidenceRunPage />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('GcEvidenceRunPage — the reciprocal claim -> analysis-run landing (D5, gate G7)', () => {
  it('an analysis-run with a GC evidence chain lands on the GC evidence surface — the run’s evidence back-link (gc-evidence-claim-link*) is PRESENT without a second click, the declared output artifact renders as a chip, and the plate-design canvas is NOT the landing', async () => {
    seedEvidenceChain()
    renderPage(ANR)
    const page = await screen.findByTestId('gc-evidence-run-page')
    expect(page).toBeDefined()

    // The header read the record (title + status from the payload) AND
    // badged the VERIFIED kind — the 'analysis-run' chip renders only
    // now (payload.kind === 'analysis-run' from the same read); the
    // refusal and failed-read arms badge no kind (the pin: the chip
    // text is ABSENT there — defect 1).
    expect(page.textContent).toContain('GC-13 gate witness run')
    expect(screen.getByTestId('gc-evidence-run-status').textContent).toContain('succeeded')
    expect(screen.getByTestId('gc-evidence-run-kind').textContent).toBe('analysis-run')

    // The D5 landing claim (non-vacuous form): the GC evidence context
    // section IS the landing surface (the shipped hand-off, open at mount).
    // The plate-canvas absence itself is pinned at the App-route level —
    // GcEvidenceRunPage.route.test.tsx mounts the REAL router and proves
    // /gc-run/:runId resolves to THIS page, not the Run·Design workspace
    // (RunNavPane / DeckViewer). The old isolated text-absence pins
    // ('Click to choose labware' / 'No protocol attached') were vacuous:
    // this unit cannot render that markup under ANY input, so they could
    // never fail (adversarial review cycle-1, defect 4).
    expect(await screen.findByTestId('gc-evidence-run-evidence')).toBeDefined()

    // The GC evidence context (the shipped hand-off, OPEN at mount — the
    // deep-link landing needs no second click): the run's declared
    // output artifact renders as a chip (name + dataKind, /record/:id
    // link — the shipped reachability seam). The chip row settles after
    // the open act's artifact re-read (async — findByTestId, not get).
    const handoff = await screen.findByTestId(`gc-evidence-handoff-${ANR}`)
    const chip = await within(handoff).findByTestId(`gc-evidence-artifact-chip-${AOUT}`)
    expect(chip.textContent).toContain('calibration_model')
    expect(chip.textContent).toContain('model')
    expect(within(chip).getAllByRole('link').map((l) => l.getAttribute('href'))).toContain(
      `/record/${AOUT}`,
    )

    // THE G7 PIN: the run's evidence back-link is present — the
    // gc-evidence-claim-link* anchor the gate names (the loop: claim
    // workspace -> this surface -> back to the claim), resolved through
    // the assertion's claim_ref.
    const linked = await screen.findByTestId('gc-evidence-linked-claims')
    const claimLink = within(linked).getByTestId(`gc-evidence-claim-link-${CLM}`)
    expect(claimLink).toHaveAttribute('href', `/claims/${CLM}`)

    // Defect 3 (fetch discipline) — pinned HERE, at the test's end, so the
    // count is the TOTAL mount-time count (the page's kind gate AND the
    // hand-off's open-act chip read have both settled; awaiting the
    // back-links proves the open act completed): exactly ONE
    // getAnalysisRun for the run. The hand-off REUSES the page's
    // already-fetched, kind-verified record (initialRun) instead of
    // reading it a second time. The reviewer-measured shipped behaviour
    // was TWO reads on mount (page gate + open act); the double-read is
    // not inherent to the shipped component (its GC-12 call site has no
    // verified record to hand down), so it is deduped here rather than
    // excused. (The AOUT chip / provenance re-reads go through getRecord
    // — the hand-off's per-artifact reads — not a second run read.)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith(ANR)
  })

  it('the "Full context" affordance (shipped, on the artifact chip) opens the SHIPPED GcProvenancePanel — reused, not re-implemented', async () => {
    seedEvidenceChain()
    renderPage(ANR)
    const handoff = await screen.findByTestId(`gc-evidence-handoff-${ANR}`)
    // The shipped chip's Full context button (the artifact is the walk's
    // entry; the run hop resolves from the artifact's runRef).
    await screen.findByTestId(`gc-evidence-artifact-chip-${AOUT}`)
    const buttons = within(handoff).getAllByTestId('gc-evidence-full-context')
    // The walk re-reads the artifact + run (fresh getRecord implementation
    // — the run's optional hops stay absent: honest named-gap arms).
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === AOUT) {
        return {
          recordId: AOUT,
          schemaId: 'x',
          payload: {
            kind: 'analysis-output-artifact',
            id: AOUT,
            name: 'calibration_model',
            dataKind: 'model',
            runRef: { kind: 'record', id: ANR, type: 'analysis-run' },
          },
        } as never
      }
      if (id === ANR) {
        return {
          recordId: ANR,
          schemaId: 'x',
          payload: {
            kind: 'analysis-run',
            id: ANR,
            title: 'GC-13 gate witness run',
            status: 'succeeded',
            // No effective_parameters output, no sequence linkage, no
            // frozen inputs — the optional hops render their honest
            // named-gap / unresolved arms (never invented facts).
          },
        } as never
      }
      throw new Error(`404: ${id}`)
    })
    fireEvent.click(buttons[0])
    // The shipped panel's analysis-run hop resolved (the artifact's
    // runRef) — the fact rows read the payload verbatim.
    const runHop = await screen.findByTestId('gc-prov-hop-analysis-run')
    expect(runHop.getAttribute('href')).toBe(`/record/${ANR}`)
    expect(screen.getByTestId('gc-prov-fact-analysis-run-status').textContent).toContain('succeeded')

    // Defect 2 (run != ISEN — the spec's 'two names for one entity' bait
    // #6): the page passes NO instrument-sequence-entry id to the
    // hand-off. A bare analysis-run names no sequence row — the sequence
    // context is genuinely unknown from this surface — so the ISEN
    // lineage hop renders its HONEST named-gap arm. The shipped (buggy)
    // page passed the run id as isenId, and the walker fetched the ANR
    // as an ISEN: the panel then linked /record/ANR-GC13-E typed
    // instrument-sequence-entry — the run masquerading as a sequence row.
    // The ANR MAY appear as the analysis-run hop (above, typed as such);
    // it must NOT appear as an ISEN hop.
    expect(screen.queryByTestId('gc-prov-hop-instrument-sequence-entry')).toBeNull()
    expect(await screen.findByTestId('gc-prov-hop-absent-instrument-sequence-entry')).toHaveTextContent(
      'not linked (named gap)',
    )
  })

  it('a record that is NOT an analysis-run renders the named refusal arm — never the plate canvas, never invented GC context', async () => {
    // A `run` record (the plate-canvas kind) on this surface: the page's
    // kind check (payload.kind from the SAME getAnalysisRun payload)
    // refuses with the id + the actual kind named.
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'RUN-NOT-ANR',
        payload: { kind: 'run', id: 'RUN-NOT-ANR', title: 'a plate run' },
      },
    } as never)
    renderPage('RUN-NOT-ANR')
    const err = await screen.findByTestId('gc-evidence-run-error')
    expect(err).toHaveTextContent('RUN-NOT-ANR')
    expect(err).toHaveTextContent('run')
    // No GC chrome at all (no hand-off, no evidence context section).
    expect(screen.queryByTestId('gc-evidence-run-evidence')).toBeNull()
    expect(screen.queryByTestId(/gc-evidence-handoff-/)).toBeNull()
    // Defect 1 (kind chip): the refusal arm must NOT badge a kind the
    // page just refused. The record's actual kind is `run` — and the
    // header previously rendered the literal 'analysis-run' chip next to
    // the refused id (the reviewer probe: header text
    // "RUN-NOT-ANRanalysis-runRUN-NOT-ANR"). Pin the absence: no
    // 'analysis-run' chip on this page when the kind is not
    // analysis-run (the page renders nothing misleading, not the wrong
    // kind's badge).
    expect(screen.queryByTestId('gc-evidence-run-kind')).toBeNull()
    expect(screen.queryByText('analysis-run')).toBeNull()
  })

  it('an analysis-run with no declared outputs renders the shipped hand-off’s honest empty arm', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: 'ANR-NOOUT',
        payload: { kind: 'analysis-run', id: 'ANR-NOOUT', title: 't', status: 'queued' },
      },
    } as never)
    vi.mocked(apiClient.getRelatedRecords).mockResolvedValue({ related: [] } as never)
    renderPage('ANR-NOOUT')
    // The evidence section mounts (the run's back-links are independent
    // of its declared outputs); the chips settle to the honest empty arm
    // the shipped component owns (never a fabricated row).
    expect(await screen.findByTestId('gc-evidence-run-evidence')).toBeDefined()
    expect(await screen.findByTestId('gc-evidence-handoff-no-outputs')).toHaveTextContent(
      'this run declares no output artifacts',
    )
  })

  it('a failed run read renders the loud error arm (never a fabricated surface)', async () => {
    vi.mocked(apiClient.getAnalysisRun).mockRejectedValue(new Error('404: not found'))
    renderPage('ANR-GONE')
    expect(await screen.findByTestId('gc-evidence-run-error')).toHaveTextContent('404: not found')
    // Defect 1 (kind chip, failed-read arm): the record was NEVER read —
    // the header badges no kind (the shipped literal 'analysis-run' chip
    // asserted a kind the read could not establish).
    expect(screen.queryByTestId('gc-evidence-run-kind')).toBeNull()
    expect(screen.queryByText('analysis-run')).toBeNull()
  })
})
