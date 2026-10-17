/**
 * QMS7-7 — the card's ONE optional presentational block: the compiled
 * recordFields (label/value pairs built server-side from the target schema's
 * ui-v1 projection) render in the review card. Presentational only: the phase
 * vocabulary is unchanged (imported, never re-declared), the block renders
 * ONLY in the review/applied phases (a compiling slot or a blocked compile
 * still shows NO accept control), and the card maps nothing by kind name.
 *
 * RED at base: WorkstateProposalCardProps has no recordFields prop.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkstateProposalCard } from './WorkstateProposalCard'

vi.mock('../../../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => [
    { id: 'registry', label: 'Renamed registry surface', path: '/registry', params: {}, objectTypes: [], selectableKinds: [] },
  ],
  loadSurfaceRegistry: () => Promise.resolve([]),
}))

const noop = () => undefined

const RECORD_FIELDS = [
  { label: 'Title', value: 'Pipetting safety basics' },
  { label: 'Material Type', value: 'Slide Deck' },
  { label: 'Notes', value: 'Dispose tips in the sharps bin.' },
]

describe('WorkstateProposalCard — the recordFields block (QMS7-7)', () => {
  it('a review card with recordFields renders each label with its value (projection vocabulary, verbatim)', () => {
    render(
      <WorkstateProposalCard
        phase="review"
        summary="Proposed training-material draft — review the fields; nothing is written until you accept."
        recordFields={RECORD_FIELDS}
        draftId="DRAFT-77"
        revision={1}
        onAccept={noop}
        onReject={noop}
      />,
    )
    const card = screen.getByTestId('workstate-card')
    for (const field of RECORD_FIELDS) {
      expect(card.textContent).toContain(field.label)
      expect(card.textContent).toContain(field.value)
    }
  })

  it('the block is presentational ONLY: a compiling slot and a blocked compile still render NO accept control, with or without recordFields', () => {
    render(
      <WorkstateProposalCard phase="compiling" recordFields={RECORD_FIELDS} onAccept={noop} onReject={noop} />,
    )
    expect(screen.getByTestId('workstate-card-compiling').textContent).toContain('compiling')
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()

    render(
      <WorkstateProposalCard
        phase="blocked"
        diagnostics={[{ code: 'DRAFT_INVALID', message: 'rejected by the schema/lint gate' }]}
        recordFields={RECORD_FIELDS}
        onAccept={noop}
        onReject={noop}
      />,
    )
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card-reject')).toBeTruthy()
  })

  it('a card WITHOUT recordFields renders exactly as before (the block is optional — workstate/analysis cards unchanged)', () => {
    render(
      <WorkstateProposalCard
        phase="review"
        summary="Open the analysis surface"
        tabs={[{ kind: 'registry' }]}
        draftId="DRAFT-7"
        revision={2}
        onAccept={noop}
        onReject={noop}
      />,
    )
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
    expect(screen.getByTestId('workstate-card').textContent).toContain('Renamed registry surface')
  })

  it('accept/reject still fire exactly once through the same controls when recordFields are present', () => {
    const onAccept = vi.fn()
    const onReject = vi.fn()
    render(
      <WorkstateProposalCard phase="review" recordFields={RECORD_FIELDS} onAccept={onAccept} onReject={onReject} />,
    )
    fireEvent.click(screen.getByTestId('workstate-card-accept'))
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onReject).not.toHaveBeenCalled()
  })
})
