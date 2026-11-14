# L2-GC-ANALYSIS-BIND-1 u1measkind — Report

- **Unit:** u1measkind (1 of 2) — item L2-GC-ANALYSIS-BIND-1-u1measkind
- **Lane:** 2
- **Worktree:** /home/brad/cl-wt/L2-GC-ANALYSIS-BIND-1-u1measkind-lane2
- **Branch:** cl/lane2-gc-analysis-bind-1-u1measkind-0726
- **Base:** 5389668cc41b4484067588ad0824458caf1a81c3
- **Commits:** cd81f4f9d6b1f46f0218aa7a8f9ea13582606553 (RED) → e56d37f579751eac08a73b578e1fb6bc0fa6fb8a (GREEN) → 09bc7fe33ca302fc326fe7248df1af1dce7a76be (report, CONTAINS this report) → 471a92a67ec7beebbbe1a412d525f769a9d1a610 (marker append)

## Governing line (quoted from the grounding)

Decision D8.4 (SUBPROTOCOL-GRAPH-SHAPE-l2-20261109.md:86, "Build != execute"): "it must never assume
one. Recorded values carry their producing step and mechanism. An unanswered required parameter blocks
execution with a named error; it does not default." — the declared contract is what makes an input typed.

Architect-context §2 item 9 (architect-context-l2.md:49): "9. **Hands-offs are typed ports.** Provenance
rung, units, cardinality, record revision, coordinate frame and committed-vs-staged are declared, not
implied." — a bound record's kind must be declared/typed, not left to a silent default.

## What the unit changes (the vacuous pin removed)

The declared-inputs gate's `(vii)` dataKind arm (declaredInputs.ts) read only `payload.dataKind` for a
non-artifact ref and SKIPPED the comparison entirely when that field was absent. A parsed `measurement`
record carries no `payload.dataKind` (measurement.schema.yaml declares only `const: "measurement"` as its
kind), so a `measurement` bound into a `signal`-typed slot resolved to NO kind and was silently admitted.
That silent default is the vacuous pin this unit removes.

> **[SUPERSEDED — advc c1, D5]** The premise above — "measurement.schema.yaml declares only
> `const: \"measurement\"` as its kind, so resolve from TYPE" — is WRONG: the schema REQUIRES the `kind`
> field; the record's kind was present and unread, and the client label `ref.type` must never be the
> authority. See FIX LEG u1measkindfix1, correction D5.

Two disjoint owned files, plus the test:

1. `schema/knowledge/analysis-revision.schema.yaml` — add ONE enum value `measurement` to the
   `inputs[].dataKind` enum (line 72). No other edit. This makes the declaration
   `{name:'chromatogram', dataKind:'measurement'}` creatable.
2. `server/src/analysis/declaredInputs.ts` — the `(vii)` non-artifact arm now resolves
   `resolvedKind = payload.dataKind ?? ref.type` (mirroring the artifact arm's existing `??` fallback):
   a record with no `dataKind` in its payload resolves its kind from its own record TYPE (the schema's
   `const`), never from a TS string table and never by client re-derivation. The comparison and the
   `resolvedKind !== undefined` "absent ⇒ skip" guard are unchanged; the guard still governs the artifact
   arm (the only record shape that can now resolve to no kind at all).
3. `server/src/analysis/declaredInputs.test.ts` — 3 new cases (existing 20 untouched).

Change footprint: 3 files, 73 insertions / 2 deletions (within the ≤3 files / ≤120 lines budget).

## Non-breaking rationale (AC3)

`data-reference` records REQUIRE `dataKind` (data-reference.schema.yaml:109 — `required: [ kind, id,
title, storageDeviceId, path, contentHash, sizeBytes, dataKind ]`). So a `data-reference` payload ALWAYS
carries `dataKind`, and `payload.dataKind ?? ref.type` evaluates to `payload.dataKind` for it — the
`??` fallback never fires for DREF refs. DREF-bound slots therefore behave byte-identically to base; the
suite staying green proves it. The global `inputKinds` config policy (config/drafting/
analysis-composition.yaml) is UNCHANGED (the per-slot `acceptsKinds` is the lawful door; the global set
was not widened). The artifact arm, the `acceptsKinds` precedence, the config-policy read, and the error
code `INPUT_DATAKIND_INCOMPATIBLE` are all unchanged.

## RED (before the fix, at base 5389668cc)

RED case 1 — the schema refuses the `measurement` declaration (scratch probe loading the WHOLE schema
tree, exact AC1 payload):

```
dataKind: "measurement" revision payload -> REJECTED (schema refuses)
  error: {"path":"/inputs/0/dataKind","message":"Must be one of: table, signal, signal-collection, spatial-array, image, model, binary, metric, sequence, sequence-collection, alignment, sequence-hits","keyword":"enum","params":{"allowedValues":["table","signal","signal-collection","spatial-array","image","model","binary","metric","sequence","sequence-collection","alignment","sequence-hits"]},"suggestion":"\"measurement\" is not allowed here; choose one of: table, signal, signal-collection, spatial-array, image, model, binary, metric, sequence, sequence-collection, alignment, sequence-hits."}
```

RED case 2 — the gate MISMATCH case is the hole: a `measurement` bound into a `signal`-declared slot is
ACCEPTED at base (the gate resolves no kind and skips). The new assertion (it must throw
`INPUT_DATAKIND_INCOMPATIBLE`) fails at base, exactly as required (RED on the MISMATCH case, not only
green on the happy path):

```
 RUN  v1.6.1 .../server
 ❯ src/analysis/declaredInputs.test.ts  (23 tests | 1 failed) 29ms
   ❯ ... > refuses a measurement record (no payload.dataKind) bound into a signal-declared slot — the kind falls back to the record TYPE (INPUT_DATAKIND_INCOMPATIBLE, not a silent pass)
     → promise resolved "undefined" instead of rejecting
 FAIL  src/analysis/declaredInputs.test.ts > ... refuses a measurement record (no payload.dataKind) bound into a signal-declared slot ...
AssertionError: promise resolved "undefined" instead of rejecting
- Expected:
[Error: rejected promise]
+ Received:
undefined
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
```

## GREEN (after the fix, at the final commit)

Targeted — `cd server && npx vitest run src/analysis/declaredInputs.test.ts`:

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
```

Schema probe (same AC1 payload now VALID after the enum add):

```
dataKind: "measurement" revision payload -> VALID (accepted)
```

Schema contract — `cd server && npx vitest run src/analysis/analysisSchema.test.ts`:

```
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

The three new cases (mismatch REFUSED with the code naming both the declared and resolved kind;
measurement-typed slot PASSES; absent ⇒ skip pinned for the artifact arm) are now green.

## Mutation probe (proves the pin is load-bearing)

Reverted ONLY the non-artifact arm to `resolvedKind = payload.dataKind;` (schema + tests left in place).
The MISMATCH case went RED (a second mechanism is NOT resolving the kind — the gate is the only path):

```
❯ ... refuses a measurement record (no payload.dataKind) bound into a signal-declared slot ...
     → promise resolved "undefined" instead of rejecting
 Test Files  1 failed (1)
      Tests  1 failed | 22 passed (23)
   Duration  859ms
```

Restored the fix (`payload.dataKind ?? ref.type`) → back to 23/23 green.

## Typecheck

`cd server && npx tsc --noEmit` measured at base 5389668cc = 6 pre-existing `error TS` (none in the owned
files). At the final commit the count is 6 and the error SET is byte-identical to baseline (diffed the two
`error TS` lines). 0 new errors introduced. (Pre-existing errors were NOT fixed, per the brief.)

## Adjacent suite

> **[SUPERSEDED — advc c1, D7]** This "FAILS at COLLECTION ... cannot be fixed here" claim does NOT
> reproduce: it is an environment artifact (the standard `server/schema -> ../schema` symlink was absent),
> not a trunk defect. Measured green once the symlink exists. Retracted in FIX LEG u1measkindfix1,
> correction D7 — never cite this section as a trunk defect.

`cd server && npx vitest run src/analysis/analysisService.test.ts` — FAILS at COLLECTION, both at base
AND at the final commit, with:

```
Error: scientist-intent vocabulary vocabulary file not found: .../server/schema/scientist-intent/scientist-intent-vocabulary.yaml — the vocabulary triplet is required; there is no default verb set
 Test Files  1 failed (1)
      Tests  no tests
```

This is a PRE-EXISTING, environment-caused collection error: `server/schema` is git-ignored
(`git check-ignore` → matched by `.gitignore:52 server/schema`), so the scientist-intent vocabulary
triplet is not present in this fresh checkout. It is UNRELATED to this unit (different module, no shared
code path with the gate), was present before any edit, and is byte-identical pre/post. It is outside the
3-file scope and cannot be fixed here without minting a git-ignored data file (a data-repo decision, not a
coder's). Recorded so the gate grader does not misattribute it.

## AC mapping (code-track only)

- AC1 — a revision slot `{name:'chromatogram', dataKind:'measurement'}` is now creatable (schema accepts
  it; the probe validates it end-to-end against the served schema tree). GET read-back of the slot rides
  the same record the store writes; the enum widening is the enabling change.
- AC2 — a run binding a `measurement` record into a `measurement` slot PASSES; the SAME record bound into
  a `signal` slot is REFUSED with `INPUT_DATAKIND_INCOMPATIBLE` and the message quotes both the declared
  (`'signal'`) and the resolved (`'measurement'`) kind (pinned by the new mismatch test). No silent pass.
- AC3 — every existing path keeps working: DREF-bound slots byte-identical (they always carry `dataKind`),
  config policy file unchanged, artifact arm / acceptsKinds precedence / error codes unchanged, existing
  20 test cases untouched and green.

> **[SUPERSEDED — advc c1, D8]** Do not claim AC3 from `declaredInputs` alone. Measured truth:
> `src/analysis/` runs with 5 PRE-EXISTING failures (the `analysisGcCalibrationChaining` fixture bugs,
> advc D9); a reverted-line control reproduces the same 5. AC3 is a pre-existing-red caveat, not a green.
> See FIX LEG u1measkindfix1, correction D8.
- ACCEPTANCE is CODE-TRACK ONLY (schema + gate + tests). The browser surface for the GC chain belongs to
  L2-GC-UPLOAD-UI-1 / unit 2 of 2. NO UI claim is made here.

## Environment note (harness, not a change)

The worktree had no `node_modules` (fresh checkout). I symlinked `node_modules` and `server/node_modules`
to the byte-identical-integration store at /mnt/vast/home/brad/git/cl-integration-2 (pnpm-lock.yaml
diffed IDENTICAL; both package.json diffed IDENTICAL) so `vitest`/`tsc`/`tsx` resolve — no `npm/pnpm
install` was run. These are git-ignored and are not part of the commit.

## Next action / owner

Implementation complete (declaration half only: records + execute/artifact read-back are unit 2 of 2,
which needs a data-repo minting decision that is not a coder's). Await adversarial/browser acceptance by
the orchestrator. No blockers on this unit's scope.

L2-GC-ANALYSIS-BIND-1-u1measkind UNIT u1measkind DONE 09bc7fe33ca302fc326fe7248df1af1dce7a76be

---

# FIX LEG u1measkindfix1 (2026-11-14) — advc c1 FIX-FUNCTIONAL corrections (D1 blocker, D2, D3, D4)

- **Unit:** u1measkindfix1 (1 of 1 in this leg; 3rd unit of item L2-GC-ANALYSIS-BIND-1)
- **Base:** 45e2e3173b802141ab0f56788dc45954310e79f8 (branch tip, NOT trunk — the fixed code exists only on this unmerged branch)
- **Answers:** reviews/L2-GC-ANALYSIS-BIND-1-measkind-advc-c1.md (2026-11-14T08:55, VERDICT: FIX-FUNCTIONAL)

## The correction (one sentence)

The `(vii)` non-artifact arm resolved a bound record's kind from `payload.dataKind ?? ref.type` — the
client-supplied `ref.type` label from the run-create body. Now it resolves from the RECORD:
`resolvedKind = payload.dataKind ?? payload.kind;`. `schema/lab/measurement.schema.yaml:21` REQUIRES
`kind` (const: "measurement"); the store hands it back on `env.payload` (`RecordStoreImpl.ts:636` reads
`payload.kind`); the caller's label has no authority over what the record IS. The artifact arm (:328),
the `acceptsKinds` precedence, the config-policy read, the error codes, and the
`resolvedKind !== undefined` "absent ⇒ skip" guard are all UNCHANGED. No new record-kind string
literal appears in `declaredInputs.ts`; the refusal message (:342) now appends
` (bound record '${ref.id}')` AFTER the two byte-intact substrings existing pins assert.

Commits on this branch (one per code step, per commit discipline):

```
954369b0b L2-GC-ANALYSIS-BIND-1 u1measkindfix1 (RED): disagreeing-authority negative control + repair dead duplicate message: assertion
af6079532 L2-GC-ANALYSIS-BIND-1 u1measkindfix1 (GREEN): the (vii) non-artifact arm resolves the bound record's kind from the RECORD (payload.dataKind ?? payload.kind)
dc729ac33 L2-GC-ANALYSIS-BIND-1 u1measkindfix1 (D4): the INPUT_DATAKIND_INCOMPATIBLE refusal names the offending record id (bound record '<id>')
a08bb6f6d L2-GC-ANALYSIS-BIND-1 u1measkindfix1 (D3): pin AC1's measurement enum member with two committed analysisSchema cases
```

Footprint vs base 45e2e3173 (`git diff --numstat`): 3 files, 71 insertions / 10 deletions
(`declaredInputs.ts +11/-8`, `declaredInputs.test.ts +34/-2`, `analysisSchema.test.ts +26/-0`).
`schema/**` byte-identical (P2 below restores it; no schema commit).

## D1/AC1 pin — the two authorities DISAGREE (RED at base)

Store holds `PRT-TEST-1` with payload `{ kind: 'protocol', id: 'PRT-TEST-1', title: 'x' }`; the slot
declares `dataKind: 'measurement'`; the run input binds `{ kind: 'record', id: 'PRT-TEST-1',
type: 'measurement' }` — the client label SAYS measurement, the record SAYS protocol. Raw RED run at
base 45e2e3173 (`cd server && npx vitest run src/analysis/declaredInputs.test.ts`):

```
 RUN  v1.6.1 /home/brad/cl-wt/L2-GC-ANALYSIS-BIND-1-u1measkind-lane2/server

 ❯ src/analysis/declaredInputs.test.ts  (24 tests | 1 failed) 26ms
   ❯ src/analysis/declaredInputs.test.ts > validateDeclaredInputs — OQ-3 named skip + W4 rejection set > refuses a protocol record (no payload.dataKind) bound as type:measurement into a measurement slot — the client ref.type label has NO authority (INPUT_DATAKIND_INCOMPATIBLE naming protocol, not measurement)
     → promise resolved "undefined" instead of rejecting

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/analysis/declaredInputs.test.ts > validateDeclaredInputs — OQ-3 named skip + W4 rejection set > refuses a protocol record (no payload.dataKind) bound as type:measurement into a measurement slot — the client ref.type label has NO authority (INPUT_DATAKIND_INCOMPATIBLE naming protocol, not measurement)
AssertionError: promise resolved "undefined" instead of rejecting

- Expected: 
[Error: rejected promise]

+ Received: 
undefined

 ❯ src/analysis/declaredInputs.test.ts:321:7
    319|     await expect(validateDeclaredInputs(store, payload, {
    320|       chromatogram: { kind: 'record', id: 'PRT-TEST-1', type: 'measure…
    321|     })).rejects.toMatchObject({
       |       ^
    322|       code: 'INPUT_DATAKIND_INCOMPATIBLE',
    323|       message: expect.stringContaining("resolves to dataKind 'protocol…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 23 passed (24)
   Start at  09:09:29
   Duration  2.97s (transform 57ms, setup 0ms, collect 533ms, tests 26ms, environment 0ms, prepare 605ms)
```

The gate today ADMITS the protocol record purely on the caller's `type:'measurement'` label — exactly
PROBE A/PROBE C from the review. (The same commit also repaired `declaredInputs.test.ts:296-297`: one
object literal carrying two `message:` keys — the second silently won, so `:296`
(`declared dataKind 'signal'`) was a DEAD assertion; collapsed to ONE `message:` expression that
contains BOTH halves, so both are live.)

## Mutation probes (each pasted raw; all reverted before commit)

**P1** — `:337` set back to `payload.dataKind ?? ref.type` → the disagreeing pin goes RED:

```
 ❯ src/analysis/declaredInputs.test.ts  (24 tests | 1 failed) 27ms
   ❯ ... > refuses a protocol record (no payload.dataKind) bound as type:measurement into a measurement slot — the client ref.type label has NO authority (INPUT_DATAKIND_INCOMPATIBLE naming protocol, not measurement)
     → promise resolved "undefined" instead of rejecting
 Test Files  1 failed (1)
      Tests  1 failed | 23 passed (24)
```

**P2 (D3 teeth)** — `, measurement` deleted from `analysis-revision.schema.yaml:72`,
`cd server && npx vitest run src/analysis/analysisSchema.test.ts`:

```
 ❯ src/analysis/analysisSchema.test.ts  (26 tests | 1 failed) 389ms
   ❯ ... > accepts a revision whose input slot declares dataKind: measurement (the AC1 enum member is creatable)
     → expected false to be true // Object.is equality
AssertionError: expected false to be true // Object.is equality
 ❯ src/analysis/analysisSchema.test.ts:365:15
 Test Files  1 failed (1)
      Tests  1 failed | 25 passed (26)
```

Restored with `git checkout -- schema/knowledge/analysis-revision.schema.yaml`;
`git -c core.fileMode=false status --short` → EMPTY (byte-identical, no schema commit).

**P3 (D2 teeth)** — `:337` back to `payload.dataKind ?? ref.type` AND the probe fixture's label
`type` flipped to `'protocol'` (the slot's `acceptsKinds` flipped to `['protocol']` for the probe
only, since gate (iv) checks `ref.type` against `acceptsKinds` — with label = `protocol` = record
kind, gate (iv) passes and the probe isolates gate (vii)): the pin goes GREEN (24/24), proving it is
specific to the AUTHORITY (the label disagreeing with the record), not to refusals in general.
Fixture and fix reverted byte-identical before commit.

## VERIFY (final commit, raw)

Targeted — `cd server && npx vitest run src/analysis/declaredInputs.test.ts src/analysis/analysisSchema.test.ts`:

```
 ✓ src/analysis/declaredInputs.test.ts  (24 tests) 26ms
 ✓ src/analysis/analysisSchema.test.ts  (26 tests) 386ms

 Test Files  2 passed (2)
      Tests  50 passed (50)
   Start at  09:20:22
   Duration  3.36s (transform 146ms, setup 0ms, collect 1.71s, tests 412ms, environment 0ms, prepare 1.17s)
```

Baseline at 45e2e3173 was 23 + 24 = 47 passed (measured 09:07:49, duration 1.11s). 47 + 1 (step 1a
pin) + 2 (D3 pins) = 50. AC2 is live in the repaired pin: the same `kind:'measurement'` record (no
`dataKind`) bound into a `dataKind:'measurement'` slot PASSES and into a `dataKind:'signal'` slot
REFUSES with both substrings byte-intact; AC3 — the artifact arm and `dataKind`-absent⇒skip are
untouched, suite counts grew only by the pins added.

Adjacent, ONE bounded run — `cd server && npx vitest run src/analysis/ 2>&1 | tail -n 8`:

```
 ❯ src/analysis/analysisGcCalibrationChaining.test.ts  (6 tests | 5 failed) 34404ms   (only failing file; failures at :313 :408 :534 :580 :728 — the advc D9 pre-existing fixture bugs)
 ⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯
 Test Files  1 failed | 12 passed (13)
      Tests  5 failed | 134 passed (139)
   Start at  09:15:14
   Duration  78.97s (transform 4.54s, setup 3ms, collect 41.60s, tests 354.20s, environment 3ms, prepare 1.53s)
```

Measured 5 failed / 134 passed — the SAME 5 `analysisGcCalibrationChaining` failures advc D8/D9 named
(PRE-EXISTING; not fixed here, outside this assignment). Notably `analysisService.test.ts (16 tests)`
PASSES in this run — the D7 collection failure does not reproduce here (see D7 correction above).

Typecheck — `cd server && npx tsc --noEmit 2>&1 | grep -c "error TS"` → **6** (baseline 6);
`grep -c "declaredInputs\|analysisSchema"` over the same output → **0** (zero in the owned files;
all 6 pre-existing in `src/api/handlers/*` and `src/sequences/sequenceRoutes.ts`). Count did not
increase; pre-existing errors NOT fixed, per the brief.

`git -c core.fileMode=false status --short` → EMPTY at exit (tree clean).

## AC mapping (code-track only — no UI claim; the GC browser gate is a separate step)

- **AC1** — PRT-TEST-1 (`kind:'protocol'`) bound as `type:'measurement'` into a `dataKind:'measurement'`
  slot → REFUSED with `INPUT_DATAKIND_INCOMPATIBLE` naming `protocol` AND `PRT-TEST-1`. The client
  label has no authority. Pinned and mutation-probed (P1/P3).
- **AC2** — the same measurement record (`kind:'measurement'`, no `dataKind`) into a
  `dataKind:'measurement'` slot PASSES; into `dataKind:'signal'` REFUSES (repaired pin, both halves
  live, id included). No over-refusal, no blanket refusal.
- **AC3** — artifact arm / `dataKind`-absent⇒skip unchanged (byte-identical code path); suite counts
  grew only by the 3 pins (47 → 50). CAVEAT per D8: the `src/analysis/` directory is pre-existing-red
  (the 5 D9 failures) — that is a caveat on the adjacent suite, not a regression from this unit.

L2-GC-ANALYSIS-BIND-1-u1measkindfix1 UNIT unit DONE 8b3e6f57ec52d92a59dca333b06095375bc6fa59
