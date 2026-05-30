import { createMachine } from 'xstate'
import { compileLifecycle } from './lifecycleCompiler'
import type { LifecycleSpec, LifecycleContext } from './types'

export interface TransitionInfo {
  event: string
  targetState: string
  label: string
  role: string
  allowed: boolean
}

export interface TransitionResult {
  previousState: string
  newState: string
  event: string
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
    return this.guardsPass(transition.guards ?? [], context)
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

      result.push({
        event: eventName,
        targetState: transition.to,
        label: transition.label || transition.to,
        role: transition.role,
        allowed
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
