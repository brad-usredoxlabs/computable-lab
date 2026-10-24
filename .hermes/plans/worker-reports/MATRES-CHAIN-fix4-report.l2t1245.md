# MATRES-CHAIN — FIX RUN 4 — LANE 2 — coder report (l2t1245)

Lane: 2. Worktree: /mnt/vast/home/brad/git/wt/MATRES-CHAIN-fix3-lane2-l2t0945
Branch: cl/lane2-matres-chain-fix3-l2t0945 (SAME branch as fix-3; base verified
HEAD = 566f2b174e3e132f1292a97ffc3428ed30acfde2, the fix-3 tip already merged
into trunk 3c0fd83e). No push, no stack touched, nothing dispatched.

DEFECTS ADDRESSED (gate g1d, receipts
/home/brad/.hermes/cl/receipts/MATRES-CHAIN/g1d-2026-10-24_122545/report.md):
- D2 (BLOCKER): the canonical case-3' live emission compiles to
  needs-missing-fact, no card document, review card never renders.
- D3 (MAJOR): a blocked chain compile surfaces as generic chain-card-nocard
  with NO rule id (§7.5 / §12 bait 9).

COMMITS (same branch, both on it):
- 593c8cb6 — RED tests (new files only):
  server/src/chain/ChainLiveEmission.test.ts (D2, 4 arms)
  app/src/event-editor/right-pane/ai/ChainProposalCard.blockedWall.test.tsx (D3, 4 tests)
- 70cc97a9 — GREEN product fixes:
  server/src/chain/ExecuteChainDraft.ts
  server/src/drafts/adapters.ts (comment-only on the chain leg — see D3 shape)
  app/src/event-editor/right-pane/ai/ChainProposalCard.tsx

Full diff 566f2b17..HEAD (5 files, bait-1 clean — zero FormDraftService lines):
  app/src/event-editor/right-pane/ai/ChainProposalCard.blockedWall.test.tsx
  app/src/event-editor/right-pane/ai/ChainProposalCard.tsx
  server/src/chain/ChainLiveEmission.test.ts
  server/src/chain/ExecuteChainDraft.ts
  server/src/drafts/adapters.ts

================================================================================
WORKTREE BOOTSTRAP (fresh checkout lacked the lane-2 sync layer)
================================================================================
HEAD verified 566f2b17; package.json present. Missing: root/server node_modules,
server/schema, app/node_modules (a real dir holding a nested node_modules stub —
rm -rf'd then re-symlinked per the lane pitfall), and the 89 lane-exclude
overlay files. Recipe used (lane-2 precedent, lane-exclude-a6fix-l2t0430 =
core.excludesFile):
  ln -sfn cl-integration-2/{node_modules,server/node_modules,app/node_modules}
  ln -sfn ../schema server/schema
  for each `git status --ignored=matching` '!!' entry (89 regular files,
  server/src/ai/*, schema/core/datatypes/revision-ref.schema.yaml, ...):
  cp -L from cl-integration-2 (schema paths are COPIES, not symlinks —
  SchemaLoader skips symlinked YAMLs). package-lock sha256 verified identical
  (6068d633...). LifecycleBypassAudit.test.ts copy is the healthy 184-line
  version. `git -c core.fileMode=false status --porcelain` = 0 lines after
  bootstrap. vitest 1.6.1 verified via `npx vitest --version`.

================================================================================
BASELINES (recorded at start, AFTER bootstrap, at 566f2b17)
================================================================================
server `npx vitest run src/chain src/drafts` (raw:
evidence/matres-chain-fix4-l2t1245/base-server-chain-drafts.txt):
 Test Files  11 passed (11)
      Tests  125 passed (125)
   Start at  14:02:08
   Duration  18.06s (transform 3.22s, setup 1ms, collect 31.77s, tests 42.46s, environment 2ms, prepare 1.07s)

server `npx tsc -p . --noEmit`: 0 error lines (base-server-tsc.txt).
app `npx tsc --noEmit`: 23 'error TS' lines (base-app-tsc.txt) — the known
lane-2 app debt set; used as the sorted-diff pin.
app chain-related suites at base (ChainProposalCard.test.tsx,
useWorkstateProposalFlow.test.tsx, useWorkstateProposalFlow.chain.test.tsx,
AiTabPanel.chain.test.tsx) (green-app-chain-base.txt):
 Test Files  4 passed (4)
      Tests  38 passed (38)
   Start at  15:14:05
   Duration  26.60s (transform 1.99s, setup 9.26s, collect 17.59s, tests 1.21s, environment 57.27s, prepare 3.56s)

================================================================================
RED AT BASE (commit 593c8cb6 tests against the UNMODIFIED 566f2b17 product)
================================================================================

--- D2 RED (server/src/chain/ChainLiveEmission.test.ts at base; raw:
evidence/matres-chain-fix4-l2t1245/red-at-base-D2.txt) — 4 failed / 4, failing
FOR THE DEFECT'S SYMPTOM (the shipped pairing wall fires + no named material
gap exists), not test wiring:

 ❯ src/chain/ChainLiveEmission.test.ts  (4 tests | 4 failed) 1683ms
   ❯ ... arm B (verbatim live payload, no matching spec) ...
     → expected 'DRAFT_INVALID attestation-occurred-ap…' to contain 'chain.prepared.sourceSpecRef'
   ❯ ... arm A (exactly one material-spec names the prep) ...
     → expected 'DRAFT_INVALID attestation-occurred-ap…' not to contain 'attestation-occurred-approximate-need…'
   ❯ ... arm C (two distinct material-specs match) ...
     → expected 'DRAFT_INVALID attestation-occurred-ap…' to contain 'chain.prepared.sourceSpecRef'
   ❯ ... arm D (direct compile of the refused emission) ...
     → expected false to be true // Object.is equality

 Test Files  1 failed (1)
      Tests  4 failed (4)
   Start at  14:54:37
   Duration  3.72s (transform 384ms, setup 0ms, collect 726ms, tests 1.68s, environment 0ms, prepare 719ms)

The arm-B received string verbatim from the raw reproduces the g1d live refusal
(attestation-occurred-approximate-needs-approximation x11 + "planned instance/:
Missing required property: material_spec_ref ... anyOf") — the test bites the
exact defect.

--- D3 RED (app blocked-wall test against the base ChainProposalCard.tsx,
product file reverted via `git checkout --` with the fixed copy staged in /tmp
and restored by cp — the isolation-probe recipe; raw:
evidence/matres-chain-fix4-l2t1245/red-at-base-D3.txt) — 3 failed | 1 passed;
the 3 failures are the named-wall legs, the passing leg is the PRESERVED
nocard copy (proof the RED is not test wiring):

 FAIL  src/event-editor/right-pane/ai/ChainProposalCard.blockedWall.test.tsx > ... > blocked + NO card document + the attestation pairing diagnostic: the wall NAMES the rule id, NO Accept, Reject real
 FAIL  src/event-editor/right-pane/ai/ChainProposalCard.blockedWall.test.tsx > ... > blocked + NO card document + the arithmetic rule diagnostic: the wall NAMES volume-sum-lte-prepared (the C6 case)
 FAIL  src/event-editor/right-pane/ai/ChainProposalCard.blockedWall.test.tsx > ... > blocked + NO card document + the material-gap diagnostic: the wall NAMES chain.prepared.sourceSpecRef (the unresolvable-name case)

 Test Files  1 failed (1)
      Tests  3 failed | 1 passed (4)
   Start at  15:18:24
   Duration  19.82s (transform 109ms, setup 2.04s, collect 2.27s, tests 25ms, environment 12.84s, prepare 870ms)

Base DOM (from the raw): `data-testid="chain-card-nocard"` with only "The
compile returned no chain card document — nothing was written." — the g1d
generic wall, no rule id.

================================================================================
GREEN AFTER FIX (commit 70cc97a9)
================================================================================

server `npx vitest run src/chain src/drafts` (green-server-chain-drafts.txt):
 Test Files  12 passed (12)
      Tests  129 passed (129)
   Start at  15:11:45
   Duration  17.16s (transform 3.62s, setup 0ms, collect 29.32s, tests 49.05s, environment 3ms, prepare 11.48s)

server wider compile path `src/chain src/drafts src/receiving src/resolve src/fulfillment`
(green-server-wide.txt) — zero new failures vs the same-command base posture
(chain+drafts base was 11/125 green; the wider set shares those files and the
receiving/resolve/fulfillment suites ride the untouched siblings):
 Test Files  23 passed (23)
      Tests  221 passed (221)
   Start at  15:22:03
   Duration  15.45s (transform 4.39s, setup 7ms, collect 32.66s, tests 53.35s, environment 10ms, prepare 21.31s)

app chain suites incl. the new blocked-wall file (green-app-chain-fixed.txt):
 Test Files  5 passed (5)
      Tests  42 passed (42)
   Start at  15:18:50
   Duration  4.68s (transform 905ms, setup 307ms, collect 3.43s, tests 1.15s, environment 2.57s, prepare 394ms)

app sibling blocked-wall suites (record-draft/workstate/analysis/honestWall +
the new file) (green-app-siblings.txt):
 Test Files  5 passed (5)
      Tests  37 passed (37)
   Start at  15:23:05
   Duration  24.29s (transform 2.45s, setup 11.44s, collect 28.35s, tests 1.16s, environment 67.17s, prepare 1.58s)

Typecheck gates:
- server `npx tsc -p . --noEmit` at HEAD: 0 lines == base 0 lines
  (head-server-tsc2.txt).
- app `npx tsc --noEmit` at HEAD: 23 'error TS' lines; `diff <(sort base)
  <(sort head)` EMPTY ("APP-TSC-SORTED-DIFF-EMPTY", head-app-tsc3.txt vs
  base-app-tsc.txt). The base comparison IS the same-tree base capture (the
  lane worktree at 566f2b17 with the bootstrap applied) — the app changes
  reverted state is exactly that tree.
- The green fixture tests are byte-unchanged: `git diff 566f2b17..HEAD
  --name-only` shows NO ChainAccept.test.ts / ChainDraftSchemas.test.ts /
  useWorkstateProposalFlow / assistStream files ("NO green-fixture/flow files
  touched"). ChainAccept 19/19 and ChainDraftSchemas 12/12 stay green.

================================================================================
D2(a) — TIME: the compiler NEVER emits approximate-without-occurredAt
================================================================================
server/src/chain/ExecuteChainDraft.ts timeFields (was :570-579): when the
declared status is 'approximate' and NO occurredAt was stated, the claim now
downgrades to occurredAtStatus:'unknown' (terminal honesty, Q5) and the human
approximation note is retained ONLY for the review card (index-aligned
timeApproximationNotes -> §9b card claims render it as the approximation note;
the stored claim carries NEITHER occurredAt NOR approximation, satisfying
attestation-occurred-unknown-is-terminal). The shipped pairing wall
attestation-occurred-approximate-needs-approximation (schema/lab/attestation.lint.yaml:48)
can therefore never fire from a compiler-built claim, and the tests pin that
(arms A/B/C/D assert the diagnostic NEVER appears).

EXPLICIT HONEST OUTCOME (spec-mandated statement): I searched for a declared
time-token resolution rule — `grep -rn "approximat" config/ schema/
--include=*.yaml` finds NO token->timestamp table anywhere in config/ or
schema/ (the only 'today' references are drafting-layer comments:
plate-event.schema.yaml:61 "Present-tense chains default known=today at DRAFT
time" is a DEFAULTING note for CHAIN/RECV, and plate-event.lint.yaml:19 repeats
it; the tool contract itself (server/src/ai/submitSuggestionTool.ts:742) says
'"today" is approximate unless a time was stated'). NO declared data/config
resolves 'today'/'yesterday' to a concrete occurredAt. Synthesizing one would
be a fabricated occurrence time, forbidden by the ratified law this file
carries (ExecuteChainDraft.ts header: "occurredAt is ONLY ever the scientist's
stated time"; plate-event.schema.yaml:60-62: "validation never does" the
defaulting, and the RECV law "NEVER invent an arrival date"). So 'unknown' IS
the honest outcome for the live emission, and that is what ships: the card
shows `unknown (today)` / `unknown (yesterday)` — the scientist's own word
preserved as a note, no invented timestamp.

================================================================================
D2(b) — MATERIAL SPEC: DATA resolution via the SHIPPED name->record mechanism
================================================================================
When prepared.sourceSpecRef is ABSENT (the live shape), the compiler resolves
prepared.name against existing material-spec records through the SAME mechanism
the shipped code already uses for name->record binding:
- server/src/resolve/providers/records.ts — `createRecordProvider(store, kinds)`:
  the tier-1 "existing workspace records" provider ("Searches the record store
  for records whose name/label/synonyms match the term... Each hit becomes a
  `local:<recordId>` CURIE"), the provider createResolveSpine composes for
  EVERY name->record binding (server.ts:802 `createResolveSpineFromContext`,
  IntentCompileHandlers.ts:89, workspaceActionTools.ts:38, resolveTool.ts:20).
- The binding discipline mirrors the shipped siblings:
  server/src/ai/resolveDraftMaterials.ts ("local hit (tier 0/1) → BIND it...
  Never guesses"; LOCAL_TIERS localOnly doctrine) and
  server/src/receiving/MaterialReceivingDraft.ts lookupVendorProduct (:173-196,
  "Matching is DECLARED-FIELD equality only... no fuzzy scoring, no ranking...
  a miss leaves the receipt vendor-unresolved").
The chain leg (ExecuteChainDraft.ts, after the spec-read block):
`createResolveSpine({ recordProvider: createRecordProvider(deps.canonical,
['material-spec']) }).resolve(preparedName, { localOnly: true, level: 'spec' })`,
then distinct local: CURIE ids are collected:
- EXACTLY ONE distinct match -> bound: sourceSpecRef = {kind:'record',
  type:'material-spec', id}, the spec read pins into `reads` (the pinned-source
  409 rail), instancePayload/derivation/aliquots gain material_spec_ref as
  before (:534 leg unchanged), entityCore includes specRecordId (deterministic
  ids preserved).
- ZERO matches or MORE THAN ONE distinct match -> NOT resolvable: a NAMED
  diagnostic `chain.prepared.sourceSpecRef: ...` (missing: "no material-spec
  record names the declared prep ... NEVER guesses or mints a spec";
  ambiguous: "... is ambiguous — N distinct material-spec records match (ids);
  ... NEVER fuzzy-guesses across distinct records"). No parallel resolver was
  invented; no fuzzy guess; no minted spec.

EXPLICIT STATEMENT (spec-mandated): for an UNRESOLVABLE material name the
compile stays LEGITIMATELY BLOCKED — canAccept:false with the named
chain.prepared.sourceSpecRef diagnostic, zero staged writes, and the D3 wall
renders that rule id to the scientist. Never a guess.

================================================================================
D2(c) — the new end-to-end compile test (RED-first, fixture tests untouched)
================================================================================
server/src/chain/ChainLiveEmission.test.ts feeds the BARE live-shaped payload
verbatim from compile-response-A1.json normalizedIntent.payload (prepared
{name:'cell suspension', volume 1 mL} with NO sourceSpecRef; 1 consumed + 9
stored aliquots each occurredAtStatus:'approximate' + approximation:'today',
NO occurredAt; attested {claimStatus:'completed', occurredAtStatus:'approximate',
approximation:'yesterday', NO occurredAt}) through the PRODUCTION rail
(FormDraftService.compile, adapter 'chain'), driving ONLY compile/accept (bait 1).
Arms (all green at HEAD):
- arm B (no matching spec): canAccept:false, diagnostics CONTAIN
  chain.prepared.sourceSpecRef, do NOT contain
  attestation-occurred-approximate-needs-approximation, writes.length === 0.
- arm A (exactly one material-spec 'cell suspension' seeded): canAccept:true;
  reads pins SPEC-LIVE-CELLSUSPENSION; the staged material-instance carries
  material_spec_ref; the stored envelope's 11 claims are all
  occurredAtStatus:'unknown' with NO approximation/occurredAt fields; the card
  claims render occurredAtStatus 'unknown' WITH the retained notes
  ('yesterday' on the prepared claim, 'today' on the aliquot claims).
- arm C (two distinct specs 'cell suspension' + 'cell suspension buffer'):
  canAccept:false, named chain.prepared.sourceSpecRef diagnostic containing
  'ambiguous', pairing wall absent.
- arm D (direct compileExecuteChainIntent of the refused emission): ok:false,
  the named material diagnostic present, the pairing diagnostic absent, and
  compiled.card IS BUILT (artifactKind, claims with downgraded unknown +
  retained notes) — the data the blocked wall renders.
ChainAccept.test.ts (19 tests) and ChainDraftSchemas.test.ts (12 tests) are
byte-untouched and stay green (diff --name-only proof above).

================================================================================
D3 — the blocked chain wall NAMES the offending rule ids
================================================================================
CITED SIBLING (the shipped blocked-wall pattern this mirrors): the
record-drafting leg — WorkstateProposalCard renders the pipeline's
DRAFT_INVALID diagnostics VERBATIM in its blocked phase
(app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx :138-146
`workstate-card__diagnostics`), exercised end-to-end by
app/src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx :287
'canAccept:false ⇒ summary + diagnostics and NO accept control (a blocked
record proposal cannot be accepted)' with the STAGED_CREATE_REJECTED rule id
surfacing. The server-side sibling: adapters.ts record-drafting :107 and
receiving :141 throw the compile's rule-named diagnostics, which the pipeline
records as DRAFT_INVALID needs-missing-fact -> canAccept:false (the generic
gate, FormDraftService.ts:138/:164).

CHAIN leg fixes:
1. server/src/chain/ExecuteChainDraft.ts already returns the built `card` on
   its ok:false path (:825 region — `card` rides the refused return); the
   g1d failure was that the refusal message + card never reached the client in
   a renderable shape. Now every wall on the live path is NAMED in
   compiled.diagnostics: the time pairing DOWNGRADES instead of firing (D2a),
   the material gap is `chain.prepared.sourceSpecRef` (D2b), the arithmetic
   rules keep their ids (`volume-sum-lte-prepared`,
   `aliquot-count-matches-declared` — chainArithmetic.ts :200-263 names them).
2. server/src/drafts/adapters.ts chain stage: the refusal still throws
   `compiled.diagnostics.join('; ')` — VERBATIM rule-named (the sibling
   pattern; the pipeline turns it into the DRAFT_INVALID diagnostic whose
   message the card renders). The throw is preserved deliberately: it is what
   sets canAccept:false through the generic gate (FormDraftService.ts:164),
   and the g1d report's own fix-direction accepts either shape as long as the
   wall is reviewable and named — with the card document now ALWAYS built by
   the compile (arm D pins it) and the diagnostics riding verbatim, the
   blocked wall is reviewable without bypassing the gate. adapters.ts carries
   a comment-only diff documenting this (12 added comment lines, zero logic
   change on the chain leg).
3. app/src/event-editor/right-pane/ai/ChainProposalCard.tsx: the `!card`
   branch no longer early-returns the generic nocard when diagnostics exist.
   With diagnostics it renders the blocked wall: data-testid="chain-card" +
   "chain-card-blocked" title + data-testid="chain-card-blocked-diagnostics"
   listing each diagnostic VERBATIM (code + message — the rule ids
   attestation-occurred-approximate-needs-approximation,
   volume-sum-lte-prepared, chain.prepared.sourceSpecRef all surface), plus
   Reject (real) and NO Accept. NON-ACTIONABILITY PRESERVED: no Accept
   control exists in the blocked phase (bait 9 / PROTO-AI-9 R-Defect-2 class;
   the existing 'blocked ... NO Accept control exists' test stays green).
   The honest nocard copy is PRESERVED for the truly-empty state (no card AND
   no diagnostics) — pinned by the 4th test in the new file.
4. useWorkstateProposalFlow.ts is UNTOUCHED: it already reads result.card
   (absent on refusal) AND already carries res.diagnostics into the card
   state with phase 'blocked' (:133-152 region) — the flow leg was correct;
   the defect was the card component's early return, now fixed. The accept
   path still refuses server-side: FormDraftService.ts:178
   ('Draft is blocked...') and :186 (canAccept re-check) gate every accept,
   and a refused chain compile stages ZERO writes.

D3 tests (ChainProposalCard.blockedWall.test.tsx, 4 tests green at HEAD):
pairing-rule wall, arithmetic volume-sum-lte-prepared wall (the C6 case),
material-gap chain.prepared.sourceSpecRef wall, preserved nocard copy.

================================================================================
GATE LEDGER
================================================================================
- RED-first: D2 4 failed/4 at base (right reason: pairing wall fires + no
  named material gap); D3 3 failed|1 passed at base (generic nocard swallows
  diagnostics; preserved-copy leg passes). Raw outputs above.
- server vitest src/chain src/drafts: 12 files / 129 tests GREEN (base 11/125;
  the +1 file/+4 tests are the new file only — zero new failures).
- server vitest wider compile path (chain+drafts+receiving+resolve+fulfillment):
  23/221 GREEN.
- app ChainProposalCard + useWorkstateProposalFlow + AiTabPanel.chain +
  siblings: 5+5 files GREEN (42 + 37 tests).
- server tsc -p .: 0 -> 0 lines.
- app tsc --noEmit: 23 -> 23, sorted-diff EMPTY.
- exactOptionalPropertyTypes: every optional field uses the conditional-spread
  idiom (timeApproximationNotes spread, card note spread, adapters comment);
  the new test file's diagnostics literals match WorkstateCardDiagnostic
  {code?, message} exactly (a severity field was removed after tsc flagged
  it — 3 TS2353 lines appeared and were driven back to the 23-line base set).
- No hardcoded domain policy in TS: name resolution rides the shipped
  resolve/providers/records tier-1 provider through createResolveSpine; time
  handling downgrades to the declared terminal 'unknown' (no token table was
  invented; none exists in declared data — stated above).
- Bait 1: `git diff 566f2b17..HEAD --name-only | grep -c FormDraftService` = 0.
- Bait 9: blocked wall names the rule id AND is non-actionable (tests above).
- git status --porcelain at exit: CLEAN (see below).

ASSUMPTIONS
- AS-F4-1: the D3 server-side shape keeps the adapters.ts throw (generic gate
  preserved) rather than returning a canAccept:false result object; the
  reviewability requirement is met because the compile now always BUILDS the
  card document (pinned, arm D) and the refusal message carries every fired
  rule id verbatim into the DRAFT_INVALID diagnostic the card renders. If the
  orchestrator wants result.card to ride a refused compile literally, that is
  a FormDraftService-adjacent change (bait-1 territory) and needs a ruling.
- AS-F4-2: the resolve spine is invoked with kinds ['material-spec'] and
  level 'spec' (the chain's material is a formulation the prep realizes — the
  schema's own sourceSpecRef description); tier-1 local records only
  (localOnly, the resolveDraftMaterials doctrine) — deterministic and
  offline-safe in the compile hot path.
- AS-F4-3: the retained approximation note on the card is display-only; the
  stored claim stays terminal-clean. This is the only reading of "keeping the
  approximation note" that satisfies BOTH shipped lint walls (approximate
  needs occurredAt; unknown carries NO time fields).

EVIDENCE (CODER-CAPTURED raws, re-derivable):
/home/brad/.hermes/cl/lanes/2/evidence/matres-chain-fix4-l2t1245/
  base-server-chain-drafts.txt red-at-base-D2.txt red-at-base-D3.txt
  green-server-chain-drafts.txt green-server-wide.txt
  green-app-chain-base.txt green-app-chain-fixed.txt green-app-siblings.txt
  base-server-tsc.txt head-server-tsc2.txt base-app-tsc.txt head-app-tsc3.txt

STATUS: complete
