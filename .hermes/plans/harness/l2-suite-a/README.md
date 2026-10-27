# L2-SUITE-A — prompt-suite driver harness (plate leg, prompts 1-8)

Standing, re-runnable driver for Brad's corpus prompts 1-8 (UC-D2/D3) through the
universal chat, against the lane-2 stack. Layer (a) = this harness
(deterministic headless probe, WRITE-FREE, zero model-UI involvement). Layer (b)
= cl-browser-reviewer vision receipts against :5193 (ORCH-OWNED, post-merge).

## How to run

cwd = the lane worktree root:

    python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --base http://localhost:3093
    python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --prompts 2 --single --base http://localhost:3093
    python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --compare expectations/ --base http://localhost:3093

- `--all`: prompts 1-8 IN ORDER in ONE held conversation (OQ2: fail-fast with
  disclosure; a failed prompt downgrades dependents to `blocked-by-P<n>`).
- `--prompts N [--single]`: drive one prompt. `--single` is a DEBUG AID (request-
  injected pre-seeded deck via `--preseed-plate LAB-1,LAB-2`) — NEVER an
  acceptance form for P7 (OQ2: P7's claim is the live cross-turn hold).
- `--compare DIR`: byte-compare the deterministic channel shapes (events_count,
  cards_count, wall, verdict) of prompts marked `deterministic: true` in DIR.
- `--timeout`: per-turn HTTP/SSE timeout (default 240 s).
- Env: `CL_DATA_REPO` (write-free digest root, default
  `/home/brad/.computable-lab/worktrees/main`), `CL_RECEIPTS` (receipts root,
  default `/home/brad/.hermes/cl/receipts/L2-SUITE-A`), `CL_SUITE_RUN_PREFIX`.

Exit codes: 0 = every driven prompt got an honest verdict AND met its
expectation channels; 1 = at least one prompt FAILED (silent shape or
expectation violation) — per-prompt lines still print; 2 = environment error.

Per-prompt receipts: `prompt-N.json` under a fresh `<UTC-ts>/` dir in the
receipts root, plus `run-meta.json` (verdict table, corpus sha, write-free
digest before/after, the B5 key-evidence trail).

## The captured wire shape (OQ4 ruling — MEASURED at trunk tip d037ade9)

The merged universal deck pane (`app/src/event-editor/deck/DeckSurfaceChat.tsx`,
post CHAT-1 701f80c0 + gatefix b1089ffc) declares `surface: 'event-editor'`
(:64). `app/src/shared/api/aiClient.ts:233-236` forks on that surface:

    const endpoint = surface === 'event-editor'
      ? `${API_BASE}/ai/draft-events/stream`
      : `${API_BASE}/ai/assist/stream`

**THE MERGED UNIVERSAL DECK CHAT RIDES THE LEGACY `/api/ai/draft-events/stream`
PATH** — that is the path this harness drives. `config/drafting/
shorthand-drafting.yaml:12` still says `surfaces: [workspace.deck]` (UNCHANGED —
CHAT-1 added no surface id). A legacy-path gap on composition expansion or the
computed well set (P3-P7) is an ARCHITECT FINDING routed by orch, not a coder
fix-run and not a weakened expectation.

### Exact request body (JSON branch; files=None — the corpus never attaches)

`aiClient.ts:255-258` (event-editor branch): the body carries NO `surface` key
and omits `enableThinking` (undefined ⇒ key absent, conditional spread):

    POST /api/ai/draft-events/stream
    Content-Type: application/json
    {
      "prompt":   <verbatim prompt text from prompts-plate-leg.txt>,
      "context":  <the surfaceContext + mentions + editorMode, below>,
      "history":  <[{role, content} pairs, ≤20, content trimmed —
                   useAiChat.buildConversationHistory]>,
      // enableThinking ABSENT (undefined on the deck chat)
    }

Server side (`server/src/api/handlers/AIHandlers.ts` `draftEventsStream`, the
`createAIHandlers(orchestrator)` impl the stack serves when an LLM is
configured): JSON branch reads `body.prompt / body.context / body.history /
body.attachments / body.deterministicOnly / body.enableThinking /
body.clarificationAnswers`, then `orchestrator.run({prompt, context, history?,
forceDraftTool: true (always on this path — !deterministicOnly), onEvent})`
and streams SSE `data: {json}\n\n` frames: `status`, `tool_call`, `error`,
`done` (result = the AgentResult; the done frame is terminal).

NOTE (resume-run finding, d037ade9): the DETERMINISTIC-ONLY fallback impl
(createDeterministicOnlyAIHandlers, served when NO LLM is configured) requires
`deterministicOnly: true` in the body and 503s `AI_UNAVAILABLE` otherwise —
the merged client's plain JSON shape (this harness's shape) is the REAL
orchestrator's wire, and the harness's smoke against the live real-LLM stack
confirms 200 + frames (see report, Leg C smoke).

### The `context` object (byte-stable identity fields, B5)

Assembled by `useAiChat.ts:855-863` (mentions + editorMode) over the
`DeckSurfaceChat.tsx:66-84` surfaceContext — same fields, same key order:

    {
      "eventGraphId":  "eg-<runId>",          // harness-owned (OQ1: no run writes)
      "runId":         "<runId>",            // harness-owned, unique per suite run
      "platformId":    "manual",
      "variantId":     "manual_freeform",    // defaultManifests.ts — Manual Bench (freeform)
      "vocabPackId":   "liquid-handling/v1",
      "placementCount": <int>,
      "eventCount":     <int>,
      "labwares":       [{"labwareId","labwareType","name"(, "rows","columns" for grid addressing)}],
      "eventSummary":   "<last-20 getEventSummary join; 'No events yet.' when empty>",
      "availableVerbs": [<verb list of the vocab pack>],
      "selection":      null,                // ABSENT selection ⇒ null (the client's shape)
      "mentions":       [],                  // parsePromptMentions(prompt); the corpus has no [[kind:...]] tokens
      "editorMode":     "deck"
    }

Identity fields (eventGraphId, runId, platformId, variantId, vocabPackId,
editorMode) NEVER change between turns; only the ghost-mounted volatile fields
(labwares, placementCount, eventCount, eventSummary) advance when a turn
delivers a draft — exactly the product's own post-accept behavior. The
held-thread key is `deriveContextCacheKey(surface, context)`
(systemPrompt.ts:650 ⇒ `event-editor:<runId>` here); each receipt records the
identity-sha (`context_identity_sha256`) as the B5 evidence.

The deck state the server sees is REQUEST-INJECTED via `context.labwares`
(AgentOrchestrator.ts:1320 shorthandDeckLabwares; :1681 ctxLabwares) — the
FREEFORM probe-injection point sanctioned by OQ1. The layer-(a) ghost-mount
equivalent is `lib/context_state.py` (a placement per resolved labware offer /
labware addition, preview ghosts for generic requirements, well-state
accumulation for the COMPUTED P7 set — B3: never a literal).

## The honesty rule (ONE trichotomy, three feeds — OQ3 ruling)

Per prompt, the done result MUST satisfy `assertHonestOutcome`
(`server/src/ai/honestOutcome.ts`, L2-FREEFORM-1's committed helper — CONSUMED,
never re-implemented, never edited):

- `events-bound` — events>0 AND every event's labwareId ∈ deck ids ∪ resolved
  record ids (when the probe supplies the id sets);
- `cards` — clarification cards>0, no error (answerable);
- `honest-failure` — an error that names itself (checked BEFORE cards — H4);
- anything else (silent success+zero+zero+no-wall; unbound raw-label
  labwareId) ⇒ the helper THROWS ⇒ verdict absent ⇒ the turn FAILS
  (REVISE-GHOST-1: success + zero mountable events + zero cards + no honest
  wall = whole-suite FAIL).

Feeds: (1) the TS helper in-process; (2) `lib/honest-cli.ts` — the thin node
CLI bridge (node ≥22.18 type-stripping; `node lib/honest-cli.ts`) the python
driver shells out to; (3) `lib/verdict.py` — the driver's structural re-encode
(used in-line; `lib/verdict-cli.py` is its stdin/stdout form). The pinned
parity pin `server/src/ai/L2SuiteA.honestOutcome.parity.test.ts` feeds all
three the SAME five FREEFORM acceptance #2 fixtures (a)-(e) and asserts
identical verdicts — drift is a defect.

    cd server && npx vitest run src/ai/L2SuiteA.honestOutcome.parity.test.ts
    bash .hermes/plans/harness/l2-suite-a/test-honest-cli.sh   # CLI fixture smoke

## The corpus (B6)

`prompts-plate-leg.txt` is the byte-identical slice of
`/mnt/vast/home/brad/git/computable-lab/tmp/prompt_files.md` lines 3-17 (sha256
pair in the report). The prompt-4 leading space, the prompt-6 "All" (sic), and
the prompt-8 double space are PROMPT CONTENT. Never re-type prompts in code.

## Well-range semantics (B3)

`expectations/P3..P6.json` pin the COMPILER's own expansion —
`server/src/ai/wellRange.ts expandWellTokens` via `lib/well-expansions.ts`:
B1:H6=42, A2:H6=40, A2:H2=8, A3:H3=8. P7's expected set is COMPUTED from the
run's own accumulated receipts (`wellset: computed:union-of-prior-material-wells`),
never a literal. No well-set/lexicon logic is ever added to server TS as a
"fix" for a prompt.

## Expectations (B1/B4/B9)

`expectations/P<n>.json` = the per-prompt channel SHAPES (verdict_in, outcome,
wells, channel_semantics, badge `never` list, kind_not/kind_in,
wellset/require_mix_params). Keys the wire encodes as ABSENT stay ABSENT in
the JSON (never `null` — exactOptionalPropertyTypes discipline, B1). Badge
assertions only forbid the dishonest word ("Ontology" for a composition /
local record — UC-D4) and never pin prose (B9: `deterministic: false` until a
prompt's channel shapes prove stable across runs; model-call
nondeterminism is disclosed per prompt in the report).

## Write-free (OQ1 / B10)

Layer (a) NEVER calls accept/apply/promote routes. Deck state rides
request-injected `context.labwares`; the driver asserts zero writes by
digesting the data-repo record tree (relpath+size fingerprint) before/after in
`run-meta.json`. Writes belong ONLY to the browser drive (layer (b), orch-owned)
against harness-owned state.

## Failure meaning

- `verdict=None` (silent shape) on any prompt = the suite's core FAIL
  (REVISE-GHOST-1) — the harness prints the delivered-channel dump from the
  helper's throw.
- `blocked-by-P<n>` = OQ2 disclosure: a prior prompt failed; dependents were
  NOT driven (never a silent skip, never a fake pass).
- `http=-1` = transport/timeout (e.g. engine-admission stall — the previous
  run's death mode): an environment error, recorded, not an honest verdict.
- Expectation violations (wrong well set, 8-channel semantics, kind, badge) =
  a REAL product finding — expose it (receipt + report), do NOT paper over it;
  fixes are separate fix-runs with their own RED.

## Files

    run-suite-a.py            # the driver (python3, stdlib-only)
    prompts-plate-leg.txt     # prompts 1-8, byte-identical corpus slice (B6)
    expectations/P1..P8.json  # per-prompt channel shapes
    lib/verdict.py            # the driver's python re-encode of the trichotomy
    lib/verdict-cli.py        # its stdin/stdout form (parity-pin feed #3)
    lib/honest-cli.ts         # the thin node CLI over the TS helper (feed #2)
    lib/context_state.py      # the layer-(a) ghost-mount state accumulation
    lib/well-expansions.ts    # compiler-expansion emitter (expectations source)
    test-honest-cli.sh        # the five-fixture CLI smoke
    ../../../server/src/ai/L2SuiteA.honestOutcome.parity.test.ts  # the parity pin
