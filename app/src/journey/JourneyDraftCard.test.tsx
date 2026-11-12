/**
 * JourneyDraftCard — RED-first targeted test (L2-JOURNEY-DOC-1, unit u2ui).
 *
 * Proves the item's `verified by` clause against the DOM:
 *  - the unvalidated marker is PRESENT,
 *  - NO accept/execute control exists — structurally (zero <button> in the
 *    tree), not merely by testid absence,
 *  - an unresolved parameter shows its status and no fabricated value,
 *  - diagnostics render verbatim.
 *
 * app tests are jsdom by default (vitest.config.ts) — no environment pragma.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JourneyDraftCard, type JourneyDraftView } from './JourneyDraftCard'

const DIAGONOSTIC_1 =
  'parameters.salt_amount: unresolved — the compiler must not fabricate a value'
const DIAGONOSTIC_2 =
  'step.dilute: capability_ref "mix.dilute" not found in the catalogue'

const RESOLVED_VALUE = '0.5 mg'

const draft: JourneyDraftView = {
  objective: 'Prepare 1 mL of a 1:1000 dilution of the reference standard',
  completionContract: [
    'The diluted sample is staged and its record exists with the dilution factor stated.',
    'The step log records both the weigh and the dilute steps as completed.',
  ],
  parameters: [
    {
      name: 'salt_amount',
      provenance: 'user-supplied',
      status: 'resolved',
      value: RESOLVED_VALUE,
    },
    {
      name: 'diluent_volume',
      provenance: 'ai-proposed',
      status: 'unresolved',
    },
  ],
  steps: [
    { id: 'weigh', capabilityRef: 'balance.weigh', interactionMode: 'automatic' },
    {
      id: 'dilute',
      capabilityRef: 'mix.dilute',
      interactionMode: 'human_in_the_loop',
    },
  ],
  alternatives: ['Use a calibrated volumetric flask instead of a graduated cylinder'],
  assumptions: ['The reference standard is homogeneous at this concentration.'],
  unresolvedQuestions: ['Which solvent is approved for this reference standard?'],
}

const diagnostics: readonly string[] = [DIAGONOSTIC_1, DIAGONOSTIC_2]

describe('JourneyDraftCard', () => {
  it('renders the unvalidated marker in plain words', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const marker = screen.getByTestId('journey-draft-unvalidated')
    expect(marker).toBeInTheDocument()
    const markerText = marker.textContent ?? ''
    expect(markerText).toContain('UNVALIDATED DRAFT')
    expect(markerText.toLowerCase()).toContain('not actionable')
  })

  it('structurally contains no accept/execute control', () => {
    const { container } = render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    expect(screen.queryByTestId('journey-draft-accept')).toBeNull()
    // The card must contain NO <button> at all: non-actionability is a
    // structural property of the render branch (ChainProposalCard.tsx:241-243),
    // not a disabled attribute on a still-present control.
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('shows the unresolved parameter status and never fabricates its value', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const row = screen.getByTestId('journey-draft-parameter-diluent_volume')
    const rowText = row.textContent ?? ''
    expect(rowText).toContain('unresolved')
    // The fixture value belongs to the OTHER (resolved) parameter only.
    expect(rowText).not.toContain(RESOLVED_VALUE)
    // Status, not a guessed value: an explicit not-yet-resolved affordance.
    expect(rowText).toContain('not yet resolved')
  })

  it('shows the resolved parameter with its value', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const row = screen.getByTestId('journey-draft-parameter-salt_amount')
    const rowText = row.textContent ?? ''
    expect(rowText).toContain('resolved')
    expect(rowText).toContain(RESOLVED_VALUE)
  })

  it('renders both diagnostics verbatim', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const [d1, d2] = screen.getAllByTestId('journey-draft-diagnostic')
    expect(d1.textContent).toBe(DIAGONOSTIC_1)
    expect(d2.textContent).toBe(DIAGONOSTIC_2)
  })

  it('renders every section in the fixed order: objective, contract, parameters, steps, alternatives, assumptions, questions, diagnostics', () => {
    const { container } = render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const headings = [...container.querySelectorAll('h2')].map((h) => h.textContent ?? '')
    expect(headings).toEqual([
      'Objective',
      'Completion contract',
      'Parameters',
      'Steps',
      'Alternatives',
      'Assumptions',
      'Unresolved questions',
    ])
    const summary = container.querySelector('details summary')
    expect(summary?.textContent).toContain('Diagnostics')
    // The fixed order is observable in the DOM itself: for each section, the
    // number of the other seven sections that precede it in document order
    // must equal its index.
    const all = [
      screen.getByTestId('journey-draft-objective'),
      screen.getByTestId('journey-draft-contract'),
      screen.getByTestId('journey-draft-parameters'),
      screen.getByTestId('journey-draft-steps'),
      screen.getByTestId('journey-draft-alternatives'),
      screen.getByTestId('journey-draft-assumptions'),
      screen.getByTestId('journey-draft-questions'),
      screen.getByTestId('journey-draft-diagnostics'),
    ]
    const docOrder = all.map((el) => {
      let before = 0
      for (const other of all) {
        if (other !== el && (other.compareDocumentPosition(el) & 4) === 4) before += 1
      }
      return before
    })
    expect(docOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})
