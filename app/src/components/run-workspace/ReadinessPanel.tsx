import { useState, useEffect } from 'react'
import { apiClient } from '../../shared/api/client'

interface ReadinessPanelProps { plannedRunId: string | null }

interface ReadinessReport {
  plannedRunId: string
  overallStatus: 'ready' | 'warnings' | 'blocked'
  operator: { personId: string | null; authorization: { status: string; matchingAuthorizations: Array<{ id: string; status: string; expiresAt?: string }>; trainingGaps: Array<{ trainingMaterialId: string; reason: string }> } | null }
  equipment: Array<{ equipmentId: string; name: string; calibration: { status: string; dueAt: string | null; daysSinceLast: number | null } }>
  summary: { totalEquipment: number; calibrationIssues: number; authorizationIssues: number; trainingGaps: number }
}

function getStatusBadgeClass(status: string): string {
  const s = status.toLowerCase()
  if (['ready', 'current', 'authorized', 'ok'].includes(s)) return 'bg-green-100 text-green-800'
  if (['warnings', 'due_soon', 'expired', 'limited_use', 'adjusted'].includes(s)) return 'bg-amber-100 text-amber-800'
  if (['blocked', 'overdue', 'suspended', 'failed'].includes(s)) return 'bg-red-100 text-red-800'
  return 'bg-gray-100 text-gray-800'
}

export function ReadinessPanel({ plannedRunId }: ReadinessPanelProps) {
  const [report, setReport] = useState<ReadinessReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!plannedRunId) { setReport(null); setError(null); return }
    let cancelled = false
    setLoading(true); setError(null)
    apiClient.getReadinessReport(plannedRunId)
      .then(data => { if (!cancelled) { setReport(data); setError(null) } })
      .catch(err => { if (!cancelled) { setError(err.message || 'Failed to fetch readiness report'); setReport(null) } })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [plannedRunId])

  if (!plannedRunId) return <div className="text-gray-500 text-sm">No planned run selected</div>
  if (loading) return <div className="text-gray-500 text-sm">Loading readiness report...</div>
  if (error) return <div className="text-red-600 text-sm">Error: {error}</div>
  if (!report) return <div className="text-gray-500 text-sm">No readiness data available</div>

  const overallBadgeClass = getStatusBadgeClass(report.overallStatus)
  const statusLabel = report.overallStatus === 'ready' ? 'Ready' : report.overallStatus === 'warnings' ? 'Warnings' : 'Blocked'

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Readiness</h3>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${overallBadgeClass}`}>{statusLabel}</span>
      </div>
      <div className="text-sm text-gray-600 mb-4">
        {report.summary.totalEquipment} equipment, {report.summary.calibrationIssues} calibration issues, {report.summary.trainingGaps} training gaps
      </div>
      {report.operator.personId && (
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-medium text-gray-700">Operator: {report.operator.personId}</span>
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(report.operator.authorization?.status || 'unknown')}`}>
              {report.operator.authorization?.status || 'Unknown'}
            </span>
          </div>
          {report.operator.authorization && report.operator.authorization.trainingGaps && report.operator.authorization.trainingGaps.length > 0 && (
            <ul className="ml-4 list-disc text-sm text-amber-700">
              {report.operator.authorization.trainingGaps.map((gap, idx) => <li key={idx}>{gap.trainingMaterialId}: {gap.reason}</li>)}
            </ul>
          )}
        </div>
      )}
      <div>
        <h4 className="font-medium text-gray-700 mb-2">Equipment</h4>
        <ul className="space-y-2">
          {report.equipment.map(eq => (
            <li key={eq.equipmentId} className="text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">{eq.name}</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusBadgeClass(eq.calibration.status)}`}>{eq.calibration.status}</span>
              </div>
              {eq.calibration.dueAt && <div className="text-xs text-gray-500 ml-4">Due: {eq.calibration.dueAt}</div>}
              {eq.calibration.daysSinceLast !== null && <div className="text-xs text-gray-500 ml-4">Last calibrated: {eq.calibration.daysSinceLast} days ago</div>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
