# PB-CH-1 CODER REPORT — Server compiles Tier-1 agent actions (wip-l2t1350)

Worktree: /mnt/vast/home/brad/git/wt/PB-CH-1-lane2-l2t1350
Branch: wt/PB-CH-1-lane2-l2t1350
Claim-time trunk SHA: 8f106c6d06597361c12cbd2ce16dbd1e918b7ccb (`cl/integration-2` HEAD at claim; branch cut from it)
Spec: .hermes/plans/2026-10-06_1345-PB-CH-1-agent-action-compiler.md

## 0. Lane-discipline scout (BEFORE any writes)

- `curl -s localhost:3093/api/health` -> **200** (lane-2 backend live).
- Lane stack processes verified: :3093 backend (pid 3420767, cwd /mnt/vast/home/brad/git/cl-integration-2/server, env `CL_DATA_DIR=/home/brad/.computable-lab-lane2`, `PORT=3093`, `APP_BASE_PATH=..`) and :5193 vite (pid 3420657). Brad's stack :3001 (pid 3602600) / :5174 (pid 3402318) observed and NEVER touched.
- Lane data dir exists: `ls /home/brad/.computable-lab-lane2/` -> `auth repos worktrees`.
- Index-file hash DIFFERS from main data (the spec's required proof):
  - `/home/brad/.computable-lab-lane2/worktrees/main/var/jsonld-index.sqlite` sha256 `823f7a993186733813ff29baa55fa50324eedd9521407b145b6afd2db6c45131` (mtime Oct 5 20:14)
  - `/home/brad/.computable-lab/worktrees/main/var/jsonld-index.sqlite` sha256 `786714986b07d0f9f514604109745334c13ac43bdcc3dcff4afefbfbdeeece27` (mtime Oct 4 17:28)
  - (Note: `auth/sessions.json` is identical in both dirs — an empty `[]` placeholder — so the sqlite index is the discriminating file.)
- Nothing in my diff touches :3001/:5174 or writes under /home/brad/.computable-lab/ (main data). My runtime evidence used a SEPARATE throwaway backend on **127.0.0.1:3099** (see §6) so the shared :3093 (trunk code, orchestrator-owned) was never restarted or raced. :3099 was killed after capture; :3093/:5193/:3001/:5174 all still listening (4 sockets verified post-capture).

## 1. RED-first outputs (pasted before implementing)

RED #1 — compiler suite before the module existed (`cd server && npx vitest run src/ai/compileWorkspaceAction.test.ts`):

```
 ❯ src/ai/compileWorkspaceAction.test.ts  (0 test)

⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯
 FAIL  src/ai/compileWorkspaceAction.test.ts [ src/ai/compileWorkspaceAction.test.ts ]
Error: Failed to load url ./compileWorkspaceAction.js (resolved id: ./compileWorkspaceAction.js) in .../compileWorkspaceAction.test.ts. Does the file exist?

 Test Files  1 failed (1)
      Tests  no tests
```

RED #2 — behavioral RED after the harness was written but before the compiler body (module stub-free run): `Tests 7 failed | 13 passed (20)` — the term-resolution cases failed with `expected 'MALFORMED_ENVELOPE' to be 'UNRESOLVED_TERM'` etc. before the term-target pass-through was implemented (the registered Ref datatype rejects a bare `{kind,label}` term by design; the compiler lets ONLY a target-scoped failure through to resolution, then re-validates the RESOLVED action).

RED #3 — gate-proof orchestrator suite with production wiring stashed (`git stash push -- types.ts AgentOrchestrator.ts submitSuggestionTool.ts ToolBridge.ts server.ts mcp/tools/index.ts`, then `npx vitest run src/ai/AgentOrchestrator.workspaceAction.test.ts`):

```
 Test Files  1 failed (1)
      Tests  8 failed | 2 passed (10)
```
(8 = every emit/diagnostic assertion; the 2 that passed are the deck_layout + protocol_edit regressions — baseline behavior proven unchanged.)

GREEN (first-targeted-check, spec §104-108): `npx vitest run src/ai/compileWorkspaceAction.test.ts` -> `Test Files 1 passed (1) / Tests 20 passed (20)`. Resolvable term -> `{ok:true}` with `target.id === 'MAT-000001'` (a REF, not the term); unresolved -> `UNRESOLVED_TERM` with `ok:false`. Both in one file.

## 2. Gate-proof excerpt (emit path gated by compilation — verification 2)

`server/src/ai/AgentOrchestrator.workspaceAction.test.ts` (10 tests, all green). THE criterion case, verbatim:

```ts
it('THE SCHEMA-VALID SHORTCUT: an Ajv-valid action with an INVENTED record id emits NO agent_action', async () => {
  // This envelope passes the registered schema's raw Ajv check (it is a
  // well-formed Ref). Only the store check can kill it — and it must.
  const store = mutationTripwire();
  const spine = fakeSpine([]);
  const { events } = await runIntentTurn(
    { intent: 'workspace_action', action: { action: 'focus', target: { kind: 'record', id: 'MAT-made-up', type: 'material', label: 'Invented' } } },
    { store, spine },
  );
  expect(events.filter((e) => e.type === 'agent_action')).toHaveLength(0);
  const diagnostics = events.filter((e) => e.type === 'pipeline_diagnostics');
  const diag = diagnostics[0] as Extract<AgentEvent, { type: 'pipeline_diagnostics' }>;
  expect(diag.diagnostics.some((d) => d.pass_id === 'workspace-action-compile' && d.code === 'UNKNOWN_RECORD')).toBe(true);
  expect(store.create).not.toHaveBeenCalled();
});
```

Companion cases in the same file: resolvable term -> exactly ONE `agent_action`, payload Ajv-validated IN-TEST against the registered `$id` through the same SchemaLoader->SchemaRegistry->AjvValidator pipeline, carrying `target.id: 'MAT-000001'` (resolved ref, never the term) + tool_call/tool_result trace; unresolvable term -> ZERO agent_action + `pipeline_diagnostics` with `pass_id:'workspace-action-compile'` + zero mutation spies + `runChatbotCompile` never called; protocol-step store-verified with authoritative label; unregistered surface -> no action; registered surface -> compiled open-surface action; malformed envelope -> MALFORMED_ENVELOPE; no-action payload -> diagnostic; deck_layout + protocol_edit regressions emit NO agent_action.

Mandatory unit cases from the spec (mint leak + shortcut) live in `compileWorkspaceAction.test.ts` (20 tests): resolvable term -> ok with ref; unresolved -> UNRESOLVED_TERM; ambiguous same-tier equal-score -> AMBIGUOUS_TERM naming candidates; invented record id -> UNKNOWN_RECORD; invented protocolId -> UNKNOWN_RECORD; bad stepId -> UNKNOWN_STEP; unsupported surface -> UNSUPPORTED_SURFACE; malformed envelope -> MALFORMED_ENVELOPE naming the path (`/action`, `/tier`); **mint-only candidate (fakeSpine appends the real tier-5 `curie:''` mint on EVERY call, exactly like ResolveSpine.ts:218) -> UNRESOLVED_TERM** and `JSON.stringify(result)` asserted not to contain `"id":""`; remote tiers (2-4) not bound (localOnly + LOCAL_TIERS [0,1] per resolveDraftMaterials precedent); resolved action re-validated against the registered `$id`.

## 3. Full-suite counts vs baseline

Baseline re-verified at claim in my worktree BEFORE changes (`npx vitest run src/ai`): **10 failed files / 21 failed tests / 508 passed (69 files), 2 unhandled errors** — matches the spec exactly.

Post-change `npx vitest run src/ai`: **10 failed | 61 passed (71 files) / 21 failed | 538 passed (559), 2 errors**.
- Failing-file set IDENTITY verified against the spec's known set (AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden, AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate, ChatbotCompileDeckSlot, chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema) — identical 10 files, identical 21 tests.
- Delta: +2 files (my two new suites), +30 tests passing (20 compiler + 10 gate-proof). The two intent-pin files stay green with their deliberate updates (17 + 5 tests, counts unchanged).

Green trio (`src/schema/AgentActionSchema.test.ts src/surfaces/surfaces.test.ts src/ai/selectSubmitCall.test.ts`): **3 files / 13 tests PASS** (still green).

`npx vitest run src/schema src/surfaces`: 25 failed files in that broad set — verified IDENTICAL failure-file set vs the same command run in the trunk worktree (3 failing files each side after dedup of the grep pattern; the broad src/schema set has pre-existing failures on trunk too — file-set identity proven by diff of the two failure lists: empty).

## 4. Typecheck

- `npm run typecheck -w server`: **33 error lines** — set-identity proven: `diff` of the error-file+code set (line/col normalized) before vs after my changes is EMPTY; zero errors in any of my new/changed files (the 7 AgentOrchestrator.ts errors are the pre-existing MaterialProfileRegistry/kind-union ones, present in the baseline capture too).
- `npm run typecheck -w app`: **34 error lines**, error-file set md5 `cb7abe2ed7cb70419acc2d292e8e905a` IDENTICAL pre-change and post-change (app untouched).
- exactOptionalPropertyTypes discipline: all optional fields (`surface`, `contextNote`, `supportedBy`, `term`, `uri`, `action`) built with conditional spread; no `{ x: undefined }` anywhere in my files.

## 5. Intent-pin diffs (deliberate, golden-test discipline)

Pin 1 — `server/src/ai/submitSuggestionTool.test.ts`:
```diff
-  it('exposes a single forced tool with a four-intent menu (event_graph | deck_layout | create_record | protocol_edit)', () => {
+  it('exposes a single forced tool with a five-intent menu (event_graph | deck_layout | create_record | protocol_edit | workspace_action)', () => {
...
-    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout', 'create_record', 'protocol_edit']);
+    // Fifth intent added PB-CH-1: workspace_action proposes a focus/open-surface
+    // envelope; the SERVER compiles it (terms -> refs via spine + surface
+    // registry) and only a resolved, Ajv-revalidated action emits. Invented ids
+    // are rejected; nothing is written.
+    expect(props.intent?.enum).toEqual(['event_graph', 'deck_layout', 'create_record', 'protocol_edit', 'workspace_action']);
```

Pin 2 — `server/src/ai/submitSuggestionTool.protocolEdit.test.ts`:
```diff
-  it('exposes a four-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit)', () => {
+  it('exposes a five-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action)', () => {
...
     expect(params.properties.intent?.enum).toEqual([
       'event_graph',
       'deck_layout',
       'create_record',
       'protocol_edit',
+      'workspace_action',
     ]);
```

NO other golden/snapshot files touched (git diff --stat below).

## 6. SSE/API receipt (live model, lane data dir)

To avoid racing the orchestrator-owned :3093 (which serves trunk code and whose restart the spec says I must not need — tsx --watch reloads .ts), I ran a THROWAWAY backend from MY worktree on **127.0.0.1:3099** with the lane-2 identity: `APP_BASE_PATH=.. PORT=3099 CL_DATA_DIR=/home/brad/.computable-lab-lane2 CONFIG_PATH=/home/brad/.hermes/cl/lanes/2/lane2-config.yaml npx tsx src/server.ts` (health 200; killed after capture; :3093/:5193/:3001/:5174 untouched and still listening).

Run A — `POST http://localhost:3099/api/ai/assist/stream` `{"prompt":"focus on step 3 of protocol PRT-4iaey2","surface":"workspace.deck","context":{}}`. The live model (thunderbeast) DID emit workspace_action, but with an invented stepId `"3"` — the compiler killed it. Raw SSE excerpt:

```
data: {"type":"tool_call","toolName":"agent_intent","args":{"intent":"workspace_action","action":{"action":"focus","target":{"kind":"protocol-step","protocolId":"PRT-4iaey2","stepId":"3"},"contextNote":"User requested focus on step 3 of protocol PRT-4iaey2."}}}
data: {"type":"pipeline_diagnostics","outcome":"gap","diagnostics":[{"pass_id":"workspace-action-compile","code":"UNKNOWN_STEP","severity":"error","message":"Step \"3\" is not in protocol \"PRT-4iaey2\" (which declares 17 step(s)). Cite a stepId the protocol actually has."}]}
data: {"type":"tool_result","toolName":"agent_intent","success":false,"durationMs":0}
data: {"type":"done","result":{"success":true,"notes":["Step \"3\" is not in protocol \"PRT-4iaey2\" (which declares 17 step(s)). Cite a stepId the protocol actually has."]}}
```
ZERO agent_action frames. This is the failure mode working end-to-end on a live model.

Run B — same endpoint, prompt `focus on protocol PRT-4iaey2 step stepId step-3 (the lysis buffer step)`. RESOLVED receipt:

```
data: {"type":"tool_call","toolName":"agent_intent","args":{"intent":"workspace_action","action":{"action":"focus","target":{"kind":"protocol-step","protocolId":"PRT-4iaey2","stepId":"step-3"},"contextNote":"Lysis buffer step"}}}
data: {"type":"agent_action","action":{"action":"focus","target":{"kind":"protocol-step","protocolId":"PRT-4iaey2","stepId":"step-3","label":"Add 180 µl Lysis Buffer (L6) and 20 µl Proteinase K (supplied with the kit) to t"},"contextNote":"Lysis buffer step"}}
data: {"type":"tool_result","toolName":"agent_intent","success":true,"durationMs":0}
data: {"type":"done","result":{"success":true,"notes":["Focused on Add 180 µl Lysis Buffer (L6) and 20 µl Proteinase K (supplied with the kit) to t — nothing was written."]}}
```
The `agent_action` frame carries the server-overwritten AUTHORITATIVE step label (the model proposed none; the record's step label replaced it) — a resolved ref, never a raw term.

Propose-never-write proof: after both runs, `find records -newer <backend log>` in `/home/brad/.computable-lab-lane2/worktrees/main` -> EMPTY (no record modified after my backend started); `git status --short` dirty files there all carry mtimes of Oct 3 (pre-existing lane seeding), and no diff touches PRT-4iaey2. The lane repo's pre-existing dirty state was NOT created or touched by me.

## 7. Changed paths (git diff --stat @ this commit)

```
 server/src/ai/AgentOrchestrator.ts                 | 101 +++++++++++++++++++++
 server/src/ai/ToolBridge.ts                        |   3 +
 server/src/ai/submitSuggestionTool.protocolEdit.test.ts |  16 ++--
 server/src/ai/submitSuggestionTool.test.ts         |   8 +-
 server/src/ai/submitSuggestionTool.ts              |  43 ++++++++-
 server/src/ai/types.ts                             |  18 ++++
 server/src/mcp/tools/index.ts                      |   2 +
 server/src/server.ts                               |   5 +
 + NEW server/src/ai/compileWorkspaceAction.ts
 + NEW server/src/ai/compileWorkspaceAction.test.ts
 + NEW server/src/ai/AgentOrchestrator.workspaceAction.test.ts
 + NEW server/src/mcp/tools/workspaceActionTools.ts
```
`git diff --stat schema/` -> EMPTY. `git diff --stat app/` -> EMPTY. No config.yaml change. No YAML anywhere.

Design conformance notes:
- ONE emit path: only the AgentOrchestrator dispatch branch emits `agent_action`; the MCP handler (`workspaceActionTools.ts`) returns JSON data only (compile outcome) — never stream events.
- Surface membership via `deps.surfaces.get()` only (surfaces.ts:64 convention); verbs come from the schema enum; no protocol-id or surface-id knowledge in TS.
- selectSubmitCall UNCHANGED (workspace_action is not a draft submit call); DOMAIN_TOOL_SUBSETS unchanged; AIHandlers UNCHANGED (sendEvent passes the new AgentEvent member through — cited in the branch comment).
- `AgentEvent` union extended with `{ type: 'agent_action'; action: AgentActionPayload }`; `AgentActionPayload` documented as transport shape of the schema. Server-side exhaustive-switch consumers of the AgentEvent union: none (verified at spec time; re-verified — the only `never`-default seam is app-side useChatThread.ts, out of scope; the app DROPS agent_action via dispatchFrame default, which is PB-CH-4's door and was NOT "fixed" here).
- The compiler's `ActionSpineLike` is structurally satisfied by BOTH the real ResolveSpine and resolveDraftMaterials' SpineLike, so server.ts forwards its existing `resolveSpine` dep unchanged; `surfaces: loadDefaultSurfacesRegistry(ctx.schemaDir)` added to placeholderDeps (gap-closing wiring the spec names).
- Term-target pass-through: the registered Ref datatype rejects a bare `{kind,label}` term; the compiler allows ONLY a target-scoped Ajv failure whose target is a bare term through to resolution, and the RESOLVED action must pass the full registered schema at step 4 (re-validation). A term that resolves to nothing never emits — the registered schema remains the only shape that can reach the client.

## 8. Honest notes / deviations

1. **Worktree symlink repair (environment fix, not a product change):** the prepared worktree was missing 7 of the 68 gitignored src symlinks the trunk has (`.env`, `server/schema`, 5 schema/* file symlinks). Without `server/schema`, `src/schema/AgentActionSchema.test.ts` (the green-trio member) failed 4/4 in my worktree. I replicated them EXACTLY as trunk has them (targets verified against trunk `readlink`; all confirmed git-ignored; `git diff --stat schema/` stays EMPTY; nothing added to git). The 43 `server/src/*` symlinks and `createRecordIntent.test.ts` (symlink into Brad's live tree) were already present and untouched.
2. **createRecordIntent.test.ts pin:** this test is a gitignored SYMLINK into Brad's live tree; vitest resolves its relative imports from the symlink's REALPATH, so it exercises Brad's tree's `submitSuggestionTool.ts` (whose menu is still the three-intent set — verified: `grep enum` in Brad's tree shows `['event_graph','deck_layout','create_record']`). It stayed GREEN (11/11) and is UNTOUCHED; it does not pin my worktree's menu. The two worktree pins (§5) are the menu authority here.
3. **Open question 1 (ambiguity threshold):** implemented the spec's minimal deterministic rule (two+ candidates at the SAME top tier with EXACTLY equal score -> AMBIGUOUS_TERM). One-constant change if the architect wants "any two local-tier candidates => ask".
4. **Open question 2 (forced-tool wording):** implemented BOTH registration sites per the spec's resolution (intent on the forced agent_intent tool + `workspace_action` in ToolRegistry/AGENT_ALLOWED_TOOLS for loop paths). SSE Run A proves the assist path works in forced-tool mode.
5. **Open question 3 (terminological step targets):** bound to store-verified literal protocolId+stepId only, as the spec dictates. Run A shows the live model's "step 3" phrasing producing an invented stepId -> visible UNKNOWN_STEP diagnostic, exactly the designed behavior.
6. `src/schema src/surfaces` broad run has pre-existing failures on trunk; failure-file-set identity vs trunk verified (§3). The 13-test trio is green.

## 9. Verification commands (rerunnable)

```
cd /mnt/vast/home/brad/git/wt/PB-CH-1-lane2-l2t1350/server
npx vitest run src/ai/compileWorkspaceAction.test.ts src/ai/AgentOrchestrator.workspaceAction.test.ts   # 30 pass
npx vitest run src/ai/submitSuggestionTool.test.ts src/ai/submitSuggestionTool.protocolEdit.test.ts     # 22 pass
npx vitest run src/ai                                                                                   # 10F/21F/538P (baseline set + my 2 files)
npx vitest run src/schema/AgentActionSchema.test.ts src/surfaces/surfaces.test.ts src/ai/selectSubmitCall.test.ts  # 13 pass
npm run typecheck -w server   # 33 lines, set-identical
npm run typecheck -w app      # 34 lines, set-identical
```

PB-CH-1 CODER DONE 5017e859 (feat(ai): PB-CH-1 server compiles Tier-1 agent actions, off trunk 8f106c6d)
