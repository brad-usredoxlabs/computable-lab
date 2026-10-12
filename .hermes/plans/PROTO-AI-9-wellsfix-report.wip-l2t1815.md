# PROTO-AI-9 wellsfix report (l2t1815) — DONE, no blocker

Branch `wt/PROTO-AI-9-wellsfix-lane2-l2t1815` off `cl/integration-2` @ `0e798b13`.
Commit: **`05cc4024`** — `fix(ai-9): teach the WellSelector object shape in the protocol_edit prompt + rail refresh on AI accept (D1/D2)`. NOT merged (orchestrator merges).

## Diff summary (git diff --numstat HEAD~1 HEAD)

```
42	0	app/src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx
7	0	app/src/event-editor/right-pane/ai/AiTabPanel.tsx
9	0	server/prompts/event-graph-agent.md
```

58 insertions, **0 deletions** across the whole commit (verified: `git diff HEAD~1 HEAD -- server/prompts/event-graph-agent.md | grep -c '^-[^-]'` → 0). No golden file touched; no golden-prompt update was needed (`grep golden` over the prompt-covering suites found no snapshot/`toMatchSnapshot` on the template — `attachedProtocol.test.ts` / `promptBudget.test.ts` assert structure/budget, not content hashes).

## Part 1 — prompt DATA fix (`server/prompts/event-graph-agent.md`, protocol_edit block ONLY)

Pure insertion of 9 NEW lines between the op-vocabulary bullets and `Hard rules:` (new lines :129–137). All four architect §3.1 items present:

1. **WellSelector OBJECT shape statement at BLOCK level** (covers `wells` in every op incl. `target`/`source` sub-objects and the future kind-change payload): the four forms with one inline example each — `{ "kind": "all" }`, `{ "kind": "explicit", "wells": ["A1", "A2"] }`, `{ "kind": "range", "range": { "start": "A1", "end": "H12" } }`, `{ "kind": "region", "region": "<name>" }` — plus plainly: bare array or `null` are **REJECTIONS** on this path.
2. **Disambiguation line**: "Well Ranges" / "Event Detail Schemas" describe the EVENT-GRAPH DRAFT path only (plain array); on `protocol_edit` `wells` is ALWAYS the WellSelector object.
3. **Default**: unnamed wells → `{ "kind": "all" }`; `explicit`/`range` only for user-named wells. No numeric default added anywhere.
4. **Op-tag restatement**: op names exactly as listed; `insert_after`/`delete`-style tags invalid; position = `afterStepId`/`beforeStepId` fields; deletion = `step_delete`.

### Byte-unchanged guarantee (sha256 of the exact lines, HEAD `0e798b13` vs working tree, measured BEFORE commit)

- **:124** (`step_update` bullet) BYTE-IDENTICAL, unchanged line number, sha `017d5dac6ec69df58382607392a0ace5957e24c23b1b6ca26fb6379dbd4b44d5` (l2t1730's concurrent-edit line untouched).
- **:125** (`step_insert` bullet) BYTE-IDENTICAL, unchanged line number, sha `6be702ae7145acda1099e73aeb2dfb915364643e495b5e41b330563cbfaeee1f`.
- **:132** (ASK rule, "never guess numbers or role names") BYTE-IDENTICAL, sha `3b5350df930f56e9333981e0c6c5320d9a786915fa1a50944b5a439b594bfaf8` — note the insertion is AFTER it, so in the new file it renders at line :141; content verbatim, no cycles default added.
- Insertion point is after :128 (equipment bullet), so it also merges cleanly with l2t1730's :124 edit (different hunk region).
- Event-graph sections (:365-448) untouched; schema YAML, `protocolEditValidation.ts`, `AgentOrchestrator.ts`, `protocolEditOps.ts`, `ProtocolEditOpSchema.test.ts` all UNCHANGED (architect §3.2) — commit touches exactly the 3 files above.

## Part 2 — rail refresh (`app/src/event-editor/right-pane/ai/AiTabPanel.tsx`)

`handleProtocolAccept`: after `await applyProtocolEdit(...)` resolves, fires
`window.dispatchEvent(new CustomEvent('cl:records-changed'))` — SUCCESS branch only (inside the try, after the await; a rejection skips it entirely, so the D4 stale-sha/error branch dispatches nothing). Code comment cites the mirrored human convention: `ProtocolStepEditModal.tsx:99` (plus `ProtocolTabPanel.tsx:1394`, `ProtocolNavPanel.tsx:130`). `RunProtocolStepsLoader.tsx:119-123` listens and refills the rail. No change to `protocolEditOps.ts`, ChangesPanel render contract, the event mechanism, or sidebarState.

## RED-first proof (Part 2)

Added 2 tests to `AiTabPanel.protocolEdit.test.tsx` (window addEventListener spy pattern):
- success accept dispatches `cl:records-changed` exactly once,
- stale-sha failed accept dispatches NOTHING (asserts the D4 alert appeared, then listener never fired).

RED run (tests added, `AiTabPanel.tsx` NOT yet changed):
`npm run test:unit -w app -- src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx`
→ `Test Files 1 failed (1) — Tests 1 failed | 8 passed (9)`; failure at the success-dispatch assertion `expect(listener).toHaveBeenCalledTimes(1)` (waitFor timeout, listener never called). **RED proven.**
GREEN run (after the dispatch line): `Tests 9 passed (9)`.

## Test suites (NEW failures only)

Server prompt/AI suites:
`npm run test:run -w server -- src/ai/attachedProtocol.test.ts src/ai/promptBudget.test.ts src/ai/chatbotCompile.e2e.test.ts src/schema/ProtocolEditOpSchema.test.ts`
→ `Test Files 2 failed | 2 passed (4); Tests 2 failed | 60 passed (62)`.
**NEW failures: 0.** Both failures are PRE-EXISTING at trunk `0e798b13` — proved by `git stash push -- server/prompts/event-graph-agent.md` (all my changes stashed) and rerunning: same 2 fail with the identical assertions (`promptBudget`: expected **43015** < 12000 at trunk vs **44156** < 12000 with my +1141-char data-only addition — the budget trip is a trunk-state failure my edit only shifts numerically, not a new class; `chatbotCompile.e2e`: `expected undefined not to be undefined` — both stash-verified). Stash popped, changes restored.
`attachedProtocol.test.ts` and `ProtocolEditOpSchema.test.ts` (the protocol-edit structural guards) PASS with the edit.

App AI-panel suite:
`npm run test:unit -w app -- src/event-editor/right-pane/ai/`
→ with my changes: `Tests 160 passed (160)`, `Test Files 3 failed | 20 passed`, `Errors 1`.
Trunk baseline (same stash method): `Tests 158 passed (158)`, `Test Files 3 failed | 20 passed`, `Errors 1`.
**NEW failures: 0.** The 3 failed files / 1 error are the same at trunk: `useChatThread.deckLayout.test.tsx` fails to load because vitest resolves it through the node_modules symlink to `/mnt/vast/home/brad/git/computable-lab/...` (environment/symlink artifact, my file untouched), plus a `ClarificationPicker.test.tsx` timer unhandled-error also present at trunk. My +2 tests are the only delta (158→160 passing).

## Typecheck (measured in my worktree, vs pristine baselines server 44 / app 40)

- `npm run typecheck -w server` → **44** `error TS` — equal to the baseline; zero errors in `event-graph-agent`-adjacent or my touched files.
- `npm run typecheck -w app` → **40** `error TS` — equal to the baseline; zero errors mentioning `AiTabPanel`.
- **NEW errors: 0** both sides. (Baseline errors are the known pre-existing/lane-exclude-symlink set, outside my files.)

## Constraints honored

No schema/YAML, applier, orchestrator, validation, or event-mechanism change; no TS coercion of `wells`; prompt stays DATA; `:3001`/`:5193`/`:5174` and Brad's tree untouched; no lane-stack restart; no merge; no other `.wip`/canonical report touched.

## Residual (for orchestrator, not a blocker)

Post-merge per architect §4: restart :3093, fresh `PRT-4iaey2` sha baseline, pre-check ×3 (watch whether `cycles` is user-cited/asked vs invented — my prompt adds no numeric default), then the cl-browser-reviewer wash gate on :5193.
