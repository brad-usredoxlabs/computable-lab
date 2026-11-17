# L2-P1-EMPTY-TURN-CARD-1 u2fix — report (lane 2)

Unit: u2fix of u1 — one fix pass on the empty-turn honest-wall path; repairs the
three adversarial functional defects of the advc u1finalsite FIX-FUNCTIONAL
verdict (report tail /home/brad/.hermes/cl/lanes/2/reviews/
L2-P1-EMPTY-TURN-CARD-1-u1finalsite-advc-l2t2705.out, defects 1-3).

Branch cl/lane2-emptyturncard-u1-1715, base ea3318b96ae8b7712e62462b2be0f1430112b398.

Commits (commit-per-step):
- adfe308a2 s1: D2 client shape fix + real fixtures (app)
- 0c47930f4 s2: D1 streamed-text guard gate + AC2 leg (server)
- bd90ab09c s3: D3 reachability pin on the shipped default config (route a)
- <this commit>: report + marker (paperwork; no behaviour change)

## Environment repair (uncommitted; every path git-ignored, tree stayed clean)
- The lane-2 node stores (/mnt/vast/.../cl-integration-2/{,app/,server/}node_modules)
  were emptied the same day; the main repo
  /mnt/vast/home/brad/git/computable-lab/{,app/,server/}node_modules is intact.
  Worktree package.json + package-lock.json diff-verified byte-equivalent to the
  main repo's, so the worktree symlinks were re-pointed there: node_modules,
  app/node_modules, server/node_modules. A root `npm ci` (workspaces) attempted
  first was abandoned — the lockfile carries no `./server` workspace entry, so
  server deps never installed.
- `server/schema` symlink missing in the worktree (tracked in the main repo as
  `../schema`): restored `ln -s ../schema server/schema` (the vocab loader reads
  server/schema/scientist-intent/...yaml; without it the orchestrator import
  chain dies at test load).

## D2 (advc defect 2) — app, commit adfe308a2
The done-frame handler read `(p.ref as {reason?}).reason` — a TypeError on the
REAL shipped flat shape (normalizeScientistIntent pushes {kind,label,reason}
directly; no `ref` field), swallowed by the handler catch, so the honest wall
never fired. The u1 test fixture invented a nested {ref:{id,label,reason}} entry
that ships nowhere.
Fix (useAiChat.ts, :2320-2345 region): ONE reading order, documented — flat
first, then nested: reason = e.reason ?? e.ref?.reason; refLabel = e.label ??
e.ref?.label; all optional-chained + string-checked; entries matching neither
shape are skipped, never thrown on. No fabricated cause.
Test (useAiChat.emptyturn.test.tsx): fixture replaced with the real FLAT
normalize shape {kind:'unresolved_symbol',label:'Nunc CryoBox 12x12',
reason:'unknown-noun'}; NEW leg with the real NESTED OntologyRefProposal shape
{ref:{kind:'ontology',id:'cl:plate:384well',namespace:'plate',label:'384-well
plate',uri:'https://computable-lab.com/ontology/plate/384well'},
suggestedType:'plate',usedInEvents:['e1']} — carries NO reason anywhere:
unknownNoun undefined → no throw, no fabricated unknown-noun, wall fires with
the default next step.
RED proof (old code + new fixtures, hook fix stashed): 1 failed | 2 passed —
"the honest wall must fire when nothing was delivered: expected null to be
truthy" (the TypeError's swallowed path; wall stayed null). Restored: 3/3.

## D1 (advc defect 1) — server guard, commit 0c47930f4
The final-answer guard's error arm now additionally requires "no non-empty
assistant text this run":
  !(draftFlowMode !== 'forced-tool' &&
    typeof assistantMsg.content === 'string' &&
    assistantMsg.content.trim().length > 0)
Rationale (single statement per bedrock, applied): the stream loop's text_delta
fork is DECLARED by `draftFlowMode !== 'forced-tool'` (:2526); a turn whose
assistant body reached the person as streamed text (in-scope content carrier
assistantMsg.content, set :2687) delivered something and must not be walled.
The fix reuses that declared fork, does not re-derive a second streaming or
emptiness predicate. On the shipped config (draftFlowMode 'forced-tool' —
constructor default :1367, config absent) the fork holds: nothing streams, the
gate is a NO-OP, the AC1 JSON-body turn stays wall-able. One-authority
preserved: the guard still decides via draftProducedNothingOnServer +
emptyDraftMessage only; no second emptiness predicate; no new message string
(the wall sentence is unchanged and byte-asserted by AC1).
Guard region :3150-3210 only — no stream-loop edit. The notes-bearing u4guard
arm is untouched (the gate short-circuits the guard condition BEFORE the arm;
on the shipped config the arm's reach is byte-identical to pre-fix).
AC2 leg (new describe, CARD-1 legs untouched): the identical
{"events":[],"notes":[]} no-tool-call turn on a streaming mode (preflight-llm,
where the :2526 fork is active and the body streams to the person) → success
true, no error, events 0, notes 0, no card — pre-guard bytes.
Contradiction found and resolved within the step (anti-thrash note): the first
AC2 leg draft used a NON-JSON prose body; it failed at success:false because
parseAgentFinalResponse returns success:false for a non-JSON body (the guard is
skipped on !result.success) — a prose turn never reaches the guard. The real
AC2 violation is a JSON body STREAMED as text, so the leg pins that shape.
MUTATION (D1 teeth): guard gate stashed → 1 failed | 9 passed (the AC2 leg
RED — the guard re-errors the delivered turn); restored → 10/10.

## D3 (advc defect 3) — route (a), commit bd90ab09c
Route (a) chosen: prove reachability on the shipped default config + pin the
probe receipt. The harness config IS the shipped default config: draftFlowMode
absent → constructor default 'forced-tool' (:1367; lane2-config.yaml's ai: block
ships no draftFlowMode and no deterministicOnly — grep-verified),
deterministicOnly absent → false. On it the default forceDraftTool resolves
true (:1544); the probe's explicit request forceDraftTool:false wins the ??
chain → the forceDraftTool-gated recovery arms are skipped, preflight is
skipped (:2104-2105, skipCompilerPreflight = !runPreflight), the no-tool-call
final-answer arm reaches the empty-guard's error arm. PROBE RECEIPT: the
existing AC1/AC1b legs assert the wall byte-equal to the one-authority
emptyDraftMessage sentence; the AC1 leg now carries the receipt comment naming
the config identity + resolution path (no assertion added — the byte-equality
assertion already in the leg IS the receipt).
Why route (b) was rejected: the preflight prose arm (finalProse empty path,
near :3035) has NO zero-delivery prose exit on the shipped config — in
preflight-llm runPreflight is true, so the LLM loop runs after preflight and
finalProse is never set (a preflight short-circuit requires non-empty
artifacts, i.e. a delivered turn); in preflight-deterministic the
deterministicOnly short-circuit returns before the model loop. Nothing to
share; no guard move; AC1b one-authority untouched.

## VERIFY results (re-run at the final code commit bd90ab09c, after every restore)
1. server: `timeout 300 npx vitest run src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts`
   → `Test Files 1 passed (1) / Tests 10 passed (10)` (9 baseline + 1 new AC2
   streamed-text leg; the AC1 leg gained the D3 receipt comment only).
2. server: `timeout 300 npx vitest run src/ai/AgentOrchestrator.degenerateRetry.test.ts src/ai/clarificationLoop.test.ts`
   → `Test Files 2 passed (2) / Tests 19 passed (19)`.
3. app: `timeout 300 npx vitest run src/shared/hooks/useAiChat.emptyturn.test.tsx`
   → `Test Files 1 passed (1) / Tests 3 passed (3)` (2 baseline + 1 new
   nested-shape leg).
4. Typecheck at the final commit:
   - server `npx tsc --noEmit -p .` → 6 errors, BYTE-IDENTICAL to the base log
     (`diff` clean): AIHandlers.ts x3 ('parts'), AiIngestionHandlers.ts x1
     ('parts'), ExtractProtocolHandler.ts x1 ('parts'), sequenceRoutes.ts x1
     ('file') — all Fastify handler/route files, all pre-existing (the brief's
     SchemaRecordForm/useAiChat.threadSelect/RefCombobox labels are the app-side
     six; the server six are these). ZERO new errors; zero in touched files.
   - app `npx tsc --noEmit -p .` → 10 errors (the advc-measured app baseline
     count), ZERO in useAiChat* (the touched files).
5. Mutation (teeth proof, verify-5): guard neutralized (`if (false && ...)` on
   the whole guard condition) → `4 failed | 6 passed`: AC1, AC1b and both
   CARD-2 card legs go RED (the guard is load-bearing for exactly the pinned
   legs); restored → 10/10 green (re-run).

## AC map (externally observable)
- AC1 (zero-delivery turn → honest wall via the error channel, no silent
  success:true; reachable AND pinned on the shipped default config): AC1/AC1b
  legs green + D3 receipt — met.
- AC1b (one authority): the guard still uses ONLY draftProducedNothingOnServer +
  emptyDraftMessage; the new gate is a delivered-text exclusion, not a second
  emptiness predicate; no new wall message string (byte-asserted) — met.
- AC2 (a turn that delivered streamed assistant text: no honest-wall error,
  byte-identical to pre-guard): new AC2 leg green; shipped-config behaviour
  byte-identical (the gate is a no-op under forced-tool; all 9 baseline legs
  green) — met.
- AC3 (client never throws on either shipped unresolvedRefs shape; the app test
  uses real server shapes): 3/3 green, RED-proven against the old code — met.
- Prohibited-items check: no new message vocabulary; notes-bearing arm
  untouched; no server-side unresolvedRefs construction changes; no new SSE
  event kinds — all held.
- Output budget: 4 code files (≤6); +145/−6 = 151 changed lines (≤250) — held.

## Changed files (code, vs base ea3318b96)
- app/src/shared/hooks/useAiChat.ts (+32/−2)
- app/src/shared/hooks/useAiChat.emptyturn.test.tsx (+32/−1)
- server/src/ai/AgentOrchestrator.ts (+17/−1)
- server/src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts (+64/−2)
Plus this report + marker commit (paperwork only).

## Decisions
- D1: reuse the stream loop's DECLARED streaming fork (draftFlowMode condition)
  instead of inventing a per-run text-delta flag — no such flag exists in scope
  and a second predicate would violate AC1b.
- D2: flat-first reading order (the normalize flat shape is the shape that
  breaks today; OntologyRefProposal carries no reason, so order cannot change
  the answer for any shipped entry — documented in code).
- D3: route (a) (proof + pin) over route (b) (shared-exit move) — route (b) has
  no target on the shipped config (documented above).

## Next actions / blockers
None. Implementation complete; independent reviewer owns acceptance. No YAML
changed — no lane-stack reload needed.

L2-P1-EMPTY-TURN-CARD-1-u2fix-l2t2707.txt UNIT unit DONE PLACEHOLDER
