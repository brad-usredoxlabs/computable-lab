# VPDF-3 FIX RUN 4 — coder report (lane 1, l1t2145b / capture token l1t0315)

Item: VPDF-3, Lane 1. Fix cycle 2 of max 2. One minor defect from
`/home/brad/.hermes/cl/receipts/VPDF-3/advreview-vpdf3fix3-l1t0300-fix3.md` §9.

Worktree/branch: /mnt/vast/home/brad/git/wt/VPDF-3-lane1-l1t2145 on `cl/lane1-vpdf3-l1t2145` (base HEAD ba31a7da).
Fix commit: e6c88a7e67e9530ee716fc625cd8ed116fb6532f.
All git via `git -c core.fileMode=false`.

## 1. Defect and remedy

Defect (verbatim summary): `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts:360`
— the D2 object-message branch's `JSON.stringify(raw.message)` is unguarded, so a non-serializable
`message` object (circular, or containing a BigInt) makes the exported adapter throw
`TypeError: Converting circular structure to JSON`, violating the "never throws" contract the D3
remedy declares and that the sibling `normalizeNoteValue` (`:291–295`) already honours.

Remedy (reviewer's recommended second option): route the object-message branch through the existing
`normalizeNoteValue` helper — its try/catch with the `String(value)` fallback (`JSON.stringify(value) ?? String(value)`
in the try, `return String(value)` in the catch) absorbs non-serializable objects — instead of
duplicating a try/catch. Serializable objects keep byte-identical JSON rendering (the helper's happy
path IS `JSON.stringify`). No schema change, no `mergeChunkResults` change.

Diff (product file, from the commit):

```
commit e6c88a7e67e9530ee716fc625cd8ed116fb6532f
Author: computable-lab <computable-lab@localhost>
Date:   Wed Oct 21 03:15:42 2026 -0400

    fix(vpdf3): fix run 4 — adv-review D2 residual: object-message branch routes through normalizeNoteValue so a NON-serializable message (circular structure, BigInt) degrades via the existing try/catch String() fallback instead of throwing 'Converting circular structure to JSON' from the exported adapter (violates the D3 never-throws contract); serializable objects keep identical JSON rendering; RED-before-pin + mutation proof

diff --git a/server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts b/server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts
index 0f94d7e0..4ccd66a5 100755
--- a/server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts
+++ b/server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts
@@ -352,12 +352,17 @@ function normalizeDiagnosticEntry(
   // VPDF-3 fix3 D2 (adv-review): a message that IS present but not a string
   // (e.g. ['part one','part two']) must render honestly BEFORE falling back
   // to the code/malformed rendering — a supplied message's content survives.
+  // VPDF-3 fix4 D2 residual (adv-review): the object branch routes through
+  // normalizeNoteValue, whose try/catch String() fallback (:291-295) keeps
+  // the exported adapter non-throwing for NON-serializable messages
+  // (circular structure, BigInt) instead of dying inside JSON.stringify.
+  // Serializable objects keep the same JSON rendering as before.
   const renderedMessage = Array.isArray(raw.message)
     ? (raw.message.length > 0 ? raw.message.map((m) => String(m)).join(' … ') : '')
     : raw.message !== null && raw.message !== undefined && typeof raw.message !== 'object'
       ? String(raw.message)
       : raw.message && typeof raw.message === 'object'
-        ? JSON.stringify(raw.message) ?? String(raw.message)
+        ? normalizeNoteValue(raw.message) ?? ''
         : '';
   const message = (typeof raw.message === 'string' && raw.message.trim()) || renderedMessage.trim()
     ? (typeof raw.message === 'string' && raw.message.trim() ? raw.message : renderedMessage)
```

## 2. New pin (RED-FIRST)

Added to `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts` (suite
`adaptAiChunkCandidateToRecordPayload: lossless notes/diagnostics (fix3 D1/D2/D3)`):

`it('fix4: a non-serializable (circular) object message degrades without throwing and keeps a non-empty message')`

A diagnostic entry with code `CIRC_MSG`, severity `warning`, and a self-referencing (circular) object
as `message` goes through the exported `adaptAiChunkCandidateToRecordPayload`: the call must not
throw; every emitted diagnostic stays schema-legal (the suite's `assertSchemaLegalDiagnostic`); the
`CIRC_MSG` entry survives with a non-empty string message.

RED capture (raw: /home/brad/.hermes/cl/lanes/1/vpdf3fix4-red-l1t0315.txt, sha256 6341fb27af33e7681d5808e9e84ab81e1b587fcfa18d7fc76d974c7d952ef61e; CODER-CAPTURED). The failure names exactly the TypeError the review names:

```
RUN  v1.6.1 /mnt/vast/home/brad/git/wt/VPDF-3-lane1-l1t2145/server

 ❯ src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts  (10 tests | 1 failed) 38ms
   ❯ src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts > adaptAiChunkCandidateToRecordPayload: lossless notes/diagnostics (fix3 D1/D2/D3) > fix4: a non-serializable (circular) object message degrades without throwing and keeps a non-empty message
     → expected [Function] to not throw an error but 'TypeError: Converting circular struct…' was thrown

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts > adaptAiChunkCandidateToRecordPayload: lossless notes/diagnostics (fix3 D1/D2/D3) > fix4: a non-serializable (circular) object message degrades without throwing and keeps a non-empty message
AssertionError: expected [Function] to not throw an error but 'TypeError: Converting circular struct…' was thrown

- Expected: 
undefined

+ Received: 
"TypeError: Converting circular structure to JSON
    --> starting at object with constructor 'Object'
    --- property 'self' closes the circle"

 ❯ src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts:466:12
    464|     expect(() => {
    465|       payload = adaptAiChunkCandidateToRecordPayload(summary, meta);
    466|     }).not.toThrow();
       |            ^
    467| 
    468|     const diagnostics = payload!.diagnostics as Array<Record<string, u…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  03:14:09
   Duration  1.82s (transform 168ms, setup 0ms, collect 799ms, tests 38ms, environment 0ms, prepare 500ms)
```

## 3. Mutation proof

Full proof file: /home/brad/.hermes/cl/lanes/1/vpdf3fix4-mutation-l1t0315.txt (raw mutation run: /home/brad/.hermes/cl/lanes/1/vpdf3fix4-mutation-red-raw-l1t0315.txt).

- sha256 of the FIXED product file BEFORE revert: `1a231c9721765c9575ffc3ca4b2e8a81f6b6d5b6900de3b75700f9a9cd2edabc`
- Revert of ONLY the product file (`git -c core.fileMode=false checkout HEAD -- ...`, test file kept):
  exactly 1 failed — the new fix4 pin; the 9 pre-existing pins stay green.
- sha256 AFTER byte-for-byte restore (`cp /tmp/vpdf3fix4-fixed.ts` back): `1a231c9721765c9575ffc3ca4b2e8a81f6b6d5b6900de3b75700f9a9cd2edabc` — identical digest.
- BigInt twin: scratch tsx probe against the FIXED module with a message object containing
  `BigInt(7)` → `NO_THROW message= "[object Object]" nonEmpty= true`; the base expression throws
  (`BASE_EXPR_THREW: Do not know how to serialize a BigInt`, verified via node).

Mutation-run tail (CODER-CAPTURED, from /home/brad/.hermes/cl/lanes/1/vpdf3fix4-mutation-red-raw-l1t0315.txt):

```

 Test Files  1 failed (1)
      Tests  1 failed | 9 passed (10)
   Start at  03:14:43
   Duration  887ms (transform 118ms, setup 0ms, collect 276ms, tests 40ms, environment 0ms, prepare 74ms)
```

## 4. GREEN

Suite (raw: /home/brad/.hermes/cl/lanes/1/vpdf3fix4-green-raw-l1t0315.txt; CODER-CAPTURED) — 10/10:

```
RUN  v1.6.1 /mnt/vast/home/brad/git/wt/VPDF-3-lane1-l1t2145/server

 ✓ src/ingestion/vendor-protocol/VendorProtocolCandidateService.test.ts  (10 tests) 31ms

 Test Files  1 passed (1)
      Tests  10 passed (10)
   Start at  03:14:34
   Duration  801ms (transform 100ms, setup 0ms, collect 248ms, tests 31ms, environment 0ms, prepare 73ms)
```

Typecheck: `npx tsc -p tsconfig.json --noEmit` from /mnt/vast/home/brad/git/wt/VPDF-3-lane1-l1t2145/server → EXIT 0, zero output
(raw: /home/brad/.hermes/cl/lanes/1/vpdf3fix4-tsc-l1t0315.txt, empty file).

Not run per dispatch brief: `ProtocolBuilderStreamPersist.test.ts` (harness /tmp collision; the
orchestrator verifies it serially).

## 5. Commit

```
commit e6c88a7e67e9530ee716fc625cd8ed116fb6532f
Author: computable-lab <computable-lab@localhost>
Date:   Wed Oct 21 03:15:42 2026 -0400

    fix(vpdf3): fix run 4 — adv-review D2 residual: object-message branch routes through normalizeNoteValue so a NON-serializable message (circular structure, BigInt) degrades via the existing try/catch String() fallback instead of throwing 'Converting circular structure to JSON' from the exported adapter (violates the D3 never-throws contract); serializable objects keep identical JSON rendering; RED-before-pin + mutation proof

 .../VendorProtocolCandidateService.test.ts         | 25 ++++++++++++++++++++++
 .../VendorProtocolCandidateService.ts              |  7 +++++-
 2 files changed, 31 insertions(+), 1 deletion(-)
```

Working tree after commit: only the untracked lane-exclude `node_modules` symlinks (`?? node_modules`,
`?? app/node_modules`, `?? server/node_modules`) — no tracked changes, nothing staged beyond the two
assigned files. No self-merge, no stack restart, no :3092 calls, no app/ edits, no YAML.

## 6. Assumptions and notes

- AS-VPDF3F4-001: the reviewer's second option (route through `normalizeNoteValue`) was chosen over a
  duplicated try/catch; behavior for serializable objects is unchanged (the helper's happy path IS
  `JSON.stringify`), verified by the pre-existing D2 pin (`OBJ_MSG` → message contains 'nested')
  staying green.
- The circular fallback message is `String(circular)` = `"[object Object]"` — non-empty and honest
  (it declares the shape failure, fabricates no protocol truth), matching the fallback philosophy of
  the neighbouring branches.
- Report integrity: the fenced vitest blocks above were spliced verbatim from the saved raw files
  (leading spaces preserved); verified with grep -F -x below.

STATUS: complete
