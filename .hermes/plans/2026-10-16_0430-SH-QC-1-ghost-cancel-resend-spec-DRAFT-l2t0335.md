# SH-QC-1 — Ghosting must survive a cancel/resend cycle (SPEC DRAFT, l2t0335)

Status: DRAFT for orchestrator review. Not canonical until promoted. No product code touched by the composer.
Item: SH-QC-1 (campaign: shorthand hardening, lane 2), task-list.md:7964-8021.
Compose-time trunk: 95f73755 (docs tip; code tip 27ef008f). SH-QA-3 (server drafting YAML) and
SH-QA-4 (tooltip volume projection) are IN FLIGHT on other branches and WILL MERGE before this
worker starts. EVERY line number below is trunk reality at compose time and is CAMT — CONFIRM
AGAINST MERGED TRUNK AT PROMOTION. The merged trunk wins over anything written here. All git calls
`git -c core.fileMode=false`.

## §0 Trunk reality (every file:line OPENED by the composer this session at 95f73755/27ef008f)

Line numbers DRIFTED from the 532ec676-era task-block map. Old cite -> re-derived cite (verified):

- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
  - Cancel leg (old :1059-1061) -> NOW `handleCancelDraft` :1104-1112: nulls protocolProposalRef,
    setProtocolApply(null), `sidebarDispatch({ type: 'cancel' })` :1109, clears
    resolvedClarificationsRef :1110, `editor?.actions.clearPreview()` :1111. Confirmed:
    cancel-time clearing fires on ALL THREE affordances — QuestionsPanel onCancel :1369,
    ChangesPanel onDiscard :1423 (the 'Discard' button, ChangesPanel.tsx:128 `onClick={onDiscard}`,
    label 'Discard' at :130), and the updating-strand escape :1491.
  - Draft->preview leg: `onDraftResult` :389; guards `result.error` :423-428, workstateTurn :437,
    ledgerTurn :449; draft-ready dispatch :529-541 (sidebar shows shorthand — this is what the
    operator SAW on cycle 2); THEN `if (!editor) return` :543, `buildPreviewFromDraft` :556-568,
    `hasPreview` gate :569-571 (`previewPlacements.length > 0 || previewEvents.length > 0` —
    96 events alone passes), `previousPreview`/revision trail :575-585, `actions.setPreview`
    :586-607. Deps of onDraftResult :609: `[activeDeckScope, editor, protocolSel...]`.
  - Send-time context :224-325: `acceptedGraphProjection` from `editorState.labwares`
    (COMMITTED labwares only — a preview's proposed labware are never in context),
    `activeDeckScope` :~195-218, `draftRevision.currentPreviewDraft` only when a preview is
    mounted :306-313 (after Cancel preview==null, so cycle 2's context == cycle 1's context).
- `app/src/event-editor/right-pane/ai/sidebarState.ts`: `initialSidebarState` :180, `'cancel'`
  action :177, `case 'cancel': case 'reset': return initialSidebarState` :254-256.
- `app/src/event-editor/EventEditorContext.tsx`:
  - `set_preview` :835-854 — normalizePreviewPlacementLocations :836 (+helper :529-564),
    `assignVisibleLabwareHandles` :839 (renames colliding/generic ghost NAMES against committed
    labwares), droppedFocus :844-848 (a new preview whose placements lack the currently-focused
    previous-preview placement EJECTS focus + selection), preview replace :851.
  - `clear_preview` :857-869 — `preview: null`; drops focus only when it was on a preview
    placement. `clearPreview` action :1150, wiring :1418-1419.
  - `commit_preview` :870-885 folds previewLabwares into state.labwares (not involved in cancel).
- `app/src/event-editor/right-pane/ai/useChatThread.ts`: send :164-; `done` frame handler
  :219-238 — `onDraftResult` called inside a `try { } catch { }` SILENT SWALLOW :221-225. An
  exception thrown inside onDraftResult AFTER the draft-ready dispatch would produce EXACTLY the
  symptom (proposal visible, preview never mounted, no visible error). §2 capture must include the
  browser console.
- Ghost render chain (consumers of `state.preview`):
  - `app/src/event-editor/lib/previewProjection.ts`: `buildPreviewWellIndex` :28-60 buckets
    `previewEvents` by `collectEventLabwareIds` :120-134 — reads ONLY
    `details.labwareId / source_labwareId / dest_labwareId / source.labwareId / target.labwareId`.
    No details id => no bucket => no purple wells, empty tooltip (previewWellsForLabware :71-76).
  - `app/src/event-editor/deck/DeckSlot.tsx`: committed-tile affected flag :47-49
    (`previewIndex.byLabware.has(placement.labwareId)`); ghost tile branch :174-182 REQUIRES
    `previewPlacement && previewLabware`; `data-preview` :153.
  - `app/src/event-editor/deck/LawnSurface.tsx`: preview lawn placements :70-77, committed-tile
    affected :269, ghost tile requires `state.preview?.previewLabwares[placement.labwareId] ??
    state.labwares[...]` :340 (null labware => tile silently skipped :342).
  - `app/src/event-editor/deck/LabwareTile.tsx`: `data-ghost` :74, `data-affected` :75.
  - `app/src/event-editor/focus/LabwareFocus.tsx`: labwareStates from
    `eventsWithPreviewState/labwareMapWithPreviewState` :164-170; previewWells :172-177 (ghost
    purple gates on previewIndex). `app/src/event-editor/focus/WellGrid.tsx`: `data-preview` :270.
- `app/src/graph/lib/eventGraph.ts` (`computeLabwareStates` :745+): details read at :765
  (`const labwareId = details.labwareId`). The task block's ":765 skip" is DRIFT: the actual
  `if (!labwareId) continue` is at **:852** (transfer/move arms have their own continues
  :752/:823/:849 and fall back to source/dest ids :771-772/:830-831). Tooltip well-states ALSO
  die silently there — but note the ghost-purple overlay path (previewProjection) is a SEPARATE
  consumer with the same `details.labwareId` dependency, so "no purple AND empty tooltip" is
  consistent with either.
- Server side (ORIENTATION ONLY — this item is app-side; server edits are NOT in scope):
  - `server/src/ai/systemPrompt.ts` `deriveContextCacheKey` :642-655 — conversation key
    `event-editor:<runId|eventGraphId|'default'>[:scope]`; still conversation-keyed, :642 exact.
  - `server/src/ai/AgentOrchestrator.ts`: conversationKey :1209; deck-hint threading
    `composeLabwareHintLookupWithDeck(context.labwares)` :1219-1223; held-intent arms:
    `takeHeldShorthandIntent` ONLY on the clarificationAnswers path :1253 and the re-extract
    fallback :1703; `holdShorthandIntent` on needs-clarification :1292/:1323/:2424. A repeat
    prompt WITHOUT answers takes the fresh-extraction path (:2407 compile, :2426 result) —
    confirms the architect's held-intent = real-but-inert ruling for this symptom.
  - `server/src/ai/shorthandChat.ts`: `heldIntents` Map :324, hold :326, `takeHeldShorthandIntent`
    (destructive get+delete) :335-340 — NO clear-on-cancel endpoint exists (grep-verified); UI
    Cancel clears nothing server-side. `composeLabwareHintLookupWithDeck` :113-124 (deck-first,
    EXACT-NAME only). `bindShorthandEventsToDeck` :139+ — rewrites event labware refs to committed
    deck ids on unambiguous name match; KNOWN-IDS come from the request's `context.labwares`
    (committed editor state, never preview ghosts). `shorthandResultFromCompile` :623+ —
    needs-clarification => `events: []`; success carries `labwareAdditions` conditionally.
- `app/e2e/deck-ghost-shorthand.spec.ts` (330 ln, the pattern to mirror): stubs
  `POST /ai/assist/stream` via `page.addInitScript` fetch-interceptor (:182-203,
  `stubAssistStream`) returning ONE canned SSE `done` frame — every call gets the SAME result;
  seeds the shared deck fixture `EVG-SPK-VERIFY` via record PUT (:205-262); drives
  `/deck/EVG-SPK-VERIFY` -> variant `manual_freeform` -> `[data-testid="right-pane-tab-ai"]` ->
  `[data-testid="chat-input"] .chat-input__editor` -> `[data-testid="chat-input-send"]` (:264-282);
  asserts `.tile[data-ghost]`, committed `data-affected="true"`, `[data-well-id="A1"][data-preview="true"]`
  x96, `.well-tooltip` contains /50/ (:284-330). `test.describe.configure({ mode: 'serial' })` :57.
  - BINDING CONSTRAINT: `server/src/ai/shorthandChat.e2eStubHonesty.test.ts` extracts the spec's
    OWN `fixedShorthandResult` / `blobClarificationResult` builders (:98-189 region) and
    deep-compares them against the real in-process compile output. The worker must NOT mutate
    those two builders; any NEW stub builder must be derived from a real compile probe
    (the honesty test shows the recipe) or the honesty suite goes red.
- `app/src/event-editor/lib/shorthandPreviewGhosting.test.ts` — the shipped-payload characterization
  unit test: pins that events WITHOUT details.labwareId/wells bucket under no labware = no ghost
  (PASSES today; that IS the failure mode, per its header :1-18).
- Baselines MEASURED this session: app `npx tsc --noEmit | grep -c "error TS"` -> **23**;
  server -> **1**. Re-measure at the branch point (SH-QA-3/4 merges will move the file contents).

## §1 Goal (one sentence)

Find what Cancel leaves un-armed so the second identical proposal renders its sidebar card but
never re-mounts the deck preview, fix it in the preview/ghost lifecycle (or its send-context),
prove with a red-first stubbed e2e cancel/resend leg that cycle 2 ghosts 96 wells with a populated
tooltip AND the cancelled cycle leaves zero ghosts behind.

## §2 Declarative surfaces first — the MANDATED diagnostic capture (before touching any code)

The task block mandates: capture the SECOND cycle's payload BEFORE code changes. Do BOTH captures
(stubbed probe AND, via the orchestrator's stack, the live F4 recipe if reachable):

1. Capture BOTH cycles' wire payloads, not just the second. On the /deck surface with the seeded
   plate (mirroring `resetDeckWithPlate`), run cycle 1 -> Cancel -> cycle 2 with the REAL server
   (via the app, console network capture or a scripted Playwright `page.on('response')`/fetch
   tee of the two `done` frames), and diff them. Record per cycle: `events.length`,
   `events[i].details.labwareId` present? equal to a committed deck id? `details.wells` array
   present (NOT singular `well`)? `labwareAdditions` carried? Which ids do they mint?
2. Capture the browser console during cycle 2: `useChatThread.ts:221-225` SILENTLY swallows any
   exception thrown inside `onDraftResult` after the draft-ready dispatch — an error line there is
   decisive evidence of a client throw (e.g. inside buildPreviewFromDraft), and its ABSENT error
   with events on the wire points at payload/bucketing.
3. Capture cycle 2's post-setPreview editor state (React devtools or a temporary
   `console.log(state.preview.previewEvents.length, state.preview.previewPlacements.length)` in a
   throwaway run): distinguishes "preview never mounted" from "preview mounted but unbucketable".

Outcome -> branch table:

| Observation | Diagnosis | Go to |
|---|---|---|
| P1: cycle-2 `done` result events[] EMPTY or `success:false`/error text | server never re-drafted (held-intent/cache fold, drafting regression) | STOP — payload defect; exact payload to architect (stop_boundary discipline) |
| P2: cycle-2 events present (96) but NO `details.labwareId`/`details.wells` while cycle 1 HAD them (bindShorthandEventsToDeck bound 1, missed 2) | server-side binding divergence keyed on request context -> FIRST diff the two REQUEST bodies (`context.labwares`, `activeDeckScope`, focus fields). If the request bodies differ because the CLIENT sent stale/emptied context after Cancel -> client fix, branch C. If requests are byte-equivalent and the server bound differently -> server defect: STOP, hand both bodies to the architect. | §3 branch C / stop_boundary |
| P3: cycle-2 payload == cycle 1's (bound ids, wells arrays), console shows a THROWN error from onDraftResult | client throw between draft-ready dispatch (:529) and setPreview (:586) — e.g. buildPreviewFromDraft input stale | §3 branch B |
| P4: cycle-2 payload == cycle 1's, no throw, but state.preview null after the turn | setPreview leg never executed / hasPreview gate / stale captured state in the callback | §3 branch B |
| P5: state.preview mounted WITH events+placements yet deck shows nothing | ghost RENDER chain: previewLabwares lookup miss (LawnSurface :340, DeckSlot :42-44), droppedFocus (:844-848) after having drilled into a cycle-1 ghost, or `assignVisibleLabwareHandles` :839 renaming collision churn | §3 branch D |
| P6: stubbed two-cycle e2e with an IDENTICAL bound payload GHOSTS FINE on cycle 2 | the defect is NOT in the client lifecycle at all -> P2 server-side line (STOP for architect) | §3 branch A |

The stubbed discriminator (P6) is the FIRST targeted check (§5) because it splits the fault
surface with one test run, no live model.

## §3 Owned files + edits per diagnosis branch

Owned IN SCOPE (task-block `files:` line, re-derived paths):
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (run-chat cancel leg + draft->setPreview leg;
  the send-time `context` memo :224-325 if branch C)
- `app/src/event-editor/EventEditorContext.tsx` and its ghost/preview consumers:
  `app/src/event-editor/lib/previewProjection.ts`, `deck/DeckSlot.tsx`, `deck/LawnSurface.tsx`,
  `focus/LabwareFocus.tsx`, `right-pane/ai/draftPreview.ts` (consumer edits ONLY where the
  diagnosis lands there — minimal diff)
- `app/e2e/deck-ghost-shorthand.spec.ts` (RED e2e extension; new stub builder allowed, existing
  two builders byte-untouched)
- Unit tests: `app/src/event-editor/EventEditorContext.test.ts` (extend — the "preview context
  lifecycle" test), plus the targeted test file branch D's fix needs.

EXPLICITLY OUT (HARD):
- ALL `server/**` — including eventGraph app-projection questions routed to architect; NO compiler
  edits, NO clarification-card edits (task block verbatim). The server held-intent leak (§9 F-3) is
  documented here but NOT fixed here.
- `app/src/graph/lib/eventGraph.ts` — CONDITIONAL ownership ONLY (OQ2): the :852 skip is the
  tooltip-state twin of the projection gap, but SH-QA-4 OWNS this file in the wave and will merge
  first. If diagnosis lands there, STOP and flag the orchestrator before editing (do not dual-edit).
- `app/src/event-editor/focus/WellTooltip.tsx` + `app/src/graph/labware/WellTooltip.tsx` +
  `graph/wellcontext/WellContextPanelV2.tsx` + `graph/context-panel/ContextPanel.tsx` — SH-QA-4's
  surface. The tooltip assertion in tests stays content-agnostic (/50/ or /100/, per payload).
- `config/drafting/shorthand-drafting.yaml`, `server/src/compiler/**`, `server/src/ai/shorthandChat.ts`,
  resolution/normalizeScientistIntent cluster — SH-QA-3's cluster.
- schema/**, goldens/**, MANIFEST, task list, other lanes' specs.

Branch edits (each minimal, each justified by a §2 outcome recorded in the report):
- Branch B (throw/stale in onDraftResult): repair the specific input the throw names (typically a
  stale captured value or an unnormalized addition payload); add a guard that routes a caught
  promotion failure to a VISIBLE surface (dead-silent-swallow is itself the discoverability
  defect — but keep it inside the existing error leg pattern, no new channel).
- Branch C (client send-context divergence after Cancel): fix what Cancel leaves stale in the
  `context` memo (deps or projection source), pinned by a unit test on context construction across
  the cancel transition.
- Branch D (render chain): smallest lifecycle-correct repair in the consumer named by the evidence
  (e.g. droppedFocus condition, or previewLabwares keying) + unit test replaying the exact
  set_preview -> clear_preview -> set_preview sequence.
- Branch A/P1/P2-server: STOP. Report the exact payloads (both cycles) and stop; do not patch
  around a payload defect client-side (task-block stop_boundary).

HARD REQUIREMENT on every branch: Cancel must keep clearing — assert post-Cancel
`[data-ghost="true"]==0`, `[data-preview="true"]==0`, committed tiles `data-affected="false"` in
the SAME e2e leg that proves cycle 2 ghosts.

## §4 Routes / flows

- Surface: `/deck/EVG-SPK-VERIFY` (stubbed e2e, mirrors the existing legs; freeform bench) and the
  run page `:5193/runs` (browser-gate leg, real model). AiTabPanel mounts on both (run page: deck
  as children — PROTO-AI-9 history at task-list.md:369-375 records the surface quirk; if the gate
  shows the run page does not mount the same editor provider, record that as a finding, do not
  redesign it).
- Flow: prompt -> SSE `/api/ai/assist/stream` `done` frame -> `useChatThread` done handler ->
  `onDraftResult` -> sidebar `draft-ready` + `buildPreviewFromDraft` -> `set_preview` ->
  LabwareTile ghosts / committed-tile affected -> LabwareFocus wells (`data-preview`) -> tooltip.
  Cancel: `handleCancelDraft` (Discard/Cancel affordances) -> sidebar reset + `clear_preview`.
  Reprompt: identical text, fresh extraction server-side (:2407 fresh path confirmed §0).
- No YAML involved (no stack restart needed unless the orchestrator says otherwise); if the worker
  DOES touch any YAML (it must not), flag for restart (tsx --watch does not reload YAML).

## §5 Acceptance-clause -> proof map (criteria verbatim in §10)

| Verbatim clause | Proof |
|---|---|
| "extend app/e2e/deck-ghost-shorthand.spec.ts (pattern exists) with the prompt-cancel-reprompt sequence asserting ghost wells > 0 and a populated tooltip" | §6 T-A e2e leg (stubbed, deterministic): ghost wells `[data-preview="true"]` count 96 > 0 on cycle 2; `.well-tooltip` visible + volume string |
| "unit test on the preview context lifecycle" | §6 T-B EventEditorContext.test.ts extension: set_preview -> clear_preview -> set_preview(replacements, same events) reducer sequence + previewProjection bucketing across the cycle; droppedFocus cases pinned |
| "Browser gate on :5193: the F4 recipe verbatim — ghosts appear on the second cycle, cancelled proposal left nothing behind" | §6 T-C reviewer flow script; receipts dir with screenshots at (a) cycle-1 ghosts, (b) post-Cancel empty deck, (c) cycle-2 ghosts, (d) populated tooltip |
| "Hard requirement: no leaked ghosts from the CANCELLED proposal (cancel must still clear)" | asserted mid-leg in T-A (post-Cancel zero `[data-ghost="true"]`, `[data-preview="true"]`, `data-affected="true"`) AND at the live gate (shot b) |
| stop_boundary (verbatim §10) | §2 P1/P2-server + §3 branch A: exact payloads hand off, no client workaround |

## §6 RED-first test plan

FIRST TARGETED CHECK (early proof, run BEFORE the fix and before the full suite): the new e2e
leg T-A written RED against an intentional two-stub sequence with an IDENTICAL
`fixedShorthandResult()`-class bound payload (do not mutate the two pinned builders — call them
or a new probe-derived builder). If it goes GREEN immediately (cycle 2 ghosts under stubs), the
client lifecycle is exonerated: STOP and file the §2-P2 wire diff (this is outcome P6, a valid,
reportable RED outcome for the ORIGINAL recipe).

- T-A `app/e2e/deck-ghost-shorthand.spec.ts` extension (serial, same fixture):
  1. New `stubAssistStreamSequence(page, [r1, r2])` — fetch interceptor POPS a queue (existing
     stub returns one static result for every call; the cancel/resend leg needs two responses;
     both = the honest bound plain-material payload, cycle-shaped).
  2. `resetDeckWithPlate` -> open `/deck/EVG-SPK-VERIFY` freeform -> prompt GHOST_PROMPT ->
     assert cycle-1 ghosts (mirror :309-316).
  3. Click Discard in `[data-testid="changes-panel"]` (button text 'Discard'; NO data-testid
     today at ChangesPanel.tsx:128 — adding one there is in-scope cancel-leg chrome; name it
     `changes-discard`). Assert ghost wells 0 AND committed tile `data-affected="false"` AND
     `.tile[data-ghost="true"]` count 0 (the hard requirement).
  4. Re-prompt the IDENTICAL text -> expect committed tile `data-affected="true"` (>0), drill in,
     96 `[data-preview="true"]` (>0), `.well-tooltip` visible containing the volume string
     (content-agnostic regex — do NOT pin per-row volume formats, SH-QA-4 owns tooltip CONTENT).
     RED today iff the defect is client-side (P3/P4/P5); see first-check note.
- T-B `app/src/event-editor/EventEditorContext.test.ts` (extend): reducer-level lifecycle —
  dispatch set_preview(A) / clear_preview / set_preview(B) with different placement ids:
  (i) preview B fully replaces A (no A placements survive); (ii) focus that sat on an A ghost is
  dropped (:844-848 condition pinned BOTH ways — focus survives when B keeps the id, nulls when
  it does not); (iii) after clear, `state.preview === null` and focus cleared when it was on A;
  (iv) cycle replay: after clear_preview, set_preview with events carrying
  `details.labwareId = <committed id>` + `details.wells` -> `buildPreviewWellIndex` buckets 96
  wells (ties the unit layer to the ghost gate).
- T-C Browser gate (:5193, cl-browser-reviewer, VERDICT: accept), F4 recipe:
  1. Run page of the lane fixture run (deck with a plate). Send verbatim:
     `Add 50uL of 50% Thermo trypsin-EDTA / 50% DMEM with 10% FBS containing 200 HepG2 cells per uL to each well.`
     (wave SHARED REPRO ENV, task-list.md:7555-7557 — the paste-#7 density/count is model output,
     not prompt text; accept whatever clarification the live model asks).
  2. Wait for the proposal (shorthand card / Discard affordance visible) -> screenshot ghosts.
  3. Click Discard/Cancel -> screenshot the DECK: zero ghost tiles, zero purple wells, tile
     not affected — "cancelled proposal left nothing behind".
  4. Re-send the IDENTICAL prompt, answer clarifications minimally if asked -> ghosts appear on
     the second cycle: screenshot (a) the proposal card, (b) purple wells > 0, (c) hover a ghosted
     well -> populated tooltip screenshot.
  PASS = (b)+(c)+(3). Fold-in courtesy (SH-QA-4 wave note): the tooltip screenshot doubles as
  SH-QA-4's folded spot-check — mention its verdict in the report, judge nothing.
  HYGIENE (lane clauses): receipts in-dir only, md5s for every screenshot, no-history rule,
  screenshots for every negative claim.
- Verification commands (worker, in its lane-2 worktree checkout of the trunk tip it branched;
  NEVER run the lane stack yourself — the stack :3093/:5193 is the orchestrator's, the gate uses it):
  - `cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run src/event-editor/EventEditorContext.test.ts` -> T-B green after fix; measure the fail-file set at the branch point first and keep the comm empty.
  - `cd /mnt/vast/home/brad/git/cl-integration-2/app && PLAYWRIGHT_BASE_URL=http://localhost:5193 npx playwright test e2e/deck-ghost-shorthand.spec.ts --project=chromium` -> ALL legs green (existing CANONICAL + GHOST + new cycle leg) against the lane stack the orchestrator provides.
  - `cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/ai/shorthandChat.e2eStubHonesty.test.ts` -> green (builders unmutated, new builder probe-derived or none added).
  - tsc: app `npx tsc --noEmit` -> compose-time 23 / server 1; RE-MEASURE at branch point and
    report sorted-diff vs branch point: ZERO new lines allowed (state your measured numbers).

## §7 Worker contract

- Worktree `wt/SH-QC-1-lane2-l2t<tick>` + branch `cl/SH-QC-1-lane2-l2t<tick>` off the CURRENT
  trunk tip AT CODER START (SH-QA-3 + SH-QA-4 will be merged — re-pin EVERY §0 cite at the branch
  point; §0 numbers are CAMT). `git -c core.fileMode=false` always.
- Deliverable: report at the UNIQUE path `.hermes/plans/reports/SH-QC-1-report.<runid>.md`
  (runid = l2t<tick> + timestamp); commits `test(SH-QC-1): RED ...` then `feat(SH-QC-1): GREEN ...`.
- LEAN CONTEXT (SH-QA-3 death-mode guard): orient with targeted reads (this spec's §0 IS the
  orientation); no repo-wide greps beyond the owned files; one file at a time; if a §2 capture
  needs the live stack, ask via report checkpoints, do not spin.
- INCREMENTAL REPORT: append findings to the report BEFORE each phase (after §2 capture -> after
  RED -> after GREEN -> after gate handoff) so a mid-flight death preserves state.
- Stop conditions: §2 P1/P2-server (payload defect -> architect, verbatim payloads in report);
  any need to edit server/**, eventGraph.ts (OQ2), WellTooltip surfaces (SH-QA-4), or the SH-QA-3
  YAML cluster -> stop and flag.
- Stack: backend :3093 frontend :5193 are the ORCHESTRATOR's — never restart/kill/replace;
  e2e points at :5193 via PLAYWRIGHT_BASE_URL (config default 5174 belongs to lane-1 — NEVER).
- UI standard: AI lives in the AI panel; dead chrome is a defect; all records are TEST DATA.

## §8 Reviewer bait (pre-empt these)

- B1 exactOptionalPropertyTypes: any new conditional in the setPreview spread / stub builders must
  use conditional spread, never `key: undefined`.
- B2 YAML-reload trap: this item touches NO YAML; if a diff shows one, that's a scope defect.
- B3 Stub-honesty: `shorthandChat.e2eStubHonesty.test.ts` extracts the spec's builders and
  deep-compares to a real compile. Mutating `fixedShorthandResult`/`blobClarificationResult`
  breaks it; a NEW invented builder is equally wrong — probe the real compile first.
- B4 Ontology terms: none required for this fix; a diff adding ontology binding is scope creep.
- B5 Hardcode boundary: NO labware-name/id literals beyond the spec's existing fixture
  ('ghost plate'/'LBW-96-1'); the fix belongs in lifecycle/predicate code, not in name-matching.
- B6 The silent catch: do NOT widen useChatThread's catch or re-throw into the chat reducer; a
  visible-failure path (if branch B) rides the EXISTING error leg pattern.
- B7 Leaked-ghost regression: the cancel-clears assertions in T-A are mandatory, not optional —
  a fix that "makes cycle 2 ghost" by suppressing clear_preview is a hard reject (hard requirement).
- B8 Focus-eject semantics: droppedFocus (:844-848) exists for a reason (stale orphan ghost); a
  blanket "never drop focus" change is wrong — pin both directions (T-B ii).
- B9 Tooltip-content drift: SH-QA-4 may have reshaped tooltip rows at merge; assert
  "populated + volume string" loosely; a test pinning per-row layout belongs to their suite.
- B10 Paste #7 said "no labware field" for cycle 2 while cycle 1 ghosted — do NOT assume paste #7
  characterizes EVERY repro; §2 captures BOTH cycles. A reviewer should reject any fix built on
  the single pasted payload alone.

## §9 Declared findings (composer-verified this session)

- F-1 Line drift table applied throughout §0 (task-block map 532ec676-era -> 27ef008f): cancel leg
  1059-1061->1104-1112; sidebarState 242-244->254-256; droppedFocus 845-851->844-848; the
  eventGraph "skip at :765" is actually the details READ at :765 — the `if (!labwareId) continue`
  skip sits at :852; LabwareFocus 173-176->164-177 (labwareStates) + 172-177 (previewWells);
  held-intent 1213+ -> 1253/1292/1323/1703/2424. deriveContextCacheKey :642 is unchanged.
- F-2 The ghost-purple path (previewProjection -> LabwareFocus/DeckSlot/LawnSurface) and the
  tooltip well-state path (graph/lib/eventGraph computeLabwareStates) are TWO independent
  consumers of `details.labwareId` — "no purple AND empty tooltip" localizes to a missing/invalid
  `details.labwareId` on the wire or to a never-mounted preview, NOT to a projection bug (state
  layer exoneration stands).
- F-3 Server held-intent leak CONFIRMED as described: `heldIntents` (shorthandChat.ts:324) is
  cleared only by a destructive take on the clarification-answers path (:1253/:1703); UI Cancel
  clears nothing server-side. Fresh prompts take the fresh-extraction path, so this is inert for
  THIS symptom but is a real stale-fold leak for a later answer. NOT fixed here (server out of
  scope) — recommend a separate task line (OQ1).
- F-4 `useChatThread.ts:221-225` swallows onDraftResult exceptions silently — any client-side
  branch must not rely on console-free reproduction being innocent; §2 mandates a console capture.
- F-5 The existing stub helper returns the SAME payload to every stream call, so the current file
  structurally CANNOT express a two-cycle test — the sequence stub is new, load-bearing
  test infrastructure for this item.
- F-6 The 'Discard' affordance the F4 recipe clicks has no data-testid (ChangesPanel.tsx:128-130);
  adding one is inside the cancel leg's ownership.

## §10 Acceptance criteria (verbatim from task-list.md:8012-8021)

verified by: >-
  Red-first: extend app/e2e/deck-ghost-shorthand.spec.ts (pattern exists) with the
  prompt-cancel-reprompt sequence asserting ghost wells > 0 and a populated tooltip; unit
  test on the preview context lifecycle. Browser gate on :5193: the F4 recipe verbatim —
  ghosts appear on the second cycle, cancelled proposal left nothing behind.
files: run-chat cancel leg + ghost/preview wiring (EventEditorContext and its consumer),
  deck-ghost-shorthand.spec.ts. No compiler edits, no clarification-card edits.
stop_boundary: if the second proposal's payload is actually rejected by the deck consumer for
  a validation reason, stop and hand the exact rejection to the architect (that is a payload
  defect, not a wiring defect).
(Plus the description's hard requirement, verbatim: "no leaked ghosts from the CANCELLED proposal
(cancel must still clear).")

## §11 Open questions for the orchestrator

- OQ1 — Held-intent leak task line. Recommendation: file it as its OWN follow-up item
  (server-side clear-on-cancel or conversation-scoped invalidation), do not widen this item.
  Evidence: §9 F-3; take sites are answer-path only (AgentOrchestrator.ts:1253, :1703); no clear
  endpoint exists (grep of shorthandChat.ts/AIHandlers.ts).
- OQ2 — eventGraph.ts collision. Recommendation: treat `app/src/graph/lib/eventGraph.ts` as
  NOT-owned by SH-QC-1 unless §2 evidence lands the defect at :852; if it does, SH-QC-1 pauses and
  flags you to sequence against SH-QA-4's merged hunks (same file, different region: SH-QA-4 owns
  ~:309-:476 per its promoted spec; the skip is :852 in computeLabwareStates :745+). Evidence:
  SH-QA-4 promoted spec `.hermes/plans/2026-10-16_0300-SH-QA-4-tooltip-volume-spec.md` file list.
- OQ3 — Gate surface for the live leg. Recommendation: run T-C on the run page (F4 was observed
  there, tally.md:3 :5193 run surfaces) with the /deck stubbed leg carrying the deterministic
  proof; if the run page's AiTabPanel/editor mounting diverges from /deck (PROTO-AI-9 surface
  history, task-list.md:369-375), that is a finding, not a fix target. Evidence: §4 mounting note;
  the stub harness drives /deck because that's where the seeded fixture lives (:205-262).

SH-QC-1 DRAFT DONE 368
