# VPDF-2 execution spec — quick-reference substance: materials/equipment vocabulary + title resolution

Status: PROVISIONAL-ORCH (orchestrator-authored from first-hand grounding after the
cl-spec-composer run for this item passed 3x its expected duration with zero artifacts;
composer draft never landed. Architect may amend post-hoc; coder follows THIS file.)
Item: VPDF-2, lane 1, deps [VPDF-1] (SATISFIED — merged 93ba050c; Quick Protocol is a
protocol section; XDR-000023 live proof produced 6 real steps).
Base: worktree /mnt/vast/home/brad/git/wt/VPDF-2-lane1-l1t2245, branch
wt/VPDF-2-lane1-l1t2245 @ 93ba050c (node_modules + lane-exclude wiring already linked;
run vpdf2-worktree-sync-l1t2245.sh output: linked=60 skipped=59 noise=0).
SERVER-ONLY. No app/ edits, no UI, no YAML — no browser gate, no stack restart owed.

## Orchestrator-verified grounding (first-hand, trunk 93ba050c — trust these line areas)

LIVE PIPELINE (the one regenerate uses):
- ProtocolExtractionService.ts:761-775 — regenerate re-extracts from
  payload.extractedText joined with '\n\n'; calls
  extractVendorProtocolCandidateFromInput({workspaceRoot, text, documentId,
  fileName: payload.title ?? vendorPdfId, persist:true}). NOTE: payload.title is passed
  as fileName ONLY — the title is NOT threaded into the document.
- VendorProtocolCandidateService.ts:41-59 — text input ->
  createVendorProtocolDocumentFromText(text, {filename, documentId?, vendor?}). No title
  option exists.
- vendor-protocol/VendorProtocolPdf.ts:269-277 extractTitle(text): returns the FIRST
  non-empty line of page 1 (split on '\f'; note the joined text has NO '\f' — the whole
  joined text is treated as page 1). For the CellROX sheet that is literally
  "Quick Reference" -> candidate.title (VendorProtocolPdf.ts:943
  `document.source.title ?? 'Untitled vendor protocol'`).
- ProtocolExtractionService.ts:963-965 draft title fallback:
  opts.title ?? pc.title ?? `Vendor Protocol ${vendorPdfId}`.
- Vocabulary lives in TWO data tables in vendor-protocol/VendorProtocolPdf.ts:
  ZYMO_SOURCE_TERMS :20-46 and GENERIC_SOURCE_TERMS :49-88 (materials/labware/equipment,
  each {label, pattern, role}), merged into ALL_SOURCE_TERMS :90-94. THIS is the
  "declarative vocabulary" — extend these entries, do not fork code paths.
- Candidate item creation: createCandidateItems ~:820-852 = curated labelsInText(
  ALL_SOURCE_TERMS.<kind>, text) over product_contents/specifications/protocol sections
  + createGenericCandidateItems :854-890 (materials -> extractGenericMaterialMentions
  :584-597; equipment -> labelsInText(GENERIC_SOURCE_TERMS.equipment)). dedupe
  case-insensitive by label.
- LIVE FIXTURE (verified via :3092 GET VPDF-651F03789D80 this tick, payload strings
  verbatim): payload.title = 'Molecular Probes™\xa0CellROX™ Green Flow Cytometry Assay
  Kit | Fisher Scientific'. Page 1 first line 'Quick Reference'; reagent table
  'CellROX® Detection / Reagent' wrapped across lines, rows 'CellROX® Deep Red
  C10491', 'CellROX® Green C10492', 'SYTOX® Blue Dead Cell Stain' / 'SYTOX® Red Dead
  Cell Stain' wrapped. Page 2 'Quick Protocol' + steps 1-6: step 1 'complete medium',
  step 4 'CellROX® Detection Reagent ... 500–1000 nM ... 30–60 minutes at 37°C, 5% CO2',
  step 5 'SYTOX® Dead Cell Stain solution', step 6 'flow cytometer'.
  NOTE en-dashes: '500–1000', '30–60', '104–106' use U+2013.
- NOT IN THE LIVE PATH (leave alone unless replay proves otherwise):
  server/src/ingestion/adapters/vendorProtocolPdf.ts (parseVendorProtocolPdf) is only
  consumed by its own test file. The task block named it, but the real machinery is
  vendor-protocol/VendorProtocolPdf.ts + VendorProtocolCandidateService.ts. Do not
  rewrite the adapter.

## Work order (RED-first)

W1. Fixture test FIRST (RED at base): new describe in
server/src/ingestion/vendor-protocol/VendorProtocolCandidateExtractor.test.ts using a
stored extractedText reconstruction of the quick-reference sheet — page 1 and page 2
EXACTLY as quoted above (wrapped reagent table, ® and non-breaking-space artifacts
preserved; join pages with '\n\n' like the live path does; run through
extractVendorProtocolCandidateFromInput with text+fileName, persist:false, or through
createVendorProtocolDocumentFromText + extractVendorProtocolCandidate like the existing
generic test). Assert:
  a. candidate.title contains 'CellROX' and does NOT equal/contain 'Quick Reference';
  b. materials labels include a CellROX detection reagent, 'CellROX Deep Red',
     'CellROX Green', a SYTOX dead-cell stain, and 'complete medium';
  c. equipment labels include 'flow cytometer';
  d. step conditions: a step parameter carries 37 °C temperature and a 30–60 minutes
     duration (adapt to the actual parameter field shapes in this pipeline — read
     ProtocolStepCandidate/parameters typing first; if concentration 500–1000 nM lands
     nowhere, record the observed outcome in your report — do NOT add a new parameter
     field to types just for it; concentration pin is OBSERVE-and-report, temp/duration
     are hard pins).
  Run RED, capture raw to
  /home/brad/.hermes/cl/lanes/1/vpdf2-red-l1t2245.txt, commit RED test alone.

W2. Title resolution (fixes the ROOT CAUSE, no literal product names hardcoded):
  - Thread a title through the text path: createVendorProtocolDocumentFromText gains an
    optional title in its options; source.title uses options.title ??
    extractTitle(text). VendorProtocolCandidateService passes input.title through.
    extractVendorProtocolCandidateFromInput gains optional title in its input interface.
  - ProtocolExtractionService (BOTH call sites :769-775 and the fallback :793-799)
    passes the vendor-pdf payload's title (same value already used for fileName) as
    title. This is data threading — the value comes from the record, not from code.
  - Guard: an empty/whitespace payload title must fall back to extractTitle exactly as
    today (compact/conditional spread like the existing options).
W3. Vocabulary entries in the EXISTING data tables (VendorProtocolPdf.ts), following the
  sibling shape byte-for-byte ({label, pattern, role}, `as const` arrays):
  - GENERIC/curated materials: CellROX detection reagent (matches 'CellROX® Detection
    Reagent' wrapped across a newline — the wrapped table layout means the pattern must
    tolerate '\n' + leading space between 'Detection' and 'Reagent'; labels normalize
    via normalizeText so ® is stripped), 'CellROX Deep Red', 'CellROX Green', a SYTOX
    dead-cell-stain entry (matches both the wrapped 'SYTOX® Blue Dead Cell\n Stain'
    form and the plain 'SYTOX® Dead Cell Stain' in step 5), 'complete medium'.
  - GENERIC equipment: 'flow cytometer' (pattern /\bflow cytometer/iu, role e.g.
    'flow_cytometer' — follow existing role naming style).
  - Curated label matching runs over product_contents/specifications/protocol sections.
    If the replay shows the reagent-table entries can only be reached when the page-1
    table lands in a matched section, note where they actually matched in your report;
    the acceptance is that the FINAL candidate materials/equipment lists contain the
    labels — reach it through the existing section/curation machinery, not a new scan.
  - No new code paths, no 'quick reference'-family if-branches anywhere. Vocabulary
    only.
W4. Regression: re-run the SAME six files VPDF-1 ran (ZymoGoldenE2E,
ZymoCampaignGoldenE2E, VendorProtocolSectioner, VendorProtocolPdf tests,
VendorProtocolCandidateExtractor, VendorProtocolCandidateArtifacts — the set in
vpdf-1-report-l1t2040.md) green; whole-suite fail-file comm base-vs-head EMPTY against a
base capture you take first (vpdf2-base-suite-l1t2245.txt / vpdf2-head-suite-l1t2245.txt
under /home/brad/.hermes/cl/lanes/1/). KNOWN PRE-EXISTING DEBT: 6 files / 17 tests incl.
ZymoCampaignNegatives N5 sha-pin (AS-L1T2040-VPDF1-004) — comm-empty vs base is the bar,
not zero failures. NO FALSE-POSITIVE DRIFT: Zymo fixtures must not suddenly gain
CellROX/SYTOX/flow-cytometer labels (patterns are brand-anchored; the generic
equipment/medium ones must be word-boundary anchored).
W5. server tsc: capture base (before your edits) and head; comm delta-ZERO required
  (baseline is currently 0 error lines on server; keep it 0).
W6. NO live regenerate yourself (that's the orchestrator's post-merge proof), NO lane
  stack restart, no :3001/:5174, no app/, no YAML.

## OQ rulings (orch, as spec owner)

OQ-1 Title source: payload-threaded title with extractTitle fallback (W2). Rationale:
  the payload ALREADY carries the correct title; code inventing brand vocabulary into
  extractTitle would be hardcoding. Genericity preserved: any VPDF with a title gets it.
OQ-2 CellROX/SYTOX as vocabulary vs generic patterns: curated brand entries in the
  existing tables (W3) — same standing as Zymo Research's own product names already
  living there. 'complete medium' and 'flow cytometer' go in GENERIC with word
  boundaries.
OQ-3 Concentration parameter: observe-and-report only (W1d); no types.ts extension in
  this item — if it lands nowhere, that is a finding for a future vocab/schema item, not
  a VPDF-2 failure.

## Verification commands (your report must show real output)

cd server && npx vitest run src/ingestion/vendor-protocol/VendorProtocolCandidateExtractor.test.ts
cd server && npx vitest run <the six W4 files>
cd server && npx tsc --noEmit (base + head, comm)
Deliverable report: /home/brad/.hermes/cl/lanes/1/vpdf2-report-l1t2245.md ending with
'VPDF-2 DONE <head-sha>' (exact end-line; the adversarial-gate trigger watches it).
Commit everything to the branch. Report must state: where each vocabulary label actually
matched (which section), the concentration observation, base/head suite comm results,
RED raw path.
