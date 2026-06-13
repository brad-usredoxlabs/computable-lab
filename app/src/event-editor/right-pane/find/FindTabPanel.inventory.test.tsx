/**
 * FindTabPanel inventory tests — the project's labware / aliquots / materials
 * and protocols (all study-scoped), each row opening the record in an
 * in-workspace TapTab tab (kind: 'record-edit').
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

const listRecordsByKind = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
  },
}))

vi.mock('../../../shared/api/treeClient', () => ({
  getStudyTree: () =>
    Promise.resolve({
      studies: [
        { recordId: 'STU-000001', title: 'S', path: 'p', experiments: [] },
      ],
    }),
  getRunMethod: () => Promise.resolve({ hasMethod: false }),
}))

import { FindTabPanel } from './FindTabPanel'

function env(recordId: string, kind: string, name: string) {
  return { recordId, schemaId: kind, meta: { kind }, payload: { kind, name } }
}

// Surfaces the open workspace tabs so a test can assert a record-edit tab opened.
function TabsProbe() {
  const ws = useWorkspace()
  return <div data-testid="tabs">{ws.state.tabs.map((t) => `${t.kind}:${t.id}`).join(' ')}</div>
}

function renderFind() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <FindTabPanel />
        <TabsProbe />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listRecordsByKind.mockReset()
  listRecordsByKind.mockImplementation((kind: string, _l: number, _o: number, links?: { studyId?: string }) => {
    // Study-scoped inventory only resolves when a studyId filter is passed.
    if (kind === 'labware' && links?.studyId) return Promise.resolve({ records: [env('LBW-1', 'labware', 'Tube rack')], total: 1 })
    if (kind === 'aliquot' && links?.studyId) return Promise.resolve({ records: [env('ALQ-1', 'aliquot', 'Standards box')], total: 1 })
    // Protocols are project-scoped too (filed to the study via studyId).
    if (kind === 'protocol' && links?.studyId) return Promise.resolve({ records: [env('PROT-1', 'protocol', 'Universal wash')], total: 1 })
    if (kind === 'local-protocol' && links?.studyId) return Promise.resolve({ records: [env('LP-1', 'local-protocol', 'Lab wash')], total: 1 })
    return Promise.resolve({ records: [], total: 0 })
  })
})

afterEach(() => cleanup())

describe('FindTabPanel — project inventory & protocol libraries', () => {
  it('renders labware/aliquot/material and protocol sections, all project-scoped', async () => {
    renderFind()
    expect(await screen.findByTestId('find-tab-inv-LBW-1')).toBeTruthy()
    expect(screen.getByTestId('find-tab-inv-ALQ-1')).toBeTruthy()
    expect(screen.getByTestId('find-tab-inv-PROT-1')).toBeTruthy()
    expect(screen.getByTestId('find-tab-inv-LP-1')).toBeTruthy()
    // Every section is fetched with the studyId filter (project-scoped).
    expect(listRecordsByKind).toHaveBeenCalledWith('labware', expect.any(Number), expect.any(Number), { studyId: 'STU-000001' })
    expect(listRecordsByKind).toHaveBeenCalledWith('protocol', expect.any(Number), expect.any(Number), { studyId: 'STU-000001' })
    expect(listRecordsByKind).toHaveBeenCalledWith('local-protocol', expect.any(Number), expect.any(Number), { studyId: 'STU-000001' })
  })

  it('clicking a row opens an in-workspace record-edit tab (no navigation)', async () => {
    renderFind()
    const row = await screen.findByTestId('find-tab-inv-LBW-1')
    fireEvent.click(row)
    // A record-edit tab keyed on the record id is opened in the same workspace.
    expect(screen.getByTestId('tabs').textContent).toContain('record-edit:record:LBW-1')
  })
})
