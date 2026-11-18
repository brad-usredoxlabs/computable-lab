// @vitest-environment jsdom
/**
 * L2-LAB-MATERIAL-CREATE-1 u3 — /lab/materials/new: ontology search (namespace +
 * label shown), explicit pick mounts the EXISTING VendorProductBuilderModal,
 * and its onSave navigates back to /lab/materials.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'

const resolve = vi.fn()

// Only the resolve spine + the local-DB reads that useMaterialSearch fires on
// every keystroke are stubbed; the real client otherwise.
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
vi.mock('../shared/lib/integrationFlags', () => ({
  exaVendorEnabled: () => Promise.resolve(false),
  noteExaUnavailable: () => undefined,
}))

// Stub the builder: this test owns the STITCHING contract (mount on pick +
// navigate on onSave), not the modal's internals (read-only import).
vi.mock('../editor/material/VendorProductBuilderModal', () => ({
  VendorProductBuilderModal: ({ isOpen, ontologyRef, onClose, onSave }: any) =>
    isOpen ? (
      <div data-testid="vendor-builder-stub">
        <span data-testid="vendor-builder-ref">{`${ontologyRef?.namespace}:${ontologyRef?.id}`}</span>
        <button type="button" data-testid="vendor-builder-close" onClick={onClose}>stub close</button>
        <button type="button" data-testid="vendor-builder-save"
          onClick={() => onSave({ kind: 'record', id: 'VP-TEST-1', type: 'vendor-product', label: ontologyRef?.label ?? '' })}>
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

const candidate = (curie: string, namespace: string, label: string) => ({ curie, label, namespace, tier: 2 as const, level: 'concept' as const, score: 10, source: 'ols4' as const })
const NCIT_DMEM = candidate('NCIT:I10518', 'NCIT', "Dulbecco's Modified Eagle Medium")
const XCO_F12 = candidate('XCO:0001366', 'XCO', 'DMEM/F-12')
async function searchDMEM() {
  fireEvent.change(screen.getByTestId('lab-material-search-input'), { target: { value: 'DMEM' } })
  fireEvent.click(screen.getByTestId('lab-material-search-button'))
  return screen.findAllByTestId('lab-material-ontology-candidate')
}

describe('LabMaterialNewPage (L2-LAB-MATERIAL-CREATE-1 u3)', () => {
  it('(a) renders an ontology search input', () => {
    resolve.mockResolvedValue({ candidates: [] })
    renderPage()
    expect(screen.getByTestId('lab-material-search-input')).toBeDefined()
  })

  it('(b) DMEM rows show namespace AND label; nothing is picked without a click', async () => {
    resolve.mockResolvedValue({ candidates: [XCO_F12, NCIT_DMEM] })
    renderPage()
    const rows = await searchDMEM()
    expect(rows.length).toBe(2)
    const ncitRow = rows.find((r) => r.textContent?.includes("Dulbecco's Modified Eagle Medium"))
    expect(ncitRow).toBeDefined()
    // A whole-row toContain('NCIT') is satisfied by the rendered CURIE itself (advc c1 D1).
    expect(within(ncitRow!).getAllByTestId('lab-material-candidate-namespace').map((n) => n.textContent)).toEqual(['NCIT'])
    expect(within(rows.find((r) => r.textContent?.includes('DMEM/F-12'))!).getAllByTestId('lab-material-candidate-namespace').map((n) => n.textContent)).toEqual(['XCO'])
    expect(screen.queryByTestId('vendor-builder-stub')).toBeNull()
  })

  it('(c) clicking a candidate mounts the vendor builder with that ontologyRef; onClose clears it', async () => {
    resolve.mockResolvedValue({ candidates: [XCO_F12, NCIT_DMEM] })
    renderPage()
    const rows = await searchDMEM()
    // The stub prints `namespace:id`; id is the CURIE, so the pinned string is
    // namespace-prefixed twice — proof the page passed namespace + curie, not a
    // half-mapped ref.
    fireEvent.click(rows.find((r) => r.textContent?.includes('NCIT'))!)
    expect(screen.getByTestId('lab-material-vendor-builder')).toBeDefined()
    expect(screen.getByTestId('vendor-builder-ref').textContent).toBe('NCIT:NCIT:I10518')
    fireEvent.click(screen.getByTestId('vendor-builder-close'))
    await waitFor(() => expect(screen.queryByTestId('vendor-builder-stub')).toBeNull())
  })

  it('(d) the builder onSave navigates back to /lab/materials', async () => {
    resolve.mockResolvedValue({ candidates: [NCIT_DMEM] })
    renderPage()
    const rows = await searchDMEM()
    fireEvent.click(rows[0]!)
    fireEvent.click(screen.getByTestId('vendor-builder-save'))
    await waitFor(() => expect(screen.getByTestId('materials-list-target')).toBeDefined())
  })
})
