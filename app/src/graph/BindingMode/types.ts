/**
 * Types for the BindingMode components.
 */

/**
 * Diagnostic message emitted by a compile pass.
 */
export interface Diagnostic {
  severity: 'info' | 'warning' | 'error'
  code: string
  message: string
  pass_id: string
  details?: Record<string, unknown>
}

/**
 * Status of a compiled run-plan.
 */
export type RunPlanCompileStatus = 'ready' | 'partial' | 'blocked'

/**
 * Shape of the final RunPlanCompileResult returned by the compile API.
 */
export interface RunPlanCompileResult {
  status: RunPlanCompileStatus
  diagnostics: Diagnostic[]
  perStepContexts: unknown[]
  bindings: {
    materialResolutions: Record<string, unknown>
    labwareResolutions: Record<string, unknown>
  }
}
