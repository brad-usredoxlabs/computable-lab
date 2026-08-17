/**
 * BranchPicker — component tests (Plan 1, F2).
 * Proves inline branch detection lifts real vendor branch text into option
 * groups, and that clicking toggles selection + enables the Localize action
 * only once every axis is chosen.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BranchPicker, detectInlineBranches, branchAxesFromSteps } from './BranchPicker'

const ZYMO_STEP1 =
  'Add sample to the lysis module using the table: a. If using BashingBead Lysis Rack, add 550 ul. b. If using Lysis Tubes, add 750 ul. Note: Shield optional.'

describe('detectInlineBranches', () => {
  it('lifts mid-line "a. If / b. If" markers into branches', () => {
    const branches = detectInlineBranches(ZYMO_STEP1)
    expect(branches).toHaveLength(2)
    expect(branches[0]).toMatchObject({ id: 'branch-a' })
    expect(branches[1]).toMatchObject({ id: 'branch-b' })
    expect(branches[0].label).toMatch(/BashingBead Lysis Rack/)
  })

  it('returns [] for text with fewer than 2 branches', () => {
    expect(detectInlineBranches('Just one step.')).toEqual([])
    expect(detectInlineBranches(undefined)).toEqual([])
  })
})

describe('branchAxesFromSteps', () => {
  it('creates one axis per branchy step', () => {
    const axes = branchAxesFromSteps([{ stepId: 'step-001', description: ZYMO_STEP1 }])
    expect(axes).toHaveLength(1)
    expect(axes[0].axisId).toBe('branch-step-001')
    expect(axes[0].conditions).toHaveLength(2)
    expect(axes[0].conditions[0].then_stepIds).toEqual(['step-001'])
  })
})

describe('BranchPicker', () => {
  it('renders option groups and toggles selection on click', () => {
    render(<BranchPicker steps={[{ stepId: 'step-001', description: ZYMO_STEP1 }]} />)
    expect(screen.getByTestId('branch-picker')).toBeTruthy()
    const optA = screen.getByTestId('branch-branch-step-001-branch-a')
    expect(optA.getAttribute('data-active')).toBe('false')

    fireEvent.click(optA)
    expect(optA.getAttribute('data-active')).toBe('true')

    fireEvent.click(optA) // toggle off
    expect(optA.getAttribute('data-active')).toBe('false')
  })

  it('enables Localize only once every axis has a selection', () => {
    render(
      <BranchPicker
        steps={[
          { stepId: 'step-001', description: ZYMO_STEP1 },
          { stepId: 'step-004', description: 'Centrifuge: a. If using rack, 4000xg. b. If using tubes, 10000xg.' },
        ]}
        onLocalize={vi.fn()}
      />,
    )
    const localize = screen.getByTestId('branch-localize') as HTMLButtonElement
    expect(localize.disabled).toBe(true)

    fireEvent.click(screen.getByTestId('branch-branch-step-001-branch-a'))
    fireEvent.click(screen.getByTestId('branch-branch-step-004-branch-a'))
    expect(localize.disabled).toBe(false)
  })

  it('renders nothing when no branchy steps exist', () => {
    const { container } = render(<BranchPicker steps={[{ stepId: 's1', description: 'Just mix.' }]} />)
    expect(container.querySelector('[data-testid="branch-picker"]')).toBeNull()
  })
})