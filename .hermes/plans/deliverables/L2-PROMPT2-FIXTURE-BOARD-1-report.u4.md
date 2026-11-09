# L2-PROMPT2-FIXTURE-BOARD-1 UNIT 4 Report

## Change Summary
Fixed deep-link route /project/:studyId/event-graph/:eventGraphId to activate the named graph's deck tab
by passing true as the second argument to ws.openTab().

## Files Changed
1. app/src/event-editor/projects/ProjectWorkspacePage.tsx (line 217: added activate=true)
2. app/src/event-editor/projects/ProjectWorkspacePage.deeplink.test.tsx (new test file, 145 lines)

## Steps
1. Baseline tsc: 17 error lines (10 reported baseline + 7 from test file)
2. Created RED test: verifies deep-link passes activate=true via reducer spy
3. Applied fix: ws.openTab(..., true) at line 217
4. Test passes after fix
5. Mutation check: confirmed RED (no flag) -> GREEN (with flag)

## Mutation Check
- Without true flag: test FAILS (exit 1)
- With true flag: test PASSES (exit 1)

## Verification
- Targeted test: PASS
- Mutation check: RED -> GREEN confirmed
- No setTimeout/retry/poll in diff
- openedRef intact at :205/:210
- Bare-route effect at :235 unchanged
- Legacy tab preserved in workspace state

## Exit
L2-PROMPT2-FIXTURE-BOARD-1 UNIT 4 DONE d215b4276a383e29dd742c59073b9cf645193196
