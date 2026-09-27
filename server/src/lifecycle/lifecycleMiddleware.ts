import type { LifecycleEngine } from './LifecycleEngine'
import type { LifecycleContext } from './types'

export interface LifecycleCheckInput {
  previousPayload: Record<string, unknown>
  nextPayload: Record<string, unknown>
  actorId: string
  actorRoles: string[]
  enforceTransitionRoles: boolean
  presentedSignatures?: Array<{
    id: string
    action: string
    subjectRecordId: string
    signedBy: string
  }>
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
  const { previousPayload, nextPayload, actorId, actorRoles, enforceTransitionRoles } = input

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
  const roleAssignments = extractRoleAssignments(nextPayload)

  const context: LifecycleContext = {
    recordId: recordId ?? 'unknown',
    currentActorId: actorId,
    roleAssignments,
    actorRoles,
    enforceTransitionRoles,
    fields: nextPayload,
    presentedSignatures: input.presentedSignatures ?? []
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

/**
 * Generic roleAssignments extraction: any payload key '<role>Ref' whose value
 * is an object with a string .id maps to roleAssignments[<snake_case role>]
 * (e.g. qualityManagerRef → 'quality_manager', stewardRef → 'steward').
 * Legacy compatibility: createdBy → author (reviewerRef/approverRef are
 * already covered by the generic rule).
 */
export function extractRoleAssignments(payload: Record<string, unknown>): Record<string, string> {
  const roleAssignments: Record<string, string> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (!key.endsWith('Ref')) continue
    const role = key.slice(0, -'Ref'.length)
    if (!role) continue
    if (isRefObject(value) && typeof value.id === 'string') {
      roleAssignments[camelToSnake(role)] = value.id
    }
  }
  // Legacy: createdBy is a bare person id, not a ref object.
  if (payload.createdBy) roleAssignments.author = String(payload.createdBy)
  return roleAssignments
}

function camelToSnake(value: string): string {
  return value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase()
}

function isRefObject(val: unknown): val is { id: string } {
  return typeof val === 'object' && val !== null && 'id' in val
}
