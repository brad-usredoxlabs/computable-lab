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

  // Determine state field. QMS8-C (BRAD-A1, full clean break): the lifecycle
  // `state` is the ONLY lifecycle state source. The domain `status` field is a
  // domain fact and is never consulted here — reading it let a domain word
  // ('active', 'contractor', 'completed') silently pose as a lifecycle state.
  const nextState = nextPayload.state as string | undefined
  const previousState = previousPayload.state as string | undefined

  // A payload that declares no lifecycle state on EITHER side proposes no state
  // change, so there is no transition to gate: it is a content edit, not a
  // lifecycle move. (Pre-QMS8-C this slot was filled from `status`, which is
  // exactly how a domain status invented a transition that nobody asked for.)
  //
  // QMS8-C adv-cycle1 ruling (reviewer option (i), narrowed): the early-allow
  // fires ONLY when BOTH previousState and nextState are absent. A governed
  // update whose previous payload CARRIED a state and whose next payload OMITS
  // it is a state ERASURE — and because the handler REPLACES the payload on
  // PUT (RecordHandlers.ts:1223 builds the stored payload from
  // request.body.payload), omitting `state` DELETES the stored state. Lifecycle
  // state is the single truth: losing it is a lifecycle change and state
  // changes only via a declared transition — never silently. The base refused
  // exactly this shape (via the fallback-derived transition error); re-allowing
  // it was the fail-open A1-4 names: a governed record without a state has
  // nothing for the gate to read, and it then skips the archive guard
  // (RecordHandlers.ts:289-291) and the admissibility terminal check
  // (OperationalAdmissibilityService.ts:186-193) outright.
  if (nextState === undefined) {
    if (previousState === undefined) return { allowed: true }
    return {
      allowed: false,
      error: `A record governed by the ${lifecycleId} lifecycle cannot drop its lifecycle state '${previousState}': state changes only via a declared transition, and a payload that omits the state would erase it.`,
    }
  }

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
    return {
      allowed: false,
      // Denial wording is declarative: the failing guard's YAML `denialMessage` verbatim.
      // No message text or guard→wording mapping is invented here. The generic
      // constant remains ONLY as the fallback for role failures (no failedGuard)
      // or guards with no declared denialMessage — i.e., exact legacy behavior.
      error:
        matching.failedGuard?.denialMessage ??
        'You do not have the required role for this transition.',
    }
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
