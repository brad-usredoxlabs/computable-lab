// @vitest-environment jsdom
/**
 * L2-LAB-MATERIAL-CREATE-1 u3 — /lab/materials/new is a working create surface:
 * ontology search (namespace + label shown), pick a term → the EXISTING
 * VendorProductBuilderModal hosts the authoring step, and its onSave navigates
 * back to /lab/materials.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'

const resolve = vi.fn()

vi.mock('../shared/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../shared/api/client')>()
  return {
    ...actual,
    apiClient: {
      ...(actual as Record<string, unknown>).apiClient as object,
      resolve: (...args: unknown[]) => resolve(...args),
      searchMaterials: vi.fn().mockResolvedValue({ items: [] }),
      getFormulationsSummary: vi.fn().mockResolvedValue([]),
    },
  }
})

// The Exa layer must not probe the network in this unit's tests.
vi.mock('../shared/lib/integrationFlags', () => ({
  exaVendorEnabled: () => Promise.resolve(false),
  noteExaUnavailable: () => undefined,
}))

// Stub the builder: this test owns the STITCHING contract (mount on pick +
// navigate on onSave), not the modal's internals (which are read-only imports).
vi.mock('../editor/material/VendorProductBuilderModal', () => ({
  VendorProductBuilderModal: ({ isOpen, ontologyRef, onClose, onSave }: any) =>
    isOpen ? (
      <div data-testid="vendor-builder-stub">
        <span data-testid="vendor-builder-ref">{`${ontologyRef?.namespace}:${ontologyRef?.id}`}</span>
        <button type="button" data-testid="vendor-builder-close" onClick={onClose}>stub close</button>
        <button
          type="button"
          data-testid="vendor-builder-save"
          onClick={() => onSave({ kind: 'record', id: 'VP-TEST-1', type: 'vendor-product', label: ontologyRef?.label ?? '' })}
        >
          stub save
        </button>
      </div>
    ) : null,
}))

import { LabMaterialNewPage } from './LabMaterialNewPage'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/lab/materials/new']}>
      <ThemeProvider>
        <Routes>
          <Route path="/lab/materials/new" element={<LabMaterialNewPage />} />
          <Route path="/lab/materials" element={<div data-testid="materials-list-target" />} />
        </Routes>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

const DMEM_NCIT = {
  curie: 'NCIT:I10518',
  label: "Dulbecco's Modified Eagle Medium",
  namespace: 'NCIT',
  tier: 2 as const,
  level: 'concept' as const,
  score: 10,
  source: 'ols4' as const,
}
const DMEM_F12_XCO = {
  curie: 'XCO:0001366',
  label: 'DMEM/F-12',
  namespace: 'XCO',
  tier: 2 as const,
  level: 'concept' as const,
  score: 11,
  source: 'ols4' as const,
}

describe('LabMaterialNewPage (L2-LAB-MATERIAL-CREATE-1 u3)', () => {
  it('(a) renders an ontology search input', () => {
    resolve.mockResolvedValue({ candidates: [] })
    renderPage()
    expect(screen.getByTestId('lab-material-search-input')).toBeDefined()
  })

  it('(b) searching DMEM surfaces rows showing namespace AND label', async () => {
    resolve.mockResolvedValue({ candidates: [DMEM_F12_XCO, DMEM_NCIT] })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-material-search-input'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-material-search-button'))
    const rows = await screen.findAllByTestId('lab-material-ontology-candidate')
    expect(rows.length).toBe(2)
    // Cross-namespace trap: both rows must show namespace + full label, and
    // nothing may be picked without an explicit click.
    const ncitRow = rows.find((r) => r.textContent?.includes("Dulbecco's Modified Eagle Medium"))
    expect(ncitRow).toBeDefined()
    expect(ncitRow!.textContent).toContain('NCIT')
    expect(rows.find((r) => r.textContent?.includes('DMEM/F-12'))!.textContent).toContain('XCO')
    expect(screen.queryByTestId('vendor-builder-stub')).toBeNull()
  })

  it('(c) clicking a candidate mounts the vendor-product builder with that ontologyRef', async () => {
    resolve.mockResolvedValue({ candidates: [DMEM_F12_XCO, DMEM_NCIT] })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-material-search-input'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-material-search-button'))
    const rows = await screen.findAllByTestId('lab-material-ontology-candidate')
    const ncitRow = rows.find((r) => r.textContent?.includes('NCIT'))!
    fireEvent.click(ncitRow)
    expect(screen.getByTestId('lab-material-vendor-builder')).toBeDefined()
    // The stub prints `namespace:id`; id is the CURIE, so the pinned string is
    // namespace-prefixed twice — proof the page passed the FULL candidate
    // (namespace + curie), not a half-mapped ref.
    expect(screen.getByTestId('vendor-builder-ref').textContent).toBe('NCIT:NCIT:I10518')
    // onClose clears the builder without navigating.
    fireEvent.click(screen.getByTestId('vendor-builder-close'))
    await waitFor(() => expect(screen.queryByTestId('vendor-builder-stub')).toBeNull())
  })

  it('(d) the builder onSave navigates back to /lab/materials', async () => {
    resolve.mockResolvedValue({ candidates: [DMEM_NCIT] })
    renderPage()
    fireEvent.change(screen.getByTestId('lab-material-search-input'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-material-search-button'))
    const rows = await screen.findAllByTestId('lab-material-ontology-candidate')
    fireEvent.click(rows[0]!)
    fireEvent.click(screen.getByTestId('vendor-builder-save'))
    await waitFor(() => expect(screen.getByTestId('materials-list-target')).toBeDefined())
  })
})
