import { createMachine } from 'xstate'
import { compileLifecycle } from './lifecycleCompiler'
import type { LifecycleSpec, LifecycleContext } from './types'

/** Declarative guard facts, copied from the lifecycle YAML guards — never inferred in TS. */
export interface TransitionRequirements {
  /** A requires_signature guard is present (transition is signature-gated). */
  signatureRequired: boolean
  /** The YAML `signatureAction` for that guard. Absent => the engine fails closed today. */
  signatureAction?: string
  /** requires_different_person guard: the role whose assignee must differ from the actor. */
  differentPersonThan?: string
}

export interface TransitionInfo {
  event: string
  targetState: string
  label: string
  role: string
  allowed: boolean
  /** Present only when the transition declares guards. Absent otherwise. */
  requires?: TransitionRequirements
}

export interface TransitionResult {
  previousState: string
  newState: string
  event: string
}

/**
 * Copy declarative guard facts straight out of the lifecycle YAML guards.
 * Pure pass-through: NO policy is decided here and no guard→action mapping is
 * invented in TS (the mapping lives in YAML only, matching guardsPass()'s
 * fail-closed rule). `requires` is returned only when the transition declares
 * at least one guard; other guard types are intentionally not surfaced yet
 * (QMS-1A open question 1 — widen when a consumer needs them).
 */
function describeGuardFacts(
  guards: LifecycleSpec['transitions'][number]['guards']
): TransitionRequirements | undefined {
  if (!guards || guards.length === 0) return undefined

  const signatureGuard = guards.find(g => g.type === 'requires_signature')
  const differentPersonGuard = guards.find(g => g.type === 'requires_different_person')

  const requires: TransitionRequirements = {
    // True whenever a requires_signature guard exists, even without
    // signatureAction: the client must distinguish "gated but mis-declared"
    // from "not gated".
    signatureRequired: signatureGuard !== undefined,
    ...(signatureGuard?.signatureAction !== undefined
      ? { signatureAction: signatureGuard.signatureAction }
      : {}),
    ...(differentPersonGuard?.than !== undefined
      ? { differentPersonThan: differentPersonGuard.than }
      : {})
  }
  return requires
}

export class LifecycleEngine {
  private machines: Map<string, any> = new Map()
  private specs: Map<string, LifecycleSpec> = new Map()

  loadLifecycle(spec: LifecycleSpec): void {
    const { config, guards } = compileLifecycle(spec)
    const machine = createMachine(config, { guards })
    this.machines.set(spec.id, machine)
    this.specs.set(spec.id, spec)
  }

  isLoaded(lifecycleId: string): boolean {
    return this.machines.has(lifecycleId)
  }

  canTransition(lifecycleId: string, currentState: string, event: string, context: LifecycleContext): boolean {
    const machine = this.machines.get(lifecycleId)
    if (!machine) throw new Error(`Lifecycle not loaded: ${lifecycleId}`)

    return this.checkEventInSpec(lifecycleId, currentState, event, context)
  }

  private checkEventInSpec(lifecycleId: string, currentState: string, event: string, context: LifecycleContext): boolean {
    const transition = this.findTransition(lifecycleId, currentState, event)
    if (!transition) return false
    if (!this.guardsPass(transition.guards ?? [], context)) return false
    // Transition role enforcement: the required role is satisfied when the
    // actor HOLDS the role via a QMS role-grant (actorRoles) OR is the
    // assigned person for that role (roleAssignments). Enforcement is skipped
    // entirely when enforceTransitionRoles is false (research-mode policy
    // bundles: POL-SANDBOX / POL-NOTEBOOK resolve it to 'allow').
    if (context.enforceTransitionRoles) {
      const satisfied = context.actorRoles.includes(transition.role)
        || context.roleAssignments[transition.role] === context.currentActorId
      if (!satisfied) return false
    }
    return true
  }

  private findTransition(lifecycleId: string, currentState: string, event: string): LifecycleSpec['transitions'][number] | undefined {
    const spec = this.specs.get(lifecycleId)
    if (!spec) return undefined

    return spec.transitions.find(transition => {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from]
      const eventName = (transition.label || transition.to).toUpperCase().replace(/\s+/g, '_')
      return fromStates.includes(currentState) && eventName === event
    })
  }

  private guardsPass(guards: NonNullable<LifecycleSpec['transitions'][number]['guards']>, context: LifecycleContext): boolean {
    return guards.every(guard => {
      switch (guard.type) {
        case 'requires_different_person': {
          const otherActorId = guard.than ? context.roleAssignments[guard.than] : undefined
          return Boolean(otherActorId) && otherActorId !== context.currentActorId
        }
        case 'requires_field_set':
          return this.fieldValue(context.fields, guard.field) != null
        case 'requires_active_policy':
          return this.fieldValue(context.fields, 'activePolicy') !== false
            && this.fieldValue(context.fields, 'policyActive') !== false
        case 'requires_policy_disposition':
          return !guard.disposition || this.fieldValue(context.fields, 'policyDisposition') === guard.disposition
        case 'requires_authority':
          return !guard.authority || this.fieldValue(context.fields, 'approvalAuthority') === guard.authority
        case 'requires_role':
          return context.actorRoles.includes(guard.role ?? '')
            || context.roleAssignments[guard.role ?? ''] === context.currentActorId
        case 'requires_signature': {
          if (!guard.signatureAction) return false // fail closed; role->action mapping lives in YAML only
          return context.presentedSignatures.some(s =>
            s.subjectRecordId === context.recordId &&
            s.signedBy === context.currentActorId &&
            s.action === guard.signatureAction)
        }
        default:
          return false
      }
    })
  }

  private fieldValue(fields: Record<string, unknown>, path?: string): unknown {
    if (!path) return undefined
    return path.split('.').reduce<unknown>((current, part) => {
      if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
      return (current as Record<string, unknown>)[part]
    }, fields)
  }

  getValidTransitions(lifecycleId: string, currentState: string, context: LifecycleContext): TransitionInfo[] {
    const spec = this.specs.get(lifecycleId)
    if (!spec) throw new Error(`Lifecycle not loaded: ${lifecycleId}`)

    const result: TransitionInfo[] = []
    for (const transition of spec.transitions) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from]
      if (!fromStates.includes(currentState)) continue

      const eventName = (transition.label || transition.to).toUpperCase().replace(/\s+/g, '_')
      const allowed = this.canTransition(lifecycleId, currentState, eventName, context)

      const requires = describeGuardFacts(transition.guards)
      result.push({
        event: eventName,
        targetState: transition.to,
        label: transition.label || transition.to,
        role: transition.role,
        allowed,
        ...(requires ? { requires } : {})
      })
    }
    return result
  }

  transition(lifecycleId: string, currentState: string, event: string, context: LifecycleContext): TransitionResult {
    if (!this.canTransition(lifecycleId, currentState, event, context)) {
      throw new Error(`Transition ${event} not allowed from state ${currentState}`)
    }

    const spec = this.specs.get(lifecycleId)
    if (!spec) throw new Error(`Lifecycle not loaded: ${lifecycleId}`)

    const transition = this.findTransition(lifecycleId, currentState, event)

    if (!transition) {
      throw new Error(`Transition ${event} not found in lifecycle ${lifecycleId}`)
    }

    return {
      previousState: currentState,
      newState: transition.to,
      event
    }
  }
}
