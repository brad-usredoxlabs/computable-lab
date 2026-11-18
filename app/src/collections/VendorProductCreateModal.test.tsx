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
  it('(a) submit builds a VENDOR-PRODUCT payload (labware_definition_ref, verbatim catalog) — not a bare labware', async () => {
    renderModal()
    fireEvent.change(screen.getByTestId('vendor-product-vendor-input'), {
      target: { value: 'Thermo Fisher Scientific' },
    })
    // Mixed-case probe: any case-reformatting of the catalogue would turn this RED.
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
    // A labware-definition-backed product is a vendor-product record — the
    // labware schema rejects labware_definition_ref (unevaluatedProperties:false),
    // so the purchased identity lives on its own record.
    expect(schemaId).toBe('https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml')
    expect(payload.kind).toBe('vendor-product')
    expect(payload.name).toBe('Thermo Fisher Scientific a58941B')
    // The seller and the catalogue number, verbatim (no case/punctuation rewriting).
    expect(payload.vendor).toBe('Thermo Fisher Scientific')
    expect(payload.catalog_number).toBe('a58941B')
    // The DEFINITION referent — the picked definition by record id (kind:labware).
    expect(payload.labware_definition_ref).toEqual({
      kind: 'record',
      id: 'LBW-96-PLATE',
      type: 'labware',
    })
    // L2-P1B-PRODUCT-IDENTITY-1: a definition-backed product must NOT carry a
    // material referent (the oneOf forbids both) and must NOT carry the old
    // labware fields (recordId / labwareType / definitionRecordId / manufacturer).
    expect('material_ref' in payload).toBe(false)
    expect('definitionRecordId' in payload).toBe(false)
    expect('labwareType' in payload).toBe(false)
    expect('recordId' in payload).toBe(false)
    // A minted VPR- product id (the schema's stable vendor-product identifier).
    expect(typeof payload.id).toBe('string')
    expect(payload.id).toMatch(/^VPR-[0-9A-F]{8}$/)

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
    expect(payload2.vendor).toBe('Thermo Fisher Scientific')
    expect(payload2.catalog_number).toBe('A58941')
    expect(payload2.labware_definition_ref).toEqual({
      kind: 'record',
      id: 'LBW-96-PLATE',
      type: 'labware',
    })
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

  it('(d) a definition whose payload lacks labwareType is STILL accepted — the product records a referent, not a fabricated type', async () => {
    // L2-P1B-PRODUCT-IDENTITY-1: the product is a vendor-product carrying a
    // labware_definition_ref. The definition's own labwareType is NOT needed —
    // the definition remains the single authority for geometry — so a
    // definition with no labwareType is a valid target (the old labware-kind
    // "refusing to fabricate one" refusal no longer applies).
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
    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(1)
    })
    const [schemaId, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(schemaId).toBe('https://computable-lab.com/schema/computable-lab/vendor-product.schema.yaml')
    expect(payload.labware_definition_ref).toEqual({
      kind: 'record',
      id: 'LBW-NO-TYPE',
      type: 'labware',
    })
    // No fabricated labwareType and no material referent.
    expect('labwareType' in payload).toBe(false)
    expect('material_ref' in payload).toBe(false)
  })

  // ── L2-P1B-PRODUCT-IDENTITY-1 u3d1 — gate r2 D1: the two definition stores ──
  // /lab/labware/new saves kind='labware-definition'; the product door used to
  // list kind='labware' only, so a definition the person just saved could never
  // be picked. Both stores feed the one select, deduped by recordId.

  const LW_TESTDEF: RecordEnvelope = {
    recordId: 'LW-TESTDEF',
    schemaId: '',
    payload: { name: 'Thermo Optical-Quality Imaging Plate, 384-well', labwareType: 'plate' },
  }
  const LEGACY_LABWARE: RecordEnvelope[] = [
    { recordId: 'LBW-LEGACY-1', schemaId: '', payload: { name: 'legacy labware row' } },
  ]

  function renderCollectionAt(category: string) {
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
  }

  function mockTwoStores(labware: RecordEnvelope[], definitions: RecordEnvelope[]) {
    listRecordsByKindSpy.mockImplementation((kind: string) => {
      if (kind === 'labware') return Promise.resolve({ records: labware, total: labware.length })
      if (kind === 'labware-definition')
        return Promise.resolve({ records: definitions, total: definitions.length })
      return Promise.resolve({ records: [], total: 0 })
    })
  }

  function optionValues() {
    const select = screen.getByTestId('vendor-product-definition-select') as HTMLSelectElement
    return Array.from(select.options).map((o) => o.value)
  }

  it('(e) lists a definition saved as kind=labware-definition beside the labware rows (gate r2 D1)', async () => {
    mockTwoStores(LEGACY_LABWARE, [LW_TESTDEF])
    renderCollectionAt('labware')
    fireEvent.click(screen.getByTestId('lab-category-new-product'))
    await waitFor(() => {
      expect(optionValues()).toContain('LW-TESTDEF')
    })
    // The legacy store is still listed — this is a merge, not a replacement.
    expect(optionValues()).toContain('LBW-LEGACY-1')
    const labels = Array.from(
      (screen.getByTestId('vendor-product-definition-select') as HTMLSelectElement).options,
    ).map((o) => o.textContent)
    expect(labels).toContain('Thermo Optical-Quality Imaging Plate, 384-well (LW-TESTDEF)')
  })

  it('(e) dedupes a recordId present in both stores — it renders once (no duplicate key)', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const shared: RecordEnvelope = { recordId: 'LW-DUP', schemaId: '', payload: { name: 'both stores' } }
    mockTwoStores([shared], [shared])
    renderCollectionAt('labware')
    fireEvent.click(screen.getByTestId('lab-category-new-product'))
    await waitFor(() => {
      expect(optionValues()).toContain('LW-DUP')
    })
    expect(optionValues().filter((v) => v === 'LW-DUP')).toHaveLength(1)
    expect(errorSpy.mock.calls.flat().join(' ')).not.toMatch(/same key/i)
    errorSpy.mockRestore()
  })
})
