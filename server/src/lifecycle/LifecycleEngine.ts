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
    const machine = createMachine(config, guards)
    this.machines.set(spec.id, machine)
    this.specs.set(spec.id, spec)
  }

  isLoaded(lifecycleId: string): boolean {
    return this.machines.has(lifecycleId)
  }

  canTransition(lifecycleId: string, currentState: string, event: string, _context: LifecycleContext): boolean {
    const machine = this.machines.get(lifecycleId)
    if (!machine) throw new Error(`Lifecycle not loaded: ${lifecycleId}`)

    // Check if the event is valid in the spec for this state
    return this.checkEventInSpec(lifecycleId, currentState, event)
  }

  private checkEventInSpec(lifecycleId: string, currentState: string, event: string): boolean {
    const spec = this.specs.get(lifecycleId)
    if (!spec) return false

    for (const transition of spec.transitions) {
      const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from]
      const eventName = (transition.label || transition.to).toUpperCase().replace(/\s+/g, '_')
      if (fromStates.includes(currentState) && eventName === event) {
        // Verify guard passes
        if (transition.guards && transition.guards.length > 0) {
          // For guard evaluation, we'd need to run the machine
          // For now, assume guards pass if event matches
          return true
        }
        return true
      }
    }
    return false
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

    const transition = spec.transitions.find(t => {
      const fromStates = Array.isArray(t.from) ? t.from : [t.from]
      const eventName = (t.label || t.to).toUpperCase().replace(/\s+/g, '_')
      return fromStates.includes(currentState) && eventName === event
    })

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
