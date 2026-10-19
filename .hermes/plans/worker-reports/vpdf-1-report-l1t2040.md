# VPDF-1 coder report — l1t2040 (lane 1)

Item: VPDF-1 — vendor sectioner learns the quick-reference heading vocabulary
(Quick Protocol / Quick Reference are protocol sections).
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-18_VPDF-1-quick-protocol-heading-spec.md
Worktree: /mnt/vast/home/brad/git/wt/VPDF-1-lane1-l1t2040 (branch wt/VPDF-1-lane1-l1t2040, base f49ea3c1)
Model: appliance-2 qwen3.8-flash-next-iq3_xxs (3-bit quantized — see assumptions).

## Commits (worktree)
- RED:   0d998ad0 test(VPDF-1): RED — CellROX quick-reference fixture pins Quick Protocol as a protocol section
- IMPL:  c0a6a456 feat(VPDF-1): SECTION_HEADINGS learns the vendor quick-reference vocabulary
- REPORT: this file (committed after both).

Diffstat f49ea3c1..c0a6a456:
  server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts        |  8 +++
  server/src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts | 62 ++++++++++++++++++++++
  2 files changed, 70 insertions(+)

## Grounding verification (before editing)
Spec-cited lines verified first-hand in the worktree at f49ea3c1:
- headingPattern :107-110 (anchored `^<escaped>\b(?::[ \t]*\S|[^\S\n]*$|[ \t]{2,}\S)`, flags im) — confirmed; this is why `Protocol` never matches the line `Quick Protocol`.
- SECTION_HEADINGS :207-228 (11 entries) — confirmed.
- findAllHeadingIndexes :121-133 + TOC_ENTRY :118 — confirmed.
- headingTitleAt :151-164 (colon-suffix or fallback to table title) — confirmed.
- sectionVendorProtocolDocument :379-448 (searchableText \f→\n :384, sort by index, same-index dedupe :406, cover section :412-423) — confirmed.
- decode-level missing-section diagnostic :338-344; createProtocolDiagnostics :895-904 — confirmed.
- STEP_LABEL :690 + endsSentence :703 (page-break qualifies) — confirmed.
- types.ts VendorProtocolSectionKind union includes 'protocol' and 'other' — confirmed, no type change needed.

## Lane wiring (before baseline, no product-code impact)
Fresh worktree lacked the untracked "synced-from-main" paths listed in
/home/brad/.hermes/cl/lanes/1/lane-exclude (git core.excludesFile points there).
Prior lane worktrees (e.g. QMS7-9-lane1-l1t0310) wire these in; without them the
suite fails on missing imports, not on VPDF-1. Wiring done, matching prior-lane precedent:
- node_modules symlinks at ., app/, server/ -> /mnt/vast/home/brad/git/cl-integration-1/*/node_modules (per task instructions; never git-added).
- server/schema -> ../schema symlink (prior lanes have the identical symlink).
- 30 lane-excluded server/ paths symlinked from Brad's live checkout /mnt/vast/home/brad/git/computable-lab (read-only symlinks; includes server/src/lifecycle/BypassAudit.ts — a tracked file at f49ea3c1 imports it — and server/src/ingestion/vendor-protocol/VendorProtocolCandidateArtifacts.test.ts, a required regression file).
- 3 lane-excluded schema YAMLs COPIED (not symlinked): schema/core/datatypes/revision-ref.schema.yaml, schema/registry/labware-definitions/80x2ml-tube-rack.yaml, schema/registry/tube-sizes/tube-size-presets.v1.yaml. Reason: SchemaLoader.findSchemaFiles (server/src/schema/SchemaLoader.ts :121-143) uses Dirent.isFile(), which is false for symlinks, so symlinked schema data is silently skipped and Ajv fails `can't resolve reference ./datatypes/revision-ref.schema.yaml`. Prior lanes carry these as plain copies. NOT git-added (lane-exclude covers them; git status shows them absent).
None of these are staged or committed; `git status --porcelain` shows only the three node_modules symlink lines.

## BASELINE (captured after wiring, before any edit)
Command: cd server && npm run test:run src/ingestion/vendor-protocol src/protocol
Raw: /home/brad/.hermes/cl/lanes/1/vpdf-1-base-suite-l1t2040.txt
  Test Files  6 failed | 52 passed (58)
  Tests  17 failed | 488 passed (505)
Failing files at base (pre-existing debt, NOT caused by this item):
  src/ingestion/vendor-protocol/ZymoCampaignNegatives.test.ts (2 tests: W2-11 N5 import-set closure + routes/pipeline sha-pins)
  src/protocol/ProtocolIdeE2EFixture.test.ts
  src/protocol/ProtocolIdeIssueCardService.test.ts
  src/protocol/ProtocolIdeOverlaySummaryService.test.ts
  src/protocol/ProtocolIdeProjectionService.test.ts
  src/protocol/ProtocolIdeSessionService.test.ts
Trunk-checkout probe (read-only, no writes/restarts): the same ZymoCampaignNegatives
N5 tests fail identically in /mnt/vast/home/brad/git/cl-integration-1/server
(`Tests 2 failed | 14 passed (16)`) — confirms trunk debt, not lane wiring.
All six REQUIRED regression files were GREEN at base:
  ✓ ZymoGoldenE2E (1), ✓ ZymoCampaignGoldenE2E (16), ✓ VendorProtocolSectioner (5),
  ✓ VendorProtocolPdf (3), ✓ VendorProtocolCandidateExtractor (3), ✓ VendorProtocolCandidateArtifacts (1)

tsc base: `npm run typecheck -w server` -> /home/brad/.hermes/cl/lanes/1/tsc-vpdf1-base-l1t2040.txt
  exit 0, 0 `error TS` lines.

## RED raw (new pins failing at base)
File: /home/brad/.hermes/cl/lanes/1/vpdf-1-red-l1t2040.txt
Command: cd server && npm run test:run src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts
  ❯ src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts  (6 tests | 1 failed) 202ms
    ❯ ... > vendor quick-reference vocabulary (VPDF-1: the CellROX qr sheet) > treats the vendor heading "Quick Protocol" as a protocol section with its six steps
      → expected undefined not to be undefined
  FAIL ... AssertionError: expected undefined not to be undefined
   ❯ src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts:178:22
      178|     expect(protocol).toBeDefined()
  Test Files  1 failed (1)
       Tests  1 failed | 5 passed (6)
RED commit: 0d998ad0 (tests only).

## GREEN raw (after impl)
File: /home/brad/.hermes/cl/lanes/1/vpdf-1-green-l1t2040.txt
  ✓ src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts  (6 tests) 168ms
  Test Files  1 passed (1)
       Tests  6 passed (6)

## Regression raw (all six required files)
File: /home/brad/.hermes/cl/lanes/1/vpdf-1-regression-l1t2040.txt
  ✓ src/ingestion/vendor-protocol/VendorProtocolCandidateArtifacts.test.ts  (1 test) 32ms
  ✓ src/ingestion/vendor-protocol/VendorProtocolPdf.test.ts  (3 tests) 143ms
  ✓ src/ingestion/vendor-protocol/ZymoGoldenE2E.test.ts  (1 test) 174ms
  ✓ src/ingestion/vendor-protocol/VendorProtocolSectioner.test.ts  (6 tests) 263ms
  ✓ src/ingestion/vendor-protocol/VendorProtocolCandidateExtractor.test.ts  (3 tests) 286ms
  ✓ src/ingestion/vendor-protocol/ZymoCampaignGoldenE2E.test.ts  (16 tests) 21301ms
  Test Files  6 passed (6)
       Tests  30 passed (30)
Heading-collision check: no Zymo golden double-matches "Quick …" (all green above).

## Whole-directory sweep head vs base (delta-ZERO proof)
Raw: /home/brad/.hermes/cl/lanes/1/vpdf-1-head-suite-l1t2040.txt
  Test Files  6 failed | 52 passed (58)
  Tests  17 failed | 489 passed (506)   <- base was 17 failed | 488 passed (505); the +1 pass is the new VPDF-1 test
FAIL-file comm (base vs head, sorted unique): EMPTY — identical 6 files.
Per-test FAIL-line comm (sorted unique): EMPTY — identical 17 failing tests.
Files: /home/brad/.hermes/cl/lanes/1/base-fail-files-l1t2040.txt, head-fail-files-l1t2040.txt.

## tsc base vs head
Base: /home/brad/.hermes/cl/lanes/1/tsc-vpdf1-base-l1t2040.txt — exit 0, 0 error TS lines.
Head: /home/brad/.hermes/cl/lanes/1/tsc-vpdf1-head-l1t2040.txt — exit 0, 0 error TS lines.
diff: EMPTY. TSC DELTA: ZERO.

## OQ-1 replay outcome (RULED procedure followed verbatim)
Replay run WITHOUT any Quick Reference entry — only the Quick Protocol entry added.
Observed: the fixture yields exactly one protocol-kind section titled "Quick Protocol"
(headingTitleAt fallback, no colon suffix), provenance pageStart=2, six step candidates
stepNumbers 1..6 each provenance pageStart=2 and sectionId = the protocol section id, and
NO vendor_protocol_missing_protocol_section in decode diagnostics NOR in
createProtocolDiagnostics output. Page 1's contents are already bounded: with no heading
match on page 1, everything before the first heading becomes the `cover` section
(:412-423) — the test pins cover contains the reagent-table page and the protocol
sourceText does NOT contain the page-1 Pub. No. (MAN0007985).
=> Quick Reference entry NOT added (no speculative vocabulary; it changes no behavior).
No new VendorProtocolSectionKind value invented. OQ-2 honored: headingPattern,
findAllHeadingIndexes, headingTitleAt, and slicing untouched. OQ-3 honored: no kind-lookup
site changed; the new entry is kind 'protocol', so a doc with BOTH "Protocol" and
"Quick Protocol" headings yields two protocol sections (matches sort by index; entry
order irrelevant).

## YAML touched
NONE. (The three schema YAML copies are lane-wiring artifacts from lane-exclude, never
git-added, never edited; `git diff --stat f49ea3c1..HEAD` shows only the two .ts files.)

## Assumptions
- AS-L1T2040-VPDF1-001: The CellROX fixture text is a representative reconstruction from
  the spec's grounding §2 description (page 1 first line "Quick Reference", Pub. No.
  MAN0007985, Cat. Nos C10491…; page 2 first line "Quick Protocol" then the 6 numbered
  step bodies quoted in the spec), separated by \f. The spec's work order 1 explicitly
  allows "a representative fixture with the real heading lines + all 6 step bodies". I did
  not read Brad's live data dir for the byte-exact extractedText array; tab characters in
  the reagent table are my reconstruction.
- AS-L1T2040-VPDF1-002: Symlinking the 30 lane-excluded server/ paths from Brad's live
  checkout (/mnt/vast/home/brad/git/computable-lab, read-only links) matches how prior
  lane worktrees are wired (verified against QMS7-9-lane1-l1t0310). Live-checkout content
  may drift from f49ea3c1; the linked files are untracked lane artifacts, not my code.
- AS-L1T2040-VPDF1-003: The 3 schema YAMLs were copied rather than symlinked because
  SchemaLoader.findSchemaFiles skips symlinks (Dirent.isFile() false); prior lanes carry
  them as copies. Copy content taken from the live checkout at run time.
- AS-L1T2040-VPDF1-004: The 6 failing suite files (ZymoCampaignNegatives N5 sha-pins +
  5 ProtocolIde* service files) are pre-existing trunk debt: identical fail-file and
  per-test fail comm base-vs-head in my own captures, and ZymoCampaignNegatives N5 fails
  identically when run read-only in the trunk checkout. Not fixed here (out of VPDF-1 scope).
- AS-L1T2040-VPDF1-005: First base capture (before wiring) showed 11 failed files
  (missing BypassAudit import + missing vocabulary YAML); it was superseded by the wired
  base above. The canonical base file vpdf-1-base-suite-l1t2040.txt is the wired one.
- AS-L1T2040-VPDF1-006: Model is 3-bit quantized; the single table-entry edit and the
  test were verified by typecheck (delta-ZERO) and the full GREEN/regression runs rather
  than trusting the edit itself.

## Not done (by design / boundary)
- No live POST, no lane :3092 restart, no XDR-000022 regeneration — orchestrator's
  post-merge step per spec work order 7.
- Draft-title fallback ("Quick Reference" as pc.title, ProtocolExtractionService.ts
  :951-962) untouched — VPDF-2's scope.

VPDF-1 DONE c0a6a456
