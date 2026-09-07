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
    // No manual kind picked → best-effort classify the vendor title directly.
    expect(picked!.instrumentKind).toBe('heater_shaker')
  })

  it('honors an explicit instrument-type pick as the silhouette kind', async () => {
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'vortex',
      items: [
        { id: 'exa-v', title: 'Benchmark Scientific Vortex Mixer', url: 'https://benchmarksci.com/vortex', category: 'equipment', source: 'exa' },
      ],
    })
    createFromVendorExa.mockResolvedValue({
      success: true,
      recordId: 'EQP-BENCHMARK-VORTEX',
      label: 'Benchmark Scientific Vortex Mixer',
      ref: { kind: 'record', id: 'EQP-BENCHMARK-VORTEX', type: 'equipment', label: 'Benchmark Scientific Vortex Mixer' },
    })

    let picked: Labware | null = null
    render(
      <AddEquipmentDialog
        open
        contextLabel="Bench"
        onClose={() => {}}
        onPick={(labware) => { picked = labware }}
      />,
    )

    // The type picker offers the four silhouettes.
    expect(screen.getByRole('button', { name: /qPCR machine/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Plate reader/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Vortex/i })).toBeTruthy()

    // Explicitly pick qPCR machine, then choose a pipette that would otherwise
    // classify generically — the manual pick wins.
    screen.getByRole('button', { name: /qPCR machine/i }).click()
    fireEvent.change(screen.getByPlaceholderText(/Search instruments/), { target: { value: 'vortex mixer' } })
    const row = await screen.findByRole('button', { name: /Benchmark Scientific Vortex/i })
    fireEvent.click(row)

    await waitFor(() => expect(picked).not.toBeNull())
    expect(picked!.instrumentKind).toBe('qpcr')
  })
})