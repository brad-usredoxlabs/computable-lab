import type { ReadinessReport } from './ReadinessReportService'
import type { CompilerPolicySettings, PolicyDisposition } from '../policy/types'

export interface ReadinessDiagnostic {
  code: string
  subject: 'equipment' | 'person' | 'training'
  subjectId: string
  severity: 'info' | 'warning' | 'error'
  disposition: 'allowed' | 'needs-confirmation' | 'blocked'
  message: string
  detail?: string
  settingKey: string
}

function mapDisposition(d: PolicyDisposition): { severity: 'info' | 'warning' | 'error'; disposition: 'allowed' | 'needs-confirmation' | 'blocked' } {
  switch (d) {
    case 'allow': return { severity: 'info', disposition: 'allowed' }
    case 'confirm': return { severity: 'warning', disposition: 'needs-confirmation' }
    case 'deny': return { severity: 'error', disposition: 'blocked' }
  }
}

export function generateReadinessDiagnostics(report: ReadinessReport, policy: CompilerPolicySettings): ReadinessDiagnostic[] {
  const diagnostics: ReadinessDiagnostic[] = []

  // Equipment calibration diagnostics
  for (const eq of report.equipment) {
    const cal = eq.calibration
    if (cal.status === 'overdue') {
      const { severity, disposition } = mapDisposition(policy.allowOutOfCalibrationEquipment)
      diagnostics.push({ code: 'CAL_OVERDUE', subject: 'equipment', subjectId: eq.equipmentId, severity, disposition, message: `Equipment "${eq.name}" is ${cal.daysUntilDue} days overdue for calibration`, detail: `Last calibration: ${cal.lastCalibration?.performedAt ?? 'unknown'}`, settingKey: 'allowOutOfCalibrationEquipment' })
    } else if (cal.status === 'due_soon') {
      diagnostics.push({ code: 'CAL_DUE_SOON', subject: 'equipment', subjectId: eq.equipmentId, severity: 'info', disposition: 'allowed', message: `Equipment "${eq.name}" calibration due in ${cal.daysUntilDue} days`, detail: `Due date: ${cal.dueAt}`, settingKey: 'allowOutOfCalibrationEquipment' })
    } else if (cal.status === 'never_calibrated') {
      const { severity, disposition } = mapDisposition(policy.allowOutOfCalibrationEquipment)
      diagnostics.push({ code: 'CAL_NEVER', subject: 'equipment', subjectId: eq.equipmentId, severity, disposition, message: `Equipment "${eq.name}" has never been calibrated`, settingKey: 'allowOutOfCalibrationEquipment' })
    }
  }

  // Authorization diagnostics
  if (report.operator.authorization) {
    const auth = report.operator.authorization
    if (auth.status === 'no_authorization') {
      const { severity, disposition } = mapDisposition(policy.allowExpiredAuthorization)
      diagnostics.push({ code: 'AUTH_NONE', subject: 'person', subjectId: auth.personId, severity, disposition, message: 'Operator has no authorization for this operation', settingKey: 'allowExpiredAuthorization' })
    } else if (auth.status === 'expired') {
      const { severity, disposition } = mapDisposition(policy.allowExpiredAuthorization)
      diagnostics.push({ code: 'AUTH_EXPIRED', subject: 'person', subjectId: auth.personId, severity, disposition, message: 'Operator authorization has expired', settingKey: 'allowExpiredAuthorization' })
    } else if (auth.status === 'suspended') {
      diagnostics.push({ code: 'AUTH_SUSPENDED', subject: 'person', subjectId: auth.personId, severity: 'error', disposition: 'blocked', message: 'Operator authorization is suspended', settingKey: 'allowExpiredAuthorization' })
    }
    // Training gap diagnostics
    for (const gap of auth.trainingGaps) {
      const { severity, disposition } = mapDisposition(policy.allowExpiredTraining)
      diagnostics.push({ code: 'TRAINING_GAP', subject: 'training', subjectId: auth.personId, severity, disposition, message: `Training gap: ${gap.trainingMaterialLabel || gap.trainingMaterialId} - ${gap.reason}`, detail: `Requirement: ${gap.requirementId}`, settingKey: 'allowExpiredTraining' })
    }
  }

  return diagnostics
}
