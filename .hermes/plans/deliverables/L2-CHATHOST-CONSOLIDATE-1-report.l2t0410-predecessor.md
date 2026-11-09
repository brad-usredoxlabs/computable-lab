# CHATHOST-CONSOLIDATE-1 — coder report (lane 2, tick l2t0410)

SPEC: .hermes/plans/2026-11-03_0315-L2-CHATHOST-CONSOLIDATE-1-spec.md (read in full before editing)
WORKTREE: /mnt/vast/home/brad/git/wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410
BRANCH: cl/lane2-chathost-consolidate-1-l2t0410
BASE: 519fcc471fe4ff5966b265bb048166a56fca5441

## Assumptions / decisions recorded up front
- Spec §8.3 V-2 baseline (10 errors at ff53e5a8) does NOT match my tree: my base 519fcc47 is
  newer (trunk moved). Per the task brief, MY MEASURED BASELINE is the reference.
- OBS-B option (i) with first_blessed_ids is RATIFIED (spec §4.3/§4.5, lane list) — not re-opened.
- OQ2: accepted as spec-recommended (project-deck-tab: required [], optional [deck]); the
  retargeted T-3 pins guard the deck branch. No per-mount doors: schema.
- check-gate.py expected UNCHANGED; any touch gets a stated reason here.

## STEP 0 — BASELINE (no edits yet)

### git status (must be empty)
$ git -c core.fileMode=false status --porcelain
(empty; status-rc=0)
$ git rev-parse HEAD
519fcc471fe4ff5966b265bb048166a56fca5441

### shrink-guard in cl-integration-2 (spec §8.1 command, verbatim)
$ cd /mnt/vast/home/brad/git/cl-integration-2 && python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py; echo rc=$?
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
rc=0

### shrink-guard in MY worktree (re-proof in own tree)
$ cd /mnt/vast/home/brad/git/wt/CHATHOST-CONSOLIDATE-1-lane2-l2t0410 && python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py; echo "rc=$?"
SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
rc=0
HEAD=519fcc471fe4ff5966b265bb048166a56fca5441

sha and verdict match spec §8.1 expectation exactly (dcf32649...75156b, rc=0). Proceed.

### APP TYPECHECK BASELINE (measured in MY tree at base 519fcc47, BEFORE any edit)
$ cd .../app && npx tsc --noEmit 2>&1 | grep -E "^src/.*error TS" | sort
11 errors (saved to /tmp/app-tsc-baseline-l2t0410.txt):

src/editor/taptab/tabNavPlugin.ts(102,7): error TS2322: Type '(view: EditorView, event: KeyboardEvent) => boolean' is not assignable to type '(this: Plugin<any>, view: EditorView, event: KeyboardEvent) => boolean | void'.
src/event-editor/deck/LawnSurface.moveAcross.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/deck/PreviewActionBar.test.tsx(108,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/editorHistory.test.ts(176,34): error TS2345: Argument of type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: never[]; labwares: {}; placements: never[]; }' is not assignable to parameter of type 'EventEditorAction'.
src/event-editor/editorHistory.test.ts(199,37): error TS2345: Argument of type '{ type: "load_event_graph_success"; eventGraphId: string; runId: null; events: PlateEvent[]; labwares: {}; placements: never[]; }' is not assignable to parameter of type 'EventEditorAction'.
src/event-editor/EventEditorContext.tsx(1525,29): error TS2339: Property 'equipments' does not exist on type '{ eventGraphId: string; runId: string | null; events: PlateEvent[]; labwares: Record<string, Labware>; placements: EventEditorPlacement[]; }'.
src/event-editor/focus/LabwareFocus.instrument.test.tsx(47,5): error TS2353: Object literal may only specify known properties, and 'runDeckLock' does not exist in type 'EventEditorState'.
src/event-editor/viewer/ViewerToolbar.tsx(55,13): error TS2322: Type '{ id: string; kind: "protocol-review"; recordId: string; title: string; }' is not assignable to type 'never'.
src/event-editor/viewer/Viewer.tsx(65,13): error TS2322: Type '{ id: string; kind: "protocol-review"; recordId: string; title: string; }' is not assignable to type 'never'.
src/ingestion/components/IngestionUploadModal.tsx(232,23): error TS2554: Expected 2 arguments, but got 1.
src/ingestion/protocol-review/ExtractionProgressPanel.test.tsx(9,19): error TS6133: 'fireEvent' is declared but its value is never read.

DIFF vs spec §8.3 V-2 (10 errors at ff53e5a8): 10 of the 11 are byte-identical to the spec's
list; ONE additional error appears in my tree:
  src/editor/taptab/tabNavPlugin.ts(102,7) TS2322 — trunk drift (base 519fcc47 > ff53e5a8).
This pre-dates my work (measured at base, no edits). MY BASELINE = these 11; goal: zero new.

## Progress log
(append as I go)

## STEP 1 — DATA contract + OBS-A + OBS-B(i) + coupled arm inversion (committed)

### config/chat/chat-hosts.yaml (additive, sha-neutral — proven below)
- Header prose §2.7 correction: the "DECLARATION ONLY … No product tsx/ts reads this
  for control flow" claim is replaced with the truth (the product reads it at build
  time via a vite ?raw import as the mount contract; no TS branches on a host name).
- Per-host additive fields on all 6 entries (verified by yaml parse after edit):
    run-workspace       required [deck] optional []     ghost true
    event-editor        required [deck] optional []     ghost true
    project-deck-tab    required []     optional [deck] ghost true   (OQ2: spec-recommended)
    record-host         required []     optional []     ghost false
    artifact-host       required []     optional []     ghost false
    registry-host       required []     optional []     ghost false
- New top-level slices: block (deck / workspace / protocol-selection) with publisher
  file:line — publisher lines VERIFIED at my base: EventEditorContext.tsx:1372
  (EventEditorProvider), WorkspaceContext.tsx:89 (WorkspaceProvider),
  ProtocolSelectionContext.tsx:160 (ProtocolSelectionProvider). All match spec §2.3.
- Existing 5 keys (id/surface/mount/route/note) untouched; 6 hosts, same ids, same
  surface values.

### config/chat/chat-hosts.manifest.yaml (OBS-A prose + OBS-B option (i))
- first_blessed_ids: the original 6 ids, in the same block as first_blessed_sha256.
  Verified at base: canonical_sha(first_blessed_ids) == first_blessed_sha256 (True),
  blessed_sha256 == first_blessed_sha256 (True), blessed_ids == first_blessed_ids (True).
- OBS-A: both FROZEN prose blocks rewritten to the truthful tripwire framing
  (all four spec §3 clauses: DATA in the same writable manifest; tripwire vs
  deliberate rewrite; policed by adversarial review + trunk merge, decisions cite;
  no immutability enforcement claim).

### .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py
- OBS-A: module docstring + shrink_guard docstring + comments + no-anchor cause
  string rewritten to the tripwire framing (no FROZEN/immutable/frozen enforcement
  claim remains; verified by V-6 grep below).
- OBS-B option (i): new anchor invariant canonical_sha(first_blessed_ids) ==
  first_blessed_sha256 (reason "anchor-invariant"); missing/empty first_blessed_ids
  -> reason "no-anchor-set"; removed now derived FROM THE ANCHOR SET
  (first_blessed_ids - current ids), not the top-level set. Authorization unchanged.
- OBS-C: spec_cited restricted to the three real spec trees (.hermes/plans/<name>
  -spec.md top level; specifications/**; docs/**); existence stays the backstop;
  return shape (cited, path) unchanged.

### .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py
- The sg_rm8 arm (§4.4, the arm whose expectation OBS-B (i) inverts) now asserts
  sg_rm8 == [dropped] (was []), comment rewritten to say the ANCHOR SET remembers
  the dropped host. No other CHATHOST fixture needed first_blessed_ids because the
  selfcheck loads the REAL manifest (which now carries it) and the pure-guard arms
  pass it through via dict(...) — enumerated all 24 CHATHOST occurrences; the real
  manifest is the only fixture, so no arm needed a synthetic anchor set. (The
  deliberately-missing-anchor RED arms are added in STEP 5.)

### .hermes/plans/harness/l2-trunk-journeys/README.md
- OBS-A: the FROZEN-prose span (was :183-184) rewritten to the tripwire framing.

### Verification (run in MY worktree — the harness resolves REPO_ROOT from its own
file location, 4 levels up, so it reads MY config/chat + MY spec trees)
- V-6 OBS-A grep gate (expect no output):
    $ git -c core.fileMode=false grep -n "FROZEN\|immutable\|frozen" -- \
        config/chat/chat-hosts.manifest.yaml \
        .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py \
        .hermes/plans/harness/l2-trunk-journeys/README.md
    (no output; grep rc=1)
- Shrink-guard AFTER the first yaml edit (spec §8.1 re-run — sha must be unchanged):
    $ python3 .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py
    SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
    rc=0   (identical to the baseline sha — additive fields are sha-neutral, P-2 re-proven in my tree)
- Shrink-guard AFTER the manifest + guard rewrite (new anchor set in force):
    SHRINK-GUARD green (current sha=dcf326497e83976112405fde5396113659301cf715032591fd103af33875156b; no blessed host dropped)
    rc=0
- Selfcheck AFTER the arm inversion:
    CHATHOST shrink-guard: a CONSISTENT top-level re-bless + a blessed_records entry citing an EXISTING spec -> authorized GREEN, dropped host NAMED (OBS-B i)  OK
    SELFCHECK: PASS   rc=0   (all prior arms still OK)
- Guard logic probe (16 arms, in my tree): current->green; shrunk->RED names host;
  consistent-rewrite+spec-record -> GREEN with removed==[dropped] (the D3 inversion);
  rewrite w/o record -> RED; README/decisions citation -> RED (OBS-C); docs/ and
  top-level -spec.md citation -> GREEN (OBS-C); missing first_blessed_ids ->
  no-anchor-set; anchor-set mismatch -> anchor-invariant; growth -> green; trimmed
  blessed_ids -> invariant; full drain -> invariant; missing anchor sha -> no-anchor;
  un-blessed -> un-blessed. (16/16 pass; one probe sentinel used a nonexistent file
  and correctly returned (False, None) — existence is the backstop.)

### OBS-A before/after line counts (per file, git HEAD vs working tree)
  config/chat/chat-hosts.yaml:                                    before=131  after=180
  config/chat/chat-hosts.manifest.yaml:                           before=72   after=90
  .hermes/plans/harness/l2-trunk-journeys/chat-hosts-shrink-guard.py:  before=311  after=356
  .hermes/plans/harness/l2-trunk-journeys/test-channel-selfcheck.py:   before=1125 after=1128
  .hermes/plans/harness/l2-trunk-journeys/README.md:                          before=214  after=219

### check-gate.py: UNCHANGED (confirmed — it imports shrink_guard and prints the
returned removed list; no gate change needed, per spec §4.4 and §8.4).

### Spec ambiguities resolved in STEP 1
- §2.2 says the three per-host keys are "required on every entry" and the contract
  test fails an absent key. I set them on ALL six (empty lists / false where the
  wiring is prop-built), which is the total-declaration reading and matches the
  §2.2 assignment table exactly.
- OQ2: project-deck-tab takes required [] + optional [deck] + ghost true (the
  spec-recommended reading; no per-mount doors: schema that would break
  check-gate.py:70-97).
- The selfcheck's pure-guard arms pass the REAL manifest (which now carries
  first_blessed_ids) through dict(...), so §4.4's "every fixture manifest needs
  first_blessed_ids" is satisfied by the real manifest; the deliberately-missing-
  anchor RED arms are net-new (STEP 5), not edits to existing fixtures.

## Design decisions — spec ambiguities resolved (read first-hand at 519fcc47)

The spec is precise on the DATA contract (§2.1-§2.3), the store shape (§2.4), the collector/
registrar signature (§2.5) and the OBS-A/B/C mechanics (§3-§5), but is SILENT on two load-
bearing points that the T-3 pins force. I resolved them as follows (recorded here per §8.5);
each is data-driven, host-name-free (V-8), and matches every pin's asserted endpoint/scope.

**A. Where the registrar's thread `endpoint` + `scope` come from.**
The spec's §2.2 adds exactly three per-host keys (required_providers / optional_providers /
ghost_mount) and does NOT add an `endpoint` key; §2.5 step 4 only names the `useSurfaceChat`
params. `AiContext` carries no `endpoint` field (it is a separate `useAiChat` option). The T-3
pins assert per-door endpoints: `event-editor` for the two deck doors (DeckSurfaceChat.test
parity + threadScope wire pin; RunSurfaceChatBridge.focus) and `browser` for the
record/artifact/registry doors (each *.surfaceChat.test asserts `endpoint === 'browser'`), with
page-local scopes (recordId / artifactId / studyId) and NO scope for registry. Resolved:
- `endpoint` is SLICE-IMPLIED, not a host switch. The `deck` slice bundle (published by
  EventEditorProvider — the authoritative owner of the event-editor thread store) declares
  `endpoint: 'event-editor'`; the collector/registrar fall back to the generic-chat default
  `'browser'` (the SAME default the current SurfaceChatBridge.tsx:93 already hardcodes — not a
  new literal) when no deck slice is published. Across the 6-host inventory, deck-slice
  presence ↔ `event-editor` endpoint is a perfect 1:1 (run-workspace + event-editor require the
  deck slice; the four `analysis` doors publish none).
- `scope` is likewise slice/page-derived: the `deck` slice carries its own thread scope
  (= the loaded eventGraphId, or absent for an unsaved deck — the threadScope pin's "reserved _"
  edge); the non-deck doors carry a page-local `scope` passed via the registrar's `base`
  (recordId / artifactId / studyId; registry passes none → `'scope' not in options`).
- NO host-name comparison anywhere (V-8): the `host` prop only indexes the YAML entry;
  endpoint/scope/ghost-wiring all key off the resolved entry's DATA fields + the PUBLISHED
  slices, never off `host`.

**B. The `base` prop shape.**
§2.5 says the registrar takes `host: ChatHostId` plus an optional `base` context. `AiContext`
has no scope slot, so `base` is `{ context: AiContext; scope?: string | null }`: the page-local
fields record/artifact/registry/project build today (`context`) plus their page-local thread
`scope`. Deck doors pass no `base` (the deck slice supplies the full context + scope). This keeps
the collector's `base.surfaceContext` merge honest and the exactOptionalPropertyTypes `scope`
spread (absent, never `undefined`) intact (bait #1).

**C. The deck slice bundle.**
To reproduce DeckSurfaceChat/RunSurfaceChat behaviour with ONE registrar, the `deck` slice
carries: the precomputed `buildAcceptedEventGraphProjection` result + the deck fields
(eventGraphId/runId/platformId/variantId/vocabPackId/placementCount/eventCount/selectedWells),
the `endpoint: 'event-editor'` declaration, the deck `scope` (eventGraphId | undefined), the
`focusLabel` (deck vs run — derived by the publisher from its own state), and the six handler
closures (onAcceptEvent/onProposalDrafted/onPreviewDiscarded/onPreviewAccept/onStagedExtras/
onDeckLayout) built from the publisher's live state/actions. The collector merges the projection
into base; the registrar wires the handlers ONLY when `ghost_mount: true`.

**D. Focus publish.**
The focus box is a SEPARATE concern from the AiContext (the deck parity pin mocks
`useSetChatFocus` and asserts nothing about focus; only the run focus pin asserts it). The deck
slice publisher owns the focus publish (it is the component that previously lived inside
ChatFocusProvider and knew the deck/run label + protocol-selection focusedStep), so the ONE
registrar does not re-derive it. This keeps the run focus pin's mount (registrar inside
ProtocolSelectionProvider + ChatFocusProvider, EventEditorContext mocked) green: the deck slice
publisher is what publishes focus in that tree.

## STEP 2 — RED tests (T-1 contract + T-2 door)

### T-1 RED (measured, before product)
Command: `cd app && npx vitest run src/shared/config/chatDoorRegistry.contract.test.ts`
Result: **5 passed | 1 failed** (rc=1). Pins 1-4 + 6 GREEN against the STEP-1 DATA;
pin 5 RED as designed:
```
FAIL ... > pin 5: exact-set equality between the YAML host ids and the host="…" literals in app/src
AssertionError: expected [] to deeply equal [ 'artifact-host', …(5) ]
Test Files  1 failed (1); Tests  1 failed | 5 passed (6)
```
This proves the `?raw` YAML import resolves under vitest and the anti-drift grep finds
zero `host="…"` literals pre-retarget (correct — the call sites still pass aiContext/scope).

### T-1 GREEN (after product)
`cd app && npx vitest run src/shared/config/chatDoorRegistry.contract.test.ts`
  Test Files  1 passed (1)
       Tests  6 passed (6)
  All 6 pins green: (1) six hosts + order, (2) per-host capability fields
  present, (3) slices: block vocabulary {deck}, (4) manifest order parity,
  (5) ZERO host="..." literals in app/src, (6) ?raw import parses.

### T-2 GREEN (after product)
`cd app && npx vitest run src/shared/shell/SurfaceChatBridge.door.test.tsx`
  Test Files  1 passed (1)
       Tests  2 passed (2)
  Leg 1 (loud): render registrar host="run-workspace" with no deck slice ->
  throws ChatDoorMisconfiguredError naming "run-workspace" AND "deck".
  Leg 2 (parity): publish a deck slice -> forwarded useSurfaceChat options
  carry the deck fields (labwares/events/selectedWells object form/eventGraphId),
  surface stays "run-workspace" (deck slice surface wins only for a generic
  `analysis` base), endpoint "event-editor", scope "EG-1".
  Note: T-2's useSurfaceChat mock is a BARE vi.fn (the T-2 contract is the
  forwarded options — the retargeted DeckSurfaceChat.test.tsx parity-pin idiom).
  The earlier draft used importOriginal (driving real useAiChat hydration,
  which hit the un-mocked getThread); that was a test-authoring error, not a
  product defect — the host-page pins own the real-hydration seam.

### Product files (STEP 3) — created
- app/src/shared/context/SurfaceSliceStore.tsx — the slice store (one instance
  per AiPanelProvider) + usePublishSurfaceSlice (render-safe ref write +
  bump-on-change + unmount-only clear) + useSurfaceSlices/getSlice reads.
  DeckSliceBundle = an alias of the collector's CollectorDeckSlice (single
  source of truth for the slice shape; store -> collector is a one-way import).
- app/src/shared/lib/collectSurfaceContext.ts — the ONE collector. Pure
  function collectSurfaceContext({host, base, slices, entry}) ->
  {aiContext, endpoint, scope, handlers, deckSurfaceWins}. NO host comparison:
  the entry (YAML) + the slices' data drive every decision. Also exports
  DoorEntry, CollectorBase, CollectorDeckSlice, SurfaceContextHandlers,
  isThreadSegmentSafe (the thread-scope segment guard, re-exported by the
  registrar), focusedStepDetail (the "Step N: label" run-focus detail).
  Surface-resolution rules (all data-driven, no host name):
    * generic base (surface === 'analysis', no surfaceContext params) +
      published deck slice -> the deck slice wins the posted surface
      (the project-deck-tab case).
    * specific base (run-workspace / the page-local analysis with a runId) +
      deck slice -> base keeps its surface/summary; the deck slice contributes
      endpoint + scope + handlers + the deck context patch.
    * deck slice absent + ghost_mount host -> ChatDoorMisconfiguredError
      (loud, named host + missing slice).
  endpoint: the deck slice's endpoint (the deck thread store) when the deck
  slice is published; else the host-page default 'browser' (the generic-chat
  endpoint — a shared literal, not a new policy fact).
  scope: the deck slice's scope (the loaded eventGraphId) when the deck slice
  is published; else base.scope.
  editorMode: the deck slice's editorMode ('deck') overrides the base's
  (the old DeckSurfaceChat posted 'deck'; the run door keeps its own).
- app/src/shared/shell/SurfaceChatBridge.tsx — the ONE registrar (rewritten).
  Takes host (a door-registry id, NOT a host list) + optional base. Resolves
  the YAML entry (build-time ?raw parse), loud-fails on a missing required
  slice, wires the ghost/adoption/deck-layout handlers from the deck slice,
  and calls useSurfaceChat ONCE. The working-focus publish is data-driven
  (deckSurfaceWins -> the deck slice's focus, else the posted summary + the
  protocol-selection focused step; the detail key is ABSENT when there is no
  focused step, never `undefined` — exactOptionalPropertyTypes-safe).
  NO host-name comparison (V-8): host only indexes the YAML entry;
  endpoint/scope/ghost-wiring/surface all key off the entry's DATA and the
  published slices.
- app/src/shared/context/AiPanelContext.tsx — hosts the ONE SurfaceSliceStore
  instance (the spec's "AiPanelContext.tsx ONLY to host the store instance").
  The store is provided through its own SurfaceSliceStoreContext (separate
  context to avoid a SurfaceSliceStore <-> AiPanelContext import cycle).
- app/src/event-editor/deck/DeckChatSlice.tsx — the deck slice PUBLISHER.
  Reads useEventEditor() and publishes the deck slice bundle (the
  buildAcceptedEventGraphProjection + the deck fields the prompt builder
  reads + the ghost/adoption/deck-layout handler closures + the deck's
  working focus + editorMode 'deck' + the loaded eventGraphId scope).
  Defensive against sparse editor state (every state field the bundle reads
  is defaulted ?? {} / ?? [] / ?? null — the T-3 retarget pins mock
  useEventEditor with a minimal state). The handler closures are plain
  functions (never memoized) so they see the latest editor state when
  invoked. The deck slice is published by the CALL SITE (the deck door + the
  run door + the project page's deck branch), NOT by EventEditorProvider
  (which is generic — publishing there would leak the deck context onto the
  project page's non-deck tabs).

### Retargets (STEP 4) — the five T-3 pins (assertions unchanged)
- DeckSurfaceChat.test.tsx (parity): render <AiPanelProvider><DeckChatSlice/>
  <SurfaceChatBridge host="event-editor"/></AiPanelProvider> (the AiPanel
  wrap supplies the slice store; the assertions on the captured
  useSurfaceChat options' aiContext are unchanged).
- DeckSurfaceChat.ghost.test.tsx: <DeckSurfaceChat/> -> <DeckChatSlice/>
  <SurfaceChatBridge host="event-editor"/> inside the existing
  AiPanelProvider (the real useSurfaceChat + HarnessChatPane; the ghost
  mount + the pane Apply path are unchanged).
- DeckSurfaceChat.threadScope.test.tsx: the same swap at all three render
  sites (the wire seam: the real aiThreadClient composes x-cl-thread-scope
  from the collector's scope).
- DeckSurfaceChat.deckLayout.uifix1.test.tsx: the same swap (the real
  useSurfaceChat; the deck_layout done applies the delivered variant through
  the native editor action).
- RunSurfaceChatBridge.focus.test.tsx: <RunSurfaceChatBridge aiContext={..}/
  > -> <DeckChatSlice/> <SurfaceChatBridge host="run-workspace"
  base={{context: aiContext}}/> inside the existing ChatFocusProvider +
  ProtocolSelectionProvider (the working-focus assertions are unchanged:
  surface 'run-workspace', label contains the run id, the detail key ABSENT
  when no step is focused, 'Step N: label' when the rail focuses a step).

### Deletions (STEP 4)
- app/src/run/RunSurfaceChatBridge.tsx (git rm)
- app/src/event-editor/deck/DeckSurfaceChat.tsx (git rm)
  No non-test references remain (git grep across app/src is clean).

### Call-site fixes (STEP 4)
- RecordHostPage.tsx: <SurfaceChatBridge host="record-host"
  base={{context: aiContext, ...(recordId && !isCreate ? {scope: recordId}
  : {})}}/> (the edit-mode scope is preserved; the create-mode no-scope
  edge is unchanged).
- ArtifactHostPage.tsx: <SurfaceChatBridge host="artifact-host"
  base={{context: aiContext, scope: artifactId}}/>.
- RegistryHostPage.tsx: <SurfaceChatBridge host="registry-host"
  base={{context: aiContext}}/> (no scope — the registry door is
  scope-less by design; the pin asserts 'scope' in opts === false).
- DeckHostPage.tsx: <DeckChatSlice/> <SurfaceChatBridge
  host="event-editor"/> inside the existing ChatFocusProvider (the deck
  route's door).
- ProjectWorkspacePage.tsx: the page-level door (ProjectSurfaceChat) ->
  <SurfaceChatBridge host="project-deck-tab" base={{context: aiContext,
  scope: studyId}}/>; the deck-tab branch's <DeckSurfaceChat/> ->
  <DeckChatSlice/> (the page-level door is now the single registrar for
  the project host; the deck branch only publishes its slice). The
  stand-down (the deck tab's deck-local registrar) is retired — the
  project-deck-tab door is the deck door (the YAML's ghost_mount + the
  deck slice's endpoint/scope drive the deck thread store).
- RunWorkspacePage.tsx: <RunSurfaceChatBridge aiContext={aiContext}/> ->
  <DeckChatSlice/> <SurfaceChatBridge host="run-workspace"
  base={{context: aiContext}}/> (the run door: base carries the run
  surface/summary/mode + the runId; the deck slice contributes the
  endpoint/scope/handlers + the deck context patch + the selectedWells
  channel).

### Verification (partial — STEP 6 to follow)
- V-2 app typecheck: 11 errors total (the measured baseline), 0 new, 0
  gone. The baseline's 11 are unchanged (the taptab plugin error + the
  10 pre-existing src/ errors).
- V-8 (no host-name switch): grep across the four product files
  (collectSurfaceContext.ts, SurfaceChatBridge.tsx, SurfaceSliceStore.tsx,
  DeckChatSlice.tsx) for host === / host !== / switch (host) / case
  'run-workspace' / case 'event-editor' -> CLEAN (zero matches).
- Shrink-guard (own tree): "SHRINK-GUARD green (current sha=dcf32649
  ...; no blessed host dropped)" rc=0 (the sha is unchanged from the
  baseline).
- Self-check: "SELFCHECK: PASS" rc=0.
- Targeted test sweep (51 files: src/event-editor/deck/ + the run focus pin
  + src/shared/shell/ + src/shared/config/ + src/shared/context/ +
  src/shared/lib/): 50 passed, 1 failed (LabwareGlyph.test.tsx).
- LabwareGlyph.test.tsx is a PRE-EXISTING trunk failure (proven at the
  cl-integration-2 trunk tip, which carries NONE of my changes: same file,
  same 1-failed/38-passed outcome; the failure is "square-well plate
  renders grid of rects" — an SVG rendering assertion, unrelated to the
  chat-door surface). It is NOT in any file my diff touches.

## STEP 3+4 committed (product + retargets + deletions + call-sites)
