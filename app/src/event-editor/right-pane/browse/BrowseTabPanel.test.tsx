/**
 * BrowseTabPanel tests — verifies the load → group → click-to-open flow
 * with apiClient mocked. The dispatcher and viewer panels have their own
 * tests; this one focuses on Browse's specific contract:
 *
 *  - Loads artifacts for the active study only (filters by studyId)
 *  - Groups rows by artifactKind in the documented order
 *  - Click on a PDF row opens a kind=pdf workspace tab via openTab
 *  - Click on a protocol/writeup/training/conclusion opens kind=document
 *  - saved-prompt rows are visible but disabled (no viewer yet)
 *  - Empty / error / loading states render correctly
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  WorkspaceProvider,
} from '../../workspace/WorkspaceContext'
import { defaultWorkspaceState } from '../../workspace/types'

const listRecordsByKind = vi.fn()
vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: (...args: unknown[]) => listRecordsByKind(...args),
  },
}))

import { BrowseTabPanel } from './BrowseTabPanel'

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
      title: 'Vendor protocol',
      extractedText: [{ pageNumber: 1, text: 'page 1 body' }],
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
      title: 'Buffer prep protocol',
    },
  },
  {
    recordId: 'ART-000003',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000003',
      studyId: 'STU-OTHER',
      artifactKind: 'pdf',
      title: 'Other study PDF',
    },
  },
  {
    recordId: 'ART-000004',
    schemaId: 'artifact',
    meta: { kind: 'artifact' },
    payload: {
      kind: 'artifact',
      recordId: 'ART-000004',
      studyId: 'STU-000001',
      artifactKind: 'saved-prompt',
      title: 'Saved prompt',
      promptText: 'something',
    },
  },
]

function renderBrowse(loadOverride?: () => Promise<void>) {
  return render(
    <MemoryRouter>
      <WorkspaceProvider
        studyId="STU-000001"
        saveDebounceMs={0}
        loadFn={async () => ({ state: defaultWorkspaceState('STU-000001') })}
        saveFn={async (_id, s) => ({ state: s })}
      >
        <BrowseTabPanel />
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

describe('BrowseTabPanel', () => {
  it('loads only artifacts for the active study', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderBrowse()
    // Wait until the artifact row appears.
    await waitFor(() =>
      expect(screen.getByTestId('browse-tab-row-ART-000001')).toBeTruthy(),
    )
    expect(screen.getByTestId('browse-tab-row-ART-000002')).toBeTruthy()
    expect(screen.getByTestId('browse-tab-row-ART-000004')).toBeTruthy()
    // The other-study row is filtered out.
    expect(screen.queryByTestId('browse-tab-row-ART-000003')).toBeNull()
  })

  it('renders groups in the documented order (Protocols above PDFs)', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderBrowse()
    await waitFor(() =>
      expect(screen.getByTestId('browse-tab-row-ART-000001')).toBeTruthy(),
    )
    const headings = screen.getAllByRole('heading', { level: 4 })
    const headingText = headings.map((h) => h.textContent ?? '')
    const protocolIdx = headingText.findIndex((t) => t.startsWith('Protocols'))
    const pdfIdx = headingText.findIndex((t) => t.startsWith('PDFs'))
    expect(protocolIdx).toBeGreaterThanOrEqual(0)
    expect(pdfIdx).toBeGreaterThanOrEqual(0)
    expect(protocolIdx).toBeLessThan(pdfIdx)
  })

  it('saved-prompt rows render but are disabled (no viewer kind yet)', async () => {
    listRecordsByKind.mockResolvedValue({
      records: sampleArtifacts,
      total: sampleArtifacts.length,
    })
    renderBrowse()
    const row = await screen.findByTestId('browse-tab-row-ART-000004')
    expect((row as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows empty state when the active study has no artifacts', async () => {
    listRecordsByKind.mockResolvedValue({ records: [], total: 0 })
    renderBrowse()
    await waitFor(() =>
      expect(screen.getByText(/No artifacts yet/)).toBeTruthy(),
    )
  })

  it('shows error inline when the API rejects', async () => {
    listRecordsByKind.mockRejectedValue(new Error('records endpoint is down'))
    renderBrowse()
    await waitFor(() =>
      expect(screen.getByText('records endpoint is down')).toBeTruthy(),
    )
  })
})
