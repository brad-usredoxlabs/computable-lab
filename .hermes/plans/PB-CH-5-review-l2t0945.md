# ADVERSARIAL REVIEW — PB-CH-5 (lane 2): Analysis as the first compiled cross-page composition target

Reviewer: cl-adversarial-reviewer (deepseek-v4.1-flash) · token l2t0945
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-5-lane2-l2t0820
Branch: cl/PB-CH-5-lane2-l2t0820 · base 8bfa6c1f · commits 185b0bd2 (feat) + a265e5b6 (report)
Spec (contract): /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_0820-PB-CH-5-analysis-adapter-spec.md
Diff read in full: `git -c core.fileMode=false diff 8bfa6c1f...HEAD` (28 files, +3343/-30) — every file in the diff was read.

## VERDICT: accept

0 defects. Every binding reviewer-bait item, every acceptance criterion, and all seven
explicitly-out invariants were checked against the diff and independently exercised with
real command output (below). No hardcoded analysis branch, no second compile/execute
implementation, no forbidden hunk, no Ajv bypass, no exactOptionalPropertyTypes break, no
nondeterministic staging, no test that cannot fail.

---

## 1. Commands run (real output; a coder claim is not evidence — these are my own runs)

```
$ git -c core.fileMode=false diff 8bfa6c1f...HEAD --name-only      → 28 files, all in scope (see §3)
$ cd server && npx vitest run src/drafts
  ✓ workstateCompile.test.ts (17) ✓ analysisCompile.test.ts (16) ✓ WorkstateDraftAdapter.test.ts (13)
  ✓ FormDraftService.test.ts (10) ✓ AnalysisDraftAdapter.test.ts (11)
  Test Files 5 passed (5) · Tests 67 passed (67)          [baseline pin 3 files/39 held; +2 new files]
$ cd server && npx vitest run src/ai/submitSuggestionTool.analysis.test.ts src/ai/AgentOrchestrator.analysisProposal.test.ts
  ✓ 7 tests · ✓ 4 tests · Test Files 2 passed (2) · Tests 11 passed (11)
$ cd server && npx tsc --noEmit | grep 'error TS' | wc -l          → 26
  distinct files: AgentOrchestrator.ts, ProtocolIntakeHandlers.ts, RecordHandlers.ts,
                  AuthoringGuard.ts, bootstrapAdmin.ts, RecordStoreImpl.ts   (6 files — pin held)
$ cd app && npx tsc --noEmit | grep 'error TS' | wc -l             → 34 (24 files — pin held)
$ cd app && npx vitest run src/analysis src/event-editor/right-pane/ai/{AiTabPanel.analysis,assistStream.analysis,useChatThread.analysis}
  ✓ 7 files · Tests 26 passed (26)   (src/analysis frozen 9 held + 5 new)
$ cd server && npx vitest run src/analysis   → Test Files 6 passed (6) · Tests 32 passed (32)   [6/32 pin held]
$ cd app    && npx vitest run src/shared/session → Test Files 7 passed (7) · Tests 70 passed (70) [7/70 pin held]
$ grep -rn 'analysisService|analysisRunner|artifactPromotion|/execute|/promote|from '\.\./analysis' server/src/drafts --include='*.ts' --exclude='*.test.ts'  → exit 1 (ZERO)
$ grep -n analysis workstateCompile.ts FormDraftService.ts draftRoutes.ts StagingStore.ts | grep -iE 'if |===|switch'  → exit 1 (ZERO)
$ git diff --stat 8bfa6c1f...HEAD -- schema/knowledge/ schema/workflow/ schema/registry/surfaces/ server/src/analysis \
      app/src/analysis server/src/api/routes.ts app/src/shared/session app/src/shared/surfaces
  → only schema/workflow/analysis-intent.schema.yaml (+130) and the two app/src/analysis TEST files
$ grep -rn 'Date.now|Math.random|randomUUID' server/src/drafts/analysisCompile.ts server/src/drafts/adapters.ts
  → single hit is the comment stating the rule (line 335)
```

Server `AgentOrchestrator.ts` tsc errors are at lines 282/2501-2634 (`MaterialProfileRegistry` API drift),
far from the new branch at 2227-2304; app `client.ts` error is at 2457 (`contentSha ?? commitSha`), far from
the widened `adapter` union at 2259-2263. Both are pre-existing and unrelated to the diff.

## 2. Acceptance criteria (spec task-list.md:1507-1514) — verbatim, and how each was checked

| Criterion (verbatim) | How checked | Result |
|---|---|---|
| reference grounding | Read `analysisCompile.resolveTerm/bindRecordId/resolveTargetRef`; ran `analysisCompile.test.ts` (UNRESOLVED_TERM, AMBIGUOUS_TERM, UNKNOWN_RECORD, mint-only-never-binds); lifecycle blocked-compile test | PASS |
| renderer compatibility | `ViewRenderer.tsx` NOT in diff (enum untouched); ran `ViewRenderer.compat.test.tsx` + frozen `ViewRenderer.test.tsx` | PASS |
| revision chaining | Read staged payload build (`revisionRef.id = revision.record.recordId`, `type = revision.kind`); ran staged-create pure + lifecycle tests (`ANREV-LC1`) | PASS |
| failed creates | Ran pure STAGED_CREATE_REJECTED test + lifecycle DRAFT_INVALID/canAccept:false test | PASS |
| proof of NO implicit execute/promote | Ran `AnalysisDraftAdapter.test.ts` (vi.mock tripwires on analysisRunner/analysisService/AnalysisHandlers + store spies) and `AnalysisPage.no-execute.test.tsx`; source-pin grep = ZERO | PASS |
| Accept path zero assist/stream | Ran `AiTabPanel.analysis.test.tsx` — asserts fetch calls contain no `assist/stream` | PASS |
| no implicit execute/promote (spec §3 hard boundary) | Source-pin grep (§1) ZERO in production drafts | PASS |
| reject creates nothing / moves nothing | Ran lifecycle byte-hash test (session sha256 + records tree hash + canonical fingerprint IDENTICAL after compile-then-abandon) | PASS |
| accept lands the workstate | Ran lifecycle tests: accept body deep-equals compile result, lab-session Ajv-valid, repeat accept byte-identical, exactly ONE queued run | PASS |
| unsupported renderer shows compat error | `renderViews` unsupported-renderer + missing-artifact tests ran green (`.view-spec__error`, "Unsupported renderer: quantum") | PASS (unit); browser = PENDING-BROWSER-GATE (orchestrator-owned) |
| Browser review + screenshots | Coder correctly declared PENDING-BROWSER-GATE (spec §Verification 9 is orchestrator-owned) | N/A on diff |

## 3. Reviewer-bait section (binding) — item by item

1. **Fork detector / second compile pipeline** — CLEAN. `workstateCompile.ts` diff is exactly
   `-function canonicalReadStore` → `+export function canonicalReadStore` plus a comment block: one keyword,
   no behaviour change. No second FormDraftService/pipeline; `analysisCompile.ts` is the one new pure module
   riding the existing `FormDraftService`/`CompilerKernel`/`PipelineRunner` + Ajv-through-SchemaRegistry
   (exactly what the spec authorises). `adapters.ts` change is the registration entry only.
2. **NO-EXECUTE invariant** — CLEAN. Orchestrator branch (AgentOrchestrator.ts:2242-2304) emits ONLY
   `analysis_proposal` + `tool_result`. The only mutation in `analysisCompile.ts` is `deps.stage.create`
   (line ~1144), `status:'queued'`, `initiator: actor`. Zero-call proof is real: `vi.mock` tripwires that
   THROW on construction/call + store spies + `vi.spyOn(runChatbotCompile)`. `sendEvent` in AIHandlers.ts
   serialises any AgentEvent via `JSON.stringify` (lines 269-271/388-390), so the new event rides free —
   no dropped-event gap.
3. **EXPLICITLY-OUT** — CLEAN. `git diff --name-only` is entirely within the declared set. Forbidden
   stat on `schema/knowledge/`, `schema/workflow/` (except the one new schema), `schema/registry/surfaces/`,
   `server/src/analysis`, `server/src/api/routes.ts`, `app/src/shared/session`, `app/src/shared/surfaces`
   is EMPTY for product code; `app/src/analysis/**` contains TEST files only. `FormDraftService.ts`,
   `draftRoutes.ts`, `StagingStore.ts` = zero hunks; `workstateCompile.ts` = the export-only lift.
   PB-CH-3/4 frozen client files (WorkstateProposalCard, workstateExecutor.ts, useWorkstateExecutor.ts,
   sessionYaml.ts, tabId.ts, useSessionSync.ts, OpenTabsContext.tsx, openSurface.ts, surfaceRoute.ts) =
   zero hunks. View-spec renderer enum untouched.
4. **Declarative purity** — CLEAN. Kind/id policy lives in `workstate-tab-kinds.yaml` (+2 DATA entries) and
   the new `analysis-composition.yaml`; the TS grep for analysis kind/operation branches in the generic
   seam returns ZERO. The genericity test ("plain compose-workstate resolves a seeded analysis-revision with
   ZERO analysis-aware code") is a genuine data-driven proof; the coder's own RED run (report §1b) shows it
   fails with the YAML entries removed.
5. **Enum drift** — CLEAN. Seven-intent enum; `parseAgentIntentArgs` retains `analysis` by reference and
   unknown→'unknown'. The three re-goldened pins are ONLY the deliberate six→seven delta (verified by reading
   each of the three diffs); nothing else re-goldened.
6. **exactOptionalPropertyTypes / mutation / nondeterminism** — CLEAN. Server tsc 26, file-set identical →
   no new violation; every optional field is a conditional spread; `activeTabId: string | null` emits `null`.
   `grep Date.now|Math.random|randomUUID` in the new drafts code = one comment only; the staged id is
   `max+1` padded to 6 over a canonical-store scan (`nextStagedId`), matching `AnalysisService.nextId`
   (`analysisService.ts:45` padStart(6)). `structuredClone` not needed; `[...local]` copies before sort;
   shared constants not mutated.
7. **OQ rulings** — OQ1 (no scope growth / AnalysisPage coercion preserved): `AnalysisPage.tsx` untouched,
   `app/src/analysis` = tests only. OQ2 (staged creates = analysis-run only, queued): verified in code +
   tests; no analysis-revision create, no status past `queued`. OQ3 (client `adapter:'analysis'`): implemented
   and tested (`AiTabPanel.analysis.test.tsx` asserts `{adapter:'analysis', intent}`).
8. **Test quality** — No vacuous tests found. The acceptance-mirroring tests assert real observables
   (byte-hash pairs, Ajv validity, spy call accounting, fetch inspection, event counts). Tests that "cannot
   fail" would exist only if a mocked path were never invoked — but each vi.mock/spy is on a module the
   production path could import, and the source-pin greps are backed by the runtime tests.

## 4. Tests I independently re-ran (the spec's named targeted checks)

All named suites pass in my own run: server `src/drafts` 67/67, the two new server `src/ai` files 11/11,
app `src/analysis` + the three new ai files 26/26, plus the untouched baselines server `src/analysis` 32/32
and app `src/shared/session` 70/70. Server tsc 26 / app tsc 34 with the pre-existing file sets.

## 5. Non-blocking observations (NOT defects; no action required for this item)

- O1 (minor, informational): `schema/workflow/analysis-intent.schema.yaml` declares
  `required: [operation, target]`; the spec's §2 shorthand wrote `required:[operation]`. This is a stricter
  (safer) envelope; the compile's XOR re-check and diagnostic paths are unaffected and the coder's tests
  cover the missing-target case. No acceptance criterion depends on target being optional.
- O2 (informational): `analysisCompile.ts` re-implements local helpers (`asRecord`, `resolveTerm`,
  `bindRecordId`, `recordLabel`, `recordKind`, `localCurieRecordId`, `resolveTargetRef`) that mirror
  `workstateCompile.ts`. The spec explicitly designs this module "shape-compatible with the workstate module",
  and the mandated shared primitives (`canonicalReadStore`, `loadWorkstateTabKindMapping`, `LAB_SESSION_SCHEMA_ID`,
  `SessionTab/Document`, `ResolvedWorkstateTerm`, `LOCAL_TIERS`, `isMintAffordance`) ARE imported, not copied.
  This is duplication, not a second validator/policy/draft service, so it does not trip the reject rule; a
  future refactor could lift the shared resolvers, but that is not PB-CH-5 scope.
- O3 (informational): the report §8 frames the new schema/test files as "untracked"; they are in fact
  committed on the branch (feature commit 185b0bd2). This is a stale report snapshot, not a code discrepancy.

## 6. Declaration

I did not run the full app suite or the full server `src/ai` set (the task restricts me to targeted suites);
to compensate I verified set-identity claims by region analysis of the tsc errors and by reading every file
in the diff. No file in `git diff 8bfa6c1f...HEAD` went unread. No stop-boundary rides in the diff: no staged
UPDATE semantics, no status past `queued`, no renderer widening, no deep-linking, no revision composition,
and `workstateCompile.ts` needed zero special-casing.
