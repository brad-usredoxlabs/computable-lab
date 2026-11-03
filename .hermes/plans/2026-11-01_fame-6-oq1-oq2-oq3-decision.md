# FAME-6 OQ-1+OQ-2+OQ-3 RULED

Author: architect (read-only on all git trees except this file). Date: 2026-11-01.
Trunk verified first-hand at `181ab747` this session (`git -c core.fileMode=false log -1`:
"FAME-1 merged ..."). Grounding re-read in person at this SHA:
schema/knowledge/view-spec.schema.yaml:41 (enum, 7 ids) + :43-63 (canonical-shape comment block),
app/src/analysis/ViewRenderer.tsx union :29, whitelist :44-52, TableView declared-{columns,rows}
arm :74-105, dispatch arms-before-default :311-376,
app/src/analysis/AnalysisPage.tsx persisted-view door :527-538 (bindings/options pass through
opaquely at :535-536), GC-11 client-synthesis gates :546-584,
`grep -rn 'artifact-table' schema/ app/src server/src` = **0 hits** (re-run this session).
Spec draft read in full: .hermes/plans/2026-11-01_fame-6-spec-draft-l1t0825.md (§12 OQ-1/2/3).

---

## RULING OQ-1 = RATIFY `artifact-table`

Rationale (one line): generic, kebab-case per chromatogram/trace-compare/calibration-curve, zero
domain words (no fame/analyte/fatty — the domain lives in the view-spec DATA), 0 collision repo-wide,
and it is the task's own wording ("generic artifact-table id").

Binding instructions:
1. The exact string `artifact-table` is minted into ALL FIVE sites in the ONE commit (GC-10/GC-11
   shape, e6b34229/51a78ae5 precedent): schema enum view-spec.schema.yaml:41 (+comment citing the
   task and this file), TS union ViewRenderer.tsx:29, VIEW_RENDERER_WHITELIST :44-52 (8th id),
   dispatch arm placed BEFORE `default:` :371, compat source-pin amended in ViewRenderer.compat.test.tsx
   as a LITERAL (banned ids quantum/heatmap/scatter/component-tree stay banned).
2. No term collision with the existing `table` id: `table` remains the unshipped-id coercion TARGET
   (the GC-9 resolveViewRenderer door :56-60 needs it) and renders raw row arrays; `artifact-table`
   is the artifact-report renderer with the OQ-3 binding slots below. Two ids, two distinct behaviours.
3. Component name carries the same word (`ArtifactTable` / optional `ArtifactTableView.tsx` sibling —
   coder's defended choice per draft W3); no other new identifier introduces a domain word.

---

## RULING OQ-2 = DEFAULT door (designated **door D**) — the persisted-view door via a new report successor revision (draft W4). Not A, not B.

Rationale (one line): ctx.view's opaque renderer string + free bindings/options make the report
pure DATA; door A re-opens merged FAME-4/5 revision ownership for a deliverable that belongs to
FAME-6, and door B (GC-11 client-synthesis) puts artifact-SHAPE knowledge into AnalysisPage TS —
bait #5, forbidden outside calibration.

Binding instructions:
1. W4 stands as drafted: mint a report successor revision (parentRevisionRef -> FAME-5's successor
   ANREV or the ratified parent the orchestrator names at dispatch), entryScript consumes FAME-4's
   analyte_summary (+ assignment_results for provenance columns) and FAME-5's reference_check
   (+ standard_summary block), RE-ECHOES payloads into report artifacts zero-recompute, publishes
   views via ctx.view(..., renderer='artifact-table', artifact=..., bindings=..., options=...).
2. AnalysisPage.tsx is UNTOUCHED — zero diff, zero new gates. Any AnalysisPage.tsx hunk in the
   delivery is an automatic adversarial reject (draft §9's ONE-commit file list is binding; the
   whitelist addition at :44-52 is the complete page-side change, consumed at :534).
3. Door B (GC-11 synthesis extension) is RULED REJECTED for this campaign; it stays exactly where
   GC-11 ratified it (calibration only, structural gates :546-584).
4. Restart gate unchanged: orchestrator restarts :3092 after the enum commit merges, BEFORE the
   W4 revision runs; a VSPEC 400 pre-restart is the gate, not a bug.

---

## RULING OQ-3 = SUFFICIENT — the draft's W2 legs (a)-(f) contract is the capability contract: TableView-parity {columns,rows} core + bindings-NAMED data slots, NO composition-block sub-rendering inside the id. One convention is hereby named so the coder builds data-driven slots, not policy branches.

Rationale (one line): the composition-check block is just ANOTHER artifact-table view over a
re-echoed {columns,rows} payload, and caption/warnings/column-selection are all "field names in
bindings + values in payload" = data; anything richer re-invents bespoke UI inside a generic id.

The exact binding convention (canonical shape, to be documented as comments in
view-spec.schema.yaml's :43-63 block in the SAME one commit, same style as chromatogram's
markersFrom/markerRtField):

```
#   artifact-table (FAME-6):
#     columns: [ "<payload field NAME>", ... ]   # OPTIONAL ordered column-subset selector;
#         absent -> the payload's declared {columns} (TableView-parity, :79-87)
#     captionFrom: "<payload field NAME>"        # OPTIONAL: that field's string value renders
#         as a visible caption line ABOVE the table (denominator caption, basis note)
#     warningsFrom: "<payload field NAME>"       # OPTIONAL: array field; each entry renders as
#         a visible warning line BELOW the table
#     warningTextField: "<field NAME>"           # OPTIONAL: when warnings entries are records,
#         the property whose string value renders; entries may be plain strings without this key
```

Binding instructions for the §5 work items:
1. Renderer TS rules: a binding naming a field = "render the string the payload carries at that
   key, here"; ZERO state-word/tolerance-word comparisons (`=== 'provisional'`,
   `=== 'not-assessable'`, chip maps over FAME-5's four outcome words = reject, bait #3b);
   absent binding or absent/blank payload field = the slot is simply ABSENT (absence renders
   nothing — no placeholder, no disabled block; dead chrome is a defect, but an unrequested slot
   is not chrome at all); bindings.payload-field mismatch (named key not in payload) = the NAMED
   arm (TableView 'No rows' :78 precedent), never a blank.
2. W2 gains one leg (g): with captionFrom/warningsFrom bound to a synthetic payload, the caption
   and each warning line render as VISIBLE DOM text from the payload values; with the bindings
   absent, neither slot renders and the plain table is TableView-identical. Leg (e) (arbitrary
   state STRING renders as visible text, no TS branch) stays exactly as drafted — it is the
   provisional-row guarantee.
3. Composition-check block = a SEPARATE artifact-table view whose artifact is FAME-5's
   reference_check (+ standard_summary) fields re-echoed by W4's entryScript into a declared
   {columns,rows} payload (one row per labeled reading, incl. denominator_basis disclosure and
   tolerance_pp-or-the-declared-comparison-only text — FAME-5's own outcome words arrive as
   payload strings). It rides the same door, the same renderer id, zero new TS.
4. No `DEFAULT_COLUMNS`-style constant in the new component (bait #6): with no `columns` binding
   AND no declared payload columns, render the union-of-keys TableView parity (the shipped :83-87
   behavior), never a baked list.
5. This convention is the WHOLE capability contract. If a dispatch leg proves bindings cannot
   address a needed payload position, that is a platform gap: STOP that leg, requires-rescope —
   do not fork the renderer platform.

---

## Evidence actually read this session (all at 181ab747)
- .hermes/plans/2026-11-01_fame-6-spec-draft-l1t0825.md (full, incl. §12)
- schema/knowledge/view-spec.schema.yaml (enum :41, bindings/options free objects :64-71, comment block :43-63)
- app/src/analysis/ViewRenderer.tsx :20-139 + :295-380 (union, whitelist, resolveViewRenderer, TableView, full dispatch incl. default arm)
- app/src/analysis/AnalysisPage.tsx :520-587 (persisted-view map + GC-11 synthesis gates)
- grep 'artifact-table' schema/ app/src server/src = 0 hits
- .hermes/plans/2026-11-01_fame-5-oq2-oq3-decision.md (folding precedent for the report-view field expectations)

`FAME-6 OQ-1+OQ-2+OQ-3 RULED <this file>` — orchestrator: fold into the spec at promotion.

ENDURANCE: this decision is final for FAME-6 promotion.
