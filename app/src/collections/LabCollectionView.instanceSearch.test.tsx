// @vitest-environment jsdom
/**
 * L2-LAB-INVENTORY-CREATE-1 u1fix1esc — labware-instance name + search tests.
 *
 * Verifies that a labware-instance renders with its label as display name
 * and is searchable by label, barcode, and location label.
 *
 * Every presence assertion is paired with a negative control (a query that
 * matches nothing must drop the row): a bare `queryBy*` presence check passes
 * when the element is absent, so presence alone cannot prove the filter works.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

const listRecordsSpy = vi.fn()

// Wholesale module replacement — every client method the rendered tree calls at
// mount must exist here, otherwise the tree dies before an assertion runs
// (SurfaceIndicator calls getSurfaces; useRecordVisibilities calls getAccessPolicy).
vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: vi.fn().mockResolvedValue({ success: true }),
    listRecordsByKind: (...args: unknown[]) => listRecordsSpy(...args),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getAccessPolicy: vi.fn().mockResolvedValue({ visibility: 'private', grants: [] }),
    getSchema: vi.fn().mockResolvedValue({ schema: { properties: { location: { properties: { kind: { enum: ['cryobox', 'shelf', 'box'] } } } } } }),
  },
}))

import { LabCollectionView } from './LabCollectionView'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderView(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/lab/:category"
          element={
            <ThemeProvider>
              <OpenTabsProvider>
                <LabCollectionView />
              </OpenTabsProvider>
            </ThemeProvider>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

/** Type `query`; the row must be PRESENT. Then type a no-match string: it must be GONE. */
async function expectSearchKeepsRow(query: string, testId: string) {
  const input = screen.getByPlaceholderText('Search lab…')
  fireEvent.change(input, { target: { value: query } })
  await waitFor(() => expect(screen.queryByTestId(testId)).not.toBeNull())
  fireEvent.change(input, { target: { value: 'zzz-no-such-record' } })
  await waitFor(() => expect(screen.queryByTestId(testId)).toBeNull())
  fireEvent.change(input, { target: { value: '' } })
}

describe('LabCollectionView — labware-instance name and search', () => {
  beforeEach(() => {
    // One labware-instance record shaped like real API output
    const mockRecords = {
      records: [
        {
          recordId: 'LBI-DEADBEEF',
          schemaId: 'labware-instance',
          payload: {
            kind: 'labware-instance',
            recordId: 'LBI-DEADBEEF',
            labwareId: 'LW-TROUGH-S',
            label: 'Plate A',
            barcode: 'BC-99881',
            location: { kind: 'bench', label: 'Bench 3' },
          },
        },
      ],
    }
    listRecordsSpy.mockResolvedValue(mockRecords)
  })

  it('(a) card TITLE is the label, not the bare recordId', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    const card = screen.getByTestId('lab-entity-LBI-DEADBEEF')
    expect(card.querySelector('.lab-entity-card__title')?.textContent).toBe('Plate A')
  })

  it('(b) search by label keeps row visible, no-match drops it', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    await expectSearchKeepsRow('Plate A', 'lab-entity-LBI-DEADBEEF')
  })

  it('(c) search by barcode keeps row visible, no-match drops it', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    await expectSearchKeepsRow('BC-99881', 'lab-entity-LBI-DEADBEEF')
  })

  it('(d) search by location label keeps row visible, no-match drops it', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    await expectSearchKeepsRow('Bench 3', 'lab-entity-LBI-DEADBEEF')
  })

  it('(e) search by recordId still works (regression guard)', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    await expectSearchKeepsRow('LBI-DEADBEEF', 'lab-entity-LBI-DEADBEEF')
  })

  it('material search by CURIE still works (monotonicity guard)', async () => {
    // A material record with class id — must still match CF:clofibrate
    const mockMaterial = {
      records: [
        {
          recordId: 'MAT-001',
          schemaId: 'material',
          payload: {
            kind: 'material',
            name: 'Clofibrate',
            class: [{ id: 'CF:clofibrate' }],
            definition: 'A fibrate drug',
          },
        },
      ],
    }
    listRecordsSpy.mockResolvedValue(mockMaterial)
    renderView('/lab/materials')
    await waitFor(() => screen.getByTestId('lab-entity-MAT-001'))
    await expectSearchKeepsRow('cf:clofibrate', 'lab-entity-MAT-001')
  })
})
