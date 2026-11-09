# L2-INTENTID-REDRAFT-1 LEG B — FIX RUN 1 (adversarial review defect D1)

Coder: cl-coder. Lane 2 worktree `/mnt/vast/home/brad/git/wt/L2-INTENTID-REDRAFT-1-lane2`,
branch `cl/lane2-intentid-redraft-1`, base HEAD `7b285b85` (docs tip, leg B).
Fix scope per adversarial verdict: **test-only** — extend
`server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts` with a
multipart-arm leg. No product code changed (see §4).

All commands run by the coder; raw captures under `deliverables/` with suffix
`.l2t1530.txt`.

---

## 1. DEFECT (verbatim from adversarial review, l2t1515)

> server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts covers the
> JSON body arm only; the multipart arm of draftEventsStream has NO surface test
> leg. A regression dropping fields['surface'] there (e.g. if attachment turns
> start reaching this handler) would leave both new suites GREEN and silently
> re-kill the shorthand arm. My probe proves the CURRENT multipart code path is
> correct (fields['surface'] read, absent -> key absent), so this is a coverage
> defect, not a behaviour defect.

Fix direction honored: a `parts()`-fixture leg mirroring the `jsonRequest()`
helper — one case with surface `'event-editor'` asserting
`'surface' in args === true`, one without asserting `'surface' in args === false`
and the exact legacy key set.

## 2. WHAT CHANGED (one file, +97 lines, test-only)

`server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts`:
- New helper `multipartRequest(fields: Record<string, string>)` — builds a
  request whose `parts()` is an async generator yielding `{ type: 'field',
  fieldname, value }` entries and whose content-type header is
  `multipart/form-data`, so the handler takes the `request.parts()` parse branch
  (AIHandlers.ts:329-358) instead of the JSON body branch. Mirrors
  `jsonRequest()` one-for-one (same `log`/`_error` mock shape).
- Leg 3: multipart body carrying `surface: 'event-editor'` +
  clarificationAnswers (JSON-stringified, as the live app sends them) → asserts
  `'surface' in args === true`, `args.surface === 'event-editor'`, answers
  parse through, prompt/context unchanged.
- Leg 4: legacy multipart body with NO surface field → asserts
  `'surface' in args === false`, exact key set
  `{ prompt, context, history: [], forceDraftTool: true }` via `dataArgs`, and
  no `surface` in the serialized args (same legacy guardrail as JSON leg 2).
- Header comment updated to document legs 3-4 and the D1 rationale.

`git -c core.fileMode=false diff --stat` at commit:
```
server/src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts | 97 +++++++++++++++
1 file changed, 97 insertions(+)
```

## 3. EVIDENCE

### (1) RED proof (load-bearing, product temporarily mutated, then restored)

Temporary mutation of `server/src/api/handlers/AIHandlers.ts:358` — the
multipart read commented out and the variable pinned `surface = undefined;`
(the JSON-branch read at :368 left intact, so this isolates the MULTIPART arm):

```
        // MUTATION-RED-PROOF (temp): surface = fields['surface'] ? (fields['surface'] as AiSurface) : undefined;
        surface = undefined;
```

Run (raw `deliverables/legbfix1-multipart-red.l2t1530.txt`):

```
 ✓ src/api/handlers/AIHandlers.deckStreamError.test.ts  (1 test) 4ms
 ❯ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts  (4 tests | 1 failed) 7ms
   ❯ ... > passes surface + clarificationAnswers to run() on the MULTIPART arm (parts())
     → expected false to be true // Object.is equality

 FAIL  src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts > ... > passes surface + clarificationAnswers to run() on the MULTIPART arm (parts())
AssertionError: expected false to be true // Object.is equality

 ❯ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts:204:31
    204|     expect('surface' in args).toBe(true);

 Test Files  1 failed | 1 passed (2)
      Tests  1 failed | 4 passed (5)
```

Reading: the NEW multipart-with-surface leg goes RED at exactly the
`'surface' in args` assertion (line 204) — the leg is load-bearing on the
`fields['surface']` read. The JSON legs and the multipart-absent leg stay GREEN
(4 passed): the absent leg is a legacy guardrail (absent -> key absent holds
even when the read is removed), same by-design semantics as JSON leg 2 in the
original suite. This matches the reviewer's own mutation control (a) for the
JSON arm.

### (2) Restore + GREEN

The mutation was reverted to the exact original line
(`surface = fields['surface'] ? (fields['surface'] as AiSurface) : undefined;`).
`git -c core.fileMode=false diff HEAD -- server/src/api/handlers/AIHandlers.ts`
is EMPTY — the handler file is byte-identical to HEAD `7b285b85`.

Run (raw `deliverables/legbfix1-touched-green.l2t1530.txt`):

```
 ✓ src/api/handlers/AIHandlers.deckStreamError.test.ts  (1 test) 4ms
 ✓ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts  (4 tests) 5ms

 Test Files  2 passed (2)
      Tests  5 passed (5)
   Start at  15:28:11
   Duration  1.64s (transform 538ms, setup 0ms, collect 1.85s, tests 9ms, environment 0ms, prepare 125ms)
```

### (3) Touched handler suite + deckStreamError + full `AIHandlers` substring suite

Raw `deliverables/legbfix1-handler-suite.l2t1530.txt`
(`npm run test:run -- AIHandlers` from `server/`, collects 6 files):

```
 ✓ src/api/handlers/AIHandlers.deckStreamError.test.ts  (1 test) 6ms
 ✓ src/api/handlers/AIHandlers.attachments.test.ts  (4 tests) 7ms
 ✓ src/api/handlers/AIHandlers.draftEventsStreamSurface.test.ts  (4 tests) 8ms
 ✓ src/api/handlers/KnowledgeAIHandlers.assertions.test.ts  (2 tests) 1185ms
 ❯ src/api/handlers/AIHandlers.foldStreamTerminal.test.ts  (1 test | 1 failed) 254ms
 ❯ src/api/handlers/AIHandlers.shorthandCancel.test.ts  (8 tests | 1 failed) 719ms

 Test Files  2 failed | 4 passed (6)
      Tests  2 failed | 18 passed (20)
```

The 2 failures are the DOCUMENTED PRE-EXISTING `workspace.deck`-fixture debt
(same two suites, same assertions, same lines as the adversarial reviewer's
base/HEAD control runs in review §0 and as this lane's leg-B report §4):
- `AIHandlers.foldStreamTerminal.test.ts:222:31` — `expected 2 to be 1`
  (model.callCount pin)
- `AIHandlers.shorthandCancel.test.ts:320:31` — `expected 2 to be 1`
  (R4 regression pin, zero model calls)

Neither file is touched by this fix (`git diff` empty for both); they fail
identically at base. Not a leg-B or fix-run-1 regression.

### (4) Server tsc — zero new errors vs prior run

`cd server && npx tsc --noEmit` → exit 0; raw
`deliverables/tsc-legbfix1.l2t1530.txt` is EMPTY (0 lines, 0 `error TS`).
`diff deliverables/tsc-legb.l2t1415.txt deliverables/tsc-legbfix1.l2t1530.txt`
→ IDENTICAL (the prior leg-B raw was also 0 bytes / 0 error lines). ZERO new
error lines.

## 4. PRODUCT CODE: NO CHANGE REMAINS

- `git -c core.fileMode=false diff HEAD -- server/src/api/handlers/AIHandlers.ts`
  → EMPTY (byte-identical after restoring the RED-proof mutation).
- `git -c core.fileMode=false status --porcelain` at commit time: `M` on the one
  test file + untracked `deliverables/` captures + this report only.
- The RED proof did NOT demand any product change — it was a pure
  comment-out/pin-and-restore of the already-correct read at AIHandlers.ts:358
  (the reviewer's probe had already proven that read correct).

## 5. END MARKER

Content-complete tip of FIX RUN 1 (test + docs commit on top of `7b285b85`):
see the marker line at the bottom of this report's commit
(`git -c core.fileMode=false log --oneline 7b285b85..HEAD`). Raw captures:
`legbfix1-multipart-red.l2t1530.txt`, `legbfix1-touched-green.l2t1530.txt`,
`legbfix1-handler-suite.l2t1530.txt`, `tsc-legbfix1.l2t1530.txt`.
