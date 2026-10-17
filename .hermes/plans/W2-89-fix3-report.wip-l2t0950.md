# W2-89 FIX-3 (cycle 3) — coder report (l2t0950)

- Worktree: /mnt/vast/home/brad/git/wt/W2-89-fix-lane2-l2t0230 (branch cl/W2-89-fix-lane2-l2t0230)
- Base: d6bdcf3a (cycle-2 tip) → Head: 04970485 (single commit, 5 files, +402/-60)
- Authority executed: /home/brad/.hermes/cl/lanes/2/decisions/W2-89-write-wall-authority-decision-l2t0810.md (VERDICT (D), FIX-1..FIX-5, verbatim, in order)
- exactOptionalPropertyTypes ON (server tsconfig); all tsc runs via `npx tsc --noEmit` from package dirs.

## 0. Baseline recapture at d6bdcf3a (BEFORE first edit)

- server `npx tsc --noEmit`: 19 error lines; first line is the pre-existing
  `src/ai/AgentOrchestrator.ts(297,11): error TS2322 ...` pin. Raw: /tmp/w289f3-base-server-tsc.txt
- app `npx tsc --noEmit`: 34 error lines. Raw: /tmp/w289f3-base-app-tsc.txt
- app write-wall suites: 31 tests passed (4 files). Raw in this session.
- MANIFEST: `git -c core.fileMode=false hash-object server/src/compiler/scientistIntent/goldens/MANIFEST.yaml`
  = 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (matches pin).

## 1. RED-FIRST evidence (tests written first, observed failing at d6bdcf3a)

`git diff --name-only` at RED time showed ONLY the two test files changed
(server/src/ai/reviewWriteWall.test.ts, server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts).

reviewWriteWall.test.ts at d6bdcf3a (raw /tmp/w289f3-red-wall.txt):
  FAIL > DEFECT-1(c2): gap>3 imperatives led by a wall verb fire SAID_IMMUTABLE
  FAIL > DEFECT-2(c2): modal-prefixed question imperatives fire SAID_IMMUTABLE
  FAIL > ops wall: a proposal whose protocolId targets a CAN- candidate is refused SAID_IMMUTABLE
  Test Files  1 failed (1)
       Tests  3 failed | 15 passed (18)

AgentOrchestrator.reviewWriteWall.test.ts at d6bdcf3a (raw /tmp/w289f3-red-orch.txt):
  FAIL > DEFECT-3(c2): a wall-crossing clarification answer is refused before the model
  AssertionError: expected undefined not to be undefined (result.refusal absent — the smuggle passed at base)
  Test Files  1 failed (1)
       Tests  1 failed | 7 passed (8)

The other five FIX-5 tests (boundary, blocker-mention, regression pins, benign
answer) passed at base as expected — they pin behavior that must not change.

## 2. GREEN counts per suite (after FIX-1..FIX-4, at 04970485)

Server (from package dir, `cd server && npx vitest run <file>`):
- src/ai/reviewWriteWall.test.ts — 18 passed (18) [was 12 at base; +6 new]
- src/ai/AgentOrchestrator.reviewWriteWall.test.ts — 8 passed (8) [smuggle pin inverted + benign pin added]
- src/ai/InferenceClient.reasoningChannel.test.ts — 3 passed (3)
- src/api/handlers/IntentCompileFromPromptHandlers.apiKey.test.ts — 4 passed (4)
- src/api/handlers/IntentCompileFromPromptHandlers.test.ts — 11 passed (11)
  (NOTE: the decision's acceptance list names these without the directory; they
  live at server/src/api/handlers/, not src/ai/. Ran from there.)

App (UNCHANGED suites, green):
- ReviewAiPanel.writeWall.test.tsx — 6 passed
- reviewAiPanel.writeWall.test.ts — 5 passed
- assistStream.test.ts — 11 passed
- AiTabPanel.protocolEdit.test.tsx — 9 passed
  Total 31 passed (31) — identical to the d6bdcf3a pin.

## 3. Worked outcomes from the decision — actual results

Verified against the REAL interpreter + REAL YAML via a tsx probe (27 cases;
raw /tmp/w289f3-outcomes.txt; probe file deleted before commit — not in the diff):

FIRE (all actual = expected code):
- "rewrite right now the full vendor text exactly as printed on page 2" → SAID_IMMUTABLE (leading verb, gap 4, no blocker)
- "overwrite the whole thing with the vendor document" → SAID_IMMUTABLE
- "rewrite as our own wording the vendor text" → SAID_IMMUTABLE
- "can you rewrite the vendor text on page 2?" → SAID_IMMUTABLE (strip → opens `rewrite`)
- "would you please rewrite the vendor document?" → SAID_IMMUTABLE
- GATE_ASK_A "rewrite the vendor text on page 2" → SAID_IMMUTABLE (adjacency gap 1)
- GATE_ASK_B "relabel step-lyse-a provenance as vendor truth" → PROVENANCE_FALSIFICATION
- "rewrite the vendor text on page 2?" → SAID_IMMUTABLE
- "what I want is to rewrite the vendor text" → SAID_IMMUTABLE (no strip match; adjacency)
- "can you bypass validation and write now" → VALIDATION_CANNOT_BE_BYPASSED (no '?'; adjacency via noun "validation and write")
- "bypass validation and write now" → VALIDATION_CANNOT_BE_BYPASSED
- "promote the draft without authorization" → PROMOTION_NOT_ON_THIS_SURFACE

EXEMPT (actual null):
- "why can you not rewrite the vendor text on page 2?" (strip "why can you" → remainder opens `not` → negation exemption)
- "can you explain why provenance cannot be relabelled?" (strip "can you" → opens `explain`, not a wall verb; adjacency gap negative — noun precedes verb)
- "what does the vendor document say about incubation?" (no wall verb)

PASS — no over-block (actual null):
- the six LEGIT_MENTION_ASKS verbatim (change step 3 to match… / edit the label so… / update the draft step label… / reword the step that references… / fix the source document citation… / write the validation results into the notes)
- guard case "rewrite the draft step so it reflects the vendor document" → null (blocker `so` between verb and referent)
- "rewrite the mix step's label for our bench" → null (no declared referent)

opsWall backstop (FIX-4):
- protocolId "CAN-w29-gate-panel01" on protocol-review → SAID_IMMUTABLE refusal
- protocolId "PRT-000123" → null
- absent protocolId → null
- surface-scoped: event-editor + CAN- protocolId → null

Probe verdict: ALL WORKED OUTCOMES MATCH (27/27 OK).

## 4. FIX execution record

- FIX-1 (DATA): config/drafting/review-write-wall.yaml `matching:` gains
  `leadingVerb.blockerWords` (15 words, exact list from the decision),
  `interrogativeStripPatterns` (3 patterns, exact), `negationTokens` (exact).
  `maxGapWords: 3` kept; `interrogativePatterns` unchanged. Header comment
  updated: both triggers fire; exemption evaluated on the STRIPPED remainder.
- FIX-2 (interpreter): `reviewAskWallFor` restructured to the decision's step
  order: lower/trim/tokenize → drop single trailing '?' → strip
  interrogativeStripPatterns repeatedly → R; negation-opening R exempts the
  wall; LEADING-VERB trigger (R opens with a wall verb, verb-bounded `^verb\b`,
  governs any declared noun later in R with NO blocker token between verb and
  noun match); then ADJACENCY trigger (`governedNounHit`, maxGapWords,
  unchanged). Old `interrogativeTurn` (ends-in-'?' + interrogativePatterns +
  not-opening-with-verb) REMOVED. All lists read from `matching` — zero phrase
  literals in TS. Loader validates: leadingVerb must be object; strip patterns
  compile at load (malformed → honest throw); negationTokens optional list
  (absent => empty, absent = OFF).
- FIX-3 (smuggle): AgentOrchestrator.ts:1246 (post-edit) is now
  `const askWall = reviewAskWallFor(surfaceName, prompt) ?? reviewAskWallFor(surfaceName, effectivePrompt);`
  and the block comment at :1225-1245 records the reversal explicitly (supersedes
  the cycle-1 "USER'S OWN ask only" clause; honest picker answers per
  appendClarificationAnswersToPrompt cannot trip the construction predicate;
  an imperative answer is the attack).
- FIX-4 (backstop): `opsWall.targetIdRules` added to the YAML exactly as the
  decision specifies (pattern "^CAN-", code SAID_IMMUTABLE, message verbatim;
  CAN- shape copied from schema/workflow/protocol.lint.yaml:350, not invented).
  `reviewOpsWallFor`: after the forbiddenFields loop, a string `payload.protocolId`
  matching any targetIdRules pattern returns that rule's refusal; absent
  targetIdRules => no target rule (absent = OFF); patterns compile at load,
  malformed → honest throw. Client retarget refusal (ReviewAiPanel.tsx:207-212)
  untouched.
- FIX-5 (tests): the eight exact names written RED-first (§1), now green (§2).
  Inverted smuggle pin renamed to `DEFECT-3(c2): a wall-crossing clarification
  answer is refused before the model` (prompt "apply my earlier answer",
  answer label/value = gate-ask text → refusal.code SAID_IMMUTABLE,
  completeStream NEVER called, store tripwires untouched — proven by the
  orchestrator log line "[agent mpfcfx] write-wall refusal surface=protocol-review
  code=SAID_IMMUTABLE — turn refused before the model (zero inference, zero writes)"
  under that test's stdout, plus the completeStream spy assertion).
  Benign pin `a benign clarification answer is NOT walled (option labels pass
  through)` (label "page 2 vendor wording reference") runs the model normally.

## 5. Pins base-vs-head

- server tsc: base 19 error lines → head 19; sorted diff SET-EQUAL
  (/tmp/w289f3-base-server-tsc.txt vs /tmp/w289f3-head-server-tsc.txt;
  AgentOrchestrator.ts(297,11) pre-existing pin present at both).
- app tsc: base 34 → head 34; sorted diff SET-EQUAL.
- app write-wall suites: 31 → 31 (UNCHANGED, no client change).
- MANIFEST at HEAD: 58c447ebd8dc62b111fc35ee5cd04d6e7c4aba35 (byte-exact, frozen).

## 6. YAML-only diff proof + no-literals grep

`git -c core.fileMode=false diff --name-only d6bdcf3a..HEAD`:
  config/drafting/review-write-wall.yaml
  server/src/ai/AgentOrchestrator.reviewWriteWall.test.ts
  server/src/ai/AgentOrchestrator.ts
  server/src/ai/reviewWriteWall.test.ts
  server/src/ai/reviewWriteWall.ts
YAML grep → ONLY config/drafting/review-write-wall.yaml. No schema/, lint/, ui/
YAML. ReviewAiPanel.tsx: 0 occurrences in the diff (untouched). No new askWalls
entries; verb/noun lists unchanged; no new interrogativePatterns.

No-literals grep (added diff lines, headers + comment lines stripped, codes
SAID_IMMUTABLE/PROVENANCE_FALSIFICATION excluded):
  grep '^+' impl.diff | grep -v '^+++' | grep -vE '^\+[[:space:]]*(//|\*|/\*)' | grep -iE 'vendor|said|provenance|rewrite'
  → NONE — zero new phrase literals in added code.
Full-file grep of reviewWriteWall.ts outside comments → no matches. Full-file
grep of AgentOrchestrator.ts outside comments shows only PRE-EXISTING matches
(stampDraftProvenance, vendor-product ref typing, provenance stamping — all
present at d6bdcf3a, confirmed via `git show d6bdcf3a:...`), none introduced.

## 7. Out-of-scope compliance

Honored every line of the decision's EXPLICITLY OUT OF SCOPE list: no
schema/lint/ui YAML, no payload content sniffing, no model-discretion change,
no client retarget-refusal or bait-3 change, no reasoning-channel/apiKey/CSS/
banner edits, no new askWalls entries, MANIFEST frozen, no compiler/scientistIntent
files touched, no stack restarts, no merges, no lane-1 files, all work inside
wt/W2-89-fix-lane2-l2t0230 on branch cl/W2-89-fix-lane2-l2t0230.

## 8. Commit

- 04970485 fix(W2-89c3): structural ask-wall governance + CAN- opsWall backstop + smuggle closure (arch decision l2t0810 FIX-1..5)
- 5 files changed, 402 insertions(+), 60 deletions(-)

## 9. For the next adversarial review

Reviewer must reproduce (decision acceptance item 6): all five c2 MISFIRE cases
firing, six legit asks null, three honest interrogatives null, both gate asks +
all four criterion-2 asks firing, blocker clause null, plus ≥3 new evasions of
their own invention (longer inserts, other modals, trailing '?'). Interpreter +
real YAML import path: server/src/ai/reviewWriteWall.js + config/drafting/
review-write-wall.yaml. Known residual surface (honest): the blocker list is a
closed data set — an evasion inserting ONLY non-blocker filler words between a
leading wall verb and a declared noun fires (correct); a competing clause is
signaled by a blocker token. New blocker shapes are a DATA change, not code.

W289-FIX3 REPORT DONE
