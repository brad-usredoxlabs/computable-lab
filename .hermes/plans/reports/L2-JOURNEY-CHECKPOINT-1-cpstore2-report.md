# L2-JOURNEY-CHECKPOINT-1 — unit 2 of 4 (token cpstore3) — cpstore2 brief, fresh run

Worktree /home/brad/cl-wt/L2-JOURNEY-CHECKPOINT-1-cpschema2-lane2, branch cl/lane2-journey-checkpoint1-cpschema2-0201.
Base 1022b8505b6674366841f8b4445b6805742647c8 — verified: `git rev-parse HEAD` at STEP 0 matched the base
literal exactly, so the base line was used as-is (no divergence to report).
The two prior cpstore2 runs died on infra (API timeout, no code changes); this run is the first that edited files.

## STEP 0 (raw)

- `git log --oneline -2`: `1022b850 ... report + exit marker` / `29be43e5 ... checkpointContract.ts ...`
- `ls server/src/compiler/journey/checkpointContract.ts` → present
- `cd server && npx vitest run src/compiler/journey/checkpointContract.test.ts` → `Test Files  1 passed (1)` / `Tests  7 passed (7)`

## What landed (exactly the two owned NEW files)

- `server/src/ai-threads/PendingIntentStore.ts` (161 lines)
- `server/src/ai-threads/PendingIntentStore.test.ts` (131 lines)
- Total 292 lines ≤ 300 budget. `git diff --stat` vs base lists exactly these two paths (see below).

Shape: class takes `{ rootDir, userId, endpoint, scope?, threadId }` (option-shape discipline of
`AiThreadStoreOptions`; scope optional — absent scope lands under the sibling store's exported
`DEFAULT_THREAD_SCOPE`, never a re-derived literal). Segments sanitised with the sibling store's
exported `isValidThreadSegment` (one alphabet source of truth; a `..` scope throws and cannot
escape `rootDir`).

- `save(checkpoint)` — `validateCheckpoint` FIRST, refuse with its diagnostics on any rule, then
  tmp-then-rename to `{rootDir}/{userId}/{endpoint}/{scope}/{threadId}.checkpoint.json` (the
  AiThreadStore.ts:310-313 idiom; atomic per OS, NOT a lock).
- `load(checkpointId)` — absent file, malformed JSON, or mismatched checkpoint_id → `null`
  (NO-FALLBACK: never a sibling thread's file, never most-recently-updated).
- `resume(checkpointId, input)` — the compare-and-set, whole read-modify-write inside the
  serialisation. Refuses with named `version_conflict` (message states which rule: stale version
  vs already-resumed) when `concurrency_version !== expectedVersion` or `status === 'resumed'`;
  else writes `status: 'resumed'` + resume receipt (receipt fields spread from REQUIRED inputs —
  never `undefined`, `exactOptionalPropertyTypes`) + `concurrency_version + 1`, re-validated by the
  contract seam before the write. Exactly ONE call may win.
- `attachDelta(delta)` — `validateContextDelta` (the committed seam, one Ajv authority); a delta
  declaring `request_revision` is REFUSED in injection mode with the named `injection-refused`
  diagnostic; requires the parked checkpoint to exist (`checkpoint-not-found` otherwise).
- Serialisation: one module-level `Map<string, Promise<unknown>>` chain keyed by the checkpoint
  FILE PATH — module-level on purpose, because two tabs = two store instances and a per-instance
  map would not order them. The chain never rejects, so a failure cannot wedge later operations.
  Cross-process locking is OUT OF SCOPE and is named as debt in the module header (a second node
  needs an OS-level lock; the rename is not a lock).
- Diagnostics never swallowed: `version_conflict` and `checkpoint-not-found` are distinct named
  results; `load` stays `null` only for genuinely absent/malformed/mismatched documents.

## Divergence noted (per brief step 2, module is authority)

The committed `validateContextDelta(doc: unknown)` (checkpointContract.ts:89) takes NO mode
argument, and the schema models "requires request revision" as the OPTIONAL `request_revision`
block. Per the brief I did NOT add a mode argument and did NOT edit the contract: the
injection-mode refusal is applied in this store as the explicit named `injection-refused`
diagnostic, as instructed.

## ACCEPTANCE (raw)

AC1 — targeted test (raw summary):

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Start at  04:02:56
   Duration  1.15s (transform 59ms, setup 0ms, collect 84ms, tests 59ms, environment 0ms, prepare 123ms)
```

(Re-verified after the mutation-probe restoration; the run above is the post-restoration one.)

AC2 — double-resume fired with `Promise.all` on two store instances (two tabs): the assertion
`expect([a, b].map(r => r.ok ? 'ok' : r.diagnostics[0]?.code).sort()).toEqual(['ok', 'version_conflict'])`
passes — ONE success + ONE `version_conflict`, and the loser's message is asserted to name
`concurrency_version` (the CAS itself refused it, not a post-hoc status read).

AC3 — regression pair (raw summary):

```
 Test Files  2 passed (2)
      Tests  12 passed (12)
```

(checkpointContract.test.ts 7/7 + journeyDocumentLint.test.ts 5/5; no schema/YAML file appears in
`git diff --stat` — see below.)

## MUTATION PROBE (raw)

Removed ONLY the `concurrency_version !== expectedVersion` comparison in `resume` (everything else
left), ran the targeted test:

```
→ expected 'checkpoint cp-journey-1 was already r…' to contain 'concurrency_version'
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 6 passed (7)
```

i.e. the double-resume case FAILED with the comparison removed (the loser's refusal fell through to
the `status === 'resumed'` guard, whose message does not name the version — the pin assertion
caught exactly that, so the pin is NOT vacuous: the test distinguishes the CAS refusal from the
second guard). Restoration proof: after restoring the line, `git -c core.fileMode=false status
--short` was empty before the commit (tree clean, product diff empty), and the full suite was
re-run green (AC1/AC3 runs above).

## Typecheck

Pre-edit baseline (same command, before any file existed): `npx tsc --noEmit 2>&1 | wc -l` → `0`.
Final: `npx tsc --noEmit 2>&1 | wc -l` → `0`. Equal to baseline.

## VERIFY at exit (raw)

```
$ git -c core.fileMode=false status --short
(empty)
$ git diff --stat 1022b850
 server/src/ai-threads/PendingIntentStore.test.ts | 131 +++++++++++++++++++
 server/src/ai-threads/PendingIntentStore.ts      | 161 +++++++++++++++++++++++
 2 files changed, 292 insertions(+)
```

No route, no client code, no schema/YAML edit, no new record type, no second Ajv instance, no
surface names / record ids / labware kinds as TS literals (test fixtures use test-only ids).
`AiThreadStore.ts` / `types.ts` / `index.ts` / `checkpointContract.ts` / `journeyDocumentLint.ts`
untouched; the export lands with the route unit (unit 3+). No scratch files in the worktree
(`/home/brad/.cpstore2-scratch/` was never needed); all temp roots live under `os.tmpdir()` and
are removed in `afterAll`.

## Commits

- `97172767637bb7dd113778eeb25e6e27c2218217` — journey checkpoint cpstore2: PendingIntentStore (implementation + test)
- `a35961e604b05a127443f202304f885256f39fde` — journey checkpoint cpstore2: compact both files to 292 lines (≤300 budget); behavior unchanged
- (this report) paperwork commit

The marker sha below is `git rev-parse HEAD` at the moment this report was written (the commit that
contains this unit's code). This paperwork commit follows it.

L2-JOURNEY-CHECKPOINT-1 UNIT 2 DONE a35961e604b05a127443f202304f885256f39fde
UNIT cpstore3 DONE a35961e604b05a127443f202304f885256f39fde
