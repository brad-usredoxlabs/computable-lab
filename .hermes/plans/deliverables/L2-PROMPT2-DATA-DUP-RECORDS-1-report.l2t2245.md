# L2-PROMPT2-DATA-DUP-RECORDS-1 — coder report (l2t2245)

Lane 2 · worktree /mnt/vast/home/brad/git/wt/L2-DATADUP-l2t2245 · branch cl/lane2-prompt2-datadup-1-l2t2245
Spec: .hermes/plans/2026-11-02_2200-L2-PROMPT2-DATA-DUP-RECORDS-1-spec.md (read in full, incl. §14 ORCH RULINGS)

## STEP 0 — trunk merge
- `git -c core.fileMode=false merge --no-ff cl/integration-2` → clean merge, no conflicts.
- Merge commit: cf855add (branch tip after STEP 0). Trunk drift was docs-only: 5 files added
  (decisions CARD1-D1-FACTCOUNT / L2-PROMPT2-IDENTITY-POLICY / TARGET1-WELLS-DOOR, handoffs l2t2245+l2t2310).
  No source lines moved in server/ or schema/ from the diff file list — to be confirmed by pin re-read.
- Claim tip for pin re-reads: cf855add.

## STEP 0b — pin re-read at claim tip (cf855add)
All §11 rows re-read first-hand at the claim tip. MOVED rows:
- P1/P2: `config.yaml:5` / `:23-38` — the file is not in the repo; the :3093 backend runs with
  CONFIG_PATH=/home/brad/.hermes/cl/lanes/2/lane2-config.yaml (cl-lane-stack.sh:33, :115; backend pid
  3802700, cwd /mnt/vast/home/brad/git/cl-integration-2/server, env CL_DATA_DIR=/home/brad/.computable-lab-lane2).
  VERIFIED: that file's line 5 = `dataDir: /home/brad/.computable-lab-lane2`; repository block lines
  23-38: id main, mode embedded-git, records.directory records, autoCommit true, autoPush false.
- P8: `routes.ts:239` → **PUT route now at routes.ts:241** (MOVED; DELETE at :244 unchanged = P3 holds).
- P14: `RecordEnvelope.ts:19-35` → RecordMeta interface at :18-37 (contentSha :33, deprecated
  commitSha :27) — within claimed window; HOLDS.
- P18/P19: `vocabulary.ts:101-107` → ScientistIntentVocabularyPolicies at **:100-105** (ambiguity row
  :102); passthrough `raw.policies` at :301, `policies: () => policies` at :399 — HOLDS (1-line drift).
- P20: `resolutionEngine.ts:43-45` → sortCandidates at **:44-46** (score DESC, curie ASC) — HOLDS.
- P21: `:316-320` → in-band set `const inBand = eligible.filter(...)` at **:318-320** — HOLDS.
- P22: `:354-371/:373-383` → `if (inBand.length === 1)` at **:354**; bind-verdict arm :357-364; HOLDS.
- P25: `ResolveSpine.ts:101-104` → tNaked/lNaked at **:102-104** (hasLexicalSupport @99) — HOLDS.
- P31: `RecordStoreImpl.ts:150-160,:236-243` → path-scan now in **findRecordPath @123**; the
  `{recordId}__{slug}.yaml` convention docstring sits at :226-232 (contentFingerprint @233-235).
  Moved; semantics HOLDS.
All other rows HOLDS in place: P3 :244, P4 :1524-1613 (deleteRecord @1524), P5 :918-1000
(deleteFile call @973), P6 :231-238 (deleteFile→commitPaths([options.path]) @231-238), P7 :1590-1597
(rebuild @1593), P9 :963-981 (updateRecord @963; body {payload, expectedSha, message}; payload required
@971; 404 @982; 405 APPEND_ONLY @997), P10 :811-841→target.path @819, P11 :1287-1295 (rebuild @1289),
P12 :929-938 (seed refusal @937), P13 :114-116 (x-user-id/x-computable-user-id @114-116; local-admin
fallback :121-160), P15 :494, P16 :991-996, P17 :323-357 (ambiguity block closed: additionalProperties
false, required [mode, confidenceAccept, strategyRef]), P23 vocabularyRipOut.test.ts:83-99 (strategy
flip pattern: fixture dir via loadScientistIntentVocabulary({path}), shipped untouched), P24
nounResolution.test.ts:1-15 (fixtures are COPIES), P26 material-spec.schema.yaml:75-95 formulation block,
P27/P28 lane-2 disk (aliquot material_spec_ref :7-11; EVG-API-mu50x5z7 material_spec_ref :14 /
aliquot_ref :25), P30 data-repo dirty set — 5 `D` paths exactly as named in spec (plus unrelated
M/?? paths: studies workspace x2, sqlite var files, sessions x2, 3 foundry artifacts — not mine,
recorded, untouched).
Data-store facts: lane-2 worktree HEAD 78b3f623 "Update record index"; all 15 target files present
under records/{material-spec,aliquot,material}; survivors present (MSP-PR9-TEST-CLO-1MM,
MAT-PR9-TEST-DMSO, MAT-PR9-TEST-CLO, MAT-clofibrate-1mm-10tf); mangled concept file
`MAT-1-mm-clofibrate1-mm-clof-l84l__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml` present.
Lint check: shipped lint file only references `policies.ambiguity.strategyRef` (:225-241) — no lint
rule reaches into ambiguity's property set, so adding identityCollapse cannot trip a lint violation.
:3093 live (health 200, 199 schemas / 139 lint rules). Live probe already shows DMSO before-state:
2 concept candidates @1.15 (MAT-PR9-TEST-DMSO, MAT-TEST-DMSO) — matches spec expectation.
Leg-6 pre-check: grep shows NO identityCollapse/contenderOrder consumer anywhere in server/src
(OQ3 consumer not landed) → leg 6 is not exercised this item.

## STEP 2 — before-state capture (receipts)
Absolute dir: /mnt/vast/home/brad/git/wt/L2-DATADUP-l2t2245/.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/
- probe-before-clofibrate.json + .tsv — POST /api/resolve {"term":"1 mM clofibrate in DMSO"} → 21 candidates
  (matches spec §3.7 exactly: 8 spec rows sharing the exact label '1 mM Clofibrate in DMSO' @1.15
  = 7 shells + MSP-PR9-TEST-CLO-1MM; 1 mangled concept @1.02; 7 aliquots @1.02; 4 vendor-catalog
  @0.4; 1 mint-offer row @0.05).
- probe-before-dmso.json + .tsv — POST /api/resolve {"term":"DMSO"} → 21 candidates total; the
  spec's "2 candidates" is the exact-label identity set: 2 concept 'DMSO' @1.15
  (MAT-PR9-TEST-DMSO, MAT-TEST-DMSO). The live window additionally surfaces lexical-support rows
  (fenofibrate-in-dmso, clofibrate+DMSO draft spec, shells, aliquots, mangled concept, mint row) —
  recorded, not relitigated.
- shas-before.txt — contentSha (meta.contentSha, the blob hash per P14) read for all 15 + the
  label-fix target (16 rows).
- dup-test-before.txt — OQ2 duplication test (spec §3.5 verbatim filter): result [] pre-mutation.
  No concept-level RECORD carries the clean label; the only real concept is the mangled one itself
  (its mangled label doesn't exact-match, which is why the filter is empty; the empty-curie row is
  the UI mint-offer). NOT a duplicate ⇒ OQ2 default: LABEL FIX, keep the record.

## STEP 3 — removals + label fix via the ordinary HTTP record path on :3093
Actor: x-user-id: USR-BRAD (resolved active; no local-admin fallback used). No hand edits anywhere.
- 15 DELETE /api/records/:id?expectedSha=<contentSha> (order: 7 aliquots → 7 shells → MAT-TEST-DMSO).
  FINAL HTTP status CAPTURED for 7 of 15 only — the aliquot rows carry a literal `HTTP=200` in
  removal-log.txt:10,16,22,28,34,40,46. For the other 8 (all 7 MSP-API-* shells + MAT-TEST-DMSO)
  the harness printed the literal unset sentinel `CODE` in the status column
  (removal-log.txt:78-93): the status code of those DELETEs was NOT captured. The 8 removals are
  nonetheless proven, just not by a status line — each returned a `success:true` body carrying its
  own data-repo commit sha (80f1bacc 92c617fb d1ce44a7 34aa406c b6d17972 ebb88f86 a7faaad4
  0442b918; each commit touches exactly its own record path), and all 15 ids answer 404 NOT_FOUND
  on post-removal GET (removal-log.txt:97-111, re-captured with an explicit status column in
  receipts/removal-status-recapture.txt).
  - 409 note (recorded, not a refusal): the first-pass aliquot loop dropped expectedSha on shell
    word-splitting; the handler's 409 body "SHA mismatch: expected <id-echo>, got <sha>" named the
    correct sha, which was IDENTICAL to the sha read in shas-before.txt. Spec §3.7 step 3 says use
    the got value → retry returned 200. Shells + MAT-TEST-DMSO ran single-shot (no 409 in the log,
    each body success:true); their status line is the unexpanded `CODE` sentinel and is therefore
    not of record — see the paragraph above.
  - Seed-refusal canary (spec §3.3): never fired (no 405, no "resolves from seed").
  - Post-removal GET /api/records/:id → 404 NOT_FOUND for ALL 15 (proof of removal, not a filter).
- 1 PUT /api/records/MAT-1-mm-clofibrate1-mm-clof-l84l (label fix): body = WHOLE GET payload with
  exactly two string substitutions (payload.name and the quoted substring in payload.definition
  → "1 mM Clofibrate in DMSO"); expectedSha = read contentSha; message "Fix concatenated label on
  MAT-1-mm-clofibrate1-mm-clof-l84l (CARD-1 W7 class)". HTTP 200; validation valid, lint 0
  violations. GET-after: name="1 mM Clofibrate in DMSO", domain=other and status=proposed
  UNCHANGED, new contentSha ad9797f6b2fbfbb3b08932942a364f6a18c865f9 (was
  1aafaea34ef62048d7accc8f40be1aecb55d4a1e). Filename slug stays stale
  (…__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml) — ordinary-path design (§9.8), NOT hand-renamed.
- Data repo: 16 API-produced commits (15 deletes + 1 fix) interleaved with server index-rebuild
  commits, 78b3f623..394f384c. Every record commit touches ONLY its own path (verified via
  git log --name-status). The 5 pre-existing dirty deletions (P30) remain uncommitted as found.
  Data-repo commit shas: see receipts/cleanup-ledger.md (per-id table).

## STEP 4 — after-state + dangling refs
- probe-after-clofibrate.json/.tsv (total 10): identity-level = EXACTLY 2 local-record candidates —
  spec:MSP-PR9-TEST-CLO-1MM @1.15 (the only spec row with the exact label) and concept:
  MAT-1-mm-clofibrate1-mm-clof-l84l @1.15 with the CLEAN label; 0 MSP-API-*; 0 ALQ-IMPLICIT-EVG_API_*.
- probe-after-dmso.json/.tsv (total 21): exact-label concept 'DMSO' = EXACTLY 1 local record —
  MAT-PR9-TEST-DMSO @1.15 (MAT-TEST-DMSO gone). Note: the AFTER DMSO window also now shows two
  ontology 'DMSO' rows (BAO:0000118, CHEBI:28262 @0.75) that were ABSENT from the BEFORE dump —
  observed live, not caused by this item's file-level operations (the resolve engine's ontology
  merge surfaced them in this window; flagged for the reviewer, receipts are raw).
- non-vacuity-analysis.txt: raw dumps PROVABLY CHANGED (clofibrate 21→10; DMSO membership changed,
  incl. loss of the 7 shell + 7 aliquot + MAT-TEST-DMSO rows). The §3.8 AFTER table holds on the
  store's own identity set: clofibrate = 1 spec + 1 concept (the "2" the spec itself calls correct);
  DMSO = 1. An unchanged dump would have failed this item; it changed.
  Caveat on the pair: the BEFORE/AFTER DMSO dumps are NOT engine-state-identical — the AFTER set
  carries BAO:0000118 + CHEBI:28262 at 0.75 that the BEFORE capture lacked, and they persist in a
  live re-probe, so the pair should not be read as a single-population diff (it does not weaken
  non-vacuity: MAT-TEST-DMSO demonstrably left the local-record set).
- dangling-refs-after.txt + dangling-refs-after-map.txt: the spec §3.4 enumeration from the
  data repo root (adapted: the data repo has NO docs/ dir — grep's per-id 'No such file' recorded
  in the artifact; records/ is the complete search space). Result: EXACTLY the 8 expected files
  (7 records/event-graph/EVG-API-mu*__spec-first-add-material.yaml + records/form-draft/
  DRAFT-91172e04-01fe-4949-8424-a21ee7b3216a__untitled.yaml); MAT-TEST-DMSO contributes 0.
  The 8 are PROVENANCE — untouched (B1 :152-154).
- cleanup-ledger.md: the written cleanup record (per-id table: id | path | label | kind |
  contentSha | survivor | HTTP status | data-repo commit | dangling refs created; header states
  store path, actor header, the 5 pre-existing dirty paths, before/after receipt filenames).

## STEP 5 — the ONE data commit (fe913e3f)
- Files: schema/scientist-intent/scientist-intent-vocabulary.yaml (+8: the §4.1 identityCollapse
  block, verbatim from B1, under policies.ambiguity); schema/scientist-intent/scientist-intent-vocabulary
  .schema.yaml (+19: the §4.2 closed identityCollapse property; NOT added to ambiguity.required —
  absence stays legal); server/src/compiler/scientistIntent/vocabulary.ts (ONE line: the optional
  identityCollapse field on the ambiguity type — plumbing only, the whole TS change per §4.3/OQ3);
  server/src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts (NEW, 5 legs); fixtures
  vocab-identity-collapse{,-reversed,-off,-badkey,-badsurvivor,-extra-sibling}/ (6 copy dirs).
- No NEW YAML file (a parallel file is a DEFECT per B4); no consumer; no comparator; no branch.
- GREEN receipt (post-commit, same command as §6):
  /mnt/vast/home/brad/git/wt/L2-DATADUP-l2t2245/.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/green-run.txt
  → `Test Files 1 passed (1); Tests 5 passed (5)`.

## STEP 6 — verification commands (raw output tails in receipts)
- Targeted: npx vitest run src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts
  → 5/5 (green-run.txt).
- Full gates as SET DIFFS (spec §6 — trunk carries pre-existing failures; a raw "all green" claim
  is unavailable and was not fabricated): receipts/suite.txt + receipts/tsc.txt.
  - vitest run: baseline cf855add (dedicated worktree at the claim-tip merge base) vs after fe913e3f:
    258 vs 259 failing FILES; NEW failing files: NONE; one base-only file (src/schema/
    MaterialReceivingSchemas.test.ts) passed on the after run (pre-existing trunk debt, not touched
    by this item — improvement, not regression).
  - npx tsc --noEmit: raw error lines 25 = 25; unique (file, code) sites 16 = 16; NEW: NONE;
    GONE: NONE. The split is 18 TS2307 "Cannot find module" (missing untracked files in the fresh
    worktree) + 7 CASCADED type errors in the same untouched files — TS18048 (AgentOrchestrator.ts
    :4181), five TS7006 (AgentOrchestrator.ts :4230/:4240/:4326, resolveDraftMaterials.ts :196,
    run-execution.ts :308) and one TS2379 exactOptionalPropertyTypes (AgentOrchestrator.ts :4332).
    Corrected receipt with the real split and the verbatim output: receipts/tsc-split-rerun.txt
    (re-run in this worktree, 25 raw = 18 + 1 + 5 + 1). It supersedes the "all 25 TS2307" summary
    line at tsc.txt:2, which mislabelled the same 25 lines. Touched files (vocabulary.ts, the new
    test) appear in NEITHER error set.
- Live acceptance re-check (post-commit, :3093 still serving): /api/resolve clofibrate → 2
  local-record candidates; /api/resolve DMSO → exact-label local set = ["local:MAT-PR9-TEST-DMSO"].
  :3093 health 200 at the end (never restarted; the :3093 backend runs from the cl-integration-2
  worktree, and the identityCollapse block is consumed by nothing at HEAD per OQ3, so no restart
  was needed for the AFTER receipts — spec §6).

## What a reviewer should check hardest
1. Non-vacuity receipts are RAW, not re-derived: probe-before-*.json vs probe-after-*.json
   (receipts dir). The DMSO AFTER window gained two ontology DMSO rows (BAO/CHEBI @0.75) absent
   from BEFORE — the identity-level claim (1 local record) is what holds; flag if the reviewer
   reads the raw DMSO total as the identity measurement.
2. The 409→200 note in removal-log.txt: the harness (not the API) dropped expectedSha on the first
   aliquot pass; got==read-sha; retry per spec. Verify the data-repo commit chain
   (78b3f623..394f384c, --name-status) shows each delete touching only its own path.
3. The label-fix PUT body: exactly two string substitutions (name + the quoted definition
   substring); domain/status untouched; stale slug left alone (ledger row says so).
4. The identityCollapse data: shipped block verbatim vs the fixture base copy (leg 1 byte-parity),
   closed enums doing the rejecting in legs 4/5 (never-guess wall at data level), and that the
   shipped block is NOT consumed anywhere at HEAD (OQ3 — consumer is COMPOSITION-BIND-1's).
5. The 8 dangling refs in dangling-refs-after.txt are untouched provenance; the 5 pre-existing
   dirty paths in the data repo are still uncommitted (I never touched them).

## Assumptions (recorded, not asked)
- AS-HYGIENE-STORE (§3.1): surgery on lane-2 store only (OQ1 ruling).
- AS-DELETE-VIA-HTTP: API-only removals; STOP-and-report on any refusal, no hand edits.
- AS-ORDER: aliquots → shells → MAT-TEST-DMSO.
- AS-SLUG-STALE: label fix keeps old filename slug (ordinary-path design; spec §9.8).
- AS-CLEANUP-RECORD: cleanup-ledger.md is the written cleanup record.
- AS-NO-BROWSER: receipts are API-level; no :5193 gate on this item.
- AS-SYMLINK: this fresh worktree lacked the untracked `server/schema -> ../schema` symlink
  (fleet-known; materialized from the lane's trunk-disk convention: relative symlink, untracked,
  NOT committed). Without it `defaultScientistIntentVocabulary()` ENOENTs at `server/schema/…`.

## STEP 1 — RED-first contract test (commit 659caa7b)
- NEW `server/src/compiler/scientistIntent/vocabularyIdentityCollapse.test.ts` (5 legs, spec §4.4;
  leg 6 skipped — no consumer at claim tip, OQ3; stated in test header).
- NEW fixtures (copies, never the shipped file): `fixtures/vocab-identity-collapse/` (base copy of
  the shipped triplet WITH the §4.1/§4.2 blocks pre-applied — the data the loader must report) plus
  `-reversed` (survivor order mirrored), `-off` (block removed), `-badkey` (key[0]=term),
  `-badsurvivor` (survivor[0]=fuzzy_match), `-extra-sibling` (undeclared prop under identityCollapse).
  Malformed variants carry the shipped meta-schema, so the closed enums / additionalProperties:false
  do the rejecting (never-guess at the data level, zero TS).
- RED receipt: .hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/red-run.txt
  (absolute: /mnt/vast/home/brad/git/wt/L2-DATADUP-l2t2245/.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/red-run.txt)
  Raw tail: `Test Files 1 failed (1); Tests 2 failed | 3 passed (5)`.
  - leg 1 FAIL: `no identityCollapse block in data file: …/schema/scientist-intent/scientist-intent-vocabulary.yaml`
    (shipped YAML has no block — the right RED reason).
  - leg 2 FAIL: same, on the shipped-file read for the data-side mirror.
  - legs 3/4/5 PASS at RED: off-state absence + the two enum rejections + closed-schema rejection
    are schema-level properties exercised against the fixture copies (expected and recorded, not
    defects: the meta-schema pair travels with the fixtures).
- Interface field NOT yet added — leg 1 also fails TS typecheck pre-commit (the LSP flagged
  property 'identityCollapse' on the ambiguity type); it goes in the ONE commit with the YAML.

## FINAL — deliverables
(1) Commits (lane branch cl/lane2-prompt2-datadup-1-l2t2245):
  - cf855add — STEP 0 trunk merge (cl/integration-2, docs-only drift, no conflicts)
  - 659caa7b — report + pin re-read + RED receipt (test/fixture RED, legs 1-2 failing on the
    missing shipped block)
  - fe913e3f — THE ONE data commit: YAML block + closed meta-schema property + one optional
    interface field + contract test + 6 fixture dirs (GREEN 5/5)
  - 365c3333 — the run's evidence-trail docs commit (final report + remaining receipts), authored
    after the run died at report-finalize.
  The evidence-trail docs commits are defined by reference, not by a fixed list: they are every
  commit after fe913e3f on this branch that touches `.hermes/plans/`. Enumerate them at read time
  with:
      git -c core.fileMode=false log --oneline fe913e3f..HEAD -- .hermes/plans/
  One of those commits carries the text you are reading; which one is deliberately NOT written into
  this file, so no sentence here becomes false when a further docs commit lands. A captured snapshot
  of the chain, labelled with the command that produced it, is at
  .hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/commit-chain-at-head.txt — read it
  as a capture of a moment, not as the current state.
  Data-repo commits (lane-2 store, API-produced, 78b3f623..394f384c): 15 deletes
  (bc4c692e b54edecd b1ef4dbe a77dd211 20aad60b eef726c1 798ba6e9 80f1bacc 92c617fb d1ce44a7
  34aa406c b6d17972 ebb88f86 a7faaad4 0442b918) + 1 label fix (c8ef996d), interleaved with the
  server's index-rebuild commits; full per-id table in cleanup-ledger.md.
(2) 15 removed ids + final HTTP status (see receipts/removal-log.txt for the raw 409-retry trail):
  7 aliquot ids — final status 200 (literal in the log):
  ALQ-IMPLICIT-EVG_API_MU50X5Z7_EVT_API_MU50X5Z7 200 · ALQ-IMPLICIT-EVG_API_MU50YJK9_EVT_API_MU50YJK9
  200 · ALQ-IMPLICIT-EVG_API_MU50YYSB_EVT_API_MU50YYSB 200 · ALQ-IMPLICIT-EVG_API_MU7UYW18_EVT_API_MU7UYW18
  200 · ALQ-IMPLICIT-EVG_API_MU7UZGNR_EVT_API_MU7UZGNR 200 · ALQ-IMPLICIT-EVG_API_MU7V07F1_EVT_API_MU7V07F1
  200 · ALQ-IMPLICIT-EVG_API_MUJSUE6O_EVT_API_MUJSUE6O 200.
  8 ids — final status NOT CAPTURED (harness printed the unset sentinel `CODE`; see STEP 3):
  MSP-API-mu50x5z7 · MSP-API-mu50yjk9 · MSP-API-mu50yysb · MSP-API-mu7uyw18 · MSP-API-mu7uzgnr ·
  MSP-API-mu7v07f1 · MSP-API-mujsue6o · MAT-TEST-DMSO — each proven removed by a `success:true`
  body with its own data-repo commit sha, and all 15 ids confirmed 404 on post-removal GET.
  Label fix PUT MAT-1-mm-clofibrate1-mm-clof-l84l 200 ("1 mM clofibrate1 mM Clofibrate in DMSO"
  → "1 mM Clofibrate in DMSO"; not a duplicate per dup-test-before.txt, so OQ2 default applied).
(3) Before/after dumps (absolute; dir
  /mnt/vast/home/brad/git/wt/L2-DATADUP-l2t2245/.hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/):
  probe-before-clofibrate.json ↔ probe-after-clofibrate.json: 21 → 10 raw; identity-level local-record
  16 → 2 (exact-label 8 → 2: now spec MSP-PR9-TEST-CLO-1MM + concept MAT-1-mm-clofibrate1-mm-clof-l84l
  clean-labelled). probe-before-dmso.json ↔ probe-after-dmso.json: raw 21 → 21 (membership changed);
  exact-label 'DMSO' concept rows 2 → 3 (2 → 1 LOCAL RECORDS — MAT-TEST-DMSO removed, MAT-PR9-TEST-DMSO
  survives; the after set additionally carries ontology rows BAO:0000118 and CHEBI:28262 @0.75, per
  non-vacuity-analysis.txt:13-15). Dumps CHANGED — non-vacuity leg holds.
(4) Files changed (lane branch): the five in-scope files of commit fe913e3f (2 schema YAMLs,
  vocabulary.ts, the new test, 6 fixture dirs) + the evidence-trail docs changes, which are carried
  by every commit after fe913e3f that touches `.hermes/plans/` — enumerated, with no count asserted
  here, by `git -c core.fileMode=false log --oneline fe913e3f..HEAD -- .hermes/plans/`. (This report
  and the receipts under
  .hermes/plans/receipts/L2-PROMPT2-DATA-DUP-RECORDS-1/l2t2245/ are the tracked files that chain
  changes; see commit-chain-at-head.txt for a labelled capture.)
  Lane-2 DATA store:
  16 API-produced commits (15 deletes + 1 label fix) + index rebuilds; no hand edits anywhere.
(5) Reviewer hardest checks: the "What a reviewer should check hardest" section above (raw
  before/after dumps; the 409-retry note; the data-repo per-path commit chain; the label-fix body;
  the closed-enum never-guess legs; provenance + dirty-path integrity).

DATADUP DONE fe913e3f2b10ef4272898b537e4bc2412ef4e031 (product tip; this docs commit follows it — run died on an inference admission timeout at 2026-11-03T01:11:52 after finishing the work)
