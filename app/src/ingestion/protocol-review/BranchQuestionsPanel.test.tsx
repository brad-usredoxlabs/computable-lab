/**
 * BranchQuestionsPanel — the review surface asks the DOCUMENT's questions.
 *
 * Real shape under test: the ZymoBIOMICS 96 kit. The engine derived two axes
 * (the lysis-module branch question gating steps 1+4, and the sample-type table
 * question gating step 1) and enumerated one proposal per answer combination.
 * The panel resolves the reviewer's answers to the matching realization — and
 * says "no questions" (the owner's gap sentence) rather than invent questions.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// vi.mock is hoisted, so the fns must come from vi.hoisted.
const { promptMock, redraftMock } = vi.hoisted(() => ({
  promptMock: vi.fn(),
  redraftMock: vi.fn(),
}))
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    setIntakeProposalPrompt: promptMock,
    redraftIntakeProposal: redraftMock,
  },
}))

import BranchQuestionsPanel, { type ResolvedReviewBranch } from './BranchQuestionsPanel'

afterEach(() => {
  cleanup()
  promptMock.mockReset()
  redraftMock.mockReset()
})

const AXIS_BRANCH = {
  axisId: 'branch-axis-zymobiomics-bashingbead-lysis-rack-zr-bashingbead-lysis-tubes',
  question: 'Which lysis module applies?',
  choiceKey: 'branchSelection',
  origin: 'document_branch',
  conditions: [
    { id: 'branch-1', label: 'ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7)' },
    { id: 'branch-2', label: 'ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)' },
  ],
}

const AXIS_SAMPLE = {
  axisId: 'axis-sample-type',
  question: 'Which Sample Type?',
  choiceKey: 'branchSelection',
  origin: 'document_table',
  conditions: [
    { id: 'option-1', label: 'Feces' },
    { id: 'option-2', label: 'Soil' },
  ],
}

function proposalFor(branchId: string, sampleId: string) {
  return {
    kind: 'subgraph-proposal' as const,
    recordId: `SGP-test-${branchId}-${sampleId}`,
    documentId: 'vendor-protocol:test',
    treeRef: { kind: 'record' as const, id: 'PDT-test', type: 'protocol-decision-tree' as const },
    branchPath: [
      { axisId: AXIS_BRANCH.axisId, conditionId: branchId, label: 'x' },
      { axisId: AXIS_SAMPLE.axisId, conditionId: sampleId, label: 'y' },
    ],
    scaleLevel: 'bench_plate_multichannel' as const,
    activeStepIds: ['step-001', 'step-004'],
    eventGraphRef: { kind: 'record' as const, id: 'EVG-test', type: 'event-graph' as const },
    state: 'proposed' as const,
  }
}

const PROPOSALS = [
  proposalFor('branch-1', 'option-1'),
  proposalFor('branch-1', 'option-2'),
  { ...proposalFor('branch-2', 'option-1'), activeStepIds: ['step-001', 'step-004', 'step-007'] },
  proposalFor('branch-2', 'option-2'),
]

describe('BranchQuestionsPanel', () => {
  it('renders one question per derived axis with the document wording + provenance', () => {
    render(<BranchQuestionsPanel axes={[AXIS_BRANCH, AXIS_SAMPLE]} proposals={PROPOSALS} />)

    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('Which Sample Type?')
    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('Feces')
    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('from a table in the document')
    expect(screen.getByText(/Which lysis module applies\?/)).toBeTruthy()
    expect(screen.getByTestId('branch-questions-result').textContent).toContain('Answer every question')
  })

  it('resolves the chosen answers to the enumerated branch and reports its steps', async () => {
    const onResolved = vi.fn()
    render(<BranchQuestionsPanel axes={[AXIS_BRANCH, AXIS_SAMPLE]} proposals={PROPOSALS} onResolved={onResolved} />)
    expect(onResolved).toHaveBeenLastCalledWith(null)

    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))

    await waitFor(() =>
      expect(screen.getByTestId('branch-questions-result').textContent).toContain('runs 3 steps'),
    )
    expect(screen.getByTestId('branch-questions-result').textContent).toContain('bench plate multichannel')
    const calls = onResolved.mock.calls
    const last = calls[calls.length - 1]?.[0] as ResolvedReviewBranch | null
    expect(last?.proposal?.recordId).toBe('SGP-test-branch-2-option-1')
    expect(last?.activeStepIds).toEqual(['step-001', 'step-004', 'step-007'])
    expect(last?.choices).toEqual({ [AXIS_BRANCH.axisId]: 'branch-2', 'axis-sample-type': 'option-1' })
  })

  it('says the document asks nothing (the owner’s gap sentence) and renders no radios', () => {
    render(<BranchQuestionsPanel axes={[]} proposals={[]} gap="no decision tree is attributable to it yet" />)
    expect(screen.getByTestId('branch-questions').textContent).toContain('no decision tree is attributable')
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('warns instead of guessing when the answers match no enumerated realization', () => {
    render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        // The branch product was capped: (branch-2, option-1) is missing.
        proposals={[proposalFor('branch-1', 'option-1'), proposalFor('branch-1', 'option-2'), proposalFor('branch-2', 'option-2')]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    expect(screen.getByRole('alert').textContent).toContain('the branch product was capped')
  })
})

describe('BranchQuestionsPanel — send a branch back to the AI', () => {
  it('attaches the prompt to the matched proposal, redrafts it, and asks the owner to reload', async () => {
    promptMock.mockResolvedValue({ recordId: 'SGP-test-branch-2-option-1' })
    redraftMock.mockResolvedValue({
      success: true,
      documentId: 'vendor-protocol:test',
      proposalRecordIds: ['SGP-test-branch-2-option-1'],
      eventGraphRecordIds: ['EVG-test'],
    })
    const onRedrafted = vi.fn()

    render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        proposals={PROPOSALS}
        onRedrafted={onRedrafted}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))

    fireEvent.change(screen.getByPlaceholderText(/the 550 µl volume/), {
      target: { value: 'keep the rack format at 750 µl' },
    })
    fireEvent.click(screen.getByText('Redraft this branch'))

    await waitFor(() => expect(redraftMock).toHaveBeenCalledWith('SGP-test-branch-2-option-1'))
    expect(promptMock).toHaveBeenCalledWith('SGP-test-branch-2-option-1', 'keep the rack format at 750 µl')
    await waitFor(() => expect(screen.getByTestId('redraft-note').textContent).toContain('Redrafted'))
    expect(onRedrafted).toHaveBeenCalledTimes(1)
  })

  it('surfaces a redraft failure instead of pretending it worked', async () => {
    promptMock.mockResolvedValue({})
    redraftMock.mockRejectedValue(new Error('compile runner unavailable'))
    render(<BranchQuestionsPanel axes={[AXIS_BRANCH, AXIS_SAMPLE]} proposals={PROPOSALS} />)
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    fireEvent.change(screen.getByPlaceholderText(/the 550 µl volume/), { target: { value: 'x' } })
    fireEvent.click(screen.getByText('Redraft this branch'))
    await waitFor(() => expect(screen.getByTestId('redraft-error').textContent).toContain('compile runner unavailable'))
  })
})