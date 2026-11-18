# L2-NOUN-FROM-DOC-1 fieldoutcomes — Report (Lane 2)

Worktree: /home/brad/cl-wt/L2-NOUN-FROM-DOC-1-fieldoutcomes-lane2
Branch: cl/lane2-nounfromdoc-fieldoutcomes-2156
Base: ab64c8f161b0f8f09bb7ab17de28c8d89534a3b5
Unit: fieldoutcomes (1 of 1 this run; first leg of the item)

## Intent
The spec-sheet extraction result accounts for EVERY field the spec-sheet YAML
declares: each reported as `extracted` (verbatim passage) or `not_present`
(no `passage` key at all) — so "no evidence" is observable apart from
"never asked for". One seam, three files.

## Changed files (3, owned exactly as scoped)
1. `server/src/ingestion/SpecSheetExtractor.ts` (+52/-0)
   - `SpecSheetFieldOutcome { targetField; status: 'extracted' | 'not_present'; passage? }`
     (`passage` present ONLY when status is 'extracted' — conditional object
     literal, never `?? undefined`, never `''`; exactOptionalPropertyTypes-safe)
   - `fieldOutcomesFor(fieldMap, proposals)`: walks `fieldMap.fieldMappings`
     in declaration order (no sort), de-duplicates by targetField, first
     proposal per field wins the passage. Field list is DATA (YAML), no
     literal array in TS.
   - `fieldOutcomes` added to `SpecSheetExtractSuccess` AND
     `SpecSheetExtractNoProposals` (every declared field necessarily
     not_present there). Wired at both return sites in `extractFromUrl`.
   - `extractProposals`: signature and behaviour untouched.
2. `server/src/ingestion/SpecSheetExtractor.test.ts` (+83/-0)
   - New RED pin (then green): doc with only `Vendor: Thermo` +
     `Catalog Number: 25200056` → 2 proposals, 9 outcomes in YAML order,
     2 extracted (passage verbatim substrings), 7 not_present with NO
     `passage` key (`'passage' in o === false`), not_present fields absent
     from proposals.
   - AC3 pin: swaps a 10th fieldMapping into
     `schema/ingestion/spec-sheet.vendor-product.yaml`, calls exported
     `reload()`, asserts 10 outcomes (length tracks the YAML with zero TS
     edits), restores the file + reloads in `finally`.
   - Existing 19 pins untouched and passing.
3. `app/src/shared/api/client.ts` (+9/-0)
   - `SpecSheetFieldOutcome` (same 3-key shape) + `fieldOutcomes?` on the
     client `SpecSheetExtractSuccess` ONLY. No other client change; the
     legacy union's missing NoProposals variant left exactly as-is.

## Decisions / deviations (measured, not invented)
- D1: client mirror key is OPTIONAL (`fieldOutcomes?`), not required.
  Measured: making it required breaks `app` tsc (rc≠0) at the PROHIBITED
  `VendorProductBuilderModal.specSheetDoor.test.tsx:21` (typed success-shape
  mock without the new key) — and that file is outside this unit's scope.
  Optional keeps `app` tsc rc=0 and that test file's 4/4 passing; the live
  payload always carries the full list (server key stays REQUIRED, so the
  JSON contract is unchanged). AC1 is graded by the server unit pins.
- D2 (environment, no code): `server/node_modules` and `app/node_modules`
  were ABSENT in this fresh worktree at start (brief: "node_modules is
  provided" — it was not, here). Per fleet precedent (sibling lane-2 report:
  "Substituted app/node_modules -> /home/brad/git/computable-lab/..."),
  symlinked all three node_modules to the canonical intact store
  `/home/brad/git/computable-lab` after verifying root/server/app
  package.json are byte-identical (`diff` clean). No npm install/ci run.
  node_modules is gitignored → tree unaffected.

## Budget
`git diff --unified=0 ab64c8f1 -- <3 files>`: +144 lines total
(extractor +52, test +83, client +9), 0 deletions, 3 files. Budget: files<=3,
lines<=160. WITHIN budget (comment trims applied in 242aef4a).

## Verification — RAW outputs

### Baseline at ab64c8f1 (before any edit)
```
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (19 tests) 20ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```
server tsc rc=0, app tsc rc=0 (both measured pre-edit).

### 1. RED pin (commit cc5d3d54) — raw failure
```
FAIL  src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — fieldOutcomes accounts for every declared field > success payload carries an outcome for all 9 declared fields: 2 extracted, 7 not_present
AssertionError: Target cannot be null or undefined.
 ❯ src/ingestion/SpecSheetExtractor.test.ts:630:34
    628|     const fieldMap = await getSpecSheetFieldMap('vendor-product');
    629|     expect(fieldMap.fieldMappings).toHaveLength(9);
    630|     expect(result.fieldOutcomes).toHaveLength(9);
       |                                  ^
    631|     expect(result.fieldOutcomes.map((o) => o.targetField)).toEqual(
⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

### 2. GREEN after extractor + type (commit 22279eb9)
```
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (20 tests) 19ms
 Test Files  1 passed (1)
      Tests  20 passed (20)
```
(server tsc rc=0 in the same run)

### 3. Mutation probe (required, one edit only)
Edit: deleted the `fieldOutcomes,` line from the SUCCESS return site in
`extractFromUrl` (the noProposals site and the helper untouched).
Raw result:
```
FAIL  src/ingestion/SpecSheetExtractor.test.ts > extractFromUrl — fieldOutcomes accounts for every declared field > success payload carries an outcome for all 9 declared fields: 2 extracted, 7 not_present
AssertionError: Target cannot be null or undefined.
 ❯ src/ingestion/SpecSheetExtractor.test.ts:630:34
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```
The new pin went RED on its own (no second mechanism supplies the field —
the noProposals site does not run on a 2-proposal success path). Reverted
via patch restore; `git -c core.fileMode=false status --short` after revert
printed NOTHING (clean) and `git diff --stat` was empty → product file
byte-identical to the committed version before the next commit.

### 4. Final targeted run (all code in, commit 242aef4a)
```
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests) 26ms
 Test Files  1 passed (1)
      Tests  21 passed (21)
```
Baseline 19 + 2 new pins = 21, zero failures.

### 5. Regression on the data loader (unchanged file)
```
 ✓ src/ingestion/SpecSheetFieldMaps.test.ts  (7 tests) 46ms
 Test Files  1 passed (1)
      Tests  7 passed (7)
```

### 6. Typecheck
```
cd server && npx tsc --noEmit  → rc=0
cd app    && npx tsc --noEmit  → rc=0
```
(additional consumer check: `app` vitest
`VendorProductBuilderModal.specSheetDoor.test.tsx` 4/4 passed with the
client mirror in place)

### 7. AC3 YAML-swap proof (pin committed in 94968a3e, run in isolation)
```
cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts -t "AC3"
 ✓ src/ingestion/SpecSheetExtractor.test.ts  (21 tests | 20 skipped) 17ms
 Test Files  1 passed (1)
      Tests  1 passed | 20 skipped (21)
```
Mechanism (inside the test only, per the brief): read
`schema/ingestion/spec-sheet.vendor-product.yaml`, insert a 10th mapping
(`ac3_probe_field`) before `synonyms`, call the exported `reload()`, run
`extractFromUrl('vendor-product', ...)` → `fieldOutcomes` has 10 entries
(9 original + probe, still in YAML order), 2 extracted. `finally` restores
the exact original bytes + `reload()`; post-restore assertion: 9 mappings.
No production-path I/O added; `extractFromUrl` still reads the loader cache.
After the run: `git status --short` empty (YAML back to base bytes).

### 8. Tree
```
cd server && npx vitest run src/ingestion/SpecSheetExtractor.test.ts
→ Tests 21 passed (21)
cd server && npx vitest run src/ingestion/SpecSheetFieldMaps.test.ts
→ Tests 7 passed (7)
cd server && npx tsc --noEmit → rc=0
cd app && npx tsc --noEmit → rc=0
git -c core.fileMode=false status --short → (empty, clean)
```

## Acceptance contract mapping
- AC1: pinned by the new success-path test (2 proposals; 9 outcomes; 2
  extracted with verbatim passages; 7 not_present with NO passage key).
- AC2: pinned — not_present fields never enter `proposals` (proposals
  pinned to exactly [catalog_number, vendor]); not_present outcomes have
  no `passage` key at all (never `''`, never a guess). `extractProposals`
  untouched → 19 legacy pins green.
- AC3: pinned by the swap+reload test above; proven with zero TS edits.
- Browser ACCEPTANCE: waived per brief (observable = JSON body of the
  extract route; graded by unit pins; no browser surface touched).

## What must NOT change — verified
- `extractProposals` signature/behaviour: untouched (diff: 0 deletions in
  that function region; all 19 legacy pins green).
- `noProposals.reason` values: unchanged (`no_field_match` pin green).
- Nothing written to any record: no writer touched.
- Prohibited files: `SpecSheetFieldMaps.ts`, `schema/ingestion/**`
  (restored byte-identical after AC3), `SpecSheetHandlers.ts`,
  documentIntake/pipelines/ai, all other app files — never edited
  (`git diff --name-only ab64c8f1..HEAD` = exactly the 3 owned files).
- Client union's missing NoProposals variant: left broken exactly as-is.

## Commits (base → HEAD, no rebase/amend)
```
242aef4a L2-NOUN-FROM-DOC-1 fieldoutcomes: trim comments to output budget (144 added lines, 0 deletions)
94968a3e L2-NOUN-FROM-DOC-1 fieldoutcomes: AC3 pin — outcome list length tracks YAML fieldMappings via swap+reload, no TypeScript edit
9e30fbc3 L2-NOUN-FROM-DOC-1 fieldoutcomes: mirror SpecSheetFieldOutcome + fieldOutcomes on client SpecSheetExtractSuccess (optional; legacy union mocks must keep compiling)
22279eb9 L2-NOUN-FROM-DOC-1 fieldoutcomes: fieldOutcomes projection — outcome per declared field (extracted/not_present), wired into success and noProposals paths
cc5d3d54 L2-NOUN-FROM-DOC-1 fieldoutcomes: RED pin — success payload accounts for all 9 declared fields (2 extracted / 7 not_present)
```
Marker commit: follows this report (appends the marker line with the sha of
the commit that CONTAINS this report; verified via git cat-file -e).

## Next action / owner
Implementation complete (3/3 owned files, 5 commits, all pins green, budget
met). Awaiting adversarial review / gate. No blockers. If the reviewer rules
the client key must be REQUIRED, the follow-up must extend the legacy union
+ the specSheetDoor test fixtures — a different item per this brief's scope.
L2-NOUN-FROM-DOC-1 UNIT 1 DONE 3284dd581aa790697c3d832aacf1a680a3ad4945 (report contained at this sha)
L2-NOUN-FROM-DOC-1 UNIT 1 DONE 9509856f0781fdade3d4f5aa639fa68e3562619d (final; supersedes the earlier marker line — that sha contains this report and this line)
