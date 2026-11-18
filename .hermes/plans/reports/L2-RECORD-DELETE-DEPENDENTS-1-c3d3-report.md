# L2-RECORD-DELETE-DEPENDENTS-1 — Unit c3-defect3 Report

## Item
L2-RECORD-DELETE-DEPENDENTS-1, unit c3-defect3 (advc cycle 2, defect 3)

## Problem
`listDanglingReferences` authenticated with `resolveRequestUser` but returned every
dangling row unfiltered — leaking existence, kind, pointer paths and missing-target
ids of private records to any authenticated local user.

## Fix
In `server/src/api/handlers/RecordHandlers.ts`, after `resolveRequestUser`:
- Build a request-scoped ACL snapshot (exactly as `listRecords` does at :477-479)
- Index records by `recordId`
- Filter dangling rows through `canAccess(user, 'read', owner, aclSnapshot)`
- Return only visible rows

## Changed Files
1. `server/src/api/handlers/RecordHandlers.danglingAcl.test.ts` — NEW (RED test, 2 cases)
2. `server/src/api/handlers/RecordHandlers.ts` — handler ACL filter (+13/-1 lines)

## Design Decisions
- Filter on the REFERRER record only. The target record does not exist by definition,
  so its id cannot be ACL-checked.
- Build `aclSnapshot` ONCE per request, not per-row.
- No kind names, no record-id literals in the handler — the filter is generic over
  `canAccess`; policy is data.
- `findDanglingReferences` unchanged (pure function, filtering is the handler's job).
- Fail-open semantics preserved when no `authorizationService` is configured.

## Mutation Probe
Reverted ONLY the handler filter, kept the test. Case A failed exactly as RED:
`expected {dangling: [], count: 0} but received {dangling: [{recordId:'PRIV-EXP-1',...}], count: 1}`.
Restored before final commit.

## Verification
- `npx vitest run src/api/handlers/RecordHandlers.danglingAcl.test.ts` -> 1 file / 2 tests passed
- `npx vitest run src/store/RecordDeleteReferences.test.ts src/store/ReferenceCascadeSweep.test.ts` -> 2 files / 11 tests passed
- `npx tsc --noEmit` -> exit 0
- `git -c core.fileMode=false status --porcelain` -> clean (report commit follows)

## Commits
1. `23448850` c3-defect3: RED test — listDanglingReferences ACL filtering
2. `bb74184b` c3-defect3: GREEN — filter listDanglingReferences through request-scoped ACL snapshot
3. Report + marker (this commit)

L2-RECORD-DELETE-DEPENDENCIES-c3d3 UNIT unit DONE bb74184bb920384bb44dfba6878a2475c588fa61
