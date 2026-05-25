import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddMaterialModal } from './AddMaterialModal'
import type { Labware } from '../../types/labware'

const applyAddMaterial = vi.fn()
const setQuery = vi.fn()

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    actions: { applyAddMaterial },
  }),
}))

vi.mock('./useMaterialSearch', () => ({
  useMaterialSearch: () => ({
    query: '',
    setQuery,
    localResults: [],
    formulations: [],
    ontologyResults: [],
    loadingLocal: false,
    loadingOntology: false,
    error: null,
    searchOntology: vi.fn(),
  }),
}))

const labware = {
  labwareId: 'LBW-1',
  labwareType: 'plate_96',
  name: 'Plate 1',
} as Labware

describe('AddMaterialModal', () => {
  beforeEach(() => {
    applyAddMaterial.mockReset()
    setQuery.mockReset()
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
