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

  it('shows T25 and T75 cell-culture flasks in the deck-slot menu (not lawn-only)', () => {
    render(
      <AddLabwareDialog
        open
        contextLabel="Slot B"
        surfaceKind="slot"
        onClose={() => {}}
        onPick={() => {}}
      />,
    )

    // Deck-slot palette: the two culture flasks must appear (Lawn-only types
    // like beakers / Erlenmeyer flasks are filtered out of slot mode, but these
    // are deliberately placeable on a slot).
    expect(screen.getByRole('button', { name: /T25 Flask/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: /T75 Flask/i })).toBeTruthy()
  })

  it('does not show lawn-only glassware (beaker) in the deck-slot menu', () => {
    render(
      <AddLabwareDialog
        open
        contextLabel="Slot B"
        surfaceKind="slot"
        onClose={() => {}}
        onPick={() => {}}
      />,
    )
    expect(screen.queryByRole('button', { name: /Beaker/i })).toBeNull()
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