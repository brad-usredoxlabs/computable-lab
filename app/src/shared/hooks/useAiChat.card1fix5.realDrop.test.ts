/**
 * CARD1-FIX4 D4 (advc c10) — the Q2 "answered-fact drop" pin must bind the REAL
 * server drop path (AgentOrchestrator.ts:3085-3098), not a hand-rebuilt
 * `answeredIds` + direct `dropAnsweredRequestIds` call.
 *
 * The pre-fix Q2 unit-4 pin (reloadBoundary) manually built `answeredIds` and
 * called `dropAnsweredRequestIds` itself — it NEVER exercised the seam where the
 * shipped orchestrator computes `answeredIds` from the on-wire `clarificationAnswers`
 * and drops the re-derived facts (the CARD1-D2 re-extract answer turn's drop).
 *
 * This pin drives the REAL `createAgentOrchestrator().run()` through the
 * `event_shorthand` arm TWICE:
 *   turn 1 (fresh ask): the model emits the scientist-intent shorthand for a
 *     material the store does not seed (ambiguous) → needs-clarification → a real
 *     card with a canonical-stable `requestId` is emitted.
 *   turn 2 (answer): the model RE-EXTRACTS the same fact (same YAML) and the
 *     on-wire `clarificationAnswers[0].requestId` is the turn-1 card id. The
 *     real seam (3085-3098) computes `answeredIds` from that wire set and drops
 *     the re-derived fact → the follow-up carries ZERO clarification cards.
 *
 * The gate is proven two ways (the reviewer's D4 ask): (a) the answer turn with
 * the on-wire requestId DROPS to zero cards (the seam fires); (b) the SAME answer
 * turn with a requestId the thread did NOT answer does NOT drop (the gate is
 * keyed ONLY on the on-wire requestId — never prose) — the card survives.
 *
 * tsc hygiene (verify #2): the app tsconfig is ES2020 and the server graph is
 * ES2021/22 (`replaceAll`), so a STATIC (or tsc-resolvable) import of
 * `server/src/**` adds ~26 new errors. Per the sanctioned pattern
 * (useAiChat.card1fix5.reloadBoundary.test.ts:164), this file is a NODE-env
 * test that loads the server modules via NON-LITERAL dynamic imports
 * (concatenated specifier with the vite-ignore marker), so tsc never resolves
 * them and the 10-line baseline is preserved. NO freeform-compile mock is
 * taken: the event_shorthand arm compiles deterministically
 * (compileShorthandDeterministically, AgentOrchestrator.ts:3016; the freeform
 * compile never runs in that arm per :3026), so the real deterministic compile
 * runs for real.
 */
// @vitest-environment node
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'

/** From app/src/shared/hooks/ up to repo root (4 levels), then into server/src.
 *  Concatenated so tsc treats these as non-literal (unresolvable) dynamic
 *  imports and never pulls the server type graph into the app program. */
const AI_BASE = '../../../../server/src/ai/'

const realCwd = process.cwd
// vitest runs with cwd = <repo>/app, so the repo root is ONE level up.
const REPO_ROOT = resolve(realCwd(), '..')
const SERVER_DIR = resolve(REPO_ROOT, 'server')

const AMBIGUOUS_YAML = readFileSync(
  resolve(SERVER_DIR, 'src/ai/fixtures/shorthand-ambiguous-material.yaml'),
  'utf-8',
)

// Test seeds ONLY (repo rip-out rule): a plate labware the fixture's
// `labware: plate` binds to, and a known material that is NOT 'mystery goop',
// so the ambiguous material stays UNRESOLVED (needs-clarification).
const SEED_RECORDS = [
  {
    recordId: 'LAB-plate-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml',
    payload: { kind: 'labware', name: 'Plate', title: 'Plate', synonyms: ['plate'] },
  },
  {
    recordId: 'MAT-test-material-1',
    schemaId: 'https://computable-lab.com/schema/computable-lab/material.schema.yaml',
    payload: { kind: 'material', name: 'Test Reagent', title: 'Test Reagent', synonyms: ['test reagent'] },
  },
]

function mockStore() {
  return {
    get: vi.fn(async () => null),
    getRecord: vi.fn(async (id: string) => SEED_RECORDS.find((r) => r.recordId === id) ?? null),
    list: vi.fn(async (filter?: { kind?: string }) =>
      SEED_RECORDS.filter((r) => !filter?.kind || r.payload.kind === filter.kind),
    ),
    create: vi.fn(async () => { throw new Error('D4 turn must NEVER reach store.create') }),
    update: vi.fn(async () => { throw new Error('D4 turn must NEVER reach store.update') }),
    delete: vi.fn(async () => { throw new Error('D4 turn must NEVER reach store.delete') }),
  }
}

/** The model is scripted to emit the `event_shorthand` tool call on EVERY turn
 *  (the live re-extract answer pattern): turn 1 fresh ask, turn 2 the model
 *  re-emits the SAME shorthand doc (the answered fact re-derives). */
function stubShorthandModel() {
  let call = 0
  const completeStream = vi.fn(async function* (_request: { model?: string }) {
    call += 1
    const delta: Record<string, unknown> = { role: 'assistant' }
    const toolCall = {
      index: 0,
      id: `call-${call}-0`,
      type: 'function',
      function: {
        name: AGENT_INTENT_TOOL_NAME,
        arguments: JSON.stringify({ intent: 'event_shorthand', shorthand: AMBIGUOUS_YAML }),
      },
    }
    delta.tool_calls = [toolCall]
    yield {
      id: `resp-${call}`,
      choices: [{ index: 0, delta, finish_reason: 'tool_calls' }],
    } as unknown as { id: string; choices: Array<Record<string, unknown>> }
  })
  const complete = vi.fn(async () => ({
    id: 'resp-coerce',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: 'coerce slow path' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }))
  return { client: { complete, completeStream }, callCount: () => completeStream.mock.calls.length }
}

// AGENT_INTENT_TOOL_NAME is hoisted below the dynamic imports (it is imported
// from the server submitSuggestionTool via a non-literal dynamic import).
let AGENT_INTENT_TOOL_NAME = 'submitSuggestion'

describe('CARD1-FIX4 D4 — the answered-fact drop is the REAL seam (AgentOrchestrator.ts:3085-3098)', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('the on-wire requestId DROPS the re-derived card (seam fires); a non-answered requestId keeps it (gate is wire-keyed only)', async () => {
    // THE cwd must point at server/ for the WHOLE body — the vocabulary loader
    // resolves from process.cwd() at the FIRST dynamic import (before the
    // orchestrator even runs), and prompts resolve under server/. server/schema
    // is a symlink to the repo-root schema/, so server/ serves both. Restored in
    // the finally (guaranteed even on a throwing import).
    const cwdPatcher = () => SERVER_DIR
    process.cwd = cwdPatcher
    try {
      const { createAgentOrchestrator } = await import(/* @vite-ignore */ AI_BASE + 'AgentOrchestrator.js')
      const { AGENT_INTENT_TOOL_NAME: toolName } = await import(/* @vite-ignore */ AI_BASE + 'submitSuggestionTool.js')
      const { createResolveSpineFromContext } = await import(/* @vite-ignore */ '../../../../server/src/' + 'resolve/index.js')
      const { createLabwareLookup } = await import(/* @vite-ignore */ AI_BASE + 'compiler/labwareLookup.js')
      AGENT_INTENT_TOOL_NAME = toolName ?? 'submitSuggestion'

      const store = mockStore()
      const deps = {
        store,
        resolveSpine: createResolveSpineFromContext({ store: store as never }) as never,
        searchLabwareByHint: createLabwareLookup(store as never) as never,
      }
      const model = stubShorthandModel()
      const context = {
        labwares: [{ labwareId: 'LAB-plate-1', labwareType: 'plate', name: 'Plate' }],
        eventSummary: 'No events yet.',
        vocabPackId: 'liquid-handling/v1',
        availableVerbs: ['add_material'],
        runId: 'RUN-card1fix4-d4',
      }
      const run = (overrides: Record<string, unknown>) => {
        const orchestrator = createAgentOrchestrator(
          model.client,
          { getToolDefinitions: () => [], executeTool: vi.fn() },
          { model: 'test-model', temperature: 0.1, maxTokens: 512 },
          { maxTurns: 3 },
          deps as never,
        )
        return orchestrator.run({
          prompt: 'add 50 uL of mystery goop to A1',
          surface: 'workspace.deck',
          forceDraftTool: true,
          history: [{ role: 'user', content: 'add 50 uL of mystery goop to A1' }],
          context,
          ...overrides,
        })
      }

      vi.spyOn(console, 'log').mockImplementation(() => {})
      vi.spyOn(console, 'warn').mockImplementation(() => {})

      // TURN 1 — fresh ask (NO clarificationAnswers): a real card is emitted.
      const ask = (await run({})) as {
        success: boolean
        clarificationRequests?: Array<{ id: string; requestId?: string; unresolvedFact?: { label: string } }>
      }
      const askCards = ask.clarificationRequests ?? []
      expect(askCards.length).toBeGreaterThan(0) // the real builder emitted a card
      // The on-wire requestId the client will post back (canonical-stable,
      // content-keyed). This is the SAME id the seam keys on at 3086-3089.
      const askRequestId: string = askCards[0].id
      expect(typeof askRequestId).toBe('string')
      expect(askRequestId.length).toBeGreaterThan(0)

      // TURN 2 — answer with the ON-WIRE requestId the thread already posted
      // back. The real seam (3085-3098) computes answeredIds from it and drops
      // the re-derived fact -> the follow-up carries ZERO clarification cards.
      const answered = (await run({
        clarificationAnswers: [{ requestId: askRequestId, value: 'mystery goop' }],
        history: [
          { role: 'user', content: 'add 50 uL of mystery goop to A1' },
          { role: 'assistant', content: 'asking about the material' },
          { role: 'user', content: 'it is mystery goop' },
        ],
      })) as { clarificationRequests?: Array<unknown> }
      const answeredCards = answered.clarificationRequests ?? []
      // THE pin: the answered fact is DROPPED by the real seam (not re-opened).
      expect(answeredCards.length).toBe(0)

      // TURN 3 — the SAME answer turn but with a requestId the thread did NOT
      // answer. The gate is keyed ONLY on the on-wire requestId set (never
      // prose): the fact's id is OUT of the set, so it SURVIVES (card remains).
      const notAnswered = (await run({
        clarificationAnswers: [{ requestId: 'unresolved-c-not-answered-0000', value: 'something else' }],
        history: [
          { role: 'user', content: 'add 50 uL of mystery goop to A1' },
          { role: 'assistant', content: 'asking about the material' },
          { role: 'user', content: 'it is mystery goop' },
        ],
      })) as { clarificationRequests?: Array<unknown> }
      const survivedCards = notAnswered.clarificationRequests ?? []
      expect(survivedCards.length).toBeGreaterThan(0) // the card survives (not dropped)
      // It carries the SAME canonical-stable id (the content-keyed factRequestId
      // is stable across re-extracts) — proving the drop is wire-keyed, not a
      // re-ask.
      expect(survivedCards[0]).toHaveProperty('id', askRequestId)
    } finally {
      process.cwd = realCwd
      vi.restoreAllMocks()
    }
  })
})
