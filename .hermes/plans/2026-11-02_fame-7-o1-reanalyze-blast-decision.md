# FAME-7 O1 DECISION — reanalyze blast radius on legacy revisions: ACCEPT the honest 400

Author: architect (read-only; this file is the only write). Date: 2026-11-02.
Lane 1, pre-merge gate. Binding on the FAME-7 merge decision.

Inputs read this session (all first-hand):
- `.hermes/plans/2026-11-02_fame-7-oq1234-decision.md` (the BINDING OQ-3 ruling text, :127-138),
- `/home/brad/.hermes/cl/lanes/1/reviews/FAME7-adv2-l1t0835.md` (observation O1, :176),
- worktree `wt/fame-7-lane1-l1t0445` @ `d0536f07`: `server/src/analysis/declaredInputs.ts`
  (the skip is `declared === undefined`, :240, the ONLY skip), `app/src/analysis/reanalyze.ts`
  (the door gate `reanalyzeCapable` :112-114 and the verbatim-inputs body `buildReanalyzeBody` :157-175),
- the LIVE lane-1 store `/home/brad/.computable-lab-lane1/worktrees/main` — all 71 analysis-run records
  and the revision records, replayed programmatically against the shipped validator semantics.

## 0. Grounding correction to O1's framing (read this before the ruling)

O1 (and the decision request) says ANREV-000006/7/8/13 "declare NO inputs". The live records say
otherwise: those four revisions DO carry an `inputs` key — an OLD-SHAPE declaration (slots `name`/
`required` only, no FAME-7 `acceptsKinds`/`acceptedArtifactNames`). Per the OQ-3 ruling verbatim
("inputs PRESENT — empty array, non-empty, with or WITHOUT the FAME-7 keys → validate FULLY"),
these revisions validate fully and the skip does NOT apply to them. The revisions the skip actually
covers are the truly inputless ones (no `inputs` key at all): ANREV-000001..05, ANREV-000010,
ANREV-GC10A/B/C, the ANREV-TEST-GC13-* fixtures — 18 runs ride that skip, exactly as designed.

## 1. The measured blast radius (live store replay, 71 runs)

Applying the shipped validator rules to every historical run's frozen body, as a reanalyze would
resent it:

1. **13 runs would 400** (ANR-000006/7/8/9/10/11/12/16/17/18/19/39/40 against ANREV-000006/7/8/13).
   The rejections are TRUE statements about the data, not artifacts of an era mismatch: e.g.
   ANR-000016 binds body slots `package`/`signal` while its own revision ANREV-000006 declares slot
   `signal1` ⇒ `INPUT_UNDECLARED ['package','signal']` is correct against that revision's OWN old
   declaration; ANR-000008 binds nothing while ANREV-000007 declares required slot `rows` ⇒
   `INPUT_REQUIRED_MISSING` is correct. The old body violated the old revision's own contract
   all along — FAME-7 is the first era that READS the contract.
2. **ZERO of those 13 are reachable through the reanalyze door.** The shipped capability gate
   `reanalyzeCapable` (reanalyze.ts:112-114, declared data only) requires: status `succeeded` AND
   frozen body inputs NON-EMPTY AND the revision declares a parameterSchema. Every would-400 run
   fails the door honestly, independent of FAME-7:
   - ANR-000006/7/8/9/10/11/12/39/40: frozen `inputs: {}` ⇒ inputsCount 0 ⇒ door never rendered
     (the door's whole contract is carrying frozen inputs; it refused these runs BEFORE FAME-7);
   - ANR-000016/17/18/19: status `queued`/`failed` ⇒ door never rendered (pre-FAME-7 too).
   Live count of door-visible-and-would-400 runs: **0**.
3. **The 18 runs on truly inputless revisions are untouched**: inputs PRESENT + revision `inputs`
   key ABSENT ⇒ the named OQ-3 skip fires ⇒ 201 exactly as pre-FAME-7. This includes the
   door-visible succeeded ones (ANR-000022/23/24 on ANREV-GC10A, ANR-000031, the GC13 fixtures).
   Zero regression there.

So the ONLY way to observe a legacy reanalyze 400 today is a hand-crafted `POST /api/analysis-runs`
whose body provably disagrees with the target revision's own declaration — and that 400 is telling
the truth.

## 2. RULING = OPTION A — FAME-7 merges as-is; the 400 is accepted, named, and documented

Justification against the OQ-3 ruling text (BINDING, this campaign):

- Option B's grandfather (inputs key ABSENT ⇒ skip EVEN WHEN inputs present… — B actually proposes
  re-widening to "legacy revision ⇒ skip regardless of body") directly contradicts the ruling's
  exact semantics: "`revision.payload.inputs` ABSENT (key not present) ⇒ skip … `inputs` PRESENT
  (including an EMPTY array) ⇒ validate fully … Absent vs empty-array is a real semantic distinction
  in the record; do not collapse it" (OQ-3 §2, and fix1 D4 CLOSED exactly to this). B is not a
  clarification of the ruling; it is its reversal, and it re-opens exactly the silent no-validation
  door the ruling narrowed. REJECTED.
- B also has no legal data home. The system forbids era constants and revision-id allowlists in TS
  (never-hardcode), and the legacy records carry NO marker distinguishing "old-shape declarator"
  from "contractful revision" — inventing a backfilled `legacyEra: true` key on append-only
  revisions is a larger, more invasive change than the 400 it avoids, for ZERO rescued runs (§1.2).
- The UI variant (reanalyze sends `inputs` ABSENT when the revision record has no inputs
  declaration) changes nothing server-side — those revisions already ride the skip, so the variant
  buys zero blast radius — and for the old-shape DECLARATORS (the actual would-400 set) omitting
  inputs would only convert `INPUT_UNDECLARED` into `INPUT_REQUIRED_MISSING`: the same honest 400,
  reached by hiding data from the validator. It weakens the reanalyze module's own declared contract
  ("carried VERBATIM — never `{}`", reanalyze.ts:5-7,154-156). REJECTED.
- The revision-history model already says the old body is a different era of the method: the fix is
  to mint a new revision whose declaration matches the intended inputs (the shipped W2 path), not to
  exempt the old one from its own words.
- Records are TEST data (Brad standing ruling); the named rejections exist precisely so a stale body
  fails loudly instead of re-running against an unread contract.

## 3. Binding wording for the handoff (orchestrator, merge note)

The FAME-7 merge handoff MUST state, in these terms (cite this file):

> Reanalyze of a historical run whose frozen inputs disagree with its revision's own declared
> contract is now a NAMED 400 (`INPUT_UNDECLARED` / `INPUT_REQUIRED_MISSING`) instead of a silent
> re-run. Live audit 2026-11-02: 13 of 71 historical runs carry such bodies; ZERO of them can
> reach createRun through the reanalyze door (all are failed/queued or froze empty inputs, which
> the pre-existing capability gate already refused). The 18 runs on inputless revisions ride the
> OQ-3 skip unchanged. Remedy for a real legacy re-run: mint a successor revision declaring the
> slots the run actually binds, then reanalyze against it.

## 4. Binding behavior for the reanalyze UI when the 400 happens

- The door's `onError` (reanalyze.ts:192-194 "the caller renders the named error") must render the
  server's named code and message VERBATIM in the door's error surface (`analysis__error` /
  `data-testid` error element) — e.g. `INPUT_UNDECLARED: input 'package' is not declared by this
  revision — declared inputs: signal1`.
- NO silent retry, NO input-dropping fallback, NO auto-reformulation of the body, NO swallowing
  into a generic "something went wrong". The new run is not created (createRun threw before any
  mint — D8's named-rejection-before-mint property covers the sibling case) and the source run is
  untouched (append-only).
- The error line is presented as the revision speaking, not the page failing: the message already
  names the declared slots; the UI adds no interpretation beyond the surfaced code+message.

## 5. Post-merge watch item (not a merge blocker, not a code change now)

D14 (fix2) preserved `inputs: []` on createRevision, which makes the "declared empty array = NO
inputs admitted" branch live; a future revision minted with `inputs: []` will 400 ANY body input.
That is the ruling's design working, not a defect — but if a real workflow ever needs "no inputs,
but tolerate a stray body key", that is a NEW campaign decision, not an FAME-7 amendment.

No code changes were made anywhere; reads only, plus this file.

O1 DECISION: A
