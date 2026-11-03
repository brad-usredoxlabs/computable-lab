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

## Assumptions (recorded, not asked)
- AS-HYGIENE-STORE (§3.1): surgery on lane-2 store only (OQ1 ruling).
- AS-DELETE-VIA-HTTP: API-only removals; STOP-and-report on any refusal, no hand edits.
- AS-ORDER: aliquots → shells → MAT-TEST-DMSO.
- AS-SLUG-STALE: label fix keeps old filename slug (ordinary-path design; spec §9.8).
- AS-CLEANUP-RECORD: cleanup-ledger.md is the written cleanup record.
- AS-NO-BROWSER: receipts are API-level; no :5193 gate on this item.
