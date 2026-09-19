/**
 * Cross-step grouping of branch axes (Phase 3, plan 2026-09-19_121028).
 *
 * Real case driving this (ZymoBIOMICS 96 Kit, document
 * d4303-d4307-d4309): the SAME question — "which BashingBead lysis module?" —
 * is asked in step 1 (how much lysis solution) and step 4 (how to centrifuge):
 *
 *   step 1 a. If using ZymoBIOMICS BathingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7), add 550 µl …
 *   step 1 b. If using ZR BashingBead Lysis Tubes (0.1 & 0.5 mm), add 750 µl …
 *   step 4 a. If using ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm), centrifuge at ≥ 4,000 x g …
 *   step 4 b. If using ZR BashingBead Lysis Tubes (0.1 & 0.5 mm), centrifuge at ≥ 10,000 x g …
 *
 * Per-step axes asked the biologist the same question twice (and produced a
 * 2×2 proposal product). The question is the OPTION SET, not the step: group
 * steps that share one, and gate all of them from a single answer.
 *
 * The condition's identity is the CONDITION PHRASE ("ZymoBIOMICS BashingBead
 * Lysis Rack (0.1 & 0.5 mm, D6002-96-7)"), not the lettered sentence — the
 * sentence stays as the human-readable label.
 */
import { describe, it, expect } from 'vitest'
import { deriveBranchAxes, parseBranchOption } from './deriveBranchAxes.js'

const ZYMO_STEPS = [
  {
    stepNumber: 1,
    branches: [
      'a. If using ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7), add 550 µl ZymoBIOMICS Lysis Solution.',
      'b. If using ZR BashingBead Lysis Tubes (0.1 & 0.5 mm), add 750 µl ZymoBIOMICS Lysis Solution.',
    ],
  },
  { stepNumber: 2 },
  { stepNumber: 3 },
  {
    stepNumber: 4,
    branches: [
      'a. If using ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm), centrifuge at ≥ 4,000 x g for 5 minutes.',
      'b. If using ZR BashingBead Lysis Tubes (0.1 & 0.5 mm), centrifuge at ≥ 10,000 x g for 1 minute.',
    ],
  },
]

describe('parseBranchOption', () => {
  it('drops the lettered marker and the "if using" boilerplate to find the condition', () => {
    const parsed = parseBranchOption(
      'a. If using ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7), add 550 µl Lysis Solution.',
    )
    expect(parsed.subject).toBe('ZymoBIOMICS BashingBead Lysis Rack (0.1 & 0.5 mm, D6002-96-7)')
    expect(parsed.action).toBe('add 550 µl Lysis Solution.')
    expect(parsed.key).toBe('zymobiomics-bashingbead-lysis-rack-0-1-0-5-mm-d6002-96-7')
  })

  it('does not split on a comma inside parentheses', () => {
    const parsed = parseBranchOption('b. If using ZR Rack (0.1 & 0.5 mm), centrifuge at 4,000 x g.')
    expect(parsed.subject).toBe('ZR Rack (0.1 & 0.5 mm)')
    expect(parsed.action).toBe('centrifuge at 4,000 x g.')
  })

  it('keeps the whole text as the condition when there is no action clause', () => {
    expect(parseBranchOption('a. Bacterial DNA').subject).toBe('Bacterial DNA')
    expect(parseBranchOption('Bacterial DNA').key).toBe('bacterial-dna')
  })
})

describe('deriveBranchAxes — cross-step grouping', () => {
  it('groups steps that ask the same question into ONE axis gating all of them', () => {
    const axes = deriveBranchAxes(ZYMO_STEPS)

    expect(axes).toHaveLength(1)
    const axis = axes[0]!
    expect(axis.conditions).toHaveLength(2)
    // both steps are gated by the same answer
    expect(axis.conditions[0]!.then_stepIds).toEqual(['step-001', 'step-004'])
    expect(axis.conditions[1]!.then_stepIds).toEqual(['step-001', 'step-004'])
    // the option identity is the CONCEPT (catalogue number / qualifier stripped):
    // step 1 says "(0.1 & 0.5 mm, D6002-96-7)", step 4 says "(0.1 & 0.5 mm)" —
    // same option, so the same key, so the same axis.
    expect(axis.conditions[0]!.predicate).toEqual({
      op: 'equals',
      path: '$.branchSelection',
      value: 'zymobiomics-bashingbead-lysis-rack',
    })
    expect(axis.conditions[1]!.predicate).toEqual({
      op: 'equals',
      path: '$.branchSelection',
      value: 'zr-bashingbead-lysis-tubes',
    })
    // the full sentence survives as the human-readable label
    expect(axis.conditions[0]!.label).toContain('add 550')
    expect(axis.conditions[0]!.label).toContain('ZymoBIOMICS BashingBead Lysis Rack')
  })

  it('names the grouped question after the shared options, not a step id', () => {
    const axes = deriveBranchAxes(ZYMO_STEPS)
    expect(axes[0]!.axisId).toContain('zymobiomics-bashingbead-lysis-rack')
    expect(axes[0]!.axisId).not.toBe('branch-axis-step-001')
    // the label names every gated step
    expect(axes[0]!.label).toContain('step-001')
    expect(axes[0]!.label).toContain('step-004')
  })

  it('keeps distinct option sets on separate per-step axes (legacy shape preserved)', () => {
    const axes = deriveBranchAxes([
      { stepNumber: 1, branches: ['Bacterial DNA', 'Mammalian cell culture'] },
      { stepNumber: 3, branches: ['500 ul kit version', '100 ul kit version'] },
    ])
    expect(axes.map((a) => a.axisId)).toEqual(['branch-axis-step-001', 'branch-axis-step-003'])
    expect(axes[0]!.conditions[0]!.then_stepIds).toEqual(['step-001'])
  })

  it('keeps a document number that is the ONLY difference between options', () => {
    // Same step, qualifier carries the meaning -> collapse would lose an option.
    const axes = deriveBranchAxes([
      { stepNumber: 7, branches: ['a. 500 µl kit version (D4308)', 'b. 500 µl kit version (D4309)'] },
    ])
    expect(axes).toHaveLength(1)
    expect(axes[0]!.conditions.map((c) => c.predicate.value)).toEqual([
      '500-l-kit-version-d4308',
      '500-l-kit-version-d4309',
    ])
  })

  it('is deterministic (same input, byte-identical axes)', () => {
    const a = deriveBranchAxes(ZYMO_STEPS)
    const b = deriveBranchAxes(ZYMO_STEPS)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})