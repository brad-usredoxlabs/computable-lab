# L2-SUITE-A — CANONICAL SPEC (orch-promoted from DRAFT l2t0210 at l2t1315)

## RATIFICATION AND RULINGS (read FIRST — these OVERRIDE anything in the draft below)

Promoted by the orchestrator at tick l2t1315 (2026-10-26 ~13:20 EDT). The draft's body is
adopted VERBATIM except where ruled here. Ruling sources (folded in, cited here so the
coder never needs to hunt):
- decisions/SUITE-A-oq-rulings-l2t0315.md (OQ1/OQ2/OQ3)
- decisions/SUITE-A-oq4-ruled-l2t1210.md (OQ4)

### OQ1 RULED — run/deck state
Layer (a) makes ZERO run writes: deck state rides request-injected context.labwares
(FREEFORM's AgentOrchestrator.ts:1298 seam). No seed script, no live-run reuse. The browser
leg (layer (b), ORCH-OWNED) creates a throwaway run via POST /runs/create-from-template
(routes.ts:384) and drives a thread under a unique endpoint key. Brad ruling in force: all
records are TEST DATA — the throwaway run needs no protection ceremony; the write-free
invariant on layer (a) stays.

### OQ2 RULED — sequence shape
ONE held session, prompts 1-8 in order (conversationKey = surface+context byte-stable,
AgentOrchestrator.ts:1288), FAIL-FAST with disclosure: a failed prompt downgrades dependents
to `blocked-by-P<n>` in the verdict table (never silent skip, never fake pass).
`--single N` mode with request-injected pre-seeded deck state is a DEBUG AID only — never an
acceptance form for P7 (its claim is the live cross-turn hold).

### OQ3 RULED — parity form + gate split
(1) Parity: option (ii) — a thin NODE CLI wrapping FREEFORM's TS `assertHonestOutcome`; the
python driver shells out to it; ONE implementation, no drift surface. The vitest parity pin
feeds BOTH the same five fixtures (FREEFORM acceptance #2 (a)-(e)) and asserts identical
verdicts.
(2) Gate split: the CODER gate = committed harness + node CLI + parity pin + scripted-client
vitest legs green, PLUS the first-targeted-check smoke (`--prompts 2 --single` against live
:3093; its verdict reflects TRUNK behavior, disclosed as such — pre-merge it is the expected
RED proof). The live ~8-turn `--all` drive against :3093 is ORCH-OWNED post-merge acceptance
replay (real model calls are orch-budget, ANSWER-FOLD precedent). Coder may spot-check single
prompts live but MUST NOT burn full-suite live turns.

### OQ4 RULED — wire shape measured at the merged tip (85951e83, post CHAT-1 701f80c0)
Measured first-hand by orch:
(a) config/drafting/shorthand-drafting.yaml:12 = `surfaces: [workspace.deck]` — UNCHANGED;
    CHAT-1 did NOT add a surface id.
(b) app/src/shared/api/aiClient.ts:234-236 still forks `event-editor` ->
    /ai/draft-events/stream; the merged universal deck pane (DeckSurfaceChat.tsx:42/:113)
    declares surface/endpoint 'event-editor' — THE MERGED UNIVERSAL DECK CHAT RIDES THE
    LEGACY /ai/draft-events/stream PATH.
RULING (standing default): the driver MIRRORS the merged client's ACTUAL wire shape —
capture the real request body the merged client sends on the event-editor surface (README
capture) and drive /ai/draft-events/stream with that shape; the README states which path is
exercised. A legacy-path gap on composition expansion or the computed well set (P3-P7) is an
ARCHITECT FINDING routed by orch — NOT a coder fix-run, NOT a weakened expectation.
NOTE: the draft's §2/§OQ1 references to driving POST /api/ai/assist/stream are SUPERSEDED by
this measurement: drive /ai/draft-events/stream (the path the deck surface actually rides).

### Dispatch-state delta (draft base vs canonical dispatch base)
Draft was composed at c8b387ec with all three predecessors live. At promotion: L2-TERM-1 DONE
(merged b5b25c99), L2-CHAT-1 merged (701f80c0; gatefix-1 for the deck surfaceContext crash in
flight), L2-FREEFORM-1 in final coding. Dispatch happens ONLY after FREEFORM-1 merges and the
stack restarts; branch off the CURRENT tip; re-verify every cited app/ line number at the
dispatch tip before relying on it (CHAT-1 + gatefix moved app/src/event-editor/deck/).

### Additional dispatch-time note (orch l2t1315)
The deck-chat server crash fixed by CHAT-1 gatefix (systemPrompt formatLabwares/
formatEventSummary/formatVocabPack degrade-to-(none) guards + DeckSurfaceChat surfaceContext
labwares/eventSummary/availableVerbs parity) lands BEFORE this item's branch point. The
harness's request-injected context SHOULD carry the full shape (labwares, eventSummary,
availableVerbs) exactly like the merged DeckSurfaceChat does — mirroring the product wire,
not the pre-fix gap.


---

# L2-SUITE-A — Prompt-suite acceptance, plate leg: prompts 1-8 of tmp/prompt_files.md through the universal chat

CAMPAIGN: universal-chat (Brad-approved 2026-10-26 "approved as is!"). Binding decisions
UC-D1 (universal chat is the product; AiTabPanel NOT restored and NOT the driven surface),
UC-D2 (the ten prompts are a standing browser-tested acceptance suite — Brad's verbatim:
"make sure as part of the lane 2 tasks that all of these prompts are browser tested"),
UC-D3 (plate/sequence split — this item owns prompts 1-8 only), UC-D4 (vocabulary integrity,
L2-TERM-1's tiers). Gate doctrine (task-list campaign header, verbatim): every prompt-suite
task ships BOTH a deterministic headless probe per prompt (write-free where possible;
byte-compare server legs) AND vision-reviewer receipts for visual claims (ghosts, badges,
cards). Any prompt landing success + zero mountable events + zero cards + no honest wall =
whole-suite FAIL (REVISE-GHOST-1 rule).

GOAL (one sentence): stand up a committed, re-runnable driver harness on the lane trunk that
drives Brad's prompts 1-8 VERBATIM through the universal chat against the lane-2 stack and
proves, per prompt, both server-leg honesty (headless probe) and the observable outcome
(vision receipt), so the plate leg of the founder's corpus is a standing gate, not a
one-time drive.

Base at composition: trunk cl/integration-2 @ c8b387ec; lane stack live (:3093 /api/health
200, :5193 200, both verified by the composer at composition time). L2-TERM-1 and L2-CHAT-1
are LIVE coders off dac9f515; L2-FREEFORM-1 is spec-ratified and gated behind CHAT-1's merge.
THIS item dispatches only after ALL THREE predecessors are merged and the stack restarted
(task dispatch_gate, verbatim): predecessors merged to cl/integration-2 + stack restarted
(YAML edits land). The coder branches off the CURRENT tip at dispatch, NOT dac9f515/c8b387ec.

## The prompts (VERBATIM from /mnt/vast/home/brad/git/computable-lab/tmp/prompt_files.md —
## the harness sends these byte-for-byte; "punctuation and all", bait B6)

1. `Navigate to the freeform manual deck`
2. `Place a 96-well plate on the deck.`
3. `Put 100ul of "DMEM with 10% FBS" in wells B1:H6`
4. ` Add 100uL of 50/50 Trypsin-EDTA/DMEM with 10% FBS to wells A2:H6` (leading space in source)
5. `Add 1uL 1mM clofibrate in DMSO to wells A2:H2 with an 8-channel pipette`
6. `All 1uL DMSO (vehicle control) to A3:H3` (sic — "All" for "Add")
7. `Do a pipette mix on all wells that contain materials with the 8-channel pipette (75ul, 3 cycles)`
8. `Place the plate  into the CO2 incubator for an overnight incubation` (double space in source)

The harness stores the corpus as a DATA file copied verbatim (byte-identical, including the
prompt-4 leading space, prompt-6 "All", prompt-8 double space) — never re-typed strings
scattered in code (bait B6).

## Cited anchors (all opened first-hand by the composer at c8b387ec; re-verify at dispatch —
## CHAT-1's merge WILL move app/ cites)

Universal chat client path (the surface the harness drives — NOT AiTabPanel):
- app/src/run/RunWorkspacePage.tsx:100 — `surface: 'run-workspace'` in the aiContext;
  :114 — `useSurfaceChat({ aiContext, endpoint: 'event-editor' })` (endpoint = thread
  persistence id, NOT the stream endpoint); :157 — `rightPane={<HarnessChatPane />}`.
- app/src/agent/useSurfaceChat.ts:31-44 — the ONE universal-chat call: useAiChat +
  useWorkstateProposalFlow + useRegisterAiChat.
- app/src/shared/hooks/useAiChat.ts:301 — hook signature (destructures onAcceptEvent);
  :589-597 — the per-turn call `streamAssist(prompt, ctx.surface, contextPayload, history,
  signal, files, thinking)` — this is the wire the harness must mirror byte-shape-for-shape.
- app/src/shared/api/aiClient.ts:171 — `streamAssist(...)`; :234-236 — THE ENDPOINT FORK
  (verified verbatim): `surface === 'event-editor' ? ${API_BASE}/ai/draft-events/stream
  : ${API_BASE}/ai/assist/stream`. So TODAY: /runs (surface run-workspace) posts to
  /api/ai/assist/stream; the /deck universal pane posts to the LEGACY
  /api/ai/draft-events/stream. DeckSurfaceChat.tsx:29 sets `surface: 'event-editor'`;
  :59-63 shows a universal mount that DOES pass onAcceptEvent (:62) — the wiring CHAT-1 is
  porting everywhere else.
- server/src/api/routes.ts:677 — `fastify.post('/ai/assist/stream', aiHandlers.assistStream...)`;
  server/src/api/handlers/AIHandlers.ts:116 — `assistStream` (the real handler;
  AIHandlers.foldStreamTerminal.test.ts:17 confirms tests drive "the exact function routes.ts
  registers at POST /ai/assist/stream").
- config/drafting/shorthand-drafting.yaml:12 — `surfaces: [workspace.deck]` — the ONLY
  shorthand surface. `run-workspace` and `event-editor` are NOT members (their panes ride
  the legacy raw-event_graph path — L2-CHAT-1 spec's folded MCA finding). SUITE-A's honest
  expectation DEPENDS on which surface the merged product drives: see OQ4.
- server/src/ai/AgentOrchestrator.ts:1288 — `conversationKey = deriveContextCacheKey(surface,
  context)`; :2674 — `holdShorthandIntent(conversationKey, ...)`. Multi-turn state (prompt 7
  reading prompts 3-6's placements via the held thread) keys on byte-identical surface +
  context across turns — the sequence harness MUST send them unchanged (bait B5).
- server/src/ai/submitSuggestionTool.ts:438 — `AGENT_INTENT_TOOL_NAME = 'agent_intent'`;
  :453 — intent enum (includes `deck_layout`, `event_shorthand`, `workspace_action`);
  :463 — deck_layout variantId description naming `manual_freeform`.
- server/src/platform-registry/defaultManifests.ts:71-72 — `id: 'manual_freeform'`,
  title 'Manual Bench (freeform)' — the landing target of prompt 1.
- Prompt 1's nav intent is server-resolvable TODAY: `deck_layout` switches the run deck
  platform/variant; whether the merged product routes it via agent_intent deck_layout or a
  `workspace_action`/`compose_workstate` card is CHAT-1/merge-era behavior — the probe asserts
  the OUTCOME (deck on manual_freeform), not the intent name (bait B7).

Badge payload (L2-TERM-1's surface — the suite VERIFY, never re-implement):
- app/src/shared/taptab/slashMenu/resolvers.ts:445 `badge: c.namespace ?
  c.namespace.toUpperCase() : 'Ontology'`; :758-759 bare material `subtitle: 'Ontology term'`
  (the defect); :786-787 materialBadge fallback `'Ontology'`. After TERM-1 merges, the
  resolver payload tiers are Local / Ontology / Composition / New — the per-prompt probe for
  3-6 byte-checks the badge fields in the resolve/card payload against TERM-1's merged tier
  map; the vision layer checks the RENDERED badge rows.
- Server resolve spine: server/src/api/routes.ts:494 — `POST /resolve` (resolveHandlers.
  resolveTerm) — if the merged server leg carries badge/tier fields, probe there; else the
  badge check is app-side resolver payload (vitest) + receipt (rendered). Coder derives at
  dispatch from TERM-1's merged layout.

Probe idiom + write-free invariant (REUSE, do not re-derive):
- /home/brad/.hermes/cl/lanes/2/precheck-assist-turn.py — the lane-2 committed idiom: POST the
  EXACT request shape the UI builds (:39-47 body = prompt/surface/context JSON) to :3093
  (:14 BASE), parse the SSE frame trail (:57-80), classify. Read-only: nothing is applied.
- L2-FREEFORM-1 canonical spec .hermes/plans/2026-10-26_L2-FREEFORM-1-freeform-legs.md
  acceptance #2 (lines ~133-140): the committed, importable `assertHonestOutcome(result)`
  helper returning "events-bound" | "cards" | "honest-failure" and THROWING on none, with the
  events-bound leg requiring every event's labwareId ∈ deck ids ∪ resolved record ids.
  SUITE-A CONSUMES it — "do not let SUITE-A re-implement it" is FREEFORM's spec text, and
  this spec honors it. The honesty rule below is stated in terms of that helper.
- FREEFORM's per-leg probes H1-H5 are ITS gates; SUITE-A does NOT re-run or duplicate them —
  it asserts the trichotomy per PROMPT via the shared helper (see §Boundary below).

Conversation persistence (harness session state):
- server/src/api/routes.ts:732-734 — GET/POST `/api/ai/threads/:endpoint`, POST
  `/api/ai/threads/:endpoint/promote` — the universal chat's server-persisted thread
  (DeckSurfaceChat.tsx:6-8 header documents `endpoint: 'event-editor'` persistence). The
  harness reads/clears its thread via these GET/POST routes; clearing strategy is OQ1.

## Description of work

### 1. The committed harness (this item's primary deliverable)

Proposed exact paths (task files-field allows ".hermes/plans/ or scripts/"; the FREEFORM spec
already sets the ".hermes/plans/ committed live-probe" precedent, and scripts/ is product
shipped-tooling territory — a lane acceptance harness belongs under .hermes/):

    .hermes/plans/harness/l2-suite-a/
      run-suite-a.py            # the driver (python3, stdlib-only like precheck-assist-turn.py)
      prompts-plate-leg.txt     # prompts 1-8 copied byte-identical from tmp/prompt_files.md
      expectations/             # one JSON per prompt: expected channels (events>0 / cards>0 /
                                #   wall; well ranges; badge tiers; kind constraints)
      README.md                 # how to run against :3093; layer (a) vs (b) split; failure meaning
      lib/                      # SSE frame parser, trichotomy classifier (imports/mirrors the
                                #   assertHonestOutcome contract — see OQ3 for the vitest-vs-python form)

Driver contract:
- `python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --base http://localhost:3093`
  drives prompts 1-8 IN ORDER in ONE held conversation (prompt 7 depends on the materials
  placed by 3-6 — sequence state is load-bearing; per-prompt fresh sessions are OQ2 only for
  the badge-isolation legs).
- Each prompt: POST the exact useAiChat/streamAssist wire shape (prompt verbatim from
  prompts-plate-leg.txt, surface + context BYTE-IDENTICAL across turns per
  AgentOrchestrator.ts:1288, history carried forward), parse every SSE frame, persist the
  raw trail + a verdict to the receipts dir, apply the honesty rule, FAIL FAST on any
  honest-rule violation but still dump the remaining prompts' state files before exiting.
- WRITE-FREE (layer (a)): the probe NEVER calls accept/apply routes (/runs/:id/event-graph/
  accept routes.ts:435, threads promote routes.ts:734, appendEvent legs). It asserts zero
  writes by recording the data repo (/home/brad/.computable-lab/worktrees/main) record-tree
  digest before/after (FREEFORM acceptance #5 idiom). The VISION drive (layer (b)) runs in
  the real browser and MAY accept proposals through the UI — that is the product path, and it
  runs against a run/deck the harness owns (OQ1), never Brad's :5174/:3001 stack.
- Per-prompt state files: /home/brad/.hermes/cl/receipts/L2-SUITE-A/<UTC-ts>/prompt-N.json —
  {prompt, request_sha, sse_frame_types[], events_count, cards_count, wall: bool, badges[],
  wall_state, verdict} — this is the "per-prompt state files in receipts" the verified-by
  demands, and the byte-comparison baseline for re-runs (deterministic legs byte-diff their
  verdict JSON against the committed expectations/ JSON).

### 2. Two evidence layers, and which prompts need which

Layer (a) — deterministic headless probe — required for ALL EIGHT prompts. Drives the real
server route (POST /api/ai/assist/stream, the endpoint aiClient.ts:236 builds for the
run-workspace surface) with the real orchestrator, write-free; byte-compares per turn:
events count, cards (clarificationRequests) count, wall state, badge/tier fields in the
resolve payload. Runs green on trunk with zero model-UI involvement — model calls are REAL
here (this is a live :3093 drive, not vitest with a scripted client; the vitest scripted-client
form already exists in FREEFORM's gates and is NOT re-run here — see OQ3 for budget).

Layer (b) — cl-browser-reviewer vision receipts against :5193 — required for the VISUAL
claims only, which per prompt are:
- P1: route/surface change visible (deck surface showing Manual Bench (freeform)).
- P2: the 96-well plate ghost renders on the deck.
- P3: ghost wells B1:H6 rendered; badge row honest (DMEM with 10% FBS — Local/Composition/
  Ontology per TERM-1 tiers, never a false Ontology).
- P4: composition-string handling: ghost wells A2:H6 OR answerable cards rendered (the card
  rows are the visual claim when events are held).
- P5: ghost wells A2:H2 (exactly rows 2, eight columns = 8-channel honored) + honest badges.
- P6: ghost wells A3:H3; DMSO (vehicle control) badge honest.
- P7: the pipette-mix ghost(s) covering the COMPUTED well set (all wells containing materials
  after 3-6) — reviewer confirms the ghost footprint matches the union, 75uL/3 cycles visible
  in the proposal card.
- P8: the incubator/equipment event observable — plate-to-CO2-incubator renders as an
  equipment/incubator event on the wall/trail, NOT a material add row.
Prompts needing ONLY layer (a): none (all eight also get the probe). Prompts whose visual
claim is conditional: P3-P7's ghost rows reduce to "card rows visible" when the honest
outcome for that turn is cards (the trichotomy's cards arm) — the reviewer accepts either,
but NEVER success-with-nothing.

### 3. The honesty rule (suite-level, expressed via FREEFORM's helper)

Per prompt: the turn's result MUST satisfy `assertHonestOutcome` — events-bound (events>0 AND
every event's labwareId ∈ deck ids ∪ resolved record ids), or cards>0 with cards ANSWERABLE,
or the honest wall/error that names itself. success + zero events + zero cards + no wall =
suite FAIL (REVISE-GHOST-1 rule, task campaign header). The python driver re-encodes the SAME
discriminated verdict and the "unbound event is NOT events-bound" leg; a pinned parity test
(vitest, in server or app per OQ3) feeds both implementations the same five fixture shapes
(FREEFORM acceptance #2 (a)-(e)) and asserts identical verdicts — drift between driver and
helper is a defect. The driver imports the helper's verdict strings verbatim.

### 4. Boundary with L2-FREEFORM-1 — REUSE, NEVER DUPLICATE

FREEFORM's canonical spec (.hermes/plans/2026-10-26_L2-FREEFORM-1-freeform-legs.md) owns:
H1 bind-refusal, H2 recompile drop, H3 skip discard, H4 card loop, H5 doc-discussion — each
with its own per-leg vitest probe and its own file(s). SUITE-A:
- does NOT add per-leg probes; it asserts the trichotomy per PROMPT through the shared
  `assertHonestOutcome` helper and the parity pin (§3).
- does NOT re-run FREEFORM's vitest leg files as its gate (they run in their own item's
  acceptance); the suite's first targeted check (below) touches only the harness.
- If a suite prompt exposes a defect, the fix is a separate fix-run on the same worktree
  (task files-field: "server/app fixes the prompts expose (each as its own fix-run, same
  worktree, reviewed per cycle)") — the harness itself stays behavior-agnostic.

## Per-prompt acceptance criteria (expected outcomes; the expectations/ JSON mirrors these)

Acceptance criteria VERBATIM from the task list ("verified by"):
  Committed probe suite green on trunk at the served revision + cl-browser-reviewer
  VERDICT:accept on receipts showing each prompt's observable outcome (route change,
  ghost wells, badges, cards, incubator event). Suite script + per-prompt state files in
  receipts.

And VERBATIM from the task description (the per-prompt semantics this spec operationalizes):
  (1) "Navigate to the freeform manual deck" — navigation action lands the deck surface;
  (2) "Place a 96-well plate on the deck." — labware placement proposal + ghost;
  (3)-(6) the three material adds incl. the composition strings — nouns resolve or ask
  ANSWERABLE cards; badges honest per L2-TERM-1; wells B1:H6 / A2:H6 / A2:H2 / A3:H3 mount
  as ghosts; (5)-(6) honor the 8-channel constraint; (7) pipette mix "all wells that contain
  materials" — computed well set, 75uL 3 cycles; (8) lands as an equipment/incubator event,
  not a material add. Any turn with success + zero events + zero cards + no wall FAILS the
  suite. The suite must be re-runnable (committed driver script) — this is a standing
  harness, not a one-time gate.

Operationalized per prompt (layer (a) assertions; (b) = the visual claims in §2):
- P1: done-result is NOT the empty trichotomy-fail; the turn carries a deck-layout intent/
  action whose target resolves to platform manual / variant manual_freeform
  (defaultManifests.ts:71-72), OR a review card proposing exactly that (cards arm). It NEVER
  silently returns prose-only (FREEFORM H5 leg territory — if it does, that's an exposed
  defect fix-run).
- P2: events>0 (a placement/labware event for a 96-well plate whose labwareId is bound —
  helper's events-bound arm) OR a card naming the plate candidate. Raw-label labwareId does
  NOT count (H1 post-merge contract).
- P3: events>0 bound with well set exactly the compiler's expansion of "B1:H6" (the probe
  takes the well set/count from the server result and byte-compares against the expectations
  JSON; well-range semantics are the compiler's, never re-derived in the harness), OR
  answerable cards for the DMEM/FBS noun; badge tier for "DMEM with 10% FBS" ∈ TERM-1's
  honest tiers (a composition reading badges Composition; a local record Local; NEVER
  Ontology for either).
- P4: composition string "50/50 Trypsin-EDTA/DMEM with 10% FBS": either resolves with
  Composition tier badge and wells A2:H6, or asks a card that is ANSWERABLE (has options or
  an accepted answer form — never-guess: fraction-READING cards are answered via readings,
  per ANSWER-FOLD jurisdiction). A silent success with neither FAILS.
- P5: wells exactly A2:H2 (row 2 only) AND the 8-channel constraint honored: the event/
  proposal expresses an 8-channel operation over exactly the 8 columns A..H of row 2 (count
  8); a 96-well single-channel interpretation FAILS (bait B8).
- P6: wells exactly A3:H3; "All" typo + "(vehicle control)" parenthetical must not derail:
  either handles it or asks an answerable card; success-with-nothing FAILS.
- P7: the computed well set "all wells that contain materials" = union of the placements
  that succeeded in P2-P6 on THIS run (P3 B1:H6 ∪ P4 A2:H6 ∪ P5 A2:H2 ∪ P6 A3:H3, ∩ 8-channel
  column groups per the merged product's semantics — the probe reads the EXPECTED set from
  the accumulated state files, not a hardcoded literal; expectations/P7.json says
  "computed:union-of-prior-material-wells"); 75uL volume, 3 cycles present in the proposal;
  8-channel honored.
- P8: the result's event kind is an equipment/incubator move (incubate / equipment placement
  of the plate into CO2 incubator), NOT an add_material event (kind assertion on the done
  payload); an answerable card naming the incubator equipment is the cards arm; success-with-
  nothing FAILS.

## First targeted check (the ONE command that proves the approach early)

cwd=/mnt/vast/home/brad/git/cl-integration-2, stack live:
  python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --prompts 2 --single
Expected EARLY (before prompts 1/3-8 expectations exist, before any vision drive): the driver
posts prompt 2 verbatim to :3093, dumps prompt-2.json under receipts, and prints a verdict of
"events-bound", "cards", or "honest-failure" — i.e. it NEVER prints the forbidden
success+zero+zero+none without exiting nonzero. The minimum plate-move is prompt 2's full
loop: if the driver can classify it, the harness shape works. If it prints a verdict the
result cannot support (e.g. "events-bound" while a labwareId is an unbound raw label — the
helper's (e) fixture shape), the classifier is wrong; fix that before writing 7 more
expectations. (Before the predecessors merge, prompt 2 on the un-merged stack is EXPECTED to
print the forbidden combination and nonzero — that failing run, saved as receipts evidence,
is the harness's own RED proof.)

## Complete verification commands (expected outputs)

1. Harness committed + re-runnable (cwd=repo root):
   `python3 .hermes/plans/harness/l2-suite-a/run-suite-a.py --all --base http://localhost:3093`
   -> exit 0; per-prompt lines `P<n> verdict=<events-bound|cards|honest-failure>`; eight
   prompt-N.json under a new receipts dir; data-repo digest identical before/after
   (write-free); rerunning immediately prints the same verdict lines (re-runnable).
2. Honesty-helper parity (the drift pin): `cd server && npx vitest run <parity test file the
   report names>` -> PASS; feeds the shared-helper fixtures (a)-(e) to both the helper and
   the driver's classifier module and asserts identical verdicts.
3. FREEFORM gates (consumption proof, expected green because merged before this item):
   `cd server && npx vitest run src/ai/AgentOrchestrator.freeformLegs.test.ts` (or FREEFORM's
   report-named per-leg files) -> all PASS. SUITE-A changes nothing here; a failing FREEFORM
   leg blocks SUITE-A acceptance (predecessor regression — report, don't fix here).
4. Typecheck (harness is python + JSON; any fix-run code obeys the usual rule):
   `npm run typecheck -w server && npm run typecheck -w app` from repo root -> sorted
   error-line diff vs branch-start baseline = ZERO NEW (both dumps in the report).
   Harness-only landing: BOTH dumps byte-identical to baseline (zero product files touched).
5. Determinism byte-compare: run `--all --compare expectations/` twice; the deterministic
   channel counts (events_count, cards_count, wall, verdict) must be equal across the two
   runs for every prompt where expectations/P<n>.json declares `deterministic: true`
   (coder marks per-prompt after first green; LLM prose is excluded from the compare,
   channel SHAPES are not — bait B9).
6. Vision gate (ORCH-owned, per the CHAT-1/TERM-1 evidence-debt convention — the coder does
   NOT self-run the acceptance receipt): cl-browser-reviewer against :5193 on the served
   merged revision, per-prompt claims §2, receipts under
   /home/brad/.hermes/cl/receipts/L2-SUITE-A/<ts>/browser/ -> VERDICT: accept per campaign
   doctrine. The coder MAY take informal screenshots while developing; they are not the gate.

## In scope / out of scope (exact paths)

IN SCOPE:
- .hermes/plans/harness/l2-suite-a/** (NEW — the harness; the item's core deliverable)
- /home/brad/.hermes/cl/receipts/L2-SUITE-A/** (runtime state files; outside the repo)
- ONE parity pin test (server or app vitest file, named in the report — see OQ3)
- Fix-runs the prompts expose (server/src/ai/**, app universal-path files CHAT-1 merged,
  resolver tier surface TERM-1 merged) — each as its OWN commit on the same worktree branch,
  each with its own RED first, reviewed per cycle (task files-field).

OUT OF SCOPE (do not touch):
- AiTabPanel and its tests as a PRODUCT surface (UC-D1: it retires; the harness never drives
  it). Existing AiTabPanel locks stay; drive the universal path only.
- L2-FREEFORM-1's per-leg probe files (server/src/ai/freeformLegs/** or its named file) and
  the assertHonestOutcome implementation — consume, never edit (editing the helper to make a
  suite prompt pass = instant reject; the prompt failing is the finding).
- config/drafting/shorthand-drafting.yaml surfaces membership (surface adds are
  propose-in-report per CHAT-1/FREEFORM rulings — see OQ4).
- The resolver/badge tier IMPLEMENTATION (resolvers.ts tiers) — TERM-1 owns it; SUITE-A
  asserts the merged output only. If a badge is dishonest post-TERM-1-merge, that is a
  fix-run with TERM-1's surface + its own RED.
- The data repo /home/brad/.computable-lab/worktrees/main as a WRITE target for layer (a)
  probes (write-free invariant); Brad's main stack :5174/:3001 — never.
- Prompts 9-10 (L2-SUITE-B extends THIS harness — design the driver with a plate/sequence
  leg split so B adds expectations + a leg, but do NOT author B's content here).

## Reviewer bait (the likely edge errors for this item — pre-empt them)

- B1 exactOptionalPropertyTypes sites: any fix-run touching optional result channels
  (wall marker, badges, unboundRefs) uses CONDITIONAL SPREAD — key ABSENT, never undefined
  (eOPT on backend; precedent shorthandChat.ts:1254/:1274 cited in FREEFORM bait B1). The
  parity/expectation JSONs use ABSENT keys too — a `"wall": null` in expectations/ that the
  wire encodes as absent byte-fails the compare.
- B2 YAML-reload trap: if ANY expectations change rides YAML (e.g. an OQ4 ruling lands a
  surface add — it should not come from this item), tsx --watch does NOT reload YAML; the
  live :3093 drive MUST run after an orch stack restart, and the report must state the
  restart. A suite run that green-washed against a stale YAML is worthless.
- B3 hardcode boundary: prompt 7's computed well set is COMPUTED from the accumulated
  prior-prompt state (the driver reads its own receipts), never a well-list literal in the
  harness, and NEVER well-set/lexicon logic added to server TS as a "fix" for prompt 7 —
  compiler support for "all wells that contain materials" is a structural capability; if it
  is absent, that is a finding routed per the fix-run rule or to the orchestrator, not a
  "B1:H6|A2:H6|..." string branch (repo rule #1; instant reject for material/well vocabulary
  in TS).
- B4 ontology terms: the suite asserts TERM-1's merged tiers with TERM-1's vocabulary; the
  harness introduces NO new badge words. If expectations/P3.json says
  `badge: "Ontology"` for "DMEM with 10% FBS", the expectation itself is the defect (UC-D4).
- B5 vacuous sequence: conversationKey derives from surface+context
  (AgentOrchestrator.ts:1288) — a driver that rebuilds context between turns (even a changed
  timestamp field) silently resets the held thread and prompt 7 "passes" without ever seeing
  3-6. Pin: log `deriveContextCacheKey`-stable evidence (same conversationKey per
  request_sha trail or the arm-log line) in every prompt-N.json from P2 onward.
- B6 verbatim-corpus drift: prompts-plate-leg.txt must byte-match tmp/prompt_files.md lines
  3-17 (leading space in 4, "All" in 6, double space in 8). The report shows a diff/sha256 of
  both. Re-tidied prompts are a fake suite.
- B7 intent-name over-assertion: P1 asserts the OUTCOME (deck on manual_freeform) — the
  merged product may ride deck_layout or workspace_action/compose_workstate; do not pin the
  intent NAME (that couples the standing harness to prompt-scaffolding text in
  submitSuggestionTool.ts:455).
- B8 8-channel semantic: A2:H2 is eight wells across eight columns — the constraint is only
  meaningful as an 8-channel operation; a fix that "passes" by ignoring the pipette clause
  or by 24 single-channel events FAILS. expectations must encode channel-count semantics,
  not just well membership.
- B9 nondeterminism laundering: do NOT mark a prompt `deterministic: true` to make CI feel
  good when its cards wording varies; compare channel SHAPES (counts, kinds, tiers, wells),
  never prose. Model-call nondeterminism is disclosed per prompt in the report — the
  honesty-rule assertion is shape-strict, the content is not.
- B10 write-free violation: any driver leg that clicks Apply in layer (a), POSTs accept
  routes (routes.ts:435), or promotes threads (routes.ts:734) has broken the invariant —
  writes belong ONLY to the browser drive (layer (b), orch-owned) against harness-owned
  state (OQ1).

## Worker contract

- Branch: cl/lane2-l2suitea-l2t<tick> OFF THE CURRENT cl/integration-2 TIP AT DISPATCH
  (post TERM-1 + CHAT-1 + FREEFORM-1 merges; NOT dac9f515/c8b387ec).
- Worktree: /mnt/vast/home/brad/git/cl-integration-2/wt/L2-SUITE-A-lane2-l2t<tick>.
- Deliverable: /home/brad/.hermes/cl/lanes/2/deliverables/L2-SUITE-A-report.l2t<tick>.md —
  write even if partial; end with a STATUS: line. Sections: files changed, first-targeted-
  check output (the RED-on-unmerged and GREEN-on-merged forms), per-prompt verdict table
  (layer (a)), corpus byte-parity sha256 pair (B6), parity-pin test tail, write-free digest
  proof, determinism compare, tsc baselines both dumps, per-prompt determinism disclosure
  (B9), fix-run ledger (each exposed defect, its RED, its commit), assumptions block.
- git -c core.fileMode=false everywhere (NFS mode-bit noise). Lane stack :3093/:5193; any
  YAML/restart is ORCH-owned. Never :5174/:3001. The browser acceptance receipt is orch-owned
  after merge (campaign convention from TERM-1/CHAT-1 evidence-debt notes); the coder ships
  the harness + layer (a) green + any needed screenshots as development evidence only.

## Open questions for the orchestrator (rule before dispatch)

- OQ1 (per-run project state + auth): the :3093 routes carry no auth header in the UI's own
  calls (aiClient.ts builds plain fetches), so the driver needs no credentials — but it needs
  a RUN/DECK to drive against. Options: (i) the suite CREATES a throwaway run via
  POST /runs/create-from-template (routes.ts:384) seeded from the lane fixture, driving the
  thread via a unique endpoint key; (ii) a committed seed script writes the data repo once
  (breaks write-free only at seed time, orch-run); (iii) reuse a known live run and accept
  state pollution. Recommendation: (i) for the browser leg (writes land in harness-owned
  state) and NO run writes at all for layer (a) — /ai/assist/stream drafts without a
  materialized deck where context.labwares is injected in the request context (FREEFORM's
  probe-injection point, AgentOrchestrator.ts:1298 `context?.labwares`) lets P2-P8 bind
  against request-provided deck state. Checked: routes.ts:384/:434-435/:677/:732-734 opened;
  aiClient.ts builds unauthenticated JSON/multipart POSTs (:255-259); DeckSurfaceChat
  surfaceContext carries eventGraphId/runId (:31-38) so deck identity is request-supplied,
  not session-derived.
- OQ2 (sequence isolation vs per-prompt isolation): prompt 7's expected set DEPENDS on P3-P6
  outcomes (task text: "computed well set"), so a single held session running 1-8 in order
  is load-bearing. But a P5 FAIL poisons P6-P8's expectations. Recommendation: one session,
  ordered, FAIL-FAST with disclosure — a failed prior prompt downgrades dependent prompts to
  `blocked-by-P<n>` status in the verdict table (never a fake pass, never silent skip); plus
  a `--single N` mode (used in the first targeted check) that runs prompt N against a
  request-injected deck pre-seeded with the prior materials for debugging. Checked:
  conversationKey = surface+context (AgentOrchestrator.ts:1288), holdShorthandIntent keyed
  there (:2674), thread persistence via /api/ai/threads/:endpoint (routes.ts:732-734,
  DeckSurfaceChat header) — both mechanisms confirmed request/context-derived, so a byte-
  stable driver holds them; how deep the shorthand hold reaches across 8 turns is unproven
  locally (no live 8-turn drive run at composition — bounded budget).
- OQ3 (parity-pin form + live-model budget): the helper `assertHonestOutcome` is TypeScript
  (FREEFORM's committed gate); the driver is python (precheck-assist-turn.py idiom). Options:
  (i) python re-implements the verdict + a vitest parity pin feeds both the same five
  fixtures; (ii) a thin node CLI wraps the TS helper and the python driver shells out to it.
  Recommendation: (ii) — one implementation, no drift surface, driver stays stdlib. Related:
  layer (a) against :3093 spends REAL model calls per prompt (the endpoint is not
  deterministic); confirm the orch accepts ~8+ real turns per suite run (ANSWER-FOLD replay
  precedent spent live turns per replay) or rules that the trunk gate is a scripted-client
  vitest form and the live :3093 drive is the orch's post-merge replay. Checked: the
  assist-stream route (routes.ts:677 -> AIHandlers.ts:116) runs the real orchestrator with
  live inference — no scripted-client seam exists over HTTP; FREEFORM's own split (vitest =
  coder gate, python live drive = orch replay) argues for the same here.
- OQ4 (surface/endpoint binding at dispatch tip): aiClient.ts:234-236 routes surface
  'event-editor' to the LEGACY /ai/draft-events/stream and everything else to
  /ai/assist/stream; shorthand-drafting.yaml:12 currently lists ONLY workspace.deck. CHAT-1's
  merged outcome decides: if CHAT-1 landed a surfaces-membership change (its spec: propose-
  in-report only, so it may NOT have) the run/deck panes still ride the raw-event_graph path
  and prompts 3-8 exercise the legacy compiler, NOT shorthand — changing every expectation
  (composition expansion, computed well set may be legacy-path-unsupported = an architect
  finding, not a fix-run). The harness MUST derive its request surface/context shape from the
  MERGED RunWorkspacePage/useSurfaceChat at dispatch (the driver builds the request from the
  merged client's actual payload — a captured-shape snapshot in the README), and the report
  states which path (shorthand vs legacy) the served surface rides. Checked: all four files
  opened at c8b387ec (RunWorkspacePage.tsx:100/:114, useSurfaceChat.ts:31-44,
  aiClient.ts:234-236, shorthand-drafting.yaml:12); CHAT-1's report will name the merged
  path — until then this fork cannot be closed locally.

STATUS: canonical (ratified; OQ1-OQ4 RULED; dispatch gated on FREEFORM-1 merge + restart)
