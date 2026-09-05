import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMaterialModal, inferMaterialProfileIdForOntologyCandidate } from './AddMaterialModal'
import { toPickerProfileId } from './profileBuilderRegistry'
import type { Labware } from '../../types/labware'

const applyAddMaterial = vi.fn()
const setQuery = vi.fn()

const materialSearchMock = vi.hoisted(() => ({
  value: {
    query: '',
    localResults: [] as Array<{ recordId: string; kind: string; title: string; category: string; subtitle?: string; termKind?: string; domain?: string; curie?: string }>,
    formulations: [],
    ontologyResults: [],
    loadingLocal: false,
    loadingOntology: false,
    error: null as string | null,
  },
}))

const api = vi.hoisted(() => ({
  getBiologicalTypesRegistry: vi.fn(),
}))

vi.mock('../../shared/api/client', () => ({
  apiClient: { getBiologicalTypesRegistry: api.getBiologicalTypesRegistry },
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    actions: { applyAddMaterial },
  }),
}))

vi.mock('./useMaterialSearch', () => ({
  useMaterialSearch: () => ({
    ...materialSearchMock.value,
    setQuery,
    searchOntology: vi.fn(),
    clearOntology: vi.fn(),
  }),
}))

vi.mock('../../shared/material-intent/useMaterialProfiles', () => ({
  useMaterialProfiles: () => ({
    profiles: [
      { id: 'chemical', label: 'Chemical' },
      { id: 'media_composition', label: 'Media composition' },
      { id: 'cell_line', label: 'Cell line' },
      { id: 'sample', label: 'Sample' },
    ],
    loading: false,
    error: null,
  }),
}))

const labware = {
  labwareId: 'LBW-1',
  labwareType: 'plate_96',
  name: 'Plate 1',
} as Labware

/** Shared biological registry fixture (HepaRG → cell-line, anoxic condition). */
const REGISTRY = {
  version: 1,
  default: {
    id: 'default', label: 'Bio (generic)', domains: [], termKinds: [],
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
      ],
    },
  },
  organisms: [],
  strains: [],
  conditions: [{ label: 'anoxic', id: 'TERM-anoxic-1v6v', aliases: ['anoxia'] }],
}

describe('ontology candidate → material profile routing', () => {
  it('routes cell-like ontology terms to the cell_line profile (cells builder)', () => {
    const c = { curie: 'mesh:D056945', namespace: 'mesh', label: 'Hep G2 Cells' }
    expect(inferMaterialProfileIdForOntologyCandidate(c)).toBe('cell_line')
    expect(toPickerProfileId(inferMaterialProfileIdForOntologyCandidate(c))).toBe('cell_line')
  })

  it('routes EFO/CL-like terms to the cell_line profile', () => {
    const candidate = { curie: 'EFO:0001187', namespace: 'EFO', label: 'HepG2' }
    expect(inferMaterialProfileIdForOntologyCandidate(candidate)).toBe('cell_line')
  })

  it('routes media-like ontology terms to the media_composition profile (mixture builder)', () => {
    expect(inferMaterialProfileIdForOntologyCandidate({
      curie: 'XCO:0000988',
      namespace: 'XCO',
      label: "Dulbecco's Modified Eagle's Medium",
    })).toBe('media_composition')
  })

  it('routes chemical ontology terms to the chemical profile (compound builder)', () => {
    expect(inferMaterialProfileIdForOntologyCandidate({
      curie: 'CHEBI:5001',
      namespace: 'CHEBI',
      label: 'fenofibrate',
    })).toBe('chemical')
  })

  it('normalizes the `other` fallback to the chemical picker profile', () => {
    const c = { curie: 'NCBITaxon:9606', namespace: 'NCBITaxon', label: 'Homo sapiens' }
    expect(inferMaterialProfileIdForOntologyCandidate(c)).toBe('other')
    expect(toPickerProfileId('other')).toBe('chemical')
  })
})

describe('AddMaterialModal', () => {
  beforeEach(() => {
    applyAddMaterial.mockReset()
    setQuery.mockReset()
    api.getBiologicalTypesRegistry.mockResolvedValue({ registry: REGISTRY })
    materialSearchMock.value = {
      query: '',
      localResults: [],
      formulations: [],
      ontologyResults: [],
      loadingLocal: false,
      loadingOntology: false,
      error: null,
    }
  })

  afterEach(() => cleanup())

  it('does not bubble portal clicks to the focus backdrop', () => {
    const parentClick = vi.fn()
    render(
      <div onClick={parentClick}>
        <AddMaterialModal
          isOpen
          labware={labware}
          wells={['A1', 'A2']}
          onClose={() => {}}
        />
      </div>,
    )

    fireEvent.click(screen.getByPlaceholderText(/Search materials/))
    expect(parentClick).not.toHaveBeenCalled()
  })

  it('shows volume and role configuration after a direct saved-material pick', () => {
    materialSearchMock.value = {
      query: 'dmso',
      // An addable saved material (a prepared instance) — bare concept-only
      // records are intentionally hidden from the well-add list.
      localResults: [{
        recordId: 'MINST-DMSO',
        kind: 'material-instance',
        title: 'DMSO',
        category: 'prepared-material',
      }],
      formulations: [],
      ontologyResults: [],
      loadingLocal: false,
      loadingOntology: false,
      error: null,
    }

    render(
      <AddMaterialModal
        isOpen
        labware={labware}
        wells={['A1']}
        onClose={() => {}}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /DMSO/i }))

    expect(screen.getByLabelText(/Volume \(µL\)/i)).toBeTruthy()
    expect(screen.getByLabelText(/Role/i)).toBeTruthy()
    expect(applyAddMaterial).not.toHaveBeenCalled()
  })

  it('hides bare concept-only records from the addable list (add a formulation/instance, not a concept)', () => {
    materialSearchMock.value = {
      query: 'clofibrate',
      localResults: [{ recordId: 'MAT-clo', kind: 'material', title: 'clofibrate', category: 'concept-only' }],
      formulations: [],
      ontologyResults: [],
      loadingLocal: false,
      loadingOntology: false,
      error: null,
    }
    render(<AddMaterialModal isOpen labware={labware} wells={['A1']} onClose={() => {}} />)
    // The bare concept is not offered as something to drop into the well.
    expect(screen.queryByRole('button', { name: /clofibrate/i })).toBeNull()
    expect(screen.queryByText('Materials')).toBeNull()
  })

  it('closes only when the scrim itself is pressed', () => {
    const onClose = vi.fn()
    render(
      <AddMaterialModal
        isOpen
        labware={labware}
        wells={['A1']}
        onClose={onClose}
      />,
    )

    fireEvent.pointerDown(screen.getByRole('dialog'))
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(document.querySelector('.add-material-scrim') as HTMLElement)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('surfaces biological type terms and opens the count-first configure view', async () => {
    materialSearchMock.value = {
      query: 'HepaRG',
      localResults: [{
        recordId: 'TERM-heparg-ii79',
        kind: 'term',
        title: 'HepaRG',
        category: 'concept-only',
        subtitle: 'Organism · cell_line',
        termKind: 'organism',
        domain: 'cell_line',
        curie: 'CLO:0020273',
      }],
      formulations: [],
      ontologyResults: [],
      loadingLocal: false,
      loadingOntology: false,
      error: null,
    }
    render(<AddMaterialModal isOpen labware={labware} wells={['A1']} onClose={() => {}} />)

    // The seeded biological term is now ADDABLE (unlike a bare chemical concept).
    fireEvent.click(screen.getByRole('button', { name: /HepaRG/i }))
    // Count-first configure view renders (NOT plain volume) once the registry resolves.
    await waitFor(() => expect(screen.getByTestId('bio-count')).toBeTruthy())
    expect(screen.getByTestId('bio-volume')).toBeTruthy()
    expect(screen.getByTestId('bio-measuredby')).toBeTruthy()
    expect(screen.getByTestId('bio-condition-TERM-anoxic-1v6v')).toBeTruthy()
  })

  it('applies a biological seed as a count-first add_material with biological fields', async () => {
    materialSearchMock.value = {
      query: 'HepaRG',
      localResults: [{
        recordId: 'TERM-heparg-ii79',
        kind: 'term',
        title: 'HepaRG',
        category: 'concept-only',
        subtitle: 'Organism · cell_line',
        termKind: 'organism',
        domain: 'cell_line',
        curie: 'CLO:0020273',
      }],
      formulations: [],
      ontologyResults: [],
      loadingLocal: false,
      loadingOntology: false,
      error: null,
    }
    render(<AddMaterialModal isOpen labware={labware} wells={['A1']} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: /HepaRG/i }))
    await waitFor(() => expect(screen.getByTestId('bio-count')).toBeTruthy())

    // Fill count + final volume (required), pick a condition, confirm.
    fireEvent.change(screen.getByTestId('bio-count'), { target: { value: '50000' } })
    fireEvent.change(screen.getByTestId('bio-volume'), { target: { value: '100' } })
    fireEvent.click(screen.getByTestId('bio-condition-TERM-anoxic-1v6v'))
    await waitFor(() => expect((screen.getByRole('button', { name: /Add to well/i }) as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(screen.getByRole('button', { name: /Add to well/i }))

    const call = applyAddMaterial.mock.calls[0][0]
    expect(call.materialRef.id).toBe('TERM-heparg-ii79')
    expect(call.biological_type?.id).toBe('TERM-heparg-ii79')
    expect(call.count).toBe(50000)
    expect(call.volume_uL).toBe(100)
    expect(call.condition_refs?.map((r: { id: string }) => r.id)).toContain('TERM-anoxic-1v6v')
  })
})
