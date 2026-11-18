# L2-RUN-PROTOCOL-LIST-1 — unit u7 report (read-path fixer)

Lane 2 · worktree /home/brad/cl-wt/L2-RUNPROTO-readpath-lane2 · branch
cl/lane2-runproto-readpath-l2t2335 · base 905054f0334e45b7c6c8a9954457c263b0cde1e3 (trunk tip)

## Unit
One seam: the PLR READ inside `readRunProtocols` must go through
`apiClient.getRecordWithUI` (`GET /ui/record/:id`), because tree-store records
404 on `GET /api/records/:id`. Plus defect 3 (wording only): visible
"protocol(s)" copy becomes "method(s)".

## Decisions
- `app/src/run/RunProtocolList.tsx:63-64` replaced exactly as briefed:
  `const plrResp = await apiClient.getRecordWithUI(plr.id)` then
  `const payload = (plrResp.record?.payload ?? null) as Record<string, unknown> | null`.
  The RUN-level `apiClient.getRecord(runId)` line is untouched (run-level read
  verified working; brief forbids touching it).
- Defensive `?.` on `plrResp.record` kept even though `RecordWithUIResponse`
  types it non-optional: a malformed/proxied response degrades to `refs: []`
  (best-effort read semantics preserved) instead of a TypeError. tsc is clean.
- `readRunProtocols` still throws only for the run-level read; a rejected
  `getRecordWithUI` is caught by the existing `load()`/`mutate()` try-catch, so
  the list stays blank / untouched (unchanged semantics, no new error path).
- Wording (visible strings only, no other copy):
  heading `No methods` / `1 method` / `${n} methods`;
  `<ol aria-label="Methods followed">`; detach control `Detach` with
  `aria-label={`Detach ${label ?? id}`}`; select `aria-label="Method to attach"`
  and placeholder `Select method…`; add control `Attach a method`.
  Brief's example list names "Attach a method" and "Detach" as target strings,
  so the add control became "Attach a method" (was "Add protocol") and the
  row control became "Detach" (was "Remove"). The in-picker confirm button
  stays "Attach" (contains no "protocol", not in the example list).
  Code comments/identifiers keep the protocol domain vocabulary (`protocolRefsOf`,
  `localProtocolRefs`, `/protocols` endpoints) — the item is a run's *methods*
  in UI copy, the domain entity is still a protocol record.
- Tests: `getRecordWithUI` added to the `vi.hoisted` mocks, the mocked
  `apiClient` object, and the `beforeEach` reset. In every two-call sequence
  the SECOND (PLR) resolution moved to `mocks.getRecordWithUI` resolving
  `{ record: record('PLR-N', …) }`; the run resolution stays on `getRecord`.
  The two single-call tests (RUN-3 no-ref, RUN-4 reject) use `getRecord` only.
  The RUN-5 attach assertions now pin the split: `getRecordWithUI` called with
  `PLR-5` twice, `getRecord` twice (no `getRecord('PLR-5')`).

## Files changed (owned only, 2 files, 103 changed lines)
- `app/src/run/RunProtocolList.tsx` (179 lines)
- `app/src/run/RunProtocolList.test.tsx` (222 lines)
- this report (`.hermes/plans/deliverables/L2-RUN-PROTOCOL-LIST-1-report.u7.md`)

`app/src/shared/api/client.ts`, `server/**`, `schema/**`, `runProtocolRefs.ts`,
`RunWorkspacePage.tsx` untouched (verified by `git diff --stat 905054f0..HEAD`).

## RED FIRST (test added, product code at base)
`cd app && npx vitest run src/run/RunProtocolList`
```
 FAIL  src/run/RunProtocolList.test.tsx > RunProtocolList > reads the PLR via getRecordWithUI not getRecord
TestingLibraryElementError: Unable to find role="listitem"
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
```
The new test fails because the PLR is never read from `/ui/record`, so the
merged u6 list renders nothing — the exact browser symptom. Base baseline
before the test existed: `13 passed (13)`.

## GREEN
`cd app && npx vitest run src/run/RunProtocolList`
```
 ✓ src/run/RunProtocolList.test.tsx  (14 tests) 229ms
 Test Files  1 passed (1)
      Tests  14 passed (14)
```
`cd app && npx tsc --noEmit` → 0 error lines (see environment note; delta 0).

`cd app && npx vitest run src/run` (folder sweep)
```
 Test Files  1 failed | 31 passed (32)
      Tests  3 failed | 214 passed (217)
```
The 3 failures are `src/run/RunWorkspacePage.gc-section.test.tsx`
(`Unable to find an element by: [data-testid="rwp-shell"]`, root cause
`No "useEventEditor" export is defined on the "../event-editor/EventEditorContext" mock`)
and are PRE-EXISTING, not caused by this diff: `git stash push` of my two
files (i.e. base content) then the same single-file run reproduced
`Tests  3 failed (3)` identically. Not fixed here (out of scope: that test
file is not owned by this unit).

Environment note: this worktree's `app/node_modules` symlink pointed at an
EMPTY `cl-integration-2/app/node_modules`, so `npx` fetched vitest 5.x and
nothing ran. Repointed the untracked symlink at the populated
`/mnt/vast/home/brad/git/cl-integration-2/node_modules` (vitest 1.6.1) and
added the missing `server/node_modules` symlink (same target) so `../server`
imports resolve — no install, no tracked file touched. In this fuller layout
base tsc is 0 errors, so the brief's "13 pre-existing" baseline was measured
under a partial dependency layout; either way the delta attributable to this
diff is 0. Both symlinks are untracked and listed in `.git/info/exclude`
(local only, not committed).

## Commits
- 0bdb84f628b3f31ddaaed7acd7cf06d5b31c0081 u7 RED: PLR read via /ui/record
- 48319bddf06f2916b905c2afa1bd0df231d3d77a u7 PLR read-path + method wording

Marker sha = 48319bdd… (the implementation commit that carries this fix; a
commit cannot embed its own sha, so the report commit that ships this file
follows it).

## Next actions / handoff
- Orchestrator must reload the lane stack before live verification (no YAML
  changed, but the app bundle changed) and the browser reviewer owns acceptance:
  the browser journey must now show the run's methods (not null/blank) and
  "N methods" copy, with `/api/ui/record/<PLR id>` as the PLR read.
- Reviewer checks: run-level read still `/api/records/<run id>`; PLR read only
  via `getRecordWithUI`; no `getRecord(plr.id)` left; wording complete
  (`No methods`, `1 method`, `N methods`, `Methods followed`,
  `Attach a method`, `Method to attach`, `Select method…`, `Detach`).
- No Playwright journey added from this seat (no authorized lane stack handed
  to this unit; unit scope was the read-path seam + unit tests).

L2-RUN-PROTOCOL-LIST-1 UNIT u7 DONE 48319bddf06f2916b905c2afa1bd0df231d3d77a
L2-RUN-PROTOCOL-LIST-1-u7 UNIT unit DONE 48319bddf06f2916b905c2afa1bd0df231d3d77a
