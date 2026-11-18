# L2-P1-EMPTY-TURN-CARD-2 / u2mentionfix — cycle 2, FIX-FUNCTIONAL route

- worktree: /home/brad/cl-wt/L2-P1-EMPTY-TURN-CARD-2-lane2
- branch: cl/lane2-p1-empty-turn-card-2-u1-2055
- base: 3d2fe2bb95fe6c4404aa4c6f078676539f3bee37 (HEAD at start — built ON TOP, nothing restarted)
- scope: server-only. AgentOrchestrator.ts product code, app/src/**, labwareLookup.ts,
  schemas and new test files: ALL untouched (`git diff --stat 3d2fe2bb9 -- server/src/ai/` = 3 files).

## COMMITS

| sha | what |
|---|---|
| 1d1e9bf386afaea90aebffd2be17907963d041fb | FIX-1 / FIX-2a / FIX-2b / FIX-4 in `clarifications.ts` + the 5 new pins in `clarifications.emptyTurn.test.ts` |
| 1d14b9e36558284be0e1fb08b4a6e42cc12e11cf | FIX-3 leg in `AgentOrchestrator.finalAnswerEmpty.test.ts` (test-only) |
| 6a8a2f071674956d4720b8ba6b056d5fb1fb2dbf | comment trim, no behavior change |
| 9841578d9e1e3519268dbbf2ce4c5076312cf9a2 | this report |

Changed: `server/src/ai/clarifications.ts`, `server/src/ai/clarifications.emptyTurn.test.ts`,
`server/src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts`. 201 added / 5 removed lines —
over the 150-line OUTPUT BUDGET by 51 (the arm-2 harness is ~80 of them and has no cheaper
honest shape; see FIX-3). Files: 3 of 4 allowed.

## FIX-1 — the location strip deleted the noun (MAJOR)

`clarifications.ts:337-346` — the arm now strips a trailing location phrase ONLY when the
REMAINDER still carries a labware head noun; otherwise the fragment is kept whole.

Probe (`extractEmptyTurnLabwarePhrases`, throwaway /tmp-side probe under the vitest harness,
not committed), base `clarifications.ts` @ 3d2fe2bb9 → after:

```
"Add 10 uL to the reservoir."              => []                        => ["10 uL to the reservoir"]
"Put the sample into the 96-well plate."   => []                        => ["sample into the 96-well plate"]
"Place it in the plate."                   => []                        => ["it in the plate"]
```

Acceptance 1 holds: each sentence yields exactly 1 candidate carrying a labware head noun
(`reservoir`, `plate`, `plate`) and the resulting request is `kind:'labware'`, `menuProvider:'/l'`.
Pins: three `FIX-1:` legs (they assert >=1 candidate AND the card built from it).

OBSERVATION (not a defect, not fixed here): because the fragment is kept whole, the mention
for these three is a clause ("10 uL to the reservoir"), which reads poorly in the card. The
obvious alternative — keep only the prepositional TAIL — is NOT available without touching a
second rule: for "Put the sample into the 96-well plate." the tail is "96-well plate", which
`EMPTY_TURN_NOISE` (`^\d+\s*[-]?\s*(?:well|…)(?:\s*[-,]?\s*\S*)?$`, clarifications.ts:299)
classifies as a generic type label and drops, so 0 candidates again. Making absence mentions
noun-only is a noise-rule decision, i.e. an architect call — routed, not taken.

## FIX-2 — invented local noun lexicon, both halves (MAJOR)

(a) `clarifications.ts:382-386` — the emitted request takes `kind='labware'` when the mention
passes `EMPTY_TURN_LABWARE_HEAD`; `normalizeClarificationKind` is only the non-head fallback.
(b) `clarifications.ts:22-27` — ONE shared line, extended in place with rack/vial/cryobox.
`well` deliberately NOT added (it stays `well-selection`).

Probe (same harness), base → after:

```
KIND rack     => general        => labware
KIND vial     => general        => labware
KIND cryobox  => general        => labware
KIND well     => well-selection => well-selection   (unchanged)
KIND plate    => labware        => labware          (unchanged)

REQ "Place a rack on the deck." => [{"kind":"general","menuProvider":"choice","mention":"rack"}]
                                => [{"kind":"labware","menuProvider":"/l","mention":"rack"}]
REQ "Place a vial on the deck." => [{"kind":"general","menuProvider":"choice","mention":"vial"}]
                                => [{"kind":"labware","menuProvider":"/l","mention":"vial"}]
```

Acceptance 2 holds, including `normalizeClarificationKind('rack') === 'labware'`.
Pins: `FIX-2:` leg (both sentences + the three mapper assertions + the `well` non-regression).

## FIX-4 — mention was a clause when the verb is unknown (MINOR)

`clarifications.ts:328-333` — one extra map arm, `/^[A-Za-z]+\s+(?=(?:a|an|the)\s)/i`.

DEVIATION FROM THE BRIEF'S LITERAL WORDING, stated plainly: the arm sits immediately BEFORE
the determiner-strip arm, not after it. Placed after, the determiner ("the") is already gone
past and the mention becomes "the plate from the rack", which contradicts the brief's own pin
("a candidate starting with 'plate'"). Placing it one arm earlier makes the existing
determiner strip do exactly what the brief says it does.

```
"Take the plate from the rack and put it on the deck."  base => ["Take the plate from the rack"]
                                                       after => ["plate from the rack"]
manifest sentence (regression pin, byte-unchanged)      both => ["Thermo Optical-Quality Imaging Plate"]
```

Acceptance 4 holds. Pins: `FIX-4:` leg (starts with `plate`, never `Take`, plus the manifest
equality pin).

## FIX-3 — arm 2 had no pin; it has one now, and it is mutation-proven (MAJOR, test-only)

Leg: `AgentOrchestrator.finalAnswerEmpty.test.ts` — "the SHORTHAND arm-2 backstop carries the
card". It drives the real shorthand path (intent tool call → fixture `shorthand-add-dmem.yaml`
→ `demoteUnstatedQuantities` → shipped `shorthandResultFromCompile` → shipped guard), with one
seam: `compileShorthandDeterministically` is stubbed (module mock, everything else spread from
the real module) to the single shape the guard exists for — `outcome:'complete'`,
`terminalArtifacts.events:[]`, `clarifications:[]`. The lookup, the guard and
`emptyTurnAbsenceRequests` are the shipped code.

Observed result (shipped code):

```
success:true, events:[], error:"no proposal: the model’s tool call carried no usable draft arguments. …"
clarificationRequests: 1 × {kind:'labware', menuProvider:'/l', query/snippet/absence.mention:
  "Thermo Optical-Quality Imaging Plate", absence.reason:"Not in this lab's records: …", options:[]}
```

MUTATION (acceptance 3), executed on the tree, then restored:

1. deleted the whole arm-2 block, `AgentOrchestrator.ts:3574-3589` (1013 chars, from
   `if (shResult.success && !shResult.error && draftProducedNothingOnServer(shResult)) {` to its
   closing brace);
2. `npm run test:run -w server -- finalAnswerEmpty` → `Tests 1 failed | 8 passed (9)`;
   the failing leg is the new one: `expected undefined to be 'no proposal: the model’s tool call ca…'`
   (with the block gone the turn returns success:true, no error, no card);
3. `git checkout -- server/src/ai/AgentOrchestrator.ts` (product file byte-restored, and it
   stays out of every commit: `git diff --stat 3d2fe2bb9 -- AgentOrchestrator.ts` is empty).

Note on shape: the brief said "drive the shorthand path to success:true/events:[]" — that is
exactly what the shipped arm returns (the error string and the card ride along; the arm does not
flip success). No refactor of AgentOrchestrator.ts was needed and none was done.

## VERIFICATION (final commit 6a8a2f071674956d4720b8ba6b056d5fb1fb2dbf)

```
$ timeout 300 npm run test:run -w server -- clarifications.emptyTurn finalAnswerEmpty
 ✓ src/ai/clarifications.emptyTurn.test.ts  (10 tests) 7ms
 ✓ src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts  (9 tests) 141ms
 Test Files  2 passed (2)
      Tests  19 passed (19)

$ timeout 300 npx tsc --noEmit -p server 2>&1 | grep -c "error TS"
6                      # == BASELINE 6 (fastify-multipart debt)

$ timeout 300 npm run test:run -w server -- clarifications
 Test Files  4 passed (4)
      Tests  72 passed (72)
```

RED-then-GREEN (acceptance 1/2/4), measured by checking `clarifications.ts` back to base
3d2fe2bb9 while keeping the new legs:

```
$ timeout 300 npm run test:run -w server -- clarifications.emptyTurn
 Tests  5 failed | 5 passed (10)
   × FIX-4 unknown leading verb
   × FIX-1 "Add 10 uL to the reservoir."
   × FIX-1 "Put the sample into the 96-well plate."
   × FIX-1 "Place it in the plate."
   × FIX-2 rack/vial are labware
```

Pre-existing worktree debt, NOT caused by this unit: `-- AgentOrchestrator` also picks up 20
failures in unrelated suites (parallel, bypass, instrumentation, golden, tubeGate,
readingCardAnswer, repeatEcho, freeformLegs, …). Proof: with `clarifications.ts` reverted to
3d2fe2bb9 the same set fails identically (`AgentOrchestrator.parallel|bypass|instrumentation` →
`Tests 4 failed | 2 passed (6)` both before and after). AgentOrchestrator.ts is byte-identical
to base; my diff is confined to two pure-function edits in clarifications.ts plus two test files.

## NEXT ACTIONS / OWNERS

- architect (open): should an absence mention be a bare noun ("reservoir")? That needs the
  `EMPTY_TURN_NOISE` rule decided, see the FIX-1 observation. Not taken in this unit.
- reviewer: the FIX-4 arm placement deviation above is the one intentional departure from the
  brief's literal wording; it exists to satisfy the brief's own pin.

L2-P1-EMPTY-TURN-CARD-2 UNIT L2-P1-EMPTY-TURN-CARD-2 DONE 9841578d9e1e3519268dbbf2ce4c5076312cf9a2
