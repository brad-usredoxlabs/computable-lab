import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMaterialModal, inferMaterialProfileIdForOntologyCandidate } from './AddMaterialModal'
import { toPickerProfileId } from './profileBuilderRegistry'
import type { Labware } from '../../types/labware'

const applyAddMaterial = vi.fn()
const setQuery = vi.fn()

const materialSearchMock = vi.hoisted(() => ({
  value: {
    query: '',
    localResults: [] as Array<{ recordId: string; kind: string; title: string; category: string; subtitle?: string }>,
    formulations: [],
    ontologyResults: [],
    loadingLocal: false,
    loadingOntology: false,
    error: null as string | null,
  },
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
})
