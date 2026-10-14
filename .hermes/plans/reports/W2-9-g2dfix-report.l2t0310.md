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
