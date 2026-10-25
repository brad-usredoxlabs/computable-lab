# REVISE-GHOST-1 — coder report (lane 2, l2t0230)

Worktree: /mnt/vast/home/brad/git/wt/REVISE-GHOST-1-lane2-l2t2050
Branch: cl/lane2-revise-ghost-1-l2t2050 — PINNED_BASE 5e9c4bb1 (confirmed at start:
`git -c core.fileMode=false log --oneline -1` -> `5e9c4bb1 merge(lane2): MATRES-ELIG ...`).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-21_2030-REVISE-GHOST-1-revise-remount-spec.md
(read fully; §0 rulings binding: OQ-1 YES exact-match reuse within the ACTIVE proposal;
OQ-2 honest-wall adopted; OQ-3 OUT of scope — record-only note + pin test, both below).

## Commits (on-branch, this worktree)

1. `1f210107` docs(lane2): discriminator artifact — committed BEFORE any product edit
   (§4B.1): `.hermes/plans/REVISE-GHOST-1-discriminator-payload.json` (the §5 payload
   verbatim) + `.hermes/plans/REVISE-GHOST-1-discriminator-artifact.md` (worker's own
   curl re-run against the live :3093 at PINNED_TIP + the raw `done` frame + the two
   backend.log lines).
2. `4ee21633` feat(lane2): the §3 IN files only (see Changed paths).
3. this report commit.

## §5 discriminator re-pin (worker-run, pre-edit)

Backend :3093 answers (serving trunk tip 5e9c4bb1 from /mnt/vast/home/brad/git/cl-integration-2/server;
NOT restarted). Worker replay (trace tm5izs):

```
[agent tm5izs] tools=1 docDiscussion=false maxTurns=15
[agent tm5izs] done event_shorthand success=true events=0 clarifications=5 elapsedMs=36130
```

done frame: `{"success":true,"events":[],"clarificationRequests":[... 4x reason
"ambiguous-noun" + 1x "unknown-noun" ...],"shorthand":"intentId: seed-hepg2-trypsin-dmem-fbs-32wells ..."}`.
Composer's original replay (bqvapt, spec §5): `done event_shorthand success=true events=0
clarifications=4 elapsedMs=32240` — same shape, pinned in the artifact file.
VERDICT re-confirmed: the swallowing leg is the needs-clarification arm of
shorthandResultFromCompile (shorthandChat.ts, literal `events: []`), reached from the
event_shorthand arm; docDiscussion=false rules the doc arm out; :3728 untouched (below).

## RED-first evidence (before the fix)

Server (product edits stashed, test file only, at base 5e9c4bb1):
```
 FAIL  src/ai/shorthandChat.reviseReuse.test.ts > ... reuse case: draft bars -> answer folds -> revise turn with draftRevision compiles events (no re-ask of the answered label)
AssertionError: expected 1 to be +0 // Object.is equality   (clarificationRequests.length — the answered label RE-ASKED)
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
```
The failing assertion is the fault plane: revise turn -> events 0 + 1 re-asked card.
(The legit-hold and leak pins pass at base by design — they pin behavior the fix must NOT change.)

Client (honest-wall arm reverted via stash at base, new test files present):
```
 FAIL  AiTabPanel.honestWall.test.tsx > a shorthand-only zero-event zero-card success renders a reported failure ...
 TestingLibraryElementError: Unable to find an element by: [data-testid="ai-tab-honest-wall"]
 Test Files  1 failed (1)
      Tests  3 failed | 2 passed (5)
```
The 3 wall legs RED; the 2 negative pins (legit hold renders cards; no-success-key keeps
existing behavior) pass at base — the wall must not fire on them.

## Implementation (all at the ai/ seam — §3 IN files only)

### server/src/ai/shorthandChat.ts
- `AcceptedShorthandBinding` — generic `{label, ref}` strings (zero reagent nouns, zero
  domain branches; the shorthandDeckLabwares shape precedent).
- `ShorthandCompileDeps.reuseBindings?` — conditional-spread optional (exactOptionalPropertyTypes).
- `composeSpineWithReuseBindings(spine, bindings)` — wraps the INJECTED spine at the ai/
  seam BEFORE resolution: an EXACT label match (trim + case-insensitive, the deck-match
  normalization) narrows the spine's OWN candidate set to the chosen record; NEVER invents
  (if the chosen ref is not among the spine's candidates, the spine result rides untouched).
  compiler/resolution/** and server/src/resolve/** are byte-untouched.
- `acceptedBindings` store per conversationKey (heldIntents precedent, same MAX_HELD eviction):
  `rememberAcceptedShorthandBindings`, `acceptedShorthandBindingsFor(key, activeProposal)`
  (a fresh-start read DROPS the bindings — bindings never cross a proposal boundary),
  `clearAcceptedShorthandBindings` (Cancel-leg mirror of clearHeldShorthandIntent).
- `foldAnswersIntoShorthand` now RETURNS `bindings`: the bar's own label AND the chosen
  label both join the answer's own record ref (`ref.id` — never a mint, bait 5); an answer
  with no record ref records no binding.
- `compileShorthandDeterministically` composes the spine with `deps.reuseBindings` when present.

### server/src/ai/AgentOrchestrator.ts — ONLY the shorthand-arm call sites
- Import the two seam helpers.
- At the conversation-key setup: `shorthandReuseBindings = acceptedShorthandBindingsFor(
  conversationKey, context.draftRevision present || clarificationAnswers present)` —
  draftRevision is the client's mounted-preview marker (the context builder's previewDraft
  leg); a clarification-answer turn continues the proposal it answers; any other turn is a
  fresh start and the read itself clears the bindings (Accept/Discard/fresh-start, bait 7).
- Fold arm: `folded.bindings` join the prior bindings, `rememberAcceptedShorthandBindings`,
  and ride the fold recompile + the next turn's compile.
- Shorthand-arm compile call site (~:2591): `...(shorthandReuseBindings.length > 0 ? { reuseBindings: shorthandReuseBindings } : {})`.
- :3728 legacy hold: UNTOUCHED (grep check below). Doc arm :2373-2385 untouched. No policy
  keys, no YAML toggle added (OQ-1 ratified default is unconditional exact-match reuse;
  the spec's switchable-toggle was optional — none added, YAML untouched, no stack restart).

### app/src/event-editor/right-pane/ai/AiTabPanel.tsx — honest-wall arm in onDraftResult
- New arm BEFORE the clarifications-needed/draft-ready arms: `success === true &&
  draftedEvents.length === 0 && no clarificationRequests && !error` (and reached only after
  the workstate/ledger/protocolEdit guards, so a flagged turn never hits it) ->
  `setHonestWall(text naming what the turn delivered: shorthand-only? notes? nothing?)` +
  `sidebarDispatch({type:'reset'})` (PB-CH-4 D1: no 'reviewing', no empty actionable Apply) +
  return. The wall text renders in the chat section (`data-testid="ai-tab-honest-wall"`,
  role="alert") — the only surface a D1 reset leaves mounted (OQ-2: no new surface; the
  ChangesPanel error-slot verbatim-error PATTERN's discipline reused; the chat-log summary
  already names the shorthand-only turn via summarizeDraftResult's notes leg).
- Cleared on every new draft result and every fresh send (belongs to its turn).
- `success === true` is REQUIRED: a result without the success key (the hand-authored empty
  draft pinned by R-Defect-2 in runPageSurface) keeps its existing behavior byte-identically.
- revisionHistory shape UNCHANGED (§4B.5): the chat revise append path was not edited; pinned
  by the ghostRemount test ({prompt, createdAt}, appends, rides back).

### New tests
- server/src/ai/shorthandChat.reviseReuse.test.ts — real orchestrator.run + real deterministic
  compile through the chat seam; mocked inference only (canned tool_call frames); NO handler
  mocks; runChatbotCompile spied to catch a wrong-leg turn. Case 1 reuse: draft bars -> answer
  folds (events>0) -> revise turn (draftRevision context, no clarificationAnswers) ->
  events>0 AND clarificationRequests==0. Case 2 legit hold: genuinely NEW unbound label on the
  revise turn -> events==0 AND cards>0 naming the new label (bait 6). Case 3 leak discipline:
  bindings do NOT cross a proposal boundary — a fresh-start turn (no draftRevision) re-asks.
- app/.../AiTabPanel.ghostRemount.test.tsx — draft result with events through the REAL
  onDraftResult seam -> setPreview called with previewPlacements>0 + previewEvents>0 (real
  buildPreviewFromDraft, freeform lawn variant); revisionHistory append/shape/ride-back pins.
- app/.../AiTabPanel.honestWall.test.tsx — wall renders + names the shortfall + no
  changes-panel/Apply + no setPreview + chat usable; notes-only variant; NEGATIVES: legit
  hold renders cards (wall silent), no-success-key result keeps existing empty-review arm;
  wall clears on the next good draft; OQ-3 pin (below).

## Verification (§8 exact outputs, at HEAD)

```
$ npm run test:run -w server -- shorthandChat.reviseReuse
 ✓ src/ai/shorthandChat.reviseReuse.test.ts  (3 tests) 448ms
 Test Files  1 passed (1)
      Tests  3 passed (3)

$ npm run test:run -w server -- shorthandChat
 Test Files  8 passed (8)
      Tests  63 passed (63)

$ npm run test:run -w server -- AgentOrchestrator
 Test Files  5 failed | 26 passed (31)
      Tests  6 failed | 210 passed (216)
```
The 5 failing AgentOrchestrator files (bypass, golden, goldenWithSeeds, tubeGate x2 tests,
Forwarding) are BYTE-IDENTICAL to the base run at 5e9c4bb1 with my changes stashed and the new
test file removed (base capture: `Test Files 5 failed | 26 passed (31) / Tests 6 failed | 210
passed (216)`, same 5 files) — all 5 are in the 88-file baseline set (/tmp/elig-baseline.sorted).

```
$ npm run typecheck -w server
> tsc --noEmit
EXIT 0

$ npm run test:run -w server            (full suite at HEAD)
 Test Files  88 failed | 696 passed | 9 skipped (793)
      Tests  99 failed | 6514 passed | 70 skipped (6856)
```
Failing-file set vs the 88-file baseline record (/tmp/elig-baseline.sorted, MATRES-ELIG-era):
```
$ comm -3 <(sed 's|src/||' /tmp/elig-baseline.sorted | sort -u) /tmp/rg1-head-failfiles.txt
(empty — comm -23 = 0, comm -13 = 0; 88 vs 88, comm-empty)
```
Pass counts rose 687->696 files / 6494->6514 tests (the ELIG merge's new files + this item's
1 new file / 3 new tests); the FAILING set is comm-empty — zero-new failures.

```
$ npm run test:unit -w app -- AiTabPanel
 Test Files  14 passed (14)
      Tests  92 passed (92)
```
Includes both new files (ghostRemount 2, honestWall 6) and the existing
AiTabPanel.shorthandClarification.test.tsx green (§4B.4).

```
$ npx tsc -p app --noEmit 2>&1 | wc -l
28
```
Base parity (same worktree, my changes stashed, new test files parked): 28. Identical —
the app tsconfig `include: ["src"]` covers the new test files; zero new tsc lines.
(The app unit suite's 58 failing files at HEAD are pre-existing trunk debt — the recorded
lane baseline; the AiTabPanel family is fully green.)

```
$ git -c core.fileMode=false diff 5e9c4bb1 -- server/src/ai/AgentOrchestrator.ts | grep -c "3728\|parsed.events = \[\]"
0
```
The legacy hold (hold-the-WHOLE-draft arm, `parsed.events = []`) is byte-identical — verified
also by reading the arm at HEAD (unchanged comment + body).

## §3 scope audit

`git -c core.fileMode=false diff 5e9c4bb1..HEAD --name-only` lists ONLY:
- .hermes/plans/REVISE-GHOST-1-discriminator-artifact.md (artifact doc)
- .hermes/plans/REVISE-GHOST-1-discriminator-payload.json (artifact doc)
- .hermes/plans/REVISE-GHOST-1-report.wip-l2t0230.md (this report)
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx (IN)
- app/src/event-editor/right-pane/ai/AiTabPanel.ghostRemount.test.tsx (IN, new)
- app/src/event-editor/right-pane/ai/AiTabPanel.honestWall.test.tsx (IN, new)
- server/src/ai/AgentOrchestrator.ts (IN — shorthand-arm call sites only)
- server/src/ai/shorthandChat.ts (IN)
- server/src/ai/shorthandChat.reviseReuse.test.ts (IN, new)

OUT honored: compiler/resolution/** and server/src/resolve/** byte-untouched (reuse composed
at the ai/ seam via the injected spine); :3728 byte-identical; doc arm :2373-2385 untouched;
no fraction-policy edits (MIXFRAC files untouched); clarification FACT shape unchanged (cards
verbatim — the fold's bindings read the answer's existing `ref`, no shape change); deck ghost
rendering machinery untouched; YAML/config untouched (no toggle added — no stack restart needed,
none performed); :3001/:5174 untouched; lane stack :3093/:5193 not restarted.

Lane-environment notes (not product changes): the worktree needed runtime scaffolding —
`node_modules` symlinks to the trunk's and `server/schema -> ../schema` (gitignored paths,
never committed), plus the trunk's lane-EXCLUDED untracked source files copied in (the
recorded lane pitfall: tracked code imports lane-excluded untracked files, e.g.
server/src/ai/materialRefFields.ts; they stay git-excluded via the shared excludes file).
None appear in the diff.

## Bait audit (§6)

1. Wrong leg: replay `docDiscussion=false` + :2594 early return + AS-4 refusal pin the leg;
   :3728 diff grep = 0.
2. exactOptionalPropertyTypes: every new optional (reuseBindings, bindings, honestWall render)
   built by conditional spread / null-state, never `field: undefined`.
3. YAML-reload trap: no YAML touched, no toggle added, no restart performed or needed.
4. Hardcode boundary: product diff greps clean for reagent nouns (only the words "reagent
   nouns" inside "zero reagent nouns" comments); fixtures/tests carry the labels
   (Alpha/Beta/Gamma/Delta Reagent, Test Reagent); vocabularyRipOut.test.ts stays green
   (shorthandChat 8/8 files pass).
5. Two local terms: the reuse binds the scientist's already-chosen ref (answer.ref.id);
   composeSpineWithReuseBindings NEVER invents (non-member ref -> spine result untouched).
6. Hold not gutted: the needs-clarification arm is untouched; the legit-hold test asserts a
   genuinely-new ambiguous label STILL holds with cards.
7. Leak discipline: bindings die with the proposal — fresh-start read clears them (test case 3);
   answer-turn/draftRevision marker only.
8. UI placement: the wall rides the AI panel chat section (existing surface), not the deck;
   no new rail surface.
9. Legs not confused: the zero-LLM recompile path (:647-696 verbatim-error arm) was NOT touched;
   the wall was added only to the chat draft leg.
10. Gate selectors: N/A (browser gate is orchestrator-run).
11. Fractions: untouched (the replay's 50/50/10 is MIXFRAC-1's disease; no fraction-policy edit).

## OQ-3 record-only note (OUT of scope per §0)

The recompile path (handleShorthandRecompile) still REPLACES the preview without re-attaching
revisionHistory (the trail drop at AiTabPanel.tsx ~:696-705). This item does NOT fix it; a pin
test in AiTabPanel.honestWall.test.tsx asserts today's behavior is NOT made worse (recompile
setPreview carries no revisionHistory key; the honest wall never fires on that leg). A
follow-up item (two-line additive spread + one test) may be filed at harvest.

## Assumptions recorded

- Active-proposal marker at the server = `context.draftRevision` present (the client sends it
  only while a ghost preview is mounted) OR a clarification-answer turn (continues the proposal
  it answers). Accept/Discard land the NEXT turn without draftRevision -> the read clears the
  bindings. This is the OQ-1 "never cross a proposal boundary" lifecycle realized server-side
  without touching client file ownership.
- The fold records bindings for BOTH the bar's label and the chosen label (the revise turn
  re-emits the scientist's phrasing, per the replay's mechanism); the ref is the answer's own
  record id — mint-free.
- No YAML reuse toggle added: OQ-1 was ratified unconditionally ("exact-match reuse ... within
  the ACTIVE PROPOSAL ONLY"); the spec's toggle was a "if the orchestrator wants it switchable"
  option, not a requirement. If the orchestrator later wants the switch, the smallest data home
  remains config/drafting/shorthand-drafting.yaml loaded per call.

## Unresolved / for the orchestrator

- Browser gate (§4C) is orchestrator-run at :5193 (not mine): draft -> answer cards -> revise
  -> ghosts REMOUNT; negative: cards visible OR honest failure line. My tests pin both legs at
  the handler and panel seams; the gate needs the live stack (which I did not restart).
- The 5 pre-existing AgentOrchestrator failing files and the app suite's 58 failing files are
  trunk debt in the baseline records — untouched by this item (comm-empty proven above).

STATUS: complete
