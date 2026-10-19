# VPDF-1 spec — vendor sectioner learns the quick-reference heading vocabulary
Drafted by the orchestrator 20261018T2100 (l1t2040). All grounding below is ORCHESTRATOR FIRST-HAND
at trunk cl/integration-1 @ f49ea3c1 (verified by opening the files and the live VPDF record — no
scout used this tick; recon done locally and cheaply).

## Item
LANE 1 · VPDF-1: "Vendor sectioner learns the quick-reference heading vocabulary —
Quick Protocol / Quick Reference are protocol sections". Task block:
/home/brad/.hermes/cl/lanes/1/task-list.md (id VPDF-1). deps: [].

## Binding rules (unchanged from the list)
- Declarative vocabulary: the fix lives in the SECTION_HEADINGS table as data-shaped entries
  (kind/title/pattern), NOT as PDF-family special-casing in any code path.
- Platform-gap stop-boundary: if the heading table cannot express what's needed, STOP and return
  requires-rescope with evidence. Do not absorb a sectioner rewrite.
- Server-only item: NO app/ edits, NO YAML changes, no stack restarts, never :3001/:5174,
  never Brad's live data dir.

## Orchestrator-verified grounding (paths at trunk f49ea3c1)
1. `server/src/ingestion/vendor-protocol/VendorProtocolPdf.ts`
   - `headingPattern(title)` :107-110 — builds `^<escaped>\b(?::[ \t]*\S|[ \t]*$|[ \t]{2,}\S)` with
     flags `im`. This is WHY "Quick Protocol" never matches the `Protocol` entry: the pattern is
     anchored at line start (`^`), and the line reads `Quick Protocol`.
   - `SECTION_HEADINGS` :207-228 — the declarative table (11 entries). The sectioner consumes it via
     `findAllHeadingIndexes(heading.pattern, searchableText)` in `sectionVendorProtocolDocument`
     (~:383-410; `searchableText = input.text.replace(/\f/gu,'\n')` :384), sorts matches by index,
     dedupes same-index matches (:405), and `headingTitleAt` (:151-164) resolves the printed title
     (colon-suffix or fallback to the table's `title`).
   - TOC-leader skip: `findAllHeadingIndexes` (~:120-131) skips matches on lines ending in a dot
     leader + page number (`TOC_ENTRY` :118). New entries inherit this automatically.
   - The missing-section diagnostic fires at TWO places keyed on
     `sections.some(s => s.kind === 'protocol')`: decode-level :336-343 and
     `createProtocolDiagnostics` :896-904 (code `vendor_protocol_missing_protocol_section`).
   - Step extraction: `STEP_LABEL = /(?:^|\n)\s*(\d{1,2})([a-z])?\.(?=[ \t\n]|$)[ \t]*/gu` (:690)
     parsed from the protocol section's sourceText (protocols consumed at :741, :936).
   - `VendorProtocolSectionKind` union in `server/src/ingestion/vendor-protocol/types.ts` :26-39
     ALREADY includes `'protocol'` — no type change needed for the Quick Protocol entry.
2. Fixture data (live, lane): VPDF record `VPDF-651F03789D80` (CellROX qr.pdf, exa-ingested,
   pageCount 2). `payload.extractedText` is an ARRAY of `{pageNumber, text}`:
   - page 1 FIRST line = `Quick Reference` (then "CellROX® Flow Cytometry Assay Kits", Pub. No.
     MAN0007985, reagent table with Cat. Nos C10491...).
   - page 2 FIRST line = `Quick Protocol`, then steps ` 1.` … ` 6.` (Grow cells… / Prepare negative
     and positive control… / Induce ROS… / Add the CellROX® Detection Reagent at 500–1000 nM…
     37°C, 5% CO2… / During the final 15 minutes… SYTOX® Dead Cell Stain… / Analyze samples on a
     flow cytometer…).
   Each heading appears exactly ONCE across the doc. STEP_LABEL matches `N.` with leading spaces —
   the 6 steps are extractable the moment a `protocol`-kind section exists.
   (Architect replay prior tick: renaming page-2's line "Quick Protocol" → "Protocol" yields all
   6 steps with provenance pageStart=2 — the heading is the ONLY blocker.)
3. Placeholder path: `server/src/protocol/ProtocolExtractionService.ts` :951-956 pushes the
   `Protocol steps not detected` placeholder when the candidate has 0 steps; draft title falls back
   to `pc.title` (:960-962) — on this doc the title lands as "Quick Reference" (page-1 first
   line); fixing the TITLE is VPDF-2's scope, not this item.
4. Live residue: `XDR-000022` (pending_review) is the architect's placeholder-step draft from the
   diagnosis run — supersede it during verification (regenerate), don't hand-edit it away.

## Ruled design decisions (orchestrator adjudications; worker follows verbatim)
OQ-1 (RULED): Add TWO table entries, both declarative, both via the existing `headingPattern`:
  - `{ kind: 'protocol', title: 'Quick Protocol', pattern: headingPattern('Quick Protocol') }` —
    placed adjacent to the `protocol` kind entries. headingTitleAt returns patternTitle ("Quick
    Protocol") when no colon suffix; the printed heading stays honest.
  - Quick Reference: it is a document-class TITLE affordance, NOT a step section. Options were:
    new section kind, or reuse. RULED: model it as
    `{ kind: 'other', title: 'Quick Reference', pattern: headingPattern('Quick Reference') }`
    ONLY IF needed to bound page 1's contents from the rest of the doc; otherwise omit the entry
    entirely. Worker: FIRST run the replay WITHOUT a Quick Reference entry (Quick Protocol alone).
    The sectioner already handles content before the first heading as the `cover` section (:412-419).
    If the 6-step protocol section, diagnostics and step provenance come out correct without the
    Quick Reference row, DO NOT add it (no speculative vocabulary — "data only when it changes
    behavior"). Record which outcome you observed in the report. Do NOT invent a new
    VendorProtocolSectionKind value (that would widen the union for a consumer-blind label; VPDF-2
    owns title resolution).
OQ-2 (RULED): No changes to `headingPattern`, `findAllHeadingIndexes`, `headingTitleAt`, or the
  section-slicing algorithm. Entry-order in the table is irrelevant (matches sort by index).
OQ-3 (RULED): The `protocol` lookup sites (`.find`/`.filter` on kind) need NO change — a
  "Quick Protocol" section is kind `protocol` like any other. Multi-protocol handbook behavior
  (every heading is a boundary, :385-392 comment) is preserved: a doc with BOTH "Protocol" and
  "Quick Protocol" headings yields two protocol sections, exactly like the DNeasy matrix.

## RED-first work order (RED commit separate from impl commit)
1. New test in the VendorProtocolPdf/VendorProtocolSectioner suite (extend
   `VendorProtocolSectioner.test.ts` or `VendorProtocolPdf.test.ts` — worker's choice, smaller diff
   wins): fixture embedding the page-1/page-2 text blocks of the CellROX qr sheet (the exact
   extractedText above is reproduced verbatim in the spec's evidence; a representative fixture with
   the real heading lines + all 6 step bodies is acceptable; embed as a template string, page
   separator `\f`):
   - a `protocol`-kind section exists, title as OQ-1 rules,
   - 6 step candidates with stepNumbers 1..6, provenance pageStart=2,
   - NO `vendor_protocol_missing_protocol_section` diagnostic in decode output AND in
     createProtocolDiagnostics output.
2. RED: run the suite, capture the failing state at base (paste raw).
3. Implement the SECTION_HEADINGS entry/entries. GREEN: rerun.
4. Regression: ZymoGoldenE2E, ZymoCampaignGoldenE2E, VendorProtocolSectioner, VendorProtocolPdf,
   VendorProtocolCandidateExtractor.test.ts, VendorProtocolCandidateArtifacts.test.ts all green
   (heading collision check — e.g. no Zymo heading now double-matches "Quick …").
5. Whole-directory sweep: `cd server && npm run test:run src/ingestion/vendor-protocol
   src/protocol` (or the repo's canonical test command) — report the raw tail; pre-existing
   failures, if any, must be identical to the worker's own BASE capture taken before editing
   (capture base first, unique path under /home/brad/.hermes/cl/lanes/1/).
6. tsc baseline: `npm run typecheck -w server` delta-ZERO vs own base capture.
7. Server lane proof is the ORCHESTRATOR's step post-merge (lane :3092 restart + regenerate
   XDR); worker does NOT run the live POST and does NOT restart anything.

## Deliverables
- Report (unique): /home/brad/.hermes/cl/lanes/1/vpdf-1-report-l1t2040.md — baseline captures,
  RED raw, GREEN raw, regression raw, tsc delta, assumptions block (AS-L1T2040-VPDF1-*),
  YAML-touched list (expect: none), OQ-1 replay outcome note.
- Commits in worktree wt/VPDF-1-lane1-l1t2040 (branch wt/VPDF-1-lane1-l1t2040):
  RED commit (tests only, message says RED), impl commit, report commit.
- End stdout exactly: `VPDF-1 DONE <sha-of-code-commit>` or `VPDF-1 STOPPED <reason>`.

## Stop boundaries
- Quick Protocol entry (with/without Quick Reference) still fails to yield 6 steps on the fixture
  → STOP with the raw section dump (this would falsify the replay premise).
- Any regression on Zymo goldens you cannot resolve by table-entry placement alone → STOP with
  evidence (requires-rescope).
- No app/, no YAML, no schema/registry changes, no sectioner algorithm changes.
