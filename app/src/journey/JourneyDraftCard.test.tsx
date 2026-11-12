/**
 * JourneyDraftCard — L2-JOURNEY-DOC-1 (unit u2ui). Targeted DOM proof:
 *  - the unvalidated marker is PRESENT,
 *  - NO accept/execute control exists — structurally (zero <button> in the
 *    tree), not merely by testid absence,
 *  - an unresolved parameter shows its status and no fabricated value,
 *  - diagnostics render verbatim,
 *  - the fixed section order holds in the DOM.
 * app tests are jsdom by default (vitest.config.ts) — no environment pragma.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { JourneyDraftCard, type JourneyDraftView } from './JourneyDraftCard'

const DIAGNOSTIC_1 =
  'parameters.diluent_volume: unresolved — the compiler must not fabricate a value'
const DIAGNOSTIC_2 =
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
    { id: 'dilute', capabilityRef: 'mix.dilute', interactionMode: 'human_in_the_loop' },
  ],
  alternatives: ['Use a calibrated volumetric flask instead of a graduated cylinder'],
  assumptions: ['The reference standard is homogeneous at this concentration.'],
  unresolvedQuestions: ['Which solvent is approved for this reference standard?'],
}

const diagnostics: readonly string[] = [DIAGNOSTIC_1, DIAGNOSTIC_2]

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
    // Non-actionability is a structural property of the render branch
    // (ChainProposalCard.tsx:241-243): the tree contains NO <button> at all,
    // not a disabled one.
    expect(container.querySelectorAll('button')).toHaveLength(0)
  })

  it('shows the unresolved parameter status and never fabricates its value', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const rowText = screen.getByTestId('journey-draft-parameter-diluent_volume').textContent ?? ''
    expect(rowText).toContain('unresolved')
    expect(rowText).toContain('not yet resolved')
    expect(rowText).not.toContain(RESOLVED_VALUE)
  })

  it('shows the resolved parameter with its value', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const rowText = screen.getByTestId('journey-draft-parameter-salt_amount').textContent ?? ''
    expect(rowText).toContain('resolved')
    expect(rowText).toContain(RESOLVED_VALUE)
  })

  it('renders both diagnostics verbatim', () => {
    render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    const [d1, d2] = screen.getAllByTestId('journey-draft-diagnostic')
    expect(d1.textContent).toBe(DIAGNOSTIC_1)
    expect(d2.textContent).toBe(DIAGNOSTIC_2)
  })

  it('renders every section in the fixed order', () => {
    const { container } = render(<JourneyDraftCard view={draft} diagnostics={diagnostics} />)
    expect([...container.querySelectorAll('h2')].map((h) => h.textContent)).toEqual([
      'Objective',
      'Completion contract',
      'Parameters',
      'Steps',
      'Alternatives',
      'Assumptions',
      'Unresolved questions',
    ])
    expect(container.querySelector('details summary')?.textContent).toContain('Diagnostics')
    // For each section, the number of the other seven that precede it in
    // document order must equal its index.
    const all = [
      'journey-draft-objective',
      'journey-draft-contract',
      'journey-draft-parameters',
      'journey-draft-steps',
      'journey-draft-alternatives',
      'journey-draft-assumptions',
      'journey-draft-questions',
      'journey-draft-diagnostics',
    ].map((id) => screen.getByTestId(id))
    const docOrder = all.map((el) =>
      all.filter((other) => other !== el && (other.compareDocumentPosition(el) & 4) === 4).length,
    )
    expect(docOrder).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  })
})
