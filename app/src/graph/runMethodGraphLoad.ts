/**
 * Run-method plan-graph load decision (g3d4dangling, L2-SUBPROTOCOL-EXPAND-1).
 *
 * A run whose methodEventGraphId names a missing record must open the planning
 * editor in its no-method state with a named notice, instead of a fatal
 * "Failed to load" splash. This module is the decision only: it classifies the
 * load result, rethrows every genuine failure, and never touches the record.
 */
import { ApiError } from '../shared/api/errors'

export type RunMethodGraphOutcome =
  | { kind: 'no-method' }
  | { kind: 'loaded'; graphId: string }
  | { kind: 'missing'; graphId: string }

export function isMissingGraphError(err: unknown): boolean {
  if (ApiError.isApiError(err)) {
    return err.status === 404 || err.code === 'NOT_FOUND' || err.code === 'RECORD_NOT_FOUND'
  }
  return err instanceof Error && /NOT_FOUND|not found/i.test(err.message)
}

export async function resolveRunMethodGraph(
  method: { hasMethod: boolean; methodEventGraphId?: string | null },
  load: (graphId: string) => Promise<void>,
): Promise<RunMethodGraphOutcome> {
  if (!method.hasMethod || !method.methodEventGraphId) {
    return { kind: 'no-method' }
  }
  const graphId = method.methodEventGraphId
  try {
    await load(graphId)
    return { kind: 'loaded', graphId }
  } catch (err) {
    if (isMissingGraphError(err)) return { kind: 'missing', graphId }
    throw err
  }
}

export function runMethodGraphMissingNotice(graphId: string): string {
  return `Run references plan graph ${graphId}, which does not exist — build the plan graph to create it.`
}
