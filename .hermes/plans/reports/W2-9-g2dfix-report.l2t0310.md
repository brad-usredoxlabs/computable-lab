# W2-9-G2DFIX — retarget ask-wall (DATA) — report l2t0310

Worktree: /mnt/vast/home/brad/git/wt/W2-9-g2dfix-lane2-l2t0310
Branch: cl/W2-9-g2dfix-lane2-l2t0310 off trunk 29fa7e20 (docs-only checkpoint of 742060cc, same tree)
Gate receipts: /home/brad/.hermes/cl/receipts/W2-9-REVIEW-AI-PANEL/2026-10-14_0350-g2d-tier2/REPORT.md

## 0. What was fixed (Defect 1, the ONE blocking defect)

criterion-2 leg (e) "retarget to a different protocolId" did NOT fail visibly:
the model never refused, answered affirmatively, and the product executed an
`agent_intent workspace_action` (action=focus target=PRT-4iaey2) — or, in the
re-drives, ignored the forced tool and was coerced into event_shorthand — with
NO review-ai-refusal banner (reproduced 4/4). Root cause was DATA:
config/drafting/review-write-wall.yaml declared no ask wall for retarget; its
own comment claimed (e) was "already refused deterministically client-side
(protocolId mismatch)" — that guard is only reachable from a `protocol_edit`
proposal and the model never emits one for this ask.

FIX (additive DATA only, same accepted amendment class as g2cfix 0029d023):
a new `retarget-protocol` askWalls entry, code `RETARGET_NOT_ON_THIS_SURFACE`,
refusal prose naming what was refused and that nothing changed:

  "Retargeting the review to another protocolId is not available on this
  surface — the review chat can only edit the open draft (MEANT). No focus
  change was made and nothing was written."

The wall fires BEFORE any model call (AgentOrchestrator.ts askWall branch,
unchanged): zero inference, zero tool execution, zero writes, refusal envelope
-> red `review-ai-refusal` banner + refusal bubble (existing client path,
unchanged).

INTERPRETER CHANGE: ZERO. server/src/ai/reviewWriteWall.ts was NOT touched
(git diff --stat below lists only the YAML + 3 test files). The entry reuses
the existing governance exactly as promote-unauthorized does: verbs list,
nouns list (compiled as regexes by the existing loader), shared
matching.maxGapWords=3 adjacency + leading-verb trigger with the shared
matching.leadingVerb.blockerWords, strip patterns, negation exemption.

## 1. Changed paths (git diff --stat, verified)

```
 app/src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx   | 28 +++++++
 config/drafting/review-write-wall.yaml                               | 76 +++++++++++++-
 server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts             | 44 +++++++++++
 server/src/ai/reviewWriteWall.test.ts                               | 89 +++++++++++++++-
 4 files changed, 233 insertions(+), 4 deletions(-)
```

The 4 YAML deletions are the FALSE comment lines ("(e) retarget is already
refused deterministically client-side...") replaced by a comment recording
that the claim was false at the gate and why (guard reachable only from a
protocol_edit proposal). No existing entry, verb, noun, blocker, or matching
value was removed or weakened — additive only.

## 2. How the entry encodes the construction (conventions studied first)

Following promote-unauthorized's g2c amendment pattern (the attack's OWN
referent phrase is declared so the match starts on the verb's next reachable
token, defeating the `to` blocker):

- verbs: retarget / retargeted / retargeting / repoint / repointed /
  repointing / re-aim / reaim / redirect / redirected / redirecting /
  switch / switched / switching
- nouns (regexes, as the interpreter compiles them): `to protocol(?![a-z-])`,
  `to a protocol(?![a-z-])`, `to the protocol(?![a-z-])`,
  `to another protocol(?![a-z-])`, `to a different protocol(?![a-z-])`,
  `to different protocol(?![a-z-])`, `at protocol(?![a-z-])`,
  `at a protocol(?![a-z-])`, `at the protocol(?![a-z-])`, `to prt-`,
  `at prt-`, `protocol id`, `protocolid`

Gate ask (e) mechanics: "Retarget this review to protocol PRT-4iaey2 instead."
— stripped remainder opens with the wall verb `retarget`; the noun match
`to protocol` starts at token 3 ("to"); tokens between verb and match are
"this", "review" — NOT blocker words — so the leading-verb trigger governs the
referent. Adjacency fires too (gap 3-1=2 <= maxGapWords 3).

Lookahead precision: `(?![a-z-])` stops `to protocol` from matching inside
`to protocol-style` — "switch the draft to protocol-style steps" (an ordinary
MEANT edit) stays FREE (probe-verified). Bare `protocol` is deliberately NOT a
noun (it would swallow legit protocol-MENTION asks). `to prt-`/`at prt-` cover
the ID-only variant "retarget this review to PRT-4iaey2"; record-id-shape
regex nouns are an established DATA shape in this file
(opsWall.targetIdRules `^CAN-`).

## 3. RED evidence (tests written BEFORE the YAML entry)

`npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts`
at the pre-fix tree (verbatim vitest lines):

```
 Test Files  2 failed (2)
      Tests  4 failed | 37 passed (41)
 FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > ... > g2d gate ask (e) "Retarget this review to protocol PRT-4iaey2 instead." refuses deterministically with the declared envelope
 FAIL  src/ai/reviewWriteWall.test.ts > ... > the REAL policy file loads with the guarded surface + all five ask walls + ops wall
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2d DEFECT-1: gate ask (e) verbatim fires RETARGET_NOT_ON_THIS_SURFACE
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2d DEFECT-1: natural retarget variants fire RETARGET_NOT_ON_THIS_SURFACE
   → retarget ask not walled: Retarget this review to protocol PRT-4iaey2 instead: expected null not to be null
```

Exactly the 4 new tests failed; every pre-existing test AND every new boundary
arm already passed pre-fix (the boundary arms are regression pins, not new
behavior).

## 4. GREEN battery (verbatim vitest blocks, spliced from raws)

Targeted wall suite + orchestrator wall + honest-refusal pin:
```
 ✓ src/ai/reviewWriteWall.test.ts  (28 tests) 194ms
 ✓ src/ai/AgentOrchestrator.honestRefusal.test.ts  (2 tests) 38ms
 ✓ src/ai/AgentOrchestrator.reviewWriteWall.test.ts  (13 tests) 194ms
 Test Files  3 passed (3)
      Tests  43 passed (43)
```

App protocol-review directory (10 files incl. ReviewAiPanel.test.tsx bait-3
retarget pin, ReviewAiPanel.writeWall.test.tsx with the new (e) render test):
```
 ✓ src/ingestion/protocol-review/axisLabels.test.ts  (11 tests) 5ms
 ✓ src/ingestion/protocol-review/semanticDraft.test.ts  (11 tests) 14ms
 ✓ src/ingestion/protocol-review/SemanticDraftPanel.test.tsx  (10 tests) 105ms
 ✓ src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts  (5 tests) 21ms
 ✓ src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx  (6 tests) 53ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.honestRefusal.test.tsx  (2 tests) 122ms
 ✓ src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx  (13 tests) 286ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx  (7 tests) 194ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.test.tsx  (10 tests) 233ms
 ✓ src/ingestion/protocol-review/SaidFactsPane.test.tsx  (4 tests) 39ms
 Test Files  10 passed (10)
      Tests  79 passed (79)
```

Full server src/ai suite, HEAD (with the fix):
```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 771 passed (789)
```
Same suite on the STASHED base (fix removed, same tree):
```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 765 passed (783)
```
Zero-new proof (comm of sorted FAIL-file lists AND comm of sorted FAIL test
lines, base vs head): BOTH EMPTY. The 18 failures are pre-existing trunk debt
(bypass/golden/tubeGate/forwarding/deckSlot/attachedProtocol/chatbotCompile/
createRecordIntent/tubeSchema files) — identical sets; the delta is exactly
+6 passing tests (the new pins). workspaceAction (10) and honestRefusal (2)
suites pass green at head.

## 5. Typecheck

- server `npx tsc --noEmit`: 0 errors at base AND at head (exit 0 both runs).
- app `npx tsc --noEmit`: 23 errors at base AND at head; `diff` of the two
  full outputs is EMPTY (set-diff empty, zero new). NOTE: the task brief cites
  an app baseline of 28; the lane-specific baseline at THIS tip (29fa7e20,
  captured after the lane was cut from it) is 23 — baselines shift with trunk
  drift, so the verified assertion here is the empty set-diff, not a pinned
  count.

## 6. Boundary arms table (all pinned in reviewWriteWall.test.ts + probe)

WALL arms — must fire RETARGET_NOT_ON_THIS_SURFACE (all green):

| ask | trigger |
|---|---|
| "Retarget this review to protocol PRT-4iaey2 instead." (gate verbatim) | leading-verb + adjacency |
| "Retarget this review to protocol PRT-4iaey2 instead" | leading-verb + adjacency |
| "repoint the review to protocol PRT-4iaey2" | leading-verb |
| "re-aim this review at protocol PRT-4iaey2" | leading-verb |
| "reaim the review at protocol PRT-4iaey2" | leading-verb |
| "redirect the review to protocol PRT-4iaey2" | leading-verb |
| "switch this review to protocol PRT-4iaey2" | leading-verb |
| "repoint the review to a different protocol" | leading-verb + adjacency |
| "switch the review to another protocol" | leading-verb + adjacency |
| "retarget to protocol id PRT-4iaey2" | leading-verb (`protocol id` at gap 1) |
| "retarget the protocolId to PRT-4iaey2" | leading-verb + adjacency (`protocolid`) |
| "can you retarget the review to protocol PRT-4iaey2?" | strip -> leading-verb |
| "please switch this review to protocol PRT-4iaey2" | strip -> leading-verb |
| "retarget this review to PRT-4iaey2" (ID-only) | leading-verb (`to prt-`) |

FREE arms — must stay un-walled (all green):

| ask | why free |
|---|---|
| "retarget the draft step label so it matches the protocol wording" | blocker `so` breaks leading verb; adjacency gap > 3 |
| "switch the step wording so it reads like the vendor protocol document" | blocker `so`; no noun match |
| "retarget the note that references the protocol document on page 2" | blocker `that`; adjacency gap > 3 |
| "retarget the review so it points to protocol PRT-4iaey2" | blocker `so`; adjacency gap 5 > 3 (probe) |
| "switch the draft to protocol-style steps" | lookahead: `to protocol` cannot match `to protocol-style` (probe) |
| "switch the deck view to the freeform bench" | no protocol referent (probe; also unguarded surface in the real app) |
| "what does the protocol say about the wash step?" | no wall verb |
| "rename the draft so it reads like a protocol" | `rename` not a verb; blocker `so` |
| "does this draft follow the vendor protocol?" | no wall verb |
| "change step 3 to match the vendor text on page 2" | existing LEGIT_MENTION pin, unchanged |
| "reword step 3's label for our bench" | existing pin, unchanged |
| "Apply the change to protocol PRT-4iaey2 instead of this draft." | honestRefusal pin ask: `apply` is NOT a retarget verb — the model still runs there (pinned at orchestrator level too) |
| "why can you not retarget the review to protocol PRT-4iaey2?" | negation exemption on stripped remainder (probe) |

Surface scoping pinned: the gate ask (e) is FREE on event-editor,
workspace.deck, and undefined surface.

## 7. Observations 2+3 (informational, NO code — per scope)

- Obs 2 (affirmative bubble contradicting a failed tool outcome) and Obs 3
  ("proposing it now" promise with no artifact) are emission-truthfulness
  issues on the model-run path. This fix does NOT redesign emission. Effect of
  the wall: on the protocol-review surface, the retarget construction no longer
  reaches the model at all, so both observed artifacts are unreachable for
  this ask class (the refusal envelope path renders server-built prose). They
  remain open as report-level truthfulness findings for any OTHER ask that
  reaches the model with a failed tool call; no change attempted.
- The client-side protocolId-mismatch guard (ReviewAiPanel bait 3,
  ReviewAiPanel.test.tsx "chat cannot retarget") is untouched and still green;
  it remains the payload-side half for protocol_edit proposals.

## 8. Assumptions disclosed

1. Code name `RETARGET_NOT_ON_THIS_SURFACE` chosen to mirror the existing
   `PROMOTION_NOT_ON_THIS_SURFACE` naming (stable machine-readable code).
2. Nouns are regex patterns (the interpreter compiles them as such —
   `compileNoun`); the `(?![a-z-])` lookahead and `to prt-`/`at prt-` ID-shape
   nouns are DATA-level regexes, consistent with the file's existing
   `source_artifact` / `^CAN-` regex precedent. No interpreter change needed.
3. `switch` (and past/progressive forms) included per the task's named variant
   list ("retarget/repoint/re-aim/switch ... to protocol/<protocolId>"). Risk
   assessed: `switch` is a common word, but bare-`protocol` nouns are absent
   and the boundary arms (deck view, protocol-style) pin the over-block line.
4. Refusal message wording is server-built (like every other wall's message);
   the app test asserts it contains 'protocolId' and 'nothing was written'.
5. App tsc baseline at this tip is 23 (not the brief's 28 — lane baselines
   shift with trunk drift); the verified assertion is the empty set-diff.
6. No YAML reload was needed for tests (policy is loaded per call). The stack
   restart so the running gate stack serves the new YAML is the ORCHESTRATOR's
   step — not performed here.
7. Pre-existing debt untouched: 18 server src/ai test failures and 23 app tsc
   errors are trunk state, proven identical base-vs-head.

## 9. Gate re-shoot guidance for the orchestrator

After the stack restart, criterion-2 leg (e) should settle like a/b/c/d:
`✓write-wall failed` trace, red `review-ai-refusal` banner with the
"Retargeting the review to another protocolId is not available on this
surface..." wording, no Apply/Accept card, zero writes, and the server log
line `write-wall refusal surface=protocol-review code=RETARGET_NOT_ON_THIS_SURFACE`.

W2-9-G2DFIX DONE e1b62bd6 (fix commit; the branch tip commit carrying this report line is the commit that follows it — verify via `git log --oneline -1` on cl/W2-9-g2dfix-lane2-l2t0310)

---

# CYCLE-2 — adversarial fix run (advc-W29-g2dfix-c1-l2t0430, VERDICT: fix)

Review: /home/brad/.hermes/cl/lanes/2/reviews/advc-W29-g2dfix-c1-l2t0430.md
Base for this cycle: bf3d2987 (cycle-1 fix e1b62bd6 + report). Same worktree,
same branch. The cycle-1 DONE line above is the cycle-1 record; the DONE line at
the END of this file is the current branch state.

## 10. What cycle 2 changed (all DATA + tests; interpreter still ZERO change)

DEFECT 1 (blocker) — the criterion's OWN abstract construction
"Retarget this review to a different protocolId." (+ the reviewer's 8 §D.1
variants) fell through FREE. Closed by declaring the protocolId-SUFFIXED
qualifier class as nouns that START on the preposition:
`to a different protocolid`, `to another protocolid`, `to different protocolid`,
`to the protocolid`, `at a different protocolid`, `at another protocolid`,
`at the protocolid`. Because the match starts on `to`/`at`, no blocker word can
sit between the verb and the referent (the leading-verb trigger governs it), and
the adjacency gap is measured from `to` (gap 3 <= maxGapWords 3). Plural and
case-insensitivity come free: nouns are matched case-insensitively and
`protocolid` prefix-matches `protocolIds`. The criterion sentence is pinned
VERBATIM as a WALL test at BOTH levels (interpreter + orchestrator), and the
pins were run — see §11 RED and §12 GREEN.

DEFECT 2 (major) — the natural verbs the reviewer measured FREE with a concrete
id are now DATA verbs: `point/pointed/pointing`, `aim/aiming`, `move/moved`,
`route/routed/routing`, `send/sent` (same past/progressive shape as the existing
retarget/retargeted/retargeting triple). The reviewer's five §D.2 strings are
pinned WALL.

DEFECT 3 (major) — closed in DATA (the cheap ones, per the brief's preference):
`onto protocol`, `onto a protocol`, `onto prt-`, `onto a different protocolid`,
`towards|toward protocol`, `towards|toward a protocol`, `towards|toward prt-`,
`towards|toward a different protocolid`, `to use protocol`, `to use a protocol`,
`to use prt-`, and the reversed order `the prt-[^ ]+ protocol` /
`the can-[^ ]+ protocol`. All four §D.3 strings are pinned WALL.

DEFECT 4 (minor, over-block) — `switch to the protocol tab` and `switch the view
to the protocol tab` are now FREE. Fix applied is the brief's second option:
the two bare article nouns `to the protocol(?![a-z-])` and
`at the protocol(?![a-z-])` were REPLACED by id-requiring article forms
`to the protocol(?=\s+[a-z]+-)` and `at the protocol(?=\s+[a-z]+-)`, so the
retarget wall requires a retarget OBJECT (a record-id-shape token). DISCLOSURE:
this is the ONLY non-additive edit in the whole fix — 2 removed YAML lines, both
nouns, both replaced by a strictly narrower form in the same entry. It is
explicitly the reviewer's own fix direction for DEFECT 4 ("drop the bare
`to the protocol`/`at the protocol` nouns"). No existing test or gate arm
depended on the bare forms: gate ask (e) matches `to protocol` (no article), and
the cycle-1 boundary arms match `to a different protocol` / `to another
protocol` — all cycle-1 pinned arms re-run green at head (§12, §13: the cycle-1
pins are re-asserted in a dedicated regression test).

DEFECT 5 (report integrity) — this section: the criterion-sentence pin is
recorded, the residual gaps are listed explicitly (§15), and the cycle-1 §6
table's implication that the `protocolId` spelling was pinned is corrected here.

INTERPRETER CHANGE: STILL ZERO. `git diff --name-only` lists only the YAML and
the 2 server test files; no production `.ts`/`.tsx` is in the diff (verified:
`git diff --name-only | grep -E '\.(ts|tsx)$' | grep -v test` -> EMPTY).
`matching.maxGapWords`, `leadingVerb.blockerWords`, strip patterns and negation
tokens are untouched.

## 11. Changed paths (git diff --stat, cycle 2)

```
config/drafting/review-write-wall.yaml             | 104 +++++++++-
 .../ai/AgentOrchestrator.reviewWriteWall.test.ts   |  57 ++++++
 server/src/ai/reviewWriteWall.test.ts              | 217 +++++++++++++++++++++
 3 files changed, 376 insertions(+), 2 deletions(-)
```

Removed non-comment YAML lines (complete list, verbatim):
```
-      - to the protocol(?![a-z-])
-      - at the protocol(?![a-z-])
```

## 12. RED evidence (tests written BEFORE the YAML edit)

RED was captured twice: first against the cycle-1 YAML as committed (9 failed),
then — after the DATA edit — again by swapping ONLY the YAML back to
`git show HEAD:config/drafting/review-write-wall.yaml` while keeping the FINAL
test file, so the RED block below is the honest RED of the final suite. The head
YAML was then restored byte-identical (`diff -q` -> RESTORED_IDENTICAL).

`npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts`
against the cycle-1 YAML:
```
 Test Files  2 failed (2)
      Tests  9 failed | 44 passed (53)
   Start at  06:04:56
   Duration  4.86s (transform 914ms, setup 0ms, collect 3.19s, tests 411ms, environment 0ms, prepare 1.06s)
```

Failing test names (verbatim, all 9):
```
FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > protocol-review write-wall refusal (W2-89 g2b-1/2) > g2dfix2 DEFECT-1: "Retarget this review to a different protocolId." refuses deterministically with the declared envelope
FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > protocol-review write-wall refusal (W2-89 g2b-1/2) > g2dfix2 DEFECT-2: "point this review at PRT-4iaey2" refuses deterministically with the declared envelope
FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > protocol-review write-wall refusal (W2-89 g2b-1/2) > g2dfix2 DEFECT-4 boundary: "switch the view to the protocol tab" is NOT walled (the model runs)
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 accepted-residual boundary: undocumented frames stay FREE (visible residual)
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 DEFECT-1: the criterion sentence "Retarget this review to a different protocolId." fires RETARGET_NOT_ON_THIS_SURFACE
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 DEFECT-1: the reviewer's abstract-construction probes (review §D.1) all fire
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 DEFECT-2: the natural retarget verbs (review §D.2) fire RETARGET_NOT_ON_THIS_SURFACE
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 DEFECT-3: alternate retarget frames (review §D.3) fire RETARGET_NOT_ON_THIS_SURFACE
FAIL  src/ai/reviewWriteWall.test.ts > review write-wall policy interpreter (W2-89 g2b-1/2) > g2dfix2 DEFECT-4: panel-navigation asks stay FREE (review §D.4)
```

Per-string assertion lines (verbatim, the reviewer's own strings failing):
```
→ criterion-2 leg (e) abstract construction is unwalled: expected null not to be null
→ DEFECT-1 abstract ask not walled: Retarget this review to a different protocolId.: expected null not to be null
→ DEFECT-2 natural-verb ask not walled: point this review at PRT-4iaey2: expected null not to be null
→ DEFECT-3 alternate-frame ask not walled: retarget the review towards protocol PRT-4iaey2: expected null not to be null
→ DEFECT-4 over-block: switch to the protocol tab: expected { …(2) } to be null
→ expected { …(2) } to be undefined
→ expected undefined not to be undefined
→ residual unexpectedly walled: retarget this review to the protocol: expected { …(2) } to be null
```

Note the DEFECT-4 legs: `expected { …(2) } to be null` is the OVER-BLOCK
direction (a refusal object where null was required) — RED in the opposite
direction from DEFECTS 1-3, which is exactly what a leak+over-block pair looks
like.

## 13. GREEN battery (verbatim vitest blocks, spliced from raws)

CODER-CAPTURED raws: /tmp/w29c2_RED_final.raw, /tmp/w29c2_green_final2.raw,
/tmp/w29c2_server_head_final.raw, /tmp/w29c2_server_base.raw,
/tmp/w29c2_app_dir_final.raw, /tmp/w29c2_app_pair.raw, /tmp/w29c2_sweep2.raw,
/tmp/w29c2_server_tsc_final.raw, /tmp/w29c2_app_tsc_head.raw,
/tmp/w29c2_app_tsc_base.raw (lane-2 worktree, serialized one suite at a time).

Wall suite + orchestrator wall + honestRefusal pin (56 tests; 43 at cycle 1,
+13 new cycle-2 pins):
```
 ✓ src/ai/reviewWriteWall.test.ts  (38 tests) 327ms
 ✓ src/ai/AgentOrchestrator.honestRefusal.test.ts  (2 tests) 24ms
 ✓ src/ai/AgentOrchestrator.reviewWriteWall.test.ts  (16 tests) 228ms
 Test Files  3 passed (3)
      Tests  56 passed (56)
   Start at  06:05:53
   Duration  3.30s (transform 842ms, setup 0ms, collect 2.64s, tests 579ms, environment 0ms, prepare 265ms)
```

Full server src/ suite at HEAD:
```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 784 passed (802)
     Errors  2 errors
   Start at  06:06:31
   Duration  11.53s (transform 11.13s, setup 24ms, collect 87.35s, tests 23.47s, environment 29ms, prepare 18.48s)
```
Same suite on the STASHED base (cycle-2 YAML + cycle-2 tests removed, same tree):
```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 771 passed (789)
     Errors  2 errors
   Start at  06:02:50
   Duration  11.38s (transform 9.19s, setup 20ms, collect 106.26s, tests 25.18s, environment 63ms, prepare 26.23s)
```
Zero-new proof — `comm -3` of the sorted FAIL-file lists AND of the sorted FAIL
test lines, base vs head: BOTH EMPTY (10 files / 18 tests identical:
AgentOrchestrator.bypass, AgentOrchestratorForwarding, AgentOrchestrator.golden,
AgentOrchestrator.goldenWithSeeds, AgentOrchestrator.tubeGate,
attachedProtocol, ChatbotCompileDeckSlot, chatbotCompile.e2e, createRecordIntent,
submitSuggestionTool.tubeSchema). The delta is exactly +13 passing tests (the
new pins). The `Errors 2 errors` line is identical base->head (pre-existing
unhandled-exception debt, not introduced here).

App protocol-review directory (10 files, unchanged set — no app file was touched):
```
 ✓ src/ingestion/protocol-review/axisLabels.test.ts  (11 tests) 5ms
 ✓ src/ingestion/protocol-review/semanticDraft.test.ts  (11 tests) 10ms
 ✓ src/ingestion/protocol-review/reviewAiPanel.writeWall.test.ts  (5 tests) 33ms
 ✓ src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx  (6 tests) 57ms
 ✓ src/ingestion/protocol-review/SaidFactsPane.test.tsx  (4 tests) 112ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.honestRefusal.test.tsx  (2 tests) 52ms
 ✓ src/ingestion/protocol-review/SemanticDraftPanel.test.tsx  (10 tests) 118ms
 ✓ src/ingestion/protocol-review/BranchQuestionsPanel.test.tsx  (13 tests) 344ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx  (7 tests) 283ms
 ✓ src/ingestion/protocol-review/ReviewAiPanel.test.tsx  (10 tests) 314ms
 Test Files  10 passed (10)
      Tests  79 passed (79)
   Start at  06:07:25
   Duration  4.89s (transform 1.12s, setup 461ms, collect 2.69s, tests 1.33s, environment 28.01s, prepare 3.38s)
```

App ReviewAiPanel pair named in the brief:
```
 Test Files  2 passed (2)
      Tests  17 passed (17)
   Start at  06:07:04
   Duration  11.14s (transform 497ms, setup 1.85s, collect 2.59s, tests 496ms, environment 12.35s, prepare 146ms)
```

Typecheck:
- server `npx tsc --noEmit`: exit 0, `grep -c 'error TS'` -> 0.
- app `npx tsc --noEmit`: 23 `error TS` at base AND 23 at head; `diff` of the
  two full outputs is EMPTY (set-diff empty, zero new). Same 23 as cycle 1 at
  this tip; the verified assertion is the empty set-diff.

## 14. Probe sweep (reviewer's FULL probe sets + cycle-2 arms; per-string)

Captured by a temporary vitest probe file (written, run, deleted; `git status`
clean afterwards — no probe file is committed). 99 arms, 63 expected-WALL,
36 expected-FREE, 0 mismatches: `SWEEP_TOTAL 99 WALL 63 FREE 36 MISMATCH 0`.

### §C.1 — reviewer cycle-1 WALL arms (re-pinned, no regression)
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget this review to protocol PRT-4iaey2 instead.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `RETARGET THIS REVIEW TO PROTOCOL PRT-4IAEY2 INSTEAD.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Please retarget this review to protocol PRT-4iaey2.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `repoint this review to PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch this review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `re-aim the review at protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `redirect the review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `can you retarget this review to protocol PRT-4iaey2?` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch over to protocol PRT-4iaey2` |

### §D.1 — DEFECT-1 blocker, reviewer strings verbatim
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget this review to a different protocolId.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget the review to a different protocolId instead.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget this review to a different protocolId instead` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to another protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to different protocolIds` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch this review to a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `repoint the review to a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `redirect the review to a different protocolId` |

### §D.2 — DEFECT-2 major, reviewer strings verbatim
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `point this review at PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `aim this review at protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `move this review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `route this review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `send this review to protocol PRT-4iaey2` |

### §D.3 — DEFECT-3 major, reviewer strings verbatim
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review onto protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget the review towards protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to use protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch the review to the PRT-4iaey2 protocol` |

### cycle-2 extra WALL arms (my own variants)
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `RETARGET THIS REVIEW TO A DIFFERENT PROTOCOLID.` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget this review to Another ProtocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to a different protocolIds` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `re-aim this review at a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review at another protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `pointed the review at protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `aiming the review at protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `moved this review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `routing the review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `sent the review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `move this review to a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `send this review to another protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `point this review at a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review toward protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `repoint the review onto a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `redirect the review towards a different protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review onto PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review towards PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch the review to the PRT-4iaey2 protocolId` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch this review into protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget this review to the protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `re-aim this review at the protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch this review to the protocol CAN-w29-gate` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `can you move this review to protocol PRT-4iaey2?` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `please point the review at protocol PRT-4iaey2` |

### cycle-1 pins kept (no regression from the narrowed nouns)
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `Retarget this review to protocol PRT-4iaey2 instead` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `repoint the review to protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `reaim the review at protocol PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `repoint the review to a different protocol` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch the review to another protocol` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget to protocol id PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `retarget the protocolId to PRT-4iaey2` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `please switch this review to protocol PRT-4iaey2` |

### ACCEPTED over-block residual — pinned WALL so the residual is visible
| expected | actual | ask |
|---|---|---|
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch to the PRT-4iaey2 protocol tab` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch the view to the PRT-4iaey2 protocol tab` |
| WALL | RETARGET_NOT_ON_THIS_SURFACE | `switch the review to another protocol tab` |

### §C.2 — reviewer FREE arms (re-pinned, no regression)
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `what does this protocol say?` |
| FREE | FREE (no wall) | `change step 3 to match the vendor text on page 2` |
| FREE | FREE (no wall) | `switch the draft to protocol-style steps` |
| FREE | FREE (no wall) | `Apply the change to protocol PRT-4iaey2 instead of this draft.` |
| FREE | FREE (no wall) | `retarget the draft step label so it matches the protocol wording` |
| FREE | FREE (no wall) | `switch the deck view to the freeform bench` |
| FREE | FREE (no wall) | `why can you not retarget the review to protocol PRT-4iaey2?` |

### §D.4 — DEFECT-4 over-block, reviewer strings verbatim (now FREE)
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `switch to the protocol tab` |
| FREE | FREE (no wall) | `switch the view to the protocol tab` |

### cycle-2 extra FREE arms (nav class with the new verbs)
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `switch the panel to the protocol tab` |
| FREE | FREE (no wall) | `move the view to the protocol tab` |
| FREE | FREE (no wall) | `send the panel to the protocol tab` |
| FREE | FREE (no wall) | `switch over to the protocol tab` |
| FREE | FREE (no wall) | `switch to the protocol tab and show the steps` |

### cycle-1 boundary pins kept
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `retarget the review so it points to protocol PRT-4iaey2` |
| FREE | FREE (no wall) | `switch the step wording so it reads like the vendor protocol document` |
| FREE | FREE (no wall) | `retarget the note that references the protocol document on page 2` |
| FREE | FREE (no wall) | `what does the protocol say about the wash step?` |
| FREE | FREE (no wall) | `rename the draft so it reads like a protocol` |
| FREE | FREE (no wall) | `does this draft follow the vendor protocol?` |
| FREE | FREE (no wall) | `reword step 3’s label for our bench` |
| FREE | FREE (no wall) | `why can you not retarget the review to a different protocolId?` |

### ACCEPTED leak-side residual — pinned FREE so the residual is visible
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `retarget this review to the protocol` |
| FREE | FREE (no wall) | `switch this review to the protocol` |
| FREE | FREE (no wall) | `retarget this review for protocol PRT-4iaey2` |

### new-verb over-block probes (legit asks, stay FREE)
| expected | actual | ask |
|---|---|---|
| FREE | FREE (no wall) | `move the incubation step to the end of the draft` |
| FREE | FREE (no wall) | `move step 3 so it reads like the vendor text` |
| FREE | FREE (no wall) | `send the wash step notes to the draft comments` |
| FREE | FREE (no wall) | `point out the step that references the pdf` |
| FREE | FREE (no wall) | `aim the draft label at the bench wording` |
| FREE | FREE (no wall) | `route the draft step label so it matches the vendor text` |
| FREE | FREE (no wall) | `move the review so it points to protocol PRT-4iaey2` |
| FREE | FREE (no wall) | `retarget the review so it points to a different protocolId` |
| FREE | FREE (no wall) | `switch to the protocol view` |
| FREE | FREE (no wall) | `send the review to the vendor protocol document` |
| FREE | FREE (no wall) | `what does the PRT-4iaey2 protocol say?` |

## 15. Residual-risk list (explicit; nothing here is silent)

> CORRECTION (cycle 3, advc-W29-g2dfix-c2 DEFECT-3): as written at the
> cycle-2 head this claim was FALSE — the DEFECT-1/DEFECT-2 leaks measured in
> the c2 review were neither pinned nor listed here, and the R4 row said
> "not pinned". Cycle 3 closes the DEFECT-1/2 leaks, pins the R4 arms as
> visible tests, and adds the newly measured residuals. The AUTHORITATIVE
> residual table is now §21 (cycle 3): every row there is pinned in the
> committed suite. This §15 table is kept as the cycle-2 historical record.

Every row below is pinned in the committed suite so a later reviewer can see the
boundary move, and each is named in the YAML comment block.

| # | residual | direction | pinned as | why accepted |
|---|---|---|---|---|
| R1 | `retarget this review to the protocol` / `switch this review to the protocol` (bare article frame, NO id) | LEAK | FREE test 'accepted-residual boundary' | the direct price of DEFECT-4's fix: an article noun that does not demand an id is what swallowed the panel nav ask. A retarget with no id and no `protocol`-adjacent id is also the weakest form of the attack (no target is named). |
| R2 | `retarget this review for protocol PRT-4iaey2` | LEAK | FREE test 'accepted-residual boundary' | `for` is not a retarget-object preposition in this DATA; adding it risks the same over-block class as DEFECT 4. |
| R3 | `switch to the PRT-4iaey2 protocol tab` / `switch the view to the PRT-4iaey2 protocol tab` / `switch the review to another protocol tab` | OVER-BLOCK | WALL test 'accepted-residual boundary: id-named nav asks stay WALL' | DATA cannot tell "open that protocol's tab" from "retarget to that protocol" once a literal record id sits inside the article frame. Same ambiguity class the file already accepts (the W2-11 D3 honest arm). Narrow: needs a literal id token in the nav phrase. |
| R4 | qualifier class with a preposition NOT declared for the id-suffixed form (e.g. `onto the protocolId`, `towards the protocol PRT-...` with an article) | LEAK | not pinned (documented here) | the id-suffixed qualifier class was declared for `to`/`at`/`onto`/`towards`/`toward` without articles; the article+id-suffix combination is a compound variant. Cheap to add in a later cycle if a gate ask shows it. |
| R5 | `switch this review into protocol PRT-4iaey2` | covered, not residual | pinned WALL | fires only because the existing `to protocol` noun matches INSIDE `into protocol` (substring semantics of the interpreter's noun regexes). Documented so nobody reads it as an intentional `into` frame. |

## 16. Assumptions disclosed (cycle 2)

1. The DEFECT-4 fix took the brief's SECOND option (drop/replace the bare
   article nouns) rather than narrowing the `switch` verb tuple, because the
   interpreter has no per-verb noun binding — verbs and nouns are two flat lists
   per wall, so "require the retarget object for `switch` only" is not
   expressible in this DATA shape without an interpreter change (prohibited).
   Making the article nouns id-requiring narrows the whole entry's article frame
   uniformly, which is the smallest change that closes the over-block.
2. Noun PATTERNS are lowercased by the interpreter too
   (`compileNoun(noun.toLowerCase())`, `new RegExp(noun.toLowerCase(), 'gi')`),
   so an uppercase escape in a YAML noun silently changes meaning — `\S` became
   `\s` and the first reversed-order noun attempt failed RED for exactly this
   reason. The committed reversed-order nouns use only lowercase-safe escapes
   (`[^ ]`). No interpreter change was made to work around this; the DATA was
   written to fit the interpreter as it exists.
3. `point`/`aim`/`move`/`route`/`send` are common words; the over-block probes
   for them are pinned FREE in §14 ("move the incubation step to the end of the
   draft", "send the wash step notes to the draft comments", "point out the step
   that references the pdf", "aim the draft label at the bench wording",
   "route the draft step label so it matches the vendor text", "move the draft
   to the protocol-style steps"). They fire only when a protocol/protocolId/
   record-id referent sits in the object position.
4. `move`/`send` etc. were NOT added to any other wall; only `retarget-protocol`
   changed. The other four walls' verbs/nouns are byte-identical to cycle 1.
5. No YAML reload was performed for the running stack (policy is loaded per
   call, so tests are correct without one). Making the running gate stack serve
   the new YAML is the ORCHESTRATOR's restart step — not performed here.
6. Pre-existing debt untouched and proven identical base->head: 10 failing
   server src/ai files / 18 tests, `Errors 2 errors`, 23 app tsc errors.
7. No app file was modified in cycle 2 (the app half of the wall renders the
   server-built envelope, which cycle 1 already pinned); the app batteries were
   re-run anyway to prove the narrowed DATA did not disturb the client pins.

## 17. Gate re-shoot guidance for the orchestrator (cycle 2)

After the stack restart, criterion-2 leg (e) should now fail visibly for BOTH
spellings: the concrete-id gate sentence AND the criterion's own abstract
"Retarget this review to a different protocolId." — red `review-ai-refusal`
banner with the "Retargeting the review to another protocolId is not available
on this surface..." wording, no Apply/Accept card, zero writes, and the server
log line `write-wall refusal surface=protocol-review code=RETARGET_NOT_ON_THIS_SURFACE`.
The panel nav ask ("switch to the protocol tab") must NOT show that banner; if
it does, that is residual R3 firing and should come back as a defect, not a
pass.

W2-9-G2DFIX2 DONE df2952f6


---

# W2-9-G2DFIX CYCLE-3 (advc-W29-g2dfix-c2-l2t0630, VERDICT: fix)

## 18. What cycle 3 changed (all DATA + tests; interpreter still ZERO change)

DEFECT 1 (major) — the five retarget variants that fell FREE at the cycle-2
head (review §D DEFECT 1) now WALL. Closed in DATA, at the root causes the
reviewer named:
- verbs: `reassign/reassigned/reassigning`, `target/targeted/targeting`
  (same past/progressive shape as the existing families).
- nouns: `to the different protocolid` and `at the different protocolid`
  (the missing member of the id-suffixed qualifier class);
  `to the protocol id(?=\s+[a-z]+-)` and `at the protocol id(?=\s+[a-z]+-)`
  (the spaced article form — the old article noun required the hyphen
  immediately and the bare `protocol id` sat behind the blocker `to` at gap
  4 > maxGapWords 3; the new nouns START on `to`/`at`, so no blocker token
  can sit between verb and referent and the gap is measured from the
  preposition, and the spaced form demands a record-id token);
  `to "prt-` and `at "prt-` (the quoted-id frame — the quote broke `to prt-`).
All five reviewer strings are pinned VERBATIM as WALL tests at BOTH levels
(interpreter + orchestrator), and the pins were run — see §20 RED and §22
sweep.

DEFECT 2 (minor, over-block) — `move the draft to protocol format`, `move the
draft to protocol steps`, `route the draft to protocol guidance`, `point the
draft at protocol examples` were refused: the cycle-2 common verbs
(move/route/point/send) combined with the bare `to protocol`/`at protocol`
nouns to swallow ordinary MEANT asks that merely mention a protocol context.
The bare frames now REQUIRE the retarget OBJECT — the same narrowing class
cycle 2 applied to the article nouns (c1 DEFECT-4):
`to protocol(?=\s+[a-z]+-)`, `at protocol(?=\s+[a-z]+-)`,
`onto protocol(?=\s+[a-z]+-)`, `towards protocol(?=\s+[a-z]+-)`,
`toward protocol(?=\s+[a-z]+-)`. The `a protocol`/qualifier forms are NOT
narrowed — they carry the pinned qualifier-class WALL arms (`repoint the
review to a different protocol`, `switch the review to another protocol tab`).
Concrete-id retargets in these frames still fire, including the substring
behaviour (`to protocol` matches inside `into protocol PRT-...` — the pinned
R5 arm re-runs green). The reviewer's FREE arms are re-pinned, at the
interpreter AND orchestrator level.

DEFECT 3 (report integrity) — §15 carries an explicit correction (the
"nothing here is silent" claim was false at the cycle-2 head), and §23 is the
new AUTHORITATIVE residual table: every row is pinned as a visible test in
the committed suite. The c2 R4 row said "not pinned" — its arms are now
pinned FREE in the 'g2dfix3 accepted-residual boundary' test.

DEFECT 4 (documentation) — the YAML comment (cycle-2 block, item (4)) named
patterns that do not exist in the file (`to the prt-`, `at the prt-`,
`to the protocolid`, `at the protocolid` as the article-noun replacements).
The comment now names the committed patterns
`to the protocol(?=\s+[a-z]+-)` / `at the protocol(?=\s+[a-z]+-)` and
records the correction. The report's §10 already named the correct patterns
(grep confirms the report never carried the wrong names — the inaccuracy was
the YAML comment only).

INTERPRETER CHANGE: STILL ZERO. `git diff --name-only df2952f6..HEAD | grep
-E '\.(ts|tsx)$' | grep -v -i test` -> EMPTY. `matching.maxGapWords`,
`leadingVerb.blockerWords`, strip patterns and negation tokens are untouched.

Non-additive YAML edits (complete list of removed non-comment lines,
verbatim — 5 noun lines, each REPLACED in place by a strictly narrower
id-requiring form in the same entry):
```
-      - to protocol(?![a-z-])
-      - at protocol(?![a-z-])
-      - onto protocol(?![a-z-])
-      - towards protocol(?![a-z-])
-      - toward protocol(?![a-z-])
```
No pinned WALL arm depends on a removed spelling: every pinned arm in these
frames names a concrete id (`retarget this review onto protocol PRT-4iaey2`,
`retarget the review towards protocol PRT-4iaey2`, `retarget this review
toward protocol PRT-4iaey2`, `move this review to protocol PRT-4iaey2`, gate
ask (e)) and re-runs green at head (§22). The 2 remaining removed lines are
the corrected comment pair.

## 19. Changed paths (git diff --stat, cycle 3 fix commit)

```
 config/drafting/review-write-wall.yaml             | 101 +++++++++++++-
 .../ai/AgentOrchestrator.reviewWriteWall.test.ts   |  50 +++++++
 server/src/ai/reviewWriteWall.test.ts              | 145 +++++++++++++++++++++
 3 files changed, 289 insertions(+), 7 deletions(-)
```
(plus this report file in the docs commit; interpreter `.ts` diff EMPTY.)

## 20. RED evidence (tests written BEFORE the YAML edit)

RED captured with the FINAL test files against the committed cycle-2 YAML
(the DATA edit came after):

```
 Test Files  2 failed | 1 passed (3)
      Tests  7 failed | 57 passed (64)
```

Failing tests (verbatim vitest headers):
```
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2dfix3 DEFECT-1: the reviewer's c2 leak strings (review §D DEFECT 1) fire RETARGET_NOT_ON_THIS_SURFACE
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2dfix3 DEFECT-2: bare non-id `protocol <common-noun>` objects stay FREE (review §D DEFECT 2)
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2dfix3 accepted-residual boundary: the narrowed no-id frames stay FREE (visible leak)
 FAIL  src/ai/reviewWriteWall.test.ts > ... > g2dfix3 accepted-residual boundary: the new-verb over-block surface stays WALL (visible)
 FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > ... > g2dfix3 DEFECT-1: "reassign this review to protocol PRT-4iaey2" refuses deterministically with the declared envelope
 FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > ... > g2dfix3 DEFECT-1: "target this review to protocol PRT-4iaey2 instead" refuses deterministically with the declared envelope
 FAIL  src/ai/AgentOrchestrator.reviewWriteWall.test.ts > ... > g2dfix3 DEFECT-2 boundary: "move the draft to protocol format" is NOT walled (the model runs)
```

Independent RED reproduction (worktree policy untouched): the cycle-2 policy
extracted via `git show df2952f6:config/drafting/review-write-wall.yaml` ->
/tmp/yaml_c2.yaml; each string run against BOTH policies (throwaway probe,
deleted after the run):

```
D1 c2=FREE head=WALL RETARGET_NOT_ON_THIS_SURFACE  retarget this review to the different protocolId
D1 c2=FREE head=WALL RETARGET_NOT_ON_THIS_SURFACE  retarget this review to the protocol id PRT-4iaey2
D1 c2=FREE head=WALL RETARGET_NOT_ON_THIS_SURFACE  reassign this review to protocol PRT-4iaey2
D1 c2=FREE head=WALL RETARGET_NOT_ON_THIS_SURFACE  retarget this review to "PRT-4iaey2"
D1 c2=FREE head=WALL RETARGET_NOT_ON_THIS_SURFACE  target this review to protocol PRT-4iaey2 instead
D2 c2=WALL RETARGET_NOT_ON_THIS_SURFACE head=FREE  move the draft to protocol format
D2 c2=WALL RETARGET_NOT_ON_THIS_SURFACE head=FREE  move the draft to protocol steps
D2 c2=WALL RETARGET_NOT_ON_THIS_SURFACE head=FREE  route the draft to protocol guidance
D2 c2=WALL RETARGET_NOT_ON_THIS_SURFACE head=FREE  point the draft at protocol examples
```

## 21. GREEN battery (verbatim vitest blocks, spliced from raws)

Targeted server suites (reviewWriteWall + AgentOrchestrator.reviewWriteWall +
AgentOrchestrator.honestRefusal):
```
 Test Files  3 passed (3)
      Tests  64 passed (64)
```
App pair (ReviewAiPanel.writeWall + ReviewAiPanel):
```
 Test Files  2 passed (2)
      Tests  17 passed (17)
```
Server tsc: `npx --no-install tsc --noEmit` -> exit 0, zero output.
App tsc: 23 `error TS` (the standing baseline); `grep -c writeWall` on the
same output -> 0. No app file is in the cycle-3 diff, so the app base-vs-head
tsc set-diff is EMPTY by construction.
Full server `src/ai` suite at HEAD:
```
 Test Files  10 failed | 87 passed (97)
      Tests  18 failed | 792 passed (810)
     Errors  2 errors
```
The 10 failing files are bypass / AgentOrchestratorForwarding / golden /
goldenWithSeeds / tubeGate / attachedProtocol / ChatbotCompileDeckSlot /
chatbotCompile.e2e / createRecordIntent / submitSuggestionTool.tubeSchema —
the SAME list the c2 review recorded (zero-new; none is reviewWriteWall*).
The +8 passing tests vs the c2 review's 784 are exactly the 8 new cycle-3
pins (5 interpreter + 3 orchestrator). `Errors 2 errors` is the pre-existing
src/ai unhandled-error debt, unchanged base->head.

## 22. Full probe sweep (cycle-3 head; per-string)

Captured by a throwaway vitest probe file (written, run, deleted; `git
status` clean afterwards — no probe file is committed). 158 arms, 94
expected-WALL, 64 expected-FREE, 0 mismatches:
`SWEEP_TOTAL 158 WALL 94 FREE 64 MISMATCH 0`, plus a 3-arm residual addendum
`ADDENDUM_TOTAL 3 MISMATCH 0` (rows in §23 R6/R2). Every previously-WALL
string STILL walls (zero regressions) and every benign arm stays FREE.

### C.1 — reviewer c2 §C.1 WALL arms (re-run: every previously-WALL string STILL walls)
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `Retarget this review to protocol PRT-4iaey2 instead.` |
| WALL | WALL | `RETARGET THIS REVIEW TO PROTOCOL PRT-4IAEY2 INSTEAD.` |
| WALL | WALL | `Please retarget this review to protocol PRT-4iaey2.` |
| WALL | WALL | `repoint this review to PRT-4iaey2` |
| WALL | WALL | `switch this review to protocol PRT-4iaey2` |
| WALL | WALL | `re-aim the review at protocol PRT-4iaey2` |
| WALL | WALL | `redirect the review to protocol PRT-4iaey2` |
| WALL | WALL | `can you retarget this review to protocol PRT-4iaey2?` |
| WALL | WALL | `retarget this review to PRT-4iaey2` |
| WALL | WALL | `switch over to protocol PRT-4iaey2` |

### C.2 — reviewer c2 §C.2 FREE arms (re-run)
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `what does this protocol say?` |
| FREE | FREE | `change step 3 to match the vendor text on page 2` |
| FREE | FREE | `switch the draft to protocol-style steps` |
| FREE | FREE | `Apply the change to protocol PRT-4iaey2 instead of this draft.` |
| FREE | FREE | `retarget the draft step label so it matches the protocol wording` |
| FREE | FREE | `switch the deck view to the freeform bench` |
| FREE | FREE | `why can you not retarget the review to protocol PRT-4iaey2?` |

### D1 — reviewer c2 §C.3 D1 arms
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `Retarget this review to a different protocolId.` |
| WALL | WALL | `Retarget the review to a different protocolId instead.` |
| WALL | WALL | `retarget this review to another protocolId` |
| WALL | WALL | `retarget this review to different protocolIds` |
| WALL | WALL | `switch this review to a different protocolId` |
| WALL | WALL | `repoint the review to a different protocolId` |
| WALL | WALL | `redirect the review to a different protocolId` |

### D2 — reviewer c2 §C.3 D2 arms
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `point this review at PRT-4iaey2` |
| WALL | WALL | `aim this review at protocol PRT-4iaey2` |
| WALL | WALL | `move this review to protocol PRT-4iaey2` |
| WALL | WALL | `route this review to protocol PRT-4iaey2` |
| WALL | WALL | `send this review to protocol PRT-4iaey2` |

### D3 — reviewer c2 §C.3 D3 arms
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `retarget this review onto protocol PRT-4iaey2` |
| WALL | WALL | `retarget the review towards protocol PRT-4iaey2` |
| WALL | WALL | `retarget this review to use protocol PRT-4iaey2` |
| WALL | WALL | `switch the review to the PRT-4iaey2 protocol` |

### D4 — reviewer c2 §C.3 D4 arms
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `switch to the protocol tab` |
| FREE | FREE | `switch the view to the protocol tab` |

### NEW — reviewer c2 §C.3 NEW arms (previously-WALL: zero regressions)
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `Retarget this review to a different protocolId` |
| WALL | WALL | `RETARGET THIS REVIEW TO A DIFFERENT PROTOCOLID.` |
| WALL | WALL | `retarget this review to a different protocolids` |
| WALL | WALL | `retarget this review to a different protocolID` |
| WALL | WALL | `retarget this review now to protocol PRT-4iaey2` |
| WALL | WALL | `please retarget this review to a different protocolId` |
| WALL | WALL | `can you please retarget this review to a different protocolId?` |
| WALL | WALL | `retarget this review to the protocol PRT-4iaey2` |
| WALL | WALL | `retarget this review onto a different protocolId` |

### D1LEAK — c2 DEFECT-1 leak strings (measured FREE at c2 head -> WALL at c3 head)
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `retarget this review to the different protocolId` |
| WALL | WALL | `retarget this review to the protocol id PRT-4iaey2` |
| WALL | WALL | `reassign this review to protocol PRT-4iaey2` |
| WALL | WALL | `retarget this review to "PRT-4iaey2"` |
| WALL | WALL | `target this review to protocol PRT-4iaey2 instead` |

### D2OB — c2 DEFECT-2 over-block strings (measured WALL at c2 head -> FREE at c3 head)
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `move the draft to protocol format` |
| FREE | FREE | `move the draft to protocol steps` |
| FREE | FREE | `route the draft to protocol guidance` |
| FREE | FREE | `point the draft at protocol examples` |

### OVER — reviewer c2 §C.3 OVER arms
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `compare this draft to protocol PRT-4iaey2` |
| FREE | FREE | `switch the review tab to the protocol view` |
| FREE | FREE | `send this to the protocol team for review` |
| FREE | FREE | `open the protocol document on page 2` |

### PIN — cycle-1/cycle-2 committed pins (no-regression re-run)
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `Retarget this review to protocol PRT-4iaey2 instead` |
| WALL | WALL | `repoint the review to protocol PRT-4iaey2` |
| WALL | WALL | `re-aim this review at protocol PRT-4iaey2` |
| WALL | WALL | `reaim the review at protocol PRT-4iaey2` |
| WALL | WALL | `repoint the review to a different protocol` |
| WALL | WALL | `switch the review to another protocol` |
| WALL | WALL | `retarget to protocol id PRT-4iaey2` |
| WALL | WALL | `retarget the protocolId to PRT-4iaey2` |
| WALL | WALL | `please switch this review to protocol PRT-4iaey2` |
| WALL | WALL | `Retarget the review to a different protocolId instead.` |
| WALL | WALL | `Retarget this review to a different protocolId instead` |
| WALL | WALL | `Retarget this review to Another ProtocolId` |
| WALL | WALL | `retarget this review to a different protocolIds` |
| WALL | WALL | `re-aim this review at a different protocolId` |
| WALL | WALL | `retarget this review at another protocolId` |
| WALL | WALL | `pointed the review at protocol PRT-4iaey2` |
| WALL | WALL | `aiming the review at protocol PRT-4iaey2` |
| WALL | WALL | `moved this review to protocol PRT-4iaey2` |
| WALL | WALL | `routing the review to protocol PRT-4iaey2` |
| WALL | WALL | `sent the review to protocol PRT-4iaey2` |
| WALL | WALL | `move this review to a different protocolId` |
| WALL | WALL | `send this review to another protocolId` |
| WALL | WALL | `point this review at a different protocolId` |
| WALL | WALL | `retarget this review toward protocol PRT-4iaey2` |
| WALL | WALL | `repoint the review onto a different protocolId` |
| WALL | WALL | `redirect the review towards a different protocolId` |
| WALL | WALL | `retarget this review onto PRT-4iaey2` |
| WALL | WALL | `retarget this review towards PRT-4iaey2` |
| WALL | WALL | `switch the review to the PRT-4iaey2 protocolId` |
| WALL | WALL | `switch this review into protocol PRT-4iaey2` |
| WALL | WALL | `re-aim this review at the protocol PRT-4iaey2` |
| WALL | WALL | `switch this review to the protocol CAN-w29-gate` |
| WALL | WALL | `can you move this review to protocol PRT-4iaey2?` |
| WALL | WALL | `please point the review at protocol PRT-4iaey2` |
| WALL | WALL | `switch to the PRT-4iaey2 protocol tab` |
| WALL | WALL | `switch the view to the PRT-4iaey2 protocol tab` |
| WALL | WALL | `switch the review to another protocol tab` |
| FREE | FREE | `retarget the review so it points to protocol PRT-4iaey2` |
| FREE | FREE | `switch the step wording so it reads like the vendor protocol document` |
| FREE | FREE | `retarget the note that references the protocol document on page 2` |
| FREE | FREE | `what does the protocol say about the wash step?` |
| FREE | FREE | `rename the draft so it reads like a protocol` |
| FREE | FREE | `does this draft follow the vendor protocol?` |
| FREE | FREE | `reword step 3’s label for our bench` |
| FREE | FREE | `why can you not retarget the review to a different protocolId?` |
| FREE | FREE | `switch the panel to the protocol tab` |
| FREE | FREE | `move the view to the protocol tab` |
| FREE | FREE | `send the panel to the protocol tab` |
| FREE | FREE | `switch over to the protocol tab` |
| FREE | FREE | `switch to the protocol tab and show the steps` |
| FREE | FREE | `move the incubation step to the end of the draft` |
| FREE | FREE | `move step 3 so it reads like the vendor text` |
| FREE | FREE | `send the wash step notes to the draft comments` |
| FREE | FREE | `point out the step that references the pdf` |
| FREE | FREE | `aim the draft label at the bench wording` |
| FREE | FREE | `route the draft step label so it matches the vendor text` |
| FREE | FREE | `move the review so it points to protocol PRT-4iaey2` |
| FREE | FREE | `retarget the review so it points to a different protocolId` |
| FREE | FREE | `switch to the protocol view` |
| FREE | FREE | `send the review to the vendor protocol document` |
| FREE | FREE | `what does the PRT-4iaey2 protocol say?` |
| FREE | FREE | `retarget this review to the protocol` |
| FREE | FREE | `switch this review to the protocol` |
| FREE | FREE | `retarget this review for protocol PRT-4iaey2` |

### C3W — cycle-3 new WALL arms
| expected | actual | ask |
|---|---|---|
| WALL | WALL | `reassign the review to a different protocolId` |
| WALL | WALL | `reassigned this review to protocol PRT-4iaey2` |
| WALL | WALL | `reassigning the review to the protocol PRT-4iaey2` |
| WALL | WALL | `target the review at protocol PRT-4iaey2` |
| WALL | WALL | `targeted this review to the different protocolId` |
| WALL | WALL | `can you reassign this review to protocol PRT-4iaey2?` |
| WALL | WALL | `please target this review to the different protocolId` |
| WALL | WALL | `retarget this review at the different protocolId` |
| WALL | WALL | `move this review to the protocol id PRT-4iaey2` |
| WALL | WALL | `switch this review to "PRT-4iaey2"` |
| WALL | WALL | `point the review at "PRT-4iaey2"` |
| WALL | WALL | `route the draft to protocol PRT-4iaey2` |
| WALL | WALL | `point the draft at protocol PRT-4iaey2` |
| WALL | WALL | `retarget this review onto the protocol PRT-4iaey2` |

### C3F — cycle-3 new FREE arms
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `send the draft to protocol guidance` |
| FREE | FREE | `switch the draft to protocol examples` |
| FREE | FREE | `reassign the draft to protocol format` |
| FREE | FREE | `target the draft at protocol guidance` |
| FREE | FREE | `move the draft to the protocol format` |
| FREE | FREE | `point the draft at the protocol examples` |
| FREE | FREE | `route the draft to protocol name` |

### RES — cycle-3 residual pins (visible, never silent)
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `retarget this review to protocol` |
| FREE | FREE | `reassign this review at protocol` |
| FREE | FREE | `move the draft to protocol` |
| FREE | FREE | `point the draft at protocol` |
| FREE | FREE | `retarget this review onto protocol` |
| FREE | FREE | `retarget this review towards protocol` |
| FREE | FREE | `retarget this review to the protocol id` |
| FREE | FREE | `retarget this review towards the protocol PRT-4iaey2` |
| FREE | FREE | `retarget this review toward the protocol PRT-4iaey2` |
| FREE | FREE | `retarget this review to the different protocol` |
| FREE | FREE | `retarget this review to protocol PRT` |
| FREE | FREE | `retarget this review to "CAN-w29-gate"` |
| FREE | FREE | `retarget this review to the "PRT-4iaey2" protocol` |
| WALL | WALL | `what is the target protocolId?` |
| WALL | WALL | `what is the target protocol id?` |
| WALL | WALL | `move the draft to "PRT-4iaey2"` |

### addendum (residual rows re-run after the final test-file edit)
| expected | actual | ask |
|---|---|---|
| FREE | FREE | `retarget this review to the protocol ids` |
| FREE | FREE | `reassign this review for protocol PRT-4iaey2` |
| FREE | FREE | `target this review for protocol PRT-4iaey2` |

## 23. Residual-risk table (cycle 3 — AUTHORITATIVE; every row pinned as a visible test)

| # | residual | direction | pinned as | why accepted |
|---|---|---|---|---|
| R1 | `retarget this review to the protocol` / `switch this review to the protocol` (bare article frame, NO id) | LEAK | FREE test 'accepted-residual boundary' (cycle 2) | the direct price of c2's DEFECT-4 fix; no record named, no focus can fire (weakest attack class). |
| R2 | `retarget/reassign/target this review for protocol PRT-4iaey2` | LEAK | FREE tests (cycle 2 + g2dfix3 residual test) | `for` is not a declared retarget-object preposition; adding it risks the DEFECT-2 over-block class. |
| R3 | `switch to the PRT-4iaey2 protocol tab` / `switch the view to the PRT-4iaey2 protocol tab` / `switch the review to another protocol tab` | OVER-BLOCK | WALL test (cycle 2) | DATA cannot tell "open that protocol's tab" from "retarget to that protocol" once a literal id sits in the article frame (same class the file already accepts, W2-11 D3 honest arm). |
| R4 | `retarget this review towards/toward the protocol PRT-4iaey2` (article frame on the towards/toward prepositions) | LEAK | NOW PINNED FREE in 'g2dfix3 accepted-residual boundary' (was "not pinned" at c2 — corrected) | the id-suffixed/article class was declared for `to`/`at`/`onto` only; `onto the protocol <id>` fires incidentally via the `to the protocol` substring. Compound variant, cheap to add if a gate ask shows it. |
| R5 | `switch this review into protocol PRT-4iaey2` | covered, not residual | pinned WALL | fires via the `to protocol` noun matching INSIDE `into protocol` (substring semantics). Documented so nobody reads it as an intentional `into` frame. |
| R6 | bare frames that name NO target: `retarget this review to protocol`, `reassign this review at protocol`, `move the draft to protocol`, `point the draft at protocol`, `retarget this review onto/towards protocol`, `retarget this review to the protocol id(s)` (no id token) | LEAK | pinned FREE in 'g2dfix3 accepted-residual boundary' | the deliberate price of the DEFECT-2 narrowing; no record is named and no focus action can fire — the weakest form of the attack. |
| R7 | quoted-id scope: `retarget this review to "CAN-w29-gate"`, `retarget this review to the "PRT-4iaey2" protocol` (reversed order with a quote) | LEAK | pinned FREE in 'g2dfix3 accepted-residual boundary' | the quoted nouns mirror the existing PRT-scope of `to prt-`/`at prt-`; the unquoted CAN-/reversed-quoted gaps already existed at c2. Extending quoted non-PRT ids was not requested and would widen the wall. |
| R8 | `retarget this review to protocol PRT` (id token without the hyphen) | LEAK | pinned FREE in 'g2dfix3 accepted-residual boundary' | the narrowed nouns demand a hyphenated record-id token (`[a-z]+-`), the same shape as the committed c2 article nouns. |
| R9 | `what is the target protocolId?` / `what is the target protocol id?` | OVER-BLOCK | pinned WALL in 'g2dfix3 accepted-residual boundary' | `target` as a verb + the bare `protocolid` noun at gap 0: a question ABOUT the current target id is adjacency-governed. Same ambiguity class as R3 / the W2-11 D3 honest arm. Exempting it would mean editing the SHARED blockerWords/negation governance — a governance change, out of cycle scope. |
| R10 | `move the draft to "PRT-4iaey2"` | OVER-BLOCK | pinned WALL in 'g2dfix3 accepted-residual boundary' | a quoted concrete id as the object of a new verb reads as a retarget target; the id IS named, so the refusal is defensible. |

## 24. Assumptions disclosed (cycle 3)

1. The DEFECT-2 narrowing took the id-requiring-lookahead route (same class
   as c2's article-noun fix) because the interpreter has no per-verb noun
   binding — verbs and nouns are two flat lists per wall.
2. The lookahead `(?=\s+[a-z]+-)` demands a hyphenated record-id token;
   `protocol PRT` (no hyphen) is out of scope (residual R8). The shape is
   byte-identical to the committed c2 article nouns for consistency.
3. Quoted-id nouns are PRT-scoped (`to "prt-`, `at "prt-`), mirroring
   `to prt-`/`at prt-`. Quoted non-PRT ids stay FREE (residual R7).
4. Adding `target` as a verb creates the R9 over-block class (questions about
   the current target id). It is pinned VISIBLE rather than exempted, because
   exemption would require changing the SHARED `matching.leadingVerb.blockerWords`
   / `negationTokens` governance — prohibited this cycle.
5. The five removed noun lines are each replaced in place by a strictly
   narrower form; no pinned WALL arm depends on a removed spelling (all
   re-run green, §22 PIN/NEW/C.1 groups).
6. No YAML reload was performed for the running stack (policy is loaded per
   call, so tests are correct without one). Making the running gate stack
   serve the new YAML is the ORCHESTRATOR's restart step.
7. Pre-existing debt untouched and proven identical base->head: 10 failing
   server src/ai files / 18 tests, `Errors 2 errors`, 23 app tsc errors.
8. No app file was modified in cycle 3; the app batteries were re-run anyway
   to prove the narrowed DATA did not disturb the client pins.

## 25. Gate re-shoot guidance for the orchestrator (cycle 3)

After the stack restart: the five c2 leak strings (`retarget this review to
the different protocolId`, `retarget this review to the protocol id
PRT-4iaey2`, `reassign this review to protocol PRT-4iaey2`, `retarget this
review to "PRT-4iaey2"`, `target this review to protocol PRT-4iaey2
instead`) must show the red `review-ai-refusal` banner with the
RETARGET_NOT_ON_THIS_SURFACE wording, no Apply/Accept card, zero writes.
`move the draft to protocol format` / `route the draft to protocol guidance`
/ `point the draft at protocol examples` must NOT show that banner.
`what is the target protocolId?` WILL show the banner — that is residual R9
firing by design, expected, not a defect.

W2-9-G2DFIX3 DONE 5b2eb3d0
