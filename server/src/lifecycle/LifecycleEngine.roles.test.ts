import { describe, expect, it } from 'vitest'
import { LifecycleEngine } from './LifecycleEngine.js'
import { compileLifecycle } from './lifecycleCompiler.js'
import { extractRoleAssignments } from './lifecycleMiddleware.js'
import type { LifecycleContext, LifecycleSpec } from './types.js'

const spec: LifecycleSpec = {
  lifecycleVersion: 1,
  id: 'role-gated',
  states: [{ id: 'draft', initial: true }, { id: 'approved' }],
  transitions: [{ from: 'draft', to: 'approved', role: 'approver', label: 'Approve' }],
}

function ctx(currentActorId: string, over: Partial<LifecycleContext> = {}): LifecycleContext {
  return {
    recordId: 'DOC-1',
    currentActorId,
    roleAssignments: {},
    actorRoles: [],
    enforceTransitionRoles: false,
    fields: {},
    presentedSignatures: [],
    ...over,
  }
}

function makeEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  engine.loadLifecycle(spec)
  return engine
}

describe('transition role enforcement', () => {
  it('allows the transition when the actor holds the required role', () => {
    const engine = makeEngine()
    expect(engine.canTransition('role-gated', 'draft', 'APPROVE', ctx('P-1', {
      actorRoles: ['approver'],
      enforceTransitionRoles: true,
    }))).toBe(true)
  })

  it('blocks the transition when enforcement is on and the actor lacks the role', () => {
    const engine = makeEngine()
    expect(engine.canTransition('role-gated', 'draft', 'APPROVE', ctx('P-1', {
      enforceTransitionRoles: true,
    }))).toBe(false)
    const valid = engine.getValidTransitions('role-gated', 'draft', ctx('P-1', {
      enforceTransitionRoles: true,
    }))
    expect(valid[0]?.allowed).toBe(false)
  })

  it('allows the transition when the actor is the assigned person for the role', () => {
    const engine = makeEngine()
    expect(engine.canTransition('role-gated', 'draft', 'APPROVE', ctx('P-1', {
      roleAssignments: { approver: 'P-1' },
      enforceTransitionRoles: true,
    }))).toBe(true)
  })

  it('skips enforcement entirely when enforceTransitionRoles is false (research mode)', () => {
    const engine = makeEngine()
    expect(engine.canTransition('role-gated', 'draft', 'APPROVE', ctx('P-1'))).toBe(true)
  })
})

describe('requires_role guard', () => {
  const guardedSpec: LifecycleSpec = {
    lifecycleVersion: 1,
    id: 'guard-role',
    states: [{ id: 'draft', initial: true }, { id: 'approved' }],
    transitions: [{
      from: 'draft',
      to: 'approved',
      role: 'anyone',
      label: 'Approve',
      guards: [{ type: 'requires_role', role: 'qa' }],
    }],
  }

  it('is satisfied when the actor holds the guard role', () => {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(guardedSpec)
    expect(engine.canTransition('guard-role', 'draft', 'APPROVE', ctx('P-1', {
      actorRoles: ['qa'],
    }))).toBe(true)
  })

  it('blocks when the actor holds a different role', () => {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(guardedSpec)
    expect(engine.canTransition('guard-role', 'draft', 'APPROVE', ctx('P-1', {
      actorRoles: ['approver'],
    }))).toBe(false)
  })
})

describe('requires_signature guard (engine == compiled advisory mirror)', () => {
  const signatureSpec: LifecycleSpec = {
    lifecycleVersion: 1,
    id: 'guard-signature',
    states: [{ id: 'draft', initial: true }, { id: 'approved' }, { id: 'superseded', terminal: true }],
    transitions: [
      {
        from: 'draft',
        to: 'approved',
        role: 'anyone',
        label: 'Approve',
        guards: [{ type: 'requires_signature', signatureAction: 'approved' }],
      },
      {
        from: 'draft',
        to: 'superseded',
        role: 'anyone',
        label: 'Supersede',
        // Declared WITHOUT signatureAction → must fail closed on both paths.
        guards: [{ type: 'requires_signature' }],
      },
    ],
  }

  function makeSignatureEngine(): LifecycleEngine {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(signatureSpec)
    return engine
  }

  const matching = {
    id: 'SIG-1',
    action: 'approved',
    subjectRecordId: 'DOC-1',
    signedBy: 'P-1',
  }

  const { guards } = compileLifecycle(signatureSpec)

  function compiledAllows(context: LifecycleContext): boolean {
    return guards['guard_draft_approved_APPROVE']!({ context })
  }
  function compiledSupersedeAllows(context: LifecycleContext): boolean {
    return guards['guard_draft_superseded_SUPERSEDE']!({ context })
  }

  it('is satisfied by a matching presented signature on both paths', () => {
    const context = ctx('P-1', { presentedSignatures: [matching] })
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'APPROVE', context)).toBe(true)
    expect(compiledAllows(context)).toBe(true)
  })

  it('blocks a signature signed by a different person on both paths', () => {
    const context = ctx('P-1', { presentedSignatures: [{ ...matching, signedBy: 'P-2' }] })
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'APPROVE', context)).toBe(false)
    expect(compiledAllows(context)).toBe(false)
  })

  it('blocks a signature with the wrong action on both paths', () => {
    const context = ctx('P-1', { presentedSignatures: [{ ...matching, action: 'reviewed' }] })
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'APPROVE', context)).toBe(false)
    expect(compiledAllows(context)).toBe(false)
  })

  it('blocks a signature bound to a different subject record on both paths', () => {
    const context = ctx('P-1', { presentedSignatures: [{ ...matching, subjectRecordId: 'DOC-2' }] })
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'APPROVE', context)).toBe(false)
    expect(compiledAllows(context)).toBe(false)
  })

  it('blocks when no signature is presented on both paths', () => {
    const context = ctx('P-1')
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'APPROVE', context)).toBe(false)
    expect(compiledAllows(context)).toBe(false)
  })

  it('fails closed when signatureAction is missing from the declaration on both paths', () => {
    const context = ctx('P-1', { presentedSignatures: [matching] })
    expect(makeSignatureEngine().canTransition('guard-signature', 'draft', 'SUPERSEDE', context)).toBe(false)
    expect(compiledSupersedeAllows(context)).toBe(false)
  })
})

describe('extractRoleAssignments', () => {
  it('extracts a generic <role>Ref assignment', () => {
    expect(extractRoleAssignments({ stewardRef: { id: 'P-9' } })).toEqual({ steward: 'P-9' })
  })

  it('converts multi-word camelCase refs to snake_case roles', () => {
    expect(extractRoleAssignments({ qualityManagerRef: { id: 'P-3' } })).toEqual({ quality_manager: 'P-3' })
  })

  it('keeps the legacy createdBy → author mapping', () => {
    expect(extractRoleAssignments({ createdBy: 'P-7' })).toEqual({ author: 'P-7' })
  })

  it('ignores non-ref values and non-object refs', () => {
    expect(extractRoleAssignments({ stewardRef: 'P-9', reviewerRef: { id: 42 } })).toEqual({})
  })
})

describe('compiled machine mirrors engine role semantics (advisory cross-check)', () => {
  const { guards } = compileLifecycle(spec)

  function guardAllows(context: LifecycleContext): boolean {
    // Same wiring as LifecycleEngine.loadLifecycle: the compiled guards map is
    // consulted by the XState machine for the draft -> APPROVE transition.
    const guardName = 'guard_draft_approved_APPROVE'
    const fn = guards[guardName]
    // No guards on this transition → the compiled machine would allow the
    // edge; the engine's role check is layered on top. Reuse the exported
    // guard factory semantics via compileLifecycle's guards map for guarded
    // specs only. For the plain role-gated spec, emulate the same
    // enforcement the engine applies over the compiled result.
    if (!fn) {
      if (context.enforceTransitionRoles) {
        return context.actorRoles.includes('approver')
          || context.roleAssignments.approver === context.currentActorId
      }
      return true
    }
    return fn({ context })
  }

  const cases: Array<[LifecycleContext, boolean]> = [
    [ctx('P-1', { actorRoles: ['approver'], enforceTransitionRoles: true }), true],
    [ctx('P-1', { enforceTransitionRoles: true }), false],
    [ctx('P-1', { roleAssignments: { approver: 'P-1' }, enforceTransitionRoles: true }), true],
    [ctx('P-1'), true],
  ]

  for (const [context, expected] of cases) {
    it(`engine and compiled guard path agree for ${context.currentActorId} enforce=${context.enforceTransitionRoles} roles=${context.actorRoles.join(',')} (${expected})`, () => {
      const engine = makeEngine()
      const engineResult = engine.canTransition('role-gated', 'draft', 'APPROVE', context)
      expect(engineResult).toBe(expected)
      expect(guardAllows(context)).toBe(engineResult)
    })
  }
})
