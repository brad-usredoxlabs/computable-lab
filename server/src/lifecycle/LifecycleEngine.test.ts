import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
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
    actorRoles: [],
    enforceTransitionRoles: false,
    fields: {},
    presentedSignatures: [],
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

// QMS-1A: declarative guard metadata in the preview payload.
// `requires` is copied from transition.guards ONLY — never inferred in TS.
describe('TransitionInfo.requires (guard metadata pass-through)', () => {
  const lifecyclesDir = join(dirname(fileURLToPath(import.meta.url)), '../../../schema/core/lifecycles')
  const signingSpec = parse(
    readFileSync(join(lifecyclesDir, 'document-controlled-signing.lifecycle.yaml'), 'utf-8'),
  ) as LifecycleSpec

  const previewCtx: LifecycleContext = {
    recordId: 'DOC-1',
    currentActorId: 'P-2',
    roleAssignments: { author: 'P-1' },
    actorRoles: [],
    enforceTransitionRoles: false,
    fields: {},
    presentedSignatures: [],
  }

  function signingEngine(): LifecycleEngine {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(signingSpec)
    return engine
  }

  it('exposes signature + different-person guard facts on the YAML-declared signature-gated transition', () => {
    const transitions = signingEngine().getValidTransitions('document-controlled-signing', 'in_review', previewCtx)
    const approve = transitions.find(t => t.event === 'APPROVE' && t.targetState === 'approved')
    expect(approve).toBeDefined()
    // Metadata only: allowed semantics unchanged (no signature presented → false).
    expect(approve!.allowed).toBe(false)
    expect(approve!.requires).toEqual({
      signatureRequired: true,
      signatureAction: 'approved',
      differentPersonThan: 'author',
    })
  })

  it('omits requires for transitions that declare no guards', () => {
    const transitions = signingEngine().getValidTransitions('document-controlled-signing', 'draft', previewCtx)
    const submit = transitions.find(t => t.targetState === 'in_review')
    expect(submit).toBeDefined()
    expect(submit!.requires).toBeUndefined()
  })

  it('reports signatureRequired even when the guard omits signatureAction (gated but mis-declared)', () => {
    const misDeclared: LifecycleSpec = {
      lifecycleVersion: 1,
      id: 'misdeclared-signature',
      states: [{ id: 'draft', initial: true }, { id: 'approved' }],
      transitions: [
        {
          from: 'draft',
          to: 'approved',
          role: 'reviewer',
          label: 'Approve',
          guards: [{ type: 'requires_signature' }],
        },
      ],
    }
    const engine = new LifecycleEngine()
    engine.loadLifecycle(misDeclared)

    const [t] = engine.getValidTransitions('misdeclared-signature', 'draft', previewCtx)
    expect(t!.allowed).toBe(false) // engine still fails closed (guardsPass:99)
    expect(t!.requires).toEqual({ signatureRequired: true, signatureAction: undefined })
  })

  it('exposes only requires_different_person when that is the only declared guard', () => {
    const engine = new LifecycleEngine()
    engine.loadLifecycle(spec) // guarded-review: requires_different_person only
    const [transition] = engine.getValidTransitions('guarded-review', 'draft', previewCtx)
    expect(transition!.requires).toEqual({
      signatureRequired: false,
      differentPersonThan: 'author',
    })
  })
})
