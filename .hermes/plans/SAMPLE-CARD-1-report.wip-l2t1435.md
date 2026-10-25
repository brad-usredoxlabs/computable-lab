# SAMPLE-CARD-1 — coder report (lane 2, token l2t1435)

Worktree: /mnt/vast/home/brad/git/wt/SAMPLE-CARD-1-lane2-l2t1435
Branch: feat/SAMPLE-CARD-1-lane2-l2t1435 (base cl/integration-2 @ 3e65a172 — HEDGE-TYPE-1
NOT merged at dispatch; either order authorized by W28-A5i Q2)
Commits: 022fdbc5 (RED tests) -> 7aec097b (feat: the two data rows)
Spec: .hermes/plans/2026-10-18_SAMPLE-CARD-1-spec.md; authority decisions/W28-A5i Q2.

## What changed (3 files, +112/-0, all within the assigned file list)

1. app/src/event-editor/right-pane/protocol/ProtocolLocalizationThread.clarificationAdapter.ts
   - CLARIFICATION_MENU_BY_REASON: ONE new row 'not-stated': '/m'.
   - CLARIFICATION_MENU_BY_REASON_ARGUMENT: ONE new override 'not-stated': { labware: '/l' }.
   - Data-only. menuForFact(), the picker, resolvers, resolveNounsPass.ts, resolutionEngine.ts,
     drop-rules: ZERO changes (diff stat above proves it — only the adapter + tests touched).
2. ProtocolLocalizationThread.clarificationAdapter.sampleCard1.test.ts (NEW): the three
   acceptance criteria + a non-labware-argument fallback case.
3. ProtocolLocalizationThread.clarificationAdapter.test.ts (ANSWER-SURFACE-1 suite): test 8's
   table pin DELIBERATELY extended to carry the new sanctioned row (the three engine rows keep
   their exact values byte-for-byte). Tests 1-7 untouched and still green.

## Mint-floor note (criterion 1 "NO mint floor")

'/l' routes to resolveLabware, which emits no `mint:<q>` floor row (resolvers.ts:67-92 —
resolveMaterial alone emits it) and ClarificationPicker's canMint is `resolver ===
resolveMaterial` (ClarificationPicker.tsx:268). So the not-stated labware card answers by
PICKING [[labware:<id>|label]], never minting. Pinned in the new test (menuProvider === '/l',
not '/m') and already pinned by the existing ClarificationPicker.test.tsx mint-copy suite,
which stayed green.

## RED evidence (raw, at commit 022fdbc5, before the data rows)

$ npx vitest run ...clarificationAdapter.sampleCard1.test.ts ...clarificationAdapter.test.ts
 Test Files  1 failed | 1 passed (2)
      Tests  4 failed | 9 passed (13)
Failure names (all 4 in the new file):
- "1. {reason:not-stated, actionLocation.argument=labware} maps to /l with NO mint floor" -> AssertionError: expected null not to be null
- "2. an unlocated {reason:not-stated} without actionLocation maps to the table default /m" -> expected null not to be null
- "3. every EXISTING engine-reason card mapping is byte-identical (fallback rule pinned)" -> expected {...(2)} to deeply equal {...(3)} (no 'not-stated' key)
- "4. not-stated with a NON-labware argument falls to the (reason,*) default /m" -> expected null not to be null

## GREEN evidence (raw, at commit 7aec097b)

$ npx vitest run clarificationAdapter.sampleCard1.test.ts clarificationAdapter.test.ts clarificationCards.test.tsx ClarificationPicker.test.tsx
 Test Files  4 passed (4)
      Tests  38 passed (38)
("Errors 1 error" line present: a pre-existing unhandled listOnTimeout exception inside
ClarificationPicker.test.tsx, unrelated to this change — same class as the trunk's standing
uncaught-exception debt.)

## Full app unit suite: failing-file NAME SET before vs after (same worktree, same base)

Baseline (base 3e65a172, before any edit; raw /tmp/baseline-app-unit-l2t1435.log):
 Test Files  96 failed | 281 passed (377)
      Tests  67 failed | 2217 passed (2284)
     Errors  7 errors
After (tip 7aec097b; raw /tmp/after-app-unit-l2t1435.log):
 Test Files  95 failed | 283 passed (378)
      Tests  66 failed | 2222 passed (2288)
     Errors  7 errors

Failing-file sets extracted via `grep -a ' FAIL ' | awk '{print $2}' | sort -u`
(/tmp/baseline-failset.txt 96 names, /tmp/after-failset.txt 95 names):

  comm -13 baseline after  -> EMPTY (zero NEW failing files)
  comm -23 baseline after  -> src/graph/events/forms/AddMaterialForm.biological.test.tsx
    (flipped baseline-FAIL -> after-PASS; characterized as a load-timeout flap in the trunk
    debt set: run ALONE at the feat tip it PASSES 1 file / 2 tests — the diff touches no
    graph/forms file, so it is not a lane effect)

The +1 test file / +5 tests delta is exactly the new sampleCard1 file (4 tests) + the
AddMaterialForm flake flipping green (its tests counted in baseline's 67 failed).
Errors line 7 = 7 unchanged (pre-existing unhandled-exception debt).

## Typecheck

app `tsc --noEmit`: 30 error lines at tip — all pre-existing trunk debt (src/sequences,
src/surfaces/registry module resolution, etc.); zero errors in the touched files
(grep of /tmp/after-app-tsc-l2t1435.log for clarificationAdapter: no match).

## Scope compliance

- NO schema change, NO picker change, NO resolver change, NO drop-rule change, NO new files
  beyond tests. resolveNounsPass.ts / resolutionEngine.ts untouched (diff stat: 3 files, all
  under app/src/event-editor/right-pane/protocol/).
- Trunk, cl-integration-2 working tree, lane 1, :3093/:5193: untouched. No push, no merge.
- node_modules in the worktree are symlinks to /mnt/vast/home/brad/git/computable-lab
  (lane convention, same as prior lane worktrees).

## Open items for the orchestrator

- Browser proof rides W28-A5D-R3 r3 (decision Q4 new assertion 1: the sample card renders the
  '/l' surface with no mint floor) — not this coder's gate.
- The card only becomes reachable in-product once HEDGE-TYPE-1 emits reason 'not-stated' with
  actionLocation (order-independent by design; containment SHAs for step-0 r3: this commit +
  HEDGE-TYPE-1's, alongside b52f5dfc + 5cdfb8d0).

SAMPLE-CARD-1 DONE 7aec097b
