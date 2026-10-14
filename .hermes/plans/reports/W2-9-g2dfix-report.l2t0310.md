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

W2-9-G2DFIX DONE 7b784d10
