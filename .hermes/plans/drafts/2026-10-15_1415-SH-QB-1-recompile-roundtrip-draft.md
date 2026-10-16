# SH-QB-1 — SPEC DRAFT — lane 2 — composer l2t1415
Draft: 2026-10-15T14:15 EDT. Trunk base: cl/integration-2 tip b398db034e8027a9da06063132dee6be6654705b
(W2-9 g2d final-cycle merge; includes HARNESS-SEQ-2 fix1 via 1b2b5ce9 — task-list line cites are at
532ec676 and ARE RE-ANCHORED below, two of them MOVED/WRONG-FILE). DRAFT — orchestrator reviews,
rules the OQs, and promotes; do NOT dispatch unreviewed.

## Contract header
- Lane 2, item SH-QB-1 ("Save & Re-compile must recompile the edited shorthand verbatim — never
  re-ground from a derived sentence — and an empty compile must fail loudly").
- File ownership IN scope:
  `server/src/api/handlers/IntentCompileHandlers.ts` (the ONE route the recompile rides — deck
    context intake + outcome/clarification forwarding),
  `server/src/api/handlers/IntentCompileHandlers.roundTrip.test.ts` (NEW — the F2 harness),
  `server/src/api/handlers/IntentCompileHandlers.shapeFork.test.ts` (NEW — paste #3 vs #8 pin),
  `app/src/shared/api/client.ts` (the `intentCompile` method at :4085-4097 ONLY — additive optional
    deck field; NO other method touched),
  `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (the `handleShorthandRecompile` leg :618-671
    and its wiring sites :1340-1345 ONLY — see region-discipline below),
  `app/src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx` (NEW — client pin),
  a client-leg test extending the `client.intentCompileHeld.test.ts` fetch-spy idiom.
- OUT of scope (hard): `server/src/ai/shorthandChat.ts` — IMPORT its exports, NEVER EDIT (SH-QA-1's
  coder is LIVE on that file right now, wt/SH-QA-1-lane2-l2t1405); `server/src/ai/AgentOrchestrator.ts`
  (the deck-compose pattern at :1213-1222 is the REFERENCE, not a target — and its :344 tsc error is
  pre-existing baseline, see findings 9); `server/src/compiler/scientistIntent/normalizeScientistIntent.ts`
  and `server/src/compiler/resolution/**` (SH-QA-1/SH-QA-3 hot cluster — touch ONLY under OQ3's
  prove-divergence-first clause, which serializes this item behind SH-QA-1);
  `server/src/api/handlers/IntentCompileFromPromptHandlers.ts` (WRONG ROUTE for this flow — findings 2);
  QuestionsPanel/ClarificationPicker/sidebarState/EventEditorContext/preview-projection/deck
  ghost-plumbing (SH-QA-2 and SH-QC-1 own those); `schema/**`, `config/**`,
  `server/src/compiler/scientistIntent/goldens/**` + `MANIFEST.yaml` (must not move — B7).
- Region discipline on shared files: AiTabPanel.tsx is also SH-QA-2's (clarifying-mode guard
  :1318 leg, QuestionsPanel wiring :1303-1322) and SH-QC-1's (cancel leg ~:1059). This item's hunks
  are confined to :618-671 + :1340-1345 — region-disjoint by construction, so the wave-header
  "file-disjoint" claim holds ONLY if the coder respects these region bounds; a hunk outside them is
  a scope fail.
- Queue position: deps: none — dispatchable NOW, concurrent with the live SH-QA-1 coder and with
  SH-QA-2/SH-QC-1 dispatches, BECAUSE the default design touches none of the SH-QA cluster's files
  (shorthandChat.ts is import-only). The task's serialization condition ("only if it must touch the
  normalizer — prefer not") is honored by OQ3's pin-first default.

## Goal (one sentence)
Make "Save & Re-compile" of an edited (or unedited) shorthand see the SAME resolution context the
chat path saw — the editor's deck plates threaded into POST /intent/compile — so a no-edit
recompile reproduces the identical event set, both observed shorthand shapes pin to the same
events, and a compile that yields zero ghosts can no longer be presented as a silent success.

## Ground-truth findings (VERIFIED first-hand in the tree at b398db03; task cites re-anchored)
1. THE FRONTEND LEG IS AS THE TASK SAYS IT IS: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:618`
   `handleShorthandRecompile` POSTs the editor's YAML UNTOUCHED via `apiClient.intentCompile(yaml)`
   (:623). `lastShorthandDraftRef.current?.prompt` (:631) is display-only sourcePrompt metadata
   (:366, :404-405). Confirmed non-suspect.
2. **TASK-CITE DRIFT 1 — WRONG FILE.** The recompile route is `POST /intent/compile`
   (`app/src/shared/api/client.ts:4085-4097` sends ONLY `{ intent: yaml }`; registered at
   `server/src/server.ts:1639-1641` → `server/src/api/handlers/IntentCompileHandlers.ts:119`).
   `IntentCompileFromPromptHandlers.ts` is a DIFFERENT route (`/intent/compile-from-prompt`,
   registered server.ts:1645-1646 — the one-shot small-LLM path). The task's
   "IntentCompileFromPromptHandlers.ts:198 builds createLabwareLookup(store)" is real code on the
   real asymmetry pattern but on the route this flow never calls. The load-bearing site is
   **`IntentCompileHandlers.ts:50`** — `createLabwareLookup(deps.store)`, STORE ONLY — with the
   store-backed spine injected at :59-62 (SPINE-4 fix1/D1) and NOTHING deck-composed.
3. THE CHAT PATH'S ASYMMETRIC TWIN (the fix's reference pattern): `AgentOrchestrator.ts:1213-1222`
   (task said ~1174-1183 — **DRIFT 2, moved +39 by the SEQ-2/g2d merges**, content identical):
   `shorthandDeckLabwares = context?.labwares` → `composeLabwareHintLookupWithDeck(deck, base)`
   (exported, `shorthandChat.ts:111-123`, deck-first EXACT-name-only match, store fall-through
   byte-identical; `deckLabwareExactMatches` :89-104 maps a deck plate to
   `{ recordId: lw.labwareId }`). The chat result additionally runs `bindShorthandEventsToDeck`
   (`shorthandChat.ts:138`, applied inside `shorthandResultFromCompile` :570) so proposal events
   carry deck-bound `details.labwareId`, and forwards non-empty `labwareAdditions` (:599-601).
   `/intent/compile` does NONE of the deck-side work. Deck plates are editor state, not store
   records (the :1206-1212 comment states exactly why "plate1" false-bars as unknown-noun without it).
4. THE SILENT-EMPTY MACHINERY (the F2 paste, verified end-to-end): `compileScientistIntent.ts:253-272`
   — a resolve_nouns bar (or producer clarification) returns outcome `'needs-clarification'` with
   `terminalArtifacts {events:[], directives:[], gaps:[]}` (:260-264 — gaps EMPTY, atomically zero
   artifacts) and the structured `clarifications` ON THE RESULT (:271, :333).
   `IntentCompileHandlers.ts:96-100` then sends, at HTTP 200, ONLY `{ outcome, terminalArtifacts }` —
   **`result.clarifications` is dropped on the floor**; `computeOutcome` (:210-214) returns 'gap' only
   when gaps.length > 0 (non-blocking gaps). Client side: `AiTabPanel.tsx:624-630` never inspects
   `compiled.outcome`, maps `terminal.gaps` (empty on the bar arm) to warnings (:626-630), and fires
   `draft-ready` with `changes: changesFromDraftEvents([])` and `warnings: []` (:653-661). Net:
   200 + empty events + empty gaps + dropped clarifications ⇒ EMPTY preview, zero errors — exactly
   paste #4/#8. (The task's "HTTP 200 outcome 'gap' with empty terminalArtifacts" is the
   contract-comment shorthand at IntentCompileFromPromptHandlers.ts:23-26; the operative arm for
   unknown-noun is 'needs-clarification' arriving as a 200 — SAME silent shape, worse: even the
   warnings array is empty. `CompileOutcome` union: CompileContracts.ts:87.)
5. SHAPE FORK (F5) INTAKE GEOMETRY: `normalizeScientistIntent.ts:644-648` carries `action.params`
   entries onto the candidate event (params WINS); :651-665 COMP-4's declared `cardinality: many`
   action-level `composition` rides only when `event[contract.name] === undefined` ("Part I
   byte-honesty"); the blob-bar exemption honors BOTH forms (:731-742). Vocabulary declares
   `composition` for add_material (`schema/scientist-intent/scientist-intent-vocabulary.yaml:40-43`,
   and the second verb at :241-244), kind `resolvable`, domain material. So both shapes were
   BUILT to converge at the candidate event — whether they provably converge for the paste #3
   (params-nested) vs paste #8 (top-level + targetWells) docs is EXACTLY what the pin test proves or
   disproves (OQ3 — do not assume either way).
6. HARNESS INVENTORY: `server/src/compiler/resolution/spine4ProductionWiring.test.ts:63-125` is the
   canonical handler-level harness (mockRequest + send() capture over `createIntentCompileHandlers`,
   `recordStoreWith` seeded stores — the D1 false-bar repro). Deck fixtures/binding arms:
   `server/src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts` (deckLabwareExactMatches +
   bindShorthandEventsToDeck arms) and `shorthandChat.labwareIdBinding.test.ts`. Client recompile
   pins to extend: `ChangesPanel.test.tsx:363-417` (Save sends UNTOUCHED — keep green),
   `client.intentCompileHeld.test.ts` (fetch-spy idiom for the request-shape pin),
   `AiTabPanel.workstate.test.tsx:499` (existing recompile-adjacent harness). No
   IntentCompileHandlers.test.ts exists today — spine4ProductionWiring is the only current caller.
7. `DeckLabwareSummary` (`shorthandChat.ts:59-63`) = `{ labwareId: string; labwareType?: string;
   name?: string }` — the chat request's `context.labwares` element shape (server.ts:1312,
   AgentOrchestrator.ts:1218). The editor holds `editor.state.labwares` (AiTabPanel.tsx:642 uses it
   as existingLabwares) with labwareId/name/labwareType — the client-side mapping is a trivial
   structural pick.
8. MANIFEST baseline hash at b398db03: `git -c core.fileMode=false hash-object
   server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` =
   `fbf743ab1384778de43eeb113da0f0857eef9fce` — must be IDENTICAL at delivery (B7).
9. MEASURED BASELINES at b398db03 (this session, this tree): `cd server && npx tsc --noEmit`
   → **1** error: `src/ai/AgentOrchestrator.ts(344,18): error TS2339: Property 'id' does not exist
   on type 'ResolvedRecordTarget | ResolvedOntologyTarget | ResolvedSequenceTabTarget |
   ResolvedSequenceRecordTarget'` — PRE-EXISTING at tip (post-dates SH-QA-1 spec's 0 at 532ec676;
   introduced by the SEQ-2/g2d region), OUTSIDE every owned file: do not fix, do not re-baseline
   (set-diff discipline). `cd app && npx tsc --noEmit` → **23** (unchanged baseline, set-diff).
   Full server suite keeps the known load-timeout flap class — failing-FILE-SET equality, never a
   raw count.

## Design
### A. Deck-context threading through POST /intent/compile (fix 1, the round-trip) — OQ1 pre-nod
Additive, optional, backward-compatible. Absent field ⇒ today's behavior byte-identical (the route
keeps compiling for every other caller — goldens replay it).
1. `IntentCompileHandlers.ts`: accept `deckLabwares?: DeckLabwareSummary[]` on the body
   (`IntentCompileBody`); when a non-empty array is present, build the compile's
   `searchLabwareByHint` as `composeLabwareHintLookupWithDeck(deckLabwares, searchLabwareByHint)`
   — IMPORTED from `../../ai/shorthandChat.js`, the SAME deck-first exact-only composition the chat
   seam uses (findings 3). NO re-implementation of matching (B2/B3).
2. On the response, when a deck was threaded, run the SAME post-pass the chat result applies:
   `bindShorthandEventsToDeck(compiled.terminalArtifacts.events, deck)` before sending, so a
   no-edit round-trip's events equal the chat path's proposals field-for-field INCLUDING
   `details.labwareId` (B5). (Store-only calls skip both passes — zero behavior change.)
3. Forward the blocked-reason channel the handler currently drops: send
   `outcome: result.outcome` verbatim (already) AND additively
   `...(result.clarifications.length > 0 ? { clarifications: result.clarifications } : {})`
   (`ScientistIntentUnresolvedFact[]` verbatim — no new type, no new reason code, conditional
   spread for exactOptionalPropertyTypes). The 422/needs-clarification conventions of the
   FROM-PROMPT route stay untouched (different route, B4).
4. `client.ts intentCompile(intentYaml, deckLabwares?)`: second parameter
   `Array<{ labwareId: string; labwareType?: string; name?: string }>`, conditional spread into the
   body — key ABSENT, never `undefined`. Response type gains `outcome?: string` (already loose) and
   `clarifications?: Array<Record<string, unknown>>` mirroring the existing loose typing style.
5. `AiTabPanel.handleShorthandRecompile`: map `editor.state.labwares` to the summary shape (pick
   labwareId/name/labwareType — generic map, zero name literals) and pass it.
### B. No zero-ghost-with-zero-error (fix 2) — the loud-failure rule, OQ2
Client-side invariant in `handleShorthandRecompile` (server alone cannot make it VISIBLE):
- If the compile returns ZERO events, the recompile MUST take the existing verbatim-error arm
  (`setShorthandApply({ error })` — the same visible error surface a rejected edit already uses;
  the prior proposal stays): the message names the reason — first clarification's
  `label + ': ' + reason` from the new body `clarifications` when present, else the first gap
  message, else the literal `'The recompile produced no events (outcome: <outcome>)'` — never a
  silent empty preview.
- Non-empty events keep today's draft-ready flow (warnings from gaps stay); additionally map any
  carried `clarifications` into warnings beside the gaps (non-blocking residue stays visible).
- `outcome === 'complete'` with zero events still errors ("no events" IS the zero-ghost condition).
### C. Shape-fork pin (fix 1's second leg; OQ3 default: PIN ONLY)
A server test compiles the paste-#3 doc (params-nested composition) and the paste-#8 doc
(top-level composition + targetWells) — same semantics — through the threaded `/intent/compile`
with identical store+deck and asserts deep-equal event sets, plus a third leg with the deck plate
ABSENT from the store (the F2 bar repro). Fixture strings live ONLY in the test file (rip-out rule).
If the pin is GREEN as-is: F5 closes with the pin + B's loud rule (an un-normalizable shape can no
longer hide). If RED: STOP at the divergence point, record the exact normalizer seam that forks,
and hand back per the hot-file rule — normalizer edits happen only after this item serializes
behind SH-QA-1 (OQ3), never concurrent.

## Acceptance criteria (verbatim from the task list, id SH-QB-1 "verified by")
> Red-first server tests: recompile(no-edit, with deck context) == original events (deep-equal);
> both observed shapes (paste #3 params-nesting, paste #8 top-level) normalize to the same events;
> a client test pinning that the recompile request carries the editor's exact YAML. Browser gate on
> :5193: F2 recipe verbatim — no-edit recompile keeps identical ghosts; the paste-#8 text ghosts
> the same wells as the preselected shape.

## RED-first test plan (existing harness idioms; fixture strings live ONLY in tests)
### File 1 (new): `server/src/api/handlers/IntentCompileHandlers.roundTrip.test.ts`
spine4ProductionWiring idiom (recordStoreWith + mockRequest + send capture over
createIntentCompileHandlers):
- T1 RED-FIRST (write FIRST — this is the F2 paste headless): store seeded with the mixture's
  materials but NO deck-plate record; deck context `[{ labwareId: 'plate1', name: 'plate1',
  labwareType: 'plate_96' }]`; body = a no-edit shorthand naming plate1 (add_material + volumeUl +
  targetWells, mixture shape per paste #8 with a store-bound material). Today's RED:
  outcome 'needs-clarification', events [], and NO clarifications key on the 200 body (the drop).
  GREEN: outcome 'complete', non-empty events, deck-bound `details.labwareId`.
- T2 ROUND-TRIP DEEP-EQUAL: chat-path compile (createResolveSpineFromContext store + composed
  lookup + bindShorthandEventsToDeck, the AgentOrchestrator.shorthandDeckBinding fixture style) vs
  threaded `/intent/compile` of the SAME doc → `toEqual` on events INCLUDING details.labwareId.
- T3 ABSENT-DECK BYTE-IDENTITY: same handler, body WITHOUT deckLabwares → response identical to
  the pre-change shape (keys: outcome, terminalArtifacts only) — the additive contract pin.
- T4 EDITED-DOC EXACT-DIFF: no-edit events vs one-volume-edited events differ ONLY in the edited
  event's volume field.
- T5 LOUD SERVER CHANNEL: unresolved noun + deck threaded → 200 body carries `clarifications`
  verbatim (label + reason + actionLocation survive intact), events [] — the reason leaves the
  server (client visibility is T8's).
### File 2 (new): `server/src/api/handlers/IntentCompileHandlers.shapeFork.test.ts`
- T6 paste-#3 doc vs paste-#8 doc (same semantics, both shapes, deck threaded) → deep-equal events.
  (GREEN-or-hand-back — see §C; do NOT edit the normalizer to force green.)
- T7 well-pre-selection leg: paste-#8 doc with explicit targetWells ghosts exactly those wells in
  the event addresses (pins the "same wells as the preselected shape" AC server-side).
### File 3 (new): `app/src/event-editor/right-pane/ai/AiTabPanel.shorthandRecompile.test.tsx`
AiTabPanel test idiom (mocked apiClient, editor stub with labwares in state):
- T8 NO SILENT EMPTY (the headline client bait): apiClient.intentCompile resolves
  `{ outcome: 'needs-clarification', terminalArtifacts: { events: [], gaps: [] }, clarifications:
  [plate1/unknown-noun] }` → NO draft-ready fired with empty changes, `shorthand-recompile` error
  surface visible naming the reason, prior preview untouched.
- T9 REQUEST CARRIES EXACT YAML + DECK (the AC's client pin): fetch-spy leg asserting the POST body
  is `{ intent: <verbatim editor text>, deckLabwares: [editor plate summaries] }` — YAML byte-exact,
  plate mapping structural; a body with `deckLabwares: undefined` (key present) must NOT typecheck/
  ship (exactOptionalPropertyTypes arm = key absent when no plates).
- T10 non-empty recompile keeps draft-ready + gaps-as-warnings (today's behavior, no regression).
### Extended, not rewritten
- `client` fetch-spy leg (extend `client.intentCompileHeld.test.ts` idiom in a new
  `client.intentCompileDeck.test.ts` or file-local legs): method emits the deck key ONLY when
  provided; every other method byte-identical (it asserts throw-path isolation — keep).
- `ChangesPanel.test.tsx:363-417` and `AiTabPanel.workstate.test.tsx` stay green untouched.
### Suites that MUST stay green (zero NEW failing FILES; set-diff discipline)
`src/compiler/resolution/spine4ProductionWiring.test.ts` (the only existing
createIntentCompileHandlers caller), `src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts`,
`src/ai/shorthandChat*.test.ts` (SH-QA-1 is editing that SOURCE concurrently — run against YOUR
branch base, do not chase their trunk drift), `goldens/` full replay (the route shape changes are
additive; goldens call the route with no deck ⇒ T3's byte-identity is their guard),
`IntentCompileFromPromptHandlers.test.ts` + `.apiKey.test.ts`, app `right-pane/ai/` whole dir,
`ChangesPanel.test.tsx`, `src/shared/api/` whole dir.

## First targeted check (prove the approach early)
After writing T1 ONLY (no implementation):
```bash
cd server && npx vitest run src/api/handlers/IntentCompileHandlers.roundTrip.test.ts
```
Expected RED: outcome 'needs-clarification' (plate1 unknown-noun), `events: []`, and the payload
has NO `clarifications` key — the F2 paste reproduced headless against the REAL handler + REAL spine,
proving both the deck asymmetry (findings 2-3) and the dropped-reason channel (findings 4) before
any product edit.

## Verification commands (complete; vitest cwd MUST be `server` — schema symlink resolution)
- Baseline BEFORE coding on the dispatch base: `npm run test:run -w server` full → capture
  failing-FILE list to `/tmp/shqb1-base-failfiles.txt`; after, re-run, `comm -3` set equality —
  empty except flaps EACH proven green in isolation (known load-timeout flap class; never quote a
  raw count without the comm proof).
- Targeted server: `cd server && npx vitest run src/api/handlers/
  src/compiler/resolution/spine4ProductionWiring.test.ts src/ai/AgentOrchestrator.shorthandDeckBinding.test.ts
  src/ai/shorthandChat.labwareIdBinding.test.ts src/compiler/scientistIntent/goldens/`
  → ALL green (goldens green WITHOUT any MANIFEST/treeState movement).
- Targeted app: `cd app && npx vitest run src/event-editor/right-pane/ai/ src/shared/api/` →
  zero NEW failing files vs the same comm-captured baseline.
- tsc (measured at b398db03, THIS session): `cd server && npx tsc --noEmit | grep "error TS"` →
  exactly the ONE pre-existing line `src/ai/AgentOrchestrator.ts(344,18): error TS2339 …`
  (set-equality, NOT zero; do not fix it); `cd app && npx tsc --noEmit | grep -c "error TS"` → 23
  with SET-DIFF empty vs baseline (count-equality alone insufficient).
- MANIFEST: `git -c core.fileMode=false hash-object
  server/src/compiler/scientistIntent/goldens/MANIFEST.yaml` →
  `fbf743ab1384778de43eeb113da0f0857eef9fce` IDENTICAL to dispatch base; diff --name-only shows NO
  goldens path.
- Scope: `git -c core.fileMode=false diff --name-only <base>..HEAD` → ONLY §Contract-header IN
  files. ANY of shorthandChat.ts / AgentOrchestrator.ts / normalizeScientistIntent.ts /
  resolution/** / IntentCompileFromPromptHandlers.ts / schema/** / EventEditorContext / deck files =
  scope fail (except OQ3's ruled, serialized normalizer case).
- Restart note: the route change is TS-only (tsx --watch reloads TS; NO YAML changed ⇒ NO restart
  needed for the coder's legs). The orchestrator owns any stack restart before the :5193 gate; the
  coder never restarts the lane stack and never claims live behavior from a watch-reloaded dev
  server without stating the reload assumption.
- Browser gate (done-gate, orchestrator): :5193, F2 verbatim — accept a draft, Edit shorthand, Save
  & Re-compile with no edits ⇒ identical ghosts; one edited value ⇒ exactly that change; then the
  paste-#8 text ghosts the same wells as the preselected shape; a deck-plate-stripped negative leg
  (or synthetic zero-event response) shows the visible reason, never an empty deck. SH-QA-4's
  tooltip spot-check may fold into this run (same deck surface, per the wave note).

## Worker contract
- Worktree: `/mnt/vast/home/brad/git/cl-integration-2/wt/SH-QB-1-lane2-l2t1415` created by the
  orchestrator at the dispatch tip (trunk moves — RE-ANCHOR every file:line above against the
  branch point; the two drift findings 2/3 prove cites rot in ONE merge cycle).
- Branch: `cl/SH-QB-1-lane2-l2t1415` off cl/integration-2. Fleet coder lock acquired before coding
  (cap: at most one coder on the SH-QA hot cluster; this item may run beside them ONLY while its
  diff stays outside those files).
- Report: `<worktree>/.hermes/plans/reports/SH-QB-1-report.l2t1415.md`; end marker `SH-QB-1 DONE <sha>`.
- Commits: RED test commits first (`test(shqb1): …`), then `fix(api): …` / `fix(app): …`; never
  `git add -A`; `git -c core.fileMode=false` on every git call.
- exactOptionalPropertyTypes ON: `deckLabwares?` body key via conditional spread; `clarifications?`
  response via conditional spread; client second param omitted ⇒ key absent, never undefined.
- Handoff must state, verbatim, whether OQ1 was ruled before coding (it gates the body-field work)
  and the outcome of the T6 shape pin (green ⇒ F5 closed by pin; red ⇒ divergence evidence + hand
  back, no normalizer edit).

## Reviewer bait (B1-B7 — try to break these)
- B1 NO SILENT EMPTY SUCCESS: no code path may render an empty preview from a zero-event recompile.
  Attack vectors to reject: dropping the `if (events.length === 0)` guard "because the server now
  forwards clarifications" (server forwarding ≠ client visibility — T8 proves the VISIBLE reason);
  showing fine-print warnings-only for 'gap'-with-zero-events; swallowing a dropped-clarification
  case as `'compile gap'` default text when a structured reason exists. The empty-compile fails
  LOUDLY with the named reason via the verbatim error arm, and the prior proposal stays.
- B2 NO PER-RECORD HARDCODES, NO RE-IMPLEMENTED DECK LOGIC: zero literals like `plate1`, `plate_96`,
  `Trypsin`, `HepG2`, `Clofibrate` in any src/ file (tests only); deck matching is the IMPORTED
  `composeLabwareHintLookupWithDeck`/`bindShorthandEventsToDeck` from shorthandChat — a hand-rolled
  name-match in the handler is a DEFECT (divergent second grammar of the exact-one the deck-fold
  ruling forbids).
- B3 SH-QA-1 IS LIVE ON shorthandChat.ts: the diff must not touch it (import-only). If the helpers'
  exported shapes genuinely can't serve the handler, that is a hand-back, not an edit and not a copy
  (a copy-paste fork of the matcher is the same defect wearing a different hat).
- B4 WIRE ADDITIVITY, 422 CONVENTION INTACT: `/intent/compile` response keeps its existing keys;
  `clarifications` rides ONLY additively (non-empty-only conditional spread); the FROM-PROMPT route's
  422 NEEDS_CLARIFICATION body-shape is untouched (its SPINE-5 contract comment :22-36 stays
  true); no SSE/transport union change (that's the app-transport item's debt, not this one); no new
  outcome value, no new reason code, `ScientistIntentUnresolvedFact` verbatim. A wire-shape redesign
  conviction ⇒ stop and hand back (task stop_boundary).
- B5 DEEP-EQUAL IS THE CONTRACT: T2 compares the CHAT path's bound proposals, not a weaker
  event-type-only or length check; `details.labwareId` binding included (the chat path binds at
  shorthandChat.ts:570 — a round-trip that "passes" because the test ignored labwareId is exactly
  the SH-QC-1 silent-skip class waiting to re-open).
- B6 labwareAdditions HONESTY: today's recompile hardcodes `labwareAdditions: []` (:638/:650) while
  the chat path forwards real additions. Do NOT silently widen scope to fix every legacy recompile
  gap; pin what the round-trip test proves and disclose the residual in the report (fold into B's
  loud rule only where a zero-event/ghost mismatch demands it). Disclosed residual ≠ silent drop.
- B7 MANIFEST / ONTOLOGY: MANIFEST hash `fbf743ab1384778de43eeb113da0f0857eef9fce` unmoved; no
  golden bless; no new ontology/level terms, no new reason strings beyond reusing existing fact
  values verbatim; no vocabulary/cue/config YAML edited (none is needed — if one "seems needed",
  that is the stop_boundary reflex, hand back).
- exactOptionalPropertyTypes sites: `IntentCompileBody.deckLabwares`, response
  `clarifications?`, client method param + conditional body spread, `sourceSkips`-style existing
  spreads untouched. `: undefined` fails tsc — conditional spreads only.
- YAML-reload trap: if any leg of a "live" claim touches config/schema-loaded behavior, the report
  must state the restart fact; the default design changes NO YAML, so a bare "verified on :5193"
  without a restart note is a bait catch, not evidence.

## Open questions (orchestrator rules — each gates a coding branch)
- OQ1 (task stop_boundary pre-nod, REQUEST CONTRACT): threading deck context requires the ONE
  additive optional body field `deckLabwares?: {labwareId; labwareType?; name?}[]` on
  POST /intent/compile (exact mirror of the chat request's `context.labwares` element shape —
  findings 7). Recommended default: APPROVE as specified — it is additive, absent⇒byte-identical
  (T3), reuses the frozen DeckLabwareSummary shape, and the task itself names this as the
  architect-nod case; the round-trip AC is otherwise mechanically unsatisfiable (the handler cannot
  conjure editor state). Rejected alternative the coder must not pick without a ruling: server-side
  conversation-key deck recall (hidden state, stale-deck hazard) or a new endpoint (wire redesign).
- OQ2 (loud-failure surface): default = reuse the EXISTING verbatim error arm (prior proposal stays,
  error bubble names the reason — §B). Alternative: surface held-clarification CARDS on the
  recompile path via the needs-clarification card pipeline — richer, but card/preview lifecycle
  plumbings collide with SH-QA-2 (cards) and SH-QC-1 (preview lifecycle); recommend the error arm
  NOW, cards only by explicit ruling. Checked: `handleShorthandRecompile`'s catch arm already shows
  `shorthandApply.error` (AiTabPanel.tsx:663-668, :1345) — zero new surface.
- OQ3 (shape-fork normalizer question): default = §C pin-only (no normalizer touch, concurrent-safe);
  if T6 is RED, the fix likely lives in normalizeScientistIntent.ts (hot cluster) ⇒ this item
  SERIALIZES behind SH-QA-1 for that leg and the coder hands back the divergence evidence instead
  of editing. Alternative: pre-serialize SH-QB-1 now — wastes the file-disjoint 80 % of the work.
  Checked: both shapes already converge at the candidate-event merge (:644-665 params-wins + COMP-4
  many-arg ride) and the blob-bar honors both (:731-742) — convergence is plausible, unproven;
  that is exactly why it is a pin, not an assumption.

## Assumptions the coder may NOT make
- May NOT assume the recompile hits IntentCompileFromPromptHandlers.ts — it does NOT (findings 2;
  the task's :23-26/:198 cites are on the wrong route for THIS flow; the twin code there is
  reference, not target).
- May NOT assume the server's 200 means success or that the client may ignore `outcome` — the
  handler currently 200s 'needs-clarification' and 'error'-shaped results alike (findings 4).
- May NOT assume the deck plate exists in the store anywhere on the F2 path (that is the bug), nor
  that adding a store record is the fix (deck plates are editor state — D2-locked campaign
  decision territory; resolution context, not new records).
- May NOT assume shorthandChat.ts helpers can be edited/copied because the fix wants them (SH-QA-1
  live; import-only).
- May NOT assume the server tsc baseline is 0 (it is 1 at b398db03, cited line; not zero, not the
  coder's) nor the app baseline is 0 (23; set-diff).
- May NOT assume MANIFEST needs a bless (it must not move — B7), nor that goldens tolerate a
  response change (T3's byte-identity is what keeps them green — keep it true).
- May NOT assume the two shorthand shapes fork (OQ3) or converge — the test decides.
- May NOT assume the sidebar/preview lifecycle or card UX is fixable here (SH-QA-2/SH-QC-1 own
  those files; region bounds in §Contract header).
- May NOT restart the lane stack or claim live/YAML behavior without the restart note; the
  orchestrator owns the :5193 gate.

SPEC-DRAFT-SHQB1 DONE
