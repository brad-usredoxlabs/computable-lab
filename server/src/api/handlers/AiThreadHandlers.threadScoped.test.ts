/**
 * L2-THREAD-SCOPED-1 — handler/route-level pins for the thread-scoped key.
 *
 * The NO-FALLBACK RULE is pinned HERE (at the HTTP boundary) as well as in
 * the store: absent/malformed `x-cl-thread-id` => FRESH EMPTY thread — the
 * handler never reads another thread of the same (user, endpoint), never 4xx
 * on a bad header, never falls back to "most recently updated". Scope
 * (`x-cl-thread-scope`) is scope-filtered on the list route (amendment A-3)
 * and isolation is proven for the same (user, endpoint, threadId) under
 * different scopes (amendment acceptance (4)).
 *
 * Runs the REAL registration path (registerRoutes) with the REAL store —
 * the LabSettings/InventoryShelf route-test pattern (stub the mandatory
 * handler options, mount the optional handler under test).
 */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import type { RecordStore } from '../../store/types.js';
import { registerRoutes } from '../routes.js';
import { createAiThreadHandlers, type AiThreadHandlers } from './AiThreadHandlers.js';
import { AiThreadStore } from '../../ai-threads/AiThreadStore.js';

function stubRouteOptions(aiThreadHandlers: AiThreadHandlers) {
  const noop = async () => ({})
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
    aiThreadHandlers,
  }
}

interface FakeRecord {
  recordId: string
  payload: Record<string, unknown>
}

function fakeRecordStore(): { records: RecordStore; created: FakeRecord[] } {
  const created: FakeRecord[] = []
  const records = {
    create: async (opts: { envelope: { recordId: string; payload: Record<string, unknown> } }) => {
      created.push({ recordId: opts.envelope.recordId, payload: opts.envelope.payload })
      return { success: true, envelope: opts.envelope }
    },
  } as unknown as RecordStore
  return { records, created }
}

async function withApp<T>(
  fn: (app: FastifyInstance, store: AiThreadStore, storeRoot: string, created: FakeRecord[]) => Promise<T>,
): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), 'ai-thread-hdlr-'))
  try {
    const store = new AiThreadStore({ rootDir: root })
    const { records, created } = fakeRecordStore()
    const app = Fastify()
    registerRoutes(app, stubRouteOptions(createAiThreadHandlers(store, records)))
    return await fn(app, store, root, created)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

const POST_MSG = (content: string) => ({
  method: 'POST' as const,
  url: '/ai/threads/browser',
  headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-a' },
  payload: { message: { role: 'user', content } },
})

describe('AiThreadHandlers — thread-scoped routes (L2-THREAD-SCOPED-1)', () => {
  it('(1) two x-cl-thread-id headers for the same user+endpoint yield isolated transcripts', async () => {
    await withApp(async (app) => {
      const rA = await app.inject(POST_MSG('tab-A turn'))
      expect(rA.statusCode).toBe(200)
      const rB = await app.inject({
        ...POST_MSG('tab-B turn'),
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-b' },
      })
      expect(rB.statusCode).toBe(200)

      const getA = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-a' },
      })
      const getB = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-b' },
      })
      expect(getA.statusCode).toBe(200)
      expect(getB.statusCode).toBe(200)
      const a = getA.json()
      const b = getB.json()
      expect(a.messages.map((m: { content: string }) => m.content)).toEqual(['tab-A turn'])
      expect(b.messages.map((m: { content: string }) => m.content)).toEqual(['tab-B turn'])
      await app.close()
    })
  })

  it('(2) ABSENT x-cl-thread-id creates a fresh thread — no fallback to a sibling', async () => {
    await withApp(async (app) => {
      // Populate a header-carrying sibling thread.
      const rA = await app.inject(POST_MSG('sibling content'))
      expect(rA.statusCode).toBe(200)

      // No header at all => FRESH EMPTY thread (never the sibling's content).
      const freshGet = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice' },
      })
      expect(freshGet.statusCode).toBe(200)
      expect(freshGet.json().messages).toEqual([])

      // A POST without a header lands on ITS OWN fresh thread; the sibling
      // is untouched.
      const freshPost = await app.inject({
        method: 'POST',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice' },
        payload: { message: { role: 'user', content: 'fresh no-header' } },
      })
      expect(freshPost.statusCode).toBe(200)
      const sibling = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-a' },
      })
      expect(sibling.json().messages.map((m: { content: string }) => m.content)).toEqual(['sibling content'])
      await app.close()
    })
  })

  it('MALFORMED x-cl-thread-id is fresh-empty (200), never 4xx, never a sibling read', async () => {
    await withApp(async (app) => {
      await app.inject(POST_MSG('sibling content'))
      for (const bad of ['../../etc/passwd', 'a/b', '']) {
        const res = await app.inject({
          method: 'GET',
          url: '/ai/threads/browser',
          headers: { 'x-user-id': 'alice', 'x-cl-thread-id': bad },
        })
        expect(res.statusCode, `header ${JSON.stringify(bad)}`).toBe(200)
        expect(res.json().messages, `header ${JSON.stringify(bad)}`).toEqual([])
      }
      await app.close()
    })
  })

  it('D2: x-cl-thread-scope " .. "/"." is MALFORMED — fresh-empty 200, never the legacy flat file, list never surfaces it', async () => {
    await withApp(async (app, _store, root) => {
      // The reviewer's cycle-1 probe: the alphabet admitted dots, so a
      // ".." scope escaped {endpoint}/ into {user}/ and served the LEGACY
      // flat {user}/{endpoint}.json (200 + list entry). The dots-only
      // refusal in the shared alphabet guard maps it to fresh-empty "_"
      // semantics instead (NO-FALLBACK).
      const { mkdir: mk, writeFile: wf, readFile: rd } = await import('node:fs/promises')
      await mk(join(root, 'alice'), { recursive: true })
      await wf(
        join(root, 'alice', 'browser.json'),
        JSON.stringify({
          endpoint: 'browser',
          userId: 'alice',
          messages: [{ role: 'user', content: 'LEGACY CONTAMINATION', createdAt: '2026-10-28T00:00:00.000Z' }],
          mentions: [],
          updatedAt: '2026-10-28T00:00:00.000Z',
        }),
        'utf8',
      )

      // GET first for EVERY dots-only scope (fresh-empty): a POST would
      // land under "_" which ALL malformed scopes share, so the reads must
      // precede any writes or the second malformed scope would legitimately
      // see the first one's traffic.
      for (const dotsOnly of ['..', '.']) {
        const get = await app.inject({
          method: 'GET',
          url: '/ai/threads/browser',
          headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-x', 'x-cl-thread-scope': dotsOnly },
        })
        expect(get.statusCode, `scope ${dotsOnly}`).toBe(200)
        expect(get.json().messages, `scope ${dotsOnly}`).toEqual([])

        const list = await app.inject({
          method: 'GET',
          url: '/ai/threads/browser/threads',
          headers: { 'x-user-id': 'alice', 'x-cl-thread-scope': dotsOnly },
        })
        expect(list.statusCode, `scope ${dotsOnly}`).toBe(200)
        // The legacy flat file is NEVER surfaced as a thread.
        expect(list.json().threads, `scope ${dotsOnly}`).toEqual([])
      }

      // A POST with the malformed scope lands on the FRESH "_" thread.
      const post = await app.inject({
        method: 'POST',
        url: '/ai/threads/browser',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-x', 'x-cl-thread-scope': '..' },
        payload: { message: { role: 'user', content: 'must land under _' } },
      })
      expect(post.statusCode).toBe(200)

      const listAfter = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser/threads',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-scope': '..' },
      })
      // The malformed scope resolved to "_": the list shows the POSTED
      // thread under "_" — and NEVER the legacy flat file.
      expect(listAfter.json().threads.map((t: { threadId: string }) => t.threadId)).toEqual(['tid-x'])

      // The POST that carried scope ".." landed under the reserved "_"
      // segment, NOT over the legacy file — which is still byte-intact.
      const legacyRaw = await rd(join(root, 'alice', 'browser.json'), 'utf8')
      expect((JSON.parse(legacyRaw) as { messages: Array<{ content: string }> }).messages).toHaveLength(1)
      expect(JSON.parse(legacyRaw).messages[0].content).toBe('LEGACY CONTAMINATION')
      const { readdir } = await import('node:fs/promises')
      expect(await readdir(join(root, 'alice', 'browser', '_'))).toEqual(['tid-x.json'])
      await app.close()
    })
  })

  it('scope isolates at the HTTP boundary: same (user, endpoint, threadId), different x-cl-thread-scope', async () => {
    await withApp(async (app) => {
      const postA = await app.inject({
        method: 'POST',
        url: '/ai/threads/event-editor',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-1', 'x-cl-thread-scope': 'EVG-a' },
        payload: { message: { role: 'user', content: 'deck-a turn' } },
      })
      const postB = await app.inject({
        method: 'POST',
        url: '/ai/threads/event-editor',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-1', 'x-cl-thread-scope': 'EVG-b' },
        payload: { message: { role: 'user', content: 'deck-b turn' } },
      })
      expect(postA.statusCode).toBe(200)
      expect(postB.statusCode).toBe(200)

      const getA = await app.inject({
        method: 'GET',
        url: '/ai/threads/event-editor',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-1', 'x-cl-thread-scope': 'EVG-a' },
      })
      const getB = await app.inject({
        method: 'GET',
        url: '/ai/threads/event-editor',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-1', 'x-cl-thread-scope': 'EVG-b' },
      })
      const getNone = await app.inject({
        method: 'GET',
        url: '/ai/threads/event-editor',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'tid-1' },
      })
      expect(getA.json().messages.map((m: { content: string }) => m.content)).toEqual(['deck-a turn'])
      expect(getB.json().messages.map((m: { content: string }) => m.content)).toEqual(['deck-b turn'])
      // No scope => "_" scope: never reads another scope's file.
      expect(getNone.json().messages).toEqual([])
      await app.close()
    })
  })

  it('(3) GET /ai/threads/:endpoint/threads lists the user\'s threads for (endpoint, scope) only', async () => {
    await withApp(async (app) => {
      const headers = (scope?: string, threadId?: string) => ({
        'x-user-id': 'alice',
        ...(threadId ? { 'x-cl-thread-id': threadId } : {}),
        ...(scope ? { 'x-cl-thread-scope': scope } : {}),
      })
      await app.inject({ ...POST_MSG('first in A'), headers: { ...headers('EVG-a', 'tid-A') } })
      await app.inject({
        method: 'POST',
        url: '/ai/threads/browser',
        headers: headers('EVG-a', 'tid-A'),
        payload: { message: { role: 'assistant', content: 'a reply' } },
      })
      await app.inject({
        ...POST_MSG('B thread'),
        headers: { ...headers('EVG-a', 'tid-B') },
      })
      await app.inject({
        ...POST_MSG('scope-b msg'),
        headers: { ...headers('EVG-b', 'tid-A') },
      })
      await app.inject({
        ...POST_MSG('bob msg'),
        headers: { ...headers('EVG-a', 'tid-A'), 'x-user-id': 'bob' },
      })

      const list = await app.inject({
        method: 'GET',
        url: '/ai/threads/browser/threads',
        headers: headers('EVG-a'),
      })
      expect(list.statusCode).toBe(200)
      const body = list.json()
      expect(body.threads.map((t: { threadId: string }) => t.threadId).sort()).toEqual(['tid-A', 'tid-B'])
      const byId = Object.fromEntries(body.threads.map((t: { threadId: string }) => [t.threadId, t]))
      expect(byId['tid-A'].title).toBe('first in A')
      expect(byId['tid-A'].messageCount).toBe(2)
      expect(typeof byId['tid-A'].updatedAt).toBe('string')
      // Scoped: another scope's listing is its own.
      const listB = await app.inject({ method: 'GET', url: '/ai/threads/browser/threads', headers: headers('EVG-b') })
      expect(listB.json().threads.map((t: { threadId: string }) => t.threadId)).toEqual(['tid-A'])
      expect(listB.json().threads[0].title).toBe('scope-b msg')
      // Other user's threads never appear (alice's listing, bob's post).
      await app.close()
    })
  })

  it('(3) promotion moves EXACTLY the chosen thread: one record, payload byte-identical, only that thread cleared', async () => {
    await withApp(async (app, store, root, created) => {
      const hdr = (threadId: string, scope?: string) => ({
        'x-user-id': 'alice',
        'x-cl-thread-id': threadId,
        ...(scope ? { 'x-cl-thread-scope': scope } : {}),
      })
      // Populate the thread to promote + a sibling that must SURVIVE.
      await app.inject({
        method: 'POST',
        url: '/ai/threads/literature',
        headers: hdr('promote-1'),
        payload: { message: { role: 'user', content: 'promote me' } },
      })
      await app.inject({
        method: 'POST',
        url: '/ai/threads/literature',
        headers: hdr('promote-1'),
        payload: {
          message: { role: 'assistant', content: 'a promoted reply' },
          mentions: [{ kind: 'material', ref: { recordId: 'mat-9' }, label: 'Tris buffer' }],
        },
      })
      await app.inject({
        method: 'POST',
        url: '/ai/threads/literature',
        headers: hdr('sibling-1'),
        payload: { message: { role: 'user', content: 'keep me' } },
      })

      // The thread's FULL content as the store holds it BEFORE promotion —
      // the baseline the promoted payload must be identical to (D5: the
      // "byte-identical" claim must actually read the recorded payload).
      const beforeThread = await store.getThread('alice', 'literature', undefined, 'promote-1')
      expect(beforeThread.messages.map((m) => m.content)).toEqual(['promote me', 'a promoted reply'])

      const promoted = await app.inject({
        method: 'POST',
        url: '/ai/threads/literature/promote',
        headers: hdr('promote-1'),
        payload: { title: 'The promoted chat', recordId: 'CONV-9001' },
      })
      expect(promoted.statusCode).toBe(200)
      expect(promoted.json()).toMatchObject({ recordId: 'CONV-9001' })

      // D5: assert the RECORDED conversation payload's schema-visible fields
      // against the thread's content — one record, messages/mentions carried
      // byte-for-byte, identity + provenance fields honest.
      expect(created).toHaveLength(1)
      const payload = created[0]!.payload
      expect(created[0]!.recordId).toBe('CONV-9001')
      expect(payload.kind).toBe('conversation')
      expect(payload.title).toBe('The promoted chat')
      expect(payload.endpoint).toBe('literature')
      expect(payload.userId).toBe('alice')
      expect(payload.messages).toEqual(beforeThread.messages)
      expect(payload.mentions).toEqual(beforeThread.mentions)
      expect(payload.linkedArtifacts).toEqual([])
      expect(typeof payload.promotedAt).toBe('string')
      expect(payload.promotedBy).toBe('alice')
      expect(payload.provenance).toEqual({ mode: 'manual' })

      // The store cleared EXACTLY the promoted (scope, threadId): the
      // promoted file is empty; the sibling thread is byte-intact.
      const afterPromoted = await store.getThread('alice', 'literature', undefined, 'promote-1')
      const afterSibling = await store.getThread('alice', 'literature', undefined, 'sibling-1')
      expect(afterPromoted.messages).toEqual([])
      expect(afterSibling.messages.map((m) => m.content)).toEqual(['keep me'])
      // No whole-surface clear: a grep-able invariant — the sibling file
      // still exists on disk with its message.
      const siblingFile = join(root, 'alice', 'literature', '_', 'sibling-1.json')
      const { readFile } = await import('node:fs/promises')
      expect((JSON.parse(await readFile(siblingFile, 'utf8')) as { messages: unknown[] }).messages).toHaveLength(1)
      await app.close()
    })
  })

  it('promotion of an absent-header (fresh empty) thread is the honest 400', async () => {
    await withApp(async (app) => {
      await app.inject({
        method: 'POST',
        url: '/ai/threads/literature',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'has-content' },
        payload: { message: { role: 'user', content: 'not this thread' } },
      })
      const res = await app.inject({
        method: 'POST',
        url: '/ai/threads/literature/promote',
        headers: { 'x-user-id': 'alice' }, // no x-cl-thread-id
        payload: { title: 'T', recordId: 'CONV-9002' },
      })
      expect(res.statusCode).toBe(400)
      expect(res.json().error).toBe('Live thread is empty; nothing to promote')
      // The sibling with content is untouched.
      const sibling = await app.inject({
        method: 'GET',
        url: '/ai/threads/literature',
        headers: { 'x-user-id': 'alice', 'x-cl-thread-id': 'has-content' },
      })
      expect(sibling.json().messages).toHaveLength(1)
      await app.close()
    })
  })
})
