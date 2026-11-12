# L2-PROSE-SHORTHAND-SALVAGE-1 — unit c2type (item clause C2, contract + pin half)

Lane 2, worktree `/home/brad/cl-wt/L2-PROSE-c2-lane2`, branch `cl/lane2-prose-salvage-c2-r-1040`.
Base sha verified before work: `4b837b611b12029a670d21f8371ccca97d0f2337` (matches brief).

## WIP lineage this unit closes (not a new run)

- `39cebafe3922ca7592ecb02bcb37d4f65ec89c2a` — additive `recoverDraftArgsFromContent`
  wrapper (`driver: 'tool-envelope' | 'fenced-json'`) + status-event field + RED tests.
- `4b837b611b12029a670d21f8371ccca97d0f2337` — launcher `WIP AT EXIT (launcher auto-commit,
  NOT gated)` from the c2site run that died before its pin/paperwork: wired the wrapper into the
  production call site (`AgentOrchestrator.ts:2679`), and also landed an orchestrator run-path test
  block in `recoveredFrom.test.ts`.
- Two inert product hunks inherited from `4b837b61` (disclosed, not squashed — both behaviour-preserving):
  (a) the `extraSubmissionNotes` hoist — declared once per turn inside the turn loop at
  `AgentOrchestrator.ts:2267` instead of at the old `:3011` (same per-turn scope; consumers unchanged at
  `:3024`, `:3244`, `:3374`/`:3375` and `:4906`/`:4907`); (b) the recovery `console.log` rewrite at
  `:2715`, which only appends `driver=<…>` to the existing message text (observability, no control flow).
- `794dcd04dd363c97b50299ad512565f4d07676b5` — THIS unit (see marker).

Neither prior commit was reverted, amended, rebased or re-branched.

## Measured premise (differs from the brief — reported, not averaged away)

The brief states the only pin of the spread is the test-local `buildStatusEvent` helper, so reverting
the wiring "leaves every test green". Measured at 4b837b61, that is **false for the status half**:
the WIP commit also added an orchestrator run-path block, and mutating the product file made it RED.
Probe A (delete `...(recoveredFrom ? …)` only): `Tests 2 failed | 5 passed (7)`,
`expected undefined not to be undefined`. Probe B (delete the `extraSubmissionNotes.push` only):
`Tests 2 failed | 5 passed (7)`, `expected false to be true` — so the notes half IS reachable on the
forced-tool run path and already had teeth.

What was genuinely still open, and is what this unit fixes:

1. **The contract said nothing.** `types.ts:989` declared `{ type: 'status'; message: string }` while
   the call site spread `recoveredFrom` into it. TypeScript's spread does not excess-property-check, so
   it compiled and no consumer/receipt could rely on the field. Proven: the compiler rejected the new
   typed assertion at `AgentOrchestrator.shorthandChat.test.ts:333` with
   `Property 'recoveredFrom' does not exist on type '{ type: "status"; message: string; }'`.
2. **The vacuous pin still existed** — `recoveredFrom.test.ts:48-62` built its own status event and
   asserted on it.
3. **No shorthand-surface pin** — the surface the clause is about (run-workspace COERCED prose leg)
   asserted only the message text, i.e. it inferred salvage from prose, not from the marker.

## Changes (3 files + this report)

- `server/src/ai/types.ts` — status variant is now
  `{ type: 'status'; message: string; recoveredFrom?: import('./AgentOrchestrator.js').RecoveredDraft }`.
  Inline **type-only** import, matching the neighbouring variants at :982/:985/:997 — no value import,
  so no runtime cycle `types.ts -> AgentOrchestrator.ts`. One vocabulary authority: the driver union is
  still `RecoveredDraftDriver` in AgentOrchestrator.ts (NOT widened; `'yaml-shorthand'` stays C1's).
- `server/src/ai/AgentOrchestrator.shorthandChat.test.ts` (extended, existing assertions untouched):
  - COERCED prose leg (:321) now requires the matching status event to carry
    `recoveredFrom.driver === 'fenced-json'`.
  - native-tool-call leg (:374, negative control) now also requires that NO status event carries
    `recoveredFrom`, so "always present" cannot pass as a recovery receipt.
- `server/src/ai/recoveredFrom.test.ts` — deleted the `buildStatusEvent` helper and its two
  self-assertions; kept the three wrapper driver tests unchanged and kept the WIP run-path tests,
  retyped to `AgentEvent[]` with type-predicate narrowing (no `as any`), and tightened the negative
  control's `if (result.notes)` guard to an unguarded `(result.notes ?? [])` assertion. The forced-tool
  notes assertion (`result.notes` contains `recoveredFrom`) is retained — it is the reachable notes half.
- `server/src/ai/AgentOrchestrator.ts` — **mutation probe only**. Byte-identical at exit:
  sha256 `bda0715a5252259642ffc0d4b578864c32319965ad72bac171536988e64fb24b` before and after;
  `git diff --stat` shows no such path. Not committed.

## Notes half — measured limit (one sentence)

The shorthand COERCED-refusal leg ends in the honest `cannot draft` error return, which never merges
`extraSubmissionNotes`, so `result.notes` is `[]` there by design (measured: the assertion
`toContain('recoveredFrom: fenced-json')` failed with `expected [] to include ...`); per the brief I
pinned the status event on that leg and left the notes assertion where it is reachable and has teeth
(forced-tool run path), with a comment recording why — no notes array is fabricated anywhere.

## Measurement nuance worth a reviewer's attention

`server/tsconfig.json` excludes `**/*.test.ts`, so `npx tsc --noEmit -p .` does not typecheck the test
files: re-removing `recoveredFrom` from the status variant leaves tsc at 0 errors. The declaration is
therefore the **server wire contract** — `AIHandlers.ts:380` does serialise the whole `AgentEvent`
(`JSON.stringify(event)`) into the SSE `data:` frame, so the field reaches the wire — but it is NOT a
browser-receipt contract: the browser relay is not implemented. `AssistStreamEvent`'s status member
(`app/src/event-editor/right-pane/ai/assistStream.ts:277`) is `{ type: 'status'; message: string }`, and
the parser at `:483` projects every frame to `{ type: 'status', message: parsed.message ?? '' }`,
dropping all non-whitelisted fields; `grep -rn recoveredFrom app/src` → 0 hits. Closing that relay is a
FOLLOW-ON unit, not this one. The enforcement on the test side is the runtime assertion, which is proven
RED below. The test comment states exactly this measured scope.

## Verification (raw)

STEP 0 repair (untracked root symlinks, gitignored, never committed):
`server/schema -> ../schema`, `server/records -> ../records`, `server/config -> ../config`.
`git status --short` empty after linking.

Baseline immediately after STEP 0 (the tree was unrunnable before it):
```
 ✓ src/ai/recoveredFrom.test.ts  (7 tests)
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (21 tests)
 Test Files  2 passed (2)
      Tests  28 passed (28)
```
baseline `npx tsc --noEmit -p .` → `TSC_EXIT=0`, error lines: **0**.

RED first (typeless field, pin added before the contract existed) — status half GREEN at runtime,
notes half RED:
```
 → expected [] to include 'recoveredFrom: fenced-json'
AssertionError: expected [] to include 'recoveredFrom: fenced-json'
 ❯ src/ai/AgentOrchestrator.shorthandChat.test.ts:337:32
 Test Files  1 failed (1)
      Tests  1 failed | 20 skipped (21)
```
Compile-time proof of the contract gap (LSP, same edit): `Property 'recoveredFrom' does not exist on
type '{ type: "status"; message: string; }'. [2339]`

Mutation probe (product file, both lines :2709 and :2712 deleted, then restored):
```
     → expected undefined to be 'fenced-json' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 20 passed (21)
```
Post-restore:
```
bda0715a...fb24b  server/src/ai/AgentOrchestrator.ts
 server/src/ai/AgentOrchestrator.shorthandChat.test.ts | 22 +++++++++
 server/src/ai/recoveredFrom.test.ts                | 55 ++++++++--------------
 server/src/ai/types.ts                             |  2 +-
 3 files changed, 43 insertions(+), 36 deletions(-)
--- status:
 M server/src/ai/AgentOrchestrator.shorthandChat.test.ts
 M server/src/ai/recoveredFrom.test.ts
 M server/src/ai/types.ts
```
(no `AgentOrchestrator.ts` path in the diff)

Final run — baseline plus the new assertions, zero failures:
```
 ✓ src/ai/recoveredFrom.test.ts  (7 tests) 56ms
 ✓ src/ai/AgentOrchestrator.shorthandChat.test.ts  (21 tests) 1027ms
 Test Files  2 passed (2)
      Tests  28 passed (28)
```
Final `npx tsc --noEmit -p .` → `TSC_EXIT=0`, error lines: **0** — EQUAL to baseline.

Tree at exit: `git -c core.fileMode=false status --short` empty (all changes committed).

## Scope accounting

4 files touched (types.ts, recoveredFrom.test.ts, AgentOrchestrator.shorthandChat.test.ts + this
report); `AgentOrchestrator.ts` restored byte-identical and uncommitted; net code diff 43 insertions /
36 deletions. Nothing in `config/**`, `app/**`, `schema/**`, `server.ts`, or the prohibited AI files was
opened for edit. No dependency installs, no scaffolding, no server started. Scratch under
`/home/brad/.prose-c2type-scratch/` (deleted at exit).

## c2typefix1 (advc c1 FIX 4)

Fix run on this same unmerged lineage (`reviews/L2-PROSE-c2type-advc-c1-l2t0400.md` → VERDICT: FIX (4)).
Product code byte-identical at exit (`sha256sum -c` OK for `AgentOrchestrator.ts` and `types.ts`); the
diff `34a48a74..HEAD` names exactly 3 paths (two test files, this report) — 15 of the inserted lines are
test-file changes (one annotation, two filter predicates, one comment); the rest is this mandated report
section. **Budget honesty:** total insertions exceed the brief's ≤40-line output budget (66 at
`34a48a74..34f20852`, the three c2typefix1 fix commits — the `..9cfa3f83` range is 28/11, see §c2typefix2
D-b; plus the `e01ebb73` marker commit and this addendum); declared with the real count, not restated as met.

- **D1 (MAJOR, false committed claim) — FIXED.** The comment at
  `AgentOrchestrator.shorthandChat.test.ts:322` and the §Measurement-nuance paragraph above no longer
  say a browser receipt reads `recoveredFrom` off the wire. Measured truth, restated in both places: the
  field IS on the server wire (`AIHandlers.ts:380` serialises the whole `AgentEvent`); the BROWSER relay
  is NOT implemented — `assistStream.ts:277` types status as `{ type; message }`, `:483` projects
  `{ type: 'status', message }` and drops non-whitelisted fields, `grep -rn recoveredFrom app/src` = 0
  hits. Closing that relay is a FOLLOW-ON unit; `app/**` was not opened.
- **D2 (MINOR) — FIXED.** `recoveredFrom.test.ts:176` `const events: any[]` → `AgentEvent[]`; both
  negative-control filters now narrow with type predicates (`'recoveredFrom' in e`, sibling-leg style),
  no `as any`, no cast, no assertion body or test name changed. Suite GREEN below. *(The `:202` conjunct
  was dropped again in c2typefix2 D-a — it suppressed the TS2339 pin; see below.)*
- **D3 (MINOR) — FIXED.** Exit marker amended to the contract literal (last line of this file).
- **D4 (MINOR) — FIXED.** §WIP lineage above now names the two inert hunks inherited from `4b837b61`
  (`extraSubmissionNotes` hoist `:3011` → `:2267`; `driver=` `console.log` rewrite `:2715`) and why each
  is behaviour-preserving.

Falsifiable checks (raw):
```
$ grep -rn 'const events: any\[\]' server/src/ai/recoveredFrom.test.ts   # rc=1, no output
$ grep -n 'a browser receipt reads it off' server/src/ai/AgentOrchestrator.shorthandChat.test.ts  # rc=1
$ sha256sum -c  ->  server/src/ai/AgentOrchestrator.ts: OK / server/src/ai/types.ts: OK
$ cd server && npx vitest run src/ai/recoveredFrom.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts
   Test Files  2 passed (2) / Tests  28 passed (28)
$ cd server && npx tsc --noEmit -p .  ->  TSC_EXIT=0, error lines: 0 (equal to baseline)
$ git -c core.fileMode=false status --short  ->  empty
$ git diff --name-status 34a48a74..e01ebb73  ->  exactly the 3 paths above
$ git diff --shortstat 34a48a74..34f20852  ->   3 files changed, 66 insertions(+), 12 deletions(-)
   # the three c2typefix1 fix commits (D1-D4); the range the 66 figure belongs to
$ git diff --shortstat 34a48a74..9cfa3f83  ->   3 files changed, 28 insertions(+), 11 deletions(-)
   # c2typefix1 D4 commit only — NOT 66; that figure was mis-attributed here (fixed in §c2typefix2 D-b)
$ git diff --shortstat 34a48a74..e01ebb73  ->   3 files changed, 73 insertions(+), 12 deletions(-)
   # + the c2typefix1 marker commit; the c2typefix2 addendum adds its own delta (§c2typefix2)
```
Marker-count note (honesty): this file now carries four `<item> DONE <40-hex>` lines — the `c2type`
contract literal below (D3), the launcher-appended `c2typefix1` exit literal, and the two `c2typefix2`
literals at the very end (§c2typefix2). The brief's "exactly 1" probe predates the launcher's appended
exit contract, which demands its own literal per run; every grep is satisfied by its own item name.
Cited sha `9cfa3f831bd1b2f4f6df6fbfd41eb46a3ee23515` = last fix commit of c2typefix1, ancestor of HEAD.

L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c2type DONE 9cfa3f831bd1b2f4f6df6fbfd41eb46a3ee23515

L2-PROSE-SHORTHAND-SALVAGE-1-c2typefix1 UNIT unit DONE 9cfa3f831bd1b2f4f6df6fbfd41eb46a3ee23515

## c2typefix2 (advc c2 FIX 2)

Fix run on the same `c2typefix1` lineage (`reviews/L2-PROSE-c2type-advc-c2-l2t0445.md` → VERDICT: FIX (2)).
**Zero product-code change:** `sha256sum -c` for `server/src/ai/types.ts`
(`bcc0c30f1d3ba263459e6ff014a03deeac3e430f9e70b06699d15944b8e81dd4`) and
`server/src/ai/AgentOrchestrator.ts` (`bda0715a5252259642ffc0d4b578864c32319965ad72bac171536988e64fb24b`)
gives `OK`/`OK` before and after; the only paths this run touches are `recoveredFrom.test.ts` (one line,
commit `10a028ce`) and this report.

- **D-a (MINOR) — FIXED.** `recoveredFrom.test.ts:202` no longer carries the `'recoveredFrom' in e`
  conjunct: `e.type === 'status' && e.recoveredFrom !== undefined`. The type predicate and every other
  line of the filter are untouched. At HEAD types the test-inclusive `tsc` error set is byte-identical
  with and without the conjunct (39 errors both ways, none at `:202`), so the retyping of D2 is preserved
  while the pin is restored. Mutation proof, run ONLY on a scratch copy
  (`/home/brad/.prose-c2typefix2-scratch`, a copy of `server/src` + symlinked `node_modules` + a
  test-inclusive tsconfig; deleted at exit) whose `types.ts:989` status variant was reverted to
  `{ type: 'status'; message: string }`:
```
  conjunct present + revert ->  43 errors, none at :202   (the D2 blindness, reproduced)
  conjunct removed + revert ->  44 errors, incl.
    src/ai/recoveredFrom.test.ts(202,34): error TS2339: Property 'recoveredFrom' does not exist on
    type '{ type: "status"; message: string; }'.
```
  The worktree's frozen contract was never edited — the revert exists only inside the scratch copy.
- **D-b (MINOR) — FIXED.** Every raw shortstat block above is re-quoted at its own range and reproduces
  byte-for-byte today: `34a48a74..34f20852` = 66/12 (the figure that had been mis-attributed),
  `34a48a74..9cfa3f83` = 28/11, `34a48a74..e01ebb73` = 73/12.

Checks (raw):
```
$ cd server && npx vitest run src/ai/recoveredFrom.test.ts src/ai/AgentOrchestrator.shorthandChat.test.ts
   Test Files  2 passed (2) / Tests  28 passed (28)
$ cd server && npm run typecheck -w server  ->  TYPECHECK_RC=0, 0 `error TS` lines
$ git -c core.fileMode=false diff 34a48a74..HEAD --shortstat   # HEAD = this addendum commit
  3 files changed, 124 insertions(+), 12 deletions(-)
$ git -c core.fileMode=false status --short  ->  empty
```
The `HEAD` figures above are the measured state of this commit, not a projection: they were read from
`git diff 34a48a74` over the exact tree committed here.

L2-PROSE-SHORTHAND-SALVAGE-1 UNIT c2typefix2 DONE 10a028cef8b49cc9ddebf2d57fe3ea032a831414

L2-PROSE-SHORTHAND-SALVAGE-1-c2typefix2 UNIT unit DONE 10a028cef8b49cc9ddebf2d57fe3ea032a831414
