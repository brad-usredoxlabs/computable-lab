# ARCHITECT RULING — L2-CLARIFY-TARGET-1, cycle-3 decision packet (l2t0937)

Date: 2026-11-03 (EST). Architect: lane-2 architect, local model + first-hand repo verification.
Responds to: `/home/brad/.hermes/cl/lanes/2/decisions/TARGET1-CYCLE3-cap-and-affordance-question-l2t0937.md`.
Gate report ruled on: `/home/brad/.hermes/cl/lanes/2/reviews/L2-CLARIFY-TARGET-1-advc-wellsfix-fix3-l2t0937.md` (§§4-6 read in full).

## 0. First-hand verification performed for this ruling (all on the stated trees)

- Trunk: `/mnt/vast/home/brad/git/cl-integration-2` @ `6f75f9f6` confirmed; the MANIFEST re-bless auth
  `.hermes/plans/decisions/TARGET1-MANIFEST-REBLESS-auth-l2t0830.md` EXISTS on trunk, committed BY `6f75f9f6`
  itself (`git show --stat 6f75f9f6` = that one file, 136 insertions). The gate report §8 "does not exist" was a
  scope error (it looked in the item worktree) — confirmed as the packet says; defect 4 stays out of scope.
- Item worktree: `/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810` @
  `cf349fcaeb72798023391429895b94b9902c5913`, `git status --porcelain` EMPTY.
- **Reproduction 1 (defect 1, headline measurement):** at HEAD, cwd `app/`,
  `npx vitest run src/agent/ChatPreviewCard.mixedetails.uifix2.test.tsx` -> **2 failed | 2 passed (4)**.
  Failure 1: mix event — `Expected element to have text content: 3 cycles`, received line without it
  (`.chat-preview__event-details` no longer carries `75 uL · 3 cycles`). Failure 2: add_material —
  `expected 'B1, B2 ← 100 uL' to be '100 uL'` (test :119 exact-match on the detail element).
  Control (scratch copy `/tmp/arch-ruling-l2t0937`, ONLY `app/src/agent/ChatPreviewCard.tsx` reverted to
  `16f3b403`, test file untouched): **4 passed (4)**. The regression is delta-caused, exactly as the gate measured.
  The uifix2 test is tracked and not ignored (`git ls-files -s` blob `13921c89…`, `git check-ignore` rc=1) —
  a live accepted leg (L2-SUITE-A-uifix2 [B]).
- **Reproduction 2 (defect 2, headline measurement):** probe over the REAL module
  `app/src/event-editor/lib/wellRange.ts` at HEAD:
  `expandWellAddressLiteral("A2, A3, B2, B3") -> null` (comma list REJECTED),
  `("A2") -> ["A2"]`, `("A2:B3") -> ["A2","A3","B2","B3"]`, `("A1:ZZ99") -> null`.
  Read first-hand: `ClarifyWellTargetSlot.tsx:87-90` `useSelected` fills `selected.join(', ')`; the slot's ONE
  gate is `:75` `expandWellAddressLiteral(text) !== null`; Approve `:107` `disabled={disabled || !shaped}`.
  The delta's own test (`ChatClarification.target1.test.tsx`, fill leg ~:274-292) pins the dead-end explicitly:
  after the click `input.value === 'A2, A3, B2, B3'` AND `approve.disabled === true`. Dead-end confirmed.
- Precedence branch read first-hand: `ChatPreviewCard.tsx:179-191` (fact REPLACES detail); conflicting pin
  `ChatPreviewCard.rowFact.target1.test.tsx:157-179` (`eventDetails` MUST be null for the mix event at :178).
- Spec of record read first-hand at the cited range: `.hermes/plans/2026-11-02_0050-L2-CLARIFY-TARGET-1-spec.md`
  Change 4 (:362-364 affordance) and Change 5 (the enumerated fact fields well/volume/material;
  "`eventDetailLine` `:51-95` pins HOLD"; "no recognised field => null … dead chrome is not added").
- Lane cap language read first-hand in `~/.hermes/cl/lanes/2/task-list.md`: ":188-189 … Third fix verdict =
  cycle cap -> architect" (ANSWER-FOLD-NULL-1), ":16182 … SWEEP-1 c3 FIX = cycle cap -> architect packet live",
  ":5885-5886 … a c6 FIX without closing its own defect list … routes to the architect, NOT cycle 7" (W2-9).
  The lane convention is: the THIRD fix verdict does not auto-cycle — it ROUTES TO THE ARCHITECT, whose ruling
  is the disposition. No prior ruling bound THIS item.

------------------------------------------------------------------------------

## Q1 — Cycle cap

RULING: THE CAP FIRES PROCEDURALLY AND IS DISPOSED AS: (i) ONE final bounded fix run (fix 4) on the two named
defects only. This is the third `fix` verdict, so there is NO automatic cycle 4; the cap's routing target is
this ruling, and this ruling authorizes exactly one more run. Fix 4 scope is BOUND to:
  (a) DEFECT 1 per the Q3 ruling below (compose in `ChatPreviewCard.tsx` / `proposalRowFacts.ts` + re-pins),
  (b) DEFECT 2 per the Q2 ruling below (`ClarifyWellTargetSlot.tsx` + `wellRange.ts` helper + re-pins),
  (c) the ALREADY-AUTHORIZED MANIFEST treeState re-pin (trunk `6f75f9f6`,
      `.hermes/plans/decisions/TARGET1-MANIFEST-REBLESS-auth-l2t0830.md`) — nothing beyond the one pin it bounds,
  (d) D-verify widened per the gate report §10: `npx vitest run src/agent` (whole directory) GREEN + app `tsc`
      sort-diff vs baseline EMPTY, reported with raw output.
Nothing else may change; the server-twin observation (gate §4 note, `isWellAddressLiteral` unbounded
server-side) is NOT folded into fix 4 — it is recorded for a separate future task, not this item.

WHY one more run rather than stop: the defect history is monotonically narrowing (2 -> 4 -> 2) and every cycle
CLOSED its own named defects (cycle-3 closed D1-wiring, the D2 bounded gate — measured O(1) at the gate — and
the D3 fill-only affordance). The two survivors are NOT repeats: they are (1) a replace-vs-compose regression
in one precedence branch, (2) an affordance-semantics decision that only an architect could make and which this
ruling now makes in full. Coder discretion in fix 4 is near zero; the remaining diff is ~3-4 files. Stopping
now discards three cycles of closed, measured work for a delta this ruling fully specifies.

BINDING TRIPWIRE (the cap, enforced): if the cycle-4 gate renders `VERDICT: fix` at all, OR fix 4 re-opens any
class closed in cycles 1-3 (row-fact wiring, the bounded endpoint gate, fill-not-answer, the one-grammar
server parity), the item FREEZES IMMEDIATELY and routes to Brad as a card — no fix 5, no further architect
discretion, no new approach. The four Prompt-2 tasks and CARD-1 fix 4 stay queued behind the outcome.

ACCEPTANCE CONDITION the next gate must apply to Q1: the gate confirms fix 4's delta touches ONLY files in
scope (a)-(d) above (a file outside that set is itself a cap-tripwire failure), and that the coder's report ends
with the DONE marker naming the 40-char sha (pipeline convention).

------------------------------------------------------------------------------

## Q2 — "Use selected wells" affordance semantics

RULING: OPTION (a), bound in full: the button FILLs ONLY a value the ONE grammar accepts. When the current
selection is exactly the full cross-product of its corner rectangle (rows A-P x cols 1-24, i.e. it equals
`expandWellTokens` of `minCorner:maxCorner`), the button is ENABLED and fills the RANGE LITERAL. Otherwise the
button renders DISABLED with a visible reason; a disabled button can never be clicked, so a previously typed
value can never be destroyed (the destruction half of the defect is eliminated by construction). NO comma-list
parsing is re-added anywhere; NO second grammar: the rectangle test is INVERSE set arithmetic over plate
coordinates, implemented in the ONE grammar home `app/src/event-editor/lib/wellRange.ts` reusing
`WELL_ADDRESS_SHAPE_RE` / `rowLabelToIndex` / `indexToRowLabel` — suggested single export
`rectangularRangeFromWells(wells: readonly WellId[]): string | null` (returns `A2:B3`-style min:max corners,
null for any non-rectangular or unshaped-member selection). It never parses free text.

BINDING USER-VISIBLE WORDING (exact, verbatim):
  1. Rectangular selection — button label:  Use selected wells (A2:B3)
     (the label names the range that WILL be filled — the scientist is never surprised by the input's value;
      corners are the sorted selection's top-left:bottom-right addresses)
  2. Non-rectangular selection — button label unchanged and naming the selection (e.g.
     `Use selected wells (A2, A3, C1)`), rendered `disabled`, and the slot shows this reason line verbatim:
     Selection isn't a rectangular range — type it as a well address or range (e.g. A2:B3).
  3. Single-well selection (N x 1 rectangle degenerate case): label `Use selected wells (B2)`, fills `B2`.
The placeholder `A2:B3` and aria-label already say "a well address or rectangular range" and stay unchanged.
The spec-wording drift (spec :362-364 still says "range or comma list") is DOCUMENTATION drift; the coder does
NOT edit the spec.

TESTS THE FIX MUST PIN (re-pin of the current fill leg, same commit):
  - Affirmative: selection {A2,A3,B2,B3} -> button textContent EXACTLY `Use selected wells (A2:B3)`, enabled;
    click -> input value `A2:B3`; approve `disabled === FALSE`; `onClarificationPick` NOT called (fill, not
    answer — the existing pin stands).
  - Non-rectangular: selection {A2,A3,C1} -> button present, DISABLED, and the reason line present with the
    exact text above; `fireEvent.click` leaves the input value UNCHANGED (pre-typed `A2` survives, approve stays
    enabled for it).
  - Single well: selection {B2} -> fills `B2`, approve enabled.
  - The old assertions `expect(input.value).toBe('A2, A3, B2, B3')` + `expect(approve.disabled).toBe(true)`
    (ChatClarification.target1.test.tsx ~:281-291) are REPLACED by the above in the same commit — no residue.
  - Unit legs in `wellRange.target1.test.ts` for `rectangularRangeFromWells`: full rectangle -> `A2:B3`;
    hole in the rectangle -> null; unshaped member -> null; parity test untouched and stays 19/19 GREEN.

ACCEPTANCE CONDITION the next gate must apply: by measurement, not prose — after the fill on a rectangular
selection Approve is ENABLED (the affordance can now lead to an answer); on a non-rectangular selection the
input is provably never written; no new regex literal exists outside `wellRange.ts` (`grep` the delta for a
second `[A-P]`-class pattern outside the grammar home); the comma-list probe case above still returns null.

------------------------------------------------------------------------------

## Q3 — Row-fact shape (defect 1)

RULING: SHAPE (A) — COMPOSE, NOT REPLACE, and NOT (B). Binding: the row renders ONE detail line =
row fact followed by the RESIDUAL of `eventDetailLine` restricted to the fields the fact did not already carry,
joined with ` · ` into the existing `chat-preview__event-details` element (testid `chat-preview-row-fact`
stays on it; `chat-preview-event-details` remains the no-fact fallback exactly as today). Worked expected face:
  - mix {volume:75, cycles:3} -> fact `75 uL` + residual `3 cycles` -> ONE line:  75 uL · 3 cycles
    (the accepted uifix2 mix leg then passes AS WRITTEN, with zero test edits — this is the point);
  - add_material {wells:[B1,B2], volume:{value,unit}} -> fact `B1, B2 ← 100 uL`, residual empty (volume carried)
    -> ONE line:  B1, B2 ← 100 uL.
Discipline constraints (all binding): the fact formatter declares its fields in ONE place and must expose WHICH
detail fields it carried (e.g. return `{text, carried}` or export the carried-field set from the same
declaration — implementation the coder's call); `eventDetailLine` accepts the caller-supplied exclusion and
keeps its declared doctrine ("whatever displayable fields the record carries") over the residual; ONE detail
line per row; no field text may appear TWICE on a row; no field the record displayed before this delta may be
GONE from the face; no new field-name/verb-name branch table and no policy literals anywhere.

WHY (B) is rejected: making `proposalRowFacts` a superset descriptor (cycles/duration/temperature) contradicts
the spec of record twice — Change 5 §1 enumerates the fact fields as well/volume/material ONLY, and the same
change pins `eventDetailLine` :51-95 as HOLDING. (B) is a spec amendment (Brad-level), and it would also flip
the delta's own no-fact leg (dwell `2 min` falls back to `eventDetailLine` at rowFact test :181-202). (A) needs
no amendment and repairs the trust regression ("dead chrome is not added" never licensed removing live data).

RE-PIN vs DELETE of `ChatPreviewCard.rowFact.target1.test.tsx:157-179`: RE-PIN, do not delete. The leg's
CONTRACT (one detail line per row, no double line) survives; its expectation changes: for the mix event the
single detail element (`chat-preview-row-fact`) reads exactly `75 uL · 3 cycles`, and
`[data-testid="chat-preview-event-details"]` is null on that row. Delete would silently drop the no-double-line
guard.

ACCEPTANCE CONDITION the next gate must apply:
  - `npx vitest run src/agent` FULLY GREEN — `ChatPreviewCard.mixedetails.uifix2.test.tsx` 4/4 at HEAD;
  - the mix leg (`3 cycles` + exact `75 uL · 3 cycles`) passes with the test file UNMODIFIED (any diff to that
    leg is a defect); the add_material leg may be re-pinned ONLY to the exact composed string `B1, B2 ← 100 uL`
    (no loosening to vacuous containment, no deletion);
  - the re-pinned :157-179 leg as above;
  - non-vacuity by mutation: reverting ONLY the precedence branch to replace-only must turn at least one
    mixedetails leg RED; and
  - `aria-label` keeps `${verb} ${fact}` with the fact unchanged (the W13 four-distinct-rows pin stays GREEN).

------------------------------------------------------------------------------

## Disposition summary

- Fix run 4 dispatches under the Q1 scope bound, with Q2/Q3 as the binding specs of the two fixes.
- On a `fix` verdict at cycle 4, or any re-opened closed class: freeze + Brad card, per the tripwire, no
  further architect discretion.
- This ruling changes no spec, no golden, no MANIFEST beyond the already-authorized `6f75f9f6` pin, and no
  server file. The server-side unbounded `isWellAddressLiteral` observation is logged for a future named task.

END-RULING
