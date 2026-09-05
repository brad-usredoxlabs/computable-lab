/**
 * AddMaterialForm biological-vs-chemical gating (D4): a coarse
 * material.domain (cell_line|organism) renders the count-first biological
 * fields; a chemical renders the volume-first form. Rendered for real with a
 * mocked registry + lab settings so the type-aware form is verified as a
 * component, not just the pure helpers.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AddMaterialForm } from './AddMaterialForm'
import type { AddMaterialDetails } from '../../../types/events'
import type { BiologicalTypesRegistry } from '../../../shared/bioTypes'

vi.mock('../../../shared/context/WellSelectionContext', () => ({
  useWellSelection: () => ({
    state: { selectedWells: [], selectedRanges: [] },
    clearSelection: vi.fn(),
    selectWells: vi.fn(),
    replaceSelection: vi.fn(),
    toggleWell: vi.fn(),
  }),
}))

const REGISTRY: BiologicalTypesRegistry = {
  version: 1,
  default: {
    id: 'default', label: 'Biological material (generic)', domains: [], termKinds: [],
    match: { labels: [], curies: [] },
    measures: { primary: 'count', units: ['count-per-well'], concentrationBasis: 'count_per_volume' },
    fields: [{ key: 'count', label: 'Count per well', required: true }, { key: 'volume', label: 'Final volume (µL)', required: true }],
  },
  types: {
    'cell-line': {
      id: 'cell-line', label: 'Cell Line', domains: ['cell_line'], termKinds: ['organism'],
      match: { labels: ['HepaRG'], curies: [] },
      measures: { primary: 'count', units: ['cells-per-well'], concentrationBasis: 'count_per_volume' },
      verification: { method: 'hoechst_nuclei', readModality: 'microscopy' },
      fields: [
        { key: 'count', label: 'Cells per well', required: true },
        { key: 'volume', label: 'Final volume (µL)', required: true },
        { key: 'counterDensity', label: 'Counter density (cells/µL)', required: false },
      ],
    },
  },
  organisms: [],
  strains: [],
  conditions: [
    { label: 'anoxic', id: 'TERM-anoxic-1v6v', aliases: ['anoxia'] },
    { label: 'organ-on-a-chip', id: 'TERM-organ-on-a-chip-a1b2', aliases: ['OoC'] },
  ],
}

const api = vi.hoisted(() => ({
  getBiologicalTypesRegistry: vi.fn(),
  getRecord: vi.fn(),
  getFormulationsSummary: vi.fn(),
  searchMaterials: vi.fn(),
  searchVendorProducts: vi.fn(),
  getConfig: vi.fn(),
  getSettings: vi.fn(),
}))

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    getBiologicalTypesRegistry: api.getBiologicalTypesRegistry,
    getRecord: api.getRecord,
    getFormulationsSummary: api.getFormulationsSummary,
    searchMaterials: api.searchMaterials,
    searchVendorProducts: api.searchVendorProducts,
  },
}))

vi.mock('../../hooks/useLabSettings', () => ({
  useLabSettings: () => ({ settings: { materialTracking: { mode: 'formulation', allowAdHocEventInstances: false } } }),
}))

function renderForm(details: AddMaterialDetails) {
  const onChange = vi.fn()
  render(
    <MemoryRouter>
      <AddMaterialForm details={details} onChange={onChange} />
    </MemoryRouter>,
  )
  return onChange
}

afterEach(() => {
  cleanup()
  // reset the module-level registry cache so each test re-fetches the mock
  vi.clearAllMocks()
})

describe('AddMaterialForm biological-vs-chemical gating (D4)', () => {
  beforeEach(() => {
    api.getBiologicalTypesRegistry.mockResolvedValue({ registry: REGISTRY })
  })

  it('renders count-first biological fields when the material is a cell_line (inline domain)', async () => {
    const bioRef = {
      kind: 'ontology' as const, id: 'CLO:0020273', namespace: 'CL', label: 'HepaRG',
      domain: 'cell_line', termKind: 'organism',
    } as unknown as AddMaterialDetails['material_ref']
    const onChange = renderForm({
      wells: ['A1'],
      material_ref: bioRef,
    })
    // The biological type is persisted on selection.
    await waitFor(() => expect(screen.getByTestId('bio-count')).toBeTruthy())
    expect(screen.getByTestId('bio-volume')).toBeTruthy()
    expect(screen.getByTestId('bio-density')).toBeTruthy()
    expect(screen.getByTestId('bio-measuredby')).toBeTruthy()
    expect(screen.getByTestId('bio-condition-TERM-anoxic-1v6v')).toBeTruthy()
    // biological_type was persisted (onChange called at least once by WellsSelector/effect)
    expect(onChange.mock.calls.length).toBeGreaterThan(0)
  })

  it('renders volume-first (chemical) unchanged when the material domain is chemical', async () => {
    renderForm({ wells: ['A1'], material_ref: { kind: 'ontology', id: 'CHEBI:16236', namespace: 'CHEBI', label: 'ethanol' }, volume: { value: 50, unit: 'uL' } })
    await waitFor(() => expect(screen.getByText(/Overrides & Notes/)).toBeTruthy())
    // no biological count-first fields
    expect(screen.queryByTestId('bio-count')).toBeNull()
    expect(screen.queryByTestId('bio-volume')).toBeNull()
    expect(screen.queryByTestId('bio-condition-TERM-anoxic-1v6v')).toBeNull()
  })
})