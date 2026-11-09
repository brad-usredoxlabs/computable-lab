# Spec-of-record DRAFT — L2-DEGEN-RETRY-1 (lane 2, composer l2t1735, 2026-10-28)

Status: DRAFT — not canonical until the orchestrator reviews + promotes.
Trunk at authoring: `cl/integration-2` @ b622a865 (all file:line cites re-verified
first-hand by the composer at this sha unless marked [unverified]).

## Intent (one sentence)

When a forced-tool-call draft turn ends with the mechanical degenerate signature
(finish=stop + empty content + zero tool calls + null coercion) — the signature the
coercion path ALREADY detects and only logs today — the harness re-issues the SAME
request exactly once (upstream degeneration is stochastic), and only if the retry is
ALSO degenerate does the failure surface a new honest text that names the class
instead of blaming the biologist's wording.

## Approved task-block text (verbatim acceptance — do not re-scope)

Title: "Degenerate-forced-tool-call defense: named server-side retry + honest
surfacing when the AI provider returns an empty-content turn (ends misattributing
upstream faults to the scientist's wording)"

Verified by (verbatim from the task list):

> Vitest (server): (1) stub the model client to return stop+empty content+no
> tool_calls on call 1 and a valid agent_intent tool call on call 2 -> turn
> completes with a proposal and the recovery is logged; (2) both calls degenerate
> -> exactly ONE retry (call count == 2), error text names the degenerate class
> and does NOT contain "rephrasing"; (3) genuine-empty-args case (args present,
> no events/clarifications) still gets the OLD honest text — the 3-branch
> contract is extended, not replaced; (4) non-degenerate turns make zero extra
> calls. Existing suites green: clarificationLoop.test.ts,
> AgentOrchestrator.protocolEditRecovery.test.ts (both cite this message).
> Browser receipt optional-light (:5193): no product-visible surface change is
> required beyond the failure text; if the pane renders the new error string,
> one screenshot suffices.

Honest-failure text (task block, verbatim — ride it as a constant):
"the AI provider returned a degenerate response (no tool call, no content) twice —
this is not your wording; the request was fine. Retry, or the turn may be re-routed."

Recovery log (task block): `degenerate-response recovered on retry (provider=X)` —
provider X comes from the orproxy calls.log via the traceId correlation; the code
logs the recovery with the existing `[agent ${tid}]` prefix and NEVER a provider
literal. The task's "correlation hint if trivial" ruling: the tid already rides
every orchestrator log line and logAgentSummary — add NO new plumbing.

## Ground truth re-verified at b622a865 (composer first-hand)

- `server/src/ai/draftArgDiagnostics.ts:118` — `emptyDraftMessage({truncated,
  hadArguments})`, the 3-branch honest-text contract. Branch 1 (truncated) text
  ends "…ask for fewer wells at a time." (:120-124). Branch 2 (`!hadArguments`)
  ends with `'Nothing was applied — try rephrasing, or name the material explicitly.'`
  at :128. Branch 3 (args present, no usable draft) carries the SAME rephrasing
  sentence at :133. NOTE (handoff l2t1735 17:40 flagged this, composer confirms):
  the task text said "third branch" only, but BOTH branches 2 and 3 end with the
  rephrasing sentence. The degenerate class gets its OWN arm/message; branches 1-3
  keep their bytes.
- Existing pins on those exact bytes: `server/src/ai/clarificationLoop.test.ts:83-106`
  (3 describe-legs on emptyDraftMessage) and
  `server/src/ai/AgentOrchestrator.freeformLegs.test.ts:725` —
  `expect(result.error).toBe(emptyDraftMessage({ truncated: false, hadArguments: true }))`
  — a `toBe` byte-equality pin. Extension must keep every existing branch byte-identical.
- emptyDraftMessage call sites (all unchanged by this task): AgentOrchestrator.ts
  :1882, :2753, :2845, :3900-3902, :4262. (grep-verified.)
- `server/src/ai/AgentOrchestrator.ts:2020` — `for (let turn = 0; turn <
  effectiveMaxTurns; turn++)` per-turn loop. Streaming accumulation with
  `let finishReason: 'stop' | 'tool_calls' | 'length' | null = null` at :2058;
  reassembly normalizes `finish_reason: finishReason ?? 'stop'` at :2201.
  On forced-tool draft flow, `text_delta` emission is SUPPRESSED
  (`draftFlowMode !== 'forced-tool'` gate at :2109) — a degenerate empty-content
  attempt emits NO text_delta to the chat pipe (only `status` events).
- `server/src/ai/AgentOrchestrator.ts:2270-2276` — `const assistantMsg =
  choice.message;` then `messages.push(assistantMsg);` (:2271), then
  `contentLen` (:2273), `tcCount` (:2274), and the arm-log line
  `[agent ${tid}] turn N finish=… contentLen=… toolCalls=…` (:2276). THIS is the
  natural signature-computation point (the quantities already exist there).
- `server/src/ai/AgentOrchestrator.ts:2282` — coercion region opens:
  `if (!assistantMsg.tool_calls?.length && forceDraftTool && !isDocDiscussionTurn)`.
  Fast inline path `coerceDraftArgsFromContent` + `coerceToAgentIntentArgs`
  (:2291-2299); on empty content inlineArgs is null, falling to:
  - :2335 `forcedToolComplianceEntry(compliancePolicy, surfaceName)` — the DATA
    arm (config/drafting/forced-tool-compliance.yaml, loaded PER call at :1299,
    silent-off for unlisted surfaces; entries exist for `sequences` and
    `workspace.deck` with maxRetries 1 + nudge push at :2350-2354; honest
    complianceFailure return at :2359-2362).
  - :2364+ slow coercion: a SECOND inference call `inferenceClient.complete(...)`
    with `buildForcedDraftJsonPrompt`; on success synthesizes the tool call and
    logs `model ignored forced tool call; coerced JSON args after stop as …
    contentPreview="<empty>"` at :2429 — the x6 regate-4 degenerate-signature
    trail; on null coercion logs `failed to coerce compiler args…` (:2431).
  - :2439 second `!assistantMsg.tool_calls?.length && forceDraftTool` gate —
    terminal error `AI stopped without calling ${COMPILE_EVENT_GRAPH_DRAFT_TOOL_NAME},
    and compiler-argument fallback did not produce valid JSON. Last text: …` with
    the proseRouted/echo-guard notes routing (:2457-2471) — on EMPTY content
    `finalProse` is `''` so proseRouted is false and the error channel fires.
- Message family home is draftArgDiagnostics.ts (header :1-17 — the
  "never drop / never misattribute" doctrine this task extends).

## Design (binding, smallest-change)

1. MESSAGE CONTRACT (draftArgDiagnostics.ts). Add to the same module the honest
   class text as the degenerate arm of the message family — the task says
   "extended, not replaced". Recommended shape (coder may choose the equivalent):
   `emptyDraftMessage(options: { truncated: boolean; hadArguments: boolean;
   degenerateEmptyResponse?: boolean })` where `degenerateEmptyResponse === true`
   returns the verbatim class text (a `degenerate` arm takes precedence over the
   other branches), or a dedicated exported `degenerateResponseMessage()` that
   `emptyDraftMessage`'s options delegate through. Branches 1-3 bytes unchanged.
   exactOptionalPropertyTypes: callers pass the flag ABSENT or `true` — NEVER
   `undefined` (CLAUDE.md rule 6, :156). Conditional spread idiom:
   `...(isDegenerate ? { degenerateEmptyResponse: true } : {})`.
2. RETRY HOOK (AgentOrchestrator.ts). Attach the mechanical-signature check at
   :2270-2282 — AFTER `const assistantMsg = choice.message` (:2270) and BEFORE
   `messages.push(assistantMsg)` (:2271), so the dead attempt never pollutes
   `messages` history (an empty assistant turn riding back is exactly the
   pattern-completion fuel the echo guards fight). Signature (ALL of):
   `forceDraftTool && !isDocDiscussionTurn && choice.finish_reason === 'stop'`
   (normalized value, :2201) `&& content is absent-or-blank` (trim length 0 —
   reuse the contentLen quantity pattern at :2273) `&& no tool_calls`. This is the
   pre-coercion face of the signature the task names ("stop + empty content + no
   tool_calls + null coercion"): inline coercion of empty content is null by
   construction, so at this point the four-part signature holds.
   On signature match, a per-run `let degenerateRetryConsumed = false` declared
   next to `forcedToolComplianceAttempts` (:2018):
   - Not consumed yet AND `turn + 1 < effectiveMaxTurns`: set consumed; log
     `[agent ${tid}] degenerate forced-tool turn (stop + empty content + no tool
     calls) — re-issuing the request once`; `continue` the turn loop WITHOUT
     pushing the dead assistant message. The retry re-enters the loop top
     (:2020-2050) and rebuilds the SAME `completionReq` from the same inputs
     (messages untouched, same model/temperature/max_tokens/cache_key/tools/
     tool_choice) — same request, byte-identical payload, temperature unchanged
     (the task's own evidence: the identical prompt returned a valid tool call
     seconds later; forcing temp 0 would fight that).
   - Already consumed (second degeneracy): return the honest failure DIRECTLY:
     `error: <degenerate class text>`, success:false, standard usage block,
     `logAgentSummary` with the error (parity with neighboring failure arms) —
     and skip the slow coercion call entirely (leg 2 pins total call count 2;
     a coercion `complete` call would make it 3 and buys nothing on a
     double-degenerate). Emit `onEvent?.({type:'error', message})` like the
     :2481 arm does for the error channel.
   - Turn-budget exhausted at first signature (`turn + 1 >= effectiveMaxTurns`):
     fall through to the CURRENT path unchanged (no retry possible) — do not
     consume or block anything.
   - Recovery (retry attempt produced tool_calls or usable content): the normal
     flow handles it; additionally, when the retry attempt SUCCEEDS after the
     signature fired, log once:
     `[agent ${tid}] degenerate-response recovered on retry` (traceId rides the
     prefix — provider identity is resolved offline from the orproxy calls.log
     per the task; NO provider-name literal anywhere in code).
   - Dead-attempt observability: push a turnStats entry for the degenerate
     attempt (durationMs, finishReason 'stop', zero tool stats) — the `turns`
     count in usage will reflect both attempts; this is intended, log-traceable
     honesty, and leg assertions are on the client spy counts, not turn counts.
   - Streamed events for the dead attempt: resolved by code reading, not
     guesswork — forced-tool mode suppresses text_delta (:2109), so the dead
     attempt emits only transient `status` events ("AI request sent to …",
     heartbeat "still running" lines). Spec ruling: do NOT attempt to retract
     them; the retry's own "AI request sent" status is self-explanatory in the
     pipe. No new event kind.
3. COEXISTENCE with the compliance arm (:2335-2362). The degenerate signature
   (empty content) takes PRECEDENCE over the nudge arm when it matches — the nudge
   targets non-empty prose non-compliance (echo/summary restatement), a different
   class with non-empty content; the nudge path is untouched for everything that
   is not the degenerate signature. The degenerate retry does NOT increment
   `forcedToolComplianceAttempts` (separate budget, separate class). See OQ1.
4. NON-DEGENERATE turns (any content, any tool call, finish=length, doc-discussion,
   non-forced surfaces): zero behavior change — the signature check is
   side-effect-free until it matches.

## File map

IN SCOPE (server-only):
- `server/src/ai/AgentOrchestrator.ts` — signature check + single retry + recovery
  log at :2270-2282 region; honest-failure return; message-flag plumbing at the
  sites that end on an empty-draft error after a consumed retry (the double-
  degenerate return at the retry site itself; the :2439 terminal block may ALSO
  route its error through the new arm if the signature had fired this run —
  coder decision, pinned by a test either way).
- `server/src/ai/draftArgDiagnostics.ts` — message contract extension (design 1).
- `server/src/ai/clarificationLoop.test.ts` — add degenerate-arm legs to the
  existing emptyDraftMessage describe (:83): new text present, contains
  "degenerate" and "not your wording", does NOT contain "rephrasing"; the three
  existing legs stay as-is.
- NEW test file `server/src/ai/AgentOrchestrator.degenerateRetry.test.ts` — the
  4 legs. Reuse the stub shape from
  `AgentOrchestrator.protocolEditRecovery.test.ts:57-79` (async-generator
  `completeStream` + `complete` spy). Pass
  `forcedToolCompliancePolicyPath` (:1299 reads it; constructor option) pointing
  at a nonexistent path for silent-off policy on legs 1/2/4 unless the leg
  deliberately tests an unlisted surface; a tool-call streaming stub must follow
  the accumulator shape at :2114+ (delta.tool_calls index/id/function fragments)
  or the non-streaming shape the freeformLegs suite uses.

OUT OF SCOPE (hard):
- Everything under `app/` — server-only diff; `git diff --name-only` must show
  zero `app/` paths. (The task's "browser receipt optional-light" is not this
  coder's deliverable unless the pane string is rendered; the error text already
  flows over the existing wire, no client change.)
- `server/src/ai/shorthandChat.ts` (has its own emptyDraftMessage-family comment
  at :1472) and its loop — task's files field excludes it.
- `config/drafting/forced-tool-compliance.yaml` — untouched (see OQ3).
- The other emptyDraftMessage call sites (:1882, :2753, :2845, :3900, :4262) —
  bytes and behavior unchanged.
- No provider names, surface names, or schema names as new literals; no new
  event kinds; no turn-loop restructuring; no streaming-protocol change.

## Mechanical floor — RED-first, the 4 vitest legs

Write `AgentOrchestrator.degenerateRetry.test.ts` FIRST, watch all 4 legs RED,
then implement. RED expectations at b622a865 (why each fails today):
- Leg 1 (recovered-on-retry): today a stop+empty+no-tool-call turn makes exactly
  1 `completeStream` call, the slow `complete` coercion returns whatever the stub
  gives, and the run ends in the :2439 error — no second stream call, no
  proposal. Assert: `completeStream` spy called 2x, second attempt's tool call
  produces a proposal result, and a captured console log contains
  `degenerate-response recovered on retry`.
- Leg 2 (double-degenerate, ONE retry): both streams degenerate. Assert:
  `completeStream` spy count === 2 AND `complete` spy count === 0 (the skip-
  coercion ruling), result.success false, `result.error` contains
  "degenerate response" and "not your wording" and does NOT contain
  "rephrasing". (Today: 1 stream + 1 complete, wrong error text → RED.)
- Leg 3 (genuine-empty-args keeps OLD text): tool call present, args present,
  zero substantive channels → error `toBe` the branch-3 string via
  `emptyDraftMessage({truncated:false, hadArguments:true})` — mirrors
  freeformLegs.test.ts:725; GREEN by construction and must STAY green after the
  extension (byte-equality pin on the rephrasing sentence).
- Leg 4 (non-degenerate zero extra calls): a normal native tool-call turn —
  `completeStream` exactly 1x, `complete` 0x. GREEN today; must stay green (the
  no-regression pin on the signature check's side-effect-freedom).

## Existing suites that must stay green

- `server/src/ai/clarificationLoop.test.ts` (emptyDraftMessage legs :83-106)
- `server/src/ai/AgentOrchestrator.protocolEditRecovery.test.ts` — its stub's
  content is NON-empty (`[AgentUI error: message type must be set]`, test file
  :63-67), so the trim-empty signature must NOT fire on it; if it does, the
  signature is wrong (e.g. someone keyed on finish=stop alone).
- `server/src/ai/AgentOrchestrator.freeformLegs.test.ts` (:725 byte pin) and the
  forced-tool compliance pins (SH-QC-1S / HARNESS-SEQ-2 legs live in the
  suites touching :2335 — the full server run catches collisions; see OQ1).

## Verification commands (expected outputs)

From the coder worktree root:
1. Targeted (RED then GREEN): `cd server && npx vitest run
   src/ai/AgentOrchestrator.degenerateRetry.test.ts src/ai/clarificationLoop.test.ts
   src/ai/AgentOrchestrator.protocolEditRecovery.test.ts
   src/ai/AgentOrchestrator.freeformLegs.test.ts`
   → expected GREEN, 0 failures, the 4 new legs present in the reporter output.
2. Full server suite: `npm run test:run -w server` (cwd = worktree root;
   handoff convention "touched vitest cwd=worktree/server")
   → expected: full green, no new skips on the compliance/SH-QC-1S legs.
3. Typecheck: `npm run typecheck -w server` → clean (no new errors;
   exactOptionalPropertyTypes included).
4. Server-only scope assertion: `git diff --name-only
   $(git merge-base HEAD cl/integration-2)..HEAD` → every line starts with
   `server/` (plus `.hermes/` deliverables); zero `app/`, zero `config/`.
5. No-literal grep: `grep -nE "(lfm|llama|gpt|provider-name literals|sequences'"
   server/src/ai/AgentOrchestrator.ts | grep -i degen` → expected EMPTY (no
   provider/surface literals introduced around the new code).

First targeted check (run it BEFORE writing the full suite, proves the approach
early): after stubbing leg 1's client, run
`cd server && npx vitest run src/ai/AgentOrchestrator.degenerateRetry.test.ts -t "recovered on retry"`
and read the failure: it must fail on the SECOND stream call never happening
(completeStream count 1), NOT on a stub-shape error — confirming the hook point
is where the loop accepts the dead turn.

## Worker contract

- Branch: `cl/lane2-degenretry1-l2t<NNNN>` off `cl/integration-2` (trunk tip at
  claim time, ≥ b622a865).
- Worktree: `/mnt/vast/home/brad/git/wt/DEGENRETRY1-lane2-l2t<NNNN>` (repo
  worktree convention, cf. `wt/SUITEA-uifix3-lane2-l2t2015`).
- Deliverable: `deliverables/L2-DEGEN-RETRY-1-report.l2t<NNNN>.md` in the
  worktree, with the RED-then-GREEN vitest transcripts for the 4 legs.
- Report DONE marker per lane convention (`L2-DEGENRETRY1 DONE <sha>`).
- HOT-FILE RULE (binding): `server/src/ai/AgentOrchestrator.ts` is shared with
  L2-SUITE-A fix runs. Claim ONLY when no SUITE-A coder run is live on that
  file; FIRST CLAIMER OWNS IT (handoff l2t1735 17:40: uifix3 l2t2015 was live on
  app/ + shorthandChat.ts at that hour — a DEGENRETRY-1 claim must wait for its
  exit regardless of stagger).
- Commit discipline: RED commit (failing tests) before the GREEN commit
  (CLAUDE.md rule 5: behavioral change requires a failing test first).

## eOPT note

Backend runs `exactOptionalPropertyTypes: true` (CLAUDE.md:156, rule 6). The new
optional message flag means ABSENT OR VALUE, never `undefined`: never
`emptyDraftMessage({ truncated, hadArguments, degenerateEmptyResponse: undefined })`;
use conditional spread (`...(flag ? { degenerateEmptyResponse: true } : {})`) or a
dedicated function. Same for any optional field on the retry bookkeeping record.

## Reviewer bait (pre-empt these in the implementation and the report)

1. Byte-pins on the old text: freeformLegs.test.ts:725 uses `toBe`; the two
   rephrasing sentences at draftArgDiagnostics.ts:128/:133 must stay byte-identical.
   Any "tidy up the wording" is a regression.
2. The new class text must NOT contain "rephrasing" (leg 2 pins it) and must be
   the task's sentence, not a paraphrase.
3. Hardcode boundary: the retry trigger is the MECHANICAL SIGNATURE only — no
   `model === '…'`, no surface-name branch, no schema-name branch near the hook.
   Provider identity is orproxy-calls.log-side, provable by diff. The one-retry
   budget being a code constant (not YAML) is a deliberate ruling — loop guard,
   not domain policy, exactly like the existing `turn+1 < effectiveMaxTurns`
   guards; see OQ3 for the counter-argument and escalation path.
4. History pollution: pushing the empty assistant message before the retry
   (`messages.push` at :2271 is BEFORE today's coercion gate at :2282) would let
   the degenerate turn ride into the retry prompt — the retry must re-issue the
   SAME messages array, unmutated. Test hint: leg 1 can spy the second
   `completeStream` request and deep-compare its `messages` to the first.
5. Echo-guard interaction (:2457-2471): an empty finalProse routes to the error
   channel, proseRouted false — the new degenerate return must not accidentally
   hand the error through the notes channel.
6. finishReason normalization: key on `choice.finish_reason` AFTER the
   `?? 'stop'` reassembly normalization (:2203), not the raw accumulated value —
   a stream that ends with no finish_reason chunk IS the degenerate shape.
7. Compliance-arm collision: on `sequences`/`workspace.deck` the nudge arm
   (:2350) also fires on zero-tool-call turns; the report must state which arm
   won for empty-content turns and why (design 3 + OQ1), with the SH-QC-1S/
   HARNESS-SEQ-2 legs green as evidence.
8. Ontology terms: none required — this task adds no nouns; the message family
   is prose in draftArgDiagnostics.ts. Any new "vocabulary" in code is scope creep.
9. YAML-reload trap: the compliance policy is loaded PER call (:1299, never
   process-cached); if the coder touches anything near it, do not introduce
   caching, and do not add YAML keys this spec did not order (OQ3).

## Open Questions (coder resolves per the stated default; escalate on collision)

1. Compliance-arm precedence on listed surfaces: this spec rules the
   empty-content degenerate signature PREEMPTS the nudge arm on
   `sequences`/`workspace.deck` (different class: nudge targets non-empty echo
   prose). What I checked: :2350 fires on `!tool_calls?.length` regardless of
   content; SH-QC-1S's motivating logs show contentLen=86 (non-empty). If any
   existing compliance pin asserts a nudge on an EMPTY-content turn, the
   preemption collides → stop, report, orchestrator decides.
2. Which surface emitted the x6 regate-4 signature lines: the :2429 trail
   "coerced JSON args after stop as …" is only reachable on surfaces WITHOUT a
   compliance entry (the deck arm returns before slow coercion), so the wall'd
   surface was an unlisted forced-tool surface — [unverified] which one; the
   orch can confirm from lanes/2 arm logs + orproxy calls.log (persistent
   capture, CL2_ORPROXY_CAPTURE=1). This does not change the design (signature is
   surface-agnostic); it only sets expectations for re-gate evidence.
3. Retry budget code-constant vs data: precedent cuts both ways — HARNESS-SEQ-2
   moved the compliance retry count INTO
   `config/drafting/forced-tool-compliance.yaml`, while loop-safety guards
   (`turn+1 < effectiveMaxTurns`, `forcedToolComplianceAttempts<2` at :2659) are
   code constants. This spec rules ONE retry as a code constant (mechanical loop
   guard; moving it to YAML makes silent-off surfaces unconfigurable and invites
   a loop). If adversarial review rules "any retry budget is data", the fallback
   is a new top-level `degenerateRetry:` section in that YAML with the
   per-call-load + silent-off parity — scoped ONLY if advc forces it.
