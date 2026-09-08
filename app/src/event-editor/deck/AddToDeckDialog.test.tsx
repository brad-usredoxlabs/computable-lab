import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddToDeckDialog } from './AddToDeckDialog'
import type { Labware } from '../../types/labware'

const searchVendorExa = vi.hoisted(() => vi.fn())
const createFromVendorExa = vi.hoisted(() => vi.fn())
const searchLabwareDefinitions = vi.hoisted(() => vi.fn())
const resolve = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    searchVendorExa,
    createFromVendorExa,
    searchLabwareDefinitions,
    resolve,
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function openDialog(props: Partial<{ surfaceKind: 'slot' | 'lawn' }> = {}): { picked: () => Labware | null } {
  const holder = { labware: null as Labware | null }
  render(
    <AddToDeckDialog
      open
      contextLabel="Bench 1"
      surfaceKind={props.surfaceKind ?? 'lawn'}
      onClose={() => {}}
      onPick={(labware) => { holder.labware = labware }}
    />,
  )
  return { picked: () => holder.labware }
}

describe('AddToDeckDialog', () => {
  beforeEach(() => {
    searchVendorExa.mockReset()
    createFromVendorExa.mockReset()
    searchLabwareDefinitions.mockReset()
    resolve.mockReset()
    searchLabwareDefinitions.mockResolvedValue({ hits: [], total: 0 })
    resolve.mockResolvedValue({ candidates: [] })
  })

  it('defaults to the Plates tab: shows plates, not glassware', () => {
    openDialog()
    expect(screen.getByRole('button', { name: /96-Well Plate/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /25 mL Beaker/i })).toBeNull()
  })

  it('Labware tab shows the non-plate labware (and not the plate)', () => {
    const { picked } = openDialog()
    void picked
    fireEvent.click(screen.getByRole('button', { name: /^Labware$/i }))
    expect(screen.getByRole('button', { name: /25 mL Beaker/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /96-Well Plate/i })).toBeNull()
  })

  it('hides the Equipment tab on a slot surface', () => {
    openDialog({ surfaceKind: 'slot' })
    expect(screen.getByRole('button', { name: /^Plates$/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Labware$/i })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /^Equipment$/i })).toBeNull()
  })

  it('equipment tab: selecting an Exa hit and Add to deck mints an instrument tile', async () => {
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'shaker',
      items: [
        { id: 'exa-1', title: 'Eppendorf ThermoMixer C, with Eppendorf ThermoTop', url: 'https://eppendorf.com/thermomixer', category: 'equipment', source: 'exa' },
      ],
    })
    createFromVendorExa.mockResolvedValue({
      success: true,
      recordId: 'EQP-EPPENDORF-THERMOMIXER',
      label: 'Eppendorf ThermoMixer C',
      ref: { kind: 'record', id: 'EQP-EPPENDORF-THERMOMIXER', type: 'equipment', label: 'Eppendorf ThermoMixer C' },
    })

    const { picked } = openDialog()
    fireEvent.click(screen.getByRole('button', { name: /^Equipment$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Search equipment/), { target: { value: 'thermomixer' } })

    const row = await screen.findByRole('button', { name: /Eppendorf ThermoMixer/i })
    expect(row.textContent).toContain('WEB')
    fireEvent.click(row)
    expect(row.getAttribute('aria-pressed')).toBe('true')

    const addBtn = screen.getByRole('button', { name: /^Add to deck$/i })
    expect((addBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(addBtn)

    await waitFor(() => expect(createFromVendorExa).toHaveBeenCalled())
    await waitFor(() => expect(picked()).not.toBeNull())
    expect(picked()!.labwareType).toBe('instrument')
    expect(picked()!.sourceRecordId).toBe('EQP-EPPENDORF-THERMOMIXER')
    expect(picked()!.instrumentKind).toBe('heater_shaker')
  })

  it('Add to deck is disabled until a row is selected; a catalog pick applies the custom name', async () => {
    const { picked } = openDialog()
    const addBtn = screen.getByRole('button', { name: /^Add to deck$/i })
    expect((addBtn as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByPlaceholderText(/Name on deck/), { target: { value: 'My plate' } })
    fireEvent.click(screen.getByRole('button', { name: /96-Well Plate/i }))
    expect((addBtn as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(addBtn)

    await waitFor(() => expect(picked()).not.toBeNull())
    expect(picked()!.labwareType).toBe('plate_96')
    expect(picked()!.name).toBe('My plate')
  })
})