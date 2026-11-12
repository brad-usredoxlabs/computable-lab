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

L2-PROSE-SHORTHAND-SALVAGE-1-c2type UNIT unit DONE 794dcd04dd363c97b50299ad512565f4d07676b5
