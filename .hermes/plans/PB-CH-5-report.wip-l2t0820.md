# PB-CH-5 REPORT — Analysis as the first compiled cross-page composition target
Worker: cl-coder (lane 2) · token l2t0820
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-5-lane2-l2t0820
Branch: cl/PB-CH-5-lane2-l2t0820
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_0820-PB-CH-5-analysis-adapter-spec.md

Status: IMPLEMENTATION COMPLETE — acceptance PENDING (adversarial gate, orchestrator API
receipts after restart, orchestrator-owned browser gate).

---

## 0. Gate: claim-time SHA + ed397216-ancestor proof

```
$ git -c core.fileMode=false rev-parse HEAD
8bfa6c1ff724d85da20ca59bc84a4a117809f83f
$ git -c core.fileMode=false merge-base --is-ancestor ed397216 HEAD && echo "ANCESTOR-OK ed397216"
ANCESTOR-OK ed397216
$ git -c core.fileMode=false log --oneline -3
8bfa6c1f docs(lane2): handoff 08:10 — PB-CH-4 fix2 cycle-2 accepted, merged 88496f2c; ...
88496f2c merge(PB-CH-4 lane2): workstate-turn never opens empty event-graph review; flag leak closed at single sendChat choke point (gate D1 + adversarial cycles 1-2)
f72983d4 fix(PB-CH-4): close the workstate-turn flag leak on the remaining send paths + correct the ordering citation (review fix1 D1/D2)
```

Claim-time SHA **8bfa6c1f** includes the PB-CH-4 merge **88496f2c**, which includes **ed397216**
plus the gate-fix chain (`ebec9ad0` fix1, `f72983d4` fix2) that touched **AiTabPanel**.
Per the Worker contract, every PB-CH-4 cite was RE-VERIFIED against this HEAD before wiring §4/§5:

| spec cite (at ed397216) | reality at 8bfa6c1f |
| --- | --- |
| `submitSuggestionTool.ts` intent enum :443 | enum line now :443→:446 region; substance identical (six-member enum) |
| `AgentOrchestrator.ts` workstate branch :2153-2199 | branch body ends at :2223 (`return wsProposalResult`); the analysis branch was inserted immediately after it |
| `types.ts` `workstate_proposal` :887 | member at :887; `analysis_proposal` added additively after it |
| `assistStream.ts:204-210,378-392` | union member at :210, `case 'workstate_proposal'` at :387 — same shape |
| `AiTabPanel.tsx` flow :586 / accept :641 | `handleWorkstateProposal` at :618, `handleWorkstateAccept` at :679 (moved by the fix1/fix2 chain; substance identical) |
| `workstateTurnRef` D1 flag | :352, consumed in `onDraftResult` :367-368, cleared at the single `sendChat` choke point :736 |

Line numbers moved; substance unchanged. No cite was taken as gospel.

---

## 1. RED-first outputs (pasted before the wiring that turns them green)

### 1a. First targeted check (spec §"First targeted check") — pure-module file only, module absent

`cd server && npx vitest run src/drafts/analysisCompile.test.ts src/drafts/workstateCompile.test.ts`
with `analysisCompile.test.ts` written and `analysisCompile.ts` NOT yet created:

```
 RUN  v1.6.1 /mnt/vast/home/brad/git/wt/PB-CH-5-lane2-l2t0820/server

 ❯ src/drafts/analysisCompile.test.ts  (0 test)
 ✓ src/drafts/workstateCompile.test.ts  (17 tests) 884ms

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/drafts/analysisCompile.test.ts [ src/drafts/analysisCompile.test.ts ]
Error: Failed to load url ./analysisCompile.js (resolved id: ./analysisCompile.js) in
/mnt/vast/home/brad/git/wt/PB-CH-5-lane2-l2t0820/server/src/drafts/analysisCompile.test.ts.
Does the file exist?
 ❯ loadAndTransform ../../../computable-lab/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

 Test Files  1 failed | 1 passed (2)
      Tests  17 passed (17)
```

GREEN after implementing the pure module (no adapter registration, no HTTP, no host file touched):

```
 ✓ src/drafts/workstateCompile.test.ts  (17 tests)
 ✓ src/drafts/analysisCompile.test.ts  (16 tests)
 Test Files  2 passed (2)
      Tests  33 passed (33)
```

### 1b. Genericity signal RED with the YAML data entries REMOVED (proves the mapping is what carries it)

`config/drafting/workstate-tab-kinds.yaml` reverted to HEAD (the two analysis DATA entries removed),
genericity test kept, `workstateCompile.ts` byte-identical to HEAD (zero analysis-aware code):

```
⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/drafts/workstateCompile.test.ts > workstate proposal compilation (pure module) > genericity (PB-CH-5): a plain compose-workstate resolves a seeded analysis-revision with ZERO analysis-aware code
 Test Files  1 failed (1)
      Tests  1 failed | 16 passed (17)
```

GREEN with ONLY the two YAML DATA entries restored (no TS change anywhere in workstateCompile.ts):

```
 Test Files  1 passed (1)
      Tests  17 passed (17)
```

**No special-casing was needed in `workstateCompile.ts`. The stop-boundary did NOT fire.** The only
sanctioned change to that file is the export-only lift (§5 below).

### 1c. Six→seven enum golden diff shown DELIBERATELY (RED against the widened pins, then green)

Pins updated to the seven-intent expectation while `submitSuggestionTool.ts` was still at HEAD (six):

```
 FAIL  src/ai/submitSuggestionTool.protocolEdit.test.ts > agent_intent — protocol_edit intent (PROTO-AI-7) > exposes a seven-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)
 FAIL  src/ai/submitSuggestionTool.test.ts > agent_intent — the constrained emission menu > exposes a single forced tool with a seven-intent menu (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)
 FAIL  src/ai/submitSuggestionTool.workstate.test.ts > agent_intent — compose_workstate intent (PB-CH-4) > exposes a SEVEN-intent menu, exactly (event_graph | deck_layout | create_record | protocol_edit | workspace_action | compose_workstate | compose_analysis)
AssertionError: expected [ 'event_graph', 'deck_layout', …(4) ] to deeply equal [ 'event_graph', 'deck_layout', …(5) ]

- Expected
+ Received

  Array [
    "event_graph",
    "deck_layout",
    "create_record",
    "protocol_edit",
    "workspace_action",
    "compose_workstate",
-   "compose_analysis",
  ]

 Test Files  3 failed (3)
      Tests  3 failed | 25 passed (28)
```

GREEN after the §4 emission hunk (the enum widening) landed:

```
 ✓ src/ai/submitSuggestionTool.test.ts
 ✓ src/ai/submitSuggestionTool.protocolEdit.test.ts
 ✓ src/ai/submitSuggestionTool.workstate.test.ts
 ✓ src/ai/submitSuggestionTool.analysis.test.ts
 ✓ src/ai/AgentOrchestrator.analysisProposal.test.ts
 Test Files  5 passed (5)
      Tests  39 passed (39)
```

Nothing else was re-goldened (see §6 forbidden-diff proof).

---

## 2. Test-matrix mapping (spec §"Red-first test matrix", criterion → named test → where)

| Criterion | Named test | File |
| --- | --- | --- |
| reference grounding | `revision/run terms resolve via spine tiers [0,1], mint-only never binds` → `compiles an open-existing-run proposal…`, `compiles a staged-create proposal…`, `mint-only candidate never binds (tier-5 leak guard exercised every call)` | `server/src/drafts/analysisCompile.test.ts` |
| reference grounding | `UNRESOLVED_TERM / AMBIGUOUS_TERM with ok:false` → `unresolvable target term yields UNRESOLVED_TERM with ok:false`, `ambiguous term (two same-tier equal-score candidates) yields AMBIGUOUS_TERM with ok:false` | pure |
| reference grounding | `invented recordId never projects (UNKNOWN_RECORD)` | pure + lifecycle (`blocked compiles: … canAccept:false with zero writes`) |
| renderer compatibility | `ViewRenderer unknown renderer still renders view-spec__error (frozen test byte-green)` → `ViewRenderer.test.tsx` untouched (7 tests green) | `app/src/analysis/ViewRenderer.test.tsx` (frozen) |
| renderer compatibility | `renderViews unsupported renderer + missing artifact show the error arms` | `app/src/analysis/ViewRenderer.compat.test.tsx` (NEW) |
| renderer compatibility | `zero new renderer identifiers in the diff` → `source-pin: ViewRenderer gains ZERO new renderer identifiers` | NEW |
| revision chaining | `staged run's revisionRef.id equals the resolved revision recordId` → `compiles a staged-create proposal…` + lifecycle `compiles a staged-create proposal: exactly ONE staged analysis-run…` | pure + lifecycle |
| revision chaining | `revision term resolving to an analysis-run yields WRONG_REFERENCE_KIND, nothing staged` → `WRONG_REFERENCE_KIND: a revision target resolving to an analysis-run is a diagnostic, nothing staged` | pure |
| revision chaining | `record-edit tab ids re-derive equal via the mapping's idPrefix` → genericity test asserts `activeTabId === 'record:ANREV-TEST1'` (matches `recordEditTabId` in app `types.ts`) + `analysis-composition.yaml`/`workstate-tab-kinds.yaml` `idPrefix: record` | pure |
| failed creates | `an invalid staged run envelope blocks: DRAFT_INVALID, canAccept:false, no canonical write` → `a failed staged create (Ajv/lint reject) yields a named diagnostic, nothing partial lands` + lifecycle `blocked compiles…` | pure + lifecycle |
| failed creates | `staged create is the ONLY store mutation during compile (spy…)` → `staged create is the ONLY store mutation during compile+accept (spy: form-draft lifecycle + the one analysis-run, zero elsewhere)` + pure `the staged create is the ONLY store mutation (StagingStore capability boundary)` | lifecycle + pure |
| NO implicit execute/promote | `vi.mock(analysisRunner/artifactPromotion/analysisService) — zero calls across compile+accept+repeat-accept` → `NO implicit execute/promote: the analysis execution modules are never touched across compile+accept+repeat-accept` | `AnalysisDraftAdapter.test.ts` |
| NO implicit execute/promote | `module-boundary source-pin: no server/src/analysis import in server/src/drafts/**` → pasted grep (§6) + `grep -rn "from '../analysis/" server/src/drafts` = 0 matches | source-pin |
| NO implicit execute/promote | `accept returns queued status; no execute-route invocation` → `accept lands exactly ONE queued analysis-run…` (`status: 'queued'` asserted) + `the only status the drafts module writes is queued` (source-pin in §6) | lifecycle |
| no implicit execute client-side | `AnalysisPage mount fires only listAnalysisRevisions/listAnalysisRuns (spies) — no execute, no promote` | `app/src/analysis/AnalysisPage.no-execute.test.tsx` (NEW) |
| no implicit execute client-side | `AiTabPanel accept path issues exactly one /drafts/accept fetch and ZERO /ai/assist/stream` → `Accept of an analysis card posts exactly {draftId,revision,reviewHash} … ZERO /ai/assist/stream fetch` | `app/src/event-editor/right-pane/ai/AiTabPanel.analysis.test.tsx` (NEW) |
| staged mutation actor-bound | `staged run payload.initiator equals the authenticated actor` → `compiles a staged-create proposal…` (`payload.initiator === 'USR-TEST'`) + payload excerpt §4 | lifecycle |
| staged mutation actor-bound | `cross-actor accept is 403` → `a second actor's accept is rejected (403) and writes carry ensureOwnerPolicy` | lifecycle |
| staged mutation actor-bound | `writes carry ensureOwnerPolicy (spy)` → same test (spy records `kind:recordId:userId` per write) | lifecycle |
| reject creates/moves nothing | `compile (with staged create) then abandon: canonical records hash + var/sessions/<user>/main.yaml sha256 BYTE-IDENTICAL` → `compile-then-abandon leaves /api/session and the canonical records byte-identical` (pairs in §5) + client-side `Reject of an analysis card creates/moves nothing…` | lifecycle + app |
| accept lands the workstate | `accept body deep-equals compile result (flat sessionDocument/summary/resolvedTerms, lab-session Ajv-valid, activeTabId server-derived)` → `accept body deep-equals the compile result…` | lifecycle |
| accept lands the workstate | `repeat accept byte-identical, no duplicate run record` → `accept lands exactly ONE queued analysis-run; repeat accept is byte-identical with no duplicate` | lifecycle |
| card lifecycle by contract | `analysis_proposal event alone renders NO accept control until compile response` → `an analysis_proposal event alone renders NO accept control (compiling slot)…` | `AiTabPanel.analysis.test.tsx` |
| card lifecycle by contract | `canAccept:false → diagnostics, no accept control` → `canAccept:false analysis compile renders summary + diagnostics and NO accept control` | NEW |
| card lifecycle by contract | `adapter 'analysis' is the only flow delta; card/accept code paths shared (source-pin) not forked` → `source-pin: card/accept/reject paths are SHARED, not forked…` | NEW |
| genericity (the WHY) | `plain compose-workstate opens a seeded analysis-revision with the TWO-YAML-LINE mapping change and ZERO analysis-aware code` → `genericity (PB-CH-5): …` | `server/src/drafts/workstateCompile.test.ts` (+ RED proof §1b) |
| envelope pins | `intent schema tolerates compiler-injected requestId` → `envelope pins: requestId tolerated; malformed envelopes are MALFORMED_ENVELOPE; XOR enforced in schema` (pure) + `the analysis intent envelope is Ajv-authoritative (registered schema)` (lifecycle) | pure + lifecycle |
| envelope pins | `new AgentEvent member parses, optional fields ABSENT not undefined` → `an analysis_proposal SSE frame parses into the union member carrying the INTENT verbatim` (app) + `exactOptionalPropertyTypes discipline: no undefined-valued keys in the staged payload` (pure) + `emits exactly ONE analysis_proposal event…` (server) | app + pure + server |

New test files (9): `server/src/drafts/analysisCompile.test.ts` (16), `server/src/drafts/AnalysisDraftAdapter.test.ts` (11),
`server/src/ai/submitSuggestionTool.analysis.test.ts` (7), `server/src/ai/AgentOrchestrator.analysisProposal.test.ts` (4),
`app/.../assistStream.analysis.test.ts` (3), `app/.../useChatThread.analysis.test.tsx` (3),
`app/.../AiTabPanel.analysis.test.tsx` (6), `app/src/analysis/ViewRenderer.compat.test.tsx` (3),
`app/src/analysis/AnalysisPage.no-execute.test.tsx` (2).

---

## 3. Verification 2 — `cd server && npx vitest run src/drafts`

Baseline pin [m at ed397216]: 3 files / 39 PASS. After PB-CH-5 (baseline untouched-green + new files):

```
 ✓ src/drafts/workstateCompile.test.ts  (17 tests) 490ms
 ✓ src/drafts/analysisCompile.test.ts  (16 tests) 775ms
 ✓ src/drafts/WorkstateDraftAdapter.test.ts  (13 tests) 1603ms
 ✓ src/drafts/FormDraftService.test.ts  (10 tests) 1810ms
 ✓ src/drafts/AnalysisDraftAdapter.test.ts  (11 tests) 1874ms
 Test Files  5 passed (5)
      Tests  67 passed (67)
```

3 baseline files (39: 17 + 13 + 10 — `workstateCompile.test.ts` carries the +1 genericity test)
+ 2 new files (27), ZERO failures.

## 4. Verification 3 — server `src/ai`, `src/analysis`, `src/schema src/surfaces`

`cd server && npx vitest run src/ai` (baseline [m] 10 failed files / 21 failed / 578 passed, 76 files):

```
 Test Files  10 failed | 68 passed (78)
      Tests  21 failed | 589 passed (610)
```

Failing-file SET identity vs the trunk measured at the same claim-time commit:

```
$ grep '^ FAIL' /tmp/trunk-ai-run.txt | awk '{print $2}' | sort -u > /tmp/trunk-ai-fail-files.txt
$ grep '^ FAIL' /tmp/final-wt-ai.txt  | awk '{print $2}' | sort -u > /tmp/final-wt-ai-files.txt
$ comm -3 /tmp/trunk-ai-fail-files.txt /tmp/final-wt-ai-files.txt
$ echo "FINAL-AI-SETDIFF-EXIT:$?"
FINAL-AI-SETDIFF-EXIT:0        # empty comm -3 output = SET IDENTICAL
```

Both lists (10 files, identical):
```
src/ai/AgentOrchestrator.bypass.test.ts
src/ai/AgentOrchestratorForwarding.test.ts
src/ai/AgentOrchestrator.golden.test.ts
src/ai/AgentOrchestrator.goldenWithSeeds.test.ts
src/ai/AgentOrchestrator.tubeGate.test.ts
src/ai/ChatbotCompileDeckSlot.test.ts
src/ai/chatbotCompile.e2e.test.ts
src/ai/InferenceClient.config.test.ts
src/ai/materialFollowUp.test.ts
src/ai/submitSuggestionTool.tubeSchema.test.ts
```
Delta vs the pin is exactly PB-CH-5's +2 new test files (76→78) and +11 passing tests
(578→589); the failing-file set is unchanged, and the deliberate six→seven golden delta is
shown in §1c. The 10 baseline-red files are pre-existing (seed/golden/env-dependent) — reported, not fixed.

`cd server && npx vitest run src/analysis` → **6 files / 32 PASS** (baseline [m] 6/32, byte-green untouched):
```
 Test Files  6 passed (6)
      Tests  32 passed (32)
```

`cd server && npx vitest run src/schema src/surfaces` (baseline [m] 4 failed files / 11 failed / 371 passed / 53 skipped, 44 files):
```
 Test Files  3 failed | 36 passed | 5 skipped (44)
      Tests  10 failed | 372 passed | 53 skipped (435)
```
Failing files: `EventGraphEquipmentSchema.test.ts`, `LabwarePhysicalGeometryData.test.ts`,
`surfacesAjv.test.ts` — all three are **gitignored symlinks into Brad's live tree** (verified):
```
lrwxrwxrwx … server/src/schema/EventGraphEquipmentSchema.test.ts -> /mnt/vast/home/brad/git/computable-lab/server/src/schema/EventGraphEquipmentSchema.test.ts
lrwxrwxrwx … server/src/surfaces/surfacesAjv.test.ts            -> /mnt/vast/home/brad/git/computable-lab/server/src/surfaces/surfacesAjv.test.ts
```
`ControlledDocumentSchemas.test.ts` is a regular file whose read is denied (`-rwx------+ 3000 root`),
so vitest reports it as a load error in some runs and not others — the 4-file vs 3-file difference is
that landmine class, not PB-CH-5. Reported, never fixed (spec: symlink landmines are baseline RED).

## 5. Verification 4 — app targeted suites

`cd app && npx vitest run src/analysis src/shared/session src/event-editor/right-pane/ai`:
```
 Test Files  3 failed | 40 passed (43)
      Tests  293 passed (293)
 FAIL  src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx [ … ]
 FAIL  src/event-editor/right-pane/ai/draftChanges.test.ts [ … ]
 FAIL  src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx [ … ]
```
All three are load-errors present in the trunk baseline set too (§6 comm -3 proves set identity);
`useChatThread.deckLayout.test.tsx` is the gitignored-symlink environmental red the spec names.
ZERO test failures in this scope (293 passed, 0 failed).
- `src/analysis` alone: baseline 2 files / 9 PASS preserved + 2 new files → `4 passed (4) / 14 passed (14)`
  (`ViewRenderer.test.tsx` 7 + `AnalysisPage.test.tsx` 2 = the frozen 9, byte-untouched).
- `src/shared/session` alone: `7 passed (7) / 70 passed (70)` — baseline [m] 7/70 preserved.

## 6. Verification 5 — full app suite, failing-file SET identity vs the 53-file baseline

Trunk (`/mnt/vast/home/brad/git/cl-integration-2`, same claim-time commit) and the worktree, both
`cd app && npx vitest run`:

```
TRUNK:  Test Files  53 failed | 234 passed (287)   Tests  63 failed | 1949 passed (2012)
WORKTREE: Test Files 53 failed | 239 passed (292)  Tests  63 failed | 1966 passed (2029)

$ grep '^ FAIL' … | grep -oE 'FAIL[ ]+src/[^ ]+' | awk '{print $2}' | sort -u
$ wc -l /tmp/trunk-app-fail-files.txt /tmp/final-wt-app-files.txt
 34 /tmp/trunk-app-fail-files.txt
 34 /tmp/final-wt-app-files.txt
 68 total
$ comm -3 /tmp/trunk-app-fail-files.txt /tmp/final-wt-app-files.txt
$ echo "FINAL-APP-SETDIFF-EXIT:$?"
FINAL-APP-SETDIFF-EXIT:0        # EMPTY comm -3 output = failing-file SET IDENTICAL
```

Declared accounting: the spec's [m] pin says "53 failed files"; the extracted unique FAIL-path list
is 34 entries because 19 of the 53 are suite-level load errors whose `FAIL` lines carry a bracketed
second token (the extractor above keeps the first token). The comparison is apples-to-apples: the
same extractor over the same command on both trees yields an EMPTY `comm -3`. Totals match the pin
(53 failed files / 63 failed tests); passed count rises 1949→1966 (+17 new PB-CH-5 tests) and file
count 287→292 (+5 new app test files). `ClarificationPicker.test.tsx` did NOT appear in either run's
FAIL set this time (the known flake is tolerated by SET comparison, as the spec directs — declared).
ZERO new failing files from PB-CH-5.

## 7. Verification 6 — typechecks (path-normalized, per the 0158 handoff pitfall)

```
$ cd server && npx tsc --noEmit 2>&1 | grep 'error TS' | grep -c 'error TS'
26
$ awk -F'(' '{print $1}' … | sed 's|^server/||' | sort -u > /tmp/final-server-tsc-files.txt
$ comm -3 /tmp/trunk-tsc-files-norm.txt /tmp/final-server-tsc-files.txt
$ echo "FINAL-SERVER-TSC-SETDIFF-EXIT:$?"
FINAL-SERVER-TSC-SETDIFF-EXIT:0     # EMPTY = file-set IDENTICAL (26 error lines, 6 files)

$ npm run typecheck -w app 2>&1 | grep 'error TS' | grep -c 'error TS'
34
$ comm -3 /tmp/trunk-app-tsc-files.txt /tmp/final-app-tsc-files.txt
$ echo "FINAL-APP-TSC-SETDIFF-EXIT:$?"
FINAL-APP-TSC-SETDIFF-EXIT:0        # EMPTY = file-set IDENTICAL (34 error lines, 24 files)
```
Server pin 26 [m at ed397216] held with file-set identity; app pin 34 held with file-set identity.
`exactOptionalPropertyTypes` is real on the server (`server/tsconfig.json:13`) — every optional field
in the new code is a conditional spread (never `undefined`); `activeTabId` is emitted as
`string | null`, never `undefined`.

Baseline-repair note (honest, and it is why the pins initially disagreed): this worktree's lane
bootstrap was incomplete at claim — `server/node_modules` was a real directory holding only a
`.vite` cache instead of trunk's symlink, and `app/node_modules`, `server/schema`, `config.yaml`,
`.env` were missing. That measured 413 server tsc errors instead of 26. Repaired 1:1 from the TRUNK
worktree (symlinks as symlinks, per the lane-exclude list), after which the pins matched exactly.
No lane-synced file was bulk-copied from Brad's live tree.

## 8. Verification 7 — forbidden-path proof (pasted)

`git diff --name-only` (tracked modifications) ⊆ declared files:
```
app/src/event-editor/right-pane/ai/AiTabPanel.tsx
app/src/event-editor/right-pane/ai/assistStream.ts
app/src/event-editor/right-pane/ai/useChatThread.ts
app/src/shared/api/client.ts
config/drafting/adapters.yaml
config/drafting/workstate-tab-kinds.yaml
server/src/ai/AgentOrchestrator.ts
server/src/ai/submitSuggestionTool.protocolEdit.test.ts
server/src/ai/submitSuggestionTool.test.ts
server/src/ai/submitSuggestionTool.ts
server/src/ai/submitSuggestionTool.workstate.test.ts
server/src/ai/types.ts
server/src/drafts/adapters.ts
server/src/drafts/workstateCompile.test.ts
server/src/drafts/workstateCompile.ts
```
New untracked files (all declared): `schema/workflow/analysis-intent.schema.yaml` (the ONE new
schema), `config/drafting/analysis-composition.yaml`, `server/src/drafts/analysisCompile.ts`,
and the 7 new test files (§2 list). Nothing else.

Forbidden-path diff — EMPTY except the one new schema file (listed as untracked):
```
$ git -c core.fileMode=false diff --stat schema/knowledge/ schema/workflow/ schema/registry/surfaces/ \
    server/src/analysis app/src/analysis server/src/api/routes.ts app/src/shared/session app/src/shared/surfaces
(no output)
FORBIDDEN-EXIT:0        # empty = zero hunks in every forbidden path
$ git -c core.fileMode=false status --porcelain schema/
?? schema/workflow/analysis-intent.schema.yaml      # the ONE new registered schema (untracked)
```
`app/src/analysis/**` shows ZERO product-code hunks — the two new files there are tests only.
PB-CH-3/4 frozen client files (`WorkstateProposalCard`, `workstateExecutor.ts`,
`useWorkstateExecutor.ts`, `sessionYaml.ts`, `tabId.ts`, `useSessionSync.ts`,
`OpenTabsContext.tsx`, `openSurface.ts`, `surfaceRoute.ts`): zero hunks.
`routes.ts`, `server/src/analysis/**`, `AnalysisHandlers.ts`, surfaces registry, view-spec renderer
enum, the four chain schemas, workstate-intent, agent-action, lab-session, form-draft*: zero hunks.

**Execute/promotion machinery is UNIMPORTED — explicit statement + pasted grep.**
No file under `server/src/drafts/` (production sources) imports, references, or calls anything from
`server/src/analysis/**`, the execute route (`POST /analysis-runs/:id/execute`), or the promote
route (`POST /analysis-artifacts/:id/promote`). The only matches in the whole drafts directory are
inside the NEW lifecycle test, where those modules are deliberately `vi.mock`'d so a call would be
caught as a spy call:

```
$ grep -rn 'analysisService\|analysisRunner\|artifactPromotion\|/execute\|/promote' server/src/drafts
server/src/drafts/AnalysisDraftAdapter.test.ts:15: *  - NO implicit execute/promote: vi.mock(analysisRunner/artifactPromotion/
server/src/drafts/AnalysisDraftAdapter.test.ts:16: *    analysisService) — zero calls across compile+accept+repeat-accept;
server/src/drafts/AnalysisDraftAdapter.test.ts:46:// NO implicit execute/promote: the analysis execution modules are mocked with
server/src/drafts/AnalysisDraftAdapter.test.ts:49:vi.mock('../analysis/analysisRunner.js', () => ({
server/src/drafts/AnalysisDraftAdapter.test.ts:53:vi.mock('../analysis/analysisService.js', () => ({
server/src/drafts/AnalysisDraftAdapter.test.ts:254:  it('NO implicit execute/promote: the analysis execution modules are never touched across compile+accept+repeat-accept', async () => {

$ grep -rn 'analysisService\|analysisRunner\|artifactPromotion\|/execute\|/promote' server/src/drafts \
    --include='*.ts' --exclude='*.test.ts'
(no output)
SOURCE-ONLY-EXIT:1        # exit 1 = ZERO matches in production sources

$ grep -rn "from '\.\./analysis/" server/src/drafts     # import-form pin
0 matches
```

Zero analysis-kind / operation-name branches in the generic code:
```
$ grep -n "analysis" server/src/drafts/workstateCompile.ts server/src/drafts/FormDraftService.ts \
    server/src/drafts/draftRoutes.ts server/src/drafts/StagingStore.ts | grep -iE "if |===|switch"
(no output)
GENERIC-BRANCH-EXIT:1     # zero `if (kind === 'analysis-…')` / operation-name branches
```

Deterministic staged-id discipline (no `Date.now()`/random in any staging path):
```
$ grep -rn 'Date.now\|Math.random\|randomUUID' server/src/drafts/analysisCompile.ts server/src/drafts/adapters.ts
server/src/drafts/analysisCompile.ts:335: * zero-padded) — NEVER Date.now()/random. The accept-side recompile
(the only hit is the comment stating the rule; the mint is max+1 over a canonical-store scan,
mirroring AnalysisService.nextId)
```

## 9. Staged-create payload excerpt (initiator + queued)

Captured from the lifecycle test's staged-create assertion (`writes[0]`), verbatim:

```json
{"recordId":"ANR-000001",
 "schemaId":"https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml",
 "payload":{"kind":"analysis-run","id":"ANR-000001","title":"Fresh ROS run",
   "revisionRef":{"kind":"record","id":"ANREV-LC1","type":"analysis-revision","label":"ROS mitochondrial flux analysis"},
   "status":"queued",
   "inputs":{"trace":{"kind":"record","id":"DREF-LC1","type":"data-reference","label":"Seahorse trace file"}},
   "initiator":"USR-TEST"}}
```

- `status: "queued"` — the ONLY status any new code writes (analysisRunner owns every transition).
- `initiator: "USR-TEST"` — the authenticated actor resolved by `draftRoutes` (`resolveRequestUser`),
  never a client-named field.
- `revisionRef.id = ANREV-LC1` — the spine-resolved revision recordId (revision chaining).
- Ajv-valid against the registered `analysis-run` schema (asserted in the same test).
- `reads` pinned: `ANREV-LC1`, `DREF-LC1` (re-verified at accept).

## 10. Byte-hash pairs

**compile + abandon (reject half)** — `var/sessions/USR-TEST/main.yaml` sha256, canonical-records
tree hash, and canonical fingerprint before vs after (compile with a staged create, a revise
compile, a blocked compile, then abandon — never accept):

```
sessionBefore            54d64316d3b093ced6261887f0439d832fe6a8a03fd52dc002a3576cb1a6e217
sessionAfter             54d64316d3b093ced6261887f0439d832fe6a8a03fd52dc002a3576cb1a6e217   IDENTICAL
recordsTreeBefore        315bba24cec00b278cddd050d2e9579bd8c445c73fad0433793ec5d4e7560ad0
recordsTreeAfter         315bba24cec00b278cddd050d2e9579bd8c445c73fad0433793ec5d4e7560ad0   IDENTICAL
canonicalFingerprintBefore e96b35c4968e35e8e8486bd841bc62ccf9c272a2c3ec1ec839c9d4c6ea7f1d65
canonicalFingerprintAfter  e96b35c4968e35e8e8486bd841bc62ccf9c272a2c3ec1ec839c9d4c6ea7f1d65   IDENTICAL
```

**accept delta** — exactly one new canonical record, session file untouched server-side:

```
newRecordIds             ["ANR-000004"]
newKinds                 ["analysis-run:queued"]
sessionFileBeforeAccept  fdcc1baf832630223f9f6fa742f7a0dcd5c2532a2d3e39a5d6d8efbc3c6c09b6
sessionFileAfter         fdcc1baf832630223f9f6fa742f7a0dcd5c2532a2d3e39a5d6d8efbc3c6c09b6   IDENTICAL
```
One new canonical `analysis-run` (status `queued`); NO new artifact, NO new data-reference, NO
second run; `main.yaml` untouched server-side (the push is client-side through `useSessionSync`);
repeat accepts (including two concurrent) returned byte-identical bodies.

## 11. The design as landed (files + why each is sanctioned)

Declarative contracts (policy lives here, not in TS):
- `config/drafting/workstate-tab-kinds.yaml` — +2 DATA entries (`analysis-revision`, `analysis-run`
  → `tabKind: record-edit`, `idField: recordId`, `idPrefix: record`). These two entries ALONE make
  analysis terms resolvable + projectable through the existing generic workstate adapter (§1b).
- `config/drafting/adapters.yaml` — +1 registered adapter (`analysis`, domain `analysis`,
  operations `[compose-analysis]`, `projection: {}`).
- `config/drafting/analysis-composition.yaml` — NEW policy data (revisionKinds / runKinds /
  inputKinds / referenceKinds / idPolicy `ANR-` / landing). Loaded per call, presence-checked,
  never process-cached (the `adapters.yaml` precedent). Code interprets it; zero kind nouns in TS.
- `schema/workflow/analysis-intent.schema.yaml` — the ONE new registered schema (the proposal
  envelope: `operation` const, `target` oneOf `{revision,newRun?}` XOR `{run}`, `focus`, `open.tabs`,
  `requestId` tolerated). Existing envelopes byte-frozen.

Server:
- `server/src/drafts/analysisCompile.ts` (NEW pure module) — resolves terms through the same spine
  discipline (tiers [0,1] bind, tier-5 mint never binds), store-verifies recordIds, enforces kind
  policy from the YAML, mints the staged `ANR-` id deterministically, stages AT MOST one
  `analysis-run` create through the context store (which during compile IS the create-only staging
  proxy), projects landing tabs with server-derived ids. Named diagnostics: `UNRESOLVED_TERM`,
  `AMBIGUOUS_TERM`, `UNKNOWN_RECORD`, `WRONG_REFERENCE_KIND`, `UNMAPPABLE_RECORD_KIND`,
  `UNSUPPORTED_SURFACE`, `ACTIVE_TAB_UNRESOLVED`, `MALFORMED_ENVELOPE`, `DRAFT_INVALID`. No silent
  no-ops: a bad input or unmappable target is a diagnostic with `ok:false`, never a skipped field.
- `server/src/drafts/adapters.ts` — the sanctioned registration entry only (the spec's "the ONLY
  sanctioned TS touch to adapters.ts"). No adapter-name branch anywhere else.
- `server/src/drafts/workstateCompile.ts` — EXPORT-ONLY lift, the largest sanctioned change:
  ```
  -function canonicalReadStore(ctx: AppContext): RecordStore {
  +export function canonicalReadStore(ctx: AppContext): RecordStore {
  ```
  Justification: `analysisCompile.ts` reuses this canonical read view EXACTLY rather than
  implementing a second canonical-store reader (a second reader would be a second resolver — a
  defect under the architecture of record). Zero behavior change; the diff is one keyword.
- `server/src/ai/submitSuggestionTool.ts` — 7th intent `compose_analysis` (enum six→seven, §1c),
  description text stating the server COMPILES it, Accept creates at most a QUEUED run, NEVER
  executes and NEVER promotes; `AgentIntentArgs.analysis?: Record<string, unknown>` retained
  VERBATIM (same no-copy discipline as `workstate`); parser gate widened to include the new intent.
- `server/src/ai/types.ts` — one additive AgentEvent member
  `| { type: 'analysis_proposal'; analysis: Record<string, unknown> }`.
- `server/src/ai/AgentOrchestrator.ts` — ONE dispatch branch beside the workstate branch: verbatim
  emission + `tool_result success:true` + AgentResult note "Proposed an analysis — review the card;
  nothing executed."; a no-envelope call goes through the existing error channel
  (`success:false` + corrective `error`, NO event). ZERO store writes, ZERO compiles, ZERO executes.

App (mount only; card + executor reused untouched):
- `assistStream.ts` — union member + `dispatchFrame` case (relay verbatim; missing/non-object/array
  `analysis` is dropped, never guessed).
- `useChatThread.ts` — `onAnalysisProposal?` option, called in the new case inside the
  never-break-the-turn wrapper; the exhaustive switch keeps `const _exhaustive: never = event`.
- `AiTabPanel.tsx` — `handleWorkstateProposal(intent, adapter)` takes the adapter as a PARAMETER
  (one constant, not a fork); `onAnalysisProposal` passes `'analysis'` into the SAME handler, the
  same card state, the same pending identity + supersede logic, the same accept/reject handlers.
  The D1 turn-flag now marks "card turn" (workstate OR analysis) — both tier-2 proposals fire the
  notes-only `onDraftResult` path, so both need the same guard.
- `client.ts` — the only sanctioned client.ts hunk: `compileWorkstateDraft`'s `adapter` field widened
  to the registered set `'workstate' | 'analysis'`. Accept unchanged (identity triple is adapter-blind).

## 12. PENDING declarations

**PENDING-RESTART** (spec verification 8, PB-CH-2 DEFECT-1 pattern). The API receipts require the
new schema + adapter YAML to be registered, which requires a lane-backend restart the coder must NOT
perform. BEFORE-half measured now (lane 2 data dir, `CL_DATA_DIR=/home/brad/.computable-lab-lane2`,
backend :3093, frontend :5193 — both 200 OK at claim):

```
$ sha256sum /home/brad/.computable-lab-lane2/worktrees/main/var/sessions/USR-BRAD/main.yaml
8107ef6e1b88ee296dd29fc552e1709c8bf844366bfe45fcd5afe6008b1e85b9  …/var/sessions/USR-BRAD/main.yaml
$ find /home/brad/.computable-lab-lane2/worktrees/main/records -type f | sort | xargs sha256sum | sha256sum
42ae4afcd268416577fdb4abae3f0c11d13e133ea1053ab11ead6f170cac4fa6  -
```
(No `analysis-revision`/`analysis-run` records exist in the lane data dir yet — the seed step below
creates them.)

Exact commands for the orchestrator's after-half (run AFTER
`/home/brad/.hermes/profiles/orchestrator/scripts/cl-lane-stack.sh 2 restart`):

```
# seed (ordinary APIs, lane user; NEVER Brad's live data)
curl -s -X POST http://localhost:3093/api/analysis-revisions -H 'content-type: application/json' \
  -H 'x-user-id: USR-BRAD' \
  -d '{"title":"PB-CH-5 review revision","entryScript":"def run(ctx): ...","sdkVersion":"1.0"}'
# expect 201 {"success":true,"recordId":"ANREV-……"}
curl -s -X POST http://localhost:3093/api/records -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' \
  -d '{"schemaId":"https://computable-lab.com/schema/computable-lab/data-reference.schema.yaml","payload":{"kind":"data-reference","title":"PB-CH-5 lane trace","storageDeviceId":"DEV-LOCAL","path":"traces/pbch5.csv","contentHash":"<64 hex>","sizeBytes":1024,"dataKind":"table","format":"csv"}}'
# expect 201 {"success":true,"recordId":"DREF-……"}

# (a) compile — expect 200, canAccept:true, result.sessionDocument version:1 with `record:` ids,
#     writes = exactly ONE staged analysis-run (status queued, initiator == actor),
#     reads pinning the revision + dref
curl -s -X POST http://localhost:3093/api/drafts/compile -H 'content-type: application/json' -H 'x-user-id: USR-BRAD' \
  -d '{"adapter":"analysis","intent":{"operation":"compose-analysis","target":{"revision":{"term":"PB-CH-5 review revision"},"newRun":{"inputs":{"trace":{"term":"PB-CH-5 lane trace"}}}}}}'

# (b) reject half: re-hash main.yaml + records tree after compile+abandon → BYTE-IDENTICAL to the
#     BEFORE-half hashes above. Accept half: POST /api/drafts/accept with {draftId,revision,reviewHash}
#     → exactly ONE new canonical analysis-run (status queued), main.yaml untouched server-side,
#     NO new artifact/DREF records.
# (c) accept body deep-equals compile result; second accept byte-identical; cross-actor accept → 403;
#     wrong-kind target → diagnostic + canAccept:false; watch the lane log
#     (/home/brad/.hermes/cl/lanes/2/run/backend.log) for ZERO hits on
#     /analysis-runs/*/execute and /analysis-artifacts/*/promote.
```

**PENDING-BROWSER-GATE** — the coder self-verified NOTHING in the browser. The browser gate is
orchestrator-owned after merge (independent `cl-browser-reviewer`, single vision slot, serial, named
surfaces only: run-chat card, AnalysisPage, ViewRenderer output; screenshots
`analysis-compiled-card.png`, `analysis-accepted-workstate.png`, `analysis-rendered-view.png`,
`analysis-compatibility-error.png`; seeded lane fixtures only). Note for the reviewer (honest, per
OQ1): `AnalysisPage.tsx:198-203` coerces manifest renderers outside the four shipped ones to
`'table'`, so the `view-spec__error` compat arm is unit-reachable but not currently
browser-reachable via `/analysis`; the unit evidence is `ViewRenderer.test.tsx` (frozen, green) +
`ViewRenderer.compat.test.tsx`. The coercion was NOT "fixed" (architect call).

## 13. Assumptions recorded (for the orchestrator's assumptions.md)

1. Harness actor `USR-TEST` (uppercase) — the access-policy `ownerUserId` pattern
   (`^USR-[A-Z0-9-]+$`) rejects lowercase ids once `authorizationService` is wired; PB-CH-2's
   harness omitted `authorizationService`, so this only surfaced here.
2. `form-draft` and `access-policy` records are draft-history/authorization plumbing the pipeline
   legitimately persists (PB-CH-7 ruling), so they are excluded from the "canonical records"
   fingerprint — the same exclusion PB-CH-2's byte-hash test uses.
3. `analysis-composition.yaml` is a new policy DATA file (not a new pipeline): the spec's §1 names
   "declarative contracts" as where policy lives, and the reviewer-bait rule forbids kind nouns in
   TypeScript. Loaded per call, never cached.
4. `idPrefix: record` in `workstate-tab-kinds.yaml` matches the app's `recordEditTabId` so the
   server-derived `activeTabId` equals what `tabId.ts` re-derives (pinned by the genericity test).
5. The lane data dir for :3093 resolves to `/home/brad/.computable-lab-lane2/worktrees/main/`
   (per `cl-lane-stack.sh`'s `CL_DATA_DIR` + `APP_BASE_PATH=..`); the BEFORE-half hashes are from there.

## 14. Unresolved / for the orchestrator

- API receipts after-half (PENDING-RESTART) — orchestrator-owned.
- Adversarial review + browser gate — orchestrator-owned.
- No stop-boundary fired: no staged UPDATE semantics were needed (the staged create is a create
  only), no status past `queued`, no renderer widening, no deep-linking, no new-revision composition,
  and the genericity case needed ZERO special-casing in `workstateCompile.ts`.
