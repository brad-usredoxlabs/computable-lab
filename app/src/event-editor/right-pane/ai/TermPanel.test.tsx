import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { TermPanel } from './TermPanel'
import type { DraftTermRow } from './TermPanel'
import type { SlashSuggestion } from '../../../shared/taptab/slashMenu/types'

// Spy on the per-kind resolvers so a labware/equipment row provably dispatches to
// its OWN resolver, not the material one.
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../../../shared/taptab/slashMenu/resolvers', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../shared/taptab/slashMenu/resolvers')>()
  return {
    ...original,
    resolveLabware: (q: string, ctx: unknown) => resolveLabware(q, ctx),
    resolveEquipment: (q: string, ctx: unknown) => resolveEquipment(q, ctx),
  }
})

/** A draft that used one unmatched term, one local term, one ontology CURIE. */
const terms: DraftTermRow[] = [
  {
    label: 'F praus',
    source: 'minted',
    id: 'mint:F praus',
    suggestions: [
      {
        id: 'TERM-fpraus-9z8y',
        preferredLabel: 'F prausnitzii',
        distance: 1,
        matchedOn: 'F praus',
        aliases: ['FPRAUS', 'F praus'],
      },
    ],
  },
  { label: '1 mM Clofibrate in DMSO', source: 'local-record', id: 'MSP-API-mu50x5z7' },
  { label: 'fenofibrate', source: 'ontology', id: 'CHEBI:5001' },
  { label: 'Sigma 100% methanol', source: 'vendor-product', id: 'VND-9', vendor: 'Sigma', catalogNumber: '322415' },
]

const suggestion: SlashSuggestion = {
  key: 'MAT-ethanol-1',
  label: 'ethanol',
  badge: 'Material',
  subtitle: 'Workspace record',
  mention: { type: 'material', entityKind: 'material', id: 'MAT-ethanol-1', label: 'ethanol' },
}

describe('TermPanel — what each term matched, and one place to fix it', () => {
  it('is collapsed by default and counts the terms', () => {
    render(<TermPanel terms={terms} />)
    const toggle = screen.getByTestId('term-panel-toggle')
    expect(toggle.textContent).toContain('Terms (4)')
    expect(toggle.textContent).toContain('1 new')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByTestId('term-row-0')).toBeNull()
  })

  it('lists a row per term with its provenance when expanded', () => {
    render(<TermPanel terms={terms} defaultOpen />)
    expect(screen.getByTestId('term-provenance-0').textContent).toBe('unmatched · new')
    expect(screen.getByTestId('term-provenance-1').textContent).toBe('local term · MSP-API-mu50x5z7')
    expect(screen.getByTestId('term-provenance-2').textContent).toBe('ontology term · CHEBI:5001')
    expect(screen.getByTestId('term-provenance-3').textContent).toBe('vendor item · Sigma 322415')
  })

  it('offers the near match for the unmatched term, and confirms the LINK', () => {
    const onConfirm = vi.fn()
    render(<TermPanel terms={terms} defaultOpen onConfirm={onConfirm} />)
    expect(screen.getByTestId('term-suggestions-0').textContent).toContain('F prausnitzii')
    expect(screen.getByTestId('term-suggestions-0').textContent).toContain('FPRAUS')

    fireEvent.click(screen.getByTestId('term-use-existing-0-TERM-fpraus-9z8y'))
    expect(onConfirm).toHaveBeenCalledWith({ label: 'F praus', existingTermId: 'TERM-fpraus-9z8y' })
  })

  it('searches through the injected resolver and confirms a picked mention', async () => {
    const search = vi.fn().mockResolvedValue([suggestion])
    const onConfirm = vi.fn()
    render(<TermPanel terms={terms} defaultOpen onConfirm={onConfirm} search={search} />)

    fireEvent.click(screen.getByTestId('term-search-2'))
    fireEvent.change(screen.getByTestId('term-search-input-2'), { target: { value: 'eth' } })

    await waitFor(() => expect(search).toHaveBeenCalled())
    expect(search.mock.calls[0]![0]).toBe('eth')

    await waitFor(() => expect(screen.getByText('ethanol')).toBeTruthy())
    // SlashSuggestionList commits on MOUSEDOWN (so a mention menu cannot close on
    // blur first) — drive it the way the real menu receives it.
    fireEvent.mouseDown(screen.getByText('ethanol').closest('button')!)
    expect(onConfirm).toHaveBeenCalledWith({ label: 'fenofibrate', mention: suggestion.mention })
  })

  it('clarifies a term, and the clarified sentence is handed back for the redraft', () => {
    const onClarify = vi.fn()
    render(<TermPanel terms={terms} defaultOpen onClarify={onClarify} />)

    fireEvent.click(screen.getByTestId('term-clarify-0'))
    const send = screen.getByTestId('term-clarify-send-0') as HTMLButtonElement
    expect(send.disabled).toBe(true) // no empty clarifications

    fireEvent.change(screen.getByTestId('term-clarify-input-0'), {
      target: { value: 'means F. prausnitzii, the anaerobic gut commensal' },
    })
    expect(send.disabled).toBe(false)
    fireEvent.click(send)
    expect(onClarify).toHaveBeenCalledWith({
      label: 'F praus',
      text: 'means F. prausnitzii, the anaerobic gut commensal',
    })
  })

  it('renders nothing when the draft used no terms', () => {
    const { container } = render(<TermPanel terms={[]} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('TermPanel — labware and equipment kinds, grouped, with kind-scoped search', () => {
  const mixed: DraftTermRow[] = [
    { label: 'clofibrate', source: 'minted', id: 'mint:clofibrate', kind: 'material' },
    { label: 'CL:96_well_plate', source: 'ontology', id: 'CL:96_well_plate', kind: 'labware' },
    { label: 'bath 55', source: 'local-record', id: 'EQP-bath-1', kind: 'equipment' },
  ]

  it('renders kind section headers and keeps every row', () => {
    render(<TermPanel terms={mixed} defaultOpen />)
    expect(screen.getByText('Materials')).toBeTruthy()
    expect(screen.getByText('Labware')).toBeTruthy()
    expect(screen.getByText('Equipment')).toBeTruthy()
    expect(screen.getByText('clofibrate')).toBeTruthy()
    expect(screen.getByText('CL:96_well_plate')).toBeTruthy()
    expect(screen.getByText('bath 55')).toBeTruthy()
  })

  it('dispatches a labware row search to the labware resolver, not the material one', async () => {
    resolveLabware.mockResolvedValue([
      { key: 'lw:1', label: '96 well plate', badge: 'Labware', subtitle: 'record', mention: { type: 'labware', id: 'LBW-plate', label: '96 well plate' } },
    ])
    const onConfirm = vi.fn()
    render(<TermPanel terms={[mixed[1]!]} defaultOpen onConfirm={onConfirm} />)

    fireEvent.click(screen.getByTestId('term-search-0'))
    fireEvent.change(screen.getByTestId('term-search-input-0'), { target: { value: 'plate' } })

    await waitFor(() => expect(resolveLabware).toHaveBeenCalled())
    expect(resolveLabware.mock.calls[0]![0]).toBe('plate')
    // The material resolver was never used for a labware row.
    await waitFor(() => expect(screen.getByText('96 well plate')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('96 well plate').closest('button')!)
    expect(onConfirm).toHaveBeenCalledWith({ label: 'CL:96_well_plate', mention: expect.objectContaining({ type: 'labware' }) })
    resolveLabware.mockReset()
  })

  it('dispatches an equipment row search to the equipment resolver', async () => {
    resolveEquipment.mockResolvedValue([
      { key: 'eq:1', label: 'water bath', badge: 'Equipment', subtitle: 'record', mention: { type: 'equipment', id: 'EQP-wb', label: 'water bath' } },
    ])
    const onConfirm = vi.fn()
    render(<TermPanel terms={[mixed[2]!]} defaultOpen onConfirm={onConfirm} />)

    fireEvent.click(screen.getByTestId('term-search-0'))
    fireEvent.change(screen.getByTestId('term-search-input-0'), { target: { value: 'bath' } })

    await waitFor(() => expect(resolveEquipment).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByText('water bath')).toBeTruthy())
    fireEvent.mouseDown(screen.getByText('water bath').closest('button')!)
    expect(onConfirm).toHaveBeenCalledWith({ label: 'bath 55', mention: expect.objectContaining({ type: 'equipment' }) })
    resolveEquipment.mockReset()
  })
})
