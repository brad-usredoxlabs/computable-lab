import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { RefPicker } from './RefPicker'

const mockMintLocalTerm = vi.fn()
const mockResolveResults: { results: unknown[]; loading: boolean } = { results: [], loading: false }

vi.mock('../hooks/useResolveSearch', () => ({
  useResolveSearch: () => mockResolveResults,
}))

vi.mock('../api/client', () => ({
  apiClient: {
    mintLocalTerm: (...a: unknown[]) => mockMintLocalTerm(...a),
  },
}))

describe('RefPicker tier-5 mint affordance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders and selects a "Create local term" row when the spine returns a mint candidate', async () => {
    // A single hit: tier-5 mint candidate (no concrete CURIE, carries { label }).
    mockResolveResults.results = []
    mockResolveResults.results = [
      {
        curie: '',
        label: 'novel-drug-x',
        namespace: 'local',
        tier: 5,
        source: 'mint',
        mint: { label: 'novel-drug-x', domain: 'other' },
      },
    ]

    mockMintLocalTerm.mockResolvedValueOnce({
      success: true,
      recordId: 'MAT-novel-drug-x-abc1',
      label: 'novel-drug-x',
      iri: 'http://localhost:3001/records/MAT-novel-drug-x-abc1',
    })

    const onChange = vi.fn()
    render(<RefPicker value={null} onChange={onChange} minQueryLength={2} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'novel-drug-x' } })
    fireEvent.focus(input)

    // The mint row appears (pinned bottom).
    const mintRow = await screen.findByText(/Create local term/)
    expect(mintRow).toBeTruthy()

    fireEvent.click(mintRow)

    // Selecting it mints server-side and emits the record ref.
    await waitFor(() => {
      expect(mockMintLocalTerm).toHaveBeenCalledWith('material', 'novel-drug-x', 'novel-drug-x')
    })
    expect(onChange).toHaveBeenCalledWith({
      kind: 'record',
      id: 'MAT-novel-drug-x-abc1',
      type: 'material',
      label: 'novel-drug-x',
    })
  })

  it('shows the mint row even when there are no other results (no "No results found")', async () => {
    mockResolveResults.results = [
      {
        curie: '',
        label: 'novel-drug-x',
        namespace: 'local',
        tier: 5,
        source: 'mint',
        mint: { label: 'novel-drug-x' },
      },
    ]

    render(<RefPicker value={null} onChange={vi.fn()} minQueryLength={2} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'novel-drug-x' } })
    fireEvent.focus(input)

    expect(await screen.findByText(/Create local term/)).toBeTruthy()
    expect(screen.queryByText('No results found')).toBeNull()
  })

  it('closes the dropdown without emitting a ref when minting fails', async () => {
    mockResolveResults.results = [
      {
        curie: '',
        label: 'novel-drug-x',
        namespace: 'local',
        tier: 5,
        source: 'mint',
        mint: { label: 'novel-drug-x' },
      },
    ]
    mockMintLocalTerm.mockRejectedValueOnce(new Error('boom'))

    const onChange = vi.fn()
    render(<RefPicker value={null} onChange={onChange} minQueryLength={2} />)

    const input = screen.getByPlaceholderText('Search...')
    fireEvent.change(input, { target: { value: 'novel-drug-x' } })
    fireEvent.focus(input)

    fireEvent.click(await screen.findByText(/Create local term/))

    await waitFor(() => {
      expect(mockMintLocalTerm).toHaveBeenCalledWith('material', 'novel-drug-x', 'novel-drug-x')
    })
    // On failure the picker emits no value (no successful ref).
    expect(onChange).not.toHaveBeenCalled()
    // And it closes the dropdown.
    expect(screen.queryByText(/Create local term/)).toBeNull()
  })
})
