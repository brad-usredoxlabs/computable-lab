/**
 * Tests for LabCollectionView.
 */

import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

// Mock apiClient — the rendered tree needs these methods at mount.
// LabwareInstanceCreateModal (rendered inline) calls createRecord, listRecordsByKind,
// getSchema, getSurfaces; useRecordVisibilities calls getAccessPolicy.
const listRecordsSpy = vi.fn()
vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: vi.fn().mockResolvedValue({ success: true }),
    listRecordsByKind: (...args: unknown[]) => listRecordsSpy(...args),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getAccessPolicy: vi.fn().mockResolvedValue({ visibility: 'private', grants: [] }),
    getSchema: vi.fn().mockResolvedValue({ schema: {} }),
  },
}))

import { LabCollectionView } from './LabCollectionView'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  listRecordsSpy.mockResolvedValue({ records: [] })
})

function renderWithProviders(ui: React.ReactElement) {
  render(
    <MemoryRouter>
      <ThemeProvider>
        <OpenTabsProvider>{ui}</OpenTabsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

describe('LabCollectionView', () => {
  it('renders the collection view', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-collection-view')).toBeDefined()
  })

  it('renders all 7 category buttons', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-category-protocols')).toBeDefined()
    expect(screen.getByTestId('lab-category-materials')).toBeDefined()
    expect(screen.getByTestId('lab-category-labware')).toBeDefined()
    expect(screen.getByTestId('lab-category-equipment')).toBeDefined()
    expect(screen.getByTestId('lab-category-people')).toBeDefined()
    expect(screen.getByTestId('lab-category-documents')).toBeDefined()
    expect(screen.getByTestId('lab-category-vendor-pdfs')).toBeDefined()
  })

  it('INSTR-COLLAPSE-2 C5: the equipment category label is the single "Equipment" — no Instruments category survives the kind deletion', () => {
    renderWithProviders(<LabCollectionView />)
    // QMS8-C D8-i landed the label; this is the C5 regression pin: the retired
    // kind must not survive as a second collection category.
    expect(screen.getByTestId('lab-category-equipment').textContent).toContain('Equipment')
    expect(screen.queryByText('Instruments')).toBeNull()
    expect(screen.queryByText('Instruments & Equipment')).toBeNull()
  })

  it('shows "+ New PDF" on the vendor-pdfs category only, routing to the Ingestion pipeline', () => {
    render(
      <MemoryRouter initialEntries={['/lab/vendor-pdfs']}>
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
          <Route path="/ingestion/vendor-pdf" element={<div data-testid="ingestion-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button is present on the vendor-pdfs tab.
    const btn = screen.getByTestId('lab-category-new-vendor-pdf')
    expect(btn).toBeDefined()
    // Clicking routes to the Ingestion pipeline.
    fireEvent.click(btn)
    expect(screen.getByTestId('ingestion-target')).toBeDefined()
  })

  it('shows "+ New material" on the materials category only, routing to the material creation page', () => {
    render(
      <MemoryRouter initialEntries={['/lab/materials']}>
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
          <Route path="/lab/materials/new" element={<div data-testid="material-new-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button is present on the materials tab.
    const btn = screen.getByTestId('lab-category-new-material')
    expect(btn).toBeDefined()
    // Clicking routes to the material creation page.
    fireEvent.click(btn)
    expect(screen.getByTestId('material-new-target')).toBeDefined()
  })

  it('does NOT show "+ New material" on non-materials categories', () => {
    render(
      <MemoryRouter initialEntries={['/lab/labware']}>
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
          <Route path="/lab/materials/new" element={<div data-testid="material-new-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button must be absent on the labware category.
    expect(screen.queryByTestId('lab-category-new-material')).toBeNull()
  })

  // ── u6lots — material-instances category ──────────────────────────────

  it('renders the material-instances category button', () => {
    renderWithProviders(<LabCollectionView />)
    expect(screen.getByTestId('lab-category-material-instances')).toBeDefined()
  })

  it('renders a material-instance card with lot number, vendor, vendor_product_ref, and storage location', async () => {
    listRecordsSpy.mockResolvedValue({
      records: [
        {
          recordId: 'MIN-FAKE-001',
          schemaId: 'material-instance',
          payload: {
            kind: 'material-instance',
            name: 'Test Reagent',
            lot: { lot_number: 'LOT-FAKE123', vendor: 'FakeVendor' },
            vendor_product_ref: { id: 'VP-FAKE-001' },
            storage: { location: 'Shelf A-3' },
          },
        },
      ],
    })

    render(
      <MemoryRouter initialEntries={['/lab/material-instances']}>
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

    await waitFor(() => {
      expect(screen.queryByTestId('lab-entity-MIN-FAKE-001')).not.toBeNull()
    })

    const card = screen.getByTestId('lab-entity-MIN-FAKE-001')
    expect(card.textContent).toContain('LOT-FAKE123')
    expect(card.textContent).toContain('FakeVendor')
    expect(card.textContent).toContain('VP-FAKE-001')
    expect(card.textContent).toContain('Shelf A-3')
  })

  it('shows "+ New labware" on the labware category only, routing to the labware creation page', () => {
    render(
      <MemoryRouter initialEntries={['/lab/labware']}>
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
          <Route path="/lab/labware/new" element={<div data-testid="labware-new-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button is present on the labware tab.
    const btn = screen.getByTestId('lab-category-new-labware')
    expect(btn).toBeDefined()
    // Clicking routes to the labware creation page.
    fireEvent.click(btn)
    expect(screen.getByTestId('labware-new-target')).toBeDefined()
  })

  it('does NOT show "+ New labware" on non-labware categories', () => {
    render(
      <MemoryRouter initialEntries={['/lab/materials']}>
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
          <Route path="/lab/labware/new" element={<div data-testid="labware-new-target" />} />
        </Routes>
      </MemoryRouter>,
    )
    // Button must be absent on the materials category.
    expect(screen.queryByTestId('lab-category-new-labware')).toBeNull()
  })

  // ── u6recvdoor — "Receive a lot" door on the materials category ────────

  const renderCategory = (category: string) =>
    render(
      <MemoryRouter initialEntries={[`/lab/${category}`]}>
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

  it('mounts "+ Receive a lot" beside "+ New material" and opens the receiving door', () => {
    renderCategory('materials')
    expect(screen.getByTestId('lab-category-new-material')).toBeDefined()
    fireEvent.click(screen.getByTestId('lab-category-receive-lot'))
    expect(screen.getByRole('dialog', { name: 'Receive a lot' })).toBeDefined()
    expect(screen.getByTestId('material-receiving-vendor')).toBeDefined()
  })

  it('does NOT show "+ Receive a lot" on non-materials categories (existing doors untouched)', () => {
    renderCategory('labware')
    expect(screen.queryByTestId('lab-category-receive-lot')).toBeNull()
    expect(screen.getByTestId('lab-category-new-labware')).toBeDefined()
  })

  // ── L2-SEED-LABLOCAL-1 — instance picker kind pin ─────────────────────
  // The "New instance" modal's Definition select is fed by the view's own
  // listRecordsByKind fetch; the grid fetch (labware-instance) is separate,
  // so the pin asserts the ARGUMENT, not the call count.

  it('opens the instance modal and requests labware-definition records for the Definition picker', async () => {
    renderCategory('labware-instances')
    fireEvent.click(screen.getByTestId('lab-category-new-labware-instance'))
    await waitFor(() => {
      expect(listRecordsSpy).toHaveBeenCalledWith('labware-definition', 200)
    })
  })
})
