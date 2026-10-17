import { describe, expect, it, vi } from 'vitest'
import { fileURLToPath } from 'node:url'
import { LifecycleEngine } from '../../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../../lifecycle/LifecycleLoader.js'
import type { LifecycleSpec } from '../../lifecycle/types.js'
import { createLifecycleHandlers } from './LifecycleHandlers.js'

// Real lifecycles dir (W25RegulatedLifecycle.test.ts pattern): the terminal
// fact is read from the YAML on disk, never duplicated in TS.
const LIFECYCLES_DIR = fileURLToPath(new URL('../../../schema/core/lifecycles', import.meta.url))

// Inline spec (not loaded from disk): draft -> in_review -> approved.
// Mirrors the style of server/src/lifecycle/LifecycleEngine.test.ts.
const spec: LifecycleSpec = {
  lifecycleVersion: 1,
  id: 'doc-review',
  states: [
    { id: 'draft', initial: true },
    { id: 'in_review' },
    { id: 'approved' },
  ],
  transitions: [
    { from: 'draft', to: 'in_review', role: 'author', label: 'Submit for Review' },
    { from: 'in_review', to: 'approved', role: 'reviewer', label: 'Approve' },
  ],
}

function makeEngine(): LifecycleEngine {
  const engine = new LifecycleEngine()
  engine.loadLifecycle(spec)
  return engine
}

function makeReply() {
  return {
    status: vi.fn().mockReturnThis(),
    send: vi.fn((x: unknown) => x),
  }
}

function makeRequest(lifecycleId: string, recordId?: string) {
  return {
    params: { lifecycleId },
    query: recordId ? { recordId } : {},
  } as never
}

function makeHandlers(options: {
  engine?: LifecycleEngine
  record?: { payload: Record<string, unknown> } | null
  roles?: string[]
  userId?: string | null
}) {
  const store = { get: vi.fn(async () => options.record ?? null) }
  const roleResolver = { rolesFor: vi.fn(async () => options.roles ?? []) }
  const resolveRequestUser = vi.fn(async () =>
    options.userId === null || options.userId === undefined
      ? null
      : { userId: options.userId, isSystem: false },
  )
  const handlers = createLifecycleHandlers({
    engine: options.engine ?? makeEngine(),
    store: store as never,
    roleResolver: roleResolver as never,
    resolveRequestUser: resolveRequestUser as never,
  })
  return { handlers, store, roleResolver }
}

describe('LifecycleHandlers.getTransitions', () => {
  it('returns 401 when the request user cannot be resolved', async () => {
    const { handlers } = makeHandlers({ userId: null })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('doc-review', 'REC-1'), reply as never)

    expect(reply.status).toHaveBeenCalledWith(401)
    expect(body).toMatchObject({ error: 'UNAUTHENTICATED' })
  })

  it('returns 404 for an unknown lifecycle', async () => {
    const { handlers, store } = makeHandlers({ userId: 'USR-X' })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('no-such-lifecycle', 'REC-1'), reply as never)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(body).toMatchObject({ error: 'NOT_FOUND' })
    expect(store.get).not.toHaveBeenCalled()
  })

  it('returns 404 when the record does not exist', async () => {
    const { handlers } = makeHandlers({ userId: 'USR-X', record: null })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('doc-review', 'REC-MISSING'), reply as never)

    expect(reply.status).toHaveBeenCalledWith(404)
    expect(body).toMatchObject({ error: 'NOT_FOUND' })
  })

  it('returns draft transitions for a record in draft state', async () => {
    const { handlers } = makeHandlers({
      userId: 'USR-X',
      record: { payload: { state: 'draft', createdBy: 'USR-X' } },
    })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('doc-review', 'REC-1'), reply as never)

    expect(reply.send).toHaveBeenCalled()
    expect(body).toMatchObject({ lifecycleId: 'doc-review', state: 'draft' })
    const transitions = (body as { transitions: Array<{ targetState: string; allowed: boolean }> }).transitions
    expect(transitions).toContainEqual(
      expect.objectContaining({ targetState: 'in_review', allowed: true }),
    )
  })

  it('reads state from the record payload and resolves actor roles for the lifecycle', async () => {
    // Preview runs permissive (enforceTransitionRoles: false): allowed reflects
    // guards only, never role grants. The write path enforces and may still deny.
    const { handlers, roleResolver } = makeHandlers({
      userId: 'USR-X',
      roles: [],
      record: { payload: { state: 'in_review', createdBy: 'USR-A' } },
    })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('doc-review', 'REC-2'), reply as never)

    expect(roleResolver.rolesFor).toHaveBeenCalledWith('USR-X', 'doc-review')
    expect(body).toMatchObject({ state: 'in_review' })
    const transitions = (body as { transitions: Array<{ targetState: string; allowed: boolean }> }).transitions
    expect(transitions).toContainEqual(
      expect.objectContaining({ targetState: 'approved', allowed: true }),
    )
  })
})

// ---------------------------------------------------------------------------
// QMS7-6 OQ-1(A): the transitions response carries a lifecycle-scoped
// `terminalStates: string[]` — the read-only echo of engine.terminalStates()
// (the YAML `terminal: true` facts). The client's archived-browsing filter
// reads this field; NO terminal-state list may be invented in TS anywhere.
// Asserted against the REAL loaded registry-ops lifecycle (W25RegulatedLifecycle
// pattern: loadLifecyclesFromDir over schema/core/lifecycles — the fact comes
// from the YAML on disk, never a duplicated TS list).
// ---------------------------------------------------------------------------

describe('LifecycleHandlers.getTransitions — terminalStates echo (QMS7-6)', () => {
  function realEngine() {
    const engine = new LifecycleEngine()
    const count = loadLifecyclesFromDir(LIFECYCLES_DIR, engine)
    expect(count).toBeGreaterThanOrEqual(1)
    expect(engine.isLoaded('registry-ops')).toBe(true)
    return engine
  }

  it('echoes the YAML-declared terminal set for the REAL registry-ops lifecycle', async () => {
    const { handlers } = makeHandlers({ engine: realEngine(), userId: 'USR-X' })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('registry-ops'), reply as never)

    // registry-ops.lifecycle.yaml declares exactly one terminal state
    // (archived, terminal: true). The field is the engine's read-only report.
    expect(body).toMatchObject({ lifecycleId: 'registry-ops' })
    expect((body as { terminalStates: string[] }).terminalStates).toEqual(['archived'])
  })

  it('works WITHOUT recordId (lifecycle-scoped fact, recordId-less preview) and stays consistent with engine.terminalStates', async () => {
    const engine = realEngine()
    const { handlers } = makeHandlers({ engine, userId: 'USR-X' })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('registry-ops'), reply as never)

    // recordId-less call: preview runs from state 'draft' (existing behavior)
    // and the terminalStates field is lifecycle-scoped, not record-scoped.
    expect(body).toMatchObject({ lifecycleId: 'registry-ops', state: 'draft' })
    const declared = engine.terminalStates('registry-ops')
    expect((body as { terminalStates: string[] }).terminalStates).toEqual([...(declared ?? [])])
  })

  it('a lifecycle with NO terminal declarations echoes an empty array (no invented states)', async () => {
    // doc-review (the inline spec above) declares no terminal: true states.
    const { handlers } = makeHandlers({ userId: 'USR-X' })
    const reply = makeReply()

    const body = await handlers.getTransitions(makeRequest('doc-review'), reply as never)

    expect((body as { terminalStates: string[] }).terminalStates).toEqual([])
  })
})

