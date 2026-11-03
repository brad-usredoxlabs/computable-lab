# SPEC (PRE-STAGED, NOT DISPATCHED) — FAME-1B-BACKFILL

Lane 1 · written by the 281ST tick 2026-11-03T10:03 EDT, while the item remains
**HOLD-for-Brad** (`A-L1T229-3`). Nothing here is executed; this file exists so that
Brad's one-line go converts the pass into a single command with no remaining discovery.

## Why this spec exists now

Every previous tick recorded the same blocker text — "needs Brad's one-line go" — and the
item's own scope note carried an unmeasured estimate ("ACQP-000006 ... and ACQP-000008,
minimum"). This tick measured the real set and the real expected values first-hand, so the
hold is the ONLY thing left between the item and done.

## Measured scope (first-hand, this tick)

Ran the **shipped** classifier (`server/src/storage/acquisitionPackageStatus.ts`,
`classifyAcquisitionPackageStatus`) against every lane-1 acquisition-package record's own
stored `run_log` member, with the provider resolved **per member** from the data-reference's
`storageDeviceId` → `config.yaml` `storageDevices[].mountPath`.

Script: `~/.hermes/cl/lanes/1/evid-fame1b-dryrun-l1t281.mjs`
Receipt: `~/.hermes/cl/receipts/FAME-1B-BACKFILL/tick-281ST/dryrun-scope-table.json`
(trunk `1107525d`, node v26.8.1, read-only — zero writes to any store)

**Faithfulness control:** the 4 records FAME-1 already stamped reproduce EXACTLY —
`ACQP-000009 unknown`, `ACQP-000010 aborted`, `ACQP-000011 completed`, `ACQP-000012 completed`
→ **4 agree / 0 disagree**. The invocation is therefore faithful to the registration-time call.

**9 records lack `acquisitionStatus`** (not 2):

| record | directoryKey | device | expected status | qualified | matched ruleId(s) |
|---|---|---|---|---|---|
| ACQP-000001 | machine1/20201025-RESTEK-H-KERRYGOLD.D | gc-fid-nas | `completed` | false | completed-method-completed |
| ACQP-000002 | machine1/RES35077-4.D | gc-fid-nas | `completed` | false | completed-method-completed |
| ACQP-000003 | gc14-drift/RES35077-4.D | vast | `unknown` | true | — (`member-unreadable`: no such dir on the vast mount) |
| ACQP-000004 | machine1/RES35077-4.D | gc-fid-nas | `completed` | false | completed-method-completed |
| ACQP-000005 | machine1/RES35077-5.D | gc-fid-nas | `completed` | false | completed-method-completed |
| **ACQP-000006** | machine1/20201023-WEGMANS-BUTTER.D | gc-fid-nas | **`aborted`** | true | aborted-method-aborted, aborted-method-sequence-stopped, aborted-io-error |
| ACQP-000007 | machine1/RES35077-4.D | gc-fid-nas | `completed` | false | completed-method-completed |
| ACQP-000008 | lane1-gate-fixtures/L1GATE-6a298b.D | vast | `unknown` | true | — (`no-rule-match`: plain-ASCII fixture log) |
| ACQP-GATE-L1T2130 | lane-gate-fixtures/GATE-4D.D | vast | `unknown` | true | — (`no-rule-match`) |

Byte-level provenance was verified for the headline case: `DREF-000123` declares
`contentHash fc465b10fe5cba12160ee39e7cd0e0b890919b91ba240ecffc91896ddbee51da`, and
`sha256sum /mnt/vast/gc-fid/machine1/20201023-WEGMANS-BUTTER.D/RUN.LOG` = **`fc465b10…`**
(1250 bytes, exact match). The abort evidence is therefore the real instrument log, not a copy.

## Mechanism (reuse only — no new code path in the product)

1. `GET /api/records/<id>` (lane stack :3092, `x-user-id: USR-QMS-ADMIN`) → payload.
2. Locate `files[].role == 'run_log'` → its `dataReferenceRef.id` → the data-reference record
   → `storageDeviceId` + `path`; resolve `mountPath` from `config.yaml` `storageDevices`.
3. Verify the member's sha256 against the DREF's `contentHash` before classifying (refuse on
   mismatch — never stamp from unverified bytes).
4. Call the shipped `classifyAcquisitionPackageStatus(provider, directoryKey, {relativePath})`
   with `provider.read` reading `<mountPath>/<joined path>`.
5. `PUT /api/records/<id>` with the payload plus `acquisitionStatus`,
   `acquisitionStatusQualified`, `acquisitionStatusEvidence` (the stamp verbatim). No other
   field touched.
6. Skip any record that already has `acquisitionStatus` → a rerun is a no-op (idempotency).

### Harness trap to pin (cost me one wrong dry run)

`classifyAcquisitionPackageStatus`'s third argument is the **member-relative** path
(`{ relativePath: 'RUN.LOG' }`), which it joins with `directoryKey` internally. Passing the
DREF's device path (`machine1/…/RUN.LOG`) double-prefixes it
(`<mount>/machine1/…/machine1/…/RUN.LOG`) and the classifier silently returns
`unknown` / `member-unreadable` — a FALSE floor that looks exactly like a legitimate result.
The backfill MUST pass `RUN.LOG` and must assert `decode.encoding == 'utf-16le'` for the six
real-corpus records, so a path bug can never masquerade as an honest unknown.

## Boundaries

- No schema change, no lint change, no UI change, no new vocabulary, no new product code path.
- Writes only to the lane data store (`/home/brad/.computable-lab-lane1`); never Brad's live dir.
- The three `unknown` stamps are the classifier's **declared floor** (`fallbackStatus: unknown`
  in `config/gc-acquisition-status/log-patterns.yaml`), carrying the named reason. Stamping
  them is honest, not fabrication: the alternative (leaving the field absent) hides that these
  records have no readable evidence at all.
- Scope narrowing to only the 6 readable records would be a **deviation** from the item's
  "every ... LACKING" wording — do not narrow silently.

## Acceptance (unchanged from the item, made checkable)

1. API readback of all 9 shows `acquisitionStatus` + `acquisitionStatusEvidence.ruleset`
   `{id: gc-run-log-acquisition-status, version: 1}` + the matched lines for the 6 readable rows.
2. `ACQP-000006` reads **`aborted`** with its 3 matched lines preserved verbatim.
3. The 4 previously-stamped records are byte-unchanged (they are skipped, not rewritten).
4. A second run reports 9 skipped / 0 written (idempotent).
5. `git status` on the code repo: zero product-file changes; the pass is data + this spec only.
6. Run-sheet status chip renders for ACQP-000006 — browser spot-check rides the next lane gate
   naturally (FAME-1's own criterion; not a standalone gate for this item).

## Resume condition

Brad's affirmative on `FAME-1B-BACKFILL`. On go: execute steps 1–6 above as one scripted pass,
then write the handoff with the API readback receipt and mark done. Do not re-derive the table —
this measurement is the baseline, and it is reproducible by re-running the script above.
