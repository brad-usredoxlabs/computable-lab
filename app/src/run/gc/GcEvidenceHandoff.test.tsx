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
import { runIdsFromEvidence } from '../../claims/claimEvidenceModel'

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
    // FIX6 (defect 9): the form reads the source-type enum from the REAL
    // schema at runtime — mocked with the real enum (the drift test in
    // gcEvidenceSources.test.ts pins the table against the real YAML).
    getSchema: vi.fn(),
  },
}))

const EVD_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
const ASN_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'
const AOUT_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml'
const CTX_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/context.schema.yaml'
const REAL_ENUM = ['result', 'context', 'measurement_context', 'event', 'publication', 'file', 'event_graph']

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
  // FIX6 (defect 9): the form resolves the enum from the real schema at
  // runtime (getSchema); the shape mirrors the client's SchemaInfo.
  vi.mocked(apiClient.getSchema).mockImplementation(async (id: string) => {
    switch (id) {
      case EVD_SCHEMA_ID:
        return {
          id: EVD_SCHEMA_ID,
          path: 'evidence.schema.yaml',
          title: 'Evidence',
          schema: {
            $defs: {
              EvidenceSource: {
                properties: { type: { type: 'string', enum: REAL_ENUM } },
              },
            },
          },
        } as never
      case ASN_SCHEMA_ID:
        return { id: ASN_SCHEMA_ID, path: 'assertion.schema.yaml', title: 'Assertion' } as never
      case AOUT_SCHEMA_ID:
        return { id: AOUT_SCHEMA_ID, path: 'analysis-output-artifact.schema.yaml', title: 'AOUT' } as never
      case CTX_SCHEMA_ID:
        return { id: CTX_SCHEMA_ID, path: 'context.schema.yaml', title: 'Context' } as never
      default:
        throw new Error(`404: schema ${id}`)
    }
  })
  const rec: Record<string, unknown> = {
    [AOUT]: AOUT_PAYLOAD,
    // The form's authoring target (assertion) — the pre-submit kind
    // resolution (FIX6 defect 10) GETs it; it must resolve cleanly.
    [ASN]: { kind: 'assertion', id: ASN, scope: 'single_context' },
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
    // FIX5 (defect 4a): the authored payload carries the run as an
    // EXPLICIT result source — an artifact-only source never references
    // the run, so the single-hop related scan (and therefore both G7
    // legs) is blind to form-authored bundles without it.
    expect(payload['sources']).toEqual([
      { type: 'result', ref: { kind: 'record', id: AOUT, type: 'analysis-output-artifact' } },
      { type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } },
    ])
  })

  it('G7 (FIX5, defect 4): a bundle AUTHORED THROUGH THE FORM (artifact source, assertion target) lands BOTH reciprocal links. (a) the run is an explicit source in the authored payload; (b) the run->claim back link resolves the assertion target via its claim_ref (the form offers assertion as a first-class target); the just-created bundle appears without a page reload.', async () => {
    const EVD_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml'
    const ASN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml'
    const FORM_BUNDLE = 'EVD-FORM-GC13-FIX5'
    const FIX5_CLAIM = 'CLM-TEST-FIX5'
    const FORM_PAYLOAD = {
      kind: 'evidence',
      id: FORM_BUNDLE,
      supports: [{ kind: 'record', id: ASN, type: 'assertion' }],
      sources: [
        { type: 'result', ref: { kind: 'record', id: AOUT, type: 'analysis-output-artifact' } },
        { type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } },
      ],
    }
    const created: Array<Record<string, unknown>> = []
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      switch (id) {
        case AOUT:
          return { recordId: AOUT, schemaId: 'x', payload: AOUT_PAYLOAD } as never
        case ASN:
          return {
            recordId: ASN,
            schemaId: ASN_SCHEMA,
            payload: {
              kind: 'assertion',
              id: ASN,
              scope: 'single_context',
              claim_ref: { kind: 'record', id: FIX5_CLAIM, type: 'claim' },
            },
          } as never
        case 'EVD-LEGACY':
          return {
            recordId: 'EVD-LEGACY',
            schemaId: EVD_SCHEMA,
            payload: {
              kind: 'evidence',
              id: 'EVD-LEGACY',
              supports: [{ kind: 'record', id: 'CLM-TEST-GC13-D', type: 'claim' }],
              sources: [
                { type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } },
                { type: 'context', ref: { kind: 'record', id: 'CTX-1', type: 'context' } },
              ],
            },
          } as never
        case 'EVD-OTHER':
          return {
            recordId: 'EVD-OTHER',
            schemaId: EVD_SCHEMA,
            payload: {
              kind: 'evidence',
              id: 'EVD-OTHER',
              supports: [{ kind: 'record', id: 'CLM-OTHER', type: 'claim' }],
              sources: [{ type: 'result', ref: { kind: 'record', id: 'ANR-OTHER', type: 'analysis-run' } }],
            },
          } as never
        case FORM_BUNDLE:
          return { recordId: FORM_BUNDLE, schemaId: EVD_SCHEMA, payload: FORM_PAYLOAD } as never
        default:
          throw new Error(`404: ${id}`)
      }
    })
    let createCount = 0
    vi.mocked(apiClient.getRelatedRecords).mockImplementation(async (id: string) => {
      // SINGLE-HOP semantics (RelatedRecordsHandlers): a record appears
      // in ANR's related set only because its OWN payload references ANR
      // (the form-authored bundle's run source). It is absent until it
      // exists — and the back-link scan must re-run after the create.
      if (id === ANR) {
        const base = [
          { recordId: 'EVD-LEGACY', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[0]' },
          { recordId: 'EVD-OTHER', schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[0]' },
        ]
        return {
          related: createCount > 0
            ? [...base, { recordId: FORM_BUNDLE, schemaId: EVD_SCHEMA, kind: 'evidence', title: 'b', refField: 'sources[1]' }]
            : base,
        } as never
      }
      return { related: [] } as never
    })
    vi.mocked(apiClient.createRecord).mockImplementation(async (_schemaId: string, payload: Record<string, unknown>) => {
      created.push(payload)
      createCount += 1
      return { record: { recordId: FORM_BUNDLE, payload }, validation: { valid: true, errors: [] }, lint: { valid: true, violations: [] } } as never
    })
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    // The scientist's explicit acts: stance supports, target = ASN.
    fireEvent.click(screen.getByTestId('gc-evidence-form-stance-supports'))
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: ASN } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    await screen.findByTestId('gc-evidence-form-created')
    // (a) the authored payload carries the run as an explicit result
    //     source (the artifact alone never references the run).
    expect(created).toHaveLength(1)
    expect(created[0]['supports']).toEqual([{ kind: 'record', id: ASN, type: 'assertion' }])
    const authored = created[0]['sources'] as Array<{ type: string; ref: { id: string; type: string } }>
    expect(authored).toContainEqual({ type: 'result', ref: { kind: 'record', id: AOUT, type: 'analysis-output-artifact' } })
    expect(authored).toContainEqual({ type: 'result', ref: { kind: 'record', id: ANR, type: 'analysis-run' } })
    // (b) the run's back link: the form-authored bundle's stance targets
    //     the ASSERTION; the link resolves ASN -> claim_ref ->
    //     CLM-TEST-FIX5 (a claim-target-only follower — the pre-fix code
    //     — renders nothing here for form-authored bundles).
    const fix5Link = await screen.findByTestId(`gc-evidence-claim-link-${FIX5_CLAIM}`)
    expect(fix5Link).toHaveAttribute('href', `/claims/${FIX5_CLAIM}`)
    // the pre-existing bundle's back link is unaffected
    expect(screen.getByTestId('gc-evidence-claim-link-CLM-TEST-GC13-D')).toHaveAttribute('href', '/claims/CLM-TEST-GC13-D')
  })

  it('FIX5 (defect 4c): runIdsFromEvidence over a form-AUTHORED payload (artifact + explicit run source) yields the run; the old artifact-only shape yields none (the model never invents a run from an artifact ref)', () => {
    const runSource = { type: 'result', ref: { kind: 'record', id: 'ANR-X', type: 'analysis-run' } }
    const artifactSource = { type: 'result', ref: { kind: 'record', id: 'AOUT-X', type: 'analysis-output-artifact' } }
    const p: Record<string, unknown> = {
      kind: 'evidence',
      id: 'EVD-F',
      supports: [{ kind: 'record', id: 'ASN-X', type: 'assertion' }],
      sources: [artifactSource, runSource],
    }
    expect(runIdsFromEvidence([p])).toEqual(['ANR-X'])
    const artifactOnly: Record<string, unknown> = { ...p, sources: [artifactSource] }
    expect(runIdsFromEvidence([artifactOnly])).toEqual([])
  })

  it('FIX6 (defect 10): the typed target id is RESOLVED before submit and its record kind must match the chosen target type — a kind mismatch is refused LOUD, never POSTed (the free-text hole: a typo or a wrong-kind id used to produce a lint-passing bundle whose target does not exist as that kind)', async () => {
    const CTX = 'CTX-WRONG-KIND'
    // The form must resolve the typed id with a real GET and compare the
    // record's kind to the chosen target type (assertion|claim).
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      switch (id) {
        case AOUT:
          return { recordId: AOUT, schemaId: AOUT_SCHEMA_ID, payload: AOUT_PAYLOAD } as never
        case ASN:
          return { recordId: ASN, schemaId: ASN_SCHEMA_ID, payload: { kind: 'assertion', id: ASN } } as never
        case CTX:
          return { recordId: CTX, schemaId: CTX_SCHEMA_ID, payload: { kind: 'context', id: CTX } } as never
        default:
          throw new Error(`404: ${id}`)
      }
    })
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    await screen.findByTestId('gc-evidence-form')
    // A context record is NOT an assertion or a claim — refuse.
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: CTX } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-target-type-assertion'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-stance-supports'))
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    expect(await screen.findByTestId('gc-evidence-form-error')).toHaveTextContent(CTX)
    expect(apiClient.createRecord).not.toHaveBeenCalled()
    // The loud arm names the mismatch: the record's actual kind vs the
    // chosen target type.
    const err = screen.getByTestId('gc-evidence-form-error')
    expect(err).toHaveTextContent('context')
    expect(err).toHaveTextContent('assertion')
    // A typo (nonexistent id) is refused the same way.
    fireEvent.change(screen.getByTestId('gc-evidence-form-target-id'), { target: { value: 'ASN-TYPO-404' } })
    fireEvent.click(screen.getByTestId('gc-evidence-form-submit'))
    expect(await screen.findByTestId('gc-evidence-form-error')).toHaveTextContent('ASN-TYPO-404')
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })

  // ---- FIX2c (NEW-3): the form says the bundle "cannot be authored" from an
  // ---- unmapped artifact kind — submit must be DISABLED (the reason visible),
  // ---- not a run-only POST: the selected artifact is the bundle's subject.

  it('an unmapped artifact kind DISABLES submit (the reason stays visible) and the POST never proceeds with a run-only source (NEW-3)', async () => {
    // An output ref whose TYPE has no OQ-1 mapping ('sample' is the kind
    // the data-table test pins as unmapped): the chip type is the ref's
    // type — the form's pre-derived artifact source is null for it.
    const AOUT_UNMAPPED = 'AOUT-UNMAPPED-GC13'
    vi.mocked(apiClient.getAnalysisRun).mockResolvedValue({
      record: {
        recordId: ANR,
        payload: {
          kind: 'analysis-run',
          id: ANR,
          status: 'succeeded',
          outputArtifactRefs: [{ kind: 'record', id: AOUT_UNMAPPED, type: 'sample' }],
        },
      },
    } as never)
    vi.mocked(apiClient.getRecord).mockImplementation(async (id: string) => {
      if (id === AOUT_UNMAPPED) {
        return {
          recordId: id,
          schemaId: 'x',
          payload: { kind: 'sample', id, title: 'unmapped_out' },
        } as never
      }
      if (id === ASN) {
        return { recordId: id, schemaId: 'x', payload: { kind: 'assertion', id, scope: 'single_context' } } as never
      }
      throw new Error(`404: ${id}`)
    })
    renderHandoff()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    fireEvent.click(await screen.findByTestId('gc-evidence-add-as-evidence'))
    const form = await screen.findByTestId('gc-evidence-form')
    // the unmapped-kind reason is the VISIBLE one (same testid the old
    // arm already used) — the scientist sees WHY submit is off.
    expect(await screen.findByTestId('gc-evidence-form-source-unmapped')).toHaveTextContent(
      'no source type declared for this artifact kind',
    )
    const submit = within(form).getByTestId('gc-evidence-form-submit')
    expect(submit).toBeDisabled()
    // belt-and-braces: even a programmatic submit (the hard refusal) must
    // not POST a run-only bundle — the selected artifact is the subject.
    fireEvent.click(submit)
    await new Promise((r) => setTimeout(r, 0))
    expect(apiClient.createRecord).not.toHaveBeenCalled()
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

  it('back-compat (GATEFIX2): with isenId but NO initialRun the GC-12 contract holds — closed at mount, ZERO fetches, testid scoped by the isen id, and the open-act fetches the run itself (the dedupe seam is opt-in via initialRun)', async () => {
    // GcEvidenceRunPage.tsx passes NO isenId at all (defect 2 — the run
    // id must not feed the ISEN provenance hop), but this file's own
    // render helper keeps the GC-12 shape (isenId = a real ISEN id, runId
    // = a different ANR id) untouched. The component must keep working
    // when isenId is the ONLY id it gets: the testid scope is the isen id
    // (the GC-12 rows are gc-results-<isenId>), and the run read happens
    // on the open act (D7), not at mount.
    renderHandoff()
    await waitFor(() => expect(screen.getByTestId(`gc-evidence-handoff-${ISEN}`)).toBeDefined())
    expect(apiClient.getAnalysisRun).not.toHaveBeenCalled()
    expect(apiClient.getRecord).not.toHaveBeenCalled()
    // the run id is NOT used as the testid scope (the isen id is)
    expect(screen.queryByTestId(`gc-evidence-handoff-${ANR}`)).toBeNull()
    fireEvent.click(screen.getByTestId('gc-evidence-handoff-open'))
    const chip = await screen.findByTestId('gc-evidence-artifact-chip')
    expect(chip).toHaveTextContent('calibration_model')
    // without initialRun the open act reads the run ITSELF (the GC-12
    // call site has no verified record to hand down — the seam is opt-in)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledTimes(1)
    expect(apiClient.getAnalysisRun).toHaveBeenCalledWith(ANR)
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
