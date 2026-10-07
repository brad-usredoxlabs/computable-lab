# PB-CH-3 REPORT — One shared client executor (lane 2) — wip-l2t2357

Worktree: /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357
Branch: PB-CH-3-lane2-l2t2357
Claim-time trunk SHA: 85a16976 (verified `git merge-base --is-ancestor 236228fc HEAD` → true)
PB-CH-2 merge SHA it builds on: 236228fc (docs receipts; code merge 35f28cbb is its ancestor)
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-06_2345-PB-CH-3-shared-executor-spec.md (incl. binding ORCHESTRATOR PROMOTION NOTES)

## 1. What was built

New files (deliverables):
- app/src/shared/session/workstateExecutor.ts — pure core: planTier1Action / applyTier1Action / acceptGuard / validateAcceptedWorkstate + the local structural types (SessionDocumentLike, AcceptedWorkstateIdentity, Tier1ActionLike, ExecutorDiagnostic, ExecutorOutcome). No React, no fetch, no DOM, no apiClient import, no replaceState export.
- app/src/shared/session/workstateExecutor.test.ts — 25 pure tests (incl. source-text hardcode-boundary tests).
- app/src/shared/session/useWorkstateExecutor.ts — the hook: useOptionalOpenTabs + useNavigate + useSurfaceRegistry + useProtocolSelection + useApplySessionDocument; module-internal useRef<Set> seen-keys; attestation is a REQUIRED typed arg; identity is a SEPARATE param (OQ1 resolution).
- app/src/shared/session/useWorkstateExecutor.test.tsx — 15 hook tests incl. the two-client harness.

Sanctioned narrow edits (spec §2–§3, the ONLY existing-behavior files touched):
- app/src/shared/session/sessionYaml.ts — validator extraction: `sessionDocumentFromValue(value)`; `sessionFromYaml` = parseYaml + that function. Same error strings, same rules. sessionYaml.test.ts, sessionYaml.dedupe.test.ts, WorkspaceTabStrip.duplicateKeys.test.tsx all green UNCHANGED (12 tests). PROTO-AI-14 F3 dedupe NOT relocated (validate ≠ rebuild). One deliberate hardening: the validator shallow-copies the tabs array (`tabs: [...doc.tabs]`) so a caller-held parsed JSON value can never alias into the live tab store; behavior-identical for every existing caller (all pinned tests green).
- app/src/shared/session/useSessionSync.ts — ONLY the §3 overload of useApplySessionDocument (string path byte-unchanged; object path via sessionDocumentFromValue) + the import line. PUSH_DEBOUNCE_MS, applyingRemote, lastPushedPayload, adopt logic: byte-frozen (see diff in §6.7).

ZERO diffs: openSurface.ts, surfaceRoute.ts, resolveSurface.ts, registry.ts, OpenTabsContext.tsx, openContent.ts, WorkspaceTabStrip.tsx, all UI/mount files, server/, schema/, config/.

## 2. RED-first outputs (pasted before implementation claims)

RED #1 — pure core (module absent), run BEFORE any existing file was touched:

```
$ cd /mnt/vast/home/brad/git/wt/PB-CH-3-lane2-l2t2357/app && npx vitest run src/shared/session/workstateExecutor.test.ts
 ❯ src/shared/session/workstateExecutor.test.ts  (0 test)
 FAIL  src/shared/session/workstateExecutor.test.ts [ src/shared/session/workstateExecutor.test.ts ]
Error: Failed to resolve import "./workstateExecutor" from "src/shared/session/workstateExecutor.test.ts". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN #1 (after writing workstateExecutor.ts only; openSurface.ts / useSessionSync.ts / OpenTabsContext.tsx untouched — sessionYaml.ts was deliberately REVERTED for this check, see §3):

```
 ✓ src/shared/session/workstateExecutor.test.ts  (25 tests) 11ms
 Test Files  1 passed (1)
      Tests  25 passed (25)
```

RED #2 — hook layer (module absent):

```
$ npx vitest run src/shared/session/useWorkstateExecutor.test.tsx
Error: Failed to resolve import "./useWorkstateExecutor" from "src/shared/session/useWorkstateExecutor.test.tsx". Does the file exist?
 Test Files  1 failed (1)
      Tests  no tests
```

GREEN #2:

```
 ✓ src/shared/session/useWorkstateExecutor.test.tsx  (15 tests) 54ms   (re-ran twice: 15/15 both times)
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

## 3. First targeted check (spec section) — RESULT: design premise holds

RED #1 → GREEN #1 with `openSurface.ts`, `useSessionSync.ts`, `OpenTabsContext.tsx` ALL untouched. To make the proof airtight I also REVERTED sessionYaml.ts (`git checkout --`) before GREEN #1: the 25 pure tests (navigation, unknown/unroutable/unmappable, duplicate-guard, reducer-spy, reference-identity) pass against the UNMODIFIED sessionYaml/openSurface/OpenTabsContext tree. `git status --porcelain app/src/shared/session/` at that moment showed only the two new files. No core case forced an edit to those files. The sessionYaml validator extraction was applied only afterwards, at the sanctioned layer, and the three pinned sessionYaml/TabStrip test files stayed green unchanged.

One honest fixture note: the spec matrix's "non-tabbable objectType yields UNMAPPABLE_TARGET" needs a registry entry that IS deep-linkable but whose objectType has no tab kind (surfaceRoute rejects a non-deep-linkable surface BEFORE tabForSurface runs). The fixture adds `surface-doc` (binds :recordId as objectType 'document'; tabForSurface returns null for 'document') so the UNMAPPABLE_TARGET stage is genuinely exercised.

## 4. Test-matrix mapping (spec table → named tests)

| Criterion | Test(s) | Where |
| registry-backed navigation | `open-surface on a run target routes through the registry fixture` (+ hook `...and navigates the active tab`) | pure + hook |
| focus applied | `activates the existing tab instead of navigating when the target entity already has a slot` (pure+hook); `protocol-step focus calls focusProtocolStep with the step identity and performs NO navigation` (pure+hook); `activateTab of the active tab re-registers idempotently` — pure asserts the :203 navigate-active NO-OP guard returns the SAME state object AND activate-of-active keeps the session payload byte-identical (what the :128 push skip compares); hook asserts NO second push | pure + hook |
| unknown/stale ⇒ no-op + diagnostic | `unknown surface id yields UNKNOWN_SURFACE` (+ hook zero-call variant), `surface without params yields UNROUTABLE_SURFACE`, `objectType mismatch yields UNROUTABLE_SURFACE`, `non-tabbable objectType yields UNMAPPABLE_TARGET` (via routable surface-doc), `null registry yields diagnostics, never a throw` (pure null-registry + hook not-loaded-yet render) | pure + hook |
| unsaved editor state preserved | `tier-1 apply touches no non-target tab entry (reference-identity...)` (pure + hook); `no tier-1 outcome dispatches replace or close — reducer spy` (pure: real openTabsReducer spy shows only activate/navigate-active, zero replace/close) + hook identity-spy variant | pure + hook |
| reject touches nothing | `applyAcceptedWorkstate without {accepted:true} yields ACCEPT_ATTESTATION_MISSING with zero state change and zero putSession after 600 ms` | hook |
| accepted replaceState pushes EXACTLY ONCE | `accept-body apply advances 600 ms and putSession is called exactly once with the document tabs`; `second apply of the same accept identity is duplicate-ignored: putSession STILL exactly once` | hook |
| idempotence without blocking later revisions | `apply v/rev1 twice then accept rev2 (new reviewHash): the second revision applies and pushes` | hook; pure: `a later revision (new reviewHash) is NEVER blocked, even with identical tabs` |
| two-client harness | `client A accept-applies and pushes; shared store bytes equal the ACCEPTED doc; client B adopts exactly the accepted tabs; an unaccepted doc never enters the store` | hook (§6.6 excerpt) |
| malformed accept body diagnostic-only | `sessionDocument with version 2 / missing tabs / tab without kind yields MALFORMED_ACCEPTED_DOCUMENT, no replaceState, no push` (pure + hook) | both |
| extras (hardcode-boundary + reuse) | `renamed surface ids in the fixture still route` (pure + hook fixture); `executor module source contains no putSession/import of apiClient session calls` + no replaceState( + no surface-name literals (source-text); `sessionFromYaml behavior unchanged` — the three pinned files green UNCHANGED | pure/suite |

OQ1 reflected in tests: accept body is FLAT (no {result:{...}} wrapper test: `accepts the FLAT body ... and preserves activeTabId null-vs-absent`), and identity is passed as SEPARATE params: `applyAcceptedWorkstate(body, attestation, identity)`.

Justified ordering note: the hook checks ATTESTATION before acceptGuard (spec §2 listed guard first). Checking attestation first is strictly safer: a rejected (unattested) call must NOT consume the identity key — otherwise a later genuine accept of the same draftId:revision:reviewHash would be wrongly duplicate-ignored. All matrix tests pass under this ordering.

## 5. Baselines (re-measured in MY worktree at claim)

- app tsc: 34 error lines; file set comm -3 vs trunk-pinned = EMPTY (verified against a fresh `npx tsc --noEmit` run in the trunk worktree /mnt/vast/home/brad/git/cl-integration-2 — 34 lines).
- targeted shared session/surfaces/lib/shell: 21 files / 106 tests ALL PASS (pre-change).
- full app suite (pre-change, same tree): 54 failed files / 64 failed / 1865 passed (280 files, 5 unhandled errors) — see §6.3 for the pinned-53 reconciliation.
- server tsc pin: 26 error lines (orchestrator pin at 236228fc).
- grep -rn agent_action app/src = 0 (pre- and post-change).

Lane-environment honesty (worktree bootstrap gaps I repaired, all git-excluded via the lane core.excludesFile, never stageable):
- app/src/shared/surfaces/registry.ts was MISSING from my worktree (it is a lane-synced untracked symlink in trunk, byte-identical in computable-lab). I linked it exactly as cl-lane-sync.sh does for trunk. Without it the hook could not import useSurfaceRegistry.
- My first sync pass over-synced Brad's NEWER untracked work (sequences/, claimProjectLink, activeProject, extra server/src + schema files) that trunk does NOT carry, shifting baselines (tsc 40, suite 58 files). I removed exactly the 104 entries trunk lacks and re-replicated trunk's 61 synced entries 1:1 (symlinks copied as symlinks, files as copies). Post-repair untracked set = trunk's, modulo my deliverables.
- server/node_modules was missing (trunk has it as a symlink); I linked it to the same target. server/schema in trunk points at TRUNK's schema; mine points at my own worktree's schema (identical content; my worktree must not reference trunk paths). With these, server tsc = 26 = pin.

## 6. Verification outputs (verbatim)

### 6.2 Targeted set (post-change)
```
$ cd app && npx vitest run src/shared/session src/shared/surfaces src/shared/lib src/shared/shell
 ✓ src/shared/session/workstateExecutor.test.ts  (25 tests) 34ms
 ✓ src/shared/session/useWorkstateExecutor.test.tsx  (15 tests) 330ms
 ✓ src/shared/session/sessionYaml.test.ts  (6 tests) 28ms
 ✓ src/shared/session/sessionYaml.dedupe.test.ts  (3 tests) 16ms
 ✓ src/shared/shell/WorkspaceTabStrip.duplicateKeys.test.tsx  (3 tests) 57ms
 ✓ src/shared/session/useSessionSync.test.ts  (3 tests) 84ms
 Test Files  23 passed (23)
      Tests  146 passed (146)
```
Baseline 21 files/106 + my 2 files/40 tests = 23/146, ZERO failures.

### 6.3 Full app suite + comm -3 set-diffs
Baseline run (my changes set aside — 4 new files moved out, 2 edits stashed; same tree, same moment):
```
 Test Files  54 failed | 226 passed (280)
      Tests  64 failed | 1865 passed (1929)
     Errors  5 errors
```
After run (changes restored):
```
 Test Files  53 failed | 229 passed (282)
      Tests  63 failed | 1906 passed (1969)
     Errors  6 errors
```
File-level failing sets (54 vs 53 — my 2 files pass; the 54th baseline entry is a FLAKY file):
```
$ comm -3 /tmp/files-before.txt /tmp/files-after2.txt
src/graph/events/forms/AddMaterialForm.biological.test.tsx      ← tabbed = before-only
```
That file is flaky, not mine: run in ISOLATION it PASSES with my changes applied AND with them removed (both `✓ 2 tests`), and it also passed in the orchestrator-pinned claim-time baseline. The pinned 53-file baseline vs my after-run:
```
$ comm -3 /tmp/files-pin.txt /tmp/files-after2.txt   (pin from the claim-time full run: 58 entries incl. 5 sequences/claimProjectLink/activeProject files that existed only in the over-synced state)
src/knowledge/claimProjectLink.test.ts   ← pin-only (file removed from my tree during sync repair; it is NOT trunk content)
src/sequences/nativeDraft.test.ts        ← pin-only (same)
src/sequences/SequenceChat.test.tsx      ← pin-only (same)
src/sequences/SequenceEditor.test.tsx    ← pin-only (same)
src/shared/shell/activeProject.test.ts   ← pin-only (same)
```
Every pin-only entry is a file my repaired tree no longer contains (it was never trunk content); every after-only entry: NONE. ZERO NEW failing files attributable to PB-CH-3. Totals: 63 failed tests = pinned 63; 1906 passed = 1866 + 40 new; 282 files = 280 + 2. Unhandled-error count 5–6 across runs is pre-existing flake (ClarificationPicker timer, RawRecordEditor taptab mock ×4, DOMMatrix — all present in the baseline runs too; DOMMatrix count varies run-to-run in baseline AND after runs; none reference workstate files).

### 6.4 app typecheck
```
$ cd app && npx tsc --noEmit | grep -c "error TS"
34
$ comm -3 <(grep "error TS" /tmp/pbch3-tsc-trunk.txt | sed 's/(.*//' | sort) <(grep "error TS" /tmp/pbch3-tsc-final.txt | sed 's/(.*//' | sort)
(empty — exit 0)
```
34 lines, error-file set IDENTICAL to the pinned 34. app tsconfig untouched (exactOptionalPropertyTypes NOT added; conditional-spread convention followed in executor code).

### 6.5 Server/YAML/config proof + server tsc
```
$ git diff --stat server/ schema/ config/
(empty — exit 0)
$ cd server && npx tsc --noEmit | grep -c "error TS"
26
```
26 = the orchestrator's current pin. No new lines.

### 6.6 Two-client harness excerpt (load-bearing proof)
Shared in-memory store behind the mocked getSession/putSession; fake timers advanced; store bytes printed by the harness itself:

After client A's ACCEPTED apply + 600 ms advance (putSession called EXACTLY once):
```
HARNESS store bytes after A push: {"tabs":[{"kind":"project","studyId":"STU-1","title":"DHVC","activeRightPaneMode":"ai"},{"kind":"run","runId":"RUN-7","title":"Titration","activeRightPaneMode":"protocol"}],"activeTabId":"run:RUN-7","updatedAt":"2026-10-06T00:00:02.000Z"}
```
Client B (separate userId namespace, fresh localStorage key) boots and adopts exactly `['project:STU-1','run:RUN-7']`; after a window-focus pull with the server ahead it still holds exactly those tabs. Then the smuggle attempt — an UNACCEPTED doc (distinctive id RUN-HACK) handed to the executor without attestation → ACCEPT_ATTESTATION_MISSING, zero state change:
```
HARNESS store bytes after smuggle attempt: [{"kind":"project","studyId":"STU-1","title":"DHVC","activeRightPaneMode":"ai"},{"kind":"run","runId":"RUN-7","title":"Titration","activeRightPaneMode":"protocol"}]
```
Store bytes UNCHANGED, contain no RUN-HACK, zero new putSession calls in the window, and neither client's tab store contains run:RUN-HACK. Single-client push-count alone is NOT claimed as sufficient — this byte-compare is the proof.

### 6.7 Mount-freedom proof
```
$ git diff --name-only
app/src/shared/session/sessionYaml.ts
app/src/shared/session/useSessionSync.ts
```
(+ the four new untracked deliverable files, committed below.) No other file. The useSessionSync.ts diff is ONLY the import line + the §3 overload (hunk shown in §1); nothing at :59-150.
```
$ grep -rn "agent_action" app/src --include=*.ts --include=*.tsx | wc -l
0
```
No production UI mount; AiTabPanel/useChatThread/assistStream/App.tsx untouched. No :3093/:5193 contact, no browser gate, no stack restart, no writes under /home/brad/.computable-lab/, no config.yaml touched.

## 7. Reviewer-bait self-check (each item, with the test that pins it)

- Single-writer: zero new replaceState call sites (executor source-text test forbids `replaceState(`; the only tier-2 writer is useApplySessionDocument inside useSessionSync.ts). Reducer spy: zero 'replace'/'close' from tier-1.
- No double-push "fix": applyingRemote/lastPushedPayload untouched (diff proves it); single-push property = :128 payload skip + executor duplicate-ignoring.
- Tier-1 non-destructiveness: reference-identity of non-target entries (pure + hook) + no replace/close dispatches.
- Unaccepted-doc leakage: attestation is a required typed arg; no raw replaceState re-export; two-client byte proof.
- Dedup key: `draftId:revision:reviewHash` (pure test: identical tabs with new reviewHash is NEVER blocked; same identity with different bytes IS duplicate). Guard lives in a hook useRef<Set> (executor-level), not an effect — StrictMode-safe, and user tab edits after an accept still push (openTab push test stays green in useSessionSync.test.ts).
- No hardcoded surface names: registry membership is `registry.find` only; renamed-id fixtures; source-text test greps the executor for the six real surface names.
- No DOM-hack focus / window.confirm: grep 0 across both new modules; NO_FOCUS_PROVIDER + zero movement is asserted behavior.
- Slot-id minting: ids only via stableTabId through sessionDocumentToState; uniqueTabSlotId never used.
- exactOptionalPropertyTypes style: conditional spreads for route/path/label/title (`...(x ? {x} : {})`); activeTabId null-vs-absent preserved (pure test).

## 8. Honest unsaved-work boundary (what tier-1 does and CANNOT guarantee)

The tab store persists only OpenTabsState (tab values, modes, breadcrumbs, content trails). Per-tab EDITOR drafts (browser/DetailPane.tsx dirty state, RecordRegistryPage dirty state, ProtocolStepEditModal TipTap content) live in component-local useState and are LOST when the component unmounts. There is no global dirty registry on trunk. Tier-1's guarantee is therefore: (a) it NEVER wholesale-replaces (no replace/close — proven by reducer spy + reference identity), (b) it prefers activateTab when the target already has a slot (touches no other tab), (c) navigate-active of the SAME entity is reducer-idempotent (:203 guard), and (d) it ships no confirm dialog. What it CANNOT guarantee: a tier-1 navigate-active onto a DIFFERENT entity replaces the ACTIVE tab's content — if that active tab hosts an unsaved editor draft, that draft's component unmounts and the draft is lost, exactly as a user-initiated in-tab navigation would lose it. Closing that gap needs a global dirty registry (does not exist on trunk; out of scope, not fabricated here).

## 9. Open items / honest notes for the orchestrator

- Hook test mocks the registry SEAM (`vi.mock('../surfaces/registry')`) rather than apiClient.getSurfaces: registry.ts is a lane-synced SYMLINK whose own '../api/client' import resolves through its real path outside the worktree mock scope (verified by probe: the apiClient-level mock never intercepted it). Mocking the seam keeps this a unit test of the executor; the real loader is exercised in the app at runtime. No production code changed for this.
- The `tabs: [...doc.tabs]` shallow copy in sessionDocumentFromValue is a deliberate anti-aliasing hardening beyond the literal extraction; all pinned tests green unchanged.
- Full-suite unhandled-error count (5–6) is pre-existing flake, itemized in §6.3; AddMaterialForm.biological.test.tsx flaked in the no-changes baseline run and passes in isolation both with and without my changes.
- PB-CH-4 mount: executeTier1/applyAcceptedWorkstate are ready to wire; focusProtocolStep is supplied by the hook from useProtocolSelection when a provider exists (null outside ⇒ NO_FOCUS_PROVIDER diagnostic, per OQ3 conservative ruling).
