# L2-SUBPROTOCOL-EXPAND-1 u7fix2 — CLOSEOUT report (k=1/1, lane 2)

Item: L2-SUBPROTOCOL-EXPAND-1-u7fix2pw (closeout paperwork only; the code was
delivered by a prior run and is NOT re-run or re-written here. No product or
test file changed in this run.)

## Graded range
Range: 66eb04d7..b433930d
HEAD: b433930de7ba415f1784e32f1e6a3faa429cc8d1
  "u7fix2: harden empty-state matcher (D2) and pin local-first role precedence (D3)"
Parent: 66eb04d7 (prior WIP auto-commit). HEAD is a real coder commit, not launcher WIP.

## Diff (bound, one shot: git -c core.fileMode=false -C <wt> diff 66eb04d7..b433930d)
--stat:
    app/src/graph/BindingMode/BindingModeEditor.test.tsx | 44 +++++++++++++++++++++-
    1 file changed, 43 insertions(+), 1 deletion(-)

File: app/src/graph/BindingMode/BindingModeEditor.test.tsx (index 4b161bef..b566c1a0)

Hunk 1 — D2 (line 258, empty-state matcher):
-      expect(screen.queryByText('No roles defined in the local protocol')).not.toBeInTheDocument()
+      expect(screen.queryByText(/No roles defined/)).not.toBeInTheDocument()
  (regex matcher — matches RoleBindingPanel.tsx:167, which renders a trailing period)

Hunk 2 — D3 (new test appended at end of file):
+  it('prefers local protocol roles over universal protocol roles (local-first)', async () => {
+    // per-test mock override: LPR-000001 carries its own roles
+    // (roles.labwareRoles: [local_plate]) with inherits_from PRT-UNIVERSAL;
+    // renders BindingModeEditor plannedRunId="PLR-000001";
+    // asserts role-binding-local_plate present, role-binding-plate absent,
+    // and getRecordWithUI NOT called with 'PRT-UNIVERSAL' (local roles suffice);
+    // restores the original mock implementation on exit.
+  })

## Verify (targeted, run ONCE, RAW)
cmd: cd <wt>/app && npx vitest run src/graph/BindingMode/BindingModeEditor.test.tsx
node_modules: pre-existing symlink -> /mnt/vast/home/brad/git/cl-integration-2/app/node_modules
(lane-2 hazard did not trigger; no materialization needed).
RAW:
  RUN  v1.6.1 /home/brad/cl-wt/L2-SUBPROTO-u7bindroles-lane2/app
   ✓ src/graph/BindingMode/BindingModeEditor.test.tsx  (7 tests) 608ms
   Test Files  1 passed (1)
        Tests  7 passed (7)
   Start at  16:00:28
   Duration  2.35s (transform 128ms, setup 47ms, collect 177ms, tests 608ms,
   environment 422ms, prepare 56ms)
GREEN. (Pre-existing benign act() warnings from other tests in the file;
unrelated to this unit's changes.)

## Conclusion
Closeout complete: D2/D3 seams verified in place at b433930d; targeted vitest
GREEN 7/7. Marker sha = the graded unit commit b433930d (a paperwork commit
cannot embed its own sha).

L2-SUBPROTOCOL-EXPAND-1-u7fix2 UNIT unit DONE b433930de7ba415f1784e32f1e6a3faa429cc8d1
L2-SUBPROTOCOL-EXPAND-1-u7fix2pw UNIT unit DONE b433930de7ba415f1784e32f1e6a3faa429cc8d1
