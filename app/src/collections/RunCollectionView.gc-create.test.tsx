/**
 * GC-12 (deliverable C / D2) — RunCollectionView: the CREATE front door.
 *
 * "New GC run sheet" (V7(a) "open /runs → New GC run sheet → sheet appears"):
 * a purely ADDITIVE one-action on the /runs collection (the DNA "+ New Run"
 * stays untouched). The form is user-triggered (opened by the user — the
 * collection's mount fetches stay untouched), lists the lane's gc-methods +
 * equipment (data-driven), mints the FULL minimal chain in order
 * (party → request → sample → run → entry → sequence, header LAST — the
 * GC-4 create-last discipline; bait #12: build the chain, never assume
 * lane seed), and lands on /runs/<minted runId> where the GC section then
 * shows the new sheet.
 *
 * Pinned here (the committed RunCollectionView.test.tsx is UNMODIFIED — DNA
 * rule (a)): the create door's lazy fetch, the named not-ready arm (no
 * gc-methods → a stated reason + the real /registry door, never a dead
 * disabled form), the mint order, and the landing navigation (a location
 * probe inside the MemoryRouter — the navigate is the REAL useNavigate).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'
import { apiClient } from '../shared/api/client'
import { RunCollectionView } from './RunCollectionView'

function NavProbe() {
  const loc = useLocation()
  return <span data-testid="nav-probe">{loc.pathname}</span>
}

function renderView() {
  return render(
    <MemoryRouter initialEntries={['/runs']}>
      <ThemeProvider>
        <OpenTabsProvider>
          <NavProbe />
          <RunCollectionView />
        </OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  vi.mocked(apiClient.listRuns).mockResolvedValue({ runs: [], total: 0 })
  vi.mocked(apiClient.listRecordsByKind).mockImplementation(async (kind: string) => {
    if (kind === 'gc-method') {
      return {
        records: [
          { recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } },
        ] as unknown as never,
        total: 1,
      }
    }
    if (kind === 'equipment') {
      return {
        records: [{ recordId: 'EQP-AUTOCLAVE', payload: { name: 'Autoclave' } }],
        total: 1,
      } as unknown as never
    }
    return { records: [], total: 0 }
  })
  vi.mocked(apiClient.createRecord).mockResolvedValue({ recordId: 'X', success: true } as never)
})

vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...actual.apiClient,
      listRuns: vi.fn().mockResolvedValue({ runs: [], total: 0 }),
      listRecordsByKind: vi.fn(),
      createRecord: vi.fn().mockResolvedValue({ recordId: 'X', success: true }),
      updateRecord: vi.fn(),
      getRecord: vi.fn(),
    },
  }
})

describe('RunCollectionView — GC-12 D2 create front door', () => {
  it('the create door is ADDITIVE (the DNA "+ New Run" is untouched) and opens a lazy form', async () => {
    renderView()
    expect(screen.getByTestId('run-collection-new')).toHaveTextContent('+ New Run')
    expect(screen.getByTestId('gc-run-collection-new')).toHaveTextContent('+ New GC run sheet')
    // The form is CLOSED on mount — no gc-method / equipment fetch yet.
    expect(screen.queryByTestId('gc-run-create-form')).toBeNull()
    expect(apiClient.listRecordsByKind).not.toHaveBeenCalled()
    // Opening is user-triggered: the data-driven lists fetch THEN.
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    expect(apiClient.listRecordsByKind).toHaveBeenCalledWith('gc-method', 500)
    expect(apiClient.listRecordsByKind).toHaveBeenCalledWith('equipment', 500)
    // The method select lists the lane's gc-method by its data-driven label.
    expect((screen.getByTestId('gc-run-create-method') as HTMLSelectElement).textContent).toContain(
      'AOAC FAME GC-FID method (demo)',
    )
  })

  it('a missing field renders a NAMED reason (never a silent no-op, never a dead button)', async () => {
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    // Title missing (the method select has NO fallback — DIRFIX-3 minor 2:
    // an unselected method is part of the named reason, never an unasked-for
    // pick — so this note covers both the title and the method).
    fireEvent.change(screen.getByTestId('gc-run-create-vial'), { target: { value: '101' } })
    fireEvent.change(screen.getByTestId('gc-run-create-sample'), { target: { value: 'RES35077-4' } })
    fireEvent.click(screen.getByTestId('gc-run-create-submit'))
    expect(await screen.findByTestId('gc-run-create-note')).toHaveTextContent(/sheet title/)
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })

  it('no gc-methods configured → a NAMED reason + the real /registry door (never a dead disabled form)', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockResolvedValue({ records: [], total: 0 })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    expect(await screen.findByTestId('gc-run-create-method-notready')).toHaveTextContent(/No gc-methods/)
    expect(screen.getByTestId('gc-run-create-method-author').getAttribute('href')).toBe('/registry')
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
  })

  it('mints the full chain IN ORDER (header LAST) and lands on /runs/<minted runId>', async () => {
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    fireEvent.change(screen.getByTestId('gc-run-create-title'), { target: { value: 'FAME batch 10/28' } })
    fireEvent.change(screen.getByTestId('gc-run-create-method'), { target: { value: 'GCM-DEMO-AOAC-FAME' } })
    fireEvent.change(screen.getByTestId('gc-run-create-vial'), { target: { value: '101' } })
    fireEvent.change(screen.getByTestId('gc-run-create-sample'), { target: { value: 'RES35077-4' } })
    fireEvent.change(screen.getByTestId('gc-run-create-instrument'), { target: { value: 'EQP-AUTOCLAVE' } })
    fireEvent.click(screen.getByTestId('gc-run-create-submit'))

    await waitFor(() => expect(apiClient.createRecord).toHaveBeenCalledTimes(6))
    // The mint order: party → request → sample → run → entry → sequence
    // (the header is LAST — a partial failure never leaves a dangling header).
    const schemaTails = vi
      .mocked(apiClient.createRecord)
      .mock.calls.map((c) => c[0].split('/').pop()!)
    expect(schemaTails).toEqual([
      'party.schema.yaml',
      'request.schema.yaml',
      'sample.schema.yaml',
      'run.schema.yaml',
      'instrument-sequence-entry.schema.yaml',
      'instrument-sequence.schema.yaml',
    ])
    // The entry wires the chosen method (refs wired at build time).
    const entryCall = vi.mocked(apiClient.createRecord).mock.calls[4] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(entryCall[1].gcMethodRef).toEqual({ kind: 'record', id: 'GCM-DEMO-AOAC-FAME', type: 'gc-method' })
    // The header carries the instrumentRef (the optional data-driven pick).
    const seqCall = vi.mocked(apiClient.createRecord).mock.calls[5] as unknown as [
      string,
      Record<string, unknown>,
    ]
    expect(seqCall[1].instrumentRef).toEqual({ kind: 'record', id: 'EQP-AUTOCLAVE', type: 'equipment' })
    // The landing: /runs/<the minted run id> (GC-D1: the section hangs off
    // the RUN record, never the sequence id).
    const runStep = vi.mocked(apiClient.createRecord).mock.calls[3] as unknown as [
      string,
      Record<string, unknown>,
    ]
    await waitFor(() => {
      expect(screen.getByTestId('nav-probe').textContent).toBe(`/runs/${runStep[1].recordId}`)
    })
    expect(screen.getByTestId('nav-probe').textContent!.startsWith('/runs/RUN-')).toBe(true)
  })

  it('GC-12 fix-cycle-3 (minor 2): while the gc-method fetch is IN FLIGHT the method row shows a LOADING arm — never "No gc-methods are configured"', async () => {
    // The regate2 defect shape: the user opened the form quickly and the
    // row claimed "No gc-methods are configured" while a method existed and
    // the fetch was mid-flight. The in-flight state is its own arm.
    let resolveMethods!: (v: unknown) => void
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') {
        return new Promise((res) => {
          resolveMethods = res
        }) as never
      }
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    // Fetch in flight: the LOADING arm — NOT the false-empty notready, NOT
    // the select (the user cannot pick from a list that has not loaded).
    expect(screen.getByTestId('gc-run-create-method-loading')).toHaveTextContent(/Loading gc-methods/i)
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
    // The fetch settles → the data-driven select lists the real method.
    resolveMethods({
      records: [
        { recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } },
      ],
      total: 1,
    })
    await screen.findByTestId('gc-run-create-method')
    expect(screen.queryByTestId('gc-run-create-method-loading')).toBeNull()
    expect((screen.getByTestId('gc-run-create-method') as HTMLSelectElement).textContent).toContain(
      'AOAC FAME GC-FID method (demo)',
    )
  })

  it('GC-12 fix-cycle-3 (minor 2): NO silent first-method fallback — an unselected method is a NAMED reason, never an unasked-for pick', async () => {
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    // Title / vial / sample label all filled — the ONLY missing field is
    // the method, which the user has NOT selected (the select lists the
    // lane's method; its value is the empty placeholder).
    fireEvent.change(screen.getByTestId('gc-run-create-title'), { target: { value: 'FAME batch 10/29' } })
    fireEvent.change(screen.getByTestId('gc-run-create-vial'), { target: { value: '101' } })
    fireEvent.change(screen.getByTestId('gc-run-create-sample'), { target: { value: 'RES35077-9' } })
    fireEvent.click(screen.getByTestId('gc-run-create-submit'))
    // The old `gcMethods[0]?.recordId` fallback silently minted the sheet
    // with GCM-DEMO-AOAC-FAME — a method the user never chose. Now: a NAMED
    // reason on the note line, and ZERO mint.
    expect(await screen.findByTestId('gc-run-create-note')).toHaveTextContent(/select a gc-method/i)
    expect(apiClient.createRecord).not.toHaveBeenCalled()
  })

  it('GC-12 fix-cycle-3 (minor 6): a Create click while a create is IN FLIGHT is VISIBLE (a named note), never a silent no-op', async () => {
    // The first create never resolves (the browser-gate >12 s write shape).
    vi.mocked(apiClient.createRecord).mockReturnValue(new Promise(() => {}) as never)
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    await screen.findByTestId('gc-run-create-form')
    fireEvent.change(screen.getByTestId('gc-run-create-title'), { target: { value: 'FAME batch 10/29' } })
    fireEvent.change(screen.getByTestId('gc-run-create-method'), { target: { value: 'GCM-DEMO-AOAC-FAME' } })
    fireEvent.change(screen.getByTestId('gc-run-create-vial'), { target: { value: '101' } })
    fireEvent.change(screen.getByTestId('gc-run-create-sample'), { target: { value: 'RES35077-9' } })
    fireEvent.click(screen.getByTestId('gc-run-create-submit')) // first create starts (in flight)
    await waitFor(() => expect(apiClient.createRecord).toHaveBeenCalledTimes(1))
    // The follow-up click: the old `if (gcBusy) return` swallowed it
    // silently. Now it renders a NAMED note on the ignored click.
    fireEvent.click(screen.getByTestId('gc-run-create-submit'))
    expect(await screen.findByTestId('gc-run-create-note')).toHaveTextContent(/already in progress/i)
    // AND no second create was started.
    expect(apiClient.createRecord).toHaveBeenCalledTimes(1)
  })

  it('GC-12 dirfix MINOR-FIX (defect 1): a REJECTED gc-method fetch settles a NAMED FAILURE arm — never "No gc-methods are configured", never an endless load', async () => {
    // The regate2 defect 2 class moved from the in-flight window to the
    // failure window: a REJECTED /api/gc-methods read used to settle as
    // "loaded + empty list" and render the empty-state lie. The settled
    // FAILURE arm is its own arm: it names the real cause and offers a
    // Retry (a live affordance — dead-chrome ban), never the not-ready lie.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') return Promise.reject(new Error('network down')) as never
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    // The settled FAILURE arm names the real cause (the fetch was rejected)…
    expect(await screen.findByTestId('gc-run-create-method-error')).toHaveTextContent('network down')
    // …and the empty-state LIE never renders on a failed read…
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
    // …and the load arm does not spin after the read settled (the form is
    // not stuck "Loading…").
    expect(screen.queryByTestId('gc-run-create-method-loading')).toBeNull()
    // …and the select does not render from a failed read.
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
    // The failure arm is a LIVE affordance: a Retry that re-runs the
    // registry read settles the data-driven select (and clears the arm).
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') {
        return Promise.resolve({
          records: [
            { recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } },
          ],
          total: 1,
        } as never)
      }
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    fireEvent.click(screen.getByTestId('gc-run-create-method-retry'))
    expect(await screen.findByTestId('gc-run-create-method')).toHaveTextContent('AOAC FAME GC-FID method (demo)')
    expect(screen.queryByTestId('gc-run-create-method-error')).toBeNull()
  })

  it('GC-12 DIRFIX-M3-2 (adv cycle-2 defect 2, probe A_ROW_TEXT): an EMPTY-MESSAGE rejection still settles the FAILURE arm — never the "No gc-methods are configured" lie', async () => {
    // The arm was keyed on the TRUTHINESS of the message string: a rejection
    // whose message is the empty string stored '' (falsy) and the render
    // fell through to the EMPTY arm — "No gc-methods are configured" — on a
    // FAILED read. The failure arm must be keyed on the failure STATE, so
    // ANY rejection (empty message included) renders the failure arm with
    // an honest generic cause.
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') return Promise.reject(new Error('')) as never
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    // The settled FAILURE arm renders (keyed on the failure STATE, not the
    // message text)…
    const arm = await screen.findByTestId('gc-run-create-method-error')
    // …the empty-state LIE never renders on a failed read…
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
    expect(screen.queryByText(/No gc-methods are configured/)).toBeNull()
    // …the load arm does not spin after the read settled…
    expect(screen.queryByTestId('gc-run-create-method-loading')).toBeNull()
    // …the select does not render from a failed read…
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
    // …and the arm carries an HONEST generic cause line (the empty message
    // is not a cause — the generic wording names the failure without
    // pretending a message).
    expect(arm.textContent).toMatch(/no cause was provided/i)
  })

  it('GC-12 DIRFIX-M3-3 (adv cycle-2 defect 3, probe B_ARM_TEXT): an EQUIPMENT-only failure NAMES equipment (never "Could not load gc-methods") and the method select STAYS usable', async () => {
    // Promise.all collapsed the two registry reads into ONE attribution:
    // when the gc-method read SUCCEEDED and only the equipment read
    // rejected, the arm said "Could not load gc-methods: equipment registry
    // down" — a wrong-cause statement that hid the perfectly good method
    // list behind a failure surface. Per-read settlement: the equipment
    // failure NAMES the equipment registry and does not block the method
    // select (which renders from the read that worked).
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') {
        return Promise.resolve({
          records: [{ recordId: 'GCM-DEMO-AOAC-FAME', payload: { name: 'AOAC FAME GC-FID method (demo)' } }],
          total: 1,
        } as never)
      }
      if (kind === 'equipment') return Promise.reject(new Error('equipment registry down')) as never
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    // The failure arm NAMES the failing registry (equipment)…
    const arm = await screen.findByTestId('gc-run-create-method-error')
    expect(arm.textContent).toContain('equipment')
    expect(arm.textContent).toContain('equipment registry down')
    // …and is NEVER a gc-methods misattribution (the probe B_ARM_TEXT
    // assertion: the arm must not report the failure as "Could not load
    // gc-methods").
    expect(arm.textContent).not.toContain('Could not load gc-methods')
    expect(arm.textContent).not.toContain('gc-methods read')
    // The method read WORKED — the data-driven method select renders from
    // it (no usability loss on a read that worked)…
    expect((screen.getByTestId('gc-run-create-method') as HTMLSelectElement).textContent).toContain(
      'AOAC FAME GC-FID method (demo)',
    )
    // …and the empty-state lie does not render.
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
  })

  it('GC-12 DIRFIX-M3-3 (adv cycle-2 defect 3): a GC-METHODS-only failure names gc-methods (per-read attribution)', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') return Promise.reject(new Error('network down')) as never
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    const arm = await screen.findByTestId('gc-run-create-method-error')
    expect(arm.textContent).toContain('gc-methods read')
    expect(arm.textContent).toContain('network down')
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
  })

  it('GC-12 DIRFIX-M3-3 (adv cycle-2 defect 3): BOTH registries failing names BOTH', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockImplementation((kind: string) => {
      if (kind === 'gc-method') return Promise.reject(new Error('methods down')) as never
      if (kind === 'equipment') return Promise.reject(new Error('equipment down')) as never
      return Promise.resolve({ records: [], total: 0 } as never)
    })
    renderView()
    fireEvent.click(screen.getByTestId('gc-run-collection-new'))
    const arm = await screen.findByTestId('gc-run-create-method-error')
    expect(arm.textContent).toContain('gc-methods read')
    expect(arm.textContent).toContain('equipment read')
    expect(arm.textContent).toContain('methods down')
    expect(arm.textContent).toContain('equipment down')
    expect(screen.queryByTestId('gc-run-create-method')).toBeNull()
    expect(screen.queryByTestId('gc-run-create-method-notready')).toBeNull()
  })
})
