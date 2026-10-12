# PB-CH-3 ADVERSARIAL REVIEW — lane 2 — reviewer l2t0115

Item: PB-CH-3 "One shared client executor — wake openSurface + accept-guarded useApplySessionDocument"
Worktree reviewed: /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357
Branch: PB-CH-3-lane2-l2t2357 @ HEAD (6100d66c code + e6e87cd1 report)
Base: trunk 85a16976; real diff via `git -c core.fileMode=false diff 85a16976..HEAD`
Reviewer ran everything below personally; no coder claim was taken as evidence.

VERDICT: fix

Summary: The core contract is sound and I personally verified it — single writer preserved, exactly-once
push preserved, tier-1 non-destructive, no unaccepted-doc leak in the entry-point API shape, registry-driven
routing with zero surface-name literals, 40/40 new tests green, app tsc 34 lines with a file set
byte-identical to trunk, server/schema/config diff empty. There is NO blocker and NO major. Two LOW defects
and one MEDIUM behavioral edge are listed below; the MEDIUM is a real dedup-ordering bug (a legitimate
accepted document can be silently dropped with `ok:true`), which is why this is a fix rather than an accept.

---

## Reviewer-bait list — per-item finding (with file:line evidence)

BAIT 1 — Single-writer (new replaceState call site / new reducer action / raw replaceState export). PASS.
- `grep -rn "replaceState(" app/src --include=*.ts*` (non-test) returns exactly two sites, BOTH in the
  pre-existing owner file: `app/src/shared/session/useSessionSync.ts:58` (the §3 overload) and `:80` (adopt).
  The executor module (`workstateExecutor.ts`) exports no `replaceState` and its source-text test forbids
  `replaceState(` (workstateExecutor.test.ts:425, green).
- Pure reducer spy test `no tier-1 path dispatches replace or close` (workstateExecutor.test.ts:307-348) drives
  the REAL `openTabsReducer` and asserts `['activate','navigate-active']` only, with an explicit
  `some(type==='replace'||'close') === false` (line 347). Tier-1 = zero replace dispatches. PASS.

BAIT 2 — "Fix the double push" reflex (any hunk at useSessionSync.ts:59-150 beyond §3). PASS.
- `git diff --numstat 85a16976..HEAD -- useSessionSync.ts` = `14 6` and the diff has EXACTLY two hunk headers:
  `@@ -18,7 +18,7 @@` (the import line) and `@@ -41,13 +41,21 @@` (the §3 overload). There is NO hunk anywhere
  in :59-150. `applyingRemote`, `lastPushedPayload`, `PUSH_DEBOUNCE_MS` and the push/adopt effects are
  byte-frozen (verified by full-file read: useSessionSync.ts:64-159 identical in behavior to trunk).
- The object overload (:53-62) funnels through the ONE `replaceState`, so the accepted doc DOES sync (the
  tmux-adoption property is intact). PASS.

BAIT 3 — Tier-1 destructiveness (wholesale replacement forbidden). PASS.
- Pure ref-identity test `tier-1 apply touches no non-target tab entry` (workstateExecutor.test.ts:350-377):
  asserts the non-target slot is the SAME object (`toBe(otherEntry)`) and only the active slot's entry moved.
- Hook ref-identity test (useWorkstateExecutor.test.tsx:281-295) and reducer-identity/snapshot test
  (:297-320) both assert the project slot object is reference-identical across activate + navigate-active +
  a NO_FOCUS_PROVIDER no-op. `applyTier1Action` (workstateExecutor.ts:193-224) calls ONLY
  `activateTab`/`openContent`(→`navigateActiveTab`)/`focusProtocolStep`; no replace/close path exists. PASS.

BAIT 4 — Unaccepted-doc leakage. PASS (entry-point shape), with one ordering edge → see D1.
- Entry point `applyAcceptedWorkstate(body, attestation, identity)` requires the `{accepted:true}` typed arg
  (useWorkstateExecutor.ts:47-51,84-92) and refuses otherwise with `ACCEPT_ATTESTATION_MISSING`; no raw
  `replaceState` is re-exported by either new module (grep clean). Two-client smear test
  (useWorkstateExecutor.test.tsx:442-454) hands an unattested doc and asserts zero new pushes and store bytes
  unchanged / no `RUN-HACK`.
- Dedup key is `draftId:revision:reviewHash` (workstateExecutor.ts:233-238), NOT document JSON; test at
  :402-406 proves a later revision/`reviewHash` with identical tabs is never blocked. PASS.

BAIT 5 — Idempotence (second PUT / effect-level guard / blocking user edits). PASS on placement + user edits;
one ordering edge → D1.
- Guard lives in a hook `useRef<Set>` (useWorkstateExecutor.ts:64), NOT an effect — StrictMode-safe, and it
  only intercepts `applyAcceptedWorkstate` (user `openTab` edits are untouched).
- `second apply ... duplicate-ignored: putSession STILL exactly once` (test :355-367) and rev2-applies
  (:369-387) both green. PASS.
- DEFECT D1 below: the key is consumed BEFORE `validateAcceptedWorkstate`, so a malformed first delivery
  permanently suppresses an identical later delivery as `duplicate-ignored` (ok:true, no apply).

BAIT 6 — Hardcoded surface names / local tab-kind switch. PASS.
- `grep -nE "'(run-design|run-plan|run-execute|protocol-review|ingestion|analysis)'"` over both new modules
  = none. Registry membership is `registry.find((s) => s.id === action.surface)` only
  (workstateExecutor.ts:146); tab mapping composes existing `tabForSurface` (:131,167). The source-text test
  (workstateExecutor.test.ts:428-432) pins it, and the renamed-id fixtures (`surface-run`, `surface-study`)
  route correctly. PASS.

Additional instructed checks:
- Sanctioned narrow edits only (§2-§3). PASS. `git diff --stat 85a16976..HEAD` touches exactly the 7 named
  files (6 app + the report). openSurface.ts / surfaceRoute.ts / registry.ts / OpenTabsContext.tsx /
  openContent.ts all show an EMPTY diff.
- Test assertions are real (not self-confirming dead-code mocks). PASS. The pure tier-1 tests use the REAL
  `openTabsReducer` and REAL `surfaceRoute`/`tabForSurface`; the hook tests use the real `OpenTabsProvider`
  and real `useSessionSync` push effect. The two-client harness is genuinely implemented (test :408-455),
  sharing one in-memory `store` behind the mocked `getSession`/`putSession`, and asserts byte-level store
  content — not just a push count.
- Two-client harness claim actually implemented. PASS. Verified in source (useWorkstateExecutor.test.tsx:29-45
  store, :407-455 test) and in output (real `HARNESS store bytes ...` lines printed).
- No changes outside the 7 files. PASS. `git diff --stat 85a16976..HEAD -- server schema config` is EMPTY;
  `git diff --stat` over openSurface/surfaceRoute/registry/OpenTabsContext/openContent is EMPTY.

Acceptance criteria (verbatim from spec §"Acceptance criteria"), each criterion and how I checked it:
1. "registry-backed navigation" — pure test workstateExecutor.test.ts:96-115 asserts route `/runs/RUN-7` and
   the navigateActiveTab payload; hook test :201-210 asserts pathname. GREEN.
2. "focus applied" — pure :208-231 (activate existing) + :252-269 (protocol-step focus, no navigation); hook
   :212-259. GREEN.
3. "unknown/stale surface => no-op + diagnostic" — pure :117-159, hook :186-199,271-279. GREEN.
4. "unsaved editor state preserved through tier-1 apply" — ref-identity tests (pure :350-377, hook :281-320).
   GREEN.
5. "reject touches nothing" — hook :324-333 asserts ACCEPT_ATTESTATION_MISSING + zero state + zero putSession.
   GREEN.
6. "accepted replaceState pushes EXACTLY ONCE" — hook :335-367. GREEN.
7. "two-client harness proves only applied state reaches the sync path" — hook :408-455. GREEN.
8. "No production UI mount claimed in this task" — `grep -rn "agent_action" app/src` = 0; AiTabPanel /
   useChatThread / assistStream untouched (empty diffs). PASS.

---

## NEW defects found (adversarial pass)

D1 — MEDIUM — Dedup key is consumed before validation, silently dropping a legitimate accepted document.
  file: app/src/shared/session/useWorkstateExecutor.ts:93-99
  What: `acceptGuard(identity, seenKeys)` (:93) ADDS the key on the first call, and only AFTERWARDS does
  `validateAcceptedWorkstate(body)` run (:96). If that first delivery is malformed, the key is already
  recorded; a corrected re-delivery of the SAME accept identity then hits `acceptGuard(...)==='duplicate'`
  (:93) returns `{ok:true, kind:'duplicate-ignored'}` (:94) WITHOUT ever validating or applying — the
  document is permanently dropped for the mount lifetime, and the caller is told `ok:true` (looks applied).
  Why it matters: this is exactly the "guard survives churn it shouldn't" class the spec called out under
  reviewer-bait #5. The coder's own rationale for moving the attestation check FIRST (:80-92) — "a rejected
  call must NOT consume the identity key" — applies equally to a malformed call, but was not applied here.
  Note: the spec §2 literally ordered `acceptGuard ⇒ validateAcceptedWorkstate ⇒ attestation`, so this
  matches the canonical ordering; still, the guard must not consume a key for an apply that never happened.
  Concrete fix direction: validate first (or only `seenKeys.add(key)` after the body validates
  successfully), i.e. check duplicate against a key that is recorded only on the successful-apply path.

D2 — LOW — Spec-mandated test-matrix cell has no pure-layer test; report overstates coverage.
  file: app/src/shared/session/workstateExecutor.test.ts (whole file) vs spec matrix row "malformed accept
  body is diagnostic-only" which names Where = "both".
  Evidence: `grep -rn "validateAcceptedWorkstate" app/src/shared/session/*.test.*` → ZERO hits. The pure core
  test file imports only `acceptGuard, applyTier1Action, planTier1Action` (workstateExecutor.test.ts:21-27);
  `validateAcceptedWorkstate` is never exercised directly. Malformed bodies are covered only at the hook
  layer (useWorkstateExecutor.test.tsx:389-404). The report (report.wip-l2t2357.md:78) claims "pure + hook"
  for this row, and §4/OQ1 claims a pure test "accepts the FLAT body ... and preserves activeTabId
  null-vs-absent" that does not exist (`grep` for `null-vs-absent`/`absent` = 0 hits).
  Why it matters: the pure validator is the shared-rule hinge for the whole accept contract; per the spec
  matrix it is supposed to have direct unit coverage. A regression in `sessionDocumentFromValue`'s version /
  tabs / kind rules would not be caught at the pure layer.
  Concrete fix direction: add pure tests for `validateAcceptedWorkstate` (version!==1, missing tabs, tab
  without kind, non-object body, and activeTabId null-vs-absent) to workstateExecutor.test.ts; correct the
  report's "pure + hook" claim.

D3 — LOW — Unreachable "focus carries a routable surface" branch / comment contradicts the action type.
  file: app/src/shared/session/workstateExecutor.ts:117-119 (comment) vs :66-71 (Tier1ActionLike) and
  :122-138 (focus handling).
  What: the comment says "a bare ref focus navigates ONLY when the action itself carries a routable surface",
  but the `focus` variant of `Tier1ActionLike` has no `surface` field and `planTier1Action`'s focus branch
  never reads one — so focus can never deep-link; it is always activate-existing-or-diagnostic.
  Why it matters: a future PB-CH-4 caller reading the comment may assume a focus-with-surface deep-links;
  it silently won't (and can't be expressed in the type). The implementation matches spec §1's verbatim
  type, so this is documentation drift, not a behavior break.
  Concrete fix direction: either add the optional `surface` field to the focus variant and the routing, or
  correct the comment to state that focus is activate-existing-or-diagnostic only (OQ2 conservative ruling).

(Informational, no action required: `sessionDocumentFromValue` adds `tabs: [...doc.tabs]` — a deliberate
anti-aliasing deviation from a literal extraction; behavior is unobservable for every existing caller and
all pinned tests are green, so the doc's "byte-identical" wording is only slightly loose.)

No high/blocker defects.

---

## Verbatim command output I ran

1) Targeted new tests (the two files):
```
$ cd /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357/app && npx vitest run \
    src/shared/session/workstateExecutor.test.ts src/shared/session/useWorkstateExecutor.test.tsx
 ✓ src/shared/session/workstateExecutor.test.ts  (25 tests) 12ms
 ✓ src/shared/session/useWorkstateExecutor.test.tsx  (15 tests) 47ms
 Test Files  2 passed (2)
      Tests  40 passed (40)
```
(stdout also printed the two real harness byte lines, e.g.
`HARNESS store bytes after A push: {"tabs":[{"kind":"project","studyId":"STU-1",...},{"kind":"run","runId":"RUN-7",...}],"activeTabId":"run:RUN-7",...}`.)

2) Adjacent targeted set (spec verification 2):
```
$ cd app && npx vitest run src/shared/session src/shared/surfaces src/shared/lib src/shared/shell
 Test Files  23 passed (23)
      Tests  146 passed (146)
```
Baseline 21/106 + the 2 new files/40 = 23/146, zero failures.

3) App typecheck (34-line pin + file-set identity):
```
$ cd app && npx tsc --noEmit | grep -c "error TS"
34
$ comm -3 <(trunk file list) <(branch file list)      # cl-integration-2/app vs this worktree
(empty)
```
24 unique error FILES in BOTH trunk and branch, `comm -3` empty → error-file set IDENTICAL. None of the
touched files (sessionYaml.ts, useSessionSync.ts) or new files appear in the error set.

4) Server/schema/config + forbidden-file proof:
```
$ git -c core.fileMode=false diff --stat 85a16976..HEAD -- server schema config
[END EMPTY]

$ git -c core.fileMode=false diff --stat 85a16976..HEAD -- \
    app/src/shared/session/openSurface.ts app/src/shared/surfaces/surfaceRoute.ts \
    app/src/shared/surfaces/registry.ts app/src/shared/shell/OpenTabsContext.tsx app/src/shared/lib/openContent.ts
[END EMPTY2]
```

5) useSessionSync hunk proof:
```
$ git diff 85a16976..HEAD -- app/src/shared/session/useSessionSync.ts | grep -n "^@@"
5:@@ -18,7 +18,7 @@ import { apiClient } from '../api/client'
14:@@ -41,13 +41,21 @@ function activeTabPath(state: OpenTabsState): string | null {
```
Exactly two hunks; NONE in :59-150.

6) Greps:
```
$ grep -rn "agent_action" app/src --include=*.ts --include=*.tsx | wc -l
0
$ grep -rn "replaceState(" app/src --include=*.ts --include=*.tsx | grep -v test
app/src/shared/session/useSessionSync.ts:58:      replaceState(sessionDocumentToState(parsed, stableTabId))
app/src/shared/session/useSessionSync.ts:80:      replaceState(next)
$ grep -nE "window\.confirm|querySelector|history\.pushState|uniqueTabSlotId|apiClient|putSession" \
    src/shared/session/workstateExecutor.ts src/shared/session/useWorkstateExecutor.ts
src/shared/session/useWorkstateExecutor.ts:18: * (this hook performs ZERO putSession calls — the accepted apply pushes
   (a comment only; no code hit)
$ grep -nE "'(run-design|run-plan|run-execute|protocol-review|ingestion|analysis)'" \
    src/shared/session/workstateExecutor.ts src/shared/session/useWorkstateExecutor.ts
(none)
```

---

## Defect list (paste to fix coder)

1. [MEDIUM] app/src/shared/session/useWorkstateExecutor.ts:93-99 — `acceptGuard` records the dedup key
   BEFORE `validateAcceptedWorkstate` runs, so a malformed first delivery of an accept identity permanently
   suppresses an identical corrected re-delivery as `{ok:true, kind:'duplicate-ignored'}` with no apply.
   Violates the idempotence intent (guard must not consume a key for an apply that never happened) and the
   coder's own "a rejected call must NOT consume the identity key" principle. Fix direction: validate the
   body first, or only add the key to `seenKeys` after `validateAcceptedWorkstate` succeeds (keep the
   attestation check first). Do not change the key format (`draftId:revision:reviewHash`).

2. [LOW] app/src/shared/session/workstateExecutor.test.ts — missing direct pure-layer tests for
   `validateAcceptedWorkstate` (spec matrix row "malformed accept body is diagnostic-only" says Where=both;
   grep shows zero references). Add pure tests: version!==1, missing tabs, tab without kind, non-object body,
   and activeTabId null-vs-absent preservation. Also correct report.wip-l2t2357.md:78 (§4) which claims
   "pure + hook" and cites a non-existent null-vs-absent pure test.

3. [LOW] app/src/shared/session/workstateExecutor.ts:117-119 — comment states a bare focus navigates when the
   action "carries a routable surface", but the `focus` variant of `Tier1ActionLike` (:66-71) has no `surface`
   field and the code never reads one, so that path cannot occur. Fix direction: either add the optional
   `surface` to the focus variant and route it, or rewrite the comment to state focus is
   activate-existing-or-diagnostic only (OQ2 conservative ruling). Behavior currently matches spec §1's type.

End of review. No product file was edited; nothing was committed or merged.
