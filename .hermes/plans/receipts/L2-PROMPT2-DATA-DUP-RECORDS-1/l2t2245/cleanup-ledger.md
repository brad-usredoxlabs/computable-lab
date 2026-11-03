# Cleanup ledger — L2-PROMPT2-DATA-DUP-RECORDS-1 (l2t2245)

The written cleanup record (B1 :158). All removals/fixes via the ORDINARY HTTP record
path on :3093 (lane-2 store) — no hand-edited files.

- Store: /home/brad/.computable-lab-lane2 (worktrees/main), served by :3093 (OQ1 ruling;
  config CONFIG_PATH /home/brad/.hermes/cl/lanes/2/lane2-config.yaml, dataDir line 5)
- Actor header: `x-user-id: USR-BRAD` (the shells' createdBy; resolved active; no local-admin fallback needed)
- Data repo base HEAD at start: 78b3f623 "Update record index"
- Pre-existing dirty paths in the data repo at start (5 uncommitted deletions — NOT mine; recorded, never reverted/committed):
  - D records/labware/LBW-FLAT-BOTTOM-96-WELL-PLAT-3776__flat-bottom-96-well-plate.yaml
  - D records/material/MAT-bashingbead-lysis-module-1ems__bashingbead-lysis-module-96-deep-well.yaml
  - D records/material/MAT-eluate-plate-supernatant-sd0h__eluate-plate-supernatant.yaml
  - D records/material/MAT-lysed-96-well-deep-block-15au__lysed-96-well-deep-block.yaml
  - D records/material/MAT-sample-liquid-sois__sample-liquid.yaml
- Before receipts: probe-before-clofibrate.json (21 candidates), probe-before-dmso.json
  (21 total; 2 exact-label 'DMSO' concept @1.15); shas-before.txt (contentSha read for all 16 ids incl. label-fix target)
- After receipts: probe-after-clofibrate.json, probe-after-dmso.json, non-vacuity-analysis.txt, dangling-refs-after.txt

## Removed (15) — order: aliquots → shells → MAT-TEST-DMSO (AS-ORDER)

| id | path | label | kind | contentSha read | survivor | HTTP status | data-repo commit | dangling refs created |
|---|---|---|---|---|---|---|---|---|
| ALQ-IMPLICIT-EVG_API_MU50X5Z7_EVT_API_MU50X5Z7 | records/aliquot/ALQ-IMPLICIT-EVG_API_MU50X5Z7_EVT_API_MU50X5Z7__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | bfa4e3cfdbfd9cc6f8acaa574a5a18f867f6dba2 | MSP-PR9-TEST-CLO-1MM (spec) / MAT-1-mm-clofibrate1-mm-clof-l84l (concept) | 409 first (harness dropped expectedSha; got == read sha) → 200 retry | bc4c692e | EVG-API-mu50x5z7 |
| ALQ-IMPLICIT-EVG_API_MU50YJK9_EVT_API_MU50YJK9 | records/aliquot/ALQ-IMPLICIT-EVG_API_MU50YJK9_EVT_API_MU50YJK9__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | 66202e7545ba65fcdf2350072640f2ead14da30c | (same) | 409 → 200 | b54edecd | EVG-API-mu50yjk9 |
| ALQ-IMPLICIT-EVG_API_MU50YYSB_EVT_API_MU50YYSB | records/aliquot/ALQ-IMPLICIT-EVG_API_MU50YYSB_EVT_API_MU50YYSB__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | 2352ebe96538e9e3e946e7b953855db1312f2a09 | (same) | 409 → 200 | b1ef4dbe | EVG-API-mu50yysb |
| ALQ-IMPLICIT-EVG_API_MU7UYW18_EVT_API_MU7UYW18 | records/aliquot/ALQ-IMPLICIT-EVG_API_MU7UYW18_EVT_API_MU7UYW18__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | 2713aa66e769a93cce8de2c2c4ce99f0d7fb86da | (same) | 409 → 200 | a77dd211 | EVG-API-mu7uyw18 |
| ALQ-IMPLICIT-EVG_API_MU7UZGNR_EVT_API_MU7UZGNR | records/aliquot/ALQ-IMPLICIT-EVG_API_MU7UZGNR_EVT_API_MU7UZGNR__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | dae2bd9e12b89819fc739cf34db4e55ab2d58e5f | (same) | 409 → 200 | 20aad60b | EVG-API-mu7uzgnr |
| ALQ-IMPLICIT-EVG_API_MU7V07F1_EVT_API_MU7V07F1 | records/aliquot/ALQ-IMPLICIT-EVG_API_MU7V07F1_EVT_API_MU7V07F1__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | e207860f8cb5c4b601c713803cb80d8d33aff0bb | (same) | 409 → 200 | eef726c1 | EVG-API-mu7v07f1 |
| ALQ-IMPLICIT-EVG_API_MUJSUE6O_EVT_API_MUJSUE6O | records/aliquot/ALQ-IMPLICIT-EVG_API_MUJSUE6O_EVT_API_MUJSUE6O__ad-hoc-instance-of-1-mm-clofibrate-in-dmso.yaml | Ad hoc instance of 1 mM Clofibrate in DMSO | aliquot | 63e899ceeb395366431ce711a5d1498d10241204 | (same) | 409 → 200 | 798ba6e9 | EVG-API-mujsue6o |
| MSP-API-mu50x5z7 | records/material-spec/MSP-API-mu50x5z7__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | 91b0ff219ceff87628f33f1b846e1c6a458c8ce2 | MSP-PR9-TEST-CLO-1MM | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | 80f1bacc | EVG-API-mu50x5z7 + DRAFT-91172e04 |
| MSP-API-mu50yjk9 | records/material-spec/MSP-API-mu50yjk9__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | a3828fbbca72f8341d68deabba624172d2219f52 | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | 92c617fb | EVG-API-mu50yjk9 + DRAFT-91172e04 |
| MSP-API-mu50yysb | records/material-spec/MSP-API-mu50yysb__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | 612afe274a5290a0fcfcd59748e85e147b8c322d | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | d1ce44a7 | EVG-API-mu50yysb + DRAFT-91172e04 |
| MSP-API-mu7uyw18 | records/material-spec/MSP-API-mu7uyw18__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | 9452eeb297d3b0eb77d4b39456469eec064ad511 | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | 34aa406c | EVG-API-mu7uyw18 + DRAFT-91172e04 |
| MSP-API-mu7uzgnr | records/material-spec/MSP-API-mu7uzgnr__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | 2a43a9e63f66899d5d5885b54f96a2d91e56127a | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | b6d17972 | EVG-API-mu7uzgnr + DRAFT-91172e04 |
| MSP-API-mu7v07f1 | records/material-spec/MSP-API-mu7v07f1__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | da781f592f03cf23f9ccacdd9b1a0bb01cef6b7a | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | ebb88f86 | EVG-API-mu7v07f1 + DRAFT-91172e04 |
| MSP-API-mujsue6o | records/material-spec/MSP-API-mujsue6o__1-mm-clofibrate-in-dmso.yaml | 1 mM Clofibrate in DMSO | material-spec | 9703f4b33a542946c89970e2192016f01d244c93 | (same) | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | a7faaad4 | EVG-API-mujsue6o + DRAFT-91172e04 |
| MAT-TEST-DMSO | records/material/MAT-TEST-DMSO__dmso.yaml | DMSO | material (concept) | 65943f7ec7301220c67e659297d93cf6f6a033e8 | MAT-PR9-TEST-DMSO | NOT CAPTURED (harness printed unset `CODE`) — proven by success:true + sha + 404 | 0442b918 | none (0 refs; _index excluded) |

Notes on the 409-then-200 rows: the first-pass harness sent `?expectedSha=` with the id and
dropped the sha on word-splitting; the handler replied 409 "SHA mismatch: expected <id-echo>,
got <contentSha>" and the got value was IDENTICAL to the sha read in shas-before.txt. Retry with
got (spec §3.7 step 3) succeeded. Final HTTP status of record: 200 for the 7 aliquots only
(literal `HTTP=200` in removal-log.txt). For the 8 shell/MAT-TEST-DMSO removals the harness
printed the unset sentinel `CODE` instead of the status (removal-log.txt:78-93), so their status
code is NOT of record — those removals are proven instead by a `success:true` body carrying the
data-repo commit sha above plus GET-after=404 (re-captured with explicit status in
removal-status-recapture.txt). Seed-refusal canary
(§3.3): NEVER fired (no 405 APPEND_ONLY, no "resolves from seed" on any of the 15).
Post-removal GET /api/records/:id for all 15 → 404 NOT_FOUND (proof of removal, not a filter).
Survivors NOT deleted: MSP-PR9-TEST-CLO-1MM, MAT-PR9-TEST-DMSO, MAT-PR9-TEST-CLO,
MAT-clofibrate-1mm-10tf; the 7 EVG-API-* event-graphs and DRAFT-91172e04-* kept as PROVENANCE
(B1 :152-154) — they are the 8 dangling refs enumerated in dangling-refs-after.txt.

## Label fix (1) — OQ2: duplication test proved NOT duplicate (dup-test-before.txt)

| id | path | before label | after label | contentSha before → after | HTTP status | data-repo commit |
|---|---|---|---|---|---|---|
| MAT-1-mm-clofibrate1-mm-clof-l84l | records/material/MAT-1-mm-clofibrate1-mm-clof-l84l__1-mm-clofibrate1-mm-clofibrate-in-dmso.yaml (slug STALE by ordinary-path design — §9.8; NOT hand-renamed) | "1 mM clofibrate1 mM Clofibrate in DMSO" | "1 mM Clofibrate in DMSO" | 1aafaea34ef62048d7accc8f40be1aecb55d4a1e → ad9797f6b2fbfbb3b08932942a364f6a18c865f9 | 200 (PUT, body = whole GET payload with exactly two string substitutions: name + the quoted substring in definition; message "Fix concatenated label on MAT-1-mm-clofibrate1-mm-clof-l84l (CARD-1 W7 class)") | c8ef996d |

domain=other, status=proposed UNCHANGED. No other field touched (OQ2: no "improvement" beyond
removing the concatenation).

## Data-repo commit chain (78b3f623..394f384c, all API-produced)

Each delete/update commit touches ONLY its own record path; the server's index rebuilds
("Update record index", records/_index/records.jsonl) interleave by design (RecordHandlers
post-mutation rebuild). No commit touches the 5 pre-existing dirty paths; those remain
uncommitted in the data repo as found. Chain (oldest→newest):
bc4c692e b54edecd b1ef4dbe a77dd211 20aad60b eef726c1 798ba6e9 (7 aliquot deletes)
80f1bacc 92c617fb d1ce44a7 34aa406c b6d17972 ebb88f86 a7faaad4 (7 shell deletes)
0442b918 (MAT-TEST-DMSO delete) c8ef996d (label fix) — interleaved with the index commits.
End HEAD: 394f384c "Update record index".
