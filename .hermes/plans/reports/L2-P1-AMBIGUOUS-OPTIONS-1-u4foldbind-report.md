# L2-P1-AMBIGUOUS-OPTIONS-1 / u4foldbind — fold-resume answeredSlot fix

Lane: 2 · Branch: `cl/lane2-ambigopts-u4foldbind-l2t2637` · Base: `0217f4bc18d9b64e24c5fe0709975a90ab302386`
Worktree: `/home/brad/cl-wt/L2-P1-AMBIGUOUS-OPTIONS-1-u4foldbind-lane2`

## Commit chain
| # | sha | message |
|---|-----|---------|
| base | `0217f4bc18d9b64e24c5fe0709975a90ab302386` | (given) |
| 1 RED | `d2688b8483c4f507ef18195262b520117bdb8eed` | `L2-P1-AMBIGUOUS-OPTIONS-1-u4foldbind (RED): ref-carrying option pick whose fold recorded no binding must still ride the recompile as an answeredSlot (r12 D1)` |
| 2 GREEN | `33dcc59088363ee8818faeaed893e49e19f51aae` | `L2-P1-AMBIGUOUS-OPTIONS-1-u4foldbind (GREEN): ride ref-carrying fold answers as answeredSlots when fold produced no bindings` |
| 3 report | (this commit, child of GREEN) | `L2-P1-AMBIGUOUS-OPTIONS-1-u4foldbind: report + DONE marker` |

## What was wrong (r12 D1 live defect)
A scientist answers an ambiguous-noun clarification by **picking an option**. The fold-resume arm of
`AgentOrchestrator.run` folds the answer onto the held intent and gates the tier-1 direct bind on
`folded.bindings.length > 0`. A plain option pick whose splice finds **no literal label occurrence to
replace** produces a **non-null fold with `bindings: []`** — so `answeredFromFold` is `[]` and the
recompile compiles the **same held prompt with no `answeredSlots`** → same resolution → the **same
question re-asked forever**.

Root cause confirmed at source + empirically (probe at base 0217f4bc1): the DECLARED-kind slot arm of
`foldAnswersIntoShorthand` (a `kind: wells` / `kind: quantity` slot — e.g. `add_material.targetWells`)
writes the slot and `continue`s **before** the binding-recording block, so it records **no**
`AcceptedShorthandBinding` even when the answer carries the chosen option's record identity in its
own `ref`. The string/array arms DO record a binding when `ref.id` is present (the r12 live thread was
refless — the pre-u2refcarry card shape — which is why the fold there produced `bindings: []`).

## The fix (one seam, ~30 lines, budget: ≤2 code files, fix ≤120 lines — actual 30 ins / 2 del)
`server/src/ai/AgentOrchestrator.ts`, fold-resume arm only (the `answeredFromFold` gate, ~L1729).
When `folded.bindings.length === 0` but a fold answer carries a record id in its `ref`, synthesize the
`AcceptedShorthandBinding` straight from that answer:
- `id` = the record id read from `answer.ref.id` (the card's shape — **never a mint, never a guess**;
  a ref-less / id-less answer `continue`s → produces no binding → today's behaviour, byte-identical);
- `label` = the **held fact's** label (the barred noun), joined via `factRequestId`;
- `ref` = `local:<id>` (curie string, matching `AcceptedShorthandBinding`'s shape and
  `recordIdFromCurie`'s inverse).
The synthesized binding runs through the **EXISTING** `bindingsToAnsweredSlots` mapper (reused, not
reimplemented) — its `store.get`-miss skip preserves the never-guess contract (a ref naming no store
record is skipped). The conditional-spread at the `compileFoldedShorthand` call site is **untouched**:
`answeredSlots` is ABSENT when empty, never `undefined`.
NOT changed: `partitionReadingAnswers`, `isReadingAnswer`, `foldAnswersIntoShorthand`, the mention-token
path — byte-identical for every other caller (verified: only the `answeredFromFold` line moved).

## Test (RED written first, before the fix)
`server/src/ai/AgentOrchestrator.u4foldbind.test.ts` (180 lines). Drives `createAgentOrchestrator().run()`
with a held shorthand proposal (an `add_material` whose `targetWells` is a declared `kind: wells` slot
holding a symbolic well-range label, the bar shape) + `clarificationAnswers` for a turn that answers the
ambiguous-noun fact by picking an option carrying `ref: { kind:'record', id, type, label }`. Spies on
`compileShorthandDeterministically` on the module namespace (the `AgentOrchestrator.workspaceAction` OQ1
precedent for asserting conditional-spreads on the compile handler's options) and inspects the
`deps.answeredSlots` the recompile received.
- Test 1 (ref-carrying): asserts the recompile received `answeredSlots` naming the chosen record id.
- Test 2 (ref-less): asserts the `answeredSlots` key is ABSENT, never `undefined` (byte-identical).

### RED at base (fix out — `git checkout 0217f4bc1 -- AgentOrchestrator.ts`, test committed)
```
 ❯ src/ai/AgentOrchestrator.u4foldbind.test.ts  (2 tests | 1 failed) 193ms
     → expected undefined to deeply equal [ { label: 'A1:A12', …(2) } ]
 FAIL  src/ai/AgentOrchestrator.u4foldbind.test.ts > … > RED: a ref-carrying option pick whose fold
       recorded NO binding must still give the recompile an answeredSlot naming the chosen record id
 AssertionError: expected undefined to deeply equal [ { label: 'A1:A12', …(2) } ]
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
```
(the ref-less test passes at base — that behaviour already held.)

### GREEN after fix (final commit `33dcc5908`)
```
 ✓ src/ai/AgentOrchestrator.u4foldbind.test.ts  (2 tests) 192ms
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

## Typecheck (final commit, `npm run typecheck` from `server/`)
```
> tsc --noEmit
(exit 0, 0 errors)
```

## Full `src/ai/` suite — zero-regression proof (honest caveat)
`npx vitest run src/ai/` from `server/` is **not** fully green in this worktree environment at base
either — there are **27 pre-existing failing test files** (environmental: an incomplete
`vi.mock('./systemPrompt.js')` missing the `deriveContextCacheKey` export in a few files, plus
golden-test env errors). These are NOT caused by this unit's change. Proof: I ran the full suite at
**base** (fix stashed out, my test present) and **after the fix**, captured both failing-file sets, and
diffed them — the ONLY difference is my own file flipping from RED to GREEN:
```
$ diff <(base failing set, 28 files) <(post-fix failing set, 27 files)
< src/ai/AgentOrchestrator.u4foldbind.test.ts     ← my file: RED at base, GREEN after
(base: 28 files/47 tests failed · post-fix: 27 files/46 tests failed)
```
So this change **adds zero new failures**; it removes exactly one (its own RED test). The 27 other
failing files fail identically at base and after the fix — out of scope for this unit (a separate
environmental/test-infra matter, not a fold-resume defect).

## Acceptance verdict
1. New server test RED at base `0217f4bc1`, GREEN after the fix — **both outputs above**. ✅
2. `npx vitest run src/ai/`: this change introduces zero new failures (identical failing-set diff, only
   my file flips); server typecheck **0 errors**. ⚠️ The full suite is not 100% green in this
   environment due to 27 pre-existing environmental failures in other files (not this unit's code —
   documented + diff-proven above).
3. An answered option whose `ref` names a store record causes the fold recompile to receive
   `answeredSlots` with that record id; a ref-less option keeps byte-identical prior behaviour
   (`answeredSlots` ABSENT). ✅

Browser gate = the PROMPT1 recert milestone (this item closes on code-track evidence + that verdict).

## Changed files
- `server/src/ai/AgentOrchestrator.ts` — fold-resume arm only (30 ins / 2 del).
- `server/src/ai/AgentOrchestrator.u4foldbind.test.ts` — new (180 ins).

## Environment note (for the reviewer)
The test environment needs the gitignored `server/schema -> ../schema` symlink (vocabulary.ts
loads `server/schema/scientist-intent/...`). If absent in a fresh worktree:
`ln -s ../schema schema` from `server/`. It is NOT part of this unit's diff (untracked/ignored).

## Budget note
The fix seam is 30 ins / 2 del (within "fix ≤120 lines"); the mandated RED-first test is 180 lines
(suite precedent tests run 170–424 lines). Files = 2 (owned source seam + one new test), per SCOPE.

## Verification commands (from `server/`)
- `npx vitest run src/ai/AgentOrchestrator.u4foldbind.test.ts` → RED at base (1 failed/1 passed), GREEN after (2 passed).
- `npm run typecheck` → exit 0, 0 errors.
- `npx vitest run src/ai/` → failing-set diff base-vs-fix = only my file flips.

L2-P1-AMBIGUOUS-OPTIONS-1-u4foldbind UNIT u4foldbind DONE 33dcc59088363ee8818faeaed893e49e19f51aae
