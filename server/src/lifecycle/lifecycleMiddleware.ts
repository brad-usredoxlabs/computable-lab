import type { LifecycleEngine } from './LifecycleEngine'
import type { LifecycleContext } from './types'

export interface LifecycleCheckInput {
  previousPayload: Record<string, unknown>
  nextPayload: Record<string, unknown>
  actorId: string
}

export interface LifecycleCheckResult {
  allowed: boolean
  error?: string
  transition?: { from: string; to: string; event: string }
}

export function checkLifecycleTransition(
  engine: LifecycleEngine,
  input: LifecycleCheckInput
): LifecycleCheckResult {
  const { previousPayload, nextPayload, actorId } = input

  // If no lifecycleId, not lifecycle-managed - allow
  const lifecycleId = nextPayload.lifecycleId as string | undefined
  if (!lifecycleId) return { allowed: true }

  // Graceful degradation if lifecycle not loaded
  if (!engine.isLoaded(lifecycleId)) return { allowed: true }

  // Determine state field
  const nextState = (nextPayload.state ?? nextPayload.status) as string | undefined
  const previousState = (previousPayload.state ?? previousPayload.status) as string | undefined

  // No state change - allow
  if (previousState === nextState) return { allowed: true }

  // Build lifecycle context
  const recordId = (nextPayload.id ?? nextPayload.recordId) as string | undefined
  const roleAssignments: Record<string, string> = {}
  if (nextPayload.createdBy) roleAssignments.author = String(nextPayload.createdBy)
  if (isRefObject(nextPayload.reviewerRef)) roleAssignments.reviewer = String(nextPayload.reviewerRef.id)
  if (isRefObject(nextPayload.approverRef)) roleAssignments.approver = String(nextPayload.approverRef.id)

  const context: LifecycleContext = {
    recordId: recordId ?? 'unknown',
    currentActorId: actorId,
    roleAssignments,
    fields: nextPayload
  }

  // Get valid transitions and find matching one
  const transitions = engine.getValidTransitions(lifecycleId, previousState || '', context)
  const matching = transitions.find(t => t.targetState === nextState)

  if (!matching) {
    return { allowed: false, error: `Transition from '${previousState || ''}' to '${nextState}' is not allowed by the ${lifecycleId} lifecycle.` }
  }

  if (!matching.allowed) {
    return { allowed: false, error: 'You do not have the required role for this transition.' }
  }

  return { allowed: true, transition: { from: previousState || '', to: nextState || '', event: matching.event } }
}

function isRefObject(val: unknown): val is { id: string } {
  return typeof val === 'object' && val !== null && 'id' in val
}
