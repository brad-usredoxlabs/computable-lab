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
