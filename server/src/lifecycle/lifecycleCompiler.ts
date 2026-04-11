import { type MachineConfig } from 'xstate'
import type { LifecycleSpec, LifecycleContext, LifecycleEvent } from './types'

export function compileLifecycle(spec: LifecycleSpec): {
  config: MachineConfig<LifecycleContext, LifecycleEvent>
  guards: Record<string, (ctx: { context: LifecycleContext }) => boolean>
} {
  // Find initial state
  const initialState = spec.states.find(s => s.initial) || spec.states[0]
  if (!initialState) {
    throw new Error('Lifecycle spec must have at least one state')
  }

  const guards: Record<string, (ctx: { context: LifecycleContext }) => boolean> = {}
  const states: Record<string, { type?: 'final'; on?: Record<string, { target: string; guard?: string }> }> = {}

  // Build states object
  for (const state of spec.states) {
    const stateConfig: { type?: 'final'; on?: Record<string, { target: string; guard?: string }> } = {}
    if (state.terminal) {
      stateConfig.type = 'final'
    }
    states[state.id] = stateConfig
  }

  // Build transitions
  for (const transition of spec.transitions) {
    const fromStates = Array.isArray(transition.from) ? transition.from : [transition.from]
    const eventName = (transition.label || transition.to).toUpperCase().replace(/\s+/g, '_')

    for (const fromState of fromStates) {
      if (!states[fromState]) {
        throw new Error(`Transition references unknown state: ${fromState}`)
      }
      if (!states[fromState].on) {
        states[fromState].on = {}
      }

      const transitionConfig: { target: string; guard?: string } = { target: transition.to }
      if (transition.guards && transition.guards.length > 0) {
        const guardName = `guard_${fromState}_${transition.to}_${eventName}`
        transitionConfig.guard = guardName
        guards[guardName] = createGuardFunction(transition.guards)
      }

      states[fromState].on![eventName] = transitionConfig
    }
  }

  const config: MachineConfig<LifecycleContext, LifecycleEvent> = {
    id: spec.id,
    initial: initialState.id,
    context: {} as LifecycleContext,
    states
  }

  return { config, guards }
}

function createGuardFunction(guards: Array<{
  type: 'requires_different_person' | 'requires_field_set' | 'requires_active_policy'
  field?: string
  than?: string
}>): (ctx: { context: LifecycleContext }) => boolean {
  const guardFns = guards.map(g => {
    switch (g.type) {
      case 'requires_different_person':
        return (ctx: { context: LifecycleContext }) =>
          ctx.context.roleAssignments[g.than!] !== ctx.context.currentActorId
      case 'requires_field_set':
        return (ctx: { context: LifecycleContext }) =>
          ctx.context.fields[g.field!] != null
      case 'requires_active_policy':
        return () => true
      default:
        return () => true
    }
  })

  return (ctx: { context: LifecycleContext }) =>
    guardFns.every(fn => fn(ctx))
}
