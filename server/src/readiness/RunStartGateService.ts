/**
 * RunStartGateService — controlled-use run-start gate (spec paragraphs 17-20).
 *
 * Pure interpretation layer: it never invents business rules. It runs the
 * declared-disposition diagnostics from ReadinessDiagnosticService against the
 * ACTIVE policy bundle's CompilerPolicySettings and collapses them into a
 * single start decision:
 *
 *   - any 'blocked' finding       → 'deny'   (start is refused outright)
 *   - else any 'needs-confirmation' → 'confirm' (explicit acknowledgement required)
 *   - otherwise                   → 'allow'
 *
 * The caller (POST /runs/:runId/start) maps deny → 403 and confirm → 409 with
 * the missing confirmation codes, so the operator sees exactly which findings
 * must be acknowledged.
 */
import type { ReadinessReport } from './ReadinessReportService.js'
import { generateReadinessDiagnostics, type ReadinessDiagnostic } from './ReadinessDiagnosticService.js'
import type { CompilerPolicySettings } from '../policy/types.js'

export interface RunStartGateDecision {
  decision: 'allow' | 'confirm' | 'deny'
  /** Diagnostics with disposition !== 'allowed'. */
  findings: ReadinessDiagnostic[]
  /** Codes of the needs-confirmation findings. */
  confirmationRequired: string[]
}

export function evaluateRunStartGate(
  report: ReadinessReport,
  policy: CompilerPolicySettings,
): RunStartGateDecision {
  const diagnostics = generateReadinessDiagnostics(report, policy)
  const findings = diagnostics.filter(d => d.disposition !== 'allowed')

  if (findings.some(f => f.disposition === 'blocked')) {
    return { decision: 'deny', findings, confirmationRequired: [] }
  }

  const confirmations = findings.filter(f => f.disposition === 'needs-confirmation')
  if (confirmations.length > 0) {
    return { decision: 'confirm', findings, confirmationRequired: confirmations.map(f => f.code) }
  }

  return { decision: 'allow', findings, confirmationRequired: [] }
}
