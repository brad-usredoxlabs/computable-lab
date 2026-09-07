import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddLabwareDialog } from './AddLabwareDialog'
import type { Labware } from '../../types/labware'

const searchVendorExa = vi.hoisted(() => vi.fn())
const createFromVendorExa = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    searchVendorExa,
    createFromVendorExa,
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AddLabwareDialog', () => {
  beforeEach(() => {
    searchVendorExa.mockReset()
    createFromVendorExa.mockReset()
  })

  it('searches Exa for labware and mints a record on pick', async () => {
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'deepwell',
      items: [
        { id: 'exa-1', title: 'Corning Deepwell 96', url: 'https://corning.com/deepwell', category: 'labware', source: 'exa' },
      ],
    })
    createFromVendorExa.mockResolvedValue({
      success: true,
      recordId: 'LBW-CORNING-DEEPWELL',
      label: 'Corning Deepwell 96',
      ref: { kind: 'record', id: 'LBW-CORNING-DEEPWELL', type: 'labware', label: 'Corning Deepwell 96' },
    })

    let picked: Labware | null = null
    render(
      <AddLabwareDialog
        open
        contextLabel="Slot 1"
        surfaceKind="lawn"
        onClose={() => {}}
        onPick={(labware) => { picked = labware }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/Search labware/), { target: { value: 'deepwell' } })

    await waitFor(() => {
      expect(searchVendorExa).toHaveBeenCalledWith({
        q: 'deepwell',
        category: 'labware',
        limit: 8,
      })
    })
    const row = await screen.findByRole('button', { name: /Corning Deepwell 96/i })
    fireEvent.click(row)

    await waitFor(() => {
      expect(createFromVendorExa).toHaveBeenCalled()
    })
    await waitFor(() => expect(picked).not.toBeNull())
    expect(picked!.labwareId).toBe('LBW-CORNING-DEEPWELL')
  })
})