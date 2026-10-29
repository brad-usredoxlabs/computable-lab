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
import { chainContentHash, walkProvenanceChain } from './gcProvenance'

const AOUT = 'AOUT-TEST-GC13'
const ANR = 'ANR-TEST-GC13'
const ANREV = 'ANREV-TEST-GC13'
const DREF = 'DREF-TEST-GC13'
const HASH = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getRecord: vi.fn(),
  },
}))

function env(id: string, payload: Record<string, unknown>) {
  return { recordId: id, schemaId: `https://computable-lab.com/schema/computable-lab/${id}.schema.yaml`, payload }
}

function mockChain(opts: { withMctx?: boolean; breakDref?: boolean } = {}) {
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
        inputs: { trace: { kind: 'record', id: DREF, type: 'data-reference' } },
        engineProvenance: {
          engineRef: { kind: 'record', id: 'ENG-PYCAL01-L1T2305', type: 'analysis-engine' },
          engineRecordId: 'ENG-PYCAL01-L1T2305',
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
        engineRef: { kind: 'record', id: 'ENG-PYCAL01-L1T2305', type: 'analysis-engine' },
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

function renderPanel() {
  return render(
    <ThemeProvider>
      <OpenTabsProvider>
        <GcProvenancePanel artifactRef={AOUT_REF} />
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

  it('the revision hop shows the DECLARED engine as declared (pair, not a replacement)', async () => {
    mockChain()
    renderPanel()
    expect(await screen.findByTestId('gc-prov-fact-analysis-revision-engine-declared-')).toHaveTextContent(
      'ENG-PYCAL01-L1T2305',
    )
    expect(screen.getByTestId('gc-prov-fact-analysis-revision-sdk-version')).toHaveTextContent('0.1.0')
  })
})
