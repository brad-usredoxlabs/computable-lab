// @vitest-environment jsdom
/**
 * L2-P1-PRODUCT-DOOR-1 u1productdoor — VendorProductCreateModal tests.
 *
 * (a) submit builds a labware-kind payload with a minted LW- recordId, the
 *     picked definition's labwareType, manufacturer.name the vendor string,
 *     manufacturer.catalogNumber EXACTLY the typed string (mixed-case probe +
 *     verbatim 'A58941'), and definitionRecordId the selected recordId.
 * (b) submit is blocked (no createRecord call) when catalog or definition is
 *     empty; a filled vendor alone passes the vendor gate.
 * (c) the "+ New product" door renders in the collection view under the
 *     'labware' category and nowhere else, and opens the modal.
 * (d) a definition whose payload lacks labwareType is refused client-side with
 *     a visible error and no createRecord call (no fabricated labwareType).
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from '../shared/shell'
import { OpenTabsProvider } from '../shared/shell/OpenTabsContext'

const createRecordSpy = vi.fn().mockResolvedValue({ success: true })
const listRecordsByKindSpy = vi.fn()

vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: (...args: unknown[]) => createRecordSpy(...args),
    listRecordsByKind: (...args: unknown[]) => listRecordsByKindSpy(...args),
    getSurfaces: vi.fn().mockResolvedValue({ surfaces: [] }),
    getAccessPolicy: vi.fn().mockResolvedValue({ visibility: 'private', grants: [] }),
    getSchema: vi.fn().mockResolvedValue({ schema: {} }),
  },
}))

import { VendorProductCreateModal } from './VendorProductCreateModal'
import { LabCollectionView } from './LabCollectionView'
import type { RecordEnvelope } from '../types/kernel'

const DEFINITIONS = [
  { recordId: 'LBW-96-PLATE', schemaId: '', payload: { name: '96-well plate', labwareType: 'plate' } },
  { recordId: 'LBW-RESERVOIR-10ML', schemaId: '', payload: { name: '10 ml reservoir', labwareType: 'reservoir' } },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

beforeEach(() => {
  listRecordsByKindSpy.mockResolvedValue({ records: DEFINITIONS, total: 2 })
})

function renderModal(defs: RecordEnvelope[] = DEFINITIONS) {
  render(
    <VendorProductCreateModal
      definitions={defs}
      isOpen={true}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  )
}

describe('VendorProductCreateModal', () => {
  it('(a) submit builds the labware-kind payload with verbatim catalog number', async () => {
    renderModal()
    fireEvent.change(screen.getByTestId('vendor-product-vendor-input'), {
      target: { value: 'Thermo Fisher Scientific' },
    })
    // Mixed-case probe: a toUpperCase() (or any other case-reformatting)
    // mutation of the payload would turn this test RED.
    fireEvent.change(screen.getByTestId('vendor-product-catalog-input'), {
      target: { value: 'a58941B' },
    })
    fireEvent.change(screen.getByTestId('vendor-product-definition-select'), {
      target: { value: 'LBW-96-PLATE' },
    })
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))

    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(1)
    })
    const [schemaId, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(schemaId).toBe('https://computable-lab.com/schema/computable-lab/labware.schema.yaml')
    expect(payload.kind).toBe('labware')
    expect(payload.name).toBe('Thermo Fisher Scientific a58941B')
    const manufacturer = payload.manufacturer as Record<string, unknown>
    expect(manufacturer.name).toBe('Thermo Fisher Scientific')
    // EXACTLY the typed string — verbatim, no case/punctuation rewriting.
    expect(manufacturer.catalogNumber).toBe('a58941B')
    expect(payload.definitionRecordId).toBe('LBW-96-PLATE')
    // The payload must carry the minted recordId and the picked definition's
    // labwareType (schema/lab/labware.schema.yaml requires both).
    expect(typeof payload.recordId).toBe('string')
    expect(payload.recordId).toMatch(/^LW-[0-9A-F]{8}$/)
    expect(payload.labwareType).toBe('plate')

    // A real catalogue typed verbatim stays byte-equal in the payload.
    fireEvent.change(screen.getByTestId('vendor-product-catalog-input'), {
      target: { value: 'A58941' },
    })
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))
    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(2)
    })
    const [, payload2] = createRecordSpy.mock.calls[1] as [string, Record<string, unknown>]
    expect(payload2.name).toBe('Thermo Fisher Scientific A58941')
    const manufacturer2 = payload2.manufacturer as Record<string, unknown>
    expect(manufacturer2.catalogNumber).toBe('A58941')
    expect(payload2.definitionRecordId).toBe('LBW-96-PLATE')
    expect(payload2.labwareType).toBe('plate')
  })

  it('(b) submit is blocked when the definition is empty', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('vendor-product-vendor-input'), {
      target: { value: 'Thermo Fisher Scientific' },
    })
    fireEvent.change(screen.getByTestId('vendor-product-catalog-input'), {
      target: { value: 'A58941' },
    })
    // No definition selected
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))
    expect(createRecordSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('vendor-product-create-error')).toBeDefined()
  })

  it('(b) submit is blocked when the catalog number is empty', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('vendor-product-vendor-input'), {
      target: { value: 'Thermo Fisher Scientific' },
    })
    // Catalog left empty; definition selected
    fireEvent.change(screen.getByTestId('vendor-product-definition-select'), {
      target: { value: 'LBW-96-PLATE' },
    })
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))
    expect(createRecordSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('vendor-product-create-error')).toBeDefined()
  })

  it('(b) submit is blocked when the vendor is empty, even with catalog + definition', () => {
    renderModal()
    fireEvent.change(screen.getByTestId('vendor-product-catalog-input'), {
      target: { value: 'A58941' },
    })
    fireEvent.change(screen.getByTestId('vendor-product-definition-select'), {
      target: { value: 'LBW-96-PLATE' },
    })
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))
    expect(createRecordSpy).not.toHaveBeenCalled()
    expect(screen.getByTestId('vendor-product-create-error')).toBeDefined()
  })

  it('(c) the + New product door renders under the labware category and opens the modal', async () => {
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
        </Routes>
      </MemoryRouter>,
    )
    const btn = screen.getByTestId('lab-category-new-product')
    expect(btn.textContent).toContain('+ New product')
    // The adjacent existing door is untouched
    expect(screen.getByTestId('lab-category-new-labware')).toBeDefined()

    fireEvent.click(btn)
    await waitFor(() => {
      expect(screen.getByTestId('vendor-product-create-modal')).toBeDefined()
    })
    // The definition select lists the fetched labware records as name+recordId
    const select = screen.getByTestId('vendor-product-definition-select') as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toContain('LBW-96-PLATE')
    expect(Array.from(select.options).map((o) => o.textContent)).toContain('96-well plate (LBW-96-PLATE)')
  })

  it('(c) the + New product door is absent on non-labware categories', () => {
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
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByTestId('lab-category-new-product')).toBeNull()
  })

  it('(d) a definition whose payload lacks labwareType is refused, createRecord NOT called', () => {
    renderModal([
      { recordId: 'LBW-NO-TYPE', schemaId: '', payload: { name: 'plate with no type' } },
    ])
    fireEvent.change(screen.getByTestId('vendor-product-vendor-input'), {
      target: { value: 'Thermo Fisher Scientific' },
    })
    fireEvent.change(screen.getByTestId('vendor-product-catalog-input'), {
      target: { value: 'A58941' },
    })
    fireEvent.change(screen.getByTestId('vendor-product-definition-select'), {
      target: { value: 'LBW-NO-TYPE' },
    })
    fireEvent.click(screen.getByTestId('vendor-product-create-submit'))
    // Refused client-side: the error is visible and no record was created.
    expect(screen.getByTestId('vendor-product-create-error')).toHaveTextContent(
      'Selected definition has no labwareType; refusing to fabricate one',
    )
    expect(createRecordSpy).not.toHaveBeenCalled()
  })
})
