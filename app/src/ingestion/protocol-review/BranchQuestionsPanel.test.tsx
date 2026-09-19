/**
 * BranchQuestionsPanel — the review surface asks the DOCUMENT's questions.
 *
 * Real shape under test: the ZymoBIOMICS 96 kit. The engine derived two axes
 * (the lysis-module branch question gating steps 1+4, and the sample-type
 * table question gating step 1) and enumerated one proposal per answer
 * combination. The panel must resolve the reviewer's answers to the matching
 * realization — and must say "no questions" rather than invent any when no
 * tree is attributable to the artifact.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

// vi.mock is hoisted, so the fns must come from vi.hoisted.
const { getIntakeReviewMock, promptMock, redraftMock } = vi.hoisted(() => ({
  getIntakeReviewMock: vi.fn(),
  promptMock: vi.fn(),
  redraftMock: vi.fn(),
}))
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getIntakeReview: getIntakeReviewMock,
    setIntakeProposalPrompt: promptMock,
    redraftIntakeProposal: redraftMock,
  },
}))

import BranchQuestionsPanel, { type ResolvedReviewBranch } from './BranchQuestionsPanel'

afterEach(() => {
  cleanup()
  getIntakeReviewMock.mockReset()
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
    kind: 'subgraph-proposal',
    recordId: `SGP-test-${branchId}-${sampleId}`,
    documentId: 'vendor-protocol:test',
    treeRef: { kind: 'record', id: 'PDT-test', type: 'protocol-decision-tree' },
    branchPath: [
      { axisId: AXIS_BRANCH.axisId, conditionId: branchId, label: 'x' },
      { axisId: AXIS_SAMPLE.axisId, conditionId: sampleId, label: 'y' },
    ],
    scaleLevel: 'bench_plate_multichannel',
    activeStepIds: ['step-001', 'step-004'],
    eventGraphRef: { kind: 'record', id: 'EVG-test', type: 'event-graph' },
    state: 'proposed',
  }
}

function reviewResponse() {
  return {
    matchVia: 'sha256',
    artifact: { recordId: 'VPDF-TEST', title: 'ZymoBIOMICS 96 MagBead DNA Kit', storedPath: 'x.pdf', sha256: 'abc' },
    tree: {
      recordId: 'PDT-test',
      documentId: 'vendor-protocol:test',
      axisCount: 2,
      scaleLevels: ['manual_tubes', 'bench_plate_multichannel', 'robot_deck'],
      proposalCount: 4,
      axes: [AXIS_BRANCH, AXIS_SAMPLE],
      scaleAxis: { question: 'At what scale?', options: [] },
    },
    proposals: [
      proposalFor('branch-1', 'option-1'),
      proposalFor('branch-1', 'option-2'),
      { ...proposalFor('branch-2', 'option-1'), activeStepIds: ['step-001', 'step-004', 'step-007'] },
      proposalFor('branch-2', 'option-2'),
    ],
  }
}

describe('BranchQuestionsPanel', () => {
  it('renders one question per derived axis and resolves the chosen branch', async () => {
    getIntakeReviewMock.mockResolvedValue(reviewResponse())
    const onResolved = vi.fn()
    render(<BranchQuestionsPanel artifactId="VPDF-TEST" onResolved={onResolved} />)

    await waitFor(() => expect(screen.getByTestId('branch-questions')).toBeTruthy())
    // the document's OWN wording, both axes
    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('Which Sample Type?')
    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('Feces')
    expect(screen.getByTestId('axis-axis-sample-type').textContent).toContain('from a table in the document')
    expect(screen.getByText(/Which lysis module applies\?/)).toBeTruthy()

    // nothing answered yet
    expect(screen.getByTestId('branch-questions-result').textContent).toContain('Answer every question')
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

  it('says the document asks nothing rather than inventing questions (no tree for this artifact)', async () => {
    getIntakeReviewMock.mockResolvedValue(null)
    render(<BranchQuestionsPanel artifactId="VPDF-NOTREE" />)

    await waitFor(() => expect(screen.getByTestId('branch-questions')).toBeTruthy())
    expect(screen.getByTestId('branch-questions').textContent).toContain('states no if/then questions')
    expect(screen.queryByRole('radio')).toBeNull()
  })

  it('reports a load failure instead of showing an empty question set', async () => {
    getIntakeReviewMock.mockRejectedValue(new Error('backend down'))
    render(<BranchQuestionsPanel artifactId="VPDF-TEST" />)

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('backend down'))
  })
})
describe('BranchQuestionsPanel — send a branch back to the AI', () => {
  it('attaches the prompt to the matched proposal, redrafts it, and reloads the review', async () => {
    getIntakeReviewMock.mockResolvedValue(reviewResponse())
    promptMock.mockReset().mockResolvedValue({ recordId: 'SGP-test-branch-1-option-1' })
    redraftMock.mockReset().mockResolvedValue({
      success: true,
      documentId: 'vendor-protocol:test',
      proposalRecordIds: ['SGP-test-branch-1-option-1'],
      eventGraphRecordIds: ['EVG-test'],
    })

    render(<BranchQuestionsPanel artifactId="VPDF-TEST" />)
    await waitFor(() => expect(screen.getByTestId('branch-questions')).toBeTruthy())

    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText(/ZymoBIOMICS BashingBead Lysis Rack/))

    const box = await screen.findByLabelText('Send this branch back to the AI')
    fireEvent.change(await screen.findByPlaceholderText(/the 550 µl volume/), {
      target: { value: 'keep the rack format at 750 µl' },
    })
    fireEvent.click(screen.getByText('Redraft this branch'))

    await waitFor(() => expect(redraftMock).toHaveBeenCalledWith('SGP-test-branch-1-option-1'))
    expect(promptMock).toHaveBeenCalledWith('SGP-test-branch-1-option-1', 'keep the rack format at 750 µl')
    await waitFor(() => expect(screen.getByTestId('redraft-note').textContent).toContain('Redrafted'))
    // the review was reloaded after the redraft (2nd fetch)
    expect(getIntakeReviewMock.mock.calls.length).toBeGreaterThanOrEqual(2)
    void box
  })
})
