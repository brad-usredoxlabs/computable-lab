/**
 * Phase 3b — the document's own sample table becomes an answerable question.
 *
 * Ground truth: ZymoBIOMICS 96 kit PDF (d4303/d4307/d4309) states the sample
 * choices in a table ("Sample type maximum input": Feces, Soil, Liquid samples
 * and swab collections, Cells suspended in PBS, Samples in DNA/RNA Shield) and
 * step 1 points at it: "Add sample to the BashingBead™ Lysis Module using the
 * table below:". That is a QUESTION the reviewer must answer — the same kind
 * of question the lettered a./b. branches carry.
 */
import { describe, expect, it } from 'vitest'
import { deriveSampleSourceAxis } from './deriveDocumentTableAxis.js'

const SAMPLE_TABLE = {
  id: 'table-sample-input',
  title: 'Sample type maximum input',
  headers: ['Sample Type', 'Maximum Input'],
  rows: [
    { 'Sample Type': 'Feces', 'Maximum Input': '100 mg' },
    { 'Sample Type': 'Soil', 'Maximum Input': '100 mg' },
    { 'Sample Type': 'Liquid samples and swab collections', 'Maximum Input': '250 ul' },
    { 'Sample Type': 'Cells suspended in PBS', 'Maximum Input': '5-20 mg wet weight' },
    { 'Sample Type': 'Samples in DNA/RNA Shield', 'Maximum Input': '<= 800 ul' },
  ],
  sourceText: 'Sample type maximum input\nSample Type\tMaximum Input',
  provenance: { page: 2 },
}

const STEPS = [
  {
    stepId: 'step-001',
    stepNumber: 1,
    sourceText: 'Add sample to the BashingBead\u2122 Lysis Module using the table below:',
  },
  { stepId: 'step-002', stepNumber: 2, sourceText: 'Secure the tubes in the rack and attach to the bead beater.' },
]

describe('deriveSampleSourceAxis', () => {
  it('turns the sample table into an axis whose options gate the step that points at it', () => {
    const { axis } = deriveSampleSourceAxis({ tables: [SAMPLE_TABLE], steps: STEPS })

    expect(axis).not.toBeNull()
    expect(axis!.axisId).toBe('axis-sample-type')
    expect(axis!.question).toBe('Which Sample Type?')
    expect(axis!.origin).toBe('document_table')
    expect(axis!.choiceKey).toBe('branchSelection')
    expect(axis!.conditions.map((c) => c.label)).toEqual([
      'Feces',
      'Soil',
      'Liquid samples and swab collections',
      'Cells suspended in PBS',
      'Samples in DNA/RNA Shield',
    ])
    expect(axis!.conditions.map((c) => c.predicate.value)).toEqual([
      'feces',
      'soil',
      'liquid-samples-and-swab-collections',
      'cells-suspended-in-pbs',
      'samples-in-dna-rna-shield',
    ])
    // every option answers the same question and gates the same step
    expect(axis!.conditions.every((c) => c.then_stepIds.join() === 'step-001')).toBe(true)
    expect(axis!.conditions[0]!.predicate.path).toBe('$.branchSelection')
    // the axis carries the document evidence it came from
    expect(axis!.evidence[0]!.quote).toContain('Sample Type')
    expect(axis!.evidence[0]!.page).toBe(2)
    expect(axis!.evidence[0]!.stepNumber).toBe(1)
  })

  it('gates a step that names an option even without a "table below" phrase', () => {
    const { axis } = deriveSampleSourceAxis({
      tables: [SAMPLE_TABLE],
      steps: [{ stepId: 'step-007', stepNumber: 7, sourceText: 'For soil and feces samples, homogenize for 10 minutes.' }],
    })
    expect(axis!.conditions[0]!.then_stepIds).toEqual(['step-007'])
  })

  it('refuses when the document has no sample table', () => {
    const res = deriveSampleSourceAxis({
      tables: [{ id: 'table-product-contents', title: 'Product contents', headers: ['Component'], rows: [{ Component: 'Lysis Solution' }] }],
      steps: STEPS,
    })
    expect(res.axis).toBeNull()
    expect(res.reason).toBe('no_sample_table')
  })

  it('refuses when NO step points at the table (never an unanswerable question)', () => {
    const res = deriveSampleSourceAxis({
      tables: [SAMPLE_TABLE],
      steps: [{ stepId: 'step-004', stepNumber: 4, sourceText: 'Centrifuge at 10,000 x g for 1 minute.' }],
    })
    expect(res.axis).toBeNull()
    expect(res.reason).toBe('no_step_references_table')
  })

  it('refuses a single-option "table" and a numeric column', () => {
    expect(
      deriveSampleSourceAxis({
        tables: [{ title: 'Sample type input', headers: ['Sample Type'], rows: [{ 'Sample Type': 'Feces' }] }],
        steps: STEPS,
      }).reason,
    ).toBe('table_too_small')
    expect(
      deriveSampleSourceAxis({
        tables: [{ title: 'Sample type input', headers: ['Sample Type'], rows: [{ 'Sample Type': '100' }, { 'Sample Type': '200' }] }],
        steps: STEPS,
      }).reason,
    ).toBe('option_column_not_categorical')
  })

  it('dedupes repeated options and is deterministic', () => {
    const table = { ...SAMPLE_TABLE, rows: [...SAMPLE_TABLE.rows, { 'Sample Type': 'Feces', 'Maximum Input': '100 mg' }] }
    const a = deriveSampleSourceAxis({ tables: [table], steps: STEPS })
    const b = deriveSampleSourceAxis({ tables: [table], steps: STEPS })
    expect(a.axis!.conditions).toHaveLength(5)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})