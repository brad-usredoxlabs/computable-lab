/**
 * Guarantee a default single-step protocol for a run that has no attached
 * method/protocol. Per the protocol spec, every run has a single non-deletable
 * step named "main" so Design/Execute are always consistent.
 */

export interface PlannedStep {
  stepId: string
  ordinal: number
  label: string
  kind: string
  description?: string
}

/** The canonical default single step for a run with no method. */
export const DEFAULT_MAIN_STEP: PlannedStep = {
  stepId: 'main',
  ordinal: 1,
  label: 'Main',
  kind: 'other',
  description: 'Single default step',
}

/**
 * Return the given steps unchanged when the run already has a method; otherwise
 * return the single default `main` step so the UI never shows zero steps.
 */
export function ensureDefaultSteps(steps: PlannedStep[]): PlannedStep[] {
  if (steps.length > 0) return steps
  return [{ ...DEFAULT_MAIN_STEP }]
}

/**
 * True when a step must not be deleted: either it is the only step in the
 * list, or it is the canonical `main` default step.
 */
export function isStepDeletable(step: PlannedStep, stepCount: number): boolean {
  if (stepCount <= 1) return false
  if (step.stepId === 'main') return false
  return true
}
