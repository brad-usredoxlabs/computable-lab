import { describe, expect, it } from 'vitest'
import { LifecycleEngine } from './LifecycleEngine.js'
import type { LifecycleContext, LifecycleSpec } from './types.js'

const spec: LifecycleSpec = {
  lifecycleVersion: 1,
  id: 'guarded-review',
  states: [
    { id: 'draft', initial: true },
    { id: 'approved' },
  ],
  transitions: [
    {
      from: 'draft',
      to: 'approved',
      role: 'reviewer',
      label: 'Approve',
      guards: [{ type: 'requires_different_person', than: 'author' }],
    },
  ],
}

function context(currentActorId: string, authorId: string): LifecycleContext {
  return {
    recordId: 'REC-1',
    currentActorId,
    roleAssignments: { author: authorId },
    fields: {},
  }
}

describe('LifecycleEngine', () => {
  it('blocks guarded transitions when the actor is the same person', () => {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(spec)

    expect(engine.canTransition('guarded-review', 'draft', 'APPROVE', context('P-1', 'P-1'))).toBe(false)
    expect(engine.getValidTransitions('guarded-review', 'draft', context('P-1', 'P-1'))[0]!.allowed).toBe(false)
  })

  it('allows guarded transitions when the actor differs from the required role assignment', () => {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(spec)

    expect(engine.canTransition('guarded-review', 'draft', 'APPROVE', context('P-2', 'P-1'))).toBe(true)
    expect(engine.transition('guarded-review', 'draft', 'APPROVE', context('P-2', 'P-1'))).toEqual({
      previousState: 'draft',
      newState: 'approved',
      event: 'APPROVE',
    })
  })
})
