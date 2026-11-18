# L2-JOURNEY-CHECKPOINT-1 / unit cprestore — restore verdict

- worktree: /home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cprestore-lane2 (lane 2)
- branch: cl/lane2-journey-checkpoint1-cprestore-0356
- base: 1022b8505b6674366841f8b4445b6805742647c8 (cpschema2 unit-1 tip; trunk 821f83a6 lacks checkpointContract.ts)
- run date: 2026-11-13 (EST, UTC-05)
- owned files (both NEW): `server/src/compiler/journey/checkpointRestoreCheck.ts` (55 lines),
  `server/src/compiler/journey/checkpointRestoreCheck.test.ts` (84 lines) — 2 files, 139 lines (budget: ≤2 / ≤200).

## Environment

- `server/node_modules` exists in this tree (verified); NO symlink to the integration-2 tree was needed.
- No `npm install` / `pnpm install` / `npm ci` run. No scratch files in the worktree or /tmp
  (nothing was needed).

## Baseline (measured before any edit)

`cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts` →
`Test Files 1 passed (1)` / `Tests 7 passed (7)` — matches the cpschema2 baseline.

## Step 1 — RED (raw)

Test file written first, module absent. `cd server && npx vitest run
src/compiler/journey/checkpointRestoreCheck.test.ts`:

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cprestore-lane2/server

 ❯ src/compiler/journey/checkpointRestoreCheck.test.ts  (0 test)

⎯⎯⎯⎯⎯⎯ Failed Suites 1 ⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/checkpointRestoreCheck.test.ts [ src/compiler/journey/checkpointRestoreCheck.test.ts ]
Error: Failed to load url ./checkpointRestoreCheck.js (resolved id: ./checkpointRestoreCheck.js) in /home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cprestore-lane2/server/src/compiler/journey/checkpointRestoreCheck.test.ts. Does the file exist?
 ❯ loadAndTransform ../../../../../mnt/vast/home/brad/git/computable-lab/node_modules/.pnpm/vite@5.4.21_@types+node@20.19.41_lightningcss@1.32.0_terser@5.48.0/node_modules/vite/dist/node/chunks/dep-BK3b2jBa.js:51969:17

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  no tests
   Start at  05:37:27
   Duration  1.00s (transform 36ms, setup 0ms, collect 0ms, tests 0ms, environment 0ms, prepare 533ms)
```

Committed as `02845c9b` (RED).

The four case names (verbatim in the test file):
- "every origin.record_revisions pair matches the live envelope's revision token → verdict restorable, with the checked record ids listed"
- "one record's live revision differs → verdict blocked, reason code origin-record-changed, and the diagnostic NAMES the record id and both revisions"
- 'one record id returns null → verdict blocked, reason code origin-record-vanished, naming the record id — and the result must NOT name any other record id (no substitution, no "nearest match")'
- "a checkpoint with an empty record_revisions array → restorable"

## Step 2 — implementation

`restoreCheckpoint(checkpoint: PendingIntentCheckpoint, store: Pick<RecordStore, 'get'>): Promise<RestoreVerdict>`
where `RestoreVerdict = { restorable: true; checked: string[] } |
{ restorable: false; code: 'origin-record-changed' | 'origin-record-vanished'; message: string; recordId: string }`.

- Reads `checkpoint.origin.record_revisions` in declared order; one `store.get(record_id)` per pair.
- `null` → `origin-record-vanished`, message names only the vanished id.
- Token = `meta.contentSha` first, else `meta.gitCommit`; the field name compared is in the
  message. Token absent (meta missing/both tokens undefined) → `origin-record-changed`
  ("revision token was absent, never a silent pass").
- Mismatch → `origin-record-changed`, message names the record id, declared revision and the
  live field value (both revisions visible to a reader).
- All pairs match → `{ restorable: true, checked: [...] }`. Empty array → `restorable` with
  `checked: []`.
- No record-id / surface / journey literal in the module; no route, no store write, no client,
  `status` enum untouched. `checkpointContract.ts`, the schema, store, and types are read-only
  here (types imported: `PendingIntentCheckpoint` from checkpointContract, `RecordStore` from
  store/types, `RecordEnvelope` in the test).

GREEN (raw): `Test Files 1 passed (1)` / `Tests 4 passed (4)` (Duration 687ms).
Committed as `295bf0ce` (GREEN).

## Mutation probe (raw)

Brief's literal edit target `envelope.meta?.contentSha !== pair.revision` does not exist verbatim
because the implementation derives the token as `meta.contentSha ?? meta.gitCommit` (contentSha
first, gitCommit fallback — required by the brief). The probe's intent ("no revision ever counts
as changed") was applied to the actual changed-detection comparison:
`if (token !== pair.revision)` → `if (false)`, nothing else touched. Re-run:

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cprestore-lane2/server

 ❯ src/compiler/journey/checkpointRestoreCheck.test.ts  (4 tests | 1 failed) 7ms
   ❯ src/compiler/journey/checkpointRestoreCheck.test.ts > checkpointRestoreCheck > one record's live revision differs → verdict blocked, reason code origin-record-changed, and the diagnostic NAMES the record id and both revisions
     → expected { restorable: true, checked: [ …(2) ] } to deeply equal { restorable: false, …(3) }

⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/compiler/journey/checkpointRestoreCheck.test.ts > checkpointRestoreCheck > one record's live revision differs → verdict blocked, reason code origin-record-changed, and the diagnostic NAMES the record id and both revisions
AssertionError: expected { restorable: true, checked: [ …(2) ] } to deeply equal { restorable: false, …(3) }

- Expected
+ Received

  Object {
-   "code": "origin-record-changed",
-   "message": "origin record rec-2 changed since the checkpoint: declared revision '9' but the live envelope's contentSha is '9b'",
-   "recordId": "rec-2",
-   "restorable": false,
+   "checked": Array [
+     "rec-1",
+     "rec-2",
+   ],
+   "restorable": true,
  }

 ❯ src/compiler/journey/checkpointRestoreCheck.test.ts:54:15
     52|       { record_id: 'rec-2', revision: '9' },
     53|     ]), store);
     54|     expect(r).toEqual({
     55|       restorable: false,
     56|       code: 'origin-record-changed',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 3 passed (4)
   Start at  05:38:11
   Duration  518ms (transform 34ms, collect 61ms, tests 7ms, environment 0ms, prepare 552ms)
```

Case (b) RED as required (the mutated module returned `restorable` for a divergent revision).
The file was restored (`if (token !== pair.revision)` back) and the run went green again (see
VERIFY below). `git -c core.fileMode=false status --short` after restore: empty (no output) —
no product path left dirty.

## VERIFY (raw)

Targeted: `cd server && npx vitest run src/compiler/journey/checkpointRestoreCheck.test.ts`
```
 ✓ src/compiler/journey/checkpointRestoreCheck.test.ts  (4 tests) 2ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  05:38:18
   Duration  480ms (transform 28ms, setup 0ms, collect 25ms, tests 2ms, environment 0ms, prepare 675ms)
```
Neighbour: `cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts`
```
      Tests  7 passed (7)
   Start at  05:38:19
   Duration  1.92s (transform 71ms, setup 0ms, collect 1.35s, tests 73ms, environment 0ms, prepare 715ms)
```
Typecheck (once): `cd server && npx tsc --noEmit` → exit 0, **0 lines** (baseline 0).
`git -c core.fileMode=false status --short` → **empty** (clean at exit; also after the probe
restore, before this report was written).

## Acceptance mapping

- AC1: 4/4 pass; the four case names above appear verbatim in the test file and in the raw
  targeted output (case names print in the verbose failure/green output).
- AC2: the vanished-record case asserts on the FULL returned object with `expect(r).toEqual({
  restorable: false, code: 'origin-record-vanished', recordId: 'rec-2', message: 'origin record
  rec-2 is no longer in the record store (checkpoint declared revision \'9\'); restoration is
  blocked, not redirected to a similar record' })` — fails on restorable, on any other code, or
  on any other id in the message (the message contains only `rec-2`). The fake store also
  records every `get` call and the test asserts `calls === ['rec-1','rec-2']` — only declared
  ids are ever read, no "nearest match" probing.
- AC3: contract suite 7/7 unchanged (baseline and final runs both 7/7);
  `checkpointContract.ts` unmodified (git status clean; it was only read and imported).
- Invariants: no changes to checkpointContract.ts, the schema, routes, store, or the status
  enum (this unit returns a verdict; persisting `status: blocked` is another unit's job).

## Commits (on top of base 1022b8505b6674366841f8b4445b6805742647c8)

- `02845c9b` L2-JOURNEY-CHECKPOINT-1 cprestore: RED — checkpointRestoreCheck.test.ts
- `295bf0ce` L2-JOURNEY-CHECKPOINT-1 cprestore: GREEN — restoreCheckpoint verdict
- this report + exit marker (see marker line below)

## Remaining / out of scope

- Persisting `status: blocked` onto the checkpoint (store write) — another unit.
- HTTP routes (cproute), surface declarations (cpdeclare), client affordance (cpclient).
- Browser receipt for the blocked-restoration acceptance case (task-list.md:20154-20155) —
  milestone gate over cpstore3+cproute+cpclient, waived for this leg.

L2-JOURNEY-CHECKPOINT-1 UNIT cprestore DONE 81efad193a1e8875d81e1b3646ed279fba9fe9a6
L2-JOURNEY-CHECKPOINT-1-cprestore UNIT unit DONE 81efad193a1e8875d81e1b3646ed279fba9fe9a6
