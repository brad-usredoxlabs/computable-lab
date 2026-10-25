# REVISE-GHOST-1 EXECUTION SPEC — Revise-it dialogue must mount deck ghosts; swallowed-events leg root-caused; proposal-bearing turn with zero mountable events is a REPORTED failure

## 0. PROMOTION RULINGS (orchestrator l2t1950, 2026-10-21 ~20:35 EDT — BINDING for the worker)
- OQ-1 RULED: YES — exact-match reuse of the scientist's already-answered bindings within the ACTIVE
  PROPOSAL ONLY; bindings never cross a proposal boundary (Accept/Discard/fresh-start clears them).
  This is ratified by Brad's OWN task text, not orchestrator invention: the task's required end-state
  (1) states "a revise turn whose shorthand is proposal-bearing MOUNTS GHOSTS on the deck" — a
  re-ask-everything policy makes that end-state unachievable for any proposal containing a
  near-duplicate label, which the composer's replay proves is the lab's steady state. Brad's standing
  friction-first ruling (snappy + acceptable beats correct-but-slow; confirm terms in the review
  dialogue, not a blocking pre-draft card) points the same way. Scope guard: the reuse hint is generic
  {label, ref} strings at the ai/ seam; NO policy keys, no domain branches in TS.
- OQ-2 RULED: composer default ADOPTED — reported failure visible on the ChangesPanel error slot
  (shorthandError precedent :1401) + sidebar reset per PB-CH-4 D1 discipline, error text also
  summarized into the chat log. No new surface (D1).
- OQ-3 RULED: OUT OF SCOPE — record-only note in the report + a pin test asserting the recompile
  path's today-behavior is not made worse. A follow-up item may be filed at harvest.
- Fleet slot RULED: REVISE-GHOST-1 dispatches immediately AFTER the ELIG merge and BEFORE
  MIXFRAC-1/FULFIL/PANEL (live dogfood defect; composer verified zero file overlap with MIXFRAC-1
  and FULFIL; PANEL rebases on this merge and MUST re-read onDraftResult arm order at its dispatch
  tip). This reorders within the pre-ratified pool; the coder fleet is strictly serial, so no
  concurrency rule is touched.
- Browser gate: orchestrator territory; §4C verbatim; async per lane ruling 6b; browser-gate windows
  must not overlap PANEL's on the shared fixture run page.
- Orch verification of load-bearing cites at tip 40b3175b (pre-promotion, first-hand):
  shorthandChat.ts needs-clarification arm with events:[] at ~:660-671 CONFIRMED; reached from the
  event_shorthand arm AgentOrchestrator.ts:2502 with shorthandResultFromCompile call ~:2584 and
  early return CONFIRMED; raw event_graph refusal on shorthand surfaces CONFIRMED;
  holdShorthandIntent export shorthandChat.ts:327 CONFIRMED; PB-CH-4 D1 comment family present in
  AiTabPanel.tsx CONFIRMED; useChatThread.ts lives at
  app/src/event-editor/right-pane/ai/useChatThread.ts (composer's path shorthand corrected here).


Draft: l2t1635 composer (cl-spec-composer), 2026-10-21 ~17:10-22:15 EDT. DRAFT — orchestrator reviews,
rules OQs, promotes.
Trunk at composition: cl/integration-2, code tip 6f8fb519 (MATRES-RECV merged); docs tip moving under
me (0f8d24c9 / 40b3175b observed during recon — docs-only). ALL file:line cites below were re-read by
the composer in the trunk working tree (/mnt/vast/home/brad/git/cl-integration-2) via
`git -c core.fileMode=false` — cite THESE numbers, not the task block's, where they differ (§2 drift).

## 1. Goal
Make a revise-it chat turn on the run page either (a) re-mount deck ghosts from the revised shorthand,
by not re-asking material questions the scientist already answered inside the same proposal (the spurious
hold that swallowed the events), or (b) when a hold IS legitimate, show the cards it asks — and NEVER let
a turn land a sidebar review state over an empty plate with zero events and zero visible cards: that state
must be a REPORTED failure.

## 2. Verified root facts (composer-read first-hand at the cited tip)
Task-block line drift: the quoted numbers are checked against the tip; deltas named inline.

SERVER — which leg returns the empty-events success:
- `isDocDiscussionTurn = attachmentMessages.length > 0` — AgentOrchestrator.ts:1771. The leg (i) result
  `{ success: true, clarificationNeeded: docDiscussionContent, events: [] }` is at :2373-2375 (task said
  :2373-2378 — matches). Attachment decoding :1740-1764. A revise utterance lands here ONLY if the
  request carries attachments. The run-page chat NEVER sends attachments: the client request builder
  (useChatThread.ts:203-215) has no `attachments` field at all, and the AiTabPanel comment at :220-223
  states uploads ride `attachments` only "when Phase 9 adds upload support". Leg (i) is structurally
  unreachable from the revise path. Pinned by the replay below (`docDiscussion=false` in the lane log).
- The :3728 material-ambiguity hold (`parsed.events = [] as unknown as typeof parsed.events;` at
  AgentOrchestrator.ts:3728, task said ~:3728 — exact) lives on the LEGACY raw-event_graph draft path.
  On `workspace.deck` that path is unreachable for event drafting: the surface is shorthand-drafting
  (config/drafting/shorthand-drafting.yaml:12 `surfaces: [workspace.deck]`, consumed by
  surfaceDraftsShorthand, shorthandDrafting.ts), the `event_shorthand` arm EARLY-RETURNS its result at
  AgentOrchestrator.ts:2594 (arm opens :2502), and a raw `event_graph` call is REFUSED (AS-4 arm :2608).
  `draftProducedNothing` (:3528-3538) is likewise legacy-path-only.
- THE SWALLOWING LEG (third leg, named by the live replay, §5): the `needs-clarification` arm of
  `shorthandResultFromCompile` — server/src/ai/shorthandChat.ts:654, arm :660-671, literal
  `events: []` at :665: a valid revised shorthand whose compile needs ANY clarification returns
  `{ success: true, events: [], clarificationRequests: [...], shorthand }` — zero events under a
  success, INTENTIONALLY (the same "hold the whole draft, ask per-material up front" doctrine as
  :3721-3748's comment at :3722-3727). The task's `files:` clause names AgentOrchestrator.ts; the
  composer's discriminator pins the exact site in shorthandChat.ts, called from AgentOrchestrator.ts:2584.
- The answered-bindings loss: clarification answers fold deterministically ONLY on the answer turn
  (AgentOrchestrator.ts:1323-1395, `holdShorthandIntent` shorthandChat.ts:327, held per
  conversationKey). A LATER revise turn sends no `clarificationAnswers`, the model re-extracts a fresh
  shorthand with bare prose labels, and the spine re-resolves from scratch — `ambiguous-noun` fires
  again on labels the scientist already bound (§5 replay evidence: candidates include the MSP-DRAFT
  records the conversation itself minted). The revision therefore holds with events=[] every single
  time the lab spine has any near-duplicate records — the lab's steady state.
- draftRevision rides correctly: client attaches `draftRevision {currentPreviewDraft, revisionHistory}`
  at AiTabPanel.tsx:306-313 (task said :308 — inside this spread); server renders it
  (systemPrompt.ts:244, formatDraftRevisionContext :258-277 — "Return a full replacement draft"). The
  model DID emit a corrected revised shorthand in the replay (:tool_call frame, 32 wells A1:D8).

CLIENT — mount path and the wall that already exists on the sibling leg:
- `onDraftResult` AiTabPanel.tsx:389. Arms in order: error→reset :423-428 (R-Defect-1);
  workstate/ledger flags :437-452 (PB-CH-4 D1 / PB-CH-8); protocol_edit :459-510;
  `clarifications-needed` dispatch :512-523 (mode 'clarifying' → auto subtab 'questions', QuestionsPanel
  renders :1361-1384 — cards DO render on the run page when present); else `draft-ready` :524-541 with
  `changes: changesFromDraftEvents(draftedEvents)` — an empty-events, zero-card turn opens an actionable
  review over an empty change list: EXACTLY the PB-CH-4 D1 bug shape. Drift note: the task cites the
  PB-CH-4 D1 comment at ":617+"; at this tip it is at :327-343 (:612+ is the recompile comment).
- Ghost mount: `buildPreviewFromDraft` call :556-568, `hasPreview` guard :569-571
  (`previewPlacements.length > 0 || previewEvents.length > 0`), `actions.setPreview` :586-607, revision
  trail append :580-586. With events=[] the guard fails and setPreview is never called — ghosts never
  remount. `previewActive` :1211-1215 (input shows "Revise" off the MOUNTED preview).
- THE HONEST WALL ALREADY EXISTS on the sibling leg — copy the pattern, do not reinvent:
  `handleShorthandRecompile` :618, SH-QB-1 fix-2 "the loud-failure rule" :647-667: zero events IS the
  zero-ghost condition, the existing verbatim-error surface renders a NAMED reason, the prior proposal
  stays, never a silent empty preview. The chat draft leg (:512-541) has NO such arm. Note the recompile
  path does not append `revisionHistory` (:696-705) — OQ-3.
- `clearPreview` is never called by a new draft turn — an old mounted preview survives a held revise
  turn; the "empty plate" Brad saw is a deck without ghost wells, which both zero-event legs produce.

## 3. Files in scope
IN (worker-owned):
- server/src/ai/shorthandChat.ts — the swallowing arm :660-671 and the binding-reuse it needs
  (accepted-bindings hint consumed at the compile seam); NEW server/src/ai/shorthandChat.reviseReuse.test.ts.
- server/src/ai/AgentOrchestrator.ts — ONLY the shorthand-arm call site :2584 (pass the reuse hint from
  the conversation's held/answered state) and, if the orchestrator ruling requires it, the honest-wall
  note on the arm. NOT :3728 (leave the legacy hold byte-identical — task constraint), NOT the doc arm
  :2373-2385 (disproved), NOT the legacy path :3528.
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx — the honest-wall arm in `onDraftResult` (chat draft
  leg, mirrors :647-667's discipline); NEW AiTabPanel.ghostRemount.test.tsx and
  AiTabPanel.honestWall.test.tsx.
- tests at the proven plane: existing harnesses AiTabPanel.shorthandClarification.test.tsx (option-
  capturing useChatThread seam — drive the real onDraftResult) and the server tests that drive the real
  orchestrator.run through the assist handler.
OUT of scope (explicit): :3728 legacy hold (do NOT gut — task notes); doc-discussion leg;
shorthand-drafting raw-event_graph refusal; protocol_edit/ChangesPanel protocol diffs;
compiler/resolution/** and server/src/resolve/** (MATRES-ELIG LIVE — the reuse hint MUST be applied at
the ai/ seam BEFORE resolution, never inside resolution); simpleVerbs/compositionFractions/config/drafting
fraction policy (MIXFRAC-1 — the replay's re-emitted 50/50/10 fractions are MIXFRAC's disease, not this
item's); clarification FACT shape (MATRES-PANEL — cards keep their current shape); deck ghost rendering
machinery (buildPreviewFromDraft/LawnSurface ship correct — the task's why: this closes DELIVERY only).

## 4. Acceptance criteria
### 4A. Task `verified by:` VERBATIM
(1) Discriminator artifact committed: the headless replay raw (which leg, what payload) pinned in the
spec BEFORE code changes — RED on the failing leg. (2) RED-first test at the fault plane: server-leg =>
server test drives the revise context through the real handler and asserts events non-empty (or
clarification cards non-empty if the hold is legitimate — then the client must still render them);
client-leg => AiTabPanel/preview test: a draft result with events mounts previewPlacements. (3) Honest-
wall test: sidebar review state + zero events + zero cards => reported-failure message renders (never
silent). (4) BROWSER GATE (UI-adjacent, non-negotiable, async): at :5193 on a fresh run workspace — draft
with the canonical utterance, then a revise prompt (e.g. change volumes) -> ghosts REMOUNT, tooltips
inspectable, revised composition readable; and the negative: force the hold path, cards visible OR honest
failure line, never an empty plate with a happy panel. VERDICT: accept.
### 4B. Restatement (measurable)
1. Discriminator artifact: the replay of §5 committed under .hermes/plans/ (payload + raw done-frame +
   the two backend.log lines) in the worker's deliverable commit — before any product edit.
2. Server RED→GREEN: a test driving AgentOrchestrator.run with the §5 revise payload + a prior ANSWERED
   binding for the ambiguous labels asserts the done result's `events.length > 0`; a second case with a
   genuinely NEW unbound label asserts `events.length === 0` AND `clarificationRequests.length > 0`
   (legitimate hold keeps its cards). Both through the real handler, no handler mocks.
3. Client GREEN: AiTabPanel.ghostRemount.test.tsx — a draft result with events, dispatched via the real
   onDraftResult seam, mounts previewPlacements (editor state assertion); AiTabPanel.honestWall.test.tsx
   — a `{success:true, events:[], no clarificationRequests}` result renders a reported failure naming
   what is missing and does NOT leave an actionable Apply (per PB-CH-4 D1: sidebar reset + visible error
   text in the DOM).
4. Hold-with-cards unchanged: the existing clarification turn still renders shorthand above the cards
   (AiTabPanel.shorthandClarification.test.tsx stays green).
5. revisionHistory shape unchanged on the chat revise path (trail still appends + rides back).
6. Server typecheck EXIT 0; app tsc line-count identical to trunk baseline (sorted-diff empty); full
   server suite failing-file set == baseline (comm-empty vs the 88-file baseline record).
### 4C. Browser gate criteria (verbatim from the task, orchestrator-run, async)
At :5193 on a fresh run workspace — draft with the canonical utterance, then a revise prompt (e.g. change
volumes) -> ghosts REMOUNT, tooltips inspectable, revised composition readable; and the negative: force
the hold path, cards visible OR honest failure line, never an empty plate with a happy panel. VERDICT: accept.
Use the proven playwright harness; `.chat-page__msg` is the WRONG selector on the run page (recorded
gate pitfall); measurements read by the orchestrator, reviewer judges artifacts.

## 5. Root-cause discriminator (pinned BEFORE code changes — LIVE replay evidence, composer-run)
Replay: POST /api/ai/assist/stream against the live lane backend (:3093, served tip), surface
`workspace.deck`, with a realistic `draftRevision` context (mounted preview events carrying composition
fractions + revisionHistory) and a revise utterance ("make it 32 wells"), history showing the canonical
draft turn. Payload (worker re-runs and commits as the discriminator artifact):
```json
{ "prompt": "Actually make it 32 wells instead, keep the rest the same.",
  "surface": "workspace.deck",
  "context": { "studyId": "STU-revise-ghost-probe", "activeTabKind": "deck",
    "systemPromptId": "workspace.deck",
    "labwares": [{"labwareId":"plate-seed-1","name":"Seeding plate","labwareType":"96-well-plate"}],
    "draftRevision": {
      "currentPreviewDraft": { "events": [ { "eventId": "preview-e1", "event_type": "add_material",
          "verb": "add", "labwareId": "plate-seed-1",
          "details": { "labwareId": "plate-seed-1", "wells": ["A1","A2","A3"],
            "material_spec_ref": { "label": "Trypsin-EDTA/DMEM/FBS mix" },
            "composition": [
              {"component_ref":{"label":"Trypsin-EDTA"},"fraction":"50%","role":"additive"},
              {"component_ref":{"label":"DMEM"},"fraction":"45%","role":"buffer_component"},
              {"component_ref":{"label":"FBS"},"fraction":"5%","role":"additive"} ] } } ],
        "labwareRequirements": [], "labwareAdditions": [] },
      "revisionHistory": [ { "prompt": "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL across A1:A3 of the seeding plate", "createdAt": "2026-10-21T20:00:00.000Z" } ] } },
  "history": [ { "role": "user", "content": "50/50 Trypsin-EDTA/DMEM + 10% FBS with 200 HepG2 cells/uL across A1:A3 of the seeding plate" },
               { "role": "assistant", "content": "Draft compiled deterministically from the scientist-intent shorthand." } ] }
```
Raw result (captured SSE `done` frame + lane backend log, .run/backend.log lines 117-126):
- `[agent bqvapt] tools=1 docDiscussion=false maxTurns=15` — LEG (i) RULED OUT: a revise turn is NOT a
  doc-discussion turn (no attachments from this client, §2).
- Tool frame: intent `event_shorthand` with the REVISED document (`intentId: seed-hepg2-trypsin-dmem-fbs-32wells`,
  `targetWells: ["A1:D8"]` = 32 wells) — the model does the revision right; `tool_result success=true`.
- `done` frame: `{"success":true,"events":[],"clarificationRequests":[ 4 x kind:"material",
  reason "ambiguous-noun", candidates incl. `MSP-DRAFT-EVG_*` records earlier drafts minted ],
  "shorthand":"intentId: seed-hepg2-trypsin-dmem-fbs-32wells ..."}`.
- `[agent bqvapt] done event_shorthand success=true events=0 clarifications=4 elapsedMs=32240`.
VERDICT: the swallowed-events leg is shorthandChat.ts:665 (needs-clarification arm of
shorthandResultFromCompile), reached at AgentOrchestrator.ts:2502→2584→2594. Leg (ii) :3728 is NOT the
firing leg (legacy path unreachable on this surface); leg (i) is structurally unreachable.
Why the hold is SPURIOUS here: every label the spine re-asked had already been bound earlier in the
proposal (the answered cards minted/selected the MSP-DRAFT/MAT records visible in the candidate list);
the revise turn carries no `clarificationAnswers`, so the fold at :1323-1395 never runs and resolution
restarts from prose. The result: correct shorthand + zero events + re-asked-answered questions + never-
remounted ghosts = Brad's exact defect.
Honest limitations (state plainly): (a) Brad's literal dogfood turn is NOT recoverable — the lane backend
restarted 14:32 EDT and its log carries zero assist traffic before this replay; the replay reproduces the
defect SHAPE, not that exact turn. (b) The replay was a FRESH conversation (no answered bindings sent),
so it pins the hold + zero-events server behavior and the re-ask mechanism, while the client-side
zero-card variant (needs-clarification outcome with zero facts, or any future leg that succeeds with
events=[] and no cards) is pinned by the honest-wall tests, not by this replay. If the orchestrator wants
Brad's exact turn reconstructed: a fresh :5193 witness session (draft → answer the cards → revise) is the
cheap confirmation; the fix design does not depend on it.

FIX DESIGN (two legs, one item):
(1) SERVER (root cause): the conversation's accepted label→ref bindings, already held per
conversationKey (holdShorthandIntent :327 + the answer fold), must feed the next compile on a revise
turn as an EXACT-MATCH reuse hint applied at the ai/ seam BEFORE resolution (pass into
compileShorthandDeterministically the same shape `shorthandDeckLabwares` already rides — a
generic `{label, ref}` list; zero reagent nouns, zero domain branches, TS sees strings). A label the
scientist already bound in THIS proposal compiles without re-asking; anything else still holds with its
cards — the hold doctrine (:3722-3727 comment) is UNTOUCHED. Scope lifecycle: bindings live only for the
active proposal (cleared on Accept/Discard/new proposal — the proposalStartIndexRef boundary,
AiTabPanel.tsx:381, already marks fresh starts client-side; server-side the held-intent store is the
existing precedent). POLICY SAY-SO: this fix is essentially mechanical plumbing (carry existing resolved
bindings forward); the ONLY policy component is the reuse scope (exact-match label, active proposal) —
OQ-1 asks Brad to ratify; if the orchestrator wants it switchable, ONE key in
config/drafting/shorthand-drafting.yaml (loaded per call — no restart trap) is the smallest data home.
(2) CLIENT (honest wall, required end-state 2 regardless of OQ-1): in onDraftResult, before the
`draft-ready` else arm, when `draftedEvents.length === 0 && !result.clarificationRequests?.length &&
!result.error` (and not a flagged workstate/ledger/protocol-edit turn) — do NOT open an actionable
review; render a REPORTED failure naming what the turn delivered (shorthand-only? notes? nothing?) on
the existing verbatim-error surface pattern (:647-667) and reset the sidebar per PB-CH-4 D1. The
`clarifications-needed` arm stays as-is (cards render — §2). Zero-LLM recompile path already walls (check
(3) of the task: `handleShorthandRecompile` ghosts correctly TODAY when events arrive — verified :647-696;
its revisionHistory drop is OQ-3).

## 6. Reviewer bait (pre-empt each)
1. "You picked the wrong leg — check :2373/:3728." The replay's `docDiscussion=false` log line + the
   :2594 early-return + AS-4 :2608 refusal pin both legs out; :3728 must stay byte-identical (diff-check
   it in the report).
2. exactOptionalPropertyTypes: every new optional field (reuse hint, wall message) built by conditional
   spread, never `field: undefined`; shorthandChat's existing arms are the model.
3. YAML-reload trap: if a reuse toggle is added it lives in shorthand-drafting.yaml, loaded PER call
   (never process-cached); if any schema YAML changes (it should not) the stack restart is BLOCKING —
   use background=true (recorded lane pitfall).
4. Hardcode boundary: zero reagent nouns / zero label literals in TS; the reuse hint is generic
   `{label, ref}` strings; a reviewer WILL grep the diff for "Trypsin" — only tests/fixtures may carry it.
5. Two local terms for one entity: reuse MUST bind to the scientist's already-chosen ref; minting a
   second local term for an already-bound label is the cardinal sin (CLAUDE.md rule).
6. Do not gut the hold: the fix removes SPURIOUS re-asks, not holds. A test asserting a genuinely-new
   ambiguous label STILL holds with cards is mandatory; deleting :660-671 wholesale is the lazy wrong fix.
7. Leak discipline: reuse state must die with the proposal (Accept/Discard/fresh start). Stale-binding
   reuse across proposals is the workstate-flag leak class all over again — pin a second-proposal test.
8. UI placement SOP: the failure message rides the AI panel (chat/ChangesPanel), NOT the deck; the deck
   stays a deterministic surface; no new rail surface (D1).
9. Don't confuse legs: the zero-LLM recompile path (POST /intent/compile) already walls (:647-667) — do
   not "fix" it twice; the chat draft leg is the one missing the wall.
10. Gate-selector trap: `.chat-page__msg` never exists on the run page; the browser gate must use the
    proven harness selectors.
11. The replay's fractions (50/50/10 re-emitted) look wrong — that is MIXFRAC-1's convention defect;
    fixing fractions here is scope creep into MIXFRAC's files (banned).

## 7. Tests (RED first, planes named)
Plane 1 — server handler (fault plane, per verified-by (2)):
- server/src/ai/shorthandChat.reviseReuse.test.ts (RED): run() with the §5 payload WITHOUT reuse →
  events=[] (documents the swallowing arm); WITH an accepted binding for each composition label →
  events.length > 0, cards empty. Real orchestrator + real deterministic compile; mocked inference only
  (canned tool_call frame = the replay's exact shorthand). Second case: one label with NO prior binding →
  events=[] AND clarificationRequests.length > 0 (the legitimate hold keeps its cards). Third: bindings
  do not leak into a fresh conversationKey proposal.
Plane 2 — client (honest wall + mount, per verified-by (2)(3)):
- AiTabPanel.ghostRemount.test.tsx: draft result with events → setPreview carries previewPlacements > 0
  and revisionHistory appended (existing option-capturing seam).
- AiTabPanel.honestWall.test.tsx: {success:true, events:[]} with zero cards → reported-failure text in
  the DOM naming the shortfall; NO actionable Apply (sidebar not 'reviewing' over empty changes).
  Negative: {success:true, events:[], clarificationRequests:[1]} → cards render (existing green test
  holds; assert the wall does NOT fire on the legit hold).
Plane 3 — goldens/realization: none expected (no compiler change); if the reuse hint changes any
blessed golden output, that is a WRONG TURN — stop and report.
Plane 4 — browser gate (§4C): orchestrator-run, async, post-merge.

## 8. Verification commands with expected output
```
cd /mnt/vast/home/brad/git/cl-integration-2
# first targeted check (early proof of the leg, RED before any edit):
curl -s -N -m 240 -X POST localhost:3093/api/ai/assist/stream \
  -H 'Content-Type: application/json' -d @discriminator-payload.json | tail -c 2000
#   expect: "success":true ... "events":[] ... "clarificationRequests" (pre-fix); and in
grep -n "done event_shorthand" .run/backend.log | tail -1     # events=0 clarifications=>=1
# after the server fix (reuse test at the handler plane):
npm run test:run -w server -- shorthandChat.reviseReuse       # PASS (new file green, incl. the legit-hold case)
npm run test:run -w server -- shorthandChat                   # all existing shorthandChat files green
npm run test:run -w server -- AgentOrchestrator               # existing orchestrator files green
npm run typecheck -w server                                    # EXIT 0 (recent-lane gate)
npm run test:run -w server                                     # failing-file set comm-empty vs the 88 baseline
npm run test:unit -w app -- AiTabPanel                         # green incl. the two new files
npx tsc -p app --noEmit 2>&1 | wc -l                           # == trunk baseline line count
git -c core.fileMode=false diff 6f8fb519 -- server/src/ai/AgentOrchestrator.ts | grep -c "3728\|parsed.events = \[\]"   # 0 — legacy hold untouched
```
Stack restart only if YAML touched (it should not; OQ-1 data toggle is the only YAML candidate).

## 9. Sequencing / collision
Fleet state at composition (handoff l2t1830/l2t1910 lineage): MATRES-ELIG coder LIVE (fleet lock held);
MIXFRAC-1 blessed, dispatches when the lock frees; then FULFIL (READY-WITH-PATCHES), PANEL, CHAIN gate.
- vs ELIG: overlap ONLY if the reuse hint reaches into compiler/resolution/** or server/src/resolve/** —
  it MUST NOT (fix lives at the ai/ seam, §5). Vocabulary YAML untouched here. No collision if §3 OUT is honored.
- vs MIXFRAC-1: zero file overlap (shorthandChat/AgentOrchestrator shorthand-arm + AiTabPanel vs
  simpleVerbs/compositionFractions/config/drafting/goldens). Shared-canonical-utterance goldens: none
  shared — no golden-file coordination needed.
- vs FULFIL: plate-event.add-material untouched here; the replay's MSP-DRAFT candidates are read-only
  evidence. No overlap.
- vs PANEL: REAL but narrow — PANEL owns the app clarification/gapcard surface + server clarification
  FACT shape. This spec changes NO fact shape (cards verbatim) and adds no gapcard; it touches the same
  AiTabPanel.tsx on adjacent arms (honest-wall else-arm, not the clarifications arm). Overlap = same
  file, different arms → textual merge conflicts likely, semantic conflict only if PANEL moves
  onDraftResult's arm order. RECOMMENDATION: dispatch REVISE-GHOST-1 immediately AFTER the ELIG merge
  and BEFORE MIXFRAC/PANEL (live dogfood, small, no data surface), PANEL rebases on it; if the
  orchestrator prefers the ratified order, PANEL must re-read onDraftResult arms at its dispatch tip.
- Browser gates on :5193 must not overlap in time with PANEL's gate (shared fixture run page).

## 10. Open questions (max 3)
OQ-1 (BRAD-LEVEL — product policy, silence is never approval): must a revise turn be allowed to reuse
the scientist's already-answered bindings for identical labels (no re-ask), or does the lab WANT every
fresh extraction re-confirmed? Checked: hold doctrine comment AgentOrchestrator.ts:3722-3727; fold-on-
answer-only :1323-1395; the replay's candidate list proving answered bindings exist but don't carry.
Composer default: exact-match reuse within the active proposal, bindings never cross a proposal boundary.
OQ-2 (surface of the honest-wall message): checked — the run page has two honest surfaces: the recompile
verbatim-error slot (ChangesPanel shorthandError :49/:92) and the PB-CH-4 D1 chat-reset path. Default
stance: reported failure visible in the ChangesPanel error slot region with sidebar reset (no actionable
Apply), text also summarized to the chat log; no new surface.
OQ-3 (revisionHistory on the recompile path drops the trail, AiTabPanel.tsx:696-705): checked the task's
end-state (3) "revision trail unchanged in shape — revisionHistory still rides back"; the CHAT revise path
appends correctly (:580-586) but the RECOMPILE path replaces the preview without re-attaching history.
Composer default: out of scope for this item (one-line follow-up worth its own pin), record-only note in
the report. If the orchestrator rules it in-scope, it is a two-line additive spread + one test.
