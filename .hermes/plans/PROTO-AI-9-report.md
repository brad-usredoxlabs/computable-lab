# PROTO-AI-9 report — wip-l2t0615 (cl-senior, lane 2)

Branch `wt/PROTO-AI-9-lane2-l2t0615` off `cl/integration-2 @ dc180b58`. NOT merged, NOT pushed —
the orchestrator owns merge + `cl-browser-reviewer` gate against :5193.
Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-05_0615-PROTO-AI-9-run-page-surface-fix.md`.
Authority: architect decision option (d). Worker log: `/home/brad/.hermes/cl/lanes/2/logs/PROTO-AI-9-l2t0615.log`.
Commit on my branch only: `9f4bb06c` (3 owned files, +353/−3).

## What changed (file:line, post-change numbering)

1. **Surface derivation (§1.1)** — `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:142-145`.
   `const systemPrompt = editorState !== null ? systemPromptForViewer('deck') : systemPromptForViewer(systemPromptKindForTab(activeTab))`.
   While the deck editor is mounted the pane declares the deck viewer (`workspace.deck`), even when
   the workspace active tab is `details:<studyId>` (the run-page shape). No deck editor mounted → the
   old active-tab derivation runs unchanged; pdf/document/other tabs are byte-identical (their
   `systemPrompt.id`, `context.systemPromptId/body` and the send at `:470` all read this one value).
   The old derivation at `:129` was removed (moved here) — single source for chat send, context, and
   the warm path (the wiring inconsistency the reviewer flagged is gone: warm and send can no longer
   disagree).
2. **activeEventGraphId fallback (§1.2)** — `AiTabPanel.tsx:224-228`: non-deck active tab now falls
   back to `editorState?.eventGraphId ?? null`, so the deck template's `{{RUN_ID}}`/graph fields fill
   on the run page. Active deck tab still wins. The rest of the `context` object is untouched
   (`attachedProtocol`, accepted-graph projection, `activeDeckScope` ride as before).
3. **R-Defect-1** — `AiTabPanel.tsx:328-338` (top of `onDraftResult`): a draft result carrying
   `result.error` clears any open proposal and dispatches `reset` → pane returns to chat (ready) with
   the error visible in the chat log (`summarizeDraftResult` already renders `Draft failed: …`, and a
   stream-level `error` event renders the `message-log-error` banner). No empty actionable review,
   the biologist can retry.
4. **R-Defect-2** — `AiTabPanel.tsx:963-977` (ChangesPanel `onApply`, event-graph branch):
   - no protocol proposal AND no mounted preview (`!previewActive`) → `reset` (stay usable), never
     enters `committing`;
   - a real preview → `commit` + `commitPreview()` exactly as before, immediately followed by the
     bounded `reset` (`commitPreview` is a synchronous local editor dispatch, so the pane is back in
     chat in the same turn — the input can never be stranded).
   `sidebarState.ts` itself needed NO semantic change: the commit guard lives in the panel (the only
   place preview state is knowable — a reducer-level `changes.length === 0` guard would strand the
   legitimate labware-only draft: empty changes, real mounted preview that MUST commit; that lesson
   is why the first RED iteration's reducer-level test was re-placed). `sidebarState.test.ts:127-136`
   pins the reducer-side contract (committing → reset/cancel → ready; isChatEnabled false in
   committing) as the bounded-reset-path guarantee.
5. **Tests** — new `app/src/event-editor/right-pane/ai/AiTabPanel.runPageSurface.test.tsx` (7 tests:
   deck-mounted+details-tab → `workspace.deck` + graph-id fallback; details-no-editor →
   `workspace.project-details` (control); pdf → `protocol-builder` (control); deck-tab → tab id wins;
   R-Defect-1; R-Defect-2 both branches). `sidebarState.test.ts` +bounded-reset test.

No schema/lint YAML, no server/, no other app file. `git diff --stat` vs dc180b58: exactly
AiTabPanel.tsx +49/−3, sidebarState.test.ts +10, new test file +297.

## TDD evidence

### RED (before implementation; `npx vitest run` in app/, full file /tmp/red-l2t0615.txt)

```
 ❯ src/event-editor/right-pane/ai/sidebarState.test.ts  (17 tests | 1 failed) 38ms
   ❯ sidebarState > R-Defect-2: commit with nothing pending ... does NOT enter committing
     → expected 'committing' to be 'reviewing' // Object.is equality
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL ...runPageSurface... > deck editor mounted + non-deck active tab sends workspace.deck (NOT project-details)
AssertionError: expected 'workspace.project-details' to be 'workspace.deck' // Object.is equality
 FAIL ...runPageSurface... > R-Defect-1 ... error-bearing draft result leaves the sidebar ready with no changes panel
   → expected <div class="changes-panel" …(1)>…(2)</div> to be null
 FAIL ...runPageSurface... > R-Defect-2 ... Apply with no proposal and no mounted preview stays usable (never committing)
   → expected 'Applying…' to be 'AI Assistant' // Object.is equality
 FAIL ...runPageSurface... > R-Defect-2 ... Apply with a mounted preview still commits exactly once and the input returns
   → Unable to find an element by: [data-testid="chat-input"]
 Test Files  2 failed (2)
      Tests  5 failed | 19 passed (24)
```
(The sidebarState RED above is from the first RED iteration — the reducer-level guard placement I
then rejected for stranding labware-only drafts; the shipped suite replaces it with the
bounded-reset contract, GREEN below. All four panel-level REDs stand against the shipped tests.)

### GREEN (after implementation; /tmp/green-l2t0615.txt)

```
 ✓ src/event-editor/right-pane/ai/sidebarState.test.ts  (15 tests) 4ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.runPageSurface.test.tsx  (7 tests) 201ms
 Test Files  2 passed (2)
      Tests  22 passed (22)
```

### Existing suites stay green (criterion 3)

- Owned-dir sweep `npx vitest run src/event-editor/right-pane/ai/`: **21 files / 164 tests passed**
  (one stray async-timer stderr from ClarificationPicker.test.tsx; green in isolation and part of the
  known flake set, not file-touched by me).
- Targeted six-file run (protocolEdit, AiTabPanel, runPageSurface, sidebarState, ChangesPanel,
  draftChanges): **6 files / 64 tests passed**.
- Event-graph review suites (EventEditorContext, PreviewActionBar, ProposedGraphModal,
  draftPreview, chatReducer): **5 files / 41 tests passed**.
- Broader `src/event-editor` sweep: 101 files — 93 passed / 8 failed, 765 tests — 746 passed /
  19 failed. The 8 failing files (LabwareGlyph, WellGrid.footprint, ProjectTabStrip,
  FindTabPanel×2, ViewerToolbar, PdfViewer, DocumentEditorContext) fail IDENTICALLY with my change
  stashed on base: `Test Files 8 failed | 1 passed (9)` / `Tests 19 failed | 70 passed (89)`.
  Pre-existing; none in my diff.

## Typecheck (criterion 3, second half)

`npx tsc --noEmit` in app/ (node_modules symlinked to cl-integration-2, lockfile byte-identical):

- PRE-change baseline: **24 error lines** (`/tmp/tsc-before-l2t0615.txt`).
- POST-change: **24 error lines** (`/tmp/tsc-after-l2t0615.txt`).
- `diff` of the two files: empty → **ZERO new errors** (line-for-line identical).

Baseline caveat the orchestrator must know (measured, not assumed): the pristine worktree at
dc180b58 does not typecheck the merged trunk — `AiTabPanel.tsx:35` imports `./draftChanges`, but
`draftChanges.ts`/`draftChanges.test.ts` are UNTRACKED lane-local files (listed in
`/home/brad/.hermes/cl/lanes/2/lane-exclude` lines 8-9, present only in the served
`cl-integration-2` checkout). I restored them from the served checkout (they stay excluded-
untracked in my worktree, cannot enter the merge — the orchestrator must carry them the same way
prior lane tasks evidently did; `PROTO-AI-9-lane2-l2t2252` has them too). Both baseline runs above
are WITH that restoration; without it the count is 25 (the added line is the TS2307 module-not-found
itself). The 24 errors are the trunk's pre-existing set (protocol-*, viewer, labware types, one in
systemPromptForViewer.ts:45 `protocol-review` kind gap) — none introduced or removed by me.

## Acceptance criterion 2 — BACKEND TRACE (met, demonstrated by trace)

Harness: my worktree code on an ISOLATED lane-local stack of my own — backend :3095 + vite :5195,
`CONFIG_PATH=/tmp/l2t0615-config.yaml` (mode 600 copy of the served lane config, dataDir
`/home/brad/.computable-lab-l2t0615`, port 3095; never printed), `CL_DATA_DIR=/home/brad/.computable-lab-l2t0615`
(`cp -a` of the lane-2 data dir). :3093/:5193 and :3001/:5174 untouched throughout;
`cl-lane-stack.sh 2` used for STATUS only. Model: the lane's active profile (qwen3.8-thunderbeast →
thunderbeast:8080), active before and after. Real UI driven with the workspace Playwright
(TipTap contenteditable input): opened `/runs/RUN-2026-09-19-run-vwr8`, header showed
`AI Assistant`, typed the flowAC prompt `add a wash step after step 3 and delete the redundant
centrifuge step`, clicked Send.

Trace from my backend (`server/.run-l2t0615/backend.log`), TWO consecutive UI turns, identical shape:

```
[agent az55ew] start surface=workspace.deck model=qwen3.8-flash-next promptLen=69 effectivePromptLen=69 historyLen=0 attachments=0 deterministicOnly=false clarificationAnswers=0
[agent az55ew] turn 1 starting, promptChars=54385, docDiscussion=false
[agent az55ew] turn 1 finish=stop contentLen=0 toolCalls=1 [agent_intent]
[agent az55ew] done protocol_edit success=true ops=2 elapsedMs=20178

[agent 4d6cqk] start surface=workspace.deck model=qwen3.8-flash-next promptLen=69 effectivePromptLen=69 historyLen=0 attachments=0 deterministicOnly=false clarificationAnswers=0
[agent 4d6cqk] turn 1 starting, promptChars=54385, docDiscussion=false
[agent 4d6cqk] done protocol_edit success=true ops=2 elapsedMs=5229
```

- `surface=workspace.deck` — NOT `workspace.project-details`. ✓
- `promptChars=54385` — the ~53k precheck shape (pre-fix contrast, still in the untouched gate
  stack log `cl-integration-2/.run/backend.log`: `start surface=workspace.project-details ...
  promptChars=31060`). ✓
- The turn produced a schema-VALID proposal (server-side protocol_edit validation passed, ops=2) —
  the UI review panel showed exactly: `+step (new step) — now: Wash — kind wash — after step-3` and
  `-step step-6 — was: Centrifuge the lysate ...` against
  `Protocol: PureLink Genomic DNA Extraction (Thermo Fisher) (PRT-4iaey2)`, Accept/Reject present,
  chat input available during review.
- Propose-never-write verified: PRT-4iaey2 `updatedAt` still `2026-09-12T20:30:05.113Z`, zero
  record-mutation requests in my backend log — the fixture record is UNCHANGED.
- Screenshots: `/home/brad/.hermes/cl/lanes/2/logs/l2t0615-c2-01-run-page.png`,
  `-02-sent.png`, `-03-settled.png`; driver logs
  `/home/brad/.hermes/cl/lanes/2/logs/PROTO-AI-9-l2t0615-c2-driver.log` (+ `-driver-2.log`).
- Post-run: my :3095/:5195 processes stopped (own pids/ports only); `cl-lane-stack.sh 2 status`
  re-checked healthy (`:3093 http=200 :5193 http=200`) — the orchestrator's gate stack never
  restarted, therefore it still serves the PRE-fix code until the orchestrator merges this diff and
  restarts it (the browser gate must run AFTER that restart).

Note: the [warm] path on my stack logged `Inference error 400: No user query found in messages`
before the first real prefilled warm succeeded — identical failures are present 11× in the gate
stack's own log at :3093 (pre-existing lane-profile/warm behavior, orthogonal to this fix: the real
assist turns are what criterion 2 measures and they succeeded).

## Blockers

None. All four acceptance-criterion items I own (1, 2, 3, and the fix itself) are demonstrated above.
Criterion 4 (browser gate) is the orchestrator's, and per the trace note above it requires merging
this diff + a :5193 restart first.

## assumptions:

- id: AS-PROTO-AI-9-SURFACE-MOUNTED
  task: PROTO-AI-9 §1
  value: the sent surface is `workspace.deck` whenever `editorState !== null`, regardless of which
    WorkspaceProvider tab is active — i.e. every host that mounts EventEditorProvider around the
    pane gets deck surface (today: run page via RunWorkspacePage; standalone event-editor page too,
    which already sends deck when its tab is a deck).
  where: AiTabPanel.tsx:142-145
  why_missing: the architect ruling names the condition ("deck editor mounted, active tab not a
    deck → deck surface") without enumerating every possible future host; generalizing mounted→deck
    is the smallest total function matching it.
  affects: any current/future page mounting EventEditorProvider + AiTabPanel; pdf/document/other
    tabs (no editor mounted) are provably unchanged (pinned by control tests).
  reversible: yes, single ternary.
  evidence_debt: none material — the two existing hosts are both covered by unit + the run-page trace.
  cleanup: n/a
  owner: cl-senior (implementation), orchestrator (sign-off)
- id: AS-PROTO-AI-9-RDEFECT2-PLACEMENT
  task: PROTO-AI-9 §2 R-Defect-2
  value: "an apply with no proposal and no mounted preview must not enter committing" enforced in
    AiTabPanel.onApply (`!previewActive` → reset), NOT in sidebarReducer; plus a same-turn bounded
    reset after the real commit.
  where: AiTabPanel.tsx:963-977; sidebarState.test.ts:127-136 pins the reducer reset contract.
  why_missing: the spec text reads like a sidebarState.ts change, but the reducer cannot see the
    mounted preview and a changes.length guard would strand the legitimate labware-only draft
    (empty changes + real preview that must commit); the panel owns preview knowledge and the
    happy-path dispatch order stays byte-identical.
  affects: R-Defect-2 wording only; behavior satisfies the stated requirement verbatim.
  reversible: yes.
  evidence_debt: none — RED/GREEN + the real commit path unit test.
  cleanup: n/a
  owner: cl-senior; orchestrator may re-request reducer placement (would need a `hasPreview`
    payload field on the commit action).
- id: AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL
  task: PROTO-AI-9 build integrity (encountered, not caused)
  value: the merged trunk's `./draftChanges` import resolves ONLY via the lane-exclude untracked
    copy (lane-exclude lines 8-9); pristine worktrees and any fresh clone of cl/integration-2 do
    not compile without it. I restored the identical pair from the served checkout (server-side,
    lane-excluded files were likewise restored — merged server imports BypassAudit.js et al.).
  where: app/src/event-editor/right-pane/ai/draftChanges.{ts,test.ts} (+ 60 server/app
    lane-excluded files restored untracked).
  why_missing: the files were never committed on any branch (git log --all shows no draftChanges.ts);
    this is a pre-existing lane-infrastructure gap inherited by the AI-9 merge.
  affects: any worktree/CI that builds cl/integration-2 from git alone; the orchestrator's merge of
    my diff does NOT depend on my copies (they are excluded-untracked; the merge sees only my 3
    owned files) — but the post-merge :5193 stack must keep using the served checkout's untracked
    files, as it does today.
  reversible: yes (files are untracked).
  evidence_debt: a real fix (committing draftChanges et al. to the trunk, or curating
    lane-exclude) is trunk housekeeping OUTSIDE my file ownership — flagged, not done.
  cleanup: orchestrator: decide commit-vs-exclude for draftChanges + the lane-exclude set.
  owner: orchestrator.
- id: AS-PROTO-AI-9-ISOLATED-STACK
  task: PROTO-AI-9 criterion-2 evidence
  value: trace captured on my own stack (:3095/:5195, own config/data copies, lane data dir
    `cp -a`) instead of :5193, because restarting the gate stack is BLOCKING and the gate stack
    still serves pre-fix code until merge.
  where: /tmp/l2t0615-config.yaml (mode 600, secret-bearing, never copied anywhere),
    /home/brad/.computable-lab-l2t0615 (63M copy; deletable by orchestrator).
  why_missing: the spec permits starting the lane stack; :5193 restart was off-limits to me, so a
    byte-comparable isolated stack is the only way to trace MY code. The data dir is the SAME lane-2
    records, same active AI profile — the trace shape is gate-representative.
  affects: evidence provenance only; no shared state changed.
  reversible: yes.
  evidence_debt: the gate's :5193 will show the same trace only AFTER merge+restart (AS-W7 debt
    already reserves Accept→apply proof for the browser gate).
  cleanup: orchestrator may delete /home/brad/.computable-lab-l2t0615 and /tmp/l2t0615-config.yaml.
  owner: cl-senior created; orchestrator disposes.

## Handoff to orchestrator

1. Merge `9f4bb06c` (branch `wt/PROTO-AI-9-lane2-l2t0615`) into `cl/integration-2`; the served
   checkout's untracked lane-exclude files (draftChanges etc.) carry over unchanged.
2. `cl-lane-stack.sh 2 restart` (BLOCKING — your call), then run `flowAC/plan.json` UNCHANGED
   against :5193. Expect: backend log shows `surface=workspace.deck` / promptChars ≈ 54385; the
   flowAC prompt now yields the wash-after-3 + delete-centrifuge diff (verified end-to-end on my
   isolated stack, record untouched).
3. My run-page screenshots for reference: `l2t0615-c2-0{1,2,3}-*.png` in `/home/brad/.hermes/cl/lanes/2/logs/`
   (context for the reviewer; the reviewer's own trail remains the acceptance evidence).
4. Temp dirs I own (deletable post-merge): `/home/brad/.computable-lab-l2t0615`,
   `/tmp/l2t0615-config.yaml`, `server/.run-l2t0615/`, `app/.run-l2t0615/`, `/tmp/tsc-*.txt`,
   `/tmp/red-l2t0615.txt`, `/tmp/green-l2t0615.txt`, `/tmp/l2t0615-c2-driver.cjs`.
