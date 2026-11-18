/**
 * L2-GC-PEAK-NAMING-1 (u4surface) — CompoundClassPanel (the /registry
 * "Compounds" tab list; GC-BUNDLE r2 gate defect T2-3's consuming surface).
 *
 * Contract pinned (no new policy invented — the labels come ONLY from the
 * ontology lookup the panel calls):
 * - One row per candidate: the registry's declared name + compoundId + the
 *   RESOLVED ontology label (getOntologyTerm, per candidate).
 * - A candidate id that fails lookup (404) renders the literal marker
 *   `unresolved` — never a crash, never a free-text invention.
 * - Every class is listed (all classes of the served registry, in order).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, cleanup, within } from '@testing-library/react'
import { CompoundClassPanel, type CompoundClass } from './CompoundClassPanel'

const CLASSES: CompoundClass[] = [
  {
    id: 'fame-medium-chain',
    name: 'FAME medium chain (6:0-10:0 methyl esters)',
    description: 'Medium-chain methyl fatty acid esters (FAMEs) used as GC-FID standards.',
    candidates: [
      { compoundId: 'FAME-LOCAL:methyl-hexanoate-n6', name: 'Methyl hexanoate (FAME, 6:0-OMe)' },
      { compoundId: 'FAME-LOCAL:does-not-exist', name: 'Ghost candidate (unregistered)' },
    ],
  },
  {
    id: 'other-class',
    name: 'Other class',
    candidates: [{ compoundId: 'OTHER-LOCAL:one', name: 'Other one' }],
  },
]

const TERMS: Record<string, { label: string }> = {
  'FAME-LOCAL:methyl-hexanoate-n6': { label: 'Methyl hexanoate (FAME, 6:0-OMe)' },
  'OTHER-LOCAL:one': { label: 'Other one (ontology label)' },
}

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getOntologyTerm: vi.fn(async (id: string) => {
      const term = TERMS[id]
      if (!term) {
        const err = new Error('404 Not Found: ontology term not found')
        ;(err as { status?: number }).status = 404
        throw err
      }
      return { success: true as const, term: { kind: 'ontology-term', id, source: 'manual', ...term } }
    }),
  },
}))

afterEach(() => {
  cleanup()
})

describe('CompoundClassPanel (L2-GC-PEAK-NAMING-1 u4surface)', () => {
  it('lists every class and each candidate with its compound id', async () => {
    render(<CompoundClassPanel classes={CLASSES} loading={false} />)
    const fame = screen.getByTestId('compound-class-fame-medium-chain')
    expect(fame).toBeTruthy()
    expect(within(fame).getByTestId('compound-class-name').textContent).toBe(
      'FAME medium chain (6:0-10:0 methyl esters)',
    )
    expect(within(screen.getByTestId('compound-class-other-class')).getByTestId('compound-class-name').textContent).toBe(
      'Other class',
    )
    // Every candidate row is present, named by its controlled compoundId.
    const rows = screen.getAllByTestId(/^compound-candidate-/).map((el) => el.dataset.testid)
    expect(rows).toEqual([
      'compound-candidate-FAME-LOCAL:methyl-hexanoate-n6',
      'compound-candidate-FAME-LOCAL:does-not-exist',
      'compound-candidate-OTHER-LOCAL:one',
    ])
  })

  it('shows the resolved ontology label per candidate (never the raw name in the label slot)', async () => {
    render(<CompoundClassPanel classes={CLASSES} loading={false} />)
    const hexanoateRow = screen.getByTestId('compound-candidate-FAME-LOCAL:methyl-hexanoate-n6')
    await waitFor(() => {
      expect(hexanoateRow.textContent).toContain('Methyl hexanoate (FAME, 6:0-OMe)')
    })
    // The label slot itself holds the RESOLVED term (here identical to the
    // declared name by registry data — the row also carries the declared
    // name + compoundId, all three facts visible).
    const label = screen.getAllByTestId('candidate-label')[0]
    await waitFor(() => {
      expect(label.textContent).toBe('Methyl hexanoate (FAME, 6:0-OMe)')
    })
    // A distinct resolved label where the ontology label differs from the
    // registry's declared candidate name.
    const otherLabel = screen.getAllByTestId('candidate-label')[2]
    await waitFor(() => {
      expect(otherLabel.textContent).toBe('Other one (ontology label)')
    })
  })

  it('renders `unresolved` for a candidate id that 404s — no crash, no invention', async () => {
    render(<CompoundClassPanel classes={CLASSES} loading={false} />)
    const ghostRow = screen.getByTestId('compound-candidate-FAME-LOCAL:does-not-exist')
    // The row stays rendered with its declared name + compoundId…
    expect(ghostRow.textContent).toContain('Ghost candidate (unregistered)')
    expect(ghostRow.textContent).toContain('FAME-LOCAL:does-not-exist')
    // …and its label slot settles on the literal marker.
    await waitFor(() => {
      const label = screen.getAllByTestId('candidate-label')[1]
      expect(label.textContent).toBe('unresolved')
    })
    // …and the resolved label is NOT invented from the candidate name.
    expect(screen.getByText('unresolved')).toBeTruthy()
  })

  it('shows the loading state and the empty state without classes', () => {
    const loading = render(<CompoundClassPanel classes={null} loading={true} />)
    expect(loading.getByTestId('compound-panel').textContent).toMatch(/loading/i)
    cleanup()
    const empty = render(<CompoundClassPanel classes={[]} loading={false} />)
    expect(empty.getByTestId('compound-panel').textContent).toMatch(/no compound classes/i)
  })
})
