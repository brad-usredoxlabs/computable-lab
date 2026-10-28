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
    // Title missing (the method select auto-falls back to the lane's first
    // method — the NAMED reason is for the title, not a silent no-op).
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
})
