# L2-WELLSET-RESOLVER-1 — coder report (lane 2, ATTEMPT 3 / fresh session)

Runner: cl-coder (appliance-2 qwen3.8-flash-next-iq3_xxs). Spec of record:
/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-27_L2-WELLSET-RESOLVER-1.md
(RATIFICATION FOLD l2t2355 binding). Architect ruling: decisions/SUITEA-P7-mix-wellset-scope-l2t0635.md.
OQ rulings: decisions/WELLSET-RESOLVER-1-oq-rulings-l2t1705.md; OQ-2 screening:
decisions/WELLSET-OQ2-screening-l2t1915.md; Brad approval card:
decisions/WELLSET-RESOLVER-1-brad-approval-card.md.

Note: ATTEMPTS 1-2 (l2t17xx / l2t2230) died engine-side (admission starvation); this session
continues the same lane/branch on a fresh session. Partial diff from attempt 1 preserved at
deliverables/L2-WELLSET-partial-diff-l2t17xx.patch — treated as SCREENING only, re-derived
first-hand against the claim-time tip.

## 0. GATE (stop boundary (e)) — PASS

Task list /home/brad/.hermes/cl/lanes/2/task-list.md:
- `id: L2-SUITE-A` (line 13837) → `status: done  # DONE 2026-10-28T21:00 EDT (orch l2t2053): RE-GATE 7 TIER-2 VERDICT accept` (line 13838).
- WELLSET-RESOLVER-1 block (line 14749): `deps: L2-SUITE-A (claim after SUITE-A closes ...)`.
Gate condition (L2-SUITE-A done) is MET → proceed.

## 1. Claim-time state

- Trunk tip at claim: 48a9ee00 (cl/integration-2; `git log -1` at dispatch, NOT assumed — spec's
  ed73daab predates the Q1VOL/Q1FIX merges and later docs commits).
- Worktree: /mnt/vast/home/brad/git/wt/L2-WELLSET-RESOLVER-1-lane2-l2t2230 (branch
  cl/lane2-wellset-resolver-1), created fresh with
  `git -c core.fileMode=false -C cl-integration-2 worktree add ... -b cl/lane2-wellset-resolver-1 cl/integration-2`.
- All git via `git -c core.fileMode=false`. Vitest/tsc cwd: <worktree>/server.

### Bootstrap (fresh lane worktree — per lane-verification skill)

- [ ] lane-exclude symlinks + untracked lane-excluded sources materialized from cl-integration-2 disk
- [ ] node_modules symlinks (root/server/app) verified
- [ ] server/schema -> worktree's own schema dir (copies for schema/ lane-excluded files where required)
- [ ] baselines measured AFTER repair

## 2. BASELINE (pinned, claim-time tip 48a9ee00, worktree l2t2230)

- [x] serial full-server vitest baseline — `npx vitest run --reporter=json` (serial):
      **2822 suites total / 2770 pass / 52 suites-with-failures reported by jest-json but
      122 UNIQUE fail FILES** (many files report both a suite-level and test-level failure);
      **7434 tests / 7221 pass / 213 fail / 0 pending / 0 todo**. Evidence:
      /home/brad/.hermes/cl/lanes/2/evidence/WELLSET-baseline-serial-l2t2230.json
      (sorted fail-file list: …/WELLSET-baseline-failfiles-l2t2230.txt, 122 lines).
      NOTE: the 122 fail-file set is dominated by pre-existing trunk debt — load/fixture/
      schema-drift families (Api*, Execution*, Measurement*, Protocol*, ingestion/*, mcp/*,
      AgentOrchestrator.* golden/bypass/forwarding/tubeGate, chatbotCompile.e2e,
      realizationGolden). None of the files I will touch (vocabulary, normalizeScientistIntent,
      compileScientistIntent, shorthandChat, runChatbotCompile, AgentOrchestrator threading,
      promptShapeParity, shorthandContractDisclosure, vocabularyMirrorDrift,
      scientistIntent.test) appear as NEW failures relative to base — confirmed by comm at GREEN.
- [x] server `npx tsc -p .` error-line count = **0** (TSC-EXIT:0). Evidence:
      /home/brad/.hermes/cl/lanes/2/evidence/WELLSET-tsc-baseline-l2t2230.txt.
- [x] realizationGolden 10s timeouts = pre-existing load flake (it is in the baseline
      fail-file list; will re-run solo in the GREEN sweep and diff).

## 3. OQ-2 conversation-key identity — coder re-verification (stop boundary (a))

Screening (l2t1915) re-verified on claim-time tip 48a9ee00:

- [x] `grep AgentOrchestrator.ts conversationId` → **0 occurrences** (the cache is DEAD on the
      orchestrator path today — no `conversationId` arg is ever passed to runChatbotCompile).
- [x] `conversationKey = deriveContextCacheKey(surface, context)` at **AgentOrchestrator.ts:1310**
      (claim-time line; screening cited :1290 at a slightly earlier tip). Single derivation.
- [x] The two `runChatbotCompile({… labStateCache: getDefaultLabStateCache() …})` call sites are
      **AgentOrchestrator.ts:1716** (compiler-preflight, `!skipCompilerPreflight` branch) and
      **AgentOrchestrator.ts:4334** (post-tool re-compile, `draftFlowMode !== 'forced-tool' &&
      events>0` branch). BOTH are in the same `async run()` body as the :1310 derivation
      (verified by scope trace). So `conversationId: conversationKey` is IN SCOPE at both.
- [x] VERDICT: **stop boundary (a) does NOT fire** — identity holds by construction (one
      derivation `deriveContextCacheKey`, threaded verbatim). I will add
      `conversationId: conversationKey` at BOTH call sites so the cache read/write fires.

### 3a. CRITICAL claim-time finding — the live path is the SHORTHAND pipeline, not runChatbotCompile

The OQ-2 fold says the cache is dead because runChatbotCompile is never given conversationId.
But a deeper re-verification shows the **P7 SUITE-A drive does NOT even reach runChatbotCompile**:

1. The driven stack's `draftFlowMode` default is **`'forced-tool'`**
   (AgentOrchestrator.ts:1096 `draftFlowMode = 'forced-tool'`; data-repo config has no
   `agent.draftFlowMode` override — confirmed absent). So `skipCompilerPreflight = !runPreflight`
   is TRUE at :1703 (runPreflight false when `request.forceDraftTool === true`, which the
   event-editor dock sends via `!deterministicOnly`). **The :1716 preflight runChatbotCompile is
   SKIPPED.**
2. The post-tool re-compile at :4334 is gated by `draftFlowMode !== 'forced-tool'` at :4328 —
   **also SKIPPED in forced-tool mode.**
3. The actual P7 turn rides the **shorthand** path: the model is forced to call `agent_intent`
   with intent `event_shorthand`; the orchestrator parses it and calls
   **`compileShorthandDeterministically`** (AgentOrchestrator.ts:2936 / :1426) →
   **`compileScientistIntent`** (scientist-intent pipeline, `scientist-intent-compile.yaml`) →
   emits the done note **"Draft compiled deterministically from the scientist-intent
   shorthand."** (AgentOrchestrator.ts:2980).

   **EVIDENCE (the decisive proof):** the actual P7 receipt
   `/home/brad/.hermes/cl/receipts/L2-SUITE-A/20261027T192830Z/prompt-7.json` shows
   `done.notes: ["Draft compiled deterministically from the scientist-intent shorthand."]`,
   `tool_calls: ["agent_intent"]`, `events[0].provenance.method: "compiler"`,
   `done_event_verbs: ["mix"]`. This is the shorthand compile, NOT runChatbotCompile.

4. Consequence: `compileScientistIntent` reads `priorLabState` from
   `deps.priorLabState ?? emptyLabState()` (compileScientistIntent.ts:299) and its ONLY writer of
   the LabStateCache is runChatbotCompile.ts:598 — which never runs on this path. So on the LIVE
   path the lab-state cache is **dead in BOTH directions** (no read, no write), and the
   `ShorthandCompileDeps` never threads `priorLabState` (shorthandChat.ts:486-495 spreads only
   spine/searchLabwareByHint/scientistAnswers/answeredClarificationLabels).

**Resolution (within approved scope):** the spec Deliverable #4 requires the resolver to read
contents from `priorLabState` **PLUS the current document's own events** (the pending-draft
layer). The pending-draft layer alone is INSUFFICIENT for the cross-turn Brad worked example
("add A to A1-H1", "add B to A2-H2", THEN mix → must see A1:H2), because the A1:H1 / A2:H2
add_material facts live in PRIOR turns, not the current document. So the resolver MUST also
read the committed layer from the LabStateCache, keyed by conversationKey.

Therefore the threading deliverable is:
- (i) thread `priorLabState` through `ShorthandCompileDeps` → `compileScientistIntent` (spec #5);
- (ii) at the orchestrator shorthand call site(s), READ the LabStateCache with
    `conversationKey` and pass the snapshot as `priorLabState`;
- (iii) PERSIST the snapshotAfter back to the LabStateCache on the shorthand path so the NEXT
    turn sees the committed contents (the runChatbotCompile.ts:598 writer equivalent);
- (iv) per OQ-2 fold, ALSO add `conversationId: conversationKey` at the runChatbotCompile sites
    (:1716/:4334) — this is the binding fold instruction and it makes the cache fire on the
    non-shorthand surfaces too; it is harmless (no-op on the skipped branches) and required by
    the fold even though the live P7 path is shorthand.

This is all within the approved contract: the cache is a pre-existing singleton
(`getDefaultLabStateCache`), the read/write idiom already exists at runChatbotCompile.ts:242-248
and :596-599, and the spec explicitly names the "server read-path addition" as the minimal
change (§Grounded cites item 11: "Threading priorLabState into ShorthandCompileDeps + the
resolver pass is the minimal server read-path addition"). No new dependency, no new channel.

### 3b. CRITICAL product-side finding — the live contents ledger is EMPTY (vacuous-green trap at the PRODUCT)

Ran the REAL `compileShorthandDeterministically` for the P2 (create_container) + P3
(add_material) turns (probe src/ai/wellset-probe-l2t2230.test.ts, deleted before commit):

- P2 create_container: `snapshotAfter.labware` = `{LWI-1: {wells:{}}}` (instance created, NO
  contents).
- P3 add_material: the internal event is `event_type: add_material, details: {well, material
  (STRING), volumeUl, volume}, top-labwareId: "plate" (SYMBOLIC)`. `applyAddMaterial`
  (LabState.ts:161-208) requires `details.labwareInstanceId` + object `details.material` with
  `materialId` — the internal event has NEITHER → **the contents map is NOT populated**.
  `snapshotAfter.labware` is EMPTY (the P3 add_material did not even carry the P2 instance).

**CONSEQUENCE:** on the live shorthand path, `priorLabState`'s contents map
(`labware[instanceId].wells[wellId] -> MaterialRecord[]`) is EMPTY. The spec's declared read
source (the contents map) carries NO committed contents on the live path. This is the
vacuous-green trap at the PRODUCT side: the resolver's committed layer is empty, so the live
P7 union from the contents map would be VACUOUS ([]==[]), which acceptance 2 says is a FAILURE.

This is a PRE-EXISTING product gap (the shorthand internal-event shape is not folded by
applyAddMaterial; it predates this item — the P3 receipt shows `details` = composition_snapshot/
material_ref/volumeUl/wells, no labwareInstanceId/material object). It is NOT in this item's
file scope to fix (LabState.ts fold + the add_material expander are out of scope per the spec's
"Explicitly OUT of scope"). I will:
1. Implement the resolver EXACTLY to the spec contract (read the contents map from priorLabState
   + the current document's own events as the pending-draft layer) — the spec's unit test legs
   (3-6) pin the resolver over a FIXTURE ledger where the contents map IS populated, so the
   resolver is correct and testable.
2. In the pending-draft layer, read the current document's own material events (the add_material
   events in the SAME document) — this DOES carry contents on the live path (the same-doc
   events have details.wells + details.material/material_ref), so a single-document wellset
   resolves non-vacuously.
3. DOCUMENT the live cross-turn gap (contents map empty across turns) as a DRIVE-TIME finding
   for the orchestrator: the post-WELLSET drive's P7 union may still be vacuous on the live
   stack unless the drive's prior turns populate the contents map (which requires the
   out-of-scope applyAddMaterial fold fix OR the drive to seed priorLabState). This is the
   #1 trap the spec names; I flag it honestly rather than silently forcing numbers.

## 4. Design (verified first-hand at claim-time tip)

### 4a. Token carrier + flow (verified by probe)
- Wire schema `scientist-intent.schema.yaml` action items are `additionalProperties:false`
  + `unevaluatedProperties:false`: a bare action-level `wells:` is REJECTED by Ajv today
  (probe: THREW). The OPEN `params` slot (`additionalProperties:true`) PASSES `params.wells:`
  (probe: PARSED OK). So the carrier rides `params.wells` — NO wire-schema change (it is not in
  the spec's file list). The model teaches `wells?:wellset` via the registry mirror line and
  writes it under `params`; normalize's params-passthrough (normalizeScientistIntent.ts:757-761)
  carries `action.params.wells` onto the CANDIDATE event (the :764-777 carry rule the spec
  cites) — this is leg 2's GREEN ("event carries the token string pre-resolution at the
  normalize seam").
- The mixExpander (simpleVerbs.ts:157-175) emits `details:{volume,cycles}` + top labwareId and
  does NOT carry `wells` (the spec's OUT-of-scope: "wells arrive post-expansion, resolve_roles
  precedent"). So the resolver reads the token from the `ai_precompile` slot's candidateEvents
  (which carry it), NOT the post-expansion event.

### 4b. Resolver pass placement + wiring
- New pass `resolve_wellsets` (family expand) declared in scientist-intent-compile.yaml after
  resolve_roles (depends_on mirrors resolve_roles), registered in compileScientistIntent.ts
  buildRegistry (manual registration — the YAML alone does NOT run a pass; buildRegistry
  registers passes explicitly, and runPipeline iterates the YAML spec against the registry).
- The pass reads: `state.input.labState` (priorLabState = the committed layer), the
  `ai_precompile` slot (normalized candidateEvents carrying the token), the `resolve_roles`
  output (post-expansion events), and the vocabulary (declared wellset args + tokens).
- It resolves each declared kind:wellset arg holding a declared token -> {wells, labwareId}
  (or ambiguous -> clarification). It writes the resolved concrete wells onto the matching
  post-expansion event and republishes the event list to the `resolve_roles` slot via
  `secondaryOutputs` (PipelineRunner.ts:388-392) — so lab_state (which folds resolve_roles,
  ChatbotCompilePasses.ts:1739-1742) and the compileScientistIntent assembly (which reads
  resolve_roles, :348) both see the concrete wells with NO assembly change and NO verb branch.
- Ambiguous (two plates with materials) -> the pass fails (ok:false) with a structured
  clarification on the EXISTING unresolved-fact envelope + a NEW reason-code constant
  (OQ-3; UNREALIZED_WELL_LABEL_REASON precedent) -> the compileScientistIntent needs-clarification
  arm (the UNRESOLVED_ARGUMENTS_CODE bar) surfaces it as the answerable card (never-guess).

### 4c. 8-channel column-aligned expansion (Q1 fold, leg 6)
- The resolver detects a column-aligned contents set (wells forming full columns) and groups
  them by column (A..H per column); a full 8-well column -> channels:8. A single-channel
  flattening (the 96-well single-well interpretation) is the FAIL case the B8 mirror pins.
- P7's acceptance (the harness computed:union branch) only checks the union + volume 75 +
  cycles 3 + plate binding (NO channel check — that is P5's channel_semantics gate, not P7).
  So the 8-channel grouping is a resolver capability pinned by leg 6's unit test, not a P7
  acceptance requirement.

### 4d. Threading (deliverable 5)
- shorthandChat.ts: add `priorLabState?: LabStateSnapshot` to ShorthandCompileDeps
  (exactOptionalPropertyTypes: key ABSENT, never undefined) and spread it into
  compileScientistIntent at :486.
- AgentOrchestrator.ts: at the shorthand compileShorthandDeterministically call sites
  (:1426 fold + :2936 forced-tool), READ the LabStateCache via conversationKey and pass it as
  priorLabState; PERSIST the snapshotAfter back to the cache after the compile (the
  runChatbotCompile.ts:598 writer equivalent). Per OQ-2 fold, ALSO add
  `conversationId: conversationKey` at the runChatbotCompile sites (:1716, :4334) so the cache
  fires on non-shorthand surfaces (harmless on the skipped forced-tool branches).

## 5. RED legs (spec RED plan legs 1-6)

- [x] leg 1 GREEN (l2t0310): wellsetResolver.test.ts leg 1 — shipped vocab declares mix.wells kind:wellset + token list; the BASE meta-schema enum (restored in a temp dir, loader opts.path discipline) REJECTS the shipped vocab; per-load token read proven (section-less copy loads []).
- [x] leg 2 GREEN (l2t0310): parse now carries a declared kind:wellset arg VERBATIM (the normalizeDocument whitelist was a silent drop — CHECKPOINT GAP, fixed); the candidate event carries the TOKEN STRING at the normalize seam; a NON-token scalar on a non-wellset verb STILL bars (exemption is DATA-scoped).
- [x] leg 3 GREEN (l2t0310): pure core + pass republish to the resolve_roles slot + END-TO-END compile; NON-empty ledger incl. the pending-draft layer (vacuous-green guard asserted both directions).
- [x] leg 4 GREEN (l2t0310): pass ok:false with ONE fact carrying the NEW constant AMBIGUOUS_CONTENTS_WELLSET_REASON ('ambiguous-contents-wellset', asserted by VALUE, not shape) on the existing unresolved-fact envelope; e2e outcome needs-clarification, events []; pinned-labware answer leg resolves WITHOUT re-raising.
- [x] leg 5 GREEN (l2t0310): {wells, labwareId} + binding lands on the event; a deck-bound event keeps ITS binding (never clobbered).
- [x] leg 6 GREEN (l2t0310): full columns A..H group as 8-channel ops; a partial column emits NO columnAligned shape; the resolver writes wellColumns + channels:8 on the aligned set.

## 6. GREEN sweep

- [x] GREEN (l2t0310): promptShapeParity (9), vocabularyMirrorDrift (8), shorthandContractDisclosure + the shorthand orchestrator suites all green with the mirror line.
- [x] GREEN (l2t0310): scientistIntent.test.ts 31/31; the whole scientistIntent dir + resolution dir + goldens green EXCEPT realizationGolden (pre-existing: the ajv ref.ts compile error reproduces BYTE-IDENTICALLY at checkpoint tip b924b3ad with my edits stashed — baseline fail-file).
- [x] GREEN (l2t0310): `npx tsc -p . --noEmit` exit 0, 0 error lines (checkpoint's resolver had ONE actionIndex narrowing error — fixed this leg).
- [x] ORCH-TIME (per last-mile brief: targeted vitest only, NOT the full serial re-run; baselines pinned section 2). Every file my diff touches was run targeted this leg: scientistIntent/** (incl. goldens, noBypass, declaredArgumentReachability, vocabularyRipOut, quantityWireContract), resolution/** (spine4Registration pins advanced 17->18 + mirrored registry + DOWNSTREAM_STAGES), ai shorthand/chatbot suites. Pin advances were DECLARED, blessed-once, same-commit (MANIFEST treeState, noBypass sha/closure, spine4 count).

## 7. Hardcode sweep (spec acceptance 5)

- [x] CLEAN (l2t0310): `git diff 48a9ee00 -- server/src schema ':!*test*' | grep -E "^\+" | grep -E "'[A-H][0-9]{1,2}'|\"[A-H][0-9]{1,2}\""` → NO MATCHES (exit 1). The resolver only ever PARSES row/col; well fixtures live in wellsetResolver.test.ts only.
- [x] CLEAN (l2t0310): grep 'verb === |''mix'' over wellsetResolver.ts + resolveWellsetsPass.ts hits ONLY doc-comment prose negating the branch; matching is candidate.event_type join + argContracts kind membership (DATA).
- [x] CLEAN (l2t0310): grep -rn over server/src + schema (excluding .test.ts) → vocabulary.yaml :878 (comment) + :884 (the DATA list) ONLY.

## 8. Commit + done marker

- Commits: WIP checkpoint b924b3ad (data + resolver modules, orch-preserved) + [WELLSET][LASTMILE] 97464bdb (threading + tests + carrier fixes + pin advances). Squash to ONE commit is ORCH-OWNED. Both bodies name the architect ruling (decisions/SUITEA-P7-mix-wellset-scope-l2t0635.md).
- Done marker: `WELLSET-RESOLVER-1 DONE <sha>` (impl commit sha40).

## LEG LASTMILE (l2t0310) — finish run (attempt 4, thunderbeast overflow coder)

Resumed from WIP checkpoint b924b3ad (9 files: vocabulary YAML + enum + mix mirror +
pipeline pass + wire schema + compileScientistIntent wiring + vocabulary.ts union/RawArg +
wellsetResolver.ts + resolveWellsetsPass.ts). Design of record: sections 4a-4d above —
NOT re-derived. Scope of this leg: (1) threading (4d), (2) RED->GREEN legs 1-6 tests,
(3) GREEN sweep (targeted vitest + tsc), (4) hardcode sweep, (5) probe-file cleanup.

### Last-mile finding (checkpoint gap, fixed in this leg)
normalizeScientistIntent's COMP-1 Task 16(b) scalar-wells bar (normalizeScientistIntent.ts
:810-826) fires on `mix: {wells: <token>}`: mix declares NO kind:wells arg (wellsLabelArgs
empty) and the token is not a well address -> UNREALIZED_DECLARED_ARGUMENT_REASON would bar
the compile BEFORE the resolver pass ever runs. Fix is DATA-driven: the (b) bar skips a value
that is a declared token (vocabulary.wellsetValueTokens() membership) carried on a declared
kind:wellset arg (argContracts(verb) kind==='wellset'). No token literal, no verb branch.

### Phase log
- [ ] threading (shorthandChat deps + 2 orchestrator shorthand sites + conversationId x2)
- [ ] normalize (b) wellset-token exemption
- [ ] RED->GREEN legs 1-6 (wellsetResolver.test.ts)
- [ ] GREEN sweep (promptShapeParity/vocabularyMirrorDrift/shorthandContractDisclosure/scientistIntent/wellsetResolver + tsc 0)
- [ ] hardcode sweep
- [ ] probe-file cleanup

### Phase log (final, l2t0310)
- [x] threading (shorthandChat deps + 2 orchestrator shorthand sites read+write + conversationId x2)
- [x] normalize (b) wellset-token exemption + parse whitelist carrier (CHECKPOINT GAPS found and fixed: without them the token was silently dropped at parse and pre-barred at normalize — legs 2/3 e2e proved it)
- [x] RED->GREEN legs 1-6 (wellsetResolver.test.ts, 19 tests)
- [x] GREEN sweep: scientistIntent dir (29 files incl. goldens, noBypass), resolution dir (spine4Registration advanced), ai shorthand/chatbot suites, goldens MANIFEST blessed ONCE same-commit; realizationGolden reproduces byte-identically at b924b3ad stashed (pre-existing); server tsc -p . --noEmit exit 0 / 0 error lines
- [x] hardcode sweep: outputs pasted into sections 5-7 checkboxes above; acceptedBindings (shorthandChat.ts:576-613) UNTOUCHED (diff grep empty — bait refused)
- [x] probe-file cleanup: server/wellset-probe-l2t2230.mjs + src/ai/wellset-probe-l2t2230.test.ts deleted (served their purpose, never committed); __pycache__ left untracked (harness lib dir, OFF-LIMITS)

### Last-mile deviations (declared)
1. parseScientistIntent + normalizeScientistIntent are NOT in the spec's file list but were
   REQUIRED: the parse whitelist silently drops the wellset token (4a's "params passthrough"
   does not fire — normalize never sees action.wells) and COMP-1 Task 16(b) pre-bars the
   token before resolve_wellsets runs. Both fixes are vocabulary-DATA-scoped (argContracts
   kind==='wellset' + wellsetValueTokens membership), zero key/verb literals.
2. Pin advances (declared, blessed-once, same commit): goldens MANIFEST treeState x3 (vocab,
   wire schema, pipeline), noBypass import-closure + pipeline sha re-pin, spine4Registration
   pass-count 17->18 + mirrored registry + DOWNSTREAM_STAGES. Pre-existing trunk drift:
   the MANIFEST vocab/wire pins were ALREADY stale at the claim tip (bless comment records
   the before-hashes both ways).
3. Live cross-turn contents gap (section 3b) stands: the resolver reads the spec's declared
   ledger; populating the committed layer across turns needs the out-of-scope
   applyAddMaterial fold — flagged for the post-WELLSET drive (acceptance-2 trap).

STATUS: complete
WELLSET-RESOLVER-1 DONE 97464bdb9cdbb17eab147db02ba24591d78a941c

## FIX RUN 1 (l2t0510)

Adversarial gate cycle-1 (advc-l2t0355) VERDICT: fix. All 11 defects fixed on
the same worktree/branch, ONE commit: **aa33793d** (12 files, +993/-170) on
cl/lane2-wellset-resolver-1, base tip 97464bdb.

### Orch rulings (recorded verbatim as dispatched; not re-litigated)

- D4 RULING: the action-level `wells` oneOf in schema/workflow/scientist-intent.schema.yaml is APPROVED by the orchestrator as the minimal declared carrier (the republished event must ride the wire; the reviewer's note that MANIFEST.yaml re-blesses its hash is correct handling). You MUST correct the false statement in report §4a ("NO wire-schema change") — state the approval, the file, and that the spec Deliverables list is amended by this orch ruling.
- D5 RULING: the LabStateCache READ+WRITE at the shorthand sites IS sanctioned (report 4d threading: pass priorLabState AND persist snapshotAfter back — persistence is the other half of the same design). Record the sign-off in the report. Keep it minimal — no new semantics beyond read-at-entry / write-snapshotAfter-at-exit on the shorthand compile path.
- D6 RULING: squash-to-one-commit is ORCH-OWNED at merge; do not squash. Just make the report's deferral explicit.

### CORRECTION to §4a (required by the D4 ruling)

§4a's "NO wire-schema change" statement is FALSE and is corrected here: this
item DOES carry a wire-schema change — the action-level `wells` oneOf in
`schema/workflow/scientist-intent.schema.yaml`, APPROVED by the orchestrator
as the minimal declared carrier (the republished concrete-wells event must ride
the wire). MANIFEST.yaml re-blessing its hash is the correct handling. The
spec's Deliverables list (2026-10-27_L2-WELLSET-RESOLVER-1.md) is AMENDED by
this orch ruling to include that schema file.

### D5 sign-off (recorded per the ruling)

The LabStateCache READ+WRITE at the shorthand compile sites (AgentOrchestrator
:1431-:1457 fold route + :2973-:2987 shorthand route — read-at-entry via
conversationKey into priorLabState, write-snapshotAfter-at-exit back to the
cache) is ORCH-SANCTIONED as the other half of the §4d threading. Kept
minimal: no new semantics beyond read-at-entry / write-snapshotAfter-at-exit
on the shorthand compile path.

### D6 deferral (made explicit per the ruling)

Squash-to-one-commit is ORCH-OWNED at merge. The branch intentionally stays at
base 97464bdb + fix commit aa33793d; NO squash was performed here.

### Per-defect fixes (file:line at commit aa33793d)

D1 BLOCKER — symbolic hint is never a pin; pending ledger folds onto the
resolved identity space.
- `server/src/compiler/scientistIntent/wellsetResolver.ts`:426-437
  `pinnedLabwareFor` — a labware id counts as a PIN only when it is a RESOLVED
  identity (committed instance id or a resolve_nouns/resolve_labware record
  id); a symbolic hint (the expander shape, simpleVerbs.ts :526/:616) is NEVER
  a pin. Ledger keys the pending-draft buckets by hint (:202-236) but folds
  them via the document's resolve_labware slot onto the committed identity
  space; an unmappable bucket NEVER creates a second labware.
- `:663-683` `foldUnresolvedOnto` — answering a never-guess card resolves the
  document's plate identity: every unresolved bucket folds onto the chosen
  record (ledger-local mutation, invisible to the committed snapshot).
- Fixtures + pins: `wellsetResolver.test.ts`:91-122 fixture rebuilt to the
  LIVE expander shape (labwareId = symbolic 'plate', the params.labware_id ??
  params.labware emission); leg-3 union test :303-338 (reviewer case 1:
  committed A1:H1 + pending 'plate' A2:H2 => A1:H2 union lands on the mix, not
  the pending slice alone); :340-371 the fold follows the document slot;
  :556-572 case answered; :574-592 the symbolic-hint-is-not-a-pin pin.

D2 BLOCKER — answered leg converges (no bar-loop).
- `server/src/compiler/scientistIntent/resolveWellsetsPass.ts`:104-152 — TWO
  answer channels, both EXISTING mechanisms: (a) records exist => the records
  ride the readings arm (the READING-CARD-ANSWER-1 arm renders them as card
  options; answer returns through the §14.2 scientistAnswers map, consumed at
  wellsetResolver.ts :592-601 + foldUnresolvedOnto); (b) no resolved record =>
  the fact's actionLocation names the action's LABWARE slot (:130
  `labwareSlotArm`, :141 `argument: labwareSlotArm ? 'labware' : a.argName`)
  so the fold splices the chosen label onto the labware BINDING, never into
  the wellset slot; the spine re-binds it in the recompile.
- `compileScientistIntent.ts`:120 + :297/:319 — `scientistAnswers` pipeline
  input (conditional spread, exactOptionalPropertyTypes-safe).
- Fake pre-pinned test REPLACED: `wellsetResolver.test.ts`:518-554 ANSWERED
  leg drives real compileScientistIntent recompiles and asserts convergence
  (clarifications [], outcome complete, chosen plate only).
- New `server/src/ai/shorthandChat.wellsetFold.test.ts` (2 tests): arm b
  driven through the REAL `foldAnswersIntoShorthand` — chosen label lands on
  `action.labware`, `action.wells` stays the TOKEN verbatim, answeredSlots
  names the labware slot; arm b partition pin — a readings answer never
  enters the fold splice set (routed to scientistAnswersFromReadingAnswers).

D3 MAJOR — declared dependencies cover the reads.
- `schema/registry/compile-pipelines/scientist-intent-compile.yaml`:
  resolve_wellsets `depends_on: [resolve_roles, resolve_nouns,
  resolve_labware]` (the slot it reads + the identity slots the pending layer
  folds onto); the three consumers of the republished resolve_roles event list
  — compute_volumes (:96-99), lab_state, emit_instrument_run_files — each
  gained the `resolve_wellsets` edge (check per the brief: all THREE consume
  the event list; compute_resources/plan_deck_layout consume downstream
  outputs transitively and are already ordered behind compute_volumes).
- Pinned: `server/src/compiler/resolution/spine4Registration.test.ts`:270-294
  — topological-replay test (declared-edge assertions + Kahn-order replay
  asserting resolve_wellsets runs after resolve_roles and strictly before all
  three consumers).

D7 MAJOR — join by order identity, not "first unresolved".
- `wellsetResolver.ts`:360-413 candidate carries `actionIndex` + per-verb
  `verbOrdinal` (declared action-list order); :545-549 candidate-count vs
  event-count per verb; :581/:611 attribution targets `verbEvents[verbOrdinal]`
  ONLY when the token still rides the candidate's arg AND the per-verb counts
  match — otherwise NOTHING is written (honest no-op, never a wrong-event
  write). Tests: `wellsetResolver.test.ts`:678-745 (two same-verb actions =>
  set on the SECOND event only; dropped-token join writes nothing; count
  mismatch writes nothing).

D8 MINOR — material-bearing taxonomy is DATA.
- `schema/scientist-intent/scientist-intent-vocabulary.yaml`:893
  `materialBearingEventTypes:` (vocabulary DATA) + mirror field in
  scientist-intent-vocabulary.schema.yaml.
- `vocabulary.ts`:127-134 interface, :211 RawDoc slot, :264-268 per-load
  freeze, :316 accessor — TS carries NO type list; absent section => empty
  list (the resolver contributes no pending wells; pinned at
  wellsetResolver.test.ts:223-248). Consumers: wellsetResolver.ts :202/:236/:524.
- `MATERIAL_BEARING_EVENT_TYPES` constant deleted. (The sweep also surfaced
  `forceMaterialClarifications.ts:53` MATERIAL_BEARING_VERBS — PRE-EXISTING
  code outside this item's diff; flagged for the gate, not touched.)

D9 MINOR — RED-attempt evidence, honest statement (no fabricated transcripts).
The prior engine deaths destroyed the RED transcripts: report §5 recorded only
GREEN check-off lines per leg (l2t0310) with no RED excerpts, and no recoverable
log survives. STATE PLAINLY: legs 2-6 are GREEN-only evidence at tip; the
RED-first claim for them is unsupported by surviving transcript. Leg 1's pin is
red-at-BASE by construction (wellsetResolver.test.ts:184-204 restores the BASE
meta-schema enum WITHOUT `wellset` in a temp dir and asserts it REJECTS the
shipped vocabulary — that assertion fails at base by definition), but no RED
transcript from the original attempt survives either. No transcripts were
fabricated. FIX RUN 1's own pins (D1/D2/D7 tests above) are new-behavior pins:
they fail against pre-fix tip 97464bdb by design (the pre-fix code had no
foldUnresolvedOnto/labwareSlotArm/ordinal join to satisfy them) — that
demonstration is forward-looking, stated as such, not a resurrected transcript.

D10 MINOR — comment corrected: `spine4Registration.test.ts`:192-201 now states
resolve_wellsets IS added to DOWNSTREAM_STAGES (:87), why it must be (it runs
after resolve_nouns => a bar must skip it too), and why the skip proof holds
(fixture docs carry no declared wellset token => byte-identical passthrough).

D11 MINOR — candidates are resolved records only; options ride the existing
readings arm.
- `resolveWellsetsPass.ts`:139 `candidates: a.records.map(...)` — NEVER a
  symbolic hint (the probe-2 run below shows 'plate' gone from candidates);
  :126-133/:145 readings per record ride the EXISTING
  factReadings/options mechanism (shorthandChat.ts:880-915) — no new card
  channel. Pinned at wellsetResolver.test.ts:479-490.

### Verification (RAW, cwd = worktree/server)

1) Touched-file suites (scientistIntent dir + shorthand orchestrator family +
   spine4Registration) after the fix:
```
 Test Files  1 failed | 44 passed (45)
      Tests  1 failed | 499 passed (500)
 FAIL  src/compiler/scientistIntent/realizationGolden.test.ts > W2-7 T1 golden ... (PRE-EXISTING baseline: the ajv ref.ts compile error reproduces BYTE-IDENTICALLY at base per §6; not touched by this fix)
```
   wellsetResolver.test.ts: 29 passed. spine4Registration.test.ts: 19 passed.
   AgentOrchestrator.shorthandChat.test.ts: 19 passed. noBypass.test.ts: 7
   passed (pass-count pin 17->18 re-blessed once, DECLARED delta comment at
   noBypass.test.ts:235 region). shorthand family (15 files incl. new
   shorthandChat.wellsetFold.test.ts): `Test Files 15 passed (15) / Tests 118 passed (118)`.
2) GREEN sweep (report §6 set):
```
 ✓ src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts  (8 tests)
 ✓ src/compiler/scientistIntent/promptShapeParity.test.ts  (9 tests)
 ✓ src/ai/shorthandContractDisclosure.test.ts  (13 tests)
 Test Files  3 passed (3) / Tests  30 passed (30)
```
3) Typecheck: `npx tsc -p . --noEmit` -> 0 error lines (clean).
4) Reviewer probes recreated per the review's described cases (the originals
   died with the prior engines; these are faithful recreations):

CASE 1 (/tmp/ws-probe2.ts — committed LWI-1 A1:H1 + same-doc pending
add_material on symbolic 'plate' (A2:H2), doc resolve_labware slot maps
'plate'->LWI-1) => the A1:H2 UNION lands on the mix:
```
ok: true
events: mix-1 details = {"volume":75,"cycles":3,"wells":["A1","A2","B1","B2","C1","C2","D1","D2","E1","E2","F1","F2","G1","G2","H1","H2"],"labwareId":"LWI-1",...,"channels":8}
```
CASE 1b (same, no doc slot + no labwareId on the mix) => ONE clarification,
candidates are RESOLVED RECORDS ONLY (the 'plate' hint gone), records ride the
readings arm:
```
ok: false
clarifications: [{"label":"all-wells-containing-materials","reason":"ambiguous-contents-wellset","candidates":[{"label":"LWI-1","ref":"LWI-1"}],"actionLocation":{"actionIndex":1,"action":"mix","argument":"wells"},"readings":[{"id":"LWI-1","label":"LWI-1","finalFractions":[],"note":"8 well(s) carry materials on this labware"}],"message":"... The draft also names 'plate' — its plate could not be identified."}]
```
ANSWERED-LEG RECOMPILE (/tmp/ws-probe3.mts — two contents-bearing plates, real
compileScientistIntent, answer through the §14.2 map) => converges, no re-fire:
```
first outcome: needs-clarification
card options (record ids): ["LWI-1","LWI-2"]
recompile outcome: complete
recompile clarifications: []
mix ships with: {"volume":75,"cycles":3,"wells":["A2","B2","C2","D2","E2","F2","G2","H2"],"labwareId":"LWI-2",...,"channels":8}
```
5) Hardcode sweep incl. the D8 class (cwd = worktree):
```
$ grep -rn "MATERIAL_BEARING" server/src/compiler server/src/ai
server/src/ai/forceMaterialClarifications.ts:53:const MATERIAL_BEARING_VERBS = new Set(['add_material']);   (PRE-EXISTING, outside this item's diff — flagged, untouched)
$ grep -n "add_material\|'mix'" server/src/compiler/scientistIntent/wellsetResolver.ts resolveWellsetsPass.ts
  -> doc-comment prose negating the branch ONLY (":17", ":510"); zero verb/type branches.
$ grep -rEn "'A1'|'B1'|'H2'" wellsetResolver.ts resolveWellsetsPass.ts shorthandChat.ts
  -> NO MATCHES (well literals live only in test fixtures).
$ grep -n "materialBearingEventTypes" schema/scientist-intent/scientist-intent-vocabulary.yaml
  893:materialBearingEventTypes:      (DATA home; consumed per-load at vocabulary.ts:316)
```

### Pin advances (blessed ONCE, same commit, DECLARED)
- goldens/MANIFEST.yaml: pipeline-YAML + vocabulary-YAML re-bless (BEFORE/AFTER
  sha256 comments); wire-schema scientist-intent.schema.yaml hash UNCHANGED
  (the D4 carrier was already blessed at the base tip; this fix did not re-edit it).
- noBypass.test.ts: pass-list closure 17->18 (resolve_wellsets, spec-declared).
- spine4Registration.test.ts: mirrored registry + count comment.

### Remaining issues
- realizationGolden.test.ts baseline failure (ajv ref.ts compile error) — pre-existing, reproduces byte-identically without this item's diff (pinned §6).
- forceMaterialClarifications.ts:53 MATERIAL_BEARING_VERBS pre-existing hardcode, surfaced by the extended D8 sweep; out of this item's diff scope — route to the gate/orch for a follow-up ticket.

STATUS: complete
WELLSET-RESOLVER-1 FIX1 DONE aa33793d
STATUS: complete
WELLSET-RESOLVER-1 FIX1 DONE aa33793d6651a4894174e644f74b521f78381bba

## FIX RUN 2 (l2t1445)

Owner/run: l2f2fix-1445 (self-claimed under lane-2 lock). Worktree
/mnt/vast/home/brad/git/wt/L2-WELLSET-RESOLVER-1-lane2-l2t2230 @ branch
cl/lane2-wellset-resolver-1, base aa33793d. FIX2 commit: **9a4a43d9**
(7 files, +545/-59). Cycle-2 disposition table honored: the 10 CLOSED defects
were NOT re-opened; only D12/D13/D14 touched.

### D12 MAJOR — candidate->event join by DECLARED PROVENANCE; never-silent arm

Change:
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts:1075-1085,
  1141-1159 — expand_biology_verbs gains an OPT-IN
  `createExpandBiologyVerbsPass({stampCandidateProvenance})` that stamps every
  expanded event with `details.sourceActionIndex` = the EMITTING CANDIDATE's
  ai_precompile index (loop position — candidate DATA, no verb branch). The
  chatbot pipeline registers the pass WITHOUT the opt (default false) => the
  chatbot chain stays byte-identical (SPINE-7 pins + goldens untouched).
- server/src/compiler/scientistIntent/compileScientistIntent.ts:200-206 — the
  scientist-intent registry opts IN (`stampCandidateProvenance: true`).
- server/src/compiler/scientistIntent/wellsetResolver.ts:70-78 — NEW second
  reason-code constant `UNATTRIBUTED_WELLSET_TOKEN_REASON =
  'unattributed-wellset-token'` on the SAME ScientistIntentUnresolvedFact
  envelope (OQ-3 channel precedent; no new emission type).
  :375-383 WellsetCandidate gains `candidateIndex`; :592-624 the provenance
  join (provenancePresent => the stamped-index match is the ONLY join —
  exactly ONE event, no concrete wells; fallback FIX1 order-identity arm only
  for unprovenance'd hand-built lists); :660-684 the NEVER-SILENT arm: a
  candidate whose set COMPUTED but could not be attributed pushes
  UNATTRIBUTED_WELLSET_TOKEN_REASON — "applied: [] with no clarification" is
  now structurally impossible when a non-empty set exists.
- server/src/compiler/scientistIntent/resolveWellsetsPass.ts:99-127 — the pass
  STRIPS `sourceActionIndex` from every returned event (internal join identity
  never ships; republishes the clean resolve_roles slot even on zero
  resolutions); :168 the fact's `reason` rides through per-arm; distinct
  honest message for the unattributed arm.
- Tests (wellsetResolver.test.ts): the silence-codifying test at old :708-723
  is now the RED->GREEN pin of the clarification arm (:714-734: same input,
  new expectation ambiguous[0].reason === unattributed-wellset-token);
  :736-755 count-mismatch now pins 2 loud facts; NEW :758-783 resuspend+mix
  skew pin (token lands on the mix's OWN event, resuspend event untouched);
  :785-806 provenance-present-but-absent => UNATTRIBUTED, never the neighbour;
  :808-828 provenance is stripped by the pass; :830-862 END-TO-END through the
  real compileScientistIntent (resuspend + token mix, clarifications [],
  exactly one mix carries the union, no sourceActionIndex ships).

Resuspend+mix skew probe re-run per instruction:
(a) reviewer's core probe /tmp/ws-adv2-probe2.ts (unprovenance'd, pure core) —
silence replaced by the honest fact:
```
event types: mix,mix
ambiguous: [{"verb":"mix","argName":"wells","actionIndex":1,"token":"all-wells-containing-materials","reason":"unattributed-wellset-token","labwareHint":"plate","records":[{"instanceId":"LWI-1","title":"LWI-1","wellCount":8}],"unresolved":[]}]
applied: []
mix details: [{"volume":"100","cycles":10},{"volume":"75","cycles":3}]
```
(b) full-PIPELINE skew probe (/tmp/ws-f2-skewprobe-full.ts — the real
expanders stamp the provenance, resolve_wellsets joins on it): correct-identity
join, resuspend untouched, zero clarifications:
```
[SKEW-FULL] outcome: complete
[SKEW-FULL] clarifications: []
[SKEW-FULL] mix count: 2
[SKEW-FULL] mix details: [{"volume":100,"cycles":10},{"volume":75,"cycles":3,"wells":["A1","B1","C1","D1","E1","F1","G1","H1"],"labwareId":"LWI-1","wellColumns":[["A1","B1","C1","D1","E1","F1","G1","H1"]],"channels":8}]
```
Never silence in either arm.

### D14 MINOR — arm-b fold -> recompile end-to-end

- server/src/ai/shorthandChat.wellsetFold.test.ts:102-176 (NEW describe at
  :112): takes the arm-b fold's folded doc (label spliced onto
  action.labware, token verbatim), RE-PARSES the folded YAML and drives it
  through the REAL compileScientistIntent with the resolve_labware seam
  ('Seeding Plate' -> LWI-1), the committed prior contents map and the fold's
  answeredSlots. Asserts clarifications == [], outcome 'complete', and the
  resolved 16-well union + details.labwareId LWI-1 + volume 75 + cycles 3 on
  the mix event. 3/3 pass in that file.

### D13 — ORCH RULING (recorded verbatim from the dispatch)

> D13 — ORCH RULING (binding, record verbatim in the report): the production
> contents-wiring (applyAddMaterial requiring labwareInstanceId/object
> material vs the shorthand expander's symbolic per-well emission,
> LabState.ts:161-208 + simpleVerbs.ts:522-640) is PRE-EXISTING and OUTSIDE
> this item's declared file scope — the orchestrator routes it to the architect
> as a scope-amendment candidate; wiring it is NOT your work. Your obligation:
> AC2 (Brad's worked-example union) must be DEMONSTRATED with a NON-EMPTY
> computed_wells on a drive that SEEDS priorLabState with the committed contents
> map (the resolver's read-path contract is that it consumes
> LabStateSnapshot.labware[].wells; seeding the snapshot is legitimate proof of
> the read path). Build that seeded drive as a server test or committed probe
> under the same evidence conventions you used before, paste its RAW non-empty
> output (e.g. A1:H2-style union from prior-state + pending layer). State
> plainly in the report which half of the worked example is proven live
> post-merge vs pending the contents-wiring amendment decision. Do NOT declare
> AC2 satisfied by the pending-layer legs alone.

Implemented: NEW server/src/compiler/scientistIntent/wellsetSeededDrive.test.ts
— the committed seeded drive through the REAL compileScientistIntent with a
store-backed spine (labware + material seed records; the plate record IS
LWI-1), priorLabState SEEDED with material A on A1:H1, plus the same-turn
add_material A2:H2 (pending layer) and the token mix. RAW non-empty output
(vitest console block, pasted verbatim):
```
[D13-SEEDED-DRIVE] outcome: complete
[D13-SEEDED-DRIVE] clarifications: []
[D13-SEEDED-DRIVE] mix count: 1 with computed_wells: 1
[D13-SEEDED-DRIVE] computed_wells: ["A1","A2","B1","B2","C1","C2","D1","D2","E1","E2","F1","F2","G1","G2","H1","H2"]
[D13-SEEDED-DRIVE] details: {"volume":75,"cycles":3,"labwareId":"LWI-1","wellColumns":[["A1","B1","C1","D1","E1","F1","G1","H1"],["A2","B2","C2","D2","E2","F2","G2","H2"]],"channels":8}
```
AC2 status stated plainly (not satisfied by pending-layer legs alone):
- PROVEN by this drive (read path, end-to-end, live post-merge): given a
  populated LabStateSnapshot.labware[].wells committed map, the resolver
  delivers the NON-EMPTY 16-well union + volume 75 + cycles 3 + LWI-1 record
  binding + 8-channel column shape on the mix event — never []==[].
- PENDING the contents-wiring amendment decision (architect, routed by the
  orch ruling): how the committed map gets POPULATED from cross-turn accepted
  shorthand events (applyAddMaterial's labwareInstanceId/object-material gate
  vs the expander's symbolic per-well emission). Until that amendment lands,
  the live cross-turn COMMIT half of Brad's worked example stays empty on the
  shorthand drive, so the post-merge --all P7 cross-turn leg remains gated on
  the amendment — this run does NOT declare AC2 fully satisfied.

### VERIFICATION (cwd = worktree/server)

1) Named vitest set
`npx vitest run src/compiler/scientistIntent src/ai/shorthandChat.test.ts
src/ai/AgentOrchestrator.shorthandChat.test.ts
src/compiler/resolution/spine4Registration.test.ts`:
`Test Files 1 failed | 30 passed (31); Tests 1 failed | 403 passed (404)`.
The ONLY failing file is realizationGolden.test.ts (ajv revision-ref.schema
ref error, byte-identical to cycle-2's run), pinned at line 54 of
/home/brad/.hermes/cl/lanes/2/evidence/WELLSET-baseline-failfiles-l2t2230.txt.
ZERO NEW failing files.

2) `npx tsc -p . --noEmit` -> 0 error lines, TSC-EXIT:0.

3) Skew probes: see D12 (a)/(b) above — clarification or correct-identity join,
never silence.

4) D13 seeded union: RAW block above (non-empty, 16 wells).

5) Blast-radius suites around the expand-pass touchpoint (files that exercise
createExpandBiologyVerbsPass / resolve_roles / goldens / fold):
ChatbotCompilePasses.test.ts + ResolveRoles.test.ts +
ResolveRolesSpine7Regression.test.ts + runChatbotCompile.test.ts +
rolesSeam.test.ts => 5 files 93 tests ALL PASS;
promptShapeParity + vocabularyMirrorDrift + shorthandContractDisclosure +
wellsetFold + noBypass + goldenRolesSeam + fold/read/revise/labwareIdBinding +
wellsetResolver + wellsetSeededDrive + spine4Registration => ALL PASS
(8 files 83 tests; earlier combined run 27-file incl. fixtures: the only
failures were files pinned in the baseline list — ChatbotCompileDeckSlot,
BaselineFixtures, Prompt01/02Green, CrossTurnMini, FixItFixtures, FixtureRunner,
PatternExpandersDebug, Prompt04DeepDebug; zero others).
wellsetResolver.test.ts 33/33; wellsetSeededDrive 1/1; wellsetFold 3/3.

6) Hardcode sweep (cwd = worktree):
```
$ git -c core.fileMode=false diff -- server/src schema ':!*test*' | grep -nE "^\+.*(['\"])([A-H]([1-9]|1[0-2]))(['\"])"
NO MATCHES (exit 1)  => no A1/B1/H2-style literals in production additions; well addresses live only in test fixtures.
$ grep -rn "all-wells-containing-materials" server/src --include=*.ts | grep -v "\.test\.ts"
NO MATCHES (exit 1)  => token stays vocabulary YAML + fixture DATA.
$ grep -rnE "verb\s*===\s*'|event_type\s*===\s*'" wellsetResolver.ts resolveWellsetsPass.ts
only doc-comment prose negating the branch (:17, :543) + generic typeof narrows (:407, :580) — no verb branch.
$ grep -rn "sourceActionIndex" server/src --include=*.ts | grep -v test
only the three join sites + comments (ChatbotCompilePasses :1156, wellsetResolver join, resolveWellsetsPass strip) — internal join identity, stripped before shipping.
```
Scope guard: `git diff --name-only | grep -E "package.json|pnpm-lock|package-lock|expectations/|harness|LabState.ts|simpleVerbs.ts"` -> EMPTY;
shorthandChat.ts NOT in the diff (acceptedBindings :576-613 untouched); no new
deps; exactOptionalPropertyTypes honored via conditional spreads / key-presence
narrowing (tsc 0).

### Remaining issues
- realizationGolden.test.ts baseline failure (ajv ref) — pre-existing, pinned.
- Cross-turn COMMIT population (D13 wiring) pending the architect
  scope-amendment decision — explicitly NOT this item's work per the orch
  ruling; the read-path half is proven above.
- Reviewer observation (cycle-2, non-defect): symbolic hint still rides the
  event top level while details.labwareId carries the record identity —
  unchanged by this fix run (consumers confirmed by the harness reading
  details.labwareId).

STATUS: complete
WELLSET-RESOLVER-1 FIX2 DONE 9a4a43d9
