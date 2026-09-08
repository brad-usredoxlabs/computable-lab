import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AddToDeckDialog } from './AddToDeckDialog'
import type { Labware } from '../../types/labware'

const searchVendorExa = vi.hoisted(() => vi.fn())
const createFromVendorExa = vi.hoisted(() => vi.fn())
const searchLabwareDefinitions = vi.hoisted(() => vi.fn())
const searchRecords = vi.hoisted(() => vi.fn())
const resolve = vi.hoisted(() => vi.fn())

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    searchVendorExa,
    createFromVendorExa,
    searchLabwareDefinitions,
    searchRecords,
    resolve,
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function openDialog(props: Partial<{ surfaceKind: 'slot' | 'lawn' }> = {}): {
  picked: () => Labware | null
  container: HTMLElement
} {
  const holder = { labware: null as Labware | null }
  const view = render(
    <AddToDeckDialog
      open
      contextLabel="Bench 1"
      surfaceKind={props.surfaceKind ?? 'lawn'}
      onClose={() => {}}
      onPick={(labware) => { holder.labware = labware }}
    />,
  )
  return { picked: () => holder.labware, container: view.container }
}

describe('AddToDeckDialog', () => {
  beforeEach(() => {
    searchVendorExa.mockReset()
    createFromVendorExa.mockReset()
    searchLabwareDefinitions.mockReset()
    searchRecords.mockReset()
    resolve.mockReset()
    searchLabwareDefinitions.mockResolvedValue({ hits: [], total: 0 })
    searchRecords.mockResolvedValue({ results: [], sources: ['local'] })
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

  it('switching to the Equipment tab searches Exa with the equipment category and scopes results', async () => {
    searchVendorExa.mockResolvedValue({ configured: true, query: '', items: [] })
    openDialog()
    fireEvent.click(screen.getByRole('button', { name: /^Equipment$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Search equipment/), { target: { value: 'incubator' } })

    await waitFor(() => {
      expect(searchVendorExa).toHaveBeenCalledWith({ q: 'incubator', category: 'equipment', limit: 8 })
    })
  })

  it('renders catalog + lab-db hits above Exa hits in DOM order', async () => {
    searchLabwareDefinitions.mockResolvedValue({
      hits: [{ recordId: 'LBW-CORNING-96', label: 'Corning 96 Well Plate', kind: 'labware-definition' }],
      total: 1,
    })
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'plate',
      items: [
        { id: 'exa-1', title: 'Corning Costar 96 Well Plate (WEB)', url: 'https://corning.com/96', category: 'labware', source: 'exa' },
      ],
    })

    const { container } = openDialog()
    // Query matches a catalog plate ('96-Well Plate'), the lab-db hit, and the exa hit.
    fireEvent.change(screen.getByPlaceholderText(/Search plates/), { target: { value: 'plate' } })

    await screen.findByRole('button', { name: /Corning Costar 96 Well Plate \(WEB\)/i })

    const labels = [...container.querySelectorAll('.ee-dialog__vendor-row')].map((el) => el.textContent ?? '')
    const catalogIdx = labels.findIndex((t) => t.includes('96-Well Plate'))
    const labDbIdx = labels.findIndex((t) => t.includes('Corning 96 Well Plate'))
    const exaIdx = labels.findIndex((t) => t.includes('Corning Costar'))
    expect(catalogIdx).toBeGreaterThanOrEqual(0)
    expect(labDbIdx).toBeGreaterThan(catalogIdx)
    expect(exaIdx).toBeGreaterThan(labDbIdx)
    // Sources are badged so the biologist can tell them apart.
    expect(container.querySelectorAll('.ee-dialog__vendor-badge').length).toBeGreaterThanOrEqual(2)
  })

  it('lets a generic instrument chip be added directly (no online match needed)', async () => {
    const { picked } = openDialog()
    fireEvent.click(screen.getByRole('button', { name: /^Equipment$/i }))

    // No redundant "Generic …" text-rows: the kind chips (with their icons)
    // are the addable fixtures, not a second section.
    expect(screen.queryByRole('button', { name: /Generic qPCR machine/i })).toBeNull()

    // Click the qPCR chip, name it QS5 → Add must enable immediately.
    screen.getByRole('button', { name: 'qPCR machine' }).click()
    fireEvent.change(screen.getByPlaceholderText(/Name on deck/), { target: { value: 'QS5' } })
    const addBtn = screen.getByRole('button', { name: /^Add to deck$/i })
    expect((addBtn as HTMLButtonElement).disabled).toBe(false)

    fireEvent.click(addBtn)
    await waitFor(() => expect(picked()).not.toBeNull())
    expect(picked()!.labwareType).toBe('instrument')
    expect(picked()!.instrumentKind).toBe('qpcr')
    expect(picked()!.name).toBe('QS5')
  })

  it('surfaces previously-minted / seeded local equipment first, before online hits', async () => {
    // Local tier: a just-minted EQP record + a seeded heater-shaker.
    searchRecords.mockResolvedValue({
      results: [
        { origin: 'local', recordId: 'EQP-KUHNER-LS-Z-BENCHTOP-SHA-3776', title: 'Kuhner – LS-Z benchtop shaker', kind: 'equipment' },
        { origin: 'local', recordId: 'EQP-HEATER-SHAKER', title: 'Heater-Shaker', kind: 'equipment' },
      ],
      sources: ['local'],
    })
    // Web (Exa) tier: some online shaker.
    searchVendorExa.mockResolvedValue({
      configured: true,
      query: 'shaker',
      items: [
        { id: 'exa-1', title: 'Ohaus Endeavor Shaker (WEB)', url: 'https://ohaus.com/shaker', category: 'equipment', source: 'exa' },
      ],
    })

    const { picked, container } = openDialog()
    fireEvent.click(screen.getByRole('button', { name: /^Equipment$/i }))
    fireEvent.change(screen.getByPlaceholderText(/Search equipment/), { target: { value: 'shaker' } })

    // The local Kuhner record leads the results, before any online hit.
    await screen.findByRole('button', { name: /Kuhner – LS-Z benchtop shaker/i })
    await screen.findByRole('button', { name: /Ohaus Endeavor Shaker \(WEB\)/i })

    const labels = [...container.querySelectorAll('.ee-dialog__vendor-row')].map((el) => el.textContent ?? '')
    const kuhnerIdx = labels.findIndex((t) => t.includes('Kuhner'))
    const localHeatIdx = labels.findIndex((t) => t.includes('Heater-Shaker'))
    const webIdx = labels.findIndex((t) => t.includes('Ohaus Endeavor'))
    expect(kuhnerIdx).toBeGreaterThanOrEqual(0)
    expect(localHeatIdx).toBeGreaterThan(kuhnerIdx)
    expect(webIdx).toBeGreaterThan(localHeatIdx)

    // Selecting the local record and adding reuses its canonical EQP id.
    fireEvent.click(screen.getByRole('button', { name: /Kuhner – LS-Z benchtop shaker/i }))
    fireEvent.click(screen.getByRole('button', { name: /^Add to deck$/i }))
    await waitFor(() => expect(picked()).not.toBeNull())
    expect(picked()!.labwareType).toBe('instrument')
    expect(picked()!.sourceRecordId).toBe('EQP-KUHNER-LS-Z-BENCHTOP-SHA-3776')
  })
})