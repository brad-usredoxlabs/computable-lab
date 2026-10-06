# ADVERSARIAL REVIEW — PB-CH-1 (lane 2)
Item: PB-CH-1 "Server compiles Tier-1 agent actions — agent_action stream event + term-resolved workspace actions"
Candidate worktree: /mnt/vast/home/brad/git/wt/PB-CH-1-lane2-l2t1350
Branch: wt/PB-CH-1-lane2-l2t1350 | impl commit 5017e859 | report commit 0ff74065 (HEAD) | parent 8f106c6d
Spec reviewed in full: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-06_1345-PB-CH-1-agent-action-compiler.md
Coder report: /mnt/vast/home/brad/git/wt/PB-CH-1-lane2-l2t1350/.hermes/plans/PB-CH-1-report.wip-l2t1350.md
All git commands used -c core.fileMode=false (NFS). No file in the worktree was modified.

## Acceptance criteria (verbatim, spec §100-101)
> Red-first tests: resolvable term; unresolved term => diagnostic + no event; ambiguous term;
> invented record id rejected; unsupported surface id rejected; malformed envelope; schema-valid
> model output that skipped compilation never reaches the client (prove the emit path requires
> resolution). SSE/API receipts from :3093. exactOptionalPropertyTypes clean; exhaustive-switch
> consumers compile-checked.

## Commands I ran (real output reproduced below)
1. `git -c core.fileMode=false diff --stat 8f106c6d...5017e859`
2. `git -c core.fileMode=false diff --name-status 8f106c6d...HEAD` (full branch, incl. report commit)
3. `git -c core.fileMode=false show --raw 5017e859` + `ls-tree HEAD` (symlink/mode audit)
4. `grep -rn "agent_action" server/src --include=*.ts | grep -v .test.ts` (single-emitter audit)
5. `cd server && npx vitest run src/ai/compileWorkspaceAction.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts`
6. `cd server && npx vitest run src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts src/schema/AgentActionSchema.test.ts src/surfaces/surfaces.test.ts src/ai/selectSubmitCall.test.ts`
7. `cd server && npx vitest run src/ai` (full-suite + `--reporter=basic` failed-file list)
8. `npm run typecheck -w server` (and `npx tsc --noEmit | grep -c "error TS"`)
9. `npx vitest run src/ai/submitSuggestionTool.tubeSchema.test.ts` (failure-cause spot check)

---

## FINDINGS (S1..Sn)

### S1 — BAIT 1 (schema-valid shortcut: no envelope reaches the client without resolution+Ajv) — PASS
- The ONLY producer of `type:'agent_action'` in the whole server is AgentOrchestrator.ts:2037,
  guarded by `if (compiled.ok)` (AgentOrchestrator.ts:2034-2037). Grep over server/src (production
  files) returns exactly: the type member (types.ts:864), the emit (:2037), and comments. No second
  emitter.
- `compiled.ok` is returned only after step-4 re-validation against the registered $id
  (compileWorkspaceAction.ts:588-601). A resolved action failing re-validation returns
  `COMPILE_INTERNAL` and is never emitted (:589-599).
- The MCP handler (workspaceActionTools.ts:47-68) returns `jsonResult(...)` data only; it has no
  `onEvent` and no SSE access. Confirmed by reading the full file.
- The gate-proof test exists and is green: AgentOrchestrator.workspaceAction.test.ts:262-276
  ("THE SCHEMA-VALID SHORTCUT"), using a well-formed Ref `{kind:record,id:'MAT-made-up',type:'material'}`
  that IS Ajv-valid; asserts 0 agent_action + `UNKNOWN_RECORD` diagnostic. My run: 30/30 pass.

### S2 — BAIT 2 (mint/tier-2 affordance leak) — PASS
- Exclusion exists and is explicit: `isMintAffordance` (compileWorkspaceAction.ts:235-237) filters
  `tier===5 || source==='mint' || !curie`; `LOCAL_TIERS=[0,1]` (:230) is applied at :341-343 and
  :387. `resolve(term,{localOnly:true})` (:340) additionally drops remote tiers 3/4
  (ResolveSpine.ts:188 filters `!spec.remote`; tiers 3/4 are remote, tier 2/OAK is local but is then
  removed by the [0,1] tier filter). So mint and tier-2 cannot bind.
- Unit case mandatory and present: compileWorkspaceAction.test.ts:167-179 (spine returns ONLY the
  real tier-5 `curie:''` mint) -> `UNRESOLVED_TERM`, plus a defensive
  `JSON.stringify(result)` not containing `"id":""` assertion. Remote tier-3 non-binding case at
  :196-207. The fake spine appends the real mint affordance on EVERY call (:39-54), so the leak is
  actually exercised, not stubbed away.

### S3 — BAIT 3 (handler emit path; raw tool_call/tool_result trace-only; structured diagnostic + NO action) — PASS
- Raw `tool_call` is emitted at AgentOrchestrator.ts:1875 (shared trace, before dispatch) and
  `tool_result` at :2038 (ok) / :2058 (fail); these are trace-only. The handler never emits.
- Invented record id -> `UNKNOWN_RECORD` + no action: compileWorkspaceAction.test.ts:211-221,
  orchestrator :262-276. Invented protocolId -> UNKNOWN_RECORD (:263-271); bad stepId -> UNKNOWN_STEP
  (:273-292); unregistered surface -> UNSUPPORTED_SURFACE (orchestrator :278-288) + no action.
- Propose-never-write is structurally tested: mutation tripwires throw on create/update/delete
  (test :68-76) and `runChatbotCompile` is asserted never called (:226); failing cases assert
  `store.create` not called (:275).

### S4 — BAIT 4 (app/** and schema/** smuggling) — PASS
- `git diff --name-status 8f106c6d...HEAD` (full branch incl. the report commit 0ff74065) lists only
  `server/src/**` + `.hermes/plans/PB-CH-1-report.wip-l2t1350.md`. `git diff --name-only ... -- app/
  schema/` is EMPTY. The report commit 0ff74065 touches exactly one file (the report). ZERO YAML.

### S5 — BAIT 5 (two intent-pin updates are the deliberate 4->5 menu change) — PASS
- submitSuggestionTool.test.ts:279 -> enum now `[...'protocol_edit','workspace_action']` (diff shows
  only the expectation + explanatory comment).
- submitSuggestionTool.protocolEdit.test.ts:21 -> five-intent title + enum gains 'workspace_action'
  (diff shows only title/enum/comment). No unrelated golden/snapshot touched in the diff.

### S6 — BAIT 6 (exactOptionalPropertyTypes) — PASS
- Every optional site in the diff is a conditional spread: compileWorkspaceAction.ts:483, 583-586,
  306; workspaceActionTools.ts:54-56; AgentOrchestrator.ts deps/branch. Grep for `: undefined` in
  new files returns only RETURN expressions (:244, :261) and comparisons (:280-281, :533, :556,
  :571) — never an object property set to undefined. types.ts AgentActionPayload documents
  omit-not-undefined. Backend tsconfig has exactOptionalPropertyTypes:true.

### S7 — BAIT 7 (gitignored symlink replication must not be committed) — PASS
- `ls-tree HEAD` modes for all four added files are `100644` (regular). `show --raw 5017e859` shows
  no `120000` additions. The only `120000` entry in the whole tree is `computable-lab` (repo-root),
  which is present at the parent 8f106c6d too — pre-existing, untouched. Nothing symlink-ish got
  committed.

### S8 — BAIT 8 (exhaustive-switch consumers compile-checked) — PASS
- types.ts:864 appends `| { type: 'agent_action'; action: AgentActionPayload }`. Server SSE
  pass-through is `sendEvent = (event: AgentEvent) => reply.raw.write(JSON.stringify(event))`
  (AIHandlers.ts:373-375) — no switch. The only server `switch (event.type)` is
  lab-sync/translate/inbound.ts:172 (a different event type). `npm run typecheck -w server` -> 33
  error lines, none in the new/changed files (see S10).

### S9 — Tests I ran myself (not coder claims)
- Targeted: `npx vitest run src/ai/compileWorkspaceAction.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts`
  -> `Test Files 2 passed (2) / Tests 30 passed (30)`.
- Pin + trio: `... submitSuggestionTool.test.ts submitSuggestionTool.protocolEdit.test.ts
  src/schema/AgentActionSchema.test.ts src/surfaces/surfaces.test.ts src/ai/selectSubmitCall.test.ts`
  -> `Test Files 5 passed (5) / Tests 35 passed (35)`.

### S10 — Full src/ai suite + typecheck (baseline identity)
- `npx vitest run src/ai` -> `Test Files 10 failed | 61 passed (71) / Tests 21 failed | 538 passed
  (559) / Errors 2`. Failing-file set captured: AgentOrchestrator.bypass, AgentOrchestratorForwarding,
  AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
  ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
  submitSuggestionTool.tubeSchema. This is EXACTLY the spec's pre-existing 10-file/21-test set;
  the +30 passed delta equals the two new suites.
- Spot check of the only failure a menu change could plausibly have caused:
  submitSuggestionTool.tubeSchema fails on `place_tube` details/`tubeVolumeClass` assertions (a
  DIFFERENT tool from agent_intent) — pre-existing, unrelated to the enum widening.
- `npm run typecheck -w server` -> 33 error lines (`npx tsc --noEmit | grep -c "error TS"` = 33),
  all in AgentOrchestrator.ts(281,2292,2293,2325,2347,2349,2423,2425),
  ProtocolIntakeHandlers, RecordHandlers, AuthoringGuard, ProtocolUseService,
  RecordRevisionService, bootstrapAdmin, RecordStoreImpl. The 7 AgentOrchestrator errors are at
  lines <281 and >2292 — outside the diff's added regions (import ~52, deps ~894, branch ~2005-2096)
  and about MaterialProfileRegistry.kind-union, exactly the known pre-existing baseline.

---

## OBSERVATIONS (O1..On)

O1 — `coerceAgentIntent.ts` was NOT extended. Its `AgentIntentName` union and `INTENT_KEYS`
(coerceAgentIntent.ts:17-27) lack `workspace_action`, so a workspace_action emitted as PROSE JSON
would infer `null` and be dropped by the recovery path. This is NOT an acceptance criterion and the
forced-tool path emits a structured tool call (proven by the coder's Run A/B receipts). Flagged for
awareness only; not a spec violation.

O2 — The SSE receipt was captured on a throwaway backend on 127.0.0.1:3099 (coder §6), not :3093 as
the spec's verification 6 literally says. Rationale (avoid racing the orchestrator-owned :3093,
which serves trunk code) is sound: a :3093 receipt would have exercised trunk, not this diff. The
coder honestly declared the deviation. Process observation, not a product defect.

O3 — No dedicated tier-2 (local OAK) unit case; tier-2 exclusion is proven only by construction
(`LOCAL_TIERS=[0,1]` excludes it) alongside the tier-3 case at compileWorkspaceAction.test.ts:196.
Coverage gap, not a defect.

O4 — The model-facing `agent_intent` tool schema exposes action/target/surface/contextNote but not
`supportedBy`, although the compiler verifies supportedBy (compileWorkspaceAction.ts:569-577). Not
required by the spec.

O5 — Theoretical: a spine candidate with a bare `local:` CURIE (empty recordId) would be bound as an
ontology ref rather than rejected (compileWorkspaceAction.ts:260-262, 298-307). The real spine never
emits an empty curie (filtered by `!curie`), so this is unreachable in practice.

O6 — The compiler adds `MISSING_TARGET` / `UNSUPPORTED_REF` codes beyond the spec's list; both are
spec-consistent (schema authority + every-ref-reverifies discipline), not scope creep into app/schema.

---

## Verdict
All eight reviewer baits verified with file:line evidence and my own runs; all acceptance criteria
are exercised by tests I ran green; full-suite failing-file set is identical to the pre-existing
baseline; typecheck is 33 lines with zero in the diff; ZERO app/** and ZERO schema/** changes; no
symlink committed; single compile-gated emit path confirmed. No defect found that violates the spec.

VERDICT: accept
