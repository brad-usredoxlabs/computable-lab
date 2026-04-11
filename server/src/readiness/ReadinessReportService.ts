import { checkCalibration, type CalibrationReadiness } from './CalibrationReadinessService.js';
import { checkAuthorization, type AuthorizationReadiness } from './AuthorizationReadinessService.js';

export interface ReadinessReport {
  plannedRunId: string
  overallStatus: 'ready' | 'warnings' | 'blocked'
  operator: { personId: string | null; authorization: AuthorizationReadiness | null }
  equipment: Array<{ equipmentId: string; name: string; calibration: CalibrationReadiness }>
  summary: { totalEquipment: number; calibrationIssues: number; authorizationIssues: number; trainingGaps: number }
}

export async function buildReadinessReport(
  plannedRunId: string,
  store: { get: (id: string) => Promise<any>; list: (opts: { kind: string }) => Promise<any[]> }
): Promise<ReadinessReport> {
  const plannedRun = await store.get(plannedRunId)
  if (!plannedRun) throw new Error('Planned run not found')

  const payload = plannedRun.payload
  const bindings = payload.bindings || {}
  const instrumentBindings = bindings.instruments || []
  const equipmentIds: string[] = instrumentBindings.map((b: any) => b.instrumentRef?.id).filter(Boolean)

  // Check labware for equipment refs
  const labwareBindings = bindings.labware || []
  for (const lw of labwareBindings) {
    if (lw.equipmentRef?.id && !equipmentIds.includes(lw.equipmentRef.id)) equipmentIds.push(lw.equipmentRef.id)
  }

  // Check calibration for each equipment
  const equipmentResults = await Promise.all(
    equipmentIds.map(async (equipmentId) => {
      const equipment = await store.get(equipmentId)
      const name = equipment?.payload?.label || equipment?.payload?.name || equipmentId
      const calibration = await checkCalibration(equipmentId, store)
      return { equipmentId, name, calibration }
    })
  )

  // Check authorization if operatorRef is set
  let operatorPersonId: string | null = null
  let operatorAuth: AuthorizationReadiness | null = null
  if (payload.operatorRef?.id) {
    operatorPersonId = payload.operatorRef.id
    operatorAuth = await checkAuthorization(payload.operatorRef.id, { equipmentIds }, store)
  }

  // Compute overall status and summary
  let overallStatus: 'ready' | 'warnings' | 'blocked' = 'ready'
  let calibrationIssues = 0
  let authorizationIssues = 0
  let trainingGaps = 0

  for (const eq of equipmentResults) {
    if (eq.calibration.status === 'overdue') { overallStatus = 'blocked'; calibrationIssues++ }
    else if (eq.calibration.status === 'due_soon' || eq.calibration.status === 'never_calibrated') {
      if (overallStatus !== 'blocked') overallStatus = 'warnings'
      calibrationIssues++
    }
  }

  if (operatorAuth) {
    if (operatorAuth.status === 'no_authorization' || operatorAuth.status === 'suspended') {
      overallStatus = 'blocked'; authorizationIssues++
    } else if (operatorAuth.status === 'expired' || operatorAuth.status === 'training_gap') {
      if (overallStatus !== 'blocked') overallStatus = 'warnings'
      authorizationIssues++; trainingGaps = operatorAuth.trainingGaps.length
    }
  }

  return {
    plannedRunId, overallStatus,
    operator: { personId: operatorPersonId, authorization: operatorAuth },
    equipment: equipmentResults,
    summary: { totalEquipment: equipmentResults.length, calibrationIssues, authorizationIssues, trainingGaps },
  }
}
