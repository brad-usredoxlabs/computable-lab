/**
 * GC-13 (leg C) — GcProvenancePanel + gcProvenance chain walker.
 *
 * The chain is built from fixtures shaped on the 129th-handoff gate
 * fixtures (ANR-000013's engineProvenance verbatim: ENG-PYCAL01-L1T2305 /
 * reference-2026-10 / /usr/bin/python3 3.14.7; a terminal DREF with a real
 * sha256 contentHash) — every hop a REAL getRecord through the mocked
 * client (refs, never cached copies). Coverage:
 *  - the chain resolves hop by hop to the NAS contentHash (the
 *    "resolves to the hash" witness);
 *  - engine provenance renders VERBATIM (actual, not the revision's
 *    declared ideal) and 'approximate' capability support stays
 *    'approximate' (never 'supported');
 *  - the absent measurement-context hop renders its HONEST named gap arm
 *    (GAP-1), never blank, never a silent skip;
 *  - a failed ref fetch renders a LOUD error arm and the terminal hash is
 *    unresolved (named gap), never faked.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ThemeProvider } from '../../shared/shell'
import { OpenTabsProvider } from '../../shared/shell/OpenTabsContext'
import { apiClient } from '../../shared/api/client'
import { GcProvenancePanel } from './GcProvenancePanel'
import { chainContentHash, entryFacts, hopFacts, standardsFacts, walkProvenanceChain } from './gcProvenance'

const AOUT = 'AOUT-TEST-GC13'
const ANR = 'ANR-TEST-GC13'
const ANREV = 'ANREV-TEST-GC13'
const DREF = 'DREF-TEST-GC13'
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'
// FIX3 fixture ids (the acquisition end + the engine record)
const ISEN = 'ISEN-TEST-GC13'
const ACQP = 'ACQP-TEST-GC13'
const SMP = 'SMP-TEST-GC13'
const GCM = 'GCM-TEST-GC13'
const REVPIN = 'REV-DEADBEEF'
const ENG = 'ENG-PYCAL01-L1T2305'
const AOUT_EP = 'AOUT-TEST-GC13-EP'
const AOUT_L1 = 'AOUT-TEST-GC13-L1'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
  },
}))

function env(id: string, payload: Record<string, unknown>) {
  return { recordId: id, schemaId: `https://computable-lab.com/schema/computable-lab/${id}.schema.yaml`, payload }
}

/** The calibration-model inlineValue (shaped on the live AOUT-000020
 *  payload, 129th-handoff gate fixture: equation string verbatim,
 *  statistic name/value, fit_points whose relative_residual MAY be null —
 *  the honest null arm GC-11 shipped). */
function calibrationInlineValue(): Record<string, unknown> {
  return {
    model_version: 1,
    model: 'linear',
    equation: 'raw_area_pa_min = 2.21 * amount_ng_uL + 1.0',
    statistic_name: 'weighted_r_squared',
    statistic_value: 0.8878,
    response_quantity: 'raw_area_pa_min',
    amount_unit: 'ng/uL',
    x_min: 1,
    x_max: 4,
    fit_points: [
      { amount: '1', response: '3', weight: '1', relative_residual: null, source_input: 'level_1', source_peak_index: 0 },
      { amount: '2', response: '5', weight: '1', relative_residual: '8.4', source_input: 'level_2', source_peak_index: 0 },
    ],
  }
}

/** The frozen standards (ANR.parameters.levels[], shaped on the live
 *  ANR-000013 payload). */
function frozenLevels(): Record<string, unknown> {
  return {
    model: 'linear',
    amount_unit: 'ng/uL',
    levels: [
      { level: 1, compound_label: 'TEST-CMPD-1', amount: 1, fit: true, required: true, input_names: ['level_1'] },
      { level: 2, compound_label: 'TEST-CMPD-2', amount: 2, fit: true, required: true, input_names: ['level_2'] },
    ],
  }
}

function mockChain(opts: { withMctx?: boolean; breakDref?: boolean; withSeq?: boolean; breakIsen?: boolean; artifactInputs?: boolean; oddInput?: boolean; breakEng?: boolean } = {}) {
  const v = vi.mocked(apiClient.getRecord)
  v.mockImplementation(async (id: string) => {
    if (id === AOUT) {
      return env(AOUT, {
        kind: 'analysis-output-artifact',
        id: AOUT,
        title: 'calibration model',
        name: 'calibration_model',
        dataKind: 'model',
        runRef: { kind: 'record', id: ANR, type: 'analysis-run' },
        // the calibration-model payload (D2 item 10 / gate G4)
        inlineValue: calibrationInlineValue(),
      })
    }
    if (id === ANR) {
      const payload: Record<string, unknown> = {
        kind: 'analysis-run',
        id: ANR,
        title: 'GC-13 test calibration run',
        status: 'succeeded',
        revisionRef: { kind: 'record', id: ANREV, type: 'analysis-revision' },
        frozenRevisionRef: { kind: 'record', id: ANREV, type: 'analysis-revision' },
        // live ANR-000013 shape: the inputs may be ARTIFACTS (level runs),
        // not just data references — the walker must not drop them.
        inputs: opts.artifactInputs
          ? { level_1: { kind: 'record', id: AOUT_L1, type: 'analysis-output-artifact' } }
          : opts.oddInput
            ? {
                trace: { kind: 'record', id: DREF, type: 'data-reference' },
                ctx1: { kind: 'record', id: 'CTX-1', type: 'context' },
              }
            : { trace: { kind: 'record', id: DREF, type: 'data-reference' } },
        // the effective_parameters artifact (D2 hop 5 / gate G4 link)
        outputArtifactRefs: [{ kind: 'record', id: AOUT_EP, type: 'analysis-output-artifact' }],
        parameters: frozenLevels(),
        engineProvenance: {
          engineRef: { kind: 'record', id: ENG, type: 'analysis-engine' },
          engineRecordId: ENG,
          engineVersion: 'reference-2026-10',
          adapter: 'python-subprocess/1',
          interpreterPath: '/usr/bin/python3',
          interpreterVersion: '3.14.7',
          packages: [{ name: 'numpy', required: '>=1.26', actual: '1.26.4' }],
          probedAt: '2026-10-27T12:00:00Z',
          capabilitiesReported: [
            { capability: 'curve_fitting', support: 'supported' },
            { capability: 'weighted_regression', support: 'supported' },
            { capability: 'deconvolution', support: 'approximate' },
          ],
        },
      }
      if (opts.withMctx) {
        payload['measurementContextRef'] = {
          kind: 'record',
          id: 'MCTX-TEST-GC13',
          type: 'measurement-context',
        }
      }
      return env(ANR, payload)
    }
    if (id === ANREV) {
      return env(ANREV, {
        kind: 'analysis-revision',
        id: ANREV,
        title: 'GC-13 calibration revision',
        sdkVersion: '0.1.0',
        engineRef: { kind: 'record', id: ENG, type: 'analysis-engine' },
      })
    }
    if (id === DREF) {
      if (opts.breakDref) throw new Error('record not found: DREF-TEST-GC13')
      return env(DREF, {
        kind: 'data-reference',
        id: DREF,
        title: 'FID trace (test)',
        storageDeviceId: 'gc-fid-nas',
        path: 'test/gc13/trace.0',
        contentHash: HASH,
        sizeBytes: 4096,
        readerVersion: 'gc-4-registration/1',
      })
    }
    if (id === AOUT_L1) {
      // an ARTIFACT run input (the live CAL-chain shape): its DREF is the
      // input's dataReferenceRef — the walker resolves it, never drops it.
      return env(AOUT_L1, {
        kind: 'analysis-output-artifact',
        id: AOUT_L1,
        name: 'level_1_trace',
        dataKind: 'trace',
        runRef: { kind: 'record', id: 'ANR-LEVEL-1', type: 'analysis-run' },
        dataReferenceRef: { kind: 'record', id: DREF, type: 'data-reference' },
      })
    }
    if (id === AOUT_EP) {
      return env(AOUT_EP, {
        kind: 'analysis-output-artifact',
        id: AOUT_EP,
        name: 'effective_parameters',
        dataKind: 'table',
        runRef: { kind: 'record', id: ANR, type: 'analysis-run' },
      })
    }
    if (id === ENG) {
      // gate2 D3 fixture arm: the engine record's fetch FAILS (NOT_FOUND)
      // — the hop's ref is KNOWN (the run's engineProvenance names it)
      // but the record does not load.
      if (opts.breakEng) throw new Error(`NOT_FOUND: Record not found: ${ENG}`)
      // the ACTUAL engine record (live shape: engine_family/engine_version/
      // capabilities.declared — the engine hop reads ITS OWN payload)
      return env(ENG, {
        kind: 'analysis-engine',
        id: ENG,
        title: 'Lane python entry-script engine (calibration gate, OQ-5)',
        engine_family: 'computable-lab-analysis-reference',
        engine_version: 'reference-2026-10',
        implementation: { adapter: 'python-entry-script', entry: 'run' },
        capabilities: {
          declared: [
            { capability: 'curve_fitting', support: 'supported' },
            { capability: 'deconvolution', support: 'approximate' },
          ],
        },
      })
    }
    if (opts.withSeq) {
      if (id === ISEN) {
        if (opts.breakIsen) throw new Error('record not found: ISEN-TEST-GC13')
        return env(ISEN, {
          kind: 'instrument-sequence-entry',
          id: ISEN,
          // the lineage refs (ISEN schema, type-pinned; the gc-method ref
          // carries the OPTIONAL revisionRef REV- pin — the ref datatype)
          sampleRef: { kind: 'record', id: SMP, type: 'sample' },
          gcMethodRef: {
            kind: 'record',
            id: GCM,
            type: 'gc-method',
            revisionRef: { kind: 'record', type: 'record-revision', id: REVPIN },
          },
          acquisitionPackageRef: { kind: 'record', id: ACQP, type: 'acquisition-package' },
        })
      }
      if (id === ACQP) {
        return env(ACQP, {
          kind: 'acquisition-package',
          id: ACQP,
          sampleRef: { kind: 'record', id: SMP, type: 'sample' },
          // per-file DREF pins (ACQP schema files[].dataReferenceRef)
          files: [
            { relativePath: 'trace.0', dataReferenceRef: { kind: 'record', id: DREF, type: 'data-reference' } },
          ],
          signalCollectionRef: { kind: 'record', id: 'SCL-TEST-GC13', type: 'signal-collection' },
        })
      }
      if (id === SMP) {
        return env(SMP, { kind: 'sample', id: SMP, title: 'GC-13 test sample' })
      }
      if (id === GCM) {
        return env(GCM, { kind: 'gc-method', id: GCM, title: 'GC-13 test method' })
      }
      if (id === REVPIN) {
        return env(REVPIN, {
          kind: 'record-revision',
          id: REVPIN,
          revision: 1,
          contentHash: HASH,
        })
      }
    }
    if (id === 'MCTX-TEST-GC13') {
      return env('MCTX-TEST-GC13', {
        kind: 'measurement-context',
        id: 'MCTX-TEST-GC13',
        equipment_ref: { kind: 'record', id: 'EQUIP-TEST-GC13', type: 'equipment' },
        acquisition_context: {
          calibration_refs: [{ kind: 'record', id: 'CAL-TEST-GC13', type: 'calibration-record' }],
          authorization_refs: [],
        },
      })
    }
    throw new Error(`unexpected fetch: ${id}`)
  })
}

const AOUT_REF = { kind: 'record' as const, id: AOUT, type: 'analysis-output-artifact' }

function renderPanel(isenId?: string) {
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <GcProvenancePanel artifactRef={AOUT_REF} isenId={isenId} />
      </OpenTabsProvider>
    </ThemeProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('walkProvenanceChain (leg C)', () => {
  it('resolves hop by hop to the terminal contentHash (the NAS integrity anchor)', async () => {
    mockChain()
    const chain = await walkProvenanceChain(AOUT_REF)
    expect(chainContentHash(chain)).toBe(HASH)
    expect(chain.dataRefId).toBe(DREF)
    const run = chain.hops.find((h) => h.spec.kind === 'analysis-run')
    expect(run?.ref?.id).toBe(ANR)
    expect(run?.payload?.['status']).toBe('succeeded')
    const dref = chain.hops.find((h) => h.spec.kind === 'data-reference')
    expect(dref?.ref?.id).toBe(DREF)
    expect(dref?.payload?.['contentHash']).toBe(HASH)
    const rev = chain.hops.find((h) => h.spec.kind === 'analysis-revision')
    expect(rev?.ref?.id).toBe(ANREV)
  })

  it('the absent measurement-context hop is an honest named gap (GAP-1), not a silent skip', async () => {
    mockChain()
    const chain = await walkProvenanceChain(AOUT_REF)
    const mctx = chain.hops.find((h) => h.spec.kind === 'measurement-context')
    expect(mctx?.absent).toBe(true)
    expect(mctx?.ref).toBeNull()
  })

  it('a pinned measurementContextRef resolves the hop (OQ-2 field)', async () => {
    mockChain({ withMctx: true })
    const chain = await walkProvenanceChain(AOUT_REF)
    const mctx = chain.hops.find((h) => h.spec.kind === 'measurement-context')
    expect(mctx?.absent).toBe(false)
    expect(mctx?.ref?.id).toBe('MCTX-TEST-GC13')
    expect(mctx?.payload?.['equipment_ref']).toBeDefined()
  })

  it('a failed ref fetch is a LOUD arm: the hash terminal is unresolved, never faked', async () => {
    mockChain({ breakDref: true })
    const chain = await walkProvenanceChain(AOUT_REF)
    expect(chainContentHash(chain)).toBeNull()
    const dref = chain.hops.find((h) => h.spec.kind === 'data-reference')
    expect(dref?.error).toContain('DREF-TEST-GC13')
  })

  // ---- FIX3: the acquisition end walks by REAL per-hop GETs (defect 1) ----

  it('the acquisition hops (package / sequence row / sample / gc-method) RESOLVE when the sequence context is given and the refs exist — never a static null', async () => {
    mockChain({ withSeq: true })
    const chain = await walkProvenanceChain(AOUT_REF, ISEN)
    const acqp = chain.hops.find((h) => h.spec.kind === 'acquisition-package')
    expect(acqp?.ref?.id).toBe(ACQP)
    expect(acqp?.payload?.['files']).toBeDefined()
    expect(acqp?.error).toBeNull()
    const isen = chain.hops.find((h) => h.spec.kind === 'instrument-sequence-entry')
    expect(isen?.ref?.id).toBe(ISEN)
    expect(isen?.error).toBeNull()
    const sample = chain.hops.find((h) => h.spec.kind === 'sample')
    expect(sample?.ref?.id).toBe(SMP)
    expect(sample?.payload?.['title']).toBe('GC-13 test sample')
    expect(sample?.error).toBeNull()
    const gcm = chain.hops.find((h) => h.spec.kind === 'gc-method')
    expect(gcm?.ref?.id).toBe(GCM)
    expect(gcm?.error).toBeNull()
  })

  it('the gc-method revision pin (revisionRef REV-) is fetched as a real GET and named in the hop facts', async () => {
    mockChain({ withSeq: true })
    const chain = await walkProvenanceChain(AOUT_REF, ISEN)
    const gcm = chain.hops.find((h) => h.spec.kind === 'gc-method')
    const facts = hopFacts(gcm!)
    const pin = facts.find((f) => f.label === 'revision pin')
    expect(pin, 'the gc-method hop must name its revisionRef pin').toBeDefined()
    expect(pin?.value).toBe(REVPIN)
  })

  it('the engine hop resolves the ACTUAL engine record (real GET of the engineProvenance ref) and renders its own payload', async () => {
    mockChain()
    const chain = await walkProvenanceChain(AOUT_REF)
    const engine = chain.hops.find((h) => h.spec.kind === 'analysis-engine')
    expect(engine?.ref?.id).toBe(ENG)
    expect(engine?.error).toBeNull()
    const facts = hopFacts(engine!)
    const fam = facts.find((f) => f.label === 'engine family')
    expect(fam?.value).toBe('computable-lab-analysis-reference')
    const v = facts.find((f) => f.label === 'declared engine version')
    expect(v?.value).toBe('reference-2026-10')
    const cap = facts.find((f) => f.label === 'capability deconvolution (declared)')
    expect(cap?.value).toBe('approximate')
  })

  it('the sequence-context row is a LOUD error arm when its fetch fails (never a silent unresolved)', async () => {
    mockChain({ withSeq: true, breakIsen: true })
    const chain = await walkProvenanceChain(AOUT_REF, ISEN)
    const isen = chain.hops.find((h) => h.spec.kind === 'instrument-sequence-entry')
    expect(isen?.ref?.id).toBe(ISEN)
    expect(isen?.error).toContain('ISEN-TEST-GC13')
  })

  it('without sequence context the acquisition hops are HONEST absent arms (their source ref is genuinely absent), not failures and not static nulls rendered as errors', async () => {
    mockChain()
    const chain = await walkProvenanceChain(AOUT_REF)
    for (const kind of ['acquisition-package', 'instrument-sequence-entry', 'sample', 'gc-method'] as const) {
      const hop = chain.hops.find((h) => h.spec.kind === kind)
      expect(hop?.ref).toBeNull()
      expect(hop?.error).toBeNull()
      expect(hop?.absent, `${kind} must be the honest absent arm`).toBe(true)
    }
  })

  it('artifact-typed run inputs are NOT dropped: the terminal hash resolves through the artifact input dataReferenceRef (the live ANR-000013 CAL-chain shape)', async () => {
    mockChain({ artifactInputs: true })
    const chain = await walkProvenanceChain(AOUT_REF)
    expect(chainContentHash(chain)).toBe(HASH)
    expect(chain.dataRefId).toBe(DREF)
  })

  it('a run input that is neither data-reference nor artifact is still visible as a run fact (never silently dropped)', async () => {
    mockChain({ oddInput: true })
    const chain = await walkProvenanceChain(AOUT_REF)
    // the odd input (context) is named in the run hop facts — the walker
    // keeps EVERY typed input, not just data references
    const run = chain.hops.find((h) => h.spec.kind === 'analysis-run')
    const facts = hopFacts(run!)
    const extra = facts.find((f) => f.label === 'input ctx1')
    expect(extra?.value).toContain('context')
  })

  it('the effective_parameters artifact is linked from the run facts (D2 hop 5 / gate G4)', async () => {
    mockChain()
    const chain = await walkProvenanceChain(AOUT_REF)
    const run = chain.hops.find((h) => h.spec.kind === 'analysis-run')
    const facts = hopFacts(run!)
    const ep = facts.find((f) => f.label === 'effective parameters')
    expect(ep?.value).toBe(AOUT_EP)
  })

  // ---- FIX3: D2 item 10 — calibration model + standards (defect 2 / G4) ----

  it('the entry artifact renders the calibration-model facts VERBATIM (equation, statistic, fit_points) including the HONEST NULL relative_residual arm', () => {
    const p = {
      kind: 'analysis-output-artifact',
      id: AOUT,
      name: 'calibration_model',
      dataKind: 'model',
      inlineValue: calibrationInlineValue(),
    }
    const facts = entryFacts(p)
    const eq = facts.find((f) => f.label === 'equation')
    expect(eq?.value).toBe('raw_area_pa_min = 2.21 * amount_ng_uL + 1.0')
    const stat = facts.find((f) => f.label === 'statistic (weighted_r_squared)')
    expect(stat?.value).toBe('0.8878')
    // fit point 1: relative_residual IS null — the honest visible arm
    const nullArm = facts.find((f) => f.label === 'fit point 0 (level_1) relative_residual')
    expect(nullArm, 'the null relative_residual must be a visible arm').toBeDefined()
    expect(nullArm?.value).toBe('null (not reported)')
    // fit point 2: a real value, verbatim
    const val = facts.find((f) => f.label === 'fit point 1 (level_2) relative_residual')
    expect(val?.value).toBe('8.4')
  })

  it('a non-calibration entry artifact renders NO calibration facts (the facts come from the payload, never invented)', () => {
    const facts = entryFacts({ kind: 'analysis-output-artifact', id: AOUT, name: 'effective_parameters', dataKind: 'table' })
    expect(facts.find((f) => f.label === 'equation')).toBeUndefined()
  })

  it('the standards block is sourced from the FROZEN run parameters.levels[] (G4)', () => {
    const standards = standardsFacts(frozenLevels() as Record<string, unknown>)
    expect(standards.length).toBeGreaterThanOrEqual(2)
    const first = standards[0]
    expect(first.level).toBe(1)
    expect(first.compoundLabel).toBe('TEST-CMPD-1')
    expect(first.amount).toBe(1)
    expect(standards[1].compoundLabel).toBe('TEST-CMPD-2')
  })

  it('standardsFacts is empty for a run with no frozen levels (no invented rows)', () => {
    expect(standardsFacts({ model: 'linear' } as Record<string, unknown>)).toEqual([])
  })
})

describe('GcProvenancePanel (leg C)', () => {
  it('renders every resolved hop as a /record/:id link and the terminal hash', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-hop-entry')).toBeDefined()
    expect(screen.getByTestId('gc-prov-hop-entry')).toHaveAttribute(
      'href',
      `/record/${AOUT}`,
    )
    expect(await screen.findByTestId('gc-prov-content-hash')).toHaveTextContent(HASH)
    // the run hop links the analysis-run record (kind-labeled, never a bare 'Run')
    expect(screen.getByTestId('gc-prov-hop-analysis-run')).toHaveAttribute(
      'href',
      `/record/${ANR}`,
    )
    // reader version hop fact
    expect(await screen.findByTestId('gc-prov-fact-data-reference-reader-version')).toHaveTextContent(
      'gc-4-registration/1',
    )
  })

  it('renders engine provenance VERBATIM (the ACTUAL engine, not the declared ideal)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-fact-analysis-run-engine-actual-')).toHaveTextContent(
      'ENG-PYCAL01-L1T2305',
    )
    expect(screen.getByTestId('gc-prov-fact-analysis-run-engine-version-actual-')).toHaveTextContent(
      'reference-2026-10',
    )
    expect(screen.getByTestId('gc-prov-fact-analysis-run-interpreter-actual-')).toHaveTextContent(
      '/usr/bin/python3 3.14.7',
    )
  })

  it("'approximate' capability support stays 'approximate' (never surfaced as 'supported')", async () => {
    mockChain()
    renderPanel()
    const decon = await screen.findByTestId('gc-prov-fact-analysis-run-capability-deconvolution')
    expect(decon).toHaveTextContent('approximate')
  })

  it('renders the honest measurement-context gap arm when the hop is absent', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-mctx-gap')).toHaveTextContent(
      'named gap',
    )
    expect(screen.getByTestId('gc-prov-hop-absent-measurement-context')).toHaveTextContent(
      'not linked (named gap)',
    )
  })

  it('a failed hop renders its loud error arm (never a silent skip)', async () => {
    mockChain({ breakDref: true })
    renderPanel()
    expect(await screen.findByTestId('gc-prov-hop-error-data-reference')).toHaveTextContent(
      'DREF-TEST-GC13',
    )
    expect(screen.getByTestId('gc-prov-terminal')).toHaveTextContent(
      'contentHash terminal is unresolved',
    )
  })

  it('a hop whose record FAILED TO LOAD is TEXT, never a /record/:id anchor to a record that does not load (gate2 D3) — resolved hops keep their anchors exactly as today', async () => {
    mockChain({ breakEng: true })
    renderPanel()
    // The loud arm stays: the error names the id + the failure.
    expect(await screen.findByTestId('gc-prov-hop-error-analysis-engine')).toHaveTextContent(ENG)
    // THE D3 PIN: the ref is NOT a navigable anchor to a record that 404s.
    expect(screen.queryByTestId('gc-prov-hop-analysis-engine')).toBeNull()
    expect(document.querySelector(`a[href="/record/${ENG}"]`)).toBeNull()
    // The unresolved id is still VISIBLE as text (loud, never a silent
    // skip) — the id + the error, not a link.
    expect(screen.getByTestId('gc-prov-hop-unresolved-analysis-engine')).toHaveTextContent(ENG)
    // RESOLVED hops keep their anchors exactly as today (the fix is the
    // unresolved arm, never a restyle of what loads): entry + run.
    expect(await screen.findByTestId('gc-prov-hop-entry')).toHaveAttribute('href', `/record/${AOUT}`)
    expect(screen.getByTestId('gc-prov-hop-analysis-run')).toHaveAttribute('href', `/record/${ANR}`)
  })

  it('the revision hop shows the DECLARED engine as declared (pair, not a replacement)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-fact-analysis-revision-engine-declared-')).toHaveTextContent(
      'ENG-PYCAL01-L1T2305',
    )
    expect(screen.getByTestId('gc-prov-fact-analysis-revision-sdk-version')).toHaveTextContent('0.1.0')
  })

  // ---- FIX3: G4 — the context view shows the calibration model + standards ----

  it('the ENTRY artifact renders its calibration-model facts (equation + statistic + fit_points incl. the honest null relative_residual arm)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-fact-entry-equation')).toHaveTextContent(
      'raw_area_pa_min = 2.21 * amount_ng_uL + 1.0',
    )
    expect(screen.getByTestId('gc-prov-fact-entry-statistic-weighted-r-squared')).toHaveTextContent(
      '0.8878',
    )
    // fit point 0 has relative_residual null — the HONEST visible arm
    expect(screen.getByTestId('gc-prov-fact-entry-fit-point-0-level-1-relative-residual')).toHaveTextContent(
      'null (not reported)',
    )
    expect(screen.getByTestId('gc-prov-fact-entry-fit-point-1-level-2-relative-residual')).toHaveTextContent(
      '8.4',
    )
  })

  it('the STANDARDS block renders from the frozen run parameters.levels[] (G4)', async () => {
    mockChain()
    renderPanel()
    const block = await screen.findByTestId('gc-prov-standards')
    expect(block).toHaveTextContent('TEST-CMPD-1')
    expect(block).toHaveTextContent('TEST-CMPD-2')
    expect(block).toHaveTextContent('frozen from the run parameters (levels)')
  })

  it('the acquisition hops render when the sequence context is given (full-chain gate: raw hash -> package -> lineage -> method)', async () => {
    mockChain({ withSeq: true })
    renderPanel(ISEN)
    expect(await screen.findByTestId('gc-prov-hop-instrument-sequence-entry')).toHaveAttribute(
      'href',
      `/record/${ISEN}`,
    )
    expect(await screen.findByTestId('gc-prov-hop-acquisition-package')).toHaveAttribute(
      'href',
      `/record/${ACQP}`,
    )
    expect(await screen.findByTestId('gc-prov-hop-sample')).toHaveAttribute(
      'href',
      `/record/${SMP}`,
    )
    expect(await screen.findByTestId('gc-prov-hop-gc-method')).toHaveAttribute(
      'href',
      `/record/${GCM}`,
    )
    // the terminal hash still resolves through the acquisition end
    expect(await screen.findByTestId('gc-prov-content-hash')).toHaveTextContent(HASH)
  })

  it('without sequence context the acquisition hops render the HONEST absent arm (named, never a fake "unresolved" while data exists elsewhere)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-hop-absent-instrument-sequence-entry')).toHaveTextContent(
      'not linked (named gap)',
    )
    expect(screen.getByTestId('gc-prov-hop-absent-acquisition-package')).toHaveTextContent(
      'not linked (named gap)',
    )
  })

  it('the engine hop links the ACTUAL engine record and shows its declared facts (GC-D3: the record, not just the run provenance)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-hop-analysis-engine')).toHaveAttribute(
      'href',
      `/record/${ENG}`,
    )
    expect(await screen.findByTestId('gc-prov-fact-analysis-engine-engine-family')).toHaveTextContent(
      'computable-lab-analysis-reference',
    )
  })

  // ---- FIX2b (NEW-2 / gate G4): the effective_parameters artifact is a LINK,
  // ---- not just a text fact. hopFacts keeps the fact row (the id, verbatim);
  // ---- the run hop additionally renders the ref as a /record/:id anchor so
  // ---- the artifact (already fetched by the walker) is reachable.

  it('the effective-parameters ref renders as a /record/:id ANCHOR on the run hop, alongside the fact row (G4: a link, not text)', async () => {
    mockChain()
    renderPanel()
    const anchor = await screen.findByTestId('gc-prov-run-effective-params-link')
    expect(anchor).toHaveAttribute('href', `/record/${AOUT_EP}`)
    // the fact row is kept (the value reads verbatim from the hop ref)
    expect(await screen.findByTestId('gc-prov-fact-analysis-run-effective-parameters')).toHaveTextContent(AOUT_EP)
  })

  it('no effective-parameters anchor when the run declares no effective_parameters output artifact (no invented link)', async () => {
    const v = vi.mocked(apiClient.getRecord)
    const base = v.getMockImplementation()!
    v.mockImplementation(async (id: string) => {
      if (id === ANR) {
        const env = await base(id)
        const p = { ...(env as { payload: Record<string, unknown> }).payload }
        delete p['outputArtifactRefs']
        return { ...(env as object), payload: p } as never
      }
      return base(id)
    })
    renderPanel()
    expect(await screen.findByTestId('gc-prov-hop-entry')).toBeDefined()
    expect(screen.queryByTestId('gc-prov-run-effective-params-link')).toBeNull()
    expect(screen.queryByTestId('gc-prov-fact-analysis-run-effective-parameters')).toBeNull()
  })
})
