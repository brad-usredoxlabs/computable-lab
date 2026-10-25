# W28-STAGHEDGE-1 — MODEL-HEDGE LABEL-DIVERGENCE consume rule (server-only)

LANE 2. Authority: architect ruling `.hermes/plans/decisions/W28-A5m-answer-loop-stagnant-labware-class-decision.md` (trunk a1dea08a, terminator 'W28-A5m DECIDED'). Read it FULLY before coding — its §Q2 ruled fix is this task, verbatim.

## Scope (LOCKED by ruling — do not widen)

ONE module: `server/src/compiler/resolution/resolveNounsPass.ts` (+ a NEW sibling test). Server-only. ZERO changes to: IntentCompileFromPromptHandlers.ts, composeAnsweredPrompt, validateAnsweredSlots, the 422 envelope, declaredOptionalHedgeFold.ts (the fold leaf), resolutionEngine.ts, ANY app file, ANY YAML. Zero new reason codes. Zero verb/argument/kind NAME literals — identity + declared contract data (`argContracts`) + the two stable codes (`NOT_STATED_REASON`, `MISSING_REQUIRED_ARGUMENT_REASON`) only.

## The defect (from the ruling, orch-corroborated)

A model-side not-stated fact whose `label` != its slot's raw value can never bind via the `:313` value-join (`answerByKey.get(raw.trim())`), so no binding exists, `boundKeys` never covers its identityKey, and every drop arm misses it — the card re-emits every round (probe r5 arm B stagnation).

## The ruled fix (A5m §Q2 option (b), verbatim constraints)

In the pass, BEFORE `reconcileModelUnresolved` consumes the model facts (mirror the PARAM-FOLD's position — the fold already runs there; apply the consume to the folded model facts so a folded fact never re-enters), drop a model-side unresolved fact when ALL:
1. it carries slot identity (`actionLocation.actionIndex` + `argument` — same guard shape as the fold's guard 1 / SH-QA-1 gate);
2. its slot is a declared `kind: resolvable` arg-contract of its verb (same read as `answeredSlotBindings` :306-308) — scalar cards untouched;
3. its `reason` is the stable `NOT_STATED_REASON` (ambiguous/contradicts stay kept, same as fold guard 5);
4. the answers input contains an entry whose KEY EQUALS the fact's label (exact-label identity, never containment — same discipline as :313) — i.e. the fact's label matches a `deps.answeredSlots` entry (store-validated mention already).

This defuses sub-class 2a for free: one label-answered mention consumes EVERY fact carrying that label at a resolvable slot (the ':293-295 the scientist answered the MENTION' generalization, already the file's own comment).

The rule DROPS THE QUESTION ONLY: the slot keeps its raw value; the `:313` value-join and `answeredSlotBindings` stay byte-unchanged for everything they already settle. Engine clarifications, the §5.2 sweep (`MISSING_REQUIRED_ARGUMENT_REASON`), gated survivors, and the fold leaf stay untouched BY CONSTRUCTION.

## RED-first tests (new file `resolveNounsPass.stagnantHedge.test.ts`)

Harness: mirror `resolveNounsPass.answeredNouns.test.ts` (spineReturning / shippedVocab / stub engine idiom). Cases:
- SH1 (RED today): model fact `{label: 'variant b', reason: 'not-stated', actionLocation: {actionIndex 2, bead_beat, labware}}` while slot a2.labware's raw value is DIFFERENT ('microcentrifuge tube' style); answers input has entry keyed 'variant b' (validated AnsweredNounAnswer) -> today re-bars; after fix: consumed, ok:true (assuming no other survivors), NO binding invented for a2.labware beyond what :313 already gives (deep-check bindings list).
- SH2 label collision: TWO not-stated facts share label 'variant b' at two resolvable slots, one answer keyed 'variant b' -> BOTH consumed.
- SH3 negative: label matches an answer key but the slot contract kind is scalar (`duration`) -> fact KEPT (no mint-floor widening).
- SH4 negative: fact reason `ambiguous-noun`-class (NOT the not-stated code) with matching label key but no binding -> KEPT (guard 3).
- SH5 negative: label key present in answers but NOT in deps.answeredSlots (unvalidated) -> KEPT.
- SH6 negative: fact WITHOUT actionLocation -> KEPT (guard 1).
- SH7 pin: engine clarification for the same slot is untouched (engine facts never consumed by this rule); required-sweep fact never consumed.
- SH8 regression pin: the answeredNouns existing suite stays byte-green (value-join arm unchanged).

## Verification (run and paste real output)

- `npx vitest run src/compiler/resolution/` (server workspace) — ALL green incl. new file.
- `npm run typecheck -w server` — trunk baseline is CLEAN (0 errors as of 2026-10-19; the '33 error lines' era is stale).
- No app tests required (no app files touched).

## Env facts

Worktree: /mnt/vast/home/brad/git/wt/W28-STAGHEDGE-1-lane2 (branch W28-STAGHEDGE-1-lane2, off trunk a1dea08a). NFS: use `git -c core.fileMode=false`. Commit your work (feat + test) on the branch. Report to your assigned UNIQUE path, ending 'STAGHEDGE1 IMPLEMENTED'.
