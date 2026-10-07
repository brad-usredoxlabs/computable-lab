/**
 * PB-CH-4 — the proposal card: actionable ONLY from a canAccept:true compile
 * response. A compiling slot or a blocked compile renders NO accept control;
 * tab labels come from the registry (RENAMED fixture ids — registry is data,
 * no surface-name literals in the card); applied state drops the controls.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { WorkstateProposalCard } from './WorkstateProposalCard'

// Registry seam mocked with RENAMED ids (useWorkstateExecutor.test.tsx
// precedent): the card must read labels from the registry, never hardcode.
const REGISTRY = [
  { id: 'surface-run', label: 'Renamed run surface', path: '/runs/:runId', params: { runId: 'run' }, objectTypes: ['run'], selectableKinds: [] },
  { id: 'record-edit', label: 'Renamed record surface', path: '/records/:recordId', params: { recordId: 'record' }, objectTypes: ['record-edit'], selectableKinds: [] },
]
vi.mock('../../../shared/surfaces/registry', () => ({
  useSurfaceRegistry: () => REGISTRY,
  loadSurfaceRegistry: () => Promise.resolve(REGISTRY),
}))

const noop = () => undefined

describe('WorkstateProposalCard (PB-CH-4)', () => {
  it('the compiling slot shows prompt progress and NO accept/reject control', () => {
    render(
      <WorkstateProposalCard phase="compiling" onAccept={noop} onReject={noop} />,
    )
    expect(screen.getByTestId('workstate-card-compiling')).toBeTruthy()
    expect(screen.getByTestId('workstate-card-compiling').textContent).toContain('compiling')
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.queryByTestId('workstate-card-reject')).toBeNull()
  })

  it('a review card (canAccept:true) offers Accept + Reject, names the proposed tabs via registry labels, and shows the resolution receipts', () => {
    render(
      <WorkstateProposalCard
        phase="review"
        summary="Open the ROS run and its protocol"
        tabs={[
          { kind: 'run', title: 'ROS run' },
          { kind: 'record-edit' },
        ]}
        resolvedTerms={[{ term: 'ROS run', label: 'ROS run' }]}
        draftId="DRAFT-7"
        revision={2}
        onAccept={noop}
        onReject={noop}
      />,
    )
    expect(screen.getByTestId('workstate-card-accept')).toBeTruthy()
    expect(screen.getByTestId('workstate-card-reject')).toBeTruthy()
    expect(screen.getByTestId('workstate-card').textContent).toContain('Open the ROS run and its protocol')
    // Title wins when the compile carried one…
    expect(screen.getByTestId('workstate-card').textContent).toContain('ROS run')
    // …otherwise the registry label renders (no surface-name literal in TS).
    expect(screen.getByTestId('workstate-card').textContent).toContain('Renamed record surface')
    // Resolution receipts + draft identity small-print.
    expect(screen.getByTestId('workstate-card').textContent).toContain('1 term resolved')
    expect(screen.getByTestId('workstate-card').textContent).toContain('DRAFT-7')
    expect(screen.getByTestId('workstate-card').textContent).toContain('revision 2')
  })

  it('a blocked compile (canAccept:false) renders summary + diagnostics beside the review and NO accept control', () => {
    render(
      <WorkstateProposalCard
        phase="blocked"
        summary="Open the ROS run"
        diagnostics={[
          { code: 'DRAFT_INVALID', message: 'tabs.0: term "bogus thing" resolves to nothing in this lab' },
        ]}
        draftId="DRAFT-7"
        revision={1}
        onAccept={noop}
        onReject={noop}
      />,
    )
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.getByTestId('workstate-card-reject')).toBeTruthy()
    expect(screen.getByTestId('workstate-card').textContent).toContain('resolves to nothing in this lab')
    expect(screen.getByTestId('workstate-card').textContent).toContain('Open the ROS run')
  })

  it('the applied state is spent: controls disappear (no dead buttons)', () => {
    render(
      <WorkstateProposalCard phase="applied" summary="Open the ROS run" onAccept={noop} onReject={noop} />,
    )
    expect(screen.queryByTestId('workstate-card-accept')).toBeNull()
    expect(screen.queryByTestId('workstate-card-reject')).toBeNull()
    expect(screen.getByTestId('workstate-card').textContent).toContain('Applied')
  })

  it('Accept and Reject are distinct, keyboard-operable native buttons', () => {
    const onAccept = vi.fn()
    const onReject = vi.fn()
    render(
      <WorkstateProposalCard phase="review" tabs={[]} onAccept={onAccept} onReject={onReject} />,
    )
    const accept = screen.getByTestId('workstate-card-accept')
    const reject = screen.getByTestId('workstate-card-reject')
    expect(accept.tagName).toBe('BUTTON')
    expect(reject.tagName).toBe('BUTTON')
    expect(accept.getAttribute('type')).toBe('button')
    fireEvent.click(accept)
    fireEvent.click(reject)
    expect(onAccept).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(1)
  })
})
