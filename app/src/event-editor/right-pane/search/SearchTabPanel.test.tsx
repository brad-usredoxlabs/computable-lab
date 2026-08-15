/**
 * SearchTabPanel tests — verifies the substring filter and click-to-open.
 *  - hint shown when query is empty
 *  - title hits show with hitIn=title
 *  - id hits show with hitIn=id
 *  - non-matching query returns the no-matches hint
 *  - error from listRecordsByKind surfaces inline
 *
 * Body-search is lazy and time-dependent; it's covered manually in the
 * component but excluded from this unit test to keep it deterministic.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import {
  WorkspaceProvider,
} from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

const listRecordsByKind = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
    // getRecord is invoked by body-search; return a benign empty body so
    // the lazy fetch doesn't crash if it fires.
    getRecord: vi.fn(async (id: string) => ({
      recordId: id,
      schemaId: 'artifact',
      meta: { kind: 'artifact' },
      payload: {
        kind: 'artifact',
        recordId: id,
        studyId: 'STU-000001',
        artifactKind: 'protocol',
        title: id,
        body: { type: 'doc', content: [] },
      },
    })),
  },
}))

import { SearchTabPanel } from './SearchTabPanel'

const sampleArtifacts = [
  {
    recordId: 'ART-000001',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000001',
      studyId: 'STU-000001',
      artifactKind: 'pdf',
      title: 'Hepatocyte vendor protocol',
    },
  },
  {
    recordId: 'ART-000002',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000002',
      studyId: 'STU-000001',
      artifactKind: 'protocol',
      title: 'Buffer prep recipe',
    },
  },
]

function renderSearch() {
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <SearchTabPanel />
      </WorkspaceProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  listRecordsByKind.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('SearchTabPanel', () => {
  it('renders the hint when the query is empty', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderSearch()
    await waitFor(() =>
      expect(
        screen.getByText(/Search across artifact titles/),
      ).toBeTruthy(),
    )
  })

  it('matches by title substring (case-insensitive)', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderSearch()
    // Wait until loading completes (the hint requires `loading=false`).
    await waitFor(() =>
      expect(
        screen.getByText(/Search across artifact titles/),
      ).toBeTruthy(),
    )
    const input = screen.getByTestId('search-tab-input')
    fireEvent.change(input, { target: { value: 'buffer' } })
    await waitFor(() =>
      expect(screen.getByTestId('search-tab-row-ART-000002')).toBeTruthy(),
    )
    expect(screen.queryByTestId('search-tab-row-ART-000001')).toBeNull()
  })

  it('matches by recordId substring', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderSearch()
    await waitFor(() =>
      expect(
        screen.getByText(/Search across artifact titles/),
      ).toBeTruthy(),
    )
    const input = screen.getByTestId('search-tab-input')
    fireEvent.change(input, { target: { value: 'ART-000001' } })
    await waitFor(() =>
      expect(screen.getByTestId('search-tab-row-ART-000001')).toBeTruthy(),
    )
  })

  it('shows the no-matches hint when nothing matches yet', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderSearch()
    await waitFor(() =>
      expect(
        screen.getByText(/Search across artifact titles/),
      ).toBeTruthy(),
    )
    const input = screen.getByTestId('search-tab-input')
    fireEvent.change(input, { target: { value: 'zzzz-not-in-anything' } })
    await waitFor(() =>
      expect(screen.getByText(/No matches yet/)).toBeTruthy(),
    )
  })

  it('surfaces list errors inline', async () => {
    listRecordsByKind.mockRejectedValue(new Error('records endpoint is down'))
    renderSearch()
    await waitFor(() =>
      expect(screen.getByText('records endpoint is down')).toBeTruthy(),
    )
  })

  it('renders a CTA that routes to the Ingestion pipeline', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    render(
      <MemoryRouter initialEntries={['/project/STU-000001']}>
        <Routes>
          <Route
            path="/project/:studyId"
            element={
              <WorkspaceProvider
                studyId="STU-000001"
                saveDebounceMs={0}
                loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
                saveFn={async (_id, s) => ({ state: s })}
              >
                <SearchTabPanel />
              </WorkspaceProvider>
            }
          />
          <Route path="/ingestion/vendor-pdf" element={<div data-testid="ingestion-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(screen.getByTestId('search-tab-vendor-pdf-cta')).toBeTruthy(),
    )
    fireEvent.click(screen.getByTestId('search-tab-vendor-pdf-cta'))
    expect(screen.getByTestId('ingestion-target')).toBeDefined()
  })
})
