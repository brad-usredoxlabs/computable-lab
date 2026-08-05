import { describe, it, expect } from 'vitest'
import { ensureDefaultSteps, isStepDeletable, DEFAULT_MAIN_STEP, type PlannedStep } from './defaultPlannedSteps'

describe('defaultPlannedSteps', () => {
  it('returns the main default step when given an empty list', () => {
    expect(ensureDefaultSteps([])).toEqual([DEFAULT_MAIN_STEP])
  })

  it('returns existing steps unchanged when a method is present', () => {
    const steps: PlannedStep[] = [
      { stepId: 's1', ordinal: 1, label: 'Add', kind: 'add_material' },
      { stepId: 's2', ordinal: 2, label: 'Read', kind: 'read' },
    ]
    expect(ensureDefaultSteps(steps)).toEqual(steps)
  })

  it('does not mutate the input list (returns a fresh main step object)', () => {
    const steps = ensureDefaultSteps([])
    steps[0].label = 'Mutated'
    const again = ensureDefaultSteps([])
    expect(again[0].label).toBe('Main')
  })

  it('never allows deleting the only step or the canonical main step', () => {
    const only: PlannedStep = { stepId: 'main', ordinal: 1, label: 'Main', kind: 'other' }
    expect(isStepDeletable(only, 1)).toBe(false)

    const mainAmongMany: PlannedStep = { stepId: 'main', ordinal: 1, label: 'Main', kind: 'other' }
    expect(isStepDeletable(mainAmongMany, 3)).toBe(false)
  })

  it('allows deleting a non-main step when there is more than one', () => {
    const s2: PlannedStep = { stepId: 's2', ordinal: 2, label: 'Read', kind: 'read' }
    expect(isStepDeletable(s2, 3)).toBe(true)
  })
})
