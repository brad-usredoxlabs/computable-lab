/**
 * Resolve the planned-run id:
 *   — if the record kind is 'planned-run', use the runId itself
 *   — otherwise use payload.plannedRunRef.id
 *   — return null when neither applies
 */
import { apiClient } from '../shared/api/client'

export async function resolvePlannedRunId(runId: string): Promise<string | null> {
  const resp = await apiClient.getRecordWithUI(runId)
  const payload = (resp.record?.payload ?? null) as Record<string, unknown> | null
  if (payload?.kind === 'planned-run') return runId
  const ref = payload?.plannedRunRef as { id?: string } | undefined
  if (typeof ref?.id === 'string' && ref.id.length > 0) return ref.id
  return null
}
