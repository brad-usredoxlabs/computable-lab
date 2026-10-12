/**
 * QMS-6F — distinct "different-person" lifecycle denial (QMS-6B defect D4).
 *
 * Locks the architect decision
 * (.hermes/plans/2026-10-04_lane1-different-person-denial-decision.md, option B):
 *   - the engine reports WHICH guard failed first (`TransitionInfo.failedGuard`),
 *   - a guard's YAML `denialMessage` is passed through declaratively
 *     (`requires.denialMessages`, `failedGuard.denialMessage`),
 *   - the middleware surfaces the failing guard's YAML message verbatim, and
 *     falls back to the EXACT legacy generic sentence otherwise.
 *
 * Mirrors LifecycleEngine.test.ts / LifecycleEngine.roles.test.ts: REAL YAML
 * specs through the REAL engine, plus the REAL checkLifecycleTransition.
 * The expected message text is READ FROM the YAML (data is the source of
 * truth) — no policy string is duplicated as the source of the assertion.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import { describe, expect, it } from 'vitest'
import { LifecycleEngine } from './LifecycleEngine.js'
import { checkLifecycleTransition } from './lifecycleMiddleware.js'
import { loadLifecyclesFromDir } from './LifecycleLoader.js'
import type { LifecycleContext, LifecycleSpec } from './types.js'

const lifecyclesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../schema/core/lifecycles')

const GENERIC_DENIAL = 'You do not have the required role for this transition.'

function loadSpec(file: string): LifecycleSpec {
  return parse(readFileSync(join(lifecyclesDir, file), 'utf-8')) as LifecycleSpec
}

/** The YAML-declared denialMessage of the requires_different_person guard on a transition. */
function declaredDenial(spec: LifecycleSpec, targetState: string): string | undefined {
  const transition = spec.transitions.find(t => t.to === targetState)
  const guard = (transition?.guards ?? []).find(g => g.type === 'requires_different_person')
  return (guard as { denialMessage?: string } | undefined)?.denialMessage
}

function context(overrides: Partial<LifecycleContext> = {}): LifecycleContext {
  return {
    recordId: 'DOC-1',
    currentActorId: 'P-1',
    roleAssignments: { author: 'P-1' },
    actorRoles: [],
    enforceTransitionRoles: false,
    fields: {},
    presentedSignatures: [],
    ...overrides,
  }
}

function engineFor(specs: LifecycleSpec[]): LifecycleEngine {
  const engine = new LifecycleEngine()
  for (const spec of specs) engine.loadLifecycle(spec)
  return engine
}

describe('engine: failedGuard reports WHICH guard failed (QMS-6F / D4 falsifier)', () => {
  const signingSpec = loadSpec('document-controlled-signing.lifecycle.yaml')
  const dpSigningMsg = declaredDenial(signingSpec, 'approved')
  const signApprove = (ctxOverrides: Partial<LifecycleContext> = {}) => {
    const found = engineFor([signingSpec])
      .getValidTransitions('document-controlled-signing', 'in_review', context(ctxOverrides))
      .find(t => t.event === 'APPROVE' && t.targetState === 'approved')
    expect(found).toBeDefined()
    return found!
  }

  it('the different-person denial message is declared in the YAML (data-first fence)', () => {
    expect(dpSigningMsg, 'document-controlled-signing approve must declare a guard denialMessage').toBeTruthy()
    // Binding properties from the decision: names the different-person reason,
    // and contains NO role/password wording.
    expect(dpSigningMsg).toMatch(/different person/i)
    expect(dpSigningMsg).not.toMatch(/role|password/i)
  })

  it('approve as the AUTHOR without a signature fails on requires_different_person FIRST (YAML order)', () => {
    const approve = signApprove({ currentActorId: 'P-1', roleAssignments: { author: 'P-1' } })
    expect(approve.allowed).toBe(false)
    expect(approve.failedGuard?.type).toBe('requires_different_person')
    expect(approve.failedGuard?.than).toBe('author')
    // The failing guard carries its declarative message verbatim.
    expect(approve.failedGuard?.denialMessage).toBe(dpSigningMsg)
    // Pass-through in `requires` too, keyed by guard kind (same pattern as signatureAction/than).
    expect(approve.requires?.denialMessages?.differentPerson).toBe(dpSigningMsg)
  })

  it('approve as the AUTHOR WITH a valid signature still reports the different-person guard', () => {
    const approve = signApprove({
      currentActorId: 'P-1',
      roleAssignments: { author: 'P-1' },
      presentedSignatures: [{
        id: 'SIG-1', action: 'approved', subjectRecordId: 'DOC-1', signedBy: 'P-1',
      }],
    })
    expect(approve.allowed).toBe(false)
    expect(approve.failedGuard?.type).toBe('requires_different_person')
    expect(approve.failedGuard?.denialMessage).toBe(dpSigningMsg)
  })

  it('approve as a NON-AUTHOR lacking a signature fails on requires_signature, NOT a different-person message', () => {
    const approve = signApprove({ currentActorId: 'P-2', roleAssignments: { author: 'P-1' } })
    expect(approve.allowed).toBe(false)
    expect(approve.failedGuard?.type).toBe('requires_signature')
    expect(approve.failedGuard?.signatureAction).toBe('approved')
    // This is the decision's evidence correction: the failure must NOT be
    // reported as the different-person denial.
    expect(approve.failedGuard?.denialMessage).not.toBe(dpSigningMsg)
  })

  it('document-control approve as the author reports the different-person guard with ITS YAML message', () => {
    const docSpec = loadSpec('document-control.lifecycle.yaml')
    const dpMsg = declaredDenial(docSpec, 'approved')
    expect(dpMsg).toBeTruthy()
    const approve = engineFor([docSpec])
      .getValidTransitions('document-control', 'in_review', context())
      .find(t => t.targetState === 'approved')
    expect(approve?.failedGuard?.type).toBe('requires_different_person')
    expect(approve?.failedGuard?.denialMessage).toBe(dpMsg)
  })

  it('lab-vocabulary-control activate as the author reports the different-person guard with ITS YAML message', () => {
    const vocabSpec = loadSpec('lab-vocabulary-control.lifecycle.yaml')
    const dpMsg = declaredDenial(vocabSpec, 'active')
    expect(dpMsg).toBeTruthy()
    const activate = engineFor([vocabSpec])
      .getValidTransitions('lab-vocabulary-control', 'proposed', context())
      .find(t => t.targetState === 'active')
    expect(activate?.failedGuard?.type).toBe('requires_different_person')
    expect(activate?.failedGuard?.denialMessage).toBe(dpMsg)
  })

  it('legacy fence: role-only denial on an UNGUARDED transition has NO failedGuard and no requires', () => {
    const approve = engineFor([signingSpec])
      .getValidTransitions('document-controlled-signing', 'draft', context({
        currentActorId: 'P-2',
        roleAssignments: { author: 'P-1' },
        enforceTransitionRoles: true, // deny-mode role check fails: no author grant/assignment
      }))
      .find(t => t.targetState === 'in_review')
    expect(approve?.allowed).toBe(false)
    expect(approve?.requires).toBeUndefined()
    expect(approve?.failedGuard).toBeUndefined()
  })
})

describe('engine: fail-closed preserved (QMS-1A)', () => {
  it('an unknown guard type still fails, and counts as the failing guard', () => {
    const unknown: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'unknown-guard',
      states: [{ id: 'draft', initial: true }, { id: 'approved' }],
      transitions: [{
        from: 'draft', to: 'approved', role: 'reviewer', label: 'Approve',
        guards: [{ type: 'requires_bananas' } as unknown as LifecycleSpec['transitions'][number]['guards'][number]],
      }],
    }
    const engine = engineFor([unknown])
    expect(engine.canTransition('unknown-guard', 'draft', 'APPROVE', context())).toBe(false)
    const [t] = engine.getValidTransitions('unknown-guard', 'draft', context())
    expect(t!.allowed).toBe(false)
    expect(t!.failedGuard?.type).toBe('requires_bananas')
  })

  it('requires_signature WITHOUT signatureAction still fails closed and reports itself as the failing guard', () => {
    const misdeclared: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'misdeclared-sig',
      states: [{ id: 'draft', initial: true }, { id: 'approved' }],
      transitions: [{
        from: 'draft', to: 'approved', role: 'reviewer', label: 'Approve',
        guards: [{ type: 'requires_signature' }],
      }],
    }
    const engine = engineFor([misdeclared])
    expect(engine.canTransition('misdeclared-sig', 'draft', 'APPROVE', context())).toBe(false)
    const [t] = engine.getValidTransitions('misdeclared-sig', 'draft', context())
    expect(t!.failedGuard?.type).toBe('requires_signature')
    expect(t!.failedGuard?.denialMessage).toBeUndefined()
  })
})

describe('middleware: checkLifecycleTransition denial wording (message-only change)', () => {
  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(lifecyclesDir, engine)

  const docSpec = loadSpec('document-control.lifecycle.yaml')
  const dpDocMsg = declaredDenial(docSpec, 'approved')

  it('different-person denial surfaces the guard YAML denialMessage verbatim', () => {
    const result = checkLifecycleTransition(engine, {
      previousPayload: { lifecycleId: 'document-control', id: 'DOC-1', state: 'in_review', createdBy: 'P-1' },
      nextPayload: { lifecycleId: 'document-control', id: 'DOC-1', state: 'approved', createdBy: 'P-1' },
      actorId: 'P-1',
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(dpDocMsg)
  })

  it('legacy fence: role-only denial yields the EXACT generic sentence', () => {
    const legacySpec: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'legacy-generic',
      states: [{ id: 'draft', initial: true }, { id: 'approved' }],
      transitions: [{ from: 'draft', to: 'approved', role: 'reviewer', label: 'Approve' }],
    }
    const legacyEngine = engineFor([legacySpec])
    const result = checkLifecycleTransition(legacyEngine, {
      previousPayload: { lifecycleId: 'legacy-generic', id: 'R-1', state: 'draft' },
      nextPayload: { lifecycleId: 'legacy-generic', id: 'R-1', state: 'approved' },
      actorId: 'P-9',
      actorRoles: [],
      enforceTransitionRoles: true,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(GENERIC_DENIAL) // byte-identical legacy wording
  })

  it('legacy fence: a guard WITHOUT denialMessage still yields the EXACT generic sentence', () => {
    const noMsgSpec: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'guard-no-msg',
      states: [{ id: 'draft', initial: true }, { id: 'approved' }],
      transitions: [{
        from: 'draft', to: 'approved', role: 'reviewer', label: 'Approve',
        guards: [{ type: 'requires_field_set', field: 'signedOff' }],
      }],
    }
    const noMsgEngine = engineFor([noMsgSpec])
    const result = checkLifecycleTransition(noMsgEngine, {
      previousPayload: { lifecycleId: 'guard-no-msg', id: 'R-2', state: 'draft' },
      nextPayload: { lifecycleId: 'guard-no-msg', id: 'R-2', state: 'approved' },
      actorId: 'P-9',
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(false)
    expect(result.error).toBe(GENERIC_DENIAL)
  })

  it('allowed paths are untouched', () => {
    const result = checkLifecycleTransition(engine, {
      previousPayload: { lifecycleId: 'document-control', id: 'DOC-1', state: 'in_review', createdBy: 'P-1' },
      nextPayload: { lifecycleId: 'document-control', id: 'DOC-1', state: 'approved', createdBy: 'P-1' },
      actorId: 'P-2', // different person
      actorRoles: [],
      enforceTransitionRoles: false,
    })
    expect(result.allowed).toBe(true)
    expect(result.transition).toEqual({ from: 'in_review', to: 'approved', event: 'APPROVE' })
  })
})
