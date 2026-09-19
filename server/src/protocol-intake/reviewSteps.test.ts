/**
 * The review surface's step rows must come from the SAME extraction the tree
 * gates on, and each row must say which questions gate it. Real fixture: the
 * ZymoBIOMICS 96 kit, where step-001 is gated by BOTH the lysis-format question
 * and the sample-type question, and step-004 only by the lysis-format one.
 */
import { describe, expect, it } from 'vitest'
import { reviewRolesFromCandidate, reviewStepsFromCandidate } from './reviewSteps.js'

const AXES = [
  {
    axisId: 'branch-axis-zymobiomics-bashingbead-lysis-rack-zr-bashingbead-lysis-tubes',
    question: 'Which branch applies: rack / tubes?',
    conditions: [
      { id: 'branch-1', then_stepIds: ['step-001', 'step-004'] },
      { id: 'branch-2', then_stepIds: ['step-001', 'step-004'] },
    ],
  },
  {
    axisId: 'axis-sample-type',
    question: 'Which Sample Type?',
    conditions: [
      { id: 'option-1', then_stepIds: ['step-001'] },
      { id: 'option-2', then_stepIds: ['step-001'] },
    ],
  },
]

const STEPS = [
  {
    id: 'step-001',
    stepNumber: 1,
    sourceText: 'Add sample to the BashingBead™ Lysis Module using the table below:',
    branches: ['a. If using ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7), add 550 µl.'],
    provenance: { documentId: 'd', pageStart: 2, sectionId: 'protocol' },
  },
  { id: 'step-002', stepNumber: 2, sourceText: 'Secure the tubes in the rack and attach to the bead beater.', provenance: { pageStart: 2 } },
  { id: 'step-004', stepNumber: 4, sourceText: 'Centrifuge at ≥ 4,000 x g for 5 minutes.', provenance: { pageStart: 3, pageEnd: 3 } },
]

describe('reviewStepsFromCandidate', () => {
  it('keeps the candidate step ids and reports every gating question per step', () => {
    const rows = reviewStepsFromCandidate({ steps: STEPS, axes: AXES })
    expect(rows.map((r) => r.stepId)).toEqual(['step-001', 'step-002', 'step-004'])

    // step 1 is gated by BOTH questions; the order follows the tree.
    expect(rows[0]!.gatedByQuestions).toEqual(['Which branch applies: rack / tubes?', 'Which Sample Type?'])
    expect(rows[0]!.gatedByAxisIds).toEqual([AXES[0]!.axisId, 'axis-sample-type'])
    // step 4 is gated by the lysis question only
    expect(rows[2]!.gatedByQuestions).toEqual(['Which branch applies: rack / tubes?'])
    // step 2 is unconditional
    expect(rows[1]!.gatedByAxisIds).toEqual([])
  })

  it('carries the step text, the document branches, and page provenance', () => {
    const rows = reviewStepsFromCandidate({ steps: STEPS, axes: AXES })
    expect(rows[0]!.description).toContain('using the table below')
    expect(rows[0]!.label).toBe('Add sample to the BashingBead™ Lysis Module using the table below:')
    expect(rows[0]!.branches).toHaveLength(1)
    expect(rows[0]!.provenancePages).toEqual([2])
    expect(rows[0]!.provenanceSectionId).toBe('protocol')
    expect(rows[2]!.provenancePages).toEqual([3])
  })

  it('numbers rows in DOCUMENT order, even when the manual restarts its numbering', () => {
    // ZymoBIOMICS Quick-DNA: a main list, then a second list numbered from 1.
    // The rows must read 13, 14 (position), not 1, 2 twice.
    const rows = reviewStepsFromCandidate({
      steps: [
        { id: 'step-12', stepNumber: 12, sourceText: 'Twelfth' },
        { id: 'step-13', stepNumber: 1, sourceText: 'For samples collected in DNA/RNA Shield…' },
        { id: 'step-14', stepNumber: 2, sourceText: 'Continue from Step 2 of the main protocol.' },
      ],
    })
    expect(rows.map((r) => r.ordinal)).toEqual([12, 13, 14])
    expect(rows.map((r) => r.stepId)).toEqual(['step-12', 'step-13', 'step-14'])
  })

  it('falls back to stepNumber, then position, when the id carries no number', () => {
    const rows = reviewStepsFromCandidate({ steps: [{ sourceText: 'First' }, { stepNumber: 9, sourceText: 'Ninth' }] })
    expect(rows.map((r) => r.ordinal)).toEqual([1, 9])
    expect(rows.map((r) => r.stepId)).toEqual(['step-001', 'step-002'])
  })

  it('caps a long first line into a readable label without losing the text', () => {
    const long = 'A'.repeat(200)
    const rows = reviewStepsFromCandidate({ steps: [{ id: 'step-001', sourceText: long }] })
    expect(rows[0]!.label.length).toBeLessThanOrEqual(80)
    expect(rows[0]!.label.endsWith('…')).toBe(true)
    expect(rows[0]!.description).toBe(long)
  })

  it('is deterministic and tolerates malformed input', () => {
    expect(reviewStepsFromCandidate({ steps: STEPS, axes: AXES })).toEqual(
      reviewStepsFromCandidate({ steps: STEPS, axes: AXES }),
    )
    expect(reviewStepsFromCandidate({})).toEqual([])
    expect(reviewStepsFromCandidate({ steps: [null, 42, { id: 'step-001' }] as unknown })).toEqual([
      {
        stepId: 'step-001',
        ordinal: 1,
        label: 'step-001',
        description: '',
        gatedByAxisIds: [],
        gatedByQuestions: [],
        branches: [],
        provenancePages: [],
      },
    ])
  })
})

describe('reviewRolesFromCandidate', () => {
  it('collects distinct role labels per role kind', () => {
    const roles = reviewRolesFromCandidate({
      materials: [{ label: 'ZymoBIOMICS Lysis Solution' }, { label: 'ZymoBIOMICS Lysis Solution' }, { label: 'Feces' }],
      labware: [{ label: 'BashingBead Lysis Rack' }],
      equipment: 'not-an-array',
    })
    expect(roles.materials).toEqual(['ZymoBIOMICS Lysis Solution', 'Feces'])
    expect(roles.labware).toEqual(['BashingBead Lysis Rack'])
    expect(roles.equipment).toEqual([])
  })
})