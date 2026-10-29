/**
 * GC-13 (leg D) — GcEvidenceHandoff: the evidence hand-off affordance
 * mounted INSIDE the GC results flow-back (D1 re-anchored to GcResultsList,
 * orch brief D1: extend GcResultsList / sibling in app/src/run/gc/ — NOT
 * AnalysisPage, NOT graph/).
 *
 * Flow (per spec D1): each analysis-run row in gc-results-<isenId> gains a
 * "Full context" affordance per output artifact (AOUT chip: name + dataKind)
 * and an "Add as evidence…" affordance that opens the bundle authoring form
 * (D3) with the artifact pre-selected as a `result` source (the OQ-1 data
 * table) — the stance and the target are the scientist's explicit choice
 * (D6: no auto-decide; the form starts empty, submission is a human act).
 *
 * Fetch discipline (D7/bait #5): NOTHING here fires on mount. The run's
 * output artifacts are fetched ONLY after the user opens the hand-off
 * (user-triggered, like the GC-12 refresh idiom); the AOUT chips are fetched
 * ONLY after the user opens the full-context or authoring affordance.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcEvidenceHandoff } from './GcEvidenceHandoff'
import {
  EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE,
  evidenceSourceTypeFor,
} from './gcEvidenceSources'

const ISEN = 'ISEN-GC13-D'
const ANR = 'ANR-TEST-GC13-D'
const AOUT = 'AOUT-TEST-GC13-D'
const ASN = 'ASN-TEST-GC13-D'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getAnalysisRun: vi.fn(),
    getRecord: vi.fn(),
    createRecord: vi.fn(),
    getRelatedRecords: vi.fn().mockResolvedValue({ related: [] }),
  },
}))

const AOUT_PAYLOAD = {
  kind: 'analysis-output-artifact',
  id: AOUT,
  title: 'calibration model',
  name: 'calibration_model',
  dataKind: 'model',
  runRef: { kind: 'record', id: ANR, type: 'analysis-run' },
}
const RUN_PAYLOAD = {
  kind: 'analysis-run',
  id: ANR,
  status: 'succeeded',
  outputArtifactRefs: [{ kind: 'record', id: AOUT, type: 'analysis-output-artifact' }],
}

function mockRun() {
  vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
    record: { recordId: ANR, payload: RUN_PAYLOAD },
  } as never)
  const rec: Record<string, unknown> = {
    [AOUT]: AOUT_PAYLOAD,
    'EVD-LEGACY': {
      kind: 'evidence',
      id: 'EVD-LEGACY',
      supports: [{ kind: 'record', id: 'CLM-TEST-GC13-D', type: 'claim' }],
      sources: [
        { type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } },
        { type: 'context', ref: { kind: 'record', id: 'CTX-1', type: 'context' } },
      ],
    },
    'EVD-OTHER': {
      kind: 'evidence',
      id: 'EVD-OTHER',
      supports: [{ kind: 'record', id: 'CLM-OTHER', type: 'claim' }],
      sources: [{ type: 'result', ref: { kind: 'record', id: 'ANR-OTHER', type: 'analysis-run' } }],
    },
  }
  vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
    const p = rec[id]
    if (!p) throw new Error(`404: ${id}`)
    return { recordId: id, schemaId: 'x', payload: p } as never
  })
  const EVD_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
  vi.mocked(apiClient.getRelatedRecords).mockImplementation(async (id: string) => {
    if (id !== ANR) return { related: [] }
    return {
      related: [
        { recordId: 'EVD-LEGACY', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[0]' },
        { recordId: 'EVD-OTHER', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[0]' },
      ],
    }
  })
}

function renderHandoff() {
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <GcEvidenceHandoff isenId={ISEN} runId={ANR} onBundleCreated={() => {}} />
      </OpenTabsProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockRun()
})

describe('GcEvidenceHandoff (leg D)', () => {
  it('mounts with ZERO fetches (D7: the affordance is closed; nothing fires at mount)', async () => {
    renderHandoff()
    await waitFor(() => expect(screen.getByTestId(`gc-evidence-handoff-${ISEN}`)).toBeDefined())
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.getRecord).not.toHaveBeenCalled()
    expect(apiClient.getRelatedRecords).not.toHaveBeenCalled()
  })

  it('opening the affordance fetches the run ONCE and lists its output artifacts as chips (name + dataKind)', async () => {
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    const aout = await screen.findByTestId('gc-evidence-artifact-chip')
    expect(aout).toHaveTextContent('calibration_model')
    expect(aout).toHaveTextContent('model')
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
  })

  it('"Full context" opens the provenance panel for the artifact (D2)', async () => {
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-full-context'))
    expect(await screen.findByTestId('gc-prov-hop-entry')).toHaveAttribute(
      'href',
      `/record/${AOUT}`,
    )
  })

  it('"Add as evidence…" opens the authoring form with the artifact pre-selected as a `result` source (OQ-1 mapping)', async () => {
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    const form = await screen.findByTestId('gc-evidence-form')
    // the artifact source is pre-derived from the OQ-1 data table (result),
    // but the stance + target are EMPTY (D6: no auto-decide)
    const src = within(form).getByTestId('gc-evidence-form-source')
    expect(src).toHaveTextContent(AOUT)
    expect(src).toHaveTextContent('result')
    expect(within(form).queryByTestId('gc-evidence-form-stance-supports-checked')).toBeNull()
    expect(within(form).queryByTestId('gc-evidence-form-stance-refutes-checked')).toBeNull()
    expect(within(form).queryByTestId('gc-evidence-form-stance-assesses-checked')).toBeNull()
  })

  it('the form does NOT POST without an explicit stance (D6: the human chooses)', async () => {
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    // choose a target (the scientist's explicit act: the id + its kind)
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: ASN } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    expect(await screen.findByTestId('gc-evidence-form-error')).toHaveTextContent('stance')
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })

  it('a complete bundle POSTs via the canonical create path with the OQ-1 source type', async () => {
    vi.mocked(apiClient.createRecord).mockResolvedValue({
      record: { recordId: 'EVD-TEST-GC13-D', payload: { kind: 'evidence', id: 'EVD-TEST-GC13-D' } },
      validation: { valid: true, errors: [] },
      lint: { valid: true, violations: [] },
    } as never)
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    fireEvent.click(screen.getByTestId('gc-evidence-form-stance-supports'))
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: ASN } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    await waitFor(() => expect(apiClient.createRecord).toHaveBeenCalledTimes(1))
    const [schemaId, payload] = vi.mocked(apiClient.createRecord).mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(schemaId).toContain('evidence.schema.yaml')
    expect(payload['supports']).toEqual([{ kind: 'record', id: ASN, type: 'assertion' }])
    expect(payload['sources']).toEqual([
      { type: 'result', ref: { kind: 'record', id: AOUT, type: 'analysis-output-artifact' } },
    ])
  })

  it('a lint-blocked create shows the lint violation VERBATIM (422 lint-invalid, never a fake success)', async () => {
    const violation = {
      ruleId: 'evd-sources-need-context-arm',
      message:
        "evidence 'EVD-X' takes a stance but declares no context-typed source — add a 'context' or 'measurement_context' source",
    }
    vi.mocked(apiClient.createRecord).mockRejectedValue(
      Object.assign(new Error('Lint failed'), { status: 422, details: { lint: { valid: false, violations: [violation] } } }),
    )
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    fireEvent.click(screen.getByTestId('gc-evidence-form-stance-supports'))
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: ASN } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    expect(await screen.findByTestId('gc-evidence-form-lint-error')).toHaveTextContent(
      'evd-sources-need-context-arm',
    )
  })

  it('a successful create reports the new bundle id and triggers the section refresh (user-triggered)', async () => {
    const onBundleCreated = vi.fn()
    render(
      <ThemeProvider>
        <OpenTabsProvider>
          <GcEvidenceHandoff isenId={ISEN} runId={ANR} onBundleCreated={onBundleCreated} />
        </OpenTabsProvider>
      </ThemeProvider>,
    )
    vi.mocked(apiClient.createRecord).mockResolvedValue({
      record: { recordId: 'EVD-TEST-GC13-D', payload: { kind: 'evidence', id: 'EVD-TEST-GC13-D' } },
      validation: { valid: true, errors: [] },
      lint: { valid: true, violations: [] },
    } as never)
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    fireEvent.click(screen.getByTestId('gc-evidence-form-stance-supports'))
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: ASN } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    expect(await screen.findByTestId('gc-evidence-form-created')).toHaveTextContent('EVD-TEST-GC13-D')
    expect(onBundleCreated).toHaveBeenCalledTimes(1)
  })
  it('the reciprocal run->claim leg: bundles whose sources point at this run link back to /claims/:claimId (G7)', async () => {
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    const linked = await screen.findByTestId('gc-evidence-linked-claims')
    const claimLink = within(linked).getByTestId('gc-evidence-claim-link-CLM-TEST-GC13-D')
    expect(claimLink).toHaveAttribute('href', '/claims/CLM-TEST-GC13-D')
    // the other bundle's claim is NOT surfaced (its source points at another run)
    expect(within(linked).queryByTestId('gc-evidence-claim-link-CLM-OTHER')).toBeNull()
  })
})

describe('gcEvidenceSources (leg D data table)', () => {
  const ENUM = ['result', 'context', 'measurement_context', 'event', 'publication', 'file', 'event_graph']
  it('maps the OQ-1 pairs (artifact/run -> result, DREF -> file, mctx -> measurement_context)', () => {
    expect(evidenceSourceTypeFor('analysis-output-artifact', ENUM)).toBe('result')
    expect(evidenceSourceTypeFor('analysis-run', ENUM)).toBe('result')
    expect(evidenceSourceTypeFor('data-reference', ENUM)).toBe('file')
    expect(evidenceSourceTypeFor('measurement-context', ENUM)).toBe('measurement_context')
  })
  it('refuses to invent a type for unmapped or drifted kinds', () => {
    expect(evidenceSourceTypeFor('sample', ENUM)).toBeNull()
    expect(evidenceSourceTypeFor('analysis-output-artifact', ['context'])).toBeNull()
  })
  it('the table is the single source (no scattered ifs) — keys are record types only', () => {
    for (const k of Object.keys(EVIDENCE_SOURCE_TYPE_BY_RECORD_TYPE)) {
      expect(k).toMatch(/^[a-z][a-z0-9-]*$/)
    }
  })
})
