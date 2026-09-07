import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddEquipmentDialog } from './AddEquipmentDialog'
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

describe('AddEquipmentDialog', () => {
  beforeEach(() => {
    searchVendorExa.mockReset()
    createFromVendorExa.mockReset()
  })

  it('searches Exa for equipment and mints an instrument tile carrying the EQP record', async () => {
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'shaker',
      items: [
        {
          id: 'exa-1',
          title: 'Eppendorf ThermoMixer C, with Eppendorf ThermoTop',
          url: 'https://eppendorf.com/thermomixer',
          category: 'equipment',
          source: 'exa',
        },
      ],
    })
    createFromVendorExa.mockResolvedValue({
      success: true,
      recordId: 'EQP-EPPENDORF-THERMOMIXER',
      label: 'Eppendorf ThermoMixer C',
      ref: { kind: 'record', id: 'EQP-EPPENDORF-THERMOMIXER', type: 'equipment', label: 'Eppendorf ThermoMixer C' },
    })

    let picked: Labware | null = null
    render(
      <AddEquipmentDialog
        open
        contextLabel="Bench 1"
        onClose={() => {}}
        onPick={(labware) => { picked = labware }}
      />,
    )

    fireEvent.change(screen.getByPlaceholderText(/Search instruments/), { target: { value: 'shaker' } })

    await waitFor(() => {
      expect(searchVendorExa).toHaveBeenCalledWith({
        q: 'shaker',
        category: 'equipment',
        limit: 8,
      })
    })
    const row = await screen.findByRole('button', { name: /Eppendorf ThermoMixer/i })
    expect(row.textContent).toContain('WEB')
    fireEvent.click(row)

    await waitFor(() => {
      expect(createFromVendorExa).toHaveBeenCalled()
    })
    await waitFor(() => expect(picked).not.toBeNull())
    // The tile is an `instrument` lawn-only labware whose tile id is the minted
    // EQP identity (kept in sourceRecordId so the EQP record stays canonical).
    expect(picked!.labwareType).toBe('instrument')
    expect(picked!.name).toBe('Eppendorf ThermoMixer C')
    expect(picked!.sourceRecordId).toBe('EQP-EPPENDORF-THERMOMIXER')
  })
})