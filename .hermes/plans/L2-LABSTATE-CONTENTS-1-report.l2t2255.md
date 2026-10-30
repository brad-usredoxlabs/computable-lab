# REPORT — L2-LABSTATE-CONTENTS-1 (lane 2) — RESUME RUN

ITEM: L2-LABSTATE-CONTENTS-1 (lane 2, computable-lab)
RUN: l2t2255 (resume; predecessor died 00:55 on engine admission expiry before writing a report)
BRANCH: cl/lane2-labstate-contents-1-l2t2255
WORKTREE: /mnt/vast/home/brad/git/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255
BASE (post-WELLSET-merge): 9d020514 (WELLSET fix2 squash merge into cl/integration-2)
ITEM DIFF BASE: 150359aa~1 (= 9d020514)
COMPLETION HEAD: 0ee16eb99f653e6b0e256435eead46b04e21544d
COMMITTED SHA (code, for the DONE-marker line if the item is later cleared): 0ee16eb99f653e6b0e256435eead46b04e21544d
DATE: 2026-10-30 (EDT)
BASIS RULING: decisions/WELLSET-D13-ruling-l2t1515.md (RULING: B)
SPEC: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-29_L2-LABSTATE-CONTENTS-1-spec.md (incl. §15 OQ rulings)

========================================================================
EXECUTIVE SUMMARY
========================================================================

IMPLEMENTATION (the bulk of the item) — COMPLETE AND VERIFIED:
  The lab_state fold now consumes the SHIPPED expander add_material/transfer
  shape (symbolic top-level labwareId -> snapshot instance via a
  DATA-declared, never-guess ladder; string material normalizes without
  inventing ids), per D13-B. All in-scope work is committed and verified:
    - 80/80 targeted green (the 4-file set the task names).
    - ALL 8 spec-§10 files 128/128 (zero new failing files).
    - server tsc --noEmit = 0 (baseline at ab85a748 was 0; head is 0 —
      zero-new).
    - Hardcode sweeps (spec §10): all four EMPTY (PASS).
    - STEP 0 WELLSET regression gate: wellsetResolver 33/33,
      shorthandChat.wellsetFold 3/3 (both green untouched).
    - One-canonical-shape proof (LabStateCanonicalShape.test.ts, 7 legs)
      drives the fold with REAL expander output (addMaterialExpander /
      transferExpander / createContainerExpander .expand()) — never a
      hand-crafted shape — and asserts contents land, with the never-guess
      legs (two same-type plates => unresolved, no contents, no second
      labware) and the raw-path byte-stability pins.

LIVE NO-SEED DRIVE (acceptance line 1) — BLOCKED, NOT PASSED:
  The verbatim spec §11 4-utterance no-seed drive was run live against a
  restarted lane-2 backend with MY YAML + MY fold loaded (turn A mints
  LWI-1 via the fold — the OQ-3 R3-unique live winner, PROVEN LIVE). But
  turns 1 / 1b / 2 do NOT reach my fold: the model lowers
  "add material A to A1-H1" to a shorthand whose `material: "A"` is an
  UNRESOLVABLE material noun, so the product's PRE-EXISTING material-noun
  gate (resolve_nouns) fires a "create local term" clarification card
  (kind=material, menuProvider=/m) -> the compile is needs-clarification
  with events:[] -> the add_material expander output never reaches
  resolve_roles -> the lab_state fold never fires -> the contents ledger
  never populates -> the mix union is vacuous ([]==[]).

  This gate is OUT OF THIS ITEM'S FILE SCOPE. My diff touches NO
  material-resolution file (proven below: the 9 diff files are the lab_state
  fold, the pass seam, the vocabulary DATA section + its loader, and tests).
  Spec §12 names store-record material resolution "an architect escalation,
  NOT a fix-run," and the item's OUT-OF-SCOPE list forbids patching the
  expander/resolver mid-item. So this is an honest scope/routing blocker to
  the orchestrator, not a defect in the fold.

  I also ran the FAITHFUL LIVE PRODUCT-PROOF variant (drive-mint.py): the
  product's own designed flow for an unknown material (POST /api/vocab/mint
  to mint the bare label, answer the card, deterministic recompile). That
  path ALSO re-fires the material-noun bar (the re-compiled shorthand still
  carries the bare `material: "A"` as a symbolic noun the spine re-bars) —
  so even the product's own mint+answer flow does not, by itself, get a
  bare single-letter material past the gate on this no-seed surface. Both
  drive receipts are captured (raw excerpts in §7).

  BOTTOM LINE: the fold is correct and is proven to consume the shipped
  expander shape (unit + canonical-shape + turn-A live). The live ledger
  population is blocked by a pre-existing, out-of-scope material-noun gate.
  I do NOT claim the live drive passed and I do NOT mark the item complete.

========================================================================
1. PER-WORK-ITEM STATUS (spec §8 items 1-5)
========================================================================

Item 1 — NEW LabStateCanonicalShape.test.ts (real expander output):
  EXISTS (committed at 150359aa/d39ac037) and VERIFIED. 7 legs, all green.
  Drives the fold with REAL expander output (addMaterialExpander /
  transferExpander / createContainerExpander .expand()), never a hand-
  crafted shape. Coverage vs spec §8:
    - never hand-crafted shape: the REAL .expand() output is folded (spec
      §8 "call addMaterialExpander/transferExpander programmatically, fold
      their real events").
    - unknown-plate never-guess leg: "unknown labware hint => NO contents,
      NO second labware (R1/R2/R3 all miss)" — present and green.
    - two same-type plates never-guess leg: present and green (the D1
      mirror on the write side; the OQ-3 ratified negative).
    - raw-path byte-stability (labwareInstanceId / from-to object): present
      and green.
    - R1/R2/R3 rung legs: present and green.
  file: server/src/compiler/state/LabStateCanonicalShape.test.ts
  (7 it(), all pass — see §4 targeted raw).

Item 2 — drive harness .hermes/plans/harness/labstate-contents-drive/:
  BUILT THIS RUN (committed at 0ee16eb9). Did NOT exist before (orch
  first-hand: "CHECK if it exists; build it if not" — it did not).
  Contents:
    - drive.py        the VERBATIM spec §11 4-utterance no-seed drive
                      (turns A / 1 / 1b / 2 + the unknown-plate control X),
                      ONE held session, byte-stable context identity
                      (conversationKey = deriveContextCacheKey(surface,
                      context), the LabStateCache key), the run-suite-a.py
                      post_sse idiom against /api/ai/draft-events/stream.
                      NO seeded state, NO cache priming, NO priorLabState
                      fixture. Emits receipts to
                      /home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/
                      <UTC ts>/drive-receipt.json with four NAMED acceptance
                      legs (vacuous []==[] is a FAILURE, never a pass).
    - drive-mint.py   the faithful live PRODUCT-PROOF variant (mint+answer)
                      — the product's own designed flow for an unknown
                      material (POST /api/vocab/mint -> answer the card ->
                      deterministic recompile), to demonstrate the fold
                      fires on the live add path when the material resolves.
    - README.md       what/why/evidence + the drive evidence channel.
    - labstate-worktree-stack.sh  boots MY worktree backend on :3093 (the
                      cl-lane-stack.sh serves TRUNK cl-integration-2, which
                      does NOT contain my 4 LABSTATE commits, and the task
                      forbids touching trunk). Sets LABSTATE_ARM_LOG=1 (the
                      env-gated per-turn committed-ledger arm-log the wire
                      done frame lacks). NEVER touches :3001/:5174 or the
                      other lane ports. NO edits to l2-suite-a/expectations
                      or lib (WELLSET's P7.json is DO-NOT-TOUCH).
  file: .hermes/plans/harness/labstate-contents-drive/{drive.py,
          drive-mint.py, README.md, labstate-worktree-stack.sh}

Item 3 — LIVE NO-SEED DRIVE (spec §11):
  RUN LIVE (both drive.py and drive-mint.py) against the restarted lane-2
  backend (:3093) with MY YAML + MY fold loaded, BEFORE this report.
  RESULT: turn A PASSES live (the create_container fold mints LWI-1, the
  OQ-3 R3-unique live winner — the per-turn ARM-LOG shows
  after_labware={"LWI-1":{}}). Turns 1 / 1b / 2 are BLOCKED upstream by the
  pre-existing material-noun gate (the add_material never reaches the fold —
  raw receipts in §7). The mix union is vacuous ([]) because the ledger was
  never populated (the adds never reached the fold). The unknown-plate
  control (X) could not be isolated cleanly because the material-noun gate
  fired FIRST on the A/B materials (the control's own ghost-plate labware
  never-guess leg is separately PROVEN in the unit canonical-shape test,
  which is in scope and green).
  => The live drive is NOT PASSED. This is the blocked portion (see §8).

Item 4 — Hardcode sweeps (spec §10):
  RUN (see §5). All four EMPTY on the new field-name literals in the fold
  code. PASS.

Item 5 — REPORT:
  THIS FILE. Per-work-item diffs with file:line (§3), baseline-vs-head
  test/tsc RAW counts (§4, §6), drive evidence RAW blocks with payload
  excerpts IN the report (§7), hardcode-sweep outputs (§5), deviations (§9),
  honest limitations (§10), and the blocked-portion routing (§8).

========================================================================
2. STEP 0 — WELLSET REGRESSION GATE (must stay green untouched)
========================================================================

Spec §10 exact paths. NOTE: the spec wrote `src/compiler/wellsetResolver.
test.ts` but the real path is `src/compiler/scientistIntent/wellsetResolver.
test.ts` (I used the real path — a path-label drift in the spec, disclosed,
not a defect). Both files measured green at HEAD, untouched by my diff:

  wellsetResolver.test.ts      33/33 (spec baseline was 29 at ba1cdc9e; the
                                +4 are WELLSET-merge test additions, not mine)
  shorthandChat.wellsetFold    3/3   (spec baseline was 2 at ba1cdc9e; the +1
                                       is a WELLSET-merge addition, not mine)

RAW (from the serialized STEP-0 re-run at HEAD, §4 block):
    ✓ src/compiler/scientistIntent/wellsetResolver.test.ts  (33 tests) 466ms
    ✓ src/ai/shorthandChat.wellsetFold.test.ts  (3 tests) 162ms

Both GREEN untouched. The regression gate HOLDS. (The spec's "29 (29 it())"
/ "2 it()" counts were measured at ba1cdc9e pre-WELLSET-merge; the WELLSET
merge added 4 wellsetResolver + 1 wellsetFold tests. The counts grew, not
shrank — disclosed, not a regression. The gate is GREEN at the current
counts.)

========================================================================
3. PER-WORK-ITEM DIFF (base 150359aa~1 .. HEAD) with file:line
========================================================================

9 files in the item diff (git diff --name-only 150359aa~1 HEAD):
  schema/scientist-intent/scientist-intent-vocabulary.schema.yaml
  schema/scientist-intent/scientist-intent-vocabulary.yaml
  server/src/ai/runChatbotCompileLabState.test.ts
  server/src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts
  server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts
  server/src/compiler/scientistIntent/vocabulary.test.ts
  server/src/compiler/scientistIntent/vocabulary.ts
  server/src/compiler/state/LabStateCanonicalShape.test.ts
  server/src/compiler/state/LabState.ts

PROVEN NO material-resolution file is touched (the blocker's scope proof):
  git diff --name-only 150359aa~1 HEAD | grep -iE "resolveNouns|normalize-
  Scientist|wellsetResolver|shorthandChat.ts|resolutionEngine|termId|
  VocabHandlers"  ->  NONE

Key changes (file:line at HEAD):
  - server/src/compiler/state/LabState.ts
      :57    identityTokens?: string[] on LabwareInstance (deck contract,
             §6 — additive, absent-when-empty, structuredClone-safe).
      :205   rungMatches() — GENERIC field-identity evaluator over the
             DATA-declared tokenFields (no rung-id/field-name TS branch;
             no substring/overlap — the findLabwareByHints anti-pattern is
             NOT called).
      :231   resolveLabware() — the never-guess ladder (first rung with
             exactly one match wins; zero advances; a TIE is terminal).
      :296   normalizeMaterial() — NO invented ids (verbatim passthrough of
             the scientist's own word; the material_ref mint: convention is
             copied verbatim, never synthesized; a {value,unit} volume is
             NOT converted — unit honesty).
      :416   applyCreateContainer — populates identityTokens from the
             DECLARED carriers only (details.labwareId ?? event.labwareId
             ?? details.title ?? details.label), verbatim at write time.
      :485   applyAddMaterial — accepts the shipped expander shape (details.
             labwareInstanceId raw path R1, else the symbolic hint through
             the ladder; details.well OR details.wells; object OR string/
             spread material). No-op + FoldOutcome.reason on any failed rung.
      :528   applyTransfer — the shipped source_labware/destination_labware
             shape (both sides through the SAME ladder) + the raw from/to
             object path (byte-stable) + pairwise-by-address multi-well
             (equal-length source_wells/wells only; else no-op).
      :625   applyEventToLabState — the 3-arg overload (rules?:
             LabIdentityRules) returns { snapshot, outcome } FoldResult;
             2-arg stays byte-identical (rules absent => R1 only).
  - server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts
      :1782  createLabStatePass(opts) — loads the vocabulary, threads the
             DATA-declared rules into the fold at the PASS seam (never
             imports the vocabulary into the pure fold module), and
             collects the §7 no-op diagnostics
             (lab_state_unresolved_labware_reference / material sibling).
      :1790  const rules: LabIdentityRules = { order, tokenFields } (the
             frozen per-load DATA read).
      :1865  the env-gated ARM-LOG (LABSTATE_ARM_LOG=1): the per-turn
             PRIOR + POST-FOLD committed-ledger arm-log the wire done frame
             (AgentResult) lacks — the spec §11 "backend arm-log line"
             evidence form. INERT in production traffic.
  - schema/scientist-intent/scientist-intent-vocabulary.yaml
      :923   labwareIdentityResolution: DATA section (order:
             [instanceIdentity, declaredIdentityTokens, uniqueLabwareType];
             tokenFields: [instanceId, identityTokens, labwareType]).
  - schema/scientist-intent/scientist-intent-vocabulary.schema.yaml
             declares the section (ordered string list + tokenFields;
             enum of the three rung ids).
  - server/src/compiler/scientistIntent/vocabulary.ts
      :290   the frozen per-load read (same idiom as wellsetValueTokens /
             materialBearingEventTypes; absent section => fail-closed empty
             => the fold resolves rung R1 ONLY).
  - tests: LabStateCanonicalShape.test.ts (NEW, 7 legs),
    ChatbotCompilePasses.test.ts (+ lab_state pass legs), vocabulary.test.ts
    (+ per-load pin), runChatbotCompileLabState.test.ts (+ regression legs).

========================================================================
4. BASELINE-vs-HEAD TEST + TSC RAW COUNTS
========================================================================

PROVENANCE: CODER-CAPTURED (I ran these at HEAD in the worktree; raw files
saved under /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/ and /tmp/). Baseline
at ab85a748 (the ORCH-measured preservation commit): the task brief states
targeted 4 files 80/80 and server tsc 0 at ab85a748; I re-measured the SAME
4 files at HEAD (5df1f52a, then 0ee16eb9) = 80/80 and tsc 0. ZERO new
failing files (all 8 spec-§10 files pass; there are no failing files to
delta against).

Baseline drift disclosure (report-integrity rule 7): the spec §10 baseline
numbers (LabState 9, ChatbotCompilePasses 44, runChatbotCompileLabState 2 =
55; WELLSET 29+2) were measured at trunk ba1cdc9e PRE-WELLSET-merge. The
counts have legitimately GROWN since (the WELLSET merge added wellsetResolver
33 vs 29 and wellsetFold 3 vs 2; my item added the canonical-shape file,
LabStateCache legs, and the pass/vocabulary/runChatbotCompileLabState legs).
This is disclosed drift I did NOT cause a regression with — every file
PASSES (128/128), so zero-new is proven by the all-green run, not a
failing-file delta.

TARGETED 4-FILE SET (the task-named set) — HEAD (LabState 9 +
  ChatbotCompilePasses 47 + runChatbotCompileLabState 5 + vocabulary 19
  = 80/80, matching the ORCH-measured ab85a748 count). The four files are
  all green in the serialized runs below; the per-file pass lines appear in
  the STEP-0 and 8-file RAW blocks.

STEP-0 GATE + TARGETED 4-FILE SET — HEAD RAW (CODER-CAPTURED, serialized
  single run; raw file: /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/
  step0-final-l2t2255.txt):

    ✓ src/compiler/state/LabState.test.ts  (9 tests) 7ms
    ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts  (47 tests) 126ms
    ✓ src/ai/shorthandChat.wellsetFold.test.ts  (3 tests) 162ms
    ✓ src/ai/runChatbotCompileLabState.test.ts  (5 tests) 310ms
    ✓ src/compiler/scientistIntent/vocabulary.test.ts  (19 tests) 859ms
    ✓ src/compiler/scientistIntent/wellsetResolver.test.ts  (33 tests) 466ms

     Test Files  6 passed (6)
          Tests  116 passed (116)
       Start at  02:59:11
       Duration  3.62s (transform 2.13s, setup 0ms, collect 7.94s, tests 1.93s, environment 1ms, prepare 2.91s)

FULL 8-FILE SPEC-§10 SET — HEAD RAW (CODER-CAPTURED, serialized single run;
  raw file: /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/targeted8-final-l2t2255.txt):

    ✓ src/compiler/state/LabState.test.ts  (9 tests) 9ms
    ✓ src/compiler/state/LabStateCanonicalShape.test.ts  (7 tests) 7ms
    ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts  (47 tests) 128ms
    ✓ src/ai/shorthandChat.wellsetFold.test.ts  (3 tests) 156ms
    ✓ src/compiler/state/LabStateCache.test.ts  (5 tests) 285ms
    ✓ src/ai/runChatbotCompileLabState.test.ts  (5 tests) 305ms
    ✓ src/compiler/scientistIntent/vocabulary.test.ts  (19 tests) 918ms
    ✓ src/compiler/scientistIntent/wellsetResolver.test.ts  (33 tests) 506ms

     Test Files  8 passed (8)
          Tests  128 passed (128)
       Start at  02:49:45
       Duration  4.27s (transform 2.34s, setup 1ms, collect 10.71s, tests 2.31s, environment 2ms, prepare 3.96s)

TYPECHECK (server) — HEAD RAW:
  cd <worktree>/server && npx tsc --noEmit   ->  0 errors (raw output EMPTY)
  (baseline at ab85a748 = 0 per task brief; head = 0 -> zero-new)
  raw file: /tmp/labstate-tsc-head2-l2t2255.txt (empty = 0 errors)

========================================================================
5. HARDCODE SWEEPS (spec §10) — all EMPTY (PASS)
========================================================================

  SWEEP 1: well-address literals in the diff (new field-name literals in the
           fold code must be empty; test/.md excluded):
    git -c core.fileMode=false diff 150359aa~1...HEAD \
      | grep -nE "['\"](A[0-9]+|H[0-9]+)(:|-)" | grep -v "\.test\.ts\|\.md"
    -> (no output; exit 1)  PASS

  SWEEP 2: plate1/96-well/trypsin/DMEM in the LabState.ts diff:
    git ... -- server/src/compiler/state/LabState.ts \
      | grep -nE "plate1|96-well|trypsin|DMEM"
    -> (no output; exit 1)  PASS

  SWEEP 3: verb === in LabState.ts:
    grep -n "verb ===" server/src/compiler/state/LabState.ts
    -> (no output; exit 1)  PASS

  SWEEP 4: fuzzy-match anti-patterns in the NEW resolution code:
    grep -nE "findLabwareByHints|includes\(|indexOf\(|startsWith\(" \
      server/src/compiler/state/LabState.ts
    -> (no output; exit 1)  PASS

  (The rung evaluators are exact-compare + the declared trim+casefold /
   non-alnum-collapse normalization only — no substring/overlap.)

========================================================================
6. LIVE DRIVE — WHAT WAS RUN AND THE EVIDENCE CHANNEL
========================================================================

  WHY MY WORKTREE ON :3093 (not cl-lane-stack.sh): cl-lane-stack.sh lane 2
  hardcodes WT=/mnt/vast/home/brad/git/cl-integration-2 (TRUNK), which does
  NOT contain my 4 LABSTATE commits (verified: git merge-base --is-ancestor
  for 150359aa/d39ac037/ab85a748/564c6fcb all = "NOT in trunk" at trunk
  d1f1e0df). The task forbids touching trunk, and the drive must exercise MY
  fold + MY YAML. So I booted MY worktree's backend on :3093 (the port was
  free) with the lane-2 config + LABSTATE_ARM_LOG=1 (the exact boot env
  cl-lane-stack.sh uses). NEVER touched :3001/:5174 or the other lane ports.
  Backend READY: health 200 after 68s.

  EVIDENCE CHANNEL: the wire `done` frame (the AgentResult the
  /api/ai/draft-events/stream path returns) does NOT carry labStateDelta —
  the AgentResult type has no such field (verified: grep labStateDelta
  server/src/ai/types.ts = no field). So the per-turn committed ledger is
  captured from the backend ARM-LOG (createLabStatePass, env-gated
  LABSTATE_ARM_LOG=1): each line emits the PRIOR committed ledger (the
  persistence proof — a later turn's prior must already contain an earlier
  turn's contents) and the POST-FOLD snapshot (the contents this turn
  wrote). This is the spec §11 "backend arm-log line or drive-captured
  payload" evidence form. The drive captures the backend-log window between
  turns and extracts the ARM-LOG lines into the receipt.

  LLM: live (the lane-2 active profile ds4.1-flash-OR via the local
  127.0.0.1:18099 passthrough proxy -> OpenRouter deepseek/deepseek-v4.1-
  flash; verified 200 with the config key).

  Receipts:
    /home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/20261030T063626Z/
      drive-receipt.json  (the VERBATIM spec §11 4-utterance drive + control)
    /home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/20261030T064740Z/
      drive-receipt.json  (the faithful mint+answer product-proof drive)
  Raw drive stdout:
    /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/drive-raw-l2t2255.txt
    /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/drive-mint-raw-l2t2255.txt

========================================================================
7. LIVE DRIVE EVIDENCE — RAW PAYLOAD EXCERPTS (IN the report)
========================================================================

TURN A (both drives) — PASSES LIVE (the create_container fold fires):
  prompt: "Place a 96-well plate on the deck."
  ARM-LOG (verbatim from backend log):
    [lab_state ARM-LOG] turn=1 prior_labware={} after_labware={"LWI-1":{}}
  -> the create_container event (details {slot:'target',
     labwareType:'96-well-plate', NO label carrier — the OQ-3 shape) is
     folded by the lab_state pass; the fold mints snapshot instance LWI-1
     (R3-unique live winner — the single 96-well-plate resolves by unique
     declared type). snapshotAfter.labware is populated (one instance).
  done result: events:[{event_type:create_container, details:{slot,
    labwareType:'96-well-plate'}}], resolvedLabwares:[{recordId:
    'lbw-seed-plate-96-flat', ...}], success:true, error:null.
  => TURN A ACCEPTANCE: the accepted create leaves snapshotAfter.labware
     populated (LWI-1) — the OQ-3 R3-unique live winner, PROVEN LIVE.

TURN 1 (both drives) — BLOCKED by the material-noun gate (NOT a fold fault):
  prompt: "add material A to A1-H1"
  ARM-LOG: (empty — the lab_state fold NEVER RAN this turn)
  done result: events:[] (ZERO), success:true, error:null, and ONE
    clarificationRequest (the material-noun card):
    {
      "id": "unresolved-c-b29ade461b",
      "kind": "material",
      "prompt": "The draft names \"A\" and the lab spine could not bind it
                 (ambiguous-noun). Choose what it is, or create a local
                 term.",
      "origin": "harness", "entityType": "material",
      "menuProvider": "/m", "query": "A", "options": [],
      "allowCreateLocal": true,
      "unresolvedFact": { "label": "A", "reason": "ambiguous-noun",
        "candidates": [ { "label": "acetonitrile", "confidence": 1,
          "ref": "MAT-acetonitrile-dl1b", "tier": 1, ... } ],
        "actionLocation": { "actionIndex": 0, "action": "add_material",
          "argument": "material" } }
    }
  model-emitted shorthand (the model's lowering of the verbatim utterance):
    intentId: add-material-a-to-column1
    actions:
      - action: add_material
        material: "A"
        labware: "96-well plate"
        targetWells: [A1:H1]
  ROOT CAUSE: the model emits `material: "A"` — a bare single-letter
    material noun. The product's PRE-EXISTING material-noun resolution
    (resolve_nouns, a pass my diff does NOT touch) cannot confidently bind
    "A" -> it raises the unknown/ambiguous-noun clarification bar -> the
    compile is needs-clarification with events:[] -> the add_material
    expander output is NEVER produced into resolve_roles -> the lab_state
    fold (which reads resolve_roles) never fires -> the contents ledger
    never populates. This is the product's DESIGNED never-guess behavior
    for an unresolvable material, NOT a defect in the lab_state fold.

  PIPELINE-ORDERING PROOF (the bar is UPSTREAM of the fold, so my change
    provably cannot cause it). schema/registry/compile-pipelines/
    scientist-intent-compile.yaml (HEAD, first-hand):
      resolve_nouns        depends_on: [ai_precompile]
      expand_biology_verbs depends_on: [ai_precompile, resolve_nouns]
      resolve_roles        depends_on: [expand_protocol_intent_patterns,
                                        expand_biology_verbs, ...]
      resolve_wellsets     depends_on: [resolve_roles, ...]
      lab_state            depends_on: [resolve_roles, resolve_wellsets]
    => resolve_nouns (where the material-noun bar fires) runs BEFORE
       expand_biology_verbs (which emits the add_material) and FAR before
       lab_state (the fold). My diff touches only the lab_state pass + the
       fold module + the vocabulary DATA section (a DATA list the
       resolve_nouns material bar does not read — it reads the material
       domain/spine, not labwareIdentityResolution). So the material-noun
       bar cannot be a side-effect of this item's change: it is pre-
       existing product behavior, and the add_material never reaches the
       fold because the bar fires upstream of the expander itself.

TURN 1b (both drives) — same blocker (A and B both bar):
  prompt: "add material B to A2-H2"
  ARM-LOG: (empty — fold never ran)
  done result: events:[], two material-noun cards (A + B), success:true.
  => the persistence proof (turn 1b's prior containing turn 1's contents)
     CANNOT be captured because turn 1 never populated the ledger (the
     fold never fired on turn 1).

TURN 2 (both drives) — vacuous because the ledger is empty:
  prompt: "mix all wells that have material"
  ARM-LOG: (empty — fold never ran; the mix event also never reached the
    fold because the adds were barred)
  done result: events:[], the A/B material-noun cards re-fire, success:true.
  mix union: [] (vacuous) — because the committed ledger was never
    populated (the adds never reached the fold). This is the vacuous
    []==[] the spec names an ACCEPTANCE FAILURE — and it is caused by the
    upstream material-noun gate, not by the fold.

TURN X (control, verbatim drive) — could not be isolated:
  prompt: "add material Z to the ghost-plate well C1"
  The material-noun gate fired FIRST on the held A/B materials (the held
    intent re-bared them), so the ghost-plate labware never-guess leg was
    not reached on the live path. The ghost-plate never-guess behavior is
    instead PROVEN in the in-scope unit canonical-shape test
    (LabStateCanonicalShape.test.ts "unknown labware hint => NO contents,
    NO second labware (R1/R2/R3 all miss)"), which is green.

MINT+ANSWER VARIANT (drive-mint.py) — the faithful product path, also
  blocked at the gate:
  turn 1: the model emitted `material: "A"` -> the card fired (kind=material,
    menuProvider=/m). The drive then did the product's OWN designed flow:
    POST /api/vocab/mint {refKind:'material', label:'A'} -> 200
    (recordId MAT-a-3t3a), then answered the card with
    {requestId, label:'A', ref:{kind:'record', id:'MAT-a-3t3a',
    type:'material', label:'A'}}. The recompile STILL re-fired the material-
    noun bar (events:[] — the recompiled shorthand still carried the bare
    `material: "A"` as a symbolic noun the spine re-resolved-and-re-bared).
    => Even the product's own mint+answer flow does not, by itself, get a
    bare single-letter material past the gate on this no-seed surface.
    (The mint created a real draft material record — that part worked — but
    the answer did not settle the bar in the recompile for the bare label.)

  Raw drive stdout (CODER-CAPTURED, in the report):

  VERBATIM spec §11 4-utterance no-seed drive (drive.py):
    (raw file: /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/drive-raw-l2t2255.txt)
    DRIVE run_id=labstate-20261030T063626Z base=http://localhost:3093
    turn A   http=200 frames=['done'] wall=2.5s arm_lines=1
    turn 1   http=200 frames=['done'] wall=5.8s arm_lines=0
    turn 1b  http=200 frames=['done'] wall=8.4s arm_lines=0
    turn 2   http=200 frames=['done'] wall=5.7s arm_lines=0
    turn X   http=200 frames=['done'] wall=6.7s arm_lines=0
    LEG turn1_contents         ok=False
    LEG turn1b_persistence     ok=False
    LEG turn2_mix_union        ok=False
    LEG control_never_guess    ok=True
    RECEIPT=/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/20261030T063626Z
    ALL_LEGS_OK=False

  Faithful mint+answer product-proof drive (drive-mint.py):
    (raw file: /home/brad/.hermes/cl/lanes/2/tmp-l2t2255/drive-mint-raw-
     l2t2255.txt)
    turn A   http=200 wall=4.4s arm=1 events=1 cards=0
    turn 1   http=200 wall=5.6s arm=0 events=0 cards=1
      mint 'A' -> MAT-a-3t3a (http 200); answering card unresolved-c-b29ade461b
    turn 1-ans http=200 wall=4.1s arm=0 events=0 cards=1
      answer recompile: events=0 cards=1 error=None
    turn 1b  http=200 wall=17.0s arm=0 events=0 cards=2
      mint 'A' -> MAT-a-3t3a (http 200); answering card unresolved-c-b29ade461b
    turn 1b-ans http=200 wall=2.9s arm=0 events=0 cards=2
      answer recompile: events=0 cards=2 error=None
    turn 2   http=200 wall=4.4s arm=0 events=0 cards=2
    LEG turnA_plate_minted     ok=True
    LEG turn1_contents         ok=False
    LEG turn1b_persistence     ok=False
    LEG turn2_mix_union        ok=False
    RECEIPT=/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/20261030T064740Z ALL_LEGS_OK=False

========================================================================
8. THE BLOCKED PORTION (route to orchestrator / architect)
========================================================================

BLOCKED: acceptance line 1 — the live no-seed multi-turn P3 drive
  ("turn 1 'add material A to A1-H1' accepted leaves snapshotAfter.labware
  populated and the non-empty snapshot persisted; turn 2 mix resolves A1:H2
  from the committed ledger").

WHAT IS BLOCKED: turns 1 / 1b / 2 of the live no-seed drive. The
  add_material events never reach the lab_state fold because the product's
  PRE-EXISTING material-noun gate (resolve_nouns) bars the compile for a
  bare single-letter material label ("A"/"B") on this no-seed shorthand
  surface (unknown-noun / ambiguous-noun -> a "create local term" card ->
  events:[] -> needs-clarification).

EVIDENCE (first-hand, CODER-CAPTURED):
  - Both drive receipts (§6 paths) show turns 1/1b/2 with events:[] and the
    material-noun card (kind=material, menuProvider=/m, the raw excerpts in
    §7), and an EMPTY lab_state ARM-LOG for those turns (the fold never
    ran). Turn A's ARM-LOG shows the fold DID fire (after_labware={"LWI-1":
    {}}), proving the fold is live and correct when an event reaches it.
  - Scope proof: `git diff --name-only 150359aa~1 HEAD | grep -iE
    "resolveNouns|normalizeScientist|wellsetResolver|shorthandChat.ts|
    resolutionEngine|termId|VocabHandlers"` = NONE. My diff does not touch
    the material-noun gate; it is pre-existing product behavior.
  - The spec's own OUT-OF-SCOPE list + §12: "If the reviewer demands store-
    record material resolution, that breaks the fold's purity and is an
    architect escalation, NOT a fix-run." The material-noun bar is exactly
    this class.

WHAT WAS ATTEMPTED:
  (a) the verbatim spec §11 4-utterance no-seed drive (drive.py) — blocked
      at turn 1 (material-noun gate).
  (b) the faithful live product-proof variant (drive-mint.py): the product's
      own designed flow for an unknown material (mint the bare label via
      /api/vocab/mint + answer the card + deterministic recompile) — ALSO
      re-blocked (the recompiled shorthand re-carries the bare `material:
      "A"` and the spine re-bars it).
  (c) model-variance probe (6x turn 1): the model's phrasing varied ("A" vs
      "material A", with/without the labware field), but EVERY variant hit
      the same material-noun bar — this is not model flakiness, it is the
      deterministic material-noun gate on a bare single-letter label.

WHAT IS STILL POSSIBLE (without touching out-of-scope files):
  - The lab_state fold itself is DONE and PROVEN (unit + canonical-shape +
    turn-A live). It will populate the ledger the MOMENT an add_material
    reaches resolve_roles.
  - The acceptance could be re-proven live with a RESOLVABLE material label
    (a material the spine can bind — e.g. a known record name rather than a
    bare "A"), OR by routing the material-noun question to the architect
    (is the bare-label bar the intended no-seed product behavior, or should
    the spec's worked-example materials be treated as local drafts that the
    spine resolves without a bar?). THAT is the precise missing input.

RECOMMENDED RESOLUTION (owner: ORCHESTRATOR -> ARCHITECT):
  This is a spec/product-contract question, not a coder fix-run:
  1. Confirm the intended no-seed live behavior for a bare material label
     ("A"): is the material-noun bar (create-local-term card) the intended
     product gate (in which case the spec's line-1 drive needs a
     resolvable material, or an answered card, and the spec should say so),
     or should the spec's worked-example bare labels be resolved as local
     drafts without a bar (a resolve_nouns / material-resolution change —
     an ARCHITECT escalation per spec §12, a NEW item, not this one)?
  2. The lab_state fold (this item's owned contract) is complete and
     verified; it is NOT the cause of the block. Clearing ED-WELLSET-AC2-
     LIVE (D13-C) requires the live drive to pass, which requires resolving
     the material-noun question first.

RESUME CONDITION (for the next run / the post-merge orch re-drive):
  - If the architect rules the bare-label bar is intended: re-run the drive
    with a resolvable material label (and/or an answered card) — the fold
    will populate the ledger and the mix union will be non-vacuous (the
    48-well A1:H2 union). No fold change needed.
  - If the architect rules the bare labels should resolve without a bar:
    that is a NEW item (material-resolution), out of this item's scope;
    this item's fold is already correct for when the event reaches it.
  - The post-merge orch re-drive (D13-C) must be re-run after the
    material-noun question is resolved to clear ED-WELLSET-AC2-LIVE.

NEXT CHECK:
  - For the orchestrator: the two drive receipts (§6) + the scope proof (§8)
    are the load-bearing evidence. No fold change is required by the block.

========================================================================
9. DEVIATIONS FROM THE SPEC
========================================================================

  1. The spec §10 path `src/compiler/wellsetResolver.test.ts` is actually
     `src/compiler/scientistIntent/wellsetResolver.test.ts`. I used the
     real path. (Spec path-label drift, disclosed, not a defect.)
  2. The spec §10 baseline counts (LabState 9 / ChatbotCompilePasses 44 /
     runChatbotCompileLabState 2 = 55; WELLSET 29+2) were measured at
     ba1cdc9e PRE-WELLSET-merge. HEAD counts are higher (128 total) because
     the WELLSET merge added wellsetResolver 33 / wellsetFold 3 tests and my
     item added the canonical-shape file + LabStateCache legs + the pass /
     vocabulary / runChatbotCompileLabState legs. All files PASS (zero new
     failing files) — this is disclosed baseline drift, not a regression.
  3. I added an env-gated ARM-LOG to createLabStatePass (ChatbotCompilePasses.
     ts:1865) to capture the per-turn committed ledger the wire done frame
     lacks (the spec §11 "backend arm-log line" evidence form). It is INERT
     unless LABSTATE_ARM_LOG=1 and is within the item's owned file (create-
     LabStatePass is the item's owned pass). This is a disclosure, not a
     scope change.
  4. I booted MY worktree backend on :3093 (not cl-lane-stack.sh) because
     cl-lane-stack.sh serves trunk (which lacks my commits) and the task
     forbids touching trunk. This is the compliant lane-local path (the
     computable-lab-lane-verification skill documents exactly this for a
     worktree-only branch pre-merge).
  5. The live no-seed drive is BLOCKED (not passed) by the pre-existing
     material-noun gate (out of scope) — see §8. I did NOT weaken the
     acceptance criteria and did NOT claim the drive passed.

========================================================================
10. HONEST LIMITATIONS
========================================================================

  - The live no-seed drive's turns 1/1b/2 could not be proven LIVE because
    the add_material never reached the fold (the material-noun gate). The
    fold's correctness for the add/transfer paths is proven by the unit +
    canonical-shape tests (real expander output) and by the turn-A live
    proof (the create_container fold fires live). The add_material LIVE
    population is the specific piece that is blocked, and it is blocked by
    an upstream out-of-scope gate, not by the fold.
  - The unknown-plate (ghost-plate) live control leg could not be isolated
    on the live path (the material gate fired first on the held A/B
    materials). Its unit equivalent is proven (green).
  - The 48-well A1:H2 mix union is the EXPECTED non-vacuous result the spec
    names; it was NOT produced live (the ledger was empty). It is producible
    once the material-noun question is resolved (a resolvable material / an
    answered card) — the fold + the WELLSET read-half (resolve_wellsets,
    merged, untouched) are both in place and the union is computed by the
    read-half from the committed ledger.

========================================================================
11. ONTOLOGY TERMS
========================================================================

  This item adds NO ontology terms and touches NO mention binding. (Stated
  per spec §12 reviewer bait: "a diff that starts resolving materials via
  OAK is over-scoped." My diff resolves no materials via OAK — the fold
  normalizes the material string verbatim; the material-noun gate is a
  separate, pre-existing, out-of-scope product pass.)

========================================================================
12. PRESERVED / COMMITTED WORK (survives engine pressure)
========================================================================

  All work is committed on branch cl/lane2-labstate-contents-1-l2t2255
  (git worktree list / git log confirm). Commits base..HEAD:
    150359aa  [LABSTATE][RED]  RED-first canonical-shape legs (predecessor)
    d39ac037  [LABSTATE]       fold contract + labwareIdentityResolution DATA
                               section (predecessor)
    ab85a748  [LABSTATE][WIP-preserved] fold wiring + drive tests (predecessor
                               work preserved by orch)
    564c6fcb  [LABSTATE][WIP-preserved2] cosmetic comment re-wrap (orch)
    5df1f52a  [LABSTATE]       env-gated ARM-LOG in createLabStatePass (this
                               run — the spec §11 drive-evidence mechanism)
    0ee16eb9  [LABSTATE]       drive harness: labstate-contents-drive (this
                               run — spec §8 item 2)
  Worktree is clean at HEAD 0ee16eb9 (git status --short = empty).

========================================================================
STATUS: implementation COMPLETE + VERIFIED (80/80, 128/128, tsc 0, sweeps
clean, regression gate green, turn-A live). Live no-seed drive (acceptance
line 1) BLOCKED at turns 1/1b/2 by the pre-existing, OUT-OF-SCOPE material-
noun gate (a bare single-letter material label bars the compile before the
add_material reaches the lab_state fold). NOT passed; NOT marked complete.
Precise missing input routed to the orchestrator/architect in §8 (is the
bare-label material-noun bar the intended no-seed product behavior, or
should the spec's worked-example bare labels resolve without a bar — an
architect escalation per spec §12, a new item). The fold is correct and is
not the cause of the block; no fold change is required to unblock.

(Per the task's honesty rule and the persistence contract, I do NOT emit the
`L2LABSTATECONTENTS1 DONE <sha>` marker or `STATUS: complete` here: the
item's acceptance line 1 (the live multi-turn drive) is BLOCKED, not
passed. The committed code sha is 0ee16eb99f653e6b0e256435eead46b04e21544d
for the orchestrator to cite once the material-noun question is resolved and
the live drive is re-run (post-merge, D13-C).)


========================================================================
## FIX RUN 1 (l2t0405)
========================================================================

ADVERSARIAL GATE: VERDICT: fix (3 MAJOR D1/D2/D3 + 4 MINOR D4-D7).
FIX HEAD: 523ec78892429d55dd3e47e8fb750bd02ecaa34c
WORKTREE: /mnt/vast/home/brad/git/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255
BRANCH: cl/lane2-labstate-contents-1-l2t2255 (SAME item, SAME worktree)
DATE: 2026-10-30T08:52Z (EDT)
All commands `git -c core.fileMode=false`. Fix commits on top of the report
commit 3b282bb9 (fix1-RED d5e897b8 -> fix1 60db0a3a -> D6-final 523ec788).

SCOPE: server/schema-only (zero app/), exactly the item's owned files
(LabState.ts, LabStateCanonicalShape.test.ts, ChatbotCompilePasses.ts/.test.ts,
vocabulary.ts/.test.ts, both YAMLs, drive.py + README). No resolve_nouns /
material-noun-bar change (architect's), no simpleVerbs.ts change, RANGE_RE
untouched. Constraint re-verified post-fix: tsc -p . --noEmit = 0 lines
(exactOptionalPropertyTypes on); hardcode sweeps clean (below).

------------------------------------------------------------------------
D1 MAJOR — destination-only transfer no longer self-transfers (GREEN)
------------------------------------------------------------------------
FIX (LabState.ts, applyTransfer srcHint): dropped the `event.labwareId` arm
from the SOURCE hint chain. Source identity now comes from source_labware /
from.labwareId ONLY; the destination chain keeps the top-level labwareId (the
expander's TARGET, simpleVerbs.ts:715) as its fallback. A transfer naming only
the destination has NO source identity => `labware_unresolved` no-op + the §7
diagnostic (spec §4.2: "both sides must resolve uniquely or the fold no-ops").

RED -> GREEN (the Mutant-4 class, REAL transferExpander output):
  RED  (commit d5e897b8, pre-fix fold):
    FAIL LabStateCanonicalShape > transfer: the REAL transferExpander
         DESTINATION-ONLY shape (no source_labware) => NO write +
         labware_unresolved (never a self-transfer)
      AssertionError: expected { changed: true } to deeply equal
         { changed: false, …(1) }            <- the fold SELF-TRANSFERRED
    FAIL ChatbotCompilePasses.test > transfer destination-only (real expander,
         no source_labware): no-op + … diagnostic, NO write (D1)
      AssertionError: expected [ { materialId: 'mat-seed', …(2) } ] to deeply
         equal [ { materialId: 'mat-seed', …(2) } ]   <- A1 was DEDUCTED
  GREEN (post-fix): both legs pass — outcome { changed:false, reason:
    'labware_unresolved' }, A1 keeps 100, B1 absent, no second labware,
    AND the pass surfaces exactly one
    `lab_state_unresolved_labware_reference` (severity warning,
    reason labware_unresolved) diagnostic (the pre-fix fold wrote silently AND
    was invisible to isContentBearing — D6 makes it visible).
  Mutation-kill (scratch /tmp/fix1-mut, M2): reintroducing the
  `event.labwareId` srcHint arm => that leg REDs (1 failed | 13 passed);
  revert => 14/14 GREEN.

------------------------------------------------------------------------
D2 MAJOR — raw from/to byte-stability restored (GREEN)
------------------------------------------------------------------------
FIX (LabState.ts, applyTransfer): restored the base (9d020514) write
semantics EXACTLY:
  (a) EMPTY source well => the fold returns the clone UNTOUCHED (no
      destination materialization, outcome changed:false, NO reason — both
      sides resolved, an empty source is a normal no-move, no §7 diagnostic;
      the base reported nothing here either). The pre-fix backwards comment
      ("the existing raw path wrote the (unchanged) destination well") is
      gone — base returned at `if (srcMaterials.length === 0) return
      newSnapshot;` BEFORE touching the destination.
  (b) non-empty source + zero volume moved (volumeUl 0 / absent): the
      destination well is MATERIALIZED UNCONDITIONALLY (empty dest well),
      source stack intact, changed:false — base's unconditional
      `dstLabware.wells = { …, [toWell]: dstMaterials }` restored.
  (c) multi-well arm: the same per-pair shape (empty pair writes nothing;
      zero-move pair materializes the empty dest).
  The `wrote`/`changed` reporting and the top-of-stack deduction are
  otherwise untouched.

SNAPSHOT-EQUALITY goldens (base-shape vs head-shape, NOT within-build
withRules/withoutRules — added to LabStateCanonicalShape.test.ts):
  - transfer RAW: empty source well => UNTOUCHED clone (wells == {A2:[…70]},
    no A1 key, no B1 key) — base shape (a)
  - transfer RAW: volumeUl 0 => {A1:[…100], E1:[]} — base shape (b)
  - transfer RAW: ABSENT volumeUl => {A1:[…100], F1:[]} — base shape (b)
  - transfer RAW: deducted-to-zero => {A1:[], G1:[…100]} — the happy golden
  - transfer multi-well arm: {A1:[…30], B1:[…20]}, D1 UNDEFINED — shape (c)
Mutation-kill (M3): reintroducing BOTH pre-fix drifts (empty pair creates
`dst:[]`; zero-move omits the dest) => all FOUR drifted goldens RED (4 failed
| 10 passed); revert => 14/14 GREEN. The pre-existing value-level legs
(LabState.test.ts 9/9, the economics transfer legs) stay green untouched.

------------------------------------------------------------------------
D3 MAJOR — drive control leg is non-vacuous (GREEN)
------------------------------------------------------------------------
FIX (.hermes/plans/harness/labstate-contents-drive/drive.py, LEG 4): the
pre-fix `ok = (arm_log is not None) and (tx_prior == tx_after or tx_after is
None)` was asserted-by-construction (arm_log empty => None==None => True;
`tx_diag` computed then unused). The leg now requires ALL of:
  (1) a NON-EMPTY arm_log for the control turn (the fold provably RAN —
      backend lab_state pass fired),
  (2) after_labware == prior_labware with BOTH non-None (no-op wrote nothing),
  (3) >=1 lab_state UNRESOLVED diagnostic in the captured payload/log —
      counted from BOTH captured channels: the wire `pipeline_diagnostics`
      frame (pass_id==lab_state, code startswith lab_state_unresolved) AND the
      env-gated ARM-LOG line's NEW `unresolved_codes` field.
EVIDENCE CHANNEL: the wire done frame (AgentResult) carries NO diagnostics
(verified: types.ts AgentResult has no diagnostics field), so the pass's §7
codes are extended onto the env-gated ARM-LOG line (ChatbotCompilePasses.ts,
LABSTATE_ARM_LOG=1 — inert in production): `… after_labware=…
unresolved_codes=["lab_state_unresolved_labware_reference"]`. drive.py
parse_arm() reads the new token. README leg description updated.
Mutation-kill (d3_mutation_kill.py, run on the REAL 063626Z receipt):
  - REAL turn X (fold never ran, arm_log=[]): PRE-FIX ok=TRUE (the vacuous
    pass — reproduced), POST-FIX ok=FALSE.
  - GENUINE control (fold ran + no-op + unresolved code in ARM-LOG):
    POST-FIX ok=TRUE.
  - GENUINE control (diagnostic rides the WIRE frame): POST-FIX ok=TRUE.
  - turn that WROTE (after != prior): POST-FIX ok=FALSE.
NOTE (honest): re-driving the live control requires the lane stack restarted
on the fixed build (YAML-reload trap) + a turn that reaches the fold; the
current live receipt still has the upstream material-noun block (architect
item) so turn X's fold does not run live. The leg is now CAPABLE of failing
and CAPABLE of passing only on captured evidence — the asserted-by-construction
class is gone (mutation-proven). Post-merge orch re-drive (D13-C) re-runs this
drive.

------------------------------------------------------------------------
D4 MINOR — tie leg is a real tie (GREEN + mutation-proven)
------------------------------------------------------------------------
FIX (LabStateCanonicalShape.test.ts): the two-same-type-plates leg's hint
'plate' (a TOTAL MISS at R3 — normalizeTypeKey('plate')='plate' !=
'96-well-plate') is now '96 well plate' (normalizeTypeKey('96 well plate') ==
normalizeTypeKey('96-well-plate') — R1/R2 miss, R3 sees TWO matches: a TIE).
Mutation-kill (M1, reviewer's exact Mutant 1 `matches[0]` tie-picks-first):
this file now REDs (1 failed | 13 passed) — pre-fix it stayed 7/7 green;
revert => 14/14 GREEN. (runChatbotCompileLabState.test.ts:316-323's tie leg
also still guards the pass path — 5/5.)

------------------------------------------------------------------------
D5 MINOR — empty `order` => R1 default; code/comments/tests agree (GREEN)
------------------------------------------------------------------------
CHOICE: fall back to the R1 default (as rules===undefined does) — the
§5.2-letter option ("absent section => the fold resolves rung R1 ONLY, the
raw path keeps working"), NOT an explicit fail-closed-zero-rung rewrite.
FIX (LabState.ts resolveLabware): `rules && rules.order.length > 0 ? rules
: the R1 defaults` — an empty order is identical to absent rules.
DOC AGREEMENT (all five sites): LabState.ts module header +
LabIdentityRules.order doc + resolveLabware doc; ChatbotCompilePasses.ts
createLabStatePass rules comment; vocabulary.ts interface doc + loader
comment; the YAML section comment + the meta-schema section description.
NEW PASS-SEAM LEG (ChatbotCompilePasses.test.ts): absent DATA section — a
symbolic hint that EQUALS an instanceId resolves via rung R1 (write, no
diagnostic) — the exact pre-fix gap (EMPTY-RULES no-op vs 2-arg write) is
closed and pinned. The pre-existing absent-section leg (symbolic no-op +
diagnostic; raw still writes) stays green.
Mutation-kill (M5): reintroducing `rules?.order ?? ['instanceIdentity']`
(zero rungs for empty order) => the new R1-default leg REDs (1 failed | 1
passed | 47 skipped); revert => 2 passed.

------------------------------------------------------------------------
D6 MINOR — content-bearing classification is DATA (GREEN + probe)
------------------------------------------------------------------------
FIX: new vocabulary DATA section `labStateContentBearingEventTypes:
[add_material, transfer]` (scientist-intent-vocabulary.yaml, the fold-side
twin of the read half's materialBearingEventTypes) + meta-schema declaration
(array, minItems 1, uniqueItems, pattern — same shape as the read half) +
vocabulary.ts frozen per-load read (RawDoc + interface + loader; absent =>
[] fail-closed). The lab_state pass (createLabStatePass) threads the list
into `isContentBearing(event, declaredEventTypes)` at the PASS seam — the
fold module never imports the vocabulary and now carries ZERO event-type
literals: the function is DATA membership (`declaredEventTypes.includes(
event.event_type)`) + a GENERIC carrier probe (does the event declare a
labware-identity carrier: details.labwareId / details.labwareInstanceId /
top-level labwareId / source_labware / destination_labware /
from.labwareId / from.labwareInstanceId — the same generic-read posture as
the rung evaluators over declared tokenFields). A carrier-less event => not
content-bearing => no diagnostic (nothing to surface). This also closes the
D1 invisibility: the destination-only transfer (top-level labwareId = the
destination) IS content-bearing, so its no-op surfaces the §7 diagnostic.
ABSENT-list semantics: no event is content-bearing => no diagnostics
(over-conservative, never-guess-safe) — stated in the YAML, meta-schema,
vocabulary.ts, and the fold doc.
NEW PINS (vocabulary.test.ts): shipped list == [add_material, transfer],
frozen per-load, same array across reads; ABSENT section (vocab-minus-pellet)
=> []. D6 source-scan probe (LabStateCanonicalShape.test.ts): the
isContentBearing body of the shipped fold module contains NO
`event.event_type ===|!== '…'` literal and DOES carry the declaredEventTypes
membership. Mutation-kill (M4, surgical: reintroduce a dead-code literal
comparison in the body): the probe REDs (1 failed | 13 passed) while fold
behavior legs stay green; revert => 14/14. (The full pre-fix function
reintroduction REDs the whole file — the probe plus the D1 pass-seam leg
together kill it.)
COMMENT SITES (the false "add_material|transfer in TS" claims are gone):
LabState.ts (fold doc), ChatbotCompilePasses.ts (pass doc), vocabulary.ts
(D6 doc) all describe the DATA-declared fold-side list.

------------------------------------------------------------------------
D7 MINOR — order/tokenFields consistency pinned (GREEN)
------------------------------------------------------------------------
CHOICE (stated per the reviewer's "state the choice"): a TEST-PIN
(declaration-integrity), NOT a meta-schema length-equality constraint and
NOT reading the rung-id values. Rationale: the reviewer ruled this NOT a
letter violation (§5.2 permits field-name branches inside the generic rung
evaluators), so the minimum fix is a consistency pin; the lint DSL
(exists/nonEmpty/equals/allIn/everyItem/all/any/not + numeric `compare`) and
the Ajv shape the loader validates against cannot express a cross-key length
EQUALITY between `order` and `tokenFields` (no such predicate; verified
against PredicateEvaluator.ts op set). The pin (vocabulary.test.ts):
`order.length === tokenFields.length` (and >= 1) on the SHIPPED vocabulary —
a DATA edit that misaligns the two lists fails the per-load pin suite; the
pre-existing per-load pin already pins the shipped values (3==3). The
fail-closed `continue` on a misaligned index (tail rungs inert) is unchanged
and is the declared safe behavior; the pin keeps the shipped declaration
consistent.

------------------------------------------------------------------------
VERIFICATION (fix head 523ec788, coder-captured)
------------------------------------------------------------------------
TARGETED 8-FILE SPEC-§10 SET (single run):
  ✓ src/compiler/state/LabState.test.ts  (9 tests)
  ✓ src/compiler/state/LabStateCanonicalShape.test.ts  (14 tests)
  ✓ src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts  (49 tests)
  ✓ src/ai/runChatbotCompileLabState.test.ts  (5 tests)
  ✓ src/compiler/state/LabStateCache.test.ts  (5 tests)
  ✓ src/ai/shorthandChat.wellsetFold.test.ts  (3 tests)
  ✓ src/compiler/scientistIntent/vocabulary.test.ts  (22 tests)
  ✓ src/compiler/scientistIntent/wellsetResolver.test.ts  (33 tests)
  Test Files  8 passed (8) / Tests  140 passed (140)
  (pre-fix baseline 123/123 on the 7-file set at 3b282bb9; +17 new legs:
  D1 canonical+pass 2, D2 goldens 5, D5 pass-seam 1, D6 vocab 2 + probe 1,
  D7 1, + LabStateCache 5 already in the 8-file set => arithmetic: 123+17=140
  on the 7-file set is 140-5=135, +5 LabStateCache = 140 total — zero NEW
  failing files, every file passes.)
TYPECHECK: npx tsc -p . --noEmit -> TSC_EXIT=0, 0 error lines
(exactOptionalPropertyTypes=true; the isContentBearing 2nd param is a
`readonly string[] = []` default — never `| undefined`; the new optionals in
the pass output remain conditionally spread).
CONSUMERS (beyond the 8-file set): Prompt04Debug4/6/8, Prompt03Green,
spine4Registration (19) all GREEN (23/23). Prompt02Green + Prompt04DeepDebug
fail identically AT BASE (stash-proven) with PipelineLoadError ENOENT
`/mnt/vast/home/brad/git/wt/schema/…` — a pre-existing fixture path-resolution
environment issue (those tests resolve `schema/` two levels above server/),
NOT a regression of this fix-run.
HARDCODE SWEEPS (spec §10, on 9d020514...HEAD):
  1. well-address literals in TS/YAML diff (excl tests/md): EMPTY (exit 1) PASS
  2. plate1|96-well|trypsin|DMEM in the LabState.ts diff: EMPTY (exit 1) PASS
  3. `verb ===` in LabState.ts: EMPTY (exit 1) PASS
  4. findLabwareByHints|includes(|indexOf(|startsWith( in LabState.ts: exactly
     ONE hit — `declaredEventTypes.includes(event.event_type)` (the D6 DATA
     membership; a declared exception, NOT fuzzy matching — no
     findLabwareByHints/indexOf/startsWith).
MUTATION-KILL SUMMARY (scratch /tmp/fix1-mut, worktree untouched; each probe
REDs then reverts GREEN 14/14):
  M1 tie-picks-first           -> D4 tie leg RED (1f/13p)   [D4]
  M2 srcHint event.labwareId   -> D1 destination-only leg RED (1f/13p) [D1]
  M3 base-semantics drift      -> 4 D2 goldens RED (4f/10p) [D2]
  M4 hardcoded event-type list -> D6 source-scan probe RED (1f/13p) [D6]
  M5 zero-rung empty order     -> D5 R1-default pass leg RED (1f/1p/47s) [D5]
  D3: pre-fix formula on the REAL 063626Z receipt turn X = TRUE (vacuous);
      post-fix = FALSE; genuine control = TRUE; wrote-turn = FALSE. [D3]
  (M1/M2/M3 mirror the reviewer's Mutant 1/4/3 classes exactly.)

DEVIATIONS / HONEST LIMITATIONS (fix-run):
  - D3: the live control leg could not be RE-DRIVEN green in this run (the
    lane stack restart + a fold-reaching control turn requires the upstream
    material-noun question resolved — architect item, unchanged). The leg is
    mutation-proven non-vacuous and the evidence channel (ARM-LOG
    unresolved_codes) is implemented; the post-merge orch re-drive is the
    clearance path.
  - D7: pin (test) rather than meta-schema constraint — choice + rationale
    stated above (the reviewer's minimum-fix direction; NOT a letter
    violation).
  - The turn2 `expected_48` arithmetic (16 distinct wells, not 48 — reviewer
    axis note O1) is a SPEC label, not a defect of this item; the drive
    inherits the label. NOT changed (acceptance-bar text is orch/architect's;
    flagged here so the post-merge read compares against 16).
  - The live no-seed drive (acceptance line 1) remains BLOCKED by the
    upstream material-noun gate exactly as in the prior report §8 (unchanged
    by this fix-run; no resolve_nouns file touched).


## FIX RUN 2 (l2t0915)

ITEM: L2-LABSTATE-CONTENTS-1 (lane 2) — harness-only fix run (cycle-2 N1 BLOCKER + D3 MAJOR).
CODE HEAD: a69e4076 (worktree commit; pre-fix head was 694f5e78). Product code untouched
(the cycle-2 reviewer ACCEPTED the product diff; any product hunk = automatic reject).
WORKTREE: /mnt/vast/home/brad/git/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t2255
OWNED FILES TOUCHED (exactly):
  - .hermes/plans/harness/labstate-contents-drive/drive.py      (parse_arm + helpers)
  - .hermes/plans/harness/labstate-contents-drive/README.md     (parse_arm contract section)
  - .hermes/plans/harness/labstate-contents-drive/test_parse_arm.py (NEW — committed fixture)
  - this report (append)

### DEFECTS CLOSED

N1 BLOCKER (drive.py:205-225 + its dependency on the emitter format at
ChatbotCompilePasses.ts:1895): parse_arm split each token at rfind and handed the
WHOLE REST OF THE LINE to json.loads — only the last token could ever parse.
60db0a3a appended unresolved_codes= AFTER after_labware=, so after_labware's tail
carried ' unresolved_codes=[...]', json.loads raised 'Extra data', and the field
degraded to a raw string (LEG1/LEG2/LEG3/LEG4 False forever). The turn= tag was
also the whole tail (pre-existing, named in the review).

FIX: each payload is now parsed from its OWN bounded slice:
  - _depth0_markers(): finds the emitter's field separators only at
    brace/bracket depth 0, preceded by start-of-line/whitespace — a token
    occurrence INSIDE a payload's JSON string (e.g. a materialId containing
    'turn=9') is payload content, not a separator.
  - _bounded_payload(): closes each payload at its own balanced
    braces/brackets, respecting JSON double-quoted strings + backslash escapes
    (a brace inside a string cannot terminate the slice early).
  - tolerant of BOTH the pre-60db0a3a 3-token form (the 20261030T063626Z
    receipts' format — unresolved_codes -> None) and the current 4-token form,
    in either token order.
  - turn= parses to the tag only (bounded by the next depth-0 marker).
  - malformed line -> all-None, no exception; a malformed single payload
    degrades that field to None while well-formed neighbors still parse.
  - raw_payload() (the whole-tail semantics — the defect itself) is removed.

D3 MAJOR (closes with N1): the control leg's non-vacuous assertions
(non-empty arm_log, after==prior both non-None, >=1 lab_state unresolved
diagnostic) were kept UNCHANGED in drive.py (lines ~479-480); the parser fix
makes them satisfiable. Proof is now a mutation-style probe on REAL receipt
lines driven through the REAL parse_arm (not hand-built dicts — the exact data
path the legs consume): the fixture's leg predicates are copied VERBATIM from
drive.py and run on parse_arm output. Raw results below (section V2/D3-raw):
  - no-op control line (emitter-shaped, 4-token, after==prior) +
    unresolved_codes=['lab_state_unresolved_labware_reference'] -> LEG4 True
    (the pre-fix parser could NEVER yield this — after_labware was a str);
  - same no-op WITHOUT a code -> False (condition 3 unsatisfied);
  - WROTE turn (after != prior) -> False (the no-op equality has teeth);
  - PRE-FIX 3-token no-op line -> False (condition 3 unsatisfiable — the codes
    channel does not exist on that form);
  - the REAL receipts line (wrote turn, 3-token) -> False;
  - garbage line -> False, no exception;
  - empty arm_log -> False (the original D3 vacuous None==None path stays dead).
The reviewer's invalid-evidence class (bypassing parse_arm with hand-built
dicts) is structurally impossible in the fixture: every probe's input is
drive.parse_arm(<emitter-shaped line>).

### V1 — fixture test (plain python3, exit 0)

Command: python3 .hermes/plans/harness/labstate-contents-drive/test_parse_arm.py
(pins the EMITTER's exact line format — python port of the ChatbotCompilePasses.ts:1895
template, compact JSON, turn= raw number — round-tripping through parse_arm;
FORM-AGNOSTIC: no TURNS strings, per the ruling Q4 note.)

RAW OUTPUT (full):
  ok   rt4.turn tag only
  ok   rt4.prior dict
  ok   rt4.after dict
  ok   rt4.codes list
  ok   rt4.prior round-trips
  ok   rt4.after round-trips
  ok   rt4.codes sorted-unique
  ok   rt4.empty prior {} stays dict
  ok   rt4.empty after dict
  ok   rt4.empty codes [] stays list
  ok   pre.turn tag only
  ok   pre.prior dict
  ok   pre.after dict (NOT a string)
  ok   pre.codes absent->None
  ok   pre.nontrivial after dict
  ok   pre.nontrivial codes None
  ok   pre.nontrivial turn
  ok   turn.tag is the bare number
  ok   turn.no token bleed into tag
  ok   inpay.turn is the REAL tag
  ok   inpay.after dict intact
  ok   inpay.codes intact
  ok   inpay.escaped-quote payload
  ok   garbage all-None 'totally not an arm log line'
  ok   garbage all-None ''
  ok   garbage all-None '[lab_state ARM-LOG]'
  ok   garbage.no exception (unbalanced)
  ok   garbage.partial salvage turn
  ok   garbage.not-json degrades to None
  ok   garbage.well-formed neighbor survives
  ok   garbage.turn salvage
  ok   d3.noop control LEG4 TRUE (mutation probe: real parse_arm)
  ok   d3.noop without code LEG4 False
  ok   d3.wrote turn LEG4 False
  ok   d3.pre-fix form LEG4 False (no codes channel)
  ok   d3.real receipts line LEG4 False (wrote turn)
  ok   d3.garbage LEG4 False (no exception)
  ok   d3.empty arm_log LEG4 False (vacuity gone)
  ok   n1.LEG1 satisfiable (after is a dict, populated)
  ok   n1.LEG2 satisfiable (prior carries turn-1 materialId)
  ok   n1.LEG3 satisfiable (ledger populated)
  ok   n1.old-parser repro (rest-of-line json.loads raises)
  PARSE_ARM FIXTURE: 42 checks passed (exit 0)
EXIT=0

Acceptance mapping (task VERIFY step 1):
  - pre-60db0a3a 3-token line -> after_labware dict, unresolved_codes absent/None:
    pre.after dict (NOT a string) + pre.codes absent->None (and the REAL receipts
    line itself, below).
  - 4-token line -> after_labware dict + unresolved_codes list:
    rt4.after dict + rt4.codes list (and the raw N1 probe below).
  - turn= parses to the turn tag only: turn.tag is the bare number.
  - garbage line -> all-None, no exception: garbage all-None (3 lines) +
    garbage.no exception (unbalanced).

### V2 — REAL receipt lines through OLD (694f5e78) vs FIXED parse_arm

Receipts: /home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/20261030T063626Z
(the review's named receipts) and 20261030T064740Z (same 3-token form).
OLD parser loaded read-only via `git show 694f5e78:...drive.py` (no source edit);
NEW parser = the committed fix. Raw before/after types:

  receipt 20261030T063626Z turn A line 0
  RAW LINE : [lab_state ARM-LOG] turn=1 prior_labware={} after_labware={"LWI-1":{}}
    turn             OLD type=str       NEW type=str
    prior_labware    OLD type=str       NEW type=dict      <-- CHANGED (was a string)
    after_labware    OLD type=dict      NEW type=dict      (dict in both: last-token
                                                            rest-parsing — why only the
                                                            LAST token ever worked)
    unresolved_codes OLD type=NoneType  NEW type=NoneType
  receipt 20261030T064740Z turn A line 0: IDENTICAL shape (same 3-token form).

LEG1 predicate (drive.py:367-368 verbatim) on turn A's REAL line:
  turn A after_labware OLD type: dict | NEW type: dict
  LEG1 isinstance-dict gate: TRUE in both (the receipts line is the 3-token form
  where after_labware was the last token); the population gate (any non-empty
  well) is correctly False for this WROTE-but-empty-wells plate-placement turn —
  unchanged by the parser fix (content, not parsing).

THE N1 PROBE — the 4-token (current emitter) line, OLD vs NEW (raw):

  RAW 4-token line (current emitter form, ChatbotCompilePasses.ts:1895):
  [lab_state ARM-LOG] turn=1 prior_labware={} after_labware={"LWI-1":{"A1":[{"materialId":"mat-A","kind":"raw"}]}} unresolved_codes=[]

  OLD parser @ 694f5e78 (pre fix-run 2):
    turn             type=str      value='1 prior_labware={} after_labware={"LWI-1":{"A1":[{"materialId":"mat-A","kind":"raw"}]}} unresolv...'
    prior_labware    type=str      value='{} after_labware={"LWI-1":{"A1":[{"materialId":"mat-A","kind":"raw"}]}} unresolved_codes=[]'
    after_labware    type=str      value='{"LWI-1":{"A1":[{"materialId":"mat-A","kind":"raw"}]}} unresolved_codes=[]'
    unresolved_codes type=list     value=[]
  NEW parser @ a69e4076 (fix run 2):
    turn             type=str      value='1'
    prior_labware    type=dict     value={}
    after_labware    type=dict     value={'LWI-1': {'A1': [{'materialId': 'mat-A', 'kind': 'raw'}]}}
    unresolved_codes type=list     value=[]

  isinstance(after_labware, dict): OLD=False NEW=True   <- N1: LEG1/LEG3 isinstance-dict gate
  old rest-of-line json.loads(after tail): RAISES JSONDecodeError('Extra data: line 1 column 56 (char 55)')
    <- raw_payload degraded it to a str (exactly the reviewer's raw probe, reproduced
       on this worktree's committed pre-fix code)

D3-raw (mutation probes on REAL parse_arm output, from the V1 fixture run — the
leg predicates are drive.py's verbatim; the inputs are parse_arm of
emitter-shaped lines, never hand-built dicts):
  d3.noop control LEG4 TRUE (mutation probe: real parse_arm)      [after==prior dicts + 1 unresolved code]
  d3.noop without code LEG4 False
  d3.wrote turn LEG4 False
  d3.pre-fix form LEG4 False (no codes channel)
  d3.real receipts line LEG4 False (wrote turn)
  d3.garbage LEG4 False (no exception)
  d3.empty arm_log LEG4 False (vacuity gone)
  4-token no-op control line (emitter shape, post-60db0a3a) via the real parser:
    after_labware type=dict prior_labware type=dict unresolved_codes=['lab_state_unresolved_labware_reference']
    LEG4 core (non-empty, after==prior both non-None, >=1 unresolved code): True

### V3 — no product-file hunks

RAW (worktree, after the fix commit):
  $ git diff --name-only 694f5e78..a69e4076
  .hermes/plans/harness/labstate-contents-drive/README.md
  .hermes/plans/harness/labstate-contents-drive/drive.py
  .hermes/plans/harness/labstate-contents-drive/test_parse_arm.py
  $ git diff --stat 694f5e78..a69e4076
   .../harness/labstate-contents-drive/README.md      |  32 ++
   .hermes/plans/harness/labstate-contents-drive/drive.py | 139 ++++++--
   .../labstate-contents-drive/test_parse_arm.py      | 384 +++++++++++++++++++++
   3 files changed, 533 insertions(+), 22 deletions(-)
=> ONLY owned harness files. Zero hunks in server/**, schema/**, or any
product file. drive-mint.py / labstate-worktree-stack.sh (other harness files)
untouched (grep: their own separate parse_arm in drive-mint.py:65 is NOT part
of this item's owned list — not modified).

### V4 — tree clean at exit; all work committed on the branch

RAW:
  $ git log --oneline -3
  96860418 [LABSTATE][FIX2-REPORT] FIX RUN 2 (l2t0915) appended to the item report: N1/D3 raw OLD-vs-NEW parse evidence, 42-check fixture, no-hunks + clean-tree proof; code fix head a69e4076
  a69e4076 [LABSTATE][FIX2] N1 BLOCKER: parse_arm parses each ARM-LOG payload by its own bounded slice ...
  694f5e78 [LABSTATE][FIX1-REPORT] FIX RUN 1 (l2t0405) ...
  $ git status --porcelain
  (empty — clean)

### DEVIATIONS / HONEST LIMITATIONS (fix-run 2)

- The live re-drive (orch-owned, ruling Q4) was NOT run: no TURNS strings were
  edited (orch owns that with the re-drive), no stack was booted or restarted,
  no port was hit. The parser is proven on (a) the REAL captured receipt lines
  and (b) emitter-shaped 3- and 4-token lines; the re-drive's turns will
  exercise the same parser path (drive.py:arm_log capture -> parse_arm).
- The 20261030T063626Z receipts only carry the 3-token form (they predate
  60db0a3a) and only turn A has an ARM-LOG line in them (turns 1/1b/2/X were
  pre-fold — no arm line). The 4-token form is pinned by the committed emitter
  port in the fixture + the N1 probe above, not by a captured 4-token receipt
  (none exists yet — the re-drive will produce the first).
- Cross-language JSON byte-identity between the TS emitter (JSON.stringify)
  and the python fixture (json.dumps compact) is NOT claimed: both emit compact
  JSON of the same shape; the fixture pins shape (token order, compactness,
  bounded payloads), which is all parse_arm depends on.
- N2/N3/N4/N5 (cycle-2 MINORs, product/doc scope) were NOT touched: outside
  this fix run's owned file boundary (the cycle-2 review's BLOCKING scope was
  N1 + D3 only).
- The turn2 `expected_48` label (16 distinct wells; reviewer axis note O1)
  remains a spec label carried by the drive — unchanged (flagged in FIX RUN 1).

L2LABSTATECONTENTS1 FIX2 DONE a69e4076f90e0216c4ebbc71b9cdae594aa3aa9e
STATUS: fixrun2-complete
