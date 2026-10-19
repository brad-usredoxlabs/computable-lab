# PARAM-FOLD-2 — coder fix run report (lane 2, l2t0450)

Campaign: ai-protocol-edit-and-router. Follow-on to PARAM-FOLD-1.
Spec executed verbatim: `.hermes/plans/decisions/W28-A5k-raw-unresolved-gaps-channel-decision.md`
(Q1 ruling, Q3 companion flip, "PARAM-FOLD-2 — the fix run's exact surface").
Guards 1-5 reused unchanged from `W28-A5j-param-hedge-declared-optionality-decision.md`.

Worktree: /mnt/vast/home/brad/git/wt/PARAM-FOLD-1-lane2-l2t0135
Branch: feat/PARAM-FOLD-1-lane2-l2t0135
Base (pre-fix head): 9b435d91 (FOLD-1 report commit; fold commit b3642836 beneath it)
Fix commit: **82b6582f** — `feat(PF2): PARAM-FOLD-2 gaps-channel fold at the raw source (W28-A5k)`
All git via `git -c core.fileMode=false`.

## 0. What was executed (A5k, verbatim)

1. EXTRACT `foldDeclaredOptionalAbsentHedges` + `NOT_STATED_REASON` from
   `resolveNounsPass.ts` into the new leaf `server/src/compiler/resolution/declaredOptionalHedgeFold.ts`
   (bodies moved verbatim; private `argumentPresent` copy per the ruling's "private copy or
   shared-helper import — smallest diff"; the leaf value-imports NOTHING — only type imports from
   `scientistIntent/`; it does NOT import the pass module).
2. `resolveNounsPass.ts`: moved bodies deleted, both names re-exported unchanged
   (`export { foldDeclaredOptionalAbsentHedges, NOT_STATED_REASON } from './declaredOptionalHedgeFold.js'`),
   the pass's call site now resolves via the import. NO behavior change.
3. `normalizeScientistIntent.ts`: ONE fold call over `intent.unresolved` at the top of the
   unresolved handling; the folded array feeds BOTH raw consumers — the `unresolvedRefs` loop
   (was :845) and the `protocolIntent.unresolved` map (was :872). Nothing else in the file changed.
4. `hedgeOptionality.test.ts`: the Q3 FLIP of the ONE companion test; the other 14 tests byte-untouched.

## 1. Scope diff (gate check, verified-by 5)

`git -c core.fileMode=false diff --name-only 9b435d91` (code commit 82b6582f):

```
server/src/compiler/resolution/declaredOptionalHedgeFold.ts
server/src/compiler/resolution/resolveNounsPass.ts
server/src/compiler/scientistIntent/hedgeOptionality.test.ts
server/src/compiler/scientistIntent/normalizeScientistIntent.ts
```

Exactly the four authorized files. intentCompile.ts, the mirror yaml, gatherGaps/computeOutcome,
resolutionEngine, shorthandChat, app/, schema/, fixtures, the answers map: untouched. The throwaway
probe file (`pf2Probe.test.ts`) was deleted before commit; `git status --short` clean after the
receipts commit.

## 2. RED-first (verified-by 1, at the pre-fix head)

The flipped companion test serves as the RED pin AND the flip. With the flip applied but the
normalize fold stashed away (`git stash push -- normalizeScientistIntent.ts` at the pre-fix head):

```
 ❯ src/compiler/scientistIntent/hedgeOptionality.test.ts  (15 tests | 1 failed) 66ms
   ❯ ... > PARAM-FOLD-2 convergence: a not-stated hedge on an absent declared-optional yields the data-compliant outcome — no clarification, no gap, complete
     → expected 'gap' to be 'complete' // Object.is equality
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
```

Receipt: `.hermes/plans/receipts-paramfold2/pf2-red-flipped-at-prefix-head.raw`. This is the ghost
receipt's verbatim-shape landing on `gap` at the pre-fix head — the exact V1 RED.

## 3. V1 compile-level GREEN (ghost receipt verbatim-shape)

Flipped companion at head (same fake-LLM shape as `pf1-ghost.raw`: hedge
`{label:'duration', reason:'not-stated', actionLocation:{actionIndex:0, action:'bead_beat', argument:'duration'}}`
on a bead_beat action omitting it):

```
 ✓ src/compiler/scientistIntent/hedgeOptionality.test.ts  (15 tests) 109ms
 Test Files  1 passed (1)
      Tests  15 passed (15)
```

Assertions (all green): `outcome === 'complete'`, `clarifications []`, `terminalArtifacts.gaps []`
with NO `unresolved_ref` carrying that label, `normalized.unresolvedRefs []`,
`protocolIntent.unresolved` carries no such entry, events still expand (`mix` present).
Receipts: `pf2-green-companion.raw`, `pf2-probe.raw` (probe V1 leg prints the full JSON summary:
`outcome complete, clarifications [], gaps [], unresolvedRefs [], protocolIntentUnresolved [],
eventTypes ["mix"]`).

## 4. CHANNEL-ALIVE pin (verified-by 2)

Throwaway probe (fake-LLM, deterministic), receipts `pf2-probe.raw`:

- Slot-less `not-stated` fact (no actionLocation), label = the labware the engine BINDS
  (guard 1 KEEP -> reconcile DROP -> gaps channel): `outcome 'gap'`, an `unresolved_ref` gap
  carrying it, `normalized.unresolvedRefs` carries it, `protocolIntentUnresolved` carries it.
  The channel KEEPS WORKING for kept classes.
- Slot-less `not-stated` fact the engine cannot bind: bars (`needs-clarification`), held out of
  `complete`, still rides `unresolvedRefs`.
- `ambiguous` slot-located hedge (guard 5 KEEP): `outcome 'gap'`, `unresolved_ref` gap present,
  `unresolvedRefs` + `protocolIntentUnresolved` carry it.

Probe: `Test Files 1 passed (1) / Tests 5 passed (5)`.

## 5. Idempotence pin (verified-by 3)

Probe leg: fold applied twice over the same set == applied once
(`fold(fold(set)) deep-equals fold(set)`); the kept survivors (`['the incubation time','cycles']`)
survive both applications; re-folding normalize's already-folded `unresolvedRefs` through the same
function is a no-op; and `viaPassReExport === foldDeclaredOptionalAbsentHedges` — the pass module
re-exports the SAME function object, so the compile path's double application (normalize + pass)
is provably the same pure filter, idempotent by construction.

## 6. Re-export integrity (verified-by 4)

- `resolveNounsPass.paramFold.test.ts` byte-unchanged: `git diff 9b435d91 -- ...paramFold.test.ts`
  = 0 lines. It imports neither moved name directly (verified by grep: the only repo-wide
  importers of `foldDeclaredOptionalAbsentHedges`/`NOT_STATED_REASON` are resolveNounsPass.ts
  itself and the new leaf), and it passes UNEDITED.
- Scoped green run (paramFold + goldenIntentToGraph + goldenIntentToClarification +
  promptShapeParity): `Test Files 4 passed (4) / Tests 26 passed (26)` (`pf2-targeted.raw`).
- Wider sweep (all of `src/compiler/resolution/`, `src/compiler/scientistIntent/`,
  ProtocolIntentLoweringCharacterization, ResolveRolesSpine7Regression):
  `Test Files 36 passed (36) / Tests 398 passed (398)` (`pf2-resolution-scientistintent.raw`).
- Golden re-run explicit: goldenIntentToGraph 3/3, goldenIntentToClarification 6/6 green — no
  golden holds a folded-class fact (grep over goldens for `not-stated`: zero hits). No new named
  fact surfaced.
- `hedgeOptionality` alone 15/15 at head (section 3).

## 7. Typecheck (verified-by 6)

- Base 9b435d91: `npm run typecheck -w server` -> exit 0, zero errors (`pf2-base-tsc.raw`).
- Head 82b6582f: same command -> exit 0, zero errors (`pf2-head-tsc.raw`).
- Comm-delta: EMPTY (0 vs 0).

## 8. Full-suite delta (verified-by 7)

Base 9b435d91 (`pf2-base-suite.raw`): `Test Files 90 failed | 671 passed | 9 skipped (770)`,
`Errors 2 errors`.
Head 82b6582f (`pf2-head-suite.raw`): `Test Files 88 failed | 673 passed | 9 skipped (770)`,
`Tests 99 failed | 6324 passed | 70 skipped (6666)`, `Errors 2 errors` (pre-existing
unhandled-error debt, identical count base vs head).

Fail-file comm (sorted FAIL-file lists, `pf2-base-failfiles.txt` 90 vs `pf2-head-failfiles.txt` 88):

```
BASE-ONLY: src/compiler/scientistIntent/hedgeOptionality.test.ts   <- the flipped companion going GREEN (the authorized delta)
BASE-ONLY: src/ai/shorthandContractDisclosure.test.ts              <- load-time flap, NOT my diff
```

HEAD-ONLY: (empty). No new failures.

The shorthand flap: at base it failed as a suite-LOAD error — `ENOENT ...
schema/registry/prompt-templates/test-vars.yaml` in RegistryLoader.ts:177 (a registry file list
naming an untracked file; `git ls-files` confirms the file is not in the repo). My diff touches no
registry/loader/schema file. Standalone re-run at head: `✓ 13 tests, Test Files 1 passed` — the
known load-time flap class, proven unrelated.

## 9. Zero new domain literals (verified-by 5, grep discipline)

- `grep -nE "bead_beat|duration|temperatureC|cycles"` over the leaf module and resolveNounsPass.ts:
  ZERO hits.
- Over normalizeScientistIntent.ts: only PRE-EXISTING lines (:524, :556, :602-604 — the file's own
  long-standing param plumbing). Proof of zero NEW literals: `git diff 9b435d91 -- <the two source
  files> | grep "^+" | grep -E "bead_beat|duration|temperatureC|cycles"` -> exit 1 (no matches).
  normalize gains a function call, zero literals.
- hedgeOptionality.test.ts added lines: zero `bead_beat|temperatureC|cycles` additions; the
  `duration` hedge literal is the ghost receipt's verbatim shape (the test's pre-existing fixture
  block, unchanged from the companion's original body).

## 10. Assumptions recorded

- AS-PF2-1: the leaf's `argumentPresent` is a private copy (the ruling's explicitly offered
  smallest-diff option) rather than extracting a shared helper — avoids touching the §5.2 sweep's
  own helper and keeps the leaf acyclic with zero value imports.
- AS-PF2-2: the fold call in normalize sits after `loadMixtureCues` (top of the unresolved
  handling, before the actions loop) — one call, both consumers read `foldedUnresolved`.
- AS-PF2-3: the companion's flip keeps the same fake-LLM harness and hedge shape verbatim from
  the ghost receipt; only the assertions flip per A5k Q3's stated end-state.
- AS-PF2-4: the shorthandContractDisclosure base fail is the known load-time flap class (ENOENT on
  an untracked registry file); proven by standalone pass at head + zero diff overlap.

## 11. Notes for the orchestrator

- The transient companion red A5k Q4 anticipated is RESOLVED at this tip: the companion is green
  at 82b6582f; FOLD-1+FOLD-2 can merge as one stack with zero-new-failures measured at the
  combined tip (comm-delta here: companion green + one flap, section 8).
- Probe r4 is now unblocked: ARM A (>=1 `complete` draw) is reachable — the hedged emission
  converges on `complete` at both channels (section 3).
- No new named fact surfaced: goldens green, re-exports green, scope clean.

PARAM-FOLD-2 DONE 82b6582f
