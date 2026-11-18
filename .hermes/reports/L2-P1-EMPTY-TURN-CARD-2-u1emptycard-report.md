# L2-P1-EMPTY-TURN-CARD-2 — unit u1emptycard (u1 of 1, server seam)

Scenario: **prompt-1** — manifest utterance "Place a Thermo Optical-Quality Imaging
Plate, 384-well, black-walled, clear bottom (catalog number A58941) on the deck."
Gate defect D1 of PROMPT1-GATE-20261114T192103Z (second occurrence): the empty-turn
guard's done result now ALSO carries a typed clarificationRequest declaring the
NAMED ABSENCE, so the client's existing typed-clarification arm renders the
actionable clarifier card beside the named-cause error. No client change; no new
narration string; the named-cause error is byte-identical to before.

## What changed (4 files, 250 added lines — at the 250-line budget; 4-file cap met)

| file | added | what |
|---|---|---|
| server/src/ai/clarifications.ts | 99 | `extractEmptyTurnLabwarePhrases` (:317) + `emptyTurnAbsenceRequests` (:347) — the one helper |
| server/src/ai/AgentOrchestrator.ts | 24 | import line + arm 1 wiring (:3142) + arm 2 wiring (:3582) |
| server/src/ai/clarifications.emptyTurn.test.ts | 77 | NEW test file, 5 legs (RED first) |
| server/src/ai/AgentOrchestrator.finalAnswerEmpty.test.ts | 50 | `runFinalAnswer` gained an optional `prompt` param; ONE new describe (2 legs); existing CARD-1 legs untouched |

## Helper contract (as built)

`emptyTurnAbsenceRequests(turnText, searchLabwareByHint) -> AgentClarificationRequest[]`, AT MOST ONE request:
- Extraction: strip the `[Answered clarifications]` trailer (it is authoritative
  answer data, never user wording), strip the leading action verb
  (place/add/create/set up/put/run), strip parentheticals, split on `,` and
  standalone `and`, strip leading determiners (a/an/the) and trailing location
  phrases (on/onto/into/in/at/to ...), keep fragments carrying a labware head
  noun (plate/tube/rack/reservoir/vial/cryobox/well — with a trailing-letter
  guard so "black-walled" is not a well) and not pure well/deck/volume/count
  noise (e.g. `384-well`). Deterministic, regex-only.
- Probe: candidates longest-first, each probed with the FULL phrase via
  `searchLabwareByHint` (store/deck existence lookup ONLY — the SAME composed
  lookup the compile uses; compiler/resolve untouched, no resolution re-asked).
  The FIRST zero-match candidate becomes `mention` (trimmed, original casing).
  Every candidate matches, or none extract, returns `[]` (AC3 byte-unchanged).
- Request shape = SAME absence vocabulary as `clarificationRequestsFromAssurance`
  (clarifications.ts:259): `absence: { mention, reason: 'Not in this lab's
  records: <mention>' }`, `options: []`, `query`/`snippet` = mention, `kind` via
  `normalizeClarificationKind` (the plate sentence → 'labware', menuProvider '/l'),
  `origin: 'harness'`, `prompt: 'Pick the record this step names.'` — that prompt
  string is REUSED verbatim from the client's own absence-card test
  (app/src/agent/ChatClarificationCard.absent.test.tsx:33) — not a new narration
  string; harness-authored requests pass filterModelClarifications verbatim.

## Cited variables at the arm sites (path:line, on branch tip d977b42ec)

- `effectivePrompt` — server/src/ai/AgentOrchestrator.ts:1540
  (`appendClarificationAnswersToPrompt(prompt, clarificationAnswers)` inside
  `run(request)`; the last user message text, already in scope at BOTH arms —
  no new parameter threaded).
- `shorthandSearchLabwareByHint` — server/src/ai/AgentOrchestrator.ts:1650
  (`composeLabwareHintLookupWithDeck(shorthandDeckLabwares, deps.searchLabwareByHint)`,
  the deck+store composed lookup, already in scope at BOTH arms).
- Arm 1 (final-answer freeform guard): guard at :3133 (unchanged), wiring at
  :3142 — `success:false` + `error` EXACTLY as before, plus
  `...(emptyTurnAbsence.length > 0 ? { clarificationRequests: emptyTurnAbsence } : {})`
  on the same result object. Key ABSENT when empty (exactOptionalPropertyTypes).
- Arm 2 (shorthand backstop): guard at :3574 (unchanged), wiring at :3582 —
  `shResult.clarificationRequests` set ONLY when non-empty. Clobber check: the
  guard `draftProducedNothingOnServer` (draftArgDiagnostics.ts:207-225) requires
  `clarificationRequests` to be empty, so arm 2 never overwrites a model-supplied card.

## Commits (base c823334371edcb989ed9b344543efcea3aa769cd)

1. RED — 19ba13018: helper test, 5/5 RED (`emptyTurnAbsenceRequests is not a function`).
2. GREEN — b81aea915: helper + extraction; clarifications* 9/9 green.
3. WIRING — d977b42ec: BOTH arms + arm-level assertion (new describe in
   AgentOrchestrator.finalAnswerEmpty.test.ts, existing CARD-1 legs byte-unchanged).

## Verification (all measured, on final commit d977b42ec)

- Targeted suites, final commit: `npx vitest run src/ai/clarifications
  src/ai/AgentOrchestrator.finalAnswerEmpty src/ai/AgentOrchestrator.degenerateRetry`
  → **Test Files 4 passed (4); Tests 24 passed (24)**. (RED-first commit confirmed
  5/5 RED against the then-unexported helper.)
- Arm-level (AC1 at the server seam): manifest sentence through the REAL
  orchestrator (stub model returning `{"events":[]}`, real
  `createLabwareLookup` over the mock store) → `success:false`, error EXACTLY
  `emptyDraftMessage({truncated:false,hadArguments:false,noToolCall:true})`,
  `clarificationRequests` length 1, kind 'labware',
  `absence.mention === 'Thermo Optical-Quality Imaging Plate'`,
  `absence.reason === "Not in this lab's records: Thermo Optical-Quality Imaging Plate"`,
  options [], query/snippet = mention. Noun-less empty turn → `'clarificationRequests' in result === false`
  (key absent, never undefined/[]).
- AC3: existing-labware turns get no card (helper `[]` — helper leg + arm leg both pin it).
- tsc: `timeout 300 server/node_modules/.bin/tsc --noEmit -p server/tsconfig.json
  2>&1 | grep -c "error TS"` → **6** (baseline 6, all pre-existing Fastify multipart;
  none in the changed files).
- Blast-radius check: full `src/ai/AgentOrchestrator` sweep on branch =
  13 failed / 30 passed files, 20 failed / 291 passed tests — BYTE-IDENTICAL to the
  same sweep run on base c82333437 (same failing file set and failure counts;
  those 13 files are pre-existing environment failures, e.g. golden tests asserting
  `result.success===true` on store-dependent bypasses). The three targeted suites
  were ALL GREEN on base and remain all green.
- Budget: 250 added lines / 4 files (at the limits, not over).

## Acceptance status

1. DONE (server side): arm-level assertion above is AC1 at the real orchestrator seam.
2. PENDING ORCHESTRATOR: driving the lane-2 app (:5193). The lane-2 stack
   (cl-lane-stack.sh lane 2) runs the INTEGRATION worktree
   /mnt/vast/home/brad/git/cl-integration-2 (app :5193, server :3093, tsx --watch) —
   the coder worktree is not itself the live stack. My branch's 4 files are
   UNCHANGED on the trunk between base and trunk tip b4b7bf485 (verified by
   `git diff --stat c82333437 b4b7bf485` on those 4 files = empty), so the merge is
   a clean fast-forward with zero conflict on my surface; after the orchestrator
   merges d977b42ec into cl/integration-2, the running :3093 server hot-reloads
   (tsx --watch) and :5193 will render the card. The client render arm is
   pre-proven by the existing app/src/agent/ChatClarificationCard.absent.test.tsx
   (absence line + one prefilled create row, `prefillName` = the noun) — zero
   client changes needed (anchor 5).
3. DONE: no new card for existing labware (byte-unchanged, pinned).
4. DONE: targeted suites green, tsc count stays 6.

## Remaining blockers

- AC2 browser confirmation: owner = orchestrator (merge d977b42ec into
  cl/integration-2, then drive :5193 with the manifest utterance on a clean
  thread; expect cardCount>0 with prefill 'Thermo Optical-Quality Imaging
  Plate'). Resume condition: merge landed + stack healthy.
- Independent browser reviewer owns acceptance per the lane rules.
L2-P1-EMPTY-TURN-CARD-2 UNIT L2-P1-EMPTY-TURN-CARD-2 DONE 790dcd5f7656ba26b78044c1ff73d4276b96ba95
