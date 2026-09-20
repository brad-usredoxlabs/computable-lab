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

  it('offers to build the branch when the answers match no enumerated realization', () => {
    render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        // The branch product was capped: (branch-2, option-1) is missing.
        proposals={[proposalFor('branch-1', 'option-1'), proposalFor('branch-1', 'option-2'), proposalFor('branch-2', 'option-2')]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    expect(screen.getByTestId('branch-questions-unbuilt').textContent).toContain('not pre-built')
  })

  it('asks the owner to build the selected branch, and reports a failure', async () => {
    // The reviewer's combination is outside the enumerated product; the draft
    // happens on demand for that branch only.
    const onBuildBranch = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        proposals={[proposalFor('branch-1', 'option-1')]}
        onBuildBranch={onBuildBranch}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    fireEvent.click(screen.getByTestId('build-branch'))

    await waitFor(() =>
      expect(onBuildBranch).toHaveBeenCalledWith({
        [AXIS_BRANCH.axisId]: 'branch-2',
        'axis-sample-type': 'option-1',
      }),
    )

    // A failed build must say so rather than spin forever.
    const failing = vi.fn().mockRejectedValue(new Error('draft_assemble pass produced no output — mention_resolve: NO_CANDIDATES'))
    rerender(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        proposals={[proposalFor('branch-1', 'option-1')]}
        onBuildBranch={failing}
      />,
    )
    fireEvent.click(screen.getByTestId('build-branch'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('mention_resolve'))
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
describe('BranchQuestionsPanel — why a compile failed', () => {
  it('shows the compile status and the first diagnostic for the matched branch', () => {
    const withCompile = {
      ...proposalFor('branch-2', 'option-1'),
      activeStepIds: ['step-001', 'step-004'],
      compileStatus: 'error' as const,
      compileDiagnostics: [
        { severity: 'error' as const, code: 'EXTRACTION_ERROR', message: 'draft_assemble pass produced no output', passId: 'extract_entities' },
      ],
    }
    render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        proposals={[proposalFor('branch-1', 'option-1'), proposalFor('branch-1', 'option-2'), withCompile, proposalFor('branch-2', 'option-2')]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    const line = screen.getByTestId('branch-questions-compile').textContent ?? ''
    expect(line).toContain('Compile: error')
    expect(line).toContain('EXTRACTION_ERROR: draft_assemble pass produced no output')
  })

  it('says nothing about the compile when it completed', () => {
    const ok = { ...proposalFor('branch-1', 'option-1'), compileStatus: 'complete' as const }
    render(<BranchQuestionsPanel axes={[AXIS_BRANCH, AXIS_SAMPLE]} proposals={[ok, proposalFor('branch-1', 'option-2'), proposalFor('branch-2', 'option-1'), proposalFor('branch-2', 'option-2')]} />)
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7)'))
    expect(screen.queryByTestId('branch-questions-compile')).toBeNull()
  })
})

describe('BranchQuestionsPanel — the compile reason prefers the error', () => {
  it('reports the ERROR even when warnings came first', () => {
    const proposal = {
      ...proposalFor('branch-2', 'option-1'),
      compileStatus: 'error' as const,
      compileDiagnostics: [
        { severity: 'warning' as const, code: 'ungrounded_reference', message: 'Ungrounded reference "mixer"' },
        { severity: 'error' as const, code: 'EXTRACTION_ERROR', message: 'draft_assemble pass produced no output', passId: 'extract_entities' },
      ],
    }
    render(
      <BranchQuestionsPanel
        axes={[AXIS_BRANCH, AXIS_SAMPLE]}
        proposals={[proposalFor('branch-1', 'option-1'), proposalFor('branch-1', 'option-2'), proposal, proposalFor('branch-2', 'option-2')]}
      />,
    )
    fireEvent.click(screen.getByLabelText('Feces'))
    fireEvent.click(screen.getByLabelText('ZR BashingBead Lysis Tubes (0.1 & 0.5 mm)'))
    expect(screen.getByTestId('branch-questions-compile').textContent).toContain('EXTRACTION_ERROR')
  })
})

describe('BranchQuestionsPanel — a nested question waits for its protocol', () => {
  // The DNeasy handbook, as the reviewer saw it: ONE protocol question (whose
  // options are the matrix "sample type × method") and the step-1 variant
  // question repeated inside two of those protocols. Asked side by side the two
  // variants read as duplicates that miss the point; each belongs to its own
  // protocol.
  const SPIN = 'section-purification-of-total-dna-from-animal-blood-or-cells-spin-column-protocol'
  const NINETY_SIX = 'section-purification-of-total-dna-from-animal-blood-or-cells-dneasy-96-protocol'

  const PROTOCOL_AXIS = {
    axisId: 'axis-protocol-choice',
    question: 'Which protocol applies?',
    choiceKey: 'branchSelection',
    origin: 'document_section',
    conditions: [
      { id: SPIN, label: 'Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)' },
      { id: 'section-purification-of-total-dna-from-animal-tissues-spin-column-protocol', label: 'Purification of Total DNA from Animal Tissues (Spin-Column Protocol)' },
      { id: NINETY_SIX, label: 'Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)' },
      { id: 'section-purification-of-total-dna-from-animal-tissues-dneasy-96-protocol', label: 'Purification of Total DNA from Animal Tissues (DNeasy 96 Protocol)' },
      { id: 'section-pretreatment-for-paraffin-embedded-tissue', label: 'Pretreatment for Paraffin-Embedded Tissue' },
      { id: 'section-pretreatment-for-formalin-fixed-tissue', label: 'Pretreatment for Formalin-Fixed Tissue' },
    ],
  }
  const SPIN_VARIANT = {
    axisId: 'axis-step-1-variant',
    question: `Which variant applies for step 1 in Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)?`,
    choiceKey: 'branchSelection',
    origin: 'document_branch',
    sectionId: SPIN,
    conditions: [
      { id: 'non-nucleated', label: 'blood with non-nucleated erythrocytes' },
      { id: 'nucleated', label: 'blood with nucleated erythrocytes' },
    ],
  }
  const NINETY_SIX_VARIANT = {
    axisId: 'axis-step-20-variant',
    question: `Which variant applies for step 1 in Purification of Total DNA from Animal Blood or Cells (DNeasy 96 Protocol)?`,
    choiceKey: 'branchSelection',
    origin: 'document_branch',
    sectionId: NINETY_SIX,
    conditions: [
      { id: 'non-nucleated', label: 'blood with non-nucleated erythrocytes' },
      { id: 'nucleated', label: 'blood with nucleated erythrocytes' },
    ],
  }

  const ALL_AXES = [PROTOCOL_AXIS, SPIN_VARIANT, NINETY_SIX_VARIANT]

  function chooseProtocol(conditionId: string) {
    const radio = [...document.querySelectorAll('input[type=radio]')].find(
      (el) => el.getAttribute('name') === 'axis-protocol-choice' && el.getAttribute('value') === conditionId,
    )
    expect(radio).toBeTruthy()
    fireEvent.click(radio!)
  }

  it('asks ONE question at first: the protocol choice', () => {
    render(<BranchQuestionsPanel axes={ALL_AXES} proposals={[]} />)

    expect(screen.getByTestId('axis-axis-protocol-choice')).toBeTruthy()
    expect(screen.queryByTestId('axis-axis-step-1-variant')).toBeNull()
    expect(screen.queryByTestId('axis-axis-step-20-variant')).toBeNull()
    expect(screen.getByTestId('branch-questions').textContent).toContain('1 question')
  })

  it('shows the chosen protocol’s variant question — and never the other one', () => {
    render(<BranchQuestionsPanel axes={ALL_AXES} proposals={[]} />)

    chooseProtocol(SPIN)

    expect(screen.getByTestId('axis-axis-step-1-variant')).toBeTruthy()
    expect(screen.queryByTestId('axis-axis-step-20-variant')).toBeNull()

    chooseProtocol(NINETY_SIX)

    expect(screen.queryByTestId('axis-axis-step-1-variant')).toBeNull()
    expect(screen.getByTestId('axis-axis-step-20-variant')).toBeTruthy()
  })

  it('reads the protocol options as the matrix they are', () => {
    render(<BranchQuestionsPanel axes={ALL_AXES} proposals={[]} />)

    // The shared boilerplate goes; what is left is sample type × method, and
    // each pretreatment named for what it is for.
    expect(screen.getByText('Blood or Cells (Spin-Column Protocol)')).toBeTruthy()
    expect(screen.getByText('Tissues (Spin-Column Protocol)')).toBeTruthy()
    expect(screen.getByText('Blood or Cells (DNeasy 96 Protocol)')).toBeTruthy()
    expect(screen.getByText('Tissues (DNeasy 96 Protocol)')).toBeTruthy()
    expect(screen.getByText('Paraffin-Embedded Tissue')).toBeTruthy()
    // The full name is still there on hover — display only.
    expect(screen.getByTitle('Purification of Total DNA from Animal Blood or Cells (Spin-Column Protocol)')).toBeTruthy()
  })
})
