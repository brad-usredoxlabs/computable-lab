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
