/**
 * L2-CLARIFY-CARD-1 (DEFECT 6, ruling l2t1951 Q2 unit 4) — the TWO-TURN +
 * RELOAD pin at the server boundary:
 *
 *   ask -> answer -> (client re-sends ids) -> the follow-up carries no
 *   re-opened card for the answered requestId.
 *
 * What this file drives honestly from app/ (server/** is FROZEN, ZERO change):
 *
 *   PHASE 1 (session A, live): the ANSWER turn — the real hook sends the
 *     structured answer; the persist-sync effect POSTs the answer user
 *     message with `metadata.clarificationAnswers` (the persisted carrier)
 *     into the fake server's thread store. The carrier landing in the store
 *     is the "server boundary" of this pin.
 *   PHASE 2 (session B, simulated cold reload): a FRESH hook instance
 *     rehydrates the SAME thread (same sessionStorage tab id, the mint-once
 *     rule) from the persisted metadata — the rehydrated user message carries
 *     `clarificationAnswers` again (the hydration read leg).
 *   PHASE 3 (the follow-up): a plain prompt on the rehydrated thread RE-SENDS
 *     the answered requestId on the wire (`streamAssist` arg 7) — the
 *     "(client re-sends ids)" leg.
 *   PHASE 4 (bound to the shipped drop's contract): the wire set from the
 *     follow-up is fed into the SHIPPED server predicate
 *     `dropAnsweredRequestIds` (server/src/ai/AgentOrchestrator.ts:3085-3098
 *     consumes exactly this — `answeredIds` from the on-wire
 *     `clarificationAnswers`, then the drop) together with the re-derived
 *     fact: post-D3 the fact's id is canonical-stable
 *     (`factRequestId` = content key over the server's canonical-label fold of the fact label),
 *     so the re-extract re-mints the SAME id the ask offered — and the drop
 *     removes it. The unanswered fact survives (the negative case). NO
 *     re-opened card for the answered requestId.
 *
 * The ask leg is modeled by the requestId itself: the ask card's id is the
 * canonical-stable `factRequestId` of the unresolved fact (post-D3), so the
 * answer turn posts it back exactly as the picker does.
 *
 * RED pre-fix: with the persist carrier and/or the re-send union absent (the
 * pre-fix product shape) the rehydrated message carries no answers and the
 * follow-up wire is `[]` → the drop's set is empty → a no-op → the re-derived
 * fact SURVIVES (the re-opened card the defect describes). Mutation evidence
 * in the FIX-3 report (in-place revert, restored immediately).
 *
 * Transport note: the REAL aiThreadClient + threadTabIds run (the
 * hydrationClobber test's pattern); only the model stream (aiClient) is
 * mocked, and the thread store is a fake server that PRESERVES
 * `metadata` on POST — the persistence boundary this pin exists to cross.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import type { AiContext } from '../../types/aiContext'
import type { AiClarificationAnswer } from '../../types/ai'

// Mock the model stream only (same seam as useAiChat.empty / the persist
// pin). The thread transport runs REAL so the persisted carrier is what the
// hook itself POSTed.
vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

import { streamAssist } from '../api/aiClient'
import { useAiChat } from './useAiChat'

const mockAiContext: AiContext = {
  surface: 'event-editor',
  summary: 'Test summary',
  surfaceContext: {},
}

/** A `done` event so each send completes its turn (the isStreaming gate
 *  releases; the persist-sync effect POSTs the settled messages). */
const DONE = () => ({
  type: 'done',
  success: true,
  events: [],
  labwareAdditions: [],
  result: { success: true, events: [], labwareAdditions: [] },
})

// ---------------------------------------------------------------------------
// Fake server thread store (the persistence boundary). Mirrors the
// hydrationClobber router (thread GET/POST answered by the wire headers) but
// PRESERVES `metadata` on POST — that is the boundary this pin crosses.
// ---------------------------------------------------------------------------
interface StoredMsg {
  role: string
  content: string
  createdAt: string
  metadata?: Record<string, unknown>
}
let stored: StoredMsg[] = []

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input)
  const okJson = (b: unknown) => ({ ok: true, status: 200, json: async () => b })
  if (url.includes('/api/ai/threads/event-editor')) {
    const method = (init?.method ?? 'GET').toUpperCase()
    const thread = {
      endpoint: 'event-editor',
      userId: 'USR-TEST',
      messages: stored,
      mentions: [],
      updatedAt: new Date().toISOString(),
    }
    if (method === 'GET') return okJson(thread)
    const parsed = JSON.parse(typeof init?.body === 'string' ? init.body : '{}') as {
      message?: { role?: string; content?: string; metadata?: Record<string, unknown> }
    }
    if (parsed.message?.content) {
      stored = [
        ...stored,
        {
          role: parsed.message.role ?? 'user',
          content: parsed.message.content,
          createdAt: new Date().toISOString(),
          ...(parsed.message.metadata ? { metadata: parsed.message.metadata } : {}),
        },
      ]
    }
    return okJson(thread)
  }
  return okJson({})
})
vi.stubGlobal('fetch', fetchMock)

// The unresolved fact the (modeled) ASK turn re-derives on both sides of the
// reload. Its canonical-stable id (factRequestId, post-D3) is the requestId
// the ask card offered and the answer turn posts back — the SAME id the
// follow-up's re-extract re-mints, which is what makes the shipped drop's
// id-keyed comparison work across a reload.
const ASK_FACT = { label: '1 mM Clofibrate in DMSO', reason: 'unresolved material' }
const OTHER_FACT = { label: 'a different unresolved fact', reason: 'unresolved material' }

beforeEach(() => {
  stored = []
  sessionStorage.clear()
  const sa = streamAssist as ReturnType<typeof vi.fn>
  sa.mockClear()
  sa.mockImplementation(async function* () {
    yield DONE()
  })
})

describe('L2-CLARIFY-CARD-1 defect 6 (ruling l2t1951 Q2 unit 4) — two-turn + reload at the server boundary', () => {
  it('ask -> answer -> (client re-sends ids across a cold reload) -> the follow-up carries no re-opened card for the answered requestId', async () => {
    const sa = streamAssist as ReturnType<typeof vi.fn>
    // Import the SHIPPED server predicate (the drop's consumer is
    // AgentOrchestrator.ts:3085-3098, which builds `answeredIds` from the
    // on-wire clarificationAnswers and calls this exact function). The
    // module's vocabulary triplet resolves off process.cwd(); chdir is
    // unsupported in jsdom workers, so point the cwd getter at the repo
    // root for the import window and restore it immediately (the import
    // reads the triplet at module init).
    const prevCwd = process.cwd()
    const realCwd: () => string = process.cwd
    process.cwd = () => prevCwd + '/..'
    // The NON-LITERAL specifier is deliberate: the server tree type-checks
    // under the server's OWN tsconfig (ES2022), not the app's (ES2020) — a
    // static import into the app program adds 26 lib-mismatch errors to
    // `tsc -p app` (measured). A non-literal dynamic specifier is opaque to
    // the type-checker (typed any, no server graph in the app program) yet
    // resolved by vitest at runtime — the pin still exercises the SAME
    // function the shipped drop consumes.
    const spec = '../../../../server/src/ai/' + 'shorthandChat'
    // D6 (advc c10): the cwd getter is restored in `finally`, not immediately
    // after the import — if the dynamic import REJECTS (missing server graph,
    // resolver failure), a bare patch+restore would leave the patched getter
    // in place for every subsequent test in this worker. The `finally` makes
    // the restoration unconditional (the reviewer measured the pre-fix shape:
    // the restore line never ran on a rejected import).
    let m: any // eslint-disable-line @typescript-eslint/no-explicit-any — non-literal dynamic import; the original used the import's implicit `any`
    try {
      m = await import(/* @vite-ignore */ spec)
    } finally {
      process.cwd = realCwd
    }
    const dropAnsweredRequestIds: (
      facts: readonly (typeof ASK_FACT)[],
      answered: ReadonlySet<string>,
    ) => (typeof ASK_FACT)[] = m.dropAnsweredRequestIds
    const factRequestId: (fact: typeof ASK_FACT) => string = m.factRequestId
    const rA = factRequestId(ASK_FACT)
    // canonical-stable identity (post-D3): the re-extract re-mints the same
    // id the ask offered — the precondition of the shipped drop.
    expect(factRequestId({ ...ASK_FACT })).toBe(rA)
    expect(factRequestId(OTHER_FACT)).not.toBe(rA)

    // The structured answer the picker posts on the ANSWER turn (requestId
    // = the ask card's id = the canonical-stable fact id).
    const answer: AiClarificationAnswer = {
      requestId: rA,
      label: '1 mM Clofibrate in DMSO',
      value: '1 mM Clofibrate in DMSO',
    }

    // ---- PHASE 1 (session A, live): the answer turn -----------------------
    const sessionA = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
        endpoint: 'event-editor',
      })
    )
    await waitFor(() => expect(sessionA.result.current.threadId).toBeTruthy())
    sessionA.result.current.sendPrompt(`Use 1 mM Clofibrate in DMSO for ${rA}.`, undefined, {
      clarificationAnswers: [answer],
    })
    await waitFor(() => {
      expect(sa).toHaveBeenCalledTimes(1)
      expect(sessionA.result.current.isStreaming).toBe(false)
    })
    // the answer turn sent the fresh answer on the wire, and the ANSWER USER
    // MESSAGE carries it (the persist carrier's source).
    expect(sa.mock.calls[0][7]).toEqual([answer])
    expect(sessionA.result.current.messages.find((m) => m.role === 'user')?.clarificationAnswers).toEqual(
      [answer],
    )
    // THE BOUNDARY: the persist-sync effect POSTed the carrier into the
    // thread store — it now lives on the "server" side of the seam.
    await waitFor(() => {
      const carrier = stored.find((m) => m.metadata?.clarificationAnswers)
      expect(carrier, 'the answer user message POSTed its clarificationAnswers carrier').toBeTruthy()
      expect(carrier!.metadata!.clarificationAnswers).toEqual([answer])
    })
    sessionA.unmount()

    // ---- PHASE 2 (session B, simulated cold reload) -----------------------
    // A fresh hook instance (a fresh client process): the sessionStorage tab
    // id SURVIVES the reload (mint-once per (tab, scope)), so the hydration
    // GET rehydrates the SAME thread from the persisted metadata.
    const sessionB = renderHook(() =>
      useAiChat({
        aiContext: mockAiContext,
        onAcceptEvent: vi.fn(),
        onAddLabwareFromRecord: vi.fn(),
        endpoint: 'event-editor',
      })
    )
    await waitFor(() => expect(sessionB.result.current.threadId).toBeTruthy())
    // the rehydrated thread (user + assistant, exactly the POSTed messages)
    await waitFor(() => expect(sessionB.result.current.messages).toHaveLength(2))
    // the rehydrated answer user message carries its answers again (the
    // hydration read leg — this is what a cold reload restores, 1→1).
    const rehydrated = sessionB.result.current.messages.find((m) => m.role === 'user')
    expect(rehydrated?.clarificationAnswers).toEqual([answer])

    // ---- PHASE 3 (the follow-up): the client RE-SENDS the ids --------------
    sa.mockClear()
    sessionB.result.current.sendPrompt('Now draft the formulation.', undefined, {})
    await waitFor(() => expect(sa).toHaveBeenCalledTimes(1))
    const wire = sa.mock.calls[0][7] as AiClarificationAnswer[]
    // the follow-up's outgoing clarificationAnswers set carries the answered
    // requestId (rehydrated from the persisted carrier; the fresh set was
    // empty — this is purely the re-send leg).
    expect(Array.isArray(wire)).toBe(true)
    expect(wire.map((a) => a.requestId)).toEqual([rA])

    // ---- PHASE 4: bound to the shipped drop's contract ---------------------
    // The same construction AgentOrchestrator.ts:3085-3098 performs on the
    // on-wire set, fed the follow-up's re-derived facts: the answered fact
    // (re-minted under its canonical-stable id) is DROPPED — no re-opened
    // card; the unanswered fact survives (the negative case).
    const wireSet = new Set(
      wire
        .map((a) => (typeof a.requestId === 'string' ? a.requestId : ''))
        .filter((id) => id.length > 0),
    )
    const survivors = dropAnsweredRequestIds([ASK_FACT, OTHER_FACT], wireSet)
    expect(survivors).toHaveLength(1)
    expect(survivors[0]).toEqual(OTHER_FACT)
    expect(survivors.some((f) => factRequestId(f) === rA)).toBe(false)
  })

  it('D6 (advc c10): a REJECTING dynamic import still restores the process.cwd getter (the try/finally the main test now uses — not a post-import restore)', async () => {
    // The reviewer's hygiene defect: the pre-fix shape patched the getter,
    // imported, then restored on the line AFTER the import — a REJECTING
    // import left the patched getter in place for every subsequent test in
    // the worker. This pin drives that path directly: an unresolvable
    // specifier inside the SAME try/finally the fix uses. WITHOUT the finally
    // restoration (the pre-fix shape) the assertion below is RED — the getter
    // is still the patched one after the import rejects.
    const originalCwd = process.cwd
    const patchedCwd: () => string = () => originalCwd() + '/..'
    process.cwd = patchedCwd
    // THE non-literal (variable) specifier, mirroring the main test's `spec`:
    // Vite folds STRING-LITERAL concatenations and resolves them at transform
    // time (so a literal miss fails the suite's transform, not the test). A
    // VARIABLE specifier is opaque to the transform (the `@vite-ignore` leaves
    // it for the runtime resolver), so the rejection lands at RUNTIME — which
    // is exactly the path the finally-restore must survive.
    const badSpec = '../../../../server/src/ai/' + 'card1fix4-does-not-exist'
    let rejected = false
    try {
      await import(/* @vite-ignore */ badSpec)
    } catch {
      rejected = true
    } finally {
      // THE fix: unconditional restoration. Pre-fix this line did not exist
      // on the reject path (the restore ran only after a successful import).
      process.cwd = originalCwd
    }
    expect(rejected).toBe(true) // the import actually rejected (the path is proven)
    expect(process.cwd).toBe(originalCwd) // the getter is back to the ORIGINAL function
    expect(process.cwd()).toBe(originalCwd()) // and the ORIGINAL behavior (string) too
  })
})
