# SPEC — L2-LABSTATE-CONTENTS-1 (lane 2)
# Contents-ledger canonical shape: the lab_state fold consumes the shipped expander
# add_material/transfer shape; symbolic labwareId resolves via a DATA-declared rule;
# closes ED-WELLSET-AC2-LIVE.
#
# COMPOSED 2026-10-29 (cl-spec-composer, unit l2t1515). Basis: task block
# /home/brad/.hermes/cl/lanes/2/task-list.md (id L2-LABSTATE-CONTENTS-1, file end) +
# BINDING architect ruling decisions/WELLSET-D13-ruling-l2t1515.md (RULING: B).
# The direction is SETTLED — the lab_state fold consumes the shipped expander shape.
# Do NOT re-litigate: no change to simpleVerbs expanders, no change to the wellset
# resolver's read half, no second event vocabulary.
#
# Base: trunk cl/integration-2 TIP AFTER the L2-WELLSET-RESOLVER-1 fix2 merge
# (deps line). Composer measured at trunk ba1cdc9e (pre-WELLSET-merge); every cite
# below is first-hand. CLAIM GATE: do not start while the WELLSET fix2 worktree
# (/mnt/vast/home/brad/git/wt/L2-WELLSET-RESOLVER-1-lane2-l2t2230, tip aa33793d)
# is live or unmerged — this item edits files the resolver branch's tests cover
# (vocabulary.ts/.yaml consumer set) and the fold those tests read.

## 1. Goal (one sentence)

Make the lab_state fold (server/src/compiler/state/LabState.ts) fire on the event
shape the shipped expanders actually emit — resolving the symbolic top-level
`labwareId` to a snapshot instance through a DATA-declared, never-guess identity
rule, and normalizing a string `material` to a MaterialRecord without inventing
ids — so Brad's worked example ("add material A to A1-H1" … "mix all wells that
have material" -> A1:H2) is live on the product path with NO seeded state, closing
ED-WELLSET-AC2-LIVE.

## 2. The ruling spine (binding — from decisions/WELLSET-D13-ruling-l2t1515.md)

D13-B. Contents-ledger wiring rides L2-LABSTATE-CONTENTS-1: the lab_state fold is
the single consumer; the expander's shipped shape is the canonical wire shape for
add_material; symbolic labwareId resolves to an instance via a DATA-DECLARED rule
(schema/declaration, not hardcoded string matching), same never-guess contract as
the wellset resolver; material string normalizes to a material record without
inventing ids. applyTransfer's from/to contract is in-scope for the same shape
decision. No double vocabulary: after this item, exactly one event shape feeds the
ledger from both the shorthand and raw paths.

D13-C. ED-WELLSET-AC2-LIVE transfers to L2-LABSTATE-CONTENTS-1 and clears only on
its post-merge live multi-turn drive. The pending-document layer working
current-turn is NOT accepted as clearing it.

Acceptance bar (3 lines, verbatim from the ruling — this is the spec's spine):
1. Live multi-turn P3 drive, no seeded state: turn 1 "add material A to A1-H1"
   accepted leaves snapshotAfter.labware populated and the non-empty snapshot
   persisted; turn 2 "mix all wells that have material" unions to A1:H2 from the
   committed ledger.
2. One canonical shape: exactly one add_material event vocabulary feeds
   LabStateSnapshot.labware from both shorthand and raw paths; symbolic labwareId
   resolves via a data-declared rule; no new local term and no invented material ids.
3. Regressions hold: fix2's seeded proof and the pending-document union tests still
   pass; ED-WELLSET-AC2-LIVE closes at the post-merge --all drive with receipts.

Acceptance criteria verbatim from the task list (verified by:):
  (1) Live multi-turn P3 drive, NO seeded state: turn 1 add accepted leaves
  snapshotAfter.labware populated AND the non-empty snapshot persisted; turn 2 mix
  resolves A1:H2 from the committed ledger (post-merge drive with receipts clears
  ED-WELLSET-AC2-LIVE).
  (2) One canonical shape: evidence that exactly one add_material event vocabulary
  feeds the ledger from both paths; symbolic resolution is data-declared; no
  invented material ids.
  (3) Regressions hold: WELLSET fix2's seeded proof + pending-document union tests
  still green.

## 3. Grounded state (composer first-hand, all commands re-runnable)

Reads at trunk /mnt/vast/home/brad/git/cl-integration-2 (tip ba1cdc9e,
`git -c core.fileMode=false log --oneline -1`), WELLSET fix2 reads at
/mnt/vast/home/brad/git/wt/L2-WELLSET-RESOLVER-1-lane2-l2t2230 (tip aa33793d):

- server/src/compiler/state/LabState.ts
  - applyCreateContainer :110-159 — mints `LWI-<mintCounter+1>` at FOLD time
    (or reuses details.instanceId), writes snapshot.labware[instanceId] and the
    deck slot. This is why the expander can never emit the fold's demanded shape
    (ruling grounding 1).
  - applyAddMaterial :161-208 — early-return unless details.labwareInstanceId AND
    details.well AND details.material is an OBJECT with materialId. On the
    shorthand path (string material, no labwareInstanceId) the fold NEVER fires.
  - applyTransfer :210-319 — reads details.from / details.to OBJECTS, each with
    labwareInstanceId + well.
  - applyEventToLabState :325-340 — the switch; one fold, three handled verbs.
  - buildMaterialRecord :91-104 — the exactOptionalPropertyTypes-safe record
    builder (optional fields set only when !== undefined). Reuse it; never widen it
    to accept undefined.
  - LabStateSnapshot :55-62 — { deck, mountedPipettes, labware, reservoirs,
    mintCounter, turnIndex }; LabwareInstance :28-34 — { instanceId, labwareType,
    slot, orientation, wells }. NO title/identity carrier field today.
- server/src/compiler/biology/verbs/simpleVerbs.ts
  - addMaterialExpander :522-646 — BOTH emit branches (legacy per-wells :594-618,
    modern single :619-642) emit details.well + STRING-or-spread material +
    top-level SYMBOLIC labwareId (:616/:640 `...(labwareId ? { labwareId } : {})`);
    NEITHER emits labwareInstanceId. Composition arm additionally emits
    composition_snapshot / formulation_kind / material_ref (:606-614, :630-638) —
    material_ref = { kind: 'draft', id: 'mint:<label>', label } (:509).
  - transferExpander :675-718 — emits details.source_labware / destination_labware
    (symbolic strings), source_well / well / source_wells / wells, volumeUl+volume,
    source_material_ref, role; top-level labwareId = target. Emits NO from/to
    objects and NO labwareInstanceId — so applyTransfer also never fires on the
    shorthand path (same dead-write class; D13-B names it in-scope).
  - createContainerExpander :651-664 — details { slot, labwareType } only; the
    labwareType falls back to the declared default '96-well-plate'; no label
    carrier today.
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts
  - createLabStatePass :1729-1753 — THE sole caller of applyEventToLabState
    (verified repo-wide: ruling grounding 3 + composer grep). Reads prior from
    state.input.labState, folds directives then events, returns
    { events, snapshotAfter }.
  - mint_materials pass :1904+ — the ONLY producer today that emits the fold's
    demanded shape (details.labwareInstanceId + material object, :1993-2003); its
    materialId comes from the scientist-declared namingPattern (:1954) — the
    shipped precedent that a scientist-given label is a legitimate materialId
    carrier (cite this for the "no invented ids" argument, §5.3).
  - resolve_prior_labware_references :1030+ / findLabwareByHints :963+ —
    substring/token-overlap heuristics: legacy, do NOT replicate in the fold
    (reviewer bait, §12).
- Pipeline declarations (both include lab_state):
  schema/registry/compile-pipelines/chatbot-compile.yaml :178-181 and
  scientist-intent-compile.yaml :87-90 — `lab_state, family: emit,
  depends_on: [resolve_roles]`. The shorthand surface rides
  compileScientistIntent (server/src/compiler/scientistIntent/compileScientistIntent.ts
  :299 feeds `labState: deps.priorLabState ?? emptyLabState()`, :380-383 republishes
  labStateDelta.snapshotAfter).
- Persistence plumbing (rides on the WELLSET merge — VERIFY PRESENT at claim, it is
  merged code at aa33793d, do not re-plumb):
  - server/src/compiler/state/LabStateCache.ts — per-conversation LRU of snapshots.
  - runChatbotCompile.ts :242-247 prior = explicit arg > cache.get(convId) > empty;
    :596-599 writes snapshotAfter back.
  - WELLSET fix2 threads the SAME cache on the LIVE shorthand path:
    ShorthandCompileDeps.priorLabState (shorthandChat.ts, conditional spread),
    AgentOrchestrator reads getDefaultLabStateCache().get(conversationKey) and
    PUTs compiledSh.terminalArtifacts.labStateDelta.snapshotAfter back
    (both the live compile site and the fold/recompile site, conversationKey =
    the one deriveContextCacheKey derivation).
  => After WELLSET merges, the ONLY remaining gap to Brad's example is exactly this
  item: the fold ignoring the expander's shape. The read/write plumbing and the
  read-half resolver already exist.
- The read half (merged on WELLSET's terms, DO NOT MODIFY): wellsetResolver.ts
  buildContentsLedger keys the committed layer by snapshot.labware instanceId and
  folds the pending layer through ONE identity space (foldPendingKey: hint is a
  committed instanceId -> document slot resolution -> unique contents-carrying
  labwareType match; never-guess; symbolic hints are NEVER pins). The fold's new
  resolution rule (§5.1) deliberately mirrors foldPendingKey's ladder so the WRITE
  half and READ half agree on identity — but implemented independently in
  LabState.ts (the fold stays a pure function; it cannot import the resolver).
- Data-DECLARATION precedents for the rule being DATA (this is the idiom to copy):
  schema/scientist-intent/scientist-intent-vocabulary.yaml gained top-level DATA
  lists wellsetValueTokens (:883) and materialBearingEventTypes (:893) on fix2;
  the meta-schema scientist-intent-vocabulary.schema.yaml (:175/:189) declares
  their shape; vocabulary.ts reads them per-load, frozen, fail-closed to [] when
  the section is absent (vocabulary.ts :260-269). Membership is consumed as DATA —
  no token literal in TS (the B3 boundary).
- The wellset resolver's never-guess vocabulary (the contract to mirror, NOT
  re-implement): zero-or-unique-match-only; ambiguous -> ZERO materialization +
  ONE clarification on the existing unresolved-fact channel; symbolic hints are
  never pins; unmappable evidence never silently creates a second labware.

Composer solo baseline (measured at ba1cdc9e, cwd=server):
  npx vitest run src/compiler/state/LabState.test.ts
    src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts
    src/ai/runChatbotCompileLabState.test.ts
  -> 3 files, 55 tests, 55 passed (LabState 9, ChatbotCompilePasses 44,
     runChatbotCompileLabState 2). This is the REAL base-state number.
Fix2 worktree regression surface (counts measured, tests run by their own gates):
  wellsetResolver.test.ts = 29 it(), shorthandChat.wellsetFold.test.ts = 2 it().

## 4. The fold's new input contract

The canonical wire vocabulary is the SHIPPED EXPANDER SHAPE. `labwareInstanceId`
is NOT a second vocabulary — it is the same single shape with the labware identity
already resolved (a resolved identity IS one rung of the resolution ladder). Both
carriers must land contents in LabStateSnapshot.labware identically; the legacy raw
shape (labwareInstanceId / from / to) is byte-stable-regression-pinned, never
reinterpreted.

### 4.1 add_material — accepted details (new contract for applyAddMaterial)

A fold attempt proceeds (contents written) iff, after identity resolution:
- TARGET LABWARE: exactly one instance, found by (first hit wins, ladder order):
  (a) details.labwareInstanceId exact-identifies snapshot.labware[id] (raw path,
      existing behavior preserved byte-for-byte); else
  (b) the symbolic hint resolves via the DATA-declared ladder of §5.1, fed from
      details.labwareId ?? event.labwareId (top-level).
- WELL: details.well (single string, existing behavior) OR details.wells (string[])
  — the modern branch may carry wells[] after the shorthand binder expands a range
  (shorthandChat.ts Task 22 arm rewrites well -> wells for deck-provable events);
  each element folds its own append, same semantics as per-well expand fan-out.
- MATERIAL: (a) details.material OBJECT with materialId (existing behavior,
    byte-stable) OR (b) the string/spread material of the shipped expander shape,
    normalized per §5.3 (string `details.material` OR the spread detail fields
    kind/volumeUl/properties/economics + details.material_ref when present).
VOLUME: the expander rides volumeUl / volume at DETAILS level (not inside
material); the normalized record's volumeUl takes material.volumeUl ??
details.volumeUl (declared numeric only; the {value,unit} volume object is NOT
converted — unit honesty, same rule simpleVerbs already honors).
Any failed rung (zero or multiple instance matches; no material identity at all)
=> NO-OP fold (existing early-return shape preserved — never half-write, never
create a labware, never pick) + a lab_state PASS diagnostic (§6).

### 4.2 transfer — from/to (same decision, D13-B names it in-scope)

applyTransfer accepts, in order:
(a) details.from / details.to objects with labwareInstanceId + well — existing raw
    path, byte-stable pin required.
(b) the shipped transferExpander shape: from = { source_labware (symbolic hint) ,
    source_well }, to = { destination_labware (symbolic hint), well }. Each side
    resolves through the SAME §5.1 ladder; both sides must resolve uniquely or the
    fold no-ops + diagnostic. Existing volume semantics (top-of-stack deduction)
    are untouched — only identity acquisition changes. source_material_ref is a
    carrier, not a directive: transfer moves what the SOURCE WELL's records hold
    (existing ledger semantics preserved).
(c) Multi-well carriers (source_wells / target wells[] on the expander shape):
    fold pairwise-by-address ONLY where a single unambiguous source->destination
    pairing exists (same-index wells[] pairing across source_wells/wells of equal
    length); anything else is a no-op + diagnostic (never-guess beats
    best-effort pairing).

### 4.3 create_container — one deck-contract change (§6): the instance records its
declared identity tokens at mint time so the §5.1 ladder has something to resolve
against on later turns. No event-shape change to createContainerExpander.

## 5. The DATA-declared resolution rule (the item's heart)

### 5.1 The ladder (never-guess, mirrors wellsetResolver.foldPendingKey)

The fold resolves a symbolic labwareId hint against the snapshot in this declared
order; FIRST rung that yields exactly one instance wins; zero matches or a tie at
any rung => unresolved => no-op fold + pass diagnostic. NEVER: substring/token
overlap (findLabwareByHints is the anti-pattern), never a second labware created,
never a pick among ties.
  R1 identity: hint === snapshot.labware[id].instanceId (also covers deck ids when
     they ARE instance ids — see §6).
  R2 declared identity tokens: hint trim+casefolded EXACTLY equals one of the
     instance's declared identityTokens (see §6 for the carrier; trim+casefold is
     the shipped deck-name-match normalization precedent — exact identity under a
     declared normalization, not fuzzy matching).
  R3 unique declared-type: hint trim+casefold-normalized (non-alnum collapsed)
     exactly equals EXACTLY ONE instance's normalized labwareType (unique-match
     only — this is the fold-side twin of foldPendingKey rung 3 and of the
     mint_materials `labwareType === placementLabwareHint` exact-match at
     ChatbotCompilePasses.ts:1936-1939; the moment two instances share the type,
     it is unresolved, never first-wins).

### 5.2 The DATA declaration (so R2/R3 are declaration, not TS policy)

New top-level DATA section on the scientist-intent vocabulary — the fix2 idiom,
followed exactly (meta-schema shape + per-load frozen read + fail-closed absent arm
+ a RED pin that the pre-change meta-schema REJECTS a fixture carrying the section):

  schema/scientist-intent/scientist-intent-vocabulary.yaml
    labwareIdentityResolution:
      order: [ instanceIdentity, declaredIdentityTokens, uniqueLabwareType ]
      tokenFields: [ instanceId, identityTokens, labwareType ]

  schema/scientist-intent/scientist-intent-vocabulary.schema.yaml — declare the
    section (ordered string list + tokenFields list; enum of the three rung ids).
  server/src/compiler/scientistIntent/vocabulary.ts — the frozen per-load read
    (copy the wellsetValueTokens/materialBearingEventTypes arm verbatim in shape:
    absent section => fail-closed empty => the fold resolves rung R1 ONLY, the
    raw path keeps working, fail-closed never-guess).
  TS NEVER contains a rule string, a verb branch, a field-name branch beyond the
  generic rung evaluators: rung ids are data, the interpreter is a generic
  field-identity evaluator over the tokenFields the data names (PROTO-AI-3's
  generic-evaluator doctrine applies).
  Consumers to update exhaustively (fix2 precedent — the loader union + RawDoc
  mirror): vocabulary.ts RawDoc, ScientistIntentVocabulary interface, any
  exhaustive-kind consumers, promptShapeParity / vocabularyMirrorDrift tests —
  re-run them; the intent.compile.system mirror line only changes IF the frozen
  contractBlock width shifts (fix2's discipline: same commit as the data change).
  Thread the loaded resolution data into the fold at the pass seam, NOT by
  importing the vocabulary into LabState.ts (keep LabState pure):
  applyEventToLabState(snapshot, event, labIdentityRules?) — optional 3rd arg,
  exactOptionalPropertyTypes-safe; createLabStatePass loads the vocabulary (it is
  the sole caller — ruling grounding 3 makes this a one-line-thread change) and
  passes the rules; absent rules => rung R1 only => every existing test byte-
  unchanged.

### 5.3 Material normalization — no invented ids (pin this wording in code comments)

For the string/spread form (details.material is a string, or the modern branch
spread material fields with no materialId):
- If details.material_ref carries a string id (composition arm emits
  material_ref = { kind: 'draft', id: 'mint:<label>', label }): record =
  { materialId: material_ref.id, kind: material_ref.label ?? the string } — the id
  is the compiler's EXISTING mint: draft-material convention (simpleVerbs.ts:509,
  shipped), copied verbatim, never synthesized.
- Else if details.material is a non-empty string L: record = { materialId: L,
  kind: L } — VERBATY identity passthrough of the scientist's own word. This is
  NOT an invented id: mint_materials already mints materialIds from the
  scientist-declared namingPattern (ChatbotCompilePasses.ts:1954) and
  ProtocolIntentLowering.ts:79-83 carries materialId from the lowered intent's
  own materialRef. NO minting (no MAT-N, no hash, no slug, no lowercasing of the
  materialId VALUE). kind stays the verbatim label so the resolver's
  contentHint/material semantics keep working.
- Else (no material identity at all): no-op + diagnostic. NEVER fabricate.
- Volume/properties/economics ride via the existing buildMaterialRecord builder.

## 6. The deck contract change (LabStateSnapshot, ruling "the deck contract")

- LabwareInstance gains `identityTokens?: string[]` (optional —
  exactOptionalPropertyTypes: the key is ABSENT when empty, never undefined;
  structuredClone-safe plain strings).
- applyCreateContainer populates it from DECLARED carriers only, verbatim,
  no normalization at write time (normalization lives in the rung evaluators):
  details.labwareId ?? event.labwareId ?? details.title ?? details.label — whichever
  string carriers the creating event happens to carry (mint_materials'
  create_container carries placementLabwareHint as instanceId/labwareType today;
  shorthand create_container with a named plate: the binder may write
  details.labwareId — shorthandChat Task 21 arm). A create_container with no label
  carrier => key ABSENT (rung R2 inert for that instance; R3 still applies).
- Do NOT add title/recordId as new required fields and do NOT rename anything:
  wellsetResolver's CommittedLabwareEntry already reads optional title/recordId
  via duck-typing — additive optional fields only, the merged resolver keeps
  compiling and passing untouched.

## 7. Diagnostics (the fold is pure; reporting rides the pass)

lab_state is family: emit and runs AFTER validate — there is NO clarification
channel at the fold and NO honest bar can be raised from inside a pure function.
The never-guess surface for this item is: no-op fold + a lab_state pass diagnostic
{ severity: 'warning', code: 'lab_state_unresolved_labware_reference' (or sibling
code for material), pass_id, details: { hint, event_type, eventId } } collected by
createLabStatePass (it must count the no-op attempts — applyEventToLabState
returns the same snapshot object on early-return today; the pass can compare
reference identity, or the fold returns an outcome record — coder's choice, must
be pin-tested; if the signature changes, the sole caller is the only consumer to
update). The scientist-facing never-guess CLARIFICATION for contents wellsets
remains the WELLSET resolver's jurisdiction (merged) — do not duplicate it here.

## 8. Files

IN SCOPE (owned by this item, off post-WELLSET trunk):
- server/src/compiler/state/LabState.ts (fold contract §4-§6)
- server/src/compiler/state/LabState.test.ts (RED-first legs; raw-shape byte-stability pins)
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts (createLabStatePass ONLY:
  rules threading + diagnostics; do not touch neighboring passes)
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts (lab_state pass legs)
- schema/scientist-intent/scientist-intent-vocabulary.yaml (+ .schema.yaml meta) —
  the labwareIdentityResolution DATA section ONLY (do not touch WELLSET's sections)
- server/src/compiler/scientistIntent/vocabulary.ts (+ vocabulary.test.ts consumers)
- NEW: server/src/compiler/state/LabStateCanonicalShape.test.ts (one-canonical-shape
  proof: fold driven by REAL expander output — call addMaterialExpander/
  transferExpander programmatically, fold their real events, assert contents; never
  hand-craft the "shipped shape")
- NEW drive harness: .hermes/plans/harness/labstate-contents-drive/ (script +
  README; drives :3093 multi-turn per §11; NO edits to l2-suite-a/expectations or
  lib — WELLSET's P7.json is DO-NOT-TOUCH, its green stays pinned by the --all drive)
- server/src/ai/runChatbotCompileLabState.test.ts — regression-leg extension ONLY
  (no signature change; it pins the cache/prior plumbing WELLSET threads)

EXPLICITLY OUT OF SCOPE:
- server/src/compiler/biology/verbs/simpleVerbs.ts — the expander shape is the
  canonical INPUT; the ruling forbids changing it into the fold's old shape
  (expander runs BEFORE the fold — grounding fact 1). Zero diff here. If the drive
  evidence shows the expander cannot carry something needed, STOP + report — do
  not patch it mid-item.
- server/src/compiler/scientistIntent/wellsetResolver.ts /
  resolveWellsetsPass.ts / wellsetResolver.test.ts — the read half; DO NOT MODIFY
  (its 29+2 tests are the regression gate).
- .hermes/plans/harness/l2-suite-a/** expectations/lib — orch-owned.
- app/** — no UI in this item; the deck ghost display already rides details.wells
  from the binder, unchanged.
- LabStateCache re-plumbing / conversationKey derivation — fix2 owns it; verify
  present at claim (grep getDefaultLabStateCache in AgentOrchestrator.ts shows the
  read+put legs at aa33793d), do not extend.
- acceptedBindings lifecycle, findLabwareByHints (legacy; leave in place, it has
  its own pass consumers).

## 9. First targeted check (the one command that proves the approach early)

RED-first, before any implementation, at claim-time trunk (post-WELLSET-merge):
write in LabState.test.ts a leg that builds the snapshot with applyCreateContainer
(label-carrying create_container), then calls addMaterialExpander.expand() for a
shorthand candidate `{ params: { labware: <label>, well: 'A1', material: <string>,
volume_uL: 100 } }` and folds the REAL returned event via applyEventToLabState —
expect contents in snapshotAfter.labware. On today's fold this FAILS (that is the
RED, and it is the exact dead-write the ruling names). Then:

  cd <worktree>/server && npx vitest run src/compiler/state/LabState.test.ts

Expected: the new legs fail at base (RED pin commit), pass after the fold change.
If this leg is GREEN at base, the trunk moved — STOP and re-orient (skill lesson:
never trust carried state-facts).

## 10. Verification commands (with expected output)

At claim: capture a FRESH SERIAL full-server baseline (NFS/parallel-flake skill
discipline; solo re-run the known flake files, e.g. realizationGolden timeouts):
  cd <worktree>/server && npx vitest run --reporter=json > /tmp/labstate-baseline.json

Targeted suite (all legs green, ZERO new failing files vs baseline):
  cd <worktree>/server && npx vitest run \
    src/compiler/state/LabState.test.ts \
    src/compiler/state/LabStateCache.test.ts \
    src/compiler/state/LabStateCanonicalShape.test.ts \
    src/compiler/pipeline/passes/ChatbotCompilePasses.test.ts \
    src/ai/runChatbotCompileLabState.test.ts \
    src/compiler/scientistIntent/vocabulary.test.ts \
    src/compiler/scientistIntent/wellsetResolver.test.ts \
    src/ai/shorthandChat.wellsetFold.test.ts
Expected at trunk today (pre-item, minus the new file): LabState 9, Chatbot +44,
runChatbotCompileLabState 2 (55 measured by composer at ba1cdc9e); WELLSET legs
29 + 2 (fix2's seeded proof + pending-document union tests = the regression gate,
they MUST stay green untouched). Post-item: all green + new legs.

Typecheck (server): cd <worktree>/server && npx tsc --noEmit  -> 0 errors
(re-measure the trunk baseline at claim; recent lane-2 items report server tsc 0).

Hardcode sweep on the diff (must be empty in TS/YAML outside tests/fixtures):
  git -c core.fileMode=false diff <base>...HEAD | grep -nE "['\"](A[0-9]+|H[0-9]+)(:|-)"  -> no hits
  git ... -- server/src/compiler/state/LabState.ts | grep -nE "plate1|96-well|trypsin|DMEM"  -> no hits
  grep -n "verb ===" server/src/compiler/state/LabState.ts  -> no hits
  grep -nE "findLabwareByHints|includes\(|indexOf\(|startsWith\(" server/src/compiler/state/LabState.ts
    -> no hits in the NEW resolution code (rung evaluators are exact-compare +
       declared normalization only)

Stack: backend :3093 / frontend :5193 (lane-2 stack, NEVER main checkout ports);
AFTER the vocabulary YAML change the lane stack MUST be restarted (tsx --watch
does NOT reload YAML — the lane-list environment fact; the drive silently reads the
stale vocabulary otherwise and every drive number is void).

## 11. Live no-seed multi-turn drive (acceptance line 1 — the gate)

Harness: .hermes/plans/harness/labstate-contents-drive/ drives the ACTUAL wire
path the deck surface rides (/api/ai/draft-events/stream, the run-suite-a.py
post_sse idiom, ONE held session, conversationKey stable across turns — the same
identity the LabStateCache is keyed by). NO seeded state, NO cache priming, NO
priorLabState fixture: the ONLY inputs are the utterances below (verbatim from the
ruling — type them exactly, hyphen and all; the model lowering to well-range form
is part of what the drive tests):

  turn A  "Place a 96-well plate on the deck."      (deck context, mirrors P2)
  turn 1  "add material A to A1-H1"                 (ruling verbatim)
  turn 1b "add material B to A2-H2"                 (worked-example companion —
             see OQ-1; needed for the bar's A1:H2 union)
  turn 2  "mix all wells that have material"        (ruling verbatim)

EVIDENCE the drive must emit per turn (receipts dir
/home/brad/.hermes/cl/receipts/L2-LABSTATE-CONTENTS-1/<UTC ts>/):
- turn 1: the accepted compile's labStateDelta.snapshotAfter —
  Object.keys(snapshotAfter.labware).length >= 1 AND at least one instance's wells
  map non-empty over A1..H1 (add the materialId/kind seen); the backend arm-log
  line or drive-captured payload; and proof of PERSISTENCE: turn 1b's compile
  reads a prior whose labware ALREADY contains turn 1's contents (the cache write
  leg fired) — captured, not asserted-by-construction.
- turn 2: the mix event's details carry the resolved union EXACTLY
  A1..H1 + A2..H2 (48 wells — the A1:H2 bounding union), i.e. the WELLSET
  resolver's computed set is non-empty BY THE COMMITTED LEDGER. Vacuous []==[] is
  an ACCEPTANCE FAILURE (WELLSET's #1 trap applies verbatim here).
- failure-arm evidence: a control turn naming an unknown plate -> lab_state
  diagnostic in the payload/log + no contents written (never-guess leg).
The coder runs the drive against the restarted lane stack (:3093) pre-report;
the SAME drive is re-run post-merge by orch with receipts — THAT post-merge run
is what clears ED-WELLSET-AC2-LIVE (D13-C). The pending-document (current-turn)
union working is NOT clearance — the ledger must be non-empty across turns.
The full SUITE-A `--all` re-drive (orch) must stay green incl. P7 (regression bar).

## 12. Reviewer bait (expect these challenges; the diff must pre-empt them)

- exactOptionalPropertyTypes (server/tsconfig.json:13): identityTokens absent-
  when-empty (conditional spread / set-only-if-defined, buildMaterialRecord is the
  in-file idiom); applyEventToLabState's 3rd param optional, never `| undefined`
  at call sites; every new optional on pass outputs spread conditionally.
- YAML-reload trap: drive numbers taken WITHOUT a stack restart after the
  vocabulary edit are VOID — the report must show the restart timestamp before the
  drive window, and the vocabulary.test per-load pin proves the data read.
- The "isn't materialId = the scientist's string an INVENTED id?" attack (the #1
  expected defect claim): answer in code comments + report — minting would be
  MAT-N/hashing/slug; verbatim passthrough of the label the scientist typed IS
  the shipped precedent (mint_materials namingPattern :1954,
  ProtocolIntentLowering materialId). If the reviewer demands store-record
  material resolution, that breaks the fold's purity and is an architect
  escalation, not a fix-run.
- The "rung R3 is string matching!" attack: it is EXACT identity under a declared
  normalization over a field the vocabulary DATA names, with unique-match-or-
  nothing — the same contract as foldPendingKey rung 3 (merged, advc-survived).
  NO substring/overlap: pin a negative test (two same-type instances -> unresolved,
  contents NOT written, no second labware — the D1 mirror on the write side).
- Byte-stability of the RAW path: the legacy labwareInstanceId-object and from/to-
  object shapes must fold EXACTLY as before (golden test per verb; the
  economics/transfer legs in LabState.test.ts stay green untouched).
- No-double-vocabulary claim: the evidence is LabStateCanonicalShape.test.ts (real
  expander output feeds the ledger) + the golden raw-shape tests (same ledger
  result) — one vocabulary, two identity carriers (resolved vs symbolic).
- Immutability: never mutate the input snapshot; cloneSnapshot before write; the
  existing immutability describe must stay green.
- Ontology terms: this item adds NO ontology terms and touches no mention
  binding — state that in the report; a diff that starts resolving materials via
  OAK is over-scoped.
- WELLSET file-ownership: vocabulary.ts/.yaml are fix2-ADJACENT — the diff adds a
  SEPARATE section only; zero touched lines inside WELLSET's sections/tests
  (git diff must show it).
- NEVER a fix-run "simplification" that makes the binder or expander emit
  labwareInstanceId — the ruling names the fold as the consumer; such a diff is a
  scope violation, not a fix.

## 13. Worker contract

- Branch: cl/lane2-labstate-contents-1-l2t<tick> off trunk cl/integration-2 TIP
  AFTER the WELLSET fix2 merge (deps gate; verify with
  `git -c core.fileMode=false log --oneline -3` showing the merge commit).
- Worktree: /mnt/vast/home/brad/git/cl-integration-2/wt/L2-LABSTATE-CONTENTS-1-lane2-l2t<tick>.
  ALWAYS `git -c core.fileMode=false`. Never the shared main checkout.
- Unique deliverable: .hermes/plans/deliverables/L2-LABSTATE-CONTENTS-1-report.l2t<tick>.md
  (one-commit discipline; DONE marker line
  `L2LABSTATECONTENTS1 DONE <full-sha>` + `STATUS: complete`).
- Hot-file rule: serialize against anything else touching
  ChatbotCompilePasses.ts or vocabulary.ts (one worker per item; the CHAT-UI-1 leg
  cluster is app/ — no overlap).
- Restart the lane stack after YAML edits (§10); drive evidence post-restart only.
- Coder tests are NOT the acceptance gate for line 1: the live drive receipts are
  (orch re-drives post-merge; D13-C).

## 14. Open questions (composer could not resolve locally)

OQ-1 (drive shape; HIGH for the orchestrator to ratify before claim): the ruling's
bar literally says turn 1 "add material A to A1-H1" then "turn 2 ... unions to
A1:H2" — but A1-H1 alone unions to A1:H1 (8 wells), NOT A1:H2 (48). The binding
worked example (2026-10-27_L2-WELLSET-RESOLVER-1.md :61-62, quoted in the ruling's
why) is "add material A to A1-H1", accept "add material B to A2-H2", then mix ->
A1:H2. This spec assumes the 4-turn drive of §11 (a companion add B to A2-H2
between). Checked: ruling text, WELLSET spec worked example, SUITE-A P7
(union-of-prior-material-wells semantics). Ratify the turn list (and whether turn
A "Place a 96-well plate on the deck." is required or the deck context already
holds a plate at drive time).

OQ-2 (hyphen range lowering, live-drive risk): the verbatim utterance "A1-H1"
hyphen-form must reach the ledger as A1..H1. The shipped range parser
(server/src/ai/wellRange.ts:14 RANGE_RE) accepts only ':' and '..' separators —
a hyphen token would fall to the model/lowering or bar. Checked: wellRange.ts,
addMaterialExpander's rawWells arm, the shorthand binder's expand-well arm. If the
live drive dies HERE, the fix is NOT a hyphen in RANGE_RE (grammar change = new
vocabulary risk, out of this item) — it is a lowering/utterance-capture finding to
route back to orch/architect with the arm-log evidence.

OQ-3 (where create_container gets the plate label on the live path): the rung
ladder needs the creating event to carry a declared label (identityTokens, §6),
but createContainerExpander emits only slot+labwareType and the binder's
Task-21 details.labwareId arm is add/ghost-side. Checked: simpleVerbs
createContainerExpander, shorthandChat binder arms, mint_materials create events,
the deck labware summaries (editor state, ids like lbw-seed-plate-96-flat which
are NOT snapshot instance ids). If turn A's create_container carries no label and
R3 (unique '96-well-plate' type) is the only rung that can fire, then a deck with
TWO same-type plates never-guesses (acceptable honest behavior — but ratify that
R3-unique is the expected live winner for the single-plate drive, and whether
threading deckLabwares identity into the create event is in-scope (my read: NO,
out of scope — R3 carries the single-plate drive; OQ for ratification).

## 15. Orch ratification of OQs (l2t1910, consistent with the binding D13-B ruling)

- OQ-1 RATIFIED: the §11 4-turn drive STANDS including turn 1b "add material B to
  A2-H2" — the ruling's bar text is a compressed quote of the binding worked example
  (WELLSET spec :61-62), which is two adds then mix -> A1:H2 (48 wells). Turn A
  ("Place a 96-well plate on the deck.") is REQUIRED — it mirrors SUITE-A P2 and is
  the only way the drive owns its deck context with no seeded state.
- OQ-2 RATIFIED: RANGE_RE grammar is OFF-LIMITS (no hyphen added). If the verbatim
  hyphen utterance dies at range lowering on the live drive, that is a
  lowering/utterance-capture FINDING: capture the arm-log evidence, report it, and
  the acceptance may be proven with the ':' form ('add material A to A1:H1' +
  'A2:H2') ONLY IF the evidence shows the hyphen dies purely at lowering — the
  ledger/fold behavior is what the item owns, the grammar is another item's.
- OQ-3 RATIFIED: R3-unique IS the expected live winner for the single-plate drive
  (create_container carries no label carrier on the live path today; identityTokens
  stays additive for events that DO carry one). Threading deckLabwares identity into
  the create event is OUT OF SCOPE. The two-same-type-plates never-guess negative
  test stays required.
