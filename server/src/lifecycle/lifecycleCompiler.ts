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
  type: 'requires_different_person' | 'requires_field_set' | 'requires_active_policy' | 'requires_policy_disposition' | 'requires_authority'
  field?: string
  than?: string
  disposition?: 'allowed' | 'needs-confirmation' | 'blocked'
  authority?: string
}>): (ctx: { context: LifecycleContext }) => boolean {
  const guardFns = guards.map(g => {
    switch (g.type) {
      case 'requires_different_person':
        return (ctx: { context: LifecycleContext }) => {
          const otherActorId = g.than ? ctx.context.roleAssignments[g.than] : undefined
          return Boolean(otherActorId) && otherActorId !== ctx.context.currentActorId
        }
      case 'requires_field_set':
        return (ctx: { context: LifecycleContext }) => getField(ctx.context.fields, g.field) != null
      case 'requires_active_policy':
        return (ctx: { context: LifecycleContext }) =>
          getField(ctx.context.fields, 'activePolicy') !== false
            && getField(ctx.context.fields, 'policyActive') !== false
      case 'requires_policy_disposition':
        return (ctx: { context: LifecycleContext }) =>
          !g.disposition || getField(ctx.context.fields, 'policyDisposition') === g.disposition
      case 'requires_authority':
        return (ctx: { context: LifecycleContext }) =>
          !g.authority || getField(ctx.context.fields, 'approvalAuthority') === g.authority
      default:
        return () => true
    }
  })

  return (ctx: { context: LifecycleContext }) =>
    guardFns.every(fn => fn(ctx))
}

function getField(fields: Record<string, unknown>, path?: string): unknown {
  if (!path) return undefined
  return path.split('.').reduce<unknown>((current, part) => {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    return (current as Record<string, unknown>)[part]
  }, fields)
}
