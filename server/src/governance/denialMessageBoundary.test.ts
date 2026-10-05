/**
 * QMS-6F (D4) — middleware-boundary proof driven through the REAL
 * RecordHandlers.updateRecord + REAL checkLifecycleTransition + REAL YAMLs:
 * the 422 error CODE `LIFECYCLE_TRANSITION_DENIED` is unchanged while the
 * MESSAGE becomes the failing guard's YAML `denialMessage`.
 *
 * Harness mirrors governanceStrictness.test.ts (fake Map store, real engine
 * loaded from schema/core/lifecycles). That fence file is NOT edited; this is
 * the new-test counterpart only.
 */
import { readFileSync } from 'node:fs'
import { describe, it, expect, vi } from 'vitest'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'
import type { FastifyRequest, FastifyReply } from 'fastify'
import type { RecordEnvelope, RecordStore, StoreResult } from '../store/types.js'
import { LifecycleEngine } from '../lifecycle/LifecycleEngine.js'
import { loadLifecyclesFromDir } from '../lifecycle/LifecycleLoader.js'
import type { LifecycleSpec } from '../lifecycle/types.js'
import { RoleResolver } from '../security/RoleResolver.js'
import { LocalIdentityService } from '../security/LocalIdentityService.js'
import { AuditEventService } from '../governance/AuditEventService.js'
import { createRecordHandlers } from '../api/handlers/RecordHandlers.js'

const here = dirname(fileURLToPath(import.meta.url))
const LIFECYCLES_DIR = join(here, '../../../schema/core/lifecycles')
const DOC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/document.schema.yaml'

function denialMessageFromYaml(): string {
  const spec = parse(readFileSync(join(LIFECYCLES_DIR, 'document-control.lifecycle.yaml'), 'utf-8')) as LifecycleSpec
  const approve = spec.transitions.find(t => t.to === 'approved')
  const guard = (approve?.guards ?? []).find(g => g.type === 'requires_different_person')
  return (guard as { denialMessage?: string } | undefined)?.denialMessage ?? ''
}

function envelope(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return {
    recordId,
    schemaId: DOC_SCHEMA_ID,
    payload: { recordId, ...payload },
    meta: { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', createdBy: 'USR-AUTHOR' },
  } as unknown as RecordEnvelope
}

function makeWorld() {
  const records = new Map<string, RecordEnvelope>()
  records.set('USR-AUTHOR', envelope('USR-AUTHOR', {
    kind: 'user', recordId: 'USR-AUTHOR', username: 'author', status: 'active',
  }))

  const store = {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    getByPath: vi.fn(async () => null),
    getWithValidation: vi.fn(async () => ({ success: true })),
    list: vi.fn(async () => [...records.values()]),
    create: vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
      records.set(options.envelope.recordId, options.envelope)
      return { success: true, envelope: options.envelope }
    }),
    update: vi.fn(async (options: { envelope: RecordEnvelope }): Promise<StoreResult> => {
      records.set(options.envelope.recordId, options.envelope)
      return {
        success: true,
        envelope: options.envelope,
        commit: { sha: 'abc1234', message: 'test update', timestamp: new Date().toISOString() },
      }
    }),
    delete: vi.fn(async (): Promise<StoreResult> => ({ success: true })),
    validate: vi.fn(async () => ({ valid: true })),
    lint: vi.fn(async () => ({ valid: true })),
    exists: vi.fn(async () => false),
  } as unknown as RecordStore

  const engine = new LifecycleEngine()
  loadLifecyclesFromDir(LIFECYCLES_DIR, engine)

  const handlers = createRecordHandlers(
    store,
    undefined,
    undefined,
    undefined,
    engine,
    undefined,
    {
      identityService: new LocalIdentityService(store),
      roleResolver: new RoleResolver(store),
      auditService: new AuditEventService(store),
      getPolicySettings: () => ({ enforceTransitionRoles: 'allow' }), // POL-SANDBOX: guard still binds
      getAppendOnlyKinds: () => ['audit-event', 'signature'],
    },
  )
  return { records, store, handlers }
}

function makeReply() {
  let statusValue = 200
  const reply = {
    status: (code: number) => { statusValue = code; return reply },
    send: (body: unknown) => { void body; return reply },
  }
  Object.defineProperty(reply, 'statusValue', { get: () => statusValue })
  return reply as unknown as FastifyReply & { statusValue: number }
}

describe('middleware denial boundary (QMS-6F / D4): CODE unchanged, MESSAGE declarative', () => {
  it('same-person approve: 422 LIFECYCLE_TRANSITION_DENIED kept, message == YAML denialMessage, state unchanged', async () => {
    const world = makeWorld()
    world.records.set('DOC-1', envelope('DOC-1', {
      kind: 'document', recordId: 'DOC-1', lifecycleId: 'document-control', state: 'in_review', createdBy: 'USR-AUTHOR',
    }))

    const reply = makeReply()
    const request = {
      params: { id: 'DOC-1' },
      body: { payload: { kind: 'document', recordId: 'DOC-1', lifecycleId: 'document-control', state: 'approved', createdBy: 'USR-AUTHOR' } },
      headers: { 'x-user-id': 'USR-AUTHOR' },
    } as unknown as FastifyRequest<{ Params: { id: string }; Body: { payload: Record<string, unknown> } }>

    const result = (await world.handlers.updateRecord(request, reply)) as unknown as Record<string, unknown>

    // CODE contract (fences governanceStrictness:265/279/349, AuditEventService:268): unchanged.
    expect(reply.statusValue).toBe(422)
    expect(result.error).toBe('LIFECYCLE_TRANSITION_DENIED')
    // MESSAGE contract (D4): the guard's YAML denialMessage verbatim — distinct, no role/password wording.
    expect(result.message).toBe(denialMessageFromYaml())
    expect(String(result.message)).toMatch(/different person/i)
    // Record state untouched.
    expect((world.records.get('DOC-1')!.payload as Record<string, unknown>).state).toBe('in_review')
  })
})
