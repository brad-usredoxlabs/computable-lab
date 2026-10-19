# PARAM-FOLD-1 coder report — lane 2, l2t0135 (W28-A5j declared-optional-absence fold)

Branch feat/PARAM-FOLD-1-lane2-l2t0135 @ b3642836a80fcb6654da77e48c689602a71a483f
Worktree /mnt/vast/home/brad/git/wt/PARAM-FOLD-1-lane2-l2t0135
Base (trunk tip at boot): a400978698fdfc604251937a2176e230f2a49a0e (contains 8b2c973a — verified:
`git -c core.fileMode=false merge-base --is-ancestor 8b2c973a HEAD` -> ANCESTOR OK)

## VERDICT

**BLOCKED at the mandatory V6 downstream-consumer check.** The fold is implemented, RED-first
proven, GREEN, scoped to exactly the two authorized files, with zero-new suite/typecheck deltas —
but V6 found a SECOND surface that renders RAW parsed `intent.unresolved` entries: the gaps channel
(`normalizeScientistIntent.unresolvedRefs` -> `gatherGaps` -> `terminalArtifacts.gaps`), which the
localization thread's 2xx branch and the chat surfaces render. Post-fold, a folded fact GHOSTS
there as an `unresolved_ref` gap and the compile lands on outcome `gap`, not `complete` — so the
fold as specified does NOT clear the probe wall. A second fold point is NOT pre-authorized
(spec: "if any surface renders RAW parsed intent.unresolved ... end BLOCKED naming it"). Full
evidence below; the blocked portion names what is complete, what blocks, and the resume condition.

## 0. Boot / worktree bootstrap (commands + facts)

```
cd /mnt/vast/home/brad/git/cl-integration-2 && git -c core.fileMode=false log --oneline -3
a4009786 docs(lane2): l2t0210 handoff — GAPCARD-1 code committed (e1ad8009) ...
git -c core.fileMode=false merge-base --is-ancestor 8b2c973a HEAD  -> ANCESTOR OK 8b2c973a
git -c core.fileMode=false worktree add -b feat/PARAM-FOLD-1-lane2-l2t0135 \
  /mnt/vast/home/brad/git/wt/PARAM-FOLD-1-lane2-l2t0135 a400978698fdfc604251937a2176e230f2a49a0e
```
Bootstrap per the lane-2 recipe (cl-lane-sync mechanism replicated manually; the script was NEVER
run against trunk): root/app/server `node_modules` -> cl-integration-2's symlinks (package-lock
sha256 verified identical: 6068d633380e9bc0df714fb7f4ec52762d325544fb19e217d056996d8dcaae96 both),
`server/schema -> ../schema` (worktree's own), the 3 lane-excluded schema regular files COPIED
(revision-ref.schema.yaml, 80x2ml-tube-rack.yaml, tube-size-presets.v1.yaml), all 43 lane-excluded
server/src untracked symlinks replicated, per-worktree core.excludesFile set to
/home/brad/.hermes/cl/lanes/2/lane-exclude-a6fix-l2t0430. The poisoned 124-line
LifecycleBypassAudit.test.ts link was replaced with the healthy 184-line copy
(wt/editor-2-lane1-20261004T030515). `git status --short` clean apart from the two owned files.

## 1. THE FOLD (product diff, resolveNounsPass.ts only)

- `export const NOT_STATED_REASON = 'not-stated' as const` added beside
  `MISSING_REQUIRED_ARGUMENT_REASON` (the :47-49 stable-code precedent).
- `export function foldDeclaredOptionalAbsentHedges(intent, vocabulary, modelFacts)` — pure
  filter implementing guards 1-5 EXACTLY as W28-A5j rules them: (1) `actionLocation.actionIndex
  !== undefined && typeof actionLocation.argument === 'string'`; (2) `vocabulary.argContracts(
  actionLocation.action)` contains `c.name === actionLocation.argument` (no contract / no verb ->
  KEEP); (3) `c.required !== true`; (4) `!argumentPresent(fields[c.name])` on the parsed action at
  `actionLocation.actionIndex` (reuses the sweep's own helper); (5) `fact.reason ===
  NOT_STATED_REASON`. Every non-guard path returns KEEP.
- Applied at the reconcile call site (the decision's "filter immediately after
  reconcileModelUnresolved returning model-kept facts — smallest diff" option, applied to the
  model input): `reconcileModelUnresolved(foldDeclaredOptionalAbsentHedges(deps.intent,
  deps.vocabulary, deps.intent.unresolved), ...)` — folded facts never enter `clarifications`
  (:418) hence never `blocked` (:435). reconcile's DROP/MERGE/KEEP arms, the §5.2 sweep,
  `answeredSlotBindings`, the gate, and gated survivors are UNTOUCHED. Engine facts and gated
  survivors are untouched BY CONSTRUCTION — the fold reads only model facts against declared
  contract data + the parsed action, never identity-matched against engine clarifications.
- ZERO domain literals: `grep -in 'bead_beat|duration|cycles|temperatureC'` over BOTH owned files
  -> no matches (exit 1). Tests pin via vocabulary `argContracts` data (required!==false entries
  iterated from `vocab.verbs()`/`argContracts`; the fold stage verb, its three optional args, the
  required stage verb/arg are all READ from the shipped vocabulary).

## 2. V1 RED-first (CODER-CAPTURED: .hermes/plans/receipts-paramfold1/pf1-red.raw)

Command: `cd server && npx vitest run src/compiler/resolution/resolveNounsPass.paramFold.test.ts`
against the UNMODIFIED base product file. The four fold-dependent pins fail at base:

```
FAIL  src/compiler/resolution/resolveNounsPass.paramFold.test.ts > param-fold-1.declared-optional-absence fold (resolve_nouns) > V1 RED pin (probe shape): three not-stated hedges on three ABSENT declared-optional args of one action are folded — zero clarifications from them, blocked:false
FAIL  src/compiler/resolution/resolveNounsPass.paramFold.test.ts > param-fold-1.declared-optional-absence fold (resolve_nouns) > V2a KEEP guard (4): a not-stated hedge whose argument is PRESENT in the action is KEPT (the fold never hides a stated value)
FAIL  src/compiler/resolution/resolveNounsPass.paramFold.test.ts > param-fold-1.declared-optional-absence fold (resolve_nouns) > V2f two-class separation: an ABSENT declared-optional RESOLVABLE hedge is FOLDED; a PRESENT declared-optional resolvable (the SAMPLE-CARD-1 class) is KEPT
FAIL  src/compiler/resolution/resolveNounsPass.paramFold.test.ts > param-fold-1.declared-optional-absence fold (resolve_nouns) > V3 characterization: an engine clarification and a gated survivor ride the pass byte-identically with the fold installed (order kept, folded facts absent)
```

```
 Test Files  1 failed (1)
      Tests  4 failed | 4 passed (8)
   Start at  03:08:32
   Duration  3.48s (transform 350ms, setup 0ms, collect 1.22s, tests 19ms, environment 0ms, prepare 390ms)
```

The 4 passing at base are the KEEP arms (V2b/V2c/V2d/V2e) — they pin behavior the fold must NOT
change, so their base-pass is the characterization guarantee, and the V1/V2a/V2f/V3 REDs name the
fold's symptom (foldable hedges survive into `clarifications` at base).

## 3. GREEN (CODER-CAPTURED: pf1-green3.raw)

```
 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  03:39:02
   Duration  3.42s (transform 274ms, setup 0ms, collect 1.23s, tests 7ms, environment 0ms, prepare 443ms)
```

## 4. V2 KEEP-arm guards — each its own test (all in the new file, all GREEN)

V2a present-param KEPT; V2b `ambiguous` on absent optional KEPT; V2c no-actionLocation KEPT;
V2d actionLocation naming an undeclared argument KEPT; V2e the declared-required sweep fact NEVER
folded (plus a clean guard-3 leg: a not-stated hedge on a PRESENT required arg is KEPT — the fold
never touches a required contract); V2f absent required:false RESOLVABLE FOLDED + present
required:false resolvable (SAMPLE-CARD-1 class) KEPT. All argument/verb names come from
vocabulary data. GREEN evidence = section 3 (8/8).

## 5. V3 characterization (pf1-green2.raw — existing suites green, order kept)

The new V3 test pins an engine clarification + a gated survivor riding the pass byte-identically
with the fold installed (engine fact first, gated survivor last, foldable model facts gone).
Existing pass/golden/registration suites re-run green with the fold:

```
 ✓ src/compiler/resolution/resolveNounsPass.answeredNouns.test.ts  (8 tests) 102ms
 ✓ src/compiler/resolution/resolveNounsPass.paramFold.test.ts  (8 tests) 7ms
 ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (8 tests) 34ms
 ✓ src/compiler/resolution/spine4ProductionWiring.test.ts  (4 tests) 71ms

```

```
 Test Files  9 passed (9)
      Tests  88 passed (88)
   Start at  03:35:39
   Duration  2.72s (transform 1.44s, setup 0ms, collect 12.10s, tests 1.50s, environment 2ms, prepare 4.00s)
```

(9 files: paramFold, resolveNounsPass, answeredNouns, hedgeOptionality*, promptShapeParity,
vocabularyMirrorDrift, goldenIntentToClarification, goldenIntentToGraph, spine4ProductionWiring,
spine4Registration — hedgeOptionality's companion test is the named exception, section 7.)

## 6. V4 no-prompt-change pin

`git -c core.fileMode=false diff a4009786..HEAD --name-only -- server/src/compiler/
scientistIntent/intentCompile.ts schema/registry/prompt-templates/intent.compile.system.yaml
server/src/compiler/resolution/resolutionEngine.ts app/ schema/ server/src/compiler/
scientistIntent/goldens/` -> EMPTY. promptShapeParity (9 tests) and vocabularyMirrorDrift (8
tests) GREEN in the section-5 run; hedgeOptionality's 14 prompt/mirror pins GREEN (the 15th test
is the fold-collided characterization, section 7).

## 7. V5 suite + typecheck baselines (CODER-CAPTURED: pf1-base-suite.raw / pf1-head-suite.raw / pf1-base-tsc.raw / pf1-head-tsc.raw)

`npm run test:run -w server` BASE (same worktree, before any edit):

```
 Test Files  88 failed | 672 passed | 9 skipped (769)
      Tests  99 failed | 6316 passed | 70 skipped (6658)
     Errors  2 errors
   Start at  02:47:05
   Duration  270.67s (transform 114.71s, setup 333ms, collect 1588.34s, tests 2057.55s, environment 1.14s, prepare 547.63s)
```

HEAD (after the fold):

```
 Test Files  90 failed | 671 passed | 9 skipped (770)
      Tests  101 failed | 6322 passed | 70 skipped (6666)
     Errors  2 errors
   Start at  03:20:56
   Duration  268.92s (transform 94.78s, setup 465ms, collect 1563.91s, tests 2058.68s, environment 1.33s, prepare 518.03s)
```

Fail-file sets extracted with the identical rule from BOTH raws
(`grep -E '^ FAIL ' | sed -E 's/^ FAIL +//; s/ >.*$//; s/ \[.*\]$//; s/ +$//' | sort -u`;
cross-checked against the `❯`-line rule — both rules give identical sets on both raws):
BASE 88 files, HEAD 90 files. `comm -3 base head` (pf1-base-failfiles.txt vs pf1-head-failfiles.txt):

```
	src/compiler/scientistIntent/hedgeOptionality.test.ts
	src/sequences/sequenceIntent.test.ts
```

NEITHER is a new failure class:

1. **hedgeOptionality.test.ts** — head-only because its companion characterization test now
   collides with the fold (the named V6 finding, section 8). Standalone at head:

```
 FAIL  src/compiler/scientistIntent/hedgeOptionality.test.ts > hedge-type-1 acceptance (a): declared-optional absence compiles complete (fake LLM) > companion characterization: the SAME shape WITH a hedge bars — the hedge, not the engine, manufactures the wall
AssertionError: expected 0 to be greater than 0
 ❯ src/compiler/scientistIntent/hedgeOptionality.test.ts:280:43
```

```
 Test Files  1 failed (1)
      Tests  1 failed | 14 passed (15)
   Start at  03:26:43
   Duration  1.32s (transform 425ms, setup 0ms, collect 680ms, tests 101ms, environment 0ms, prepare 52ms)
```

   At base it passes (it is in neither base fail-file set; the base run collected 769 files, head
   770 — the +1 is my new paramFold file, which PASSES in the head run: `✓ src/compiler/
   resolution/resolveNounsPass.paramFold.test.ts  (8 tests) 121ms`).

2. **sequenceIntent.test.ts** — a load-timeout flap, not a fold failure. Standalone at head:

```
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Start at  03:25:52
   Duration  4.68s (transform 1.20s, setup 0ms, collect 1.69s, tests 1.19s, environment 0ms, prepare 199ms)
```

   In the head loaded run its failure reason is `Test timed out in 10000ms` (the base loaded run
   carries 8 identical timeout artifacts on other files; the skill-documented NFS load-flap class).

Typecheck: `npm run typecheck -w server` BASE `grep -c 'error TS'` = 0, HEAD = 0 — error sets
comm-empty (both raws `EXIT=0`). (The spec's "33-line trunk baseline" does not match this
worktree's measured baseline of 0; measured base-vs-head in the SAME worktree is the proof.)

## 8. V6 DOWNSTREAM-CONSUMER CHECK — THE BLOCKING FINDING (mandatory, FAILED)

Named surfaces and what each reads:

- 422/needs-clarification payload: `server/src/api/handlers/IntentCompileFromPromptHandlers.ts`
  :468-478 sends `clarifications: compile.clarifications`; the compile's bar arm
  (`server/src/compiler/scientistIntent/compileScientistIntent.ts` :298-316) sources them from the
  resolve_nouns bar diagnostic `details.clarifications` — the PASS's clarifications. CLEAN.
- Localization-thread cards: `app/src/event-editor/right-pane/protocol/
  ProtocolLocalizationThread.tsx` :352/:362 render `held.clarifications` (the 422 bundle). CLEAN.
- **RAW-unresolved surfaces (the defect):** `server/src/compiler/scientistIntent/
  normalizeScientistIntent.ts` :845 (`for (const fact of intent.unresolved)` -> `unresolvedRefs`
  kind `unresolved_symbol`) and :872 (`protocolIntent.unresolved`), consumed by `gatherGaps`
  (compileScientistIntent.ts :206-214) -> `terminalArtifacts.gaps`, which renders on:
  - the thread's 2xx branch (`res.localMacro && res.terminalArtifacts` -> `holdForReview` holds
    terminalArtifacts incl. gaps; the 200 'gap' response at IntentCompileFromPromptHandlers.ts
    :504 attaches clarifications additively but the gaps ride terminalArtifacts regardless);
  - `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` :641-646 (`terminal.gaps` -> warnings);
  - `server/src/ai/shorthandChat.ts` :684 (gaps -> `unresolvedRefs` on the AgentResult) ->
    `app/src/shared/hooks/useAiChat.ts` :685 (`result.unresolvedRefs` -> pending cards).

Probe evidence (throwaway harness mirroring hedgeOptionality's fake-LLM compile; receipts
pf1-ghost-base.raw / pf1-ghost.raw; probe file deleted, never committed):

BASE, hedged emission (bars):

```
=== BASE HEDGED emission (bars): {
 "outcome": "needs-clarification",
 "clarifications": [
  {
   "label": "duration",
   "reason": "not-stated",
   "actionLocation": {
    "actionIndex": 0,
    "action": "bead_beat",
    "argument": "duration"
   }
  }
 ],
 "gaps": [],
 "unresolvedRefs": [
  {
   "kind": "unresolved_symbol",
   "label": "duration",
   "reason": "not-stated"
  }
 ]
}
```

HEAD (fold installed), same emission — the fact is GONE from `clarifications` (fold fired
correctly) but GHOSTS as a gap and the outcome is `gap`, not `complete`:

```
=== HEDGED emission (folded class): {
 "outcome": "gap",
 "clarifications": [],
 "gaps": [
  {
   "kind": "unresolved_ref",
   "message": "duration (not-stated)",
   "details": {
    "kind": "unresolved_symbol",
    "label": "duration",
    "reason": "not-stated"
   }
  }
 ],
 "unresolvedRefs": [
  {
   "kind": "unresolved_symbol",
   "label": "duration",
   "reason": "not-stated"
  }
 ],
 "protocolIntentUnresolved": [
  {
   "id": "unresolved-duration",
   "kind": "operation",
   "label": "duration",
   "reason": "not-stated",
   "blocksLowering": false
  }
 ]
}
```

BASE compliant emission: `=== BASE COMPLIANT emission (no unresolved): {
 "outcome": "complete",
 "clarifications": [],
 "gaps": [],
 "unresolvedRefs": []
}` — HEAD compliant emission:
`=== COMPLIANT emission (no unresolved): {
 "outcome": "complete",
 "clarifications": [],
 "gaps": [],
 "unresolvedRefs": [],
 "protocolIntentUnresolved": []
}`.

Consequence: post-fold the probe's 422/needs-clarification wall becomes a 200 `gap` with the same
fact visible through the gaps channel — the gate's arm-A (>=1 `complete` draw) is NOT reachable
without a second fold point in the normalize/gatherGaps channel, which the spec explicitly does
NOT pre-authorize. This also explains the hedgeOptionality companion-test collision: its pinned
characterization ("a kept model hedge is a clarification/gap: outcome is NOT complete") is now
true via the GAPS leg while its `clarifications.length > 0` assertion is folded away — the test
names the exact seam the fold left open.

## 9. Scope diff (gate check)

`git -c core.fileMode=false diff a4009786..HEAD --name-only`:

```
server/src/compiler/resolution/resolveNounsPass.paramFold.test.ts
server/src/compiler/resolution/resolveNounsPass.ts
```

Nothing else. intentCompile.ts, the mirror yaml, resolutionEngine.ts, app/, schema/, the golden
fixture: untouched (section 6's scoped diff is empty). Throwaway probe files were deleted before
commit; `git status --short` clean.

## 10. Assumptions recorded

- AS-PF1-1: fold applied to `deps.intent.unresolved` at the reconcile call site (the decision's
  smallest-diff option; the folded set is computed purely from model facts + declared data).
- AS-PF1-2: guard (2) extended with a KEEP arm when `actionLocation.action` names no verb
  (TS narrowing; consistent with "no contract -> KEEP").
- AS-PF1-3: V2e's model hedge on an ABSENT required arg MERGES into the sweep fact at the pass
  level (existing §5.1 engine-wins behavior, unchanged by the fold) — pinned as exactly one
  clarification; the clean guard-3 pin uses a PRESENT required arg.
- AS-PF1-4: typecheck baseline measured 0 errors in this worktree (not the spec's 33-line pin);
  zero-new proven base-vs-head in the same worktree.

## 11. Resume condition / recommendation for the orchestrator

The fold itself is correct per W28-A5j guards 1-5 and mergeable as the pass-side half IF the
orchestrator rules the gaps-channel question: either (a) a follow-on decision authorizing the
second fold point (normalize's `unresolvedRefs`/`protocolIntent.unresolved` for the same
five-guard class — NOT authorized to me), or (b) ruling the `gap` outcome + gaps-channel
visibility acceptable for the probe (arm A requires `complete`, so (b) fails the gate as written).
The hedgeOptionality companion test must be re-ruled alongside whichever path is chosen (it is a
trunk-owned test file I am not authorized to edit).

PARAM-FOLD-1 BLOCKED V6: the gaps channel (normalizeScientistIntent.ts:845/:872 -> gatherGaps -> terminalArtifacts.gaps, rendered by ProtocolLocalizationThread 2xx branch, AiTabPanel.tsx:641, shorthandChat.ts:684 -> useAiChat.ts:685) renders RAW parsed intent.unresolved; post-fold the fact ghosts there and the compile lands on outcome 'gap' not 'complete' — a second fold point is not pre-authorized.
