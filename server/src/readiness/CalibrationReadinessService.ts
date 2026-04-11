export interface CalibrationReadiness {
  equipmentId: string
  status: 'current' | 'due_soon' | 'overdue' | 'never_calibrated' | 'not_required'
  lastCalibration: { id: string; performedAt: string; status: string; performedBy?: string } | null
  dueAt: string | null
  daysSinceLast: number | null
  daysUntilDue: number | null
}

export async function checkCalibration(
  equipmentId: string,
  store: { get: (id: string) => Promise<any>; list: (opts: { kind: string }) => Promise<any[]> }
): Promise<CalibrationReadiness> {
  const equipment = await store.get(equipmentId)
  const readiness = equipment?.payload?.readiness

  if (!readiness || readiness.calibrationRequired === false) {
    return { equipmentId, status: 'not_required', lastCalibration: null, dueAt: null, daysSinceLast: null, daysUntilDue: null }
  }

  const calibrations = (await store.list({ kind: 'calibration-record' })).filter(
    (c) => c.payload?.equipmentRef?.id === equipmentId
  )

  if (calibrations.length === 0) {
    return { equipmentId, status: 'never_calibrated', lastCalibration: null, dueAt: null, daysSinceLast: null, daysUntilDue: null }
  }

  calibrations.sort((a, b) => new Date(b.payload.performedAt).getTime() - new Date(a.payload.performedAt).getTime())
  const latest = calibrations[0].payload
  const performedAt = new Date(latest.performedAt).getTime()
  const now = Date.now()
  const daysSinceLast = Math.floor((now - performedAt) / 86400000)

  if (!latest.dueAt) {
    return {
      equipmentId, status: 'current',
      lastCalibration: { id: calibrations[0].id, performedAt: latest.performedAt, status: latest.status, performedBy: latest.performedBy },
      dueAt: null, daysSinceLast, daysUntilDue: null
    }
  }

  const dueAt = new Date(latest.dueAt).getTime()
  const daysUntilDue = Math.floor((dueAt - now) / 86400000)
  const status: CalibrationReadiness['status'] = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 30 ? 'due_soon' : 'current'

  return {
    equipmentId, status,
    lastCalibration: { id: calibrations[0].id, performedAt: latest.performedAt, status: latest.status, performedBy: latest.performedBy },
    dueAt: latest.dueAt, daysSinceLast, daysUntilDue
  }
}
