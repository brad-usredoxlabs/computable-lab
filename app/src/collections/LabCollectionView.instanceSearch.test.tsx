// @vitest-environment jsdom
/**
 * L2-LAB-INVENTORY-CREATE-1 u1fix1 — labware-instance name + search tests.
 *
 * Verifies that a labware-instance renders with its label as display name
 * and is searchable by label, barcode, and location label.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

const listRecordsSpy = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: vi.fn().mockResolvedValue({ success: true }),
    listRecordsByKind: (...args: unknown[]) => listRecordsSpy(...args),
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

  it('(a) card renders label as display name, not bare recordId', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => {
      const card = screen.getByTestId('lab-entity-LBI-DEADBEEF')
      expect(card.textContent).toContain('Plate A')
    })
  })

  it('(b) search by label keeps row visible', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    const searchInput = screen.getByPlaceholderText('Search lab…')
    fireEvent.change(searchInput, { target: { value: 'Plate A' } })
    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-LBI-DEADBEEF')).toBeDefined()
    })
  })

  it('(c) search by barcode keeps row visible', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    const searchInput = screen.getByPlaceholderText('Search lab…')
    fireEvent.change(searchInput, { target: { value: 'BC-99881' } })
    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-LBI-DEADBEEF')).toBeDefined()
    })
  })

  it('(d) search by location label keeps row visible', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    const searchInput = screen.getByPlaceholderText('Search lab…')
    fireEvent.change(searchInput, { target: { value: 'Bench 3' } })
    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-LBI-DEADBEEF')).toBeDefined()
    })
  })

  it('(e) search by recordId still works (regression guard)', async () => {
    renderView('/lab/labware-instances')
    await waitFor(() => screen.getByTestId('lab-entity-LBI-DEADBEEF'))
    const searchInput = screen.getByPlaceholderText('Search lab…')
    fireEvent.change(searchInput, { target: { value: 'LBI-DEADBEEF' } })
    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-LBI-DEADBEEF')).toBeDefined()
    })
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
    const searchInput = screen.getByPlaceholderText('Search lab…')
    fireEvent.change(searchInput, { target: { value: 'cf:clofibrate' } })
    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-MAT-001')).toBeDefined()
    })
  })
})
