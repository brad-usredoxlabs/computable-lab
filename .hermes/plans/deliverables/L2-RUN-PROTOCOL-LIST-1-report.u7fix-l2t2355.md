# L2-RUN-PROTOCOL-LIST-1 / u7fix — advc-c1 D1 (BLOCKER) + D2 (MAJOR)

Worktree: /home/brad/cl-wt/L2-RUNPROTO-readpath2-lane2
Branch: cl/lane2-runproto-readpath2-l2t2355, base 1e0ca662 (u7 tip)

## Diagnosis (confirmed in code at base)
- `readRunProtocols` read the RUN envelope via `apiClient.getRecord(runId)`. `/api/records/:id`
  does not serve tree-store records (measured: 404 for RUN-2026-09-06-run-sza8), so the read threw
  before the already-fixed PLR arm ran; the component caught, rendered nothing. D2: the mocked
  tests fed the run leg through `getRecord`, encoding the false premise and staying green.

## Fix (production, 2 lines in one function)
- `app/src/run/RunProtocolList.tsx`
  - run read: `apiClient.getRecord(runId)` -> `apiClient.getRecordWithUI(runId)`
  - unwrap: `const run = (runResp.record?.payload ?? null)` — the optional `record` on
    RecordWithUIResponse resolves to `null` (exactOptionalPropertyTypes-safe, no `{payload: undefined}`)
  - `if (typeof plr?.id !== 'string') return null` guard untouched.
- No other production change. `app/src/shared/api/client.ts` untouched (getRecordWithUI pre-existed).

## Tests (D2)
- `app/src/run/RunProtocolList.test.tsx`
  - New `serveUiReads(byId)` helper: all reads served from the `/ui/record` arm keyed by record id,
    repeated ids re-serve their last envelope (post-mutation re-reads). No leg mocks `getRecord`
    for a RUN id any more; `mocks.getRecord` is only reset or asserted NOT called.
  - Converted every RUN read leg (:91, :110, :149-151, :177, :190 in the old numbering) plus the
    no-plannedRunRef, read-rejects, attach-control and mutation-fails legs.
  - "reads the run and the PLR via getRecordWithUI, never getRecord" now asserts
    `getRecord` NOT called at all; attach leg asserts 4 `/ui/record` calls (run+PLR, initial+re-read).
  - RED-first leg kept: "renders the row when only /ui/record serves the run envelope" —
    `getRecord` rejects 404, `getRecordWithUI` serves RUN and PLR; the row must render.

## Verification (exact)
- RED at 6d6ff889 (test leg only, pre-fix):
  `cd app && npx vitest run src/run/RunProtocolList.test.tsx`
  -> `Tests 1 failed | 14 passed (15)` — the new leg failed with
  `TestingLibraryElementError: Unable to find role="listitem"` (empty body).
  Full log: /home/brad/.hermes/receipts/L2-RUNPROTO-u7fix-RED.log
- GREEN after fix: same command -> `Test Files 1 passed (1)`, `Tests 15 passed (15)` (baseline 14,
  +1 new leg).
- `cd app && npx tsc --noEmit` -> exit 0, clean.
- Note: `app/node_modules` was empty in this worktree; installed with `npm ci --prefer-offline`
  (package-lock unchanged) and added `app/node_modules` to `.git/info/exclude` (local, untracked).

## Review-bait checks
- `grep -n 'getRecord' app/src/run/RunProtocolList.test.tsx`: only `mockReset`, the
  `getRecordWithUI` wiring, and negative assertions remain; no `getRecord.mock*` on a run leg.
- No hardcoded run ids in production TS; fixtures use synthetic RUN-1..RUN-10.
- Absent `record` handled as null, not as `{ payload: undefined }`.

## Commits
- 6d6ff889 test(u7fix): RED — run envelope must come from /ui/record, not /api/records
- 95bcc2c4 fix(u7fix): run envelope via /ui/record; tests serve all reads from /ui/record
- (report) docs(u7fix): report
- (marker) chore(u7fix): DONE marker -> report sha 05469ab2

## Next
- Orchestrator: reload lane stack (YAML untouched, but stack reload before live check), re-run the
  browser check on the run surface; independent browser reviewer owns acceptance.

L2-RUN-PROTOCOL-LIST-1-u7fix UNIT unit DONE 05469ab20dffa32876a863f627fe5cb093a02704
