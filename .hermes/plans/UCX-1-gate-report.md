VERDICT: accept

# UCX-1 — Sequences Library multi-select toolbar — LANE 2 browser acceptance gate (tier-2)

Receipts dir: /home/brad/.hermes/cl/receipts/UCX-1/2026-10-18_0505-tier2/
Run: 2026-10-18 ~05:37 EDT · driver `_harness/drive.mjs` (deterministic Playwright, node .mjs)
Trail: `trail.json` (7 shots, 1 real POST, 1 record GET, 0 console errors, 0 page errors)

## Served candidate (pre-flight, all pass)
- Trunk /mnt/vast/home/brad/git/cl-integration-2 @ `0036a548d5db9719b627c48809eb7dd4f496f8cd` (branch cl/integration-2).
- `merge-base --is-ancestor c0c4bed9 HEAD` → rc=0 (c0c4bed9 "merge(lane2): UCX-1 — Sequences Library multi-select toolbar" IS contained in the tip).
- `curl -s :5193/src/sequences/SequencesPage.tsx | grep -c sequence-selection-toolbar` → 2 (served checkout contains the candidate).
- frontend `:5193/sequences` → 200; backend `:3093/api/health` → 200.
- Never touched :3001/:5174, no restarts, no product code/YAML edits.

## Test fixtures created (standing "all records are TEST DATA" ruling; documented)
The store held only 1 sequence (SEQ-827c… "pUC19 probe") and 0 oligo-spec rows — criteria 2/4/5/6
need ≥2 sequence rows plus an oligo-spec row. Prerequisite test fixtures were created through the
real product API (POST /api/sequences/actions), not by editing files:
- SEQ-a4836e63051a779c44383e79 "Gate Seq Alpha" (save_sequence)
- SEQ-cb9f816907d51380eaabaec3 "Gate Seq Beta"  (save_sequence)
- OLIGO-GATE-GAMMA-01 "Gate Oligo Gamma"        (save_oligo, sequenceRef → Gate Seq Alpha revision)
The gate flow itself (criteria 1–6, incl. the collection save) ran entirely through the UI. No
verification evidence was fabricated; only the member/fixture prerequisites were seeded.

## Criteria results (all exercised in a real browser)

1. PASS — Library visible; `[data-testid="sequence-selection-toolbar"]` present; count reads "0 selected".
   Rows: pUC19 probe, Gate Seq Alpha, Gate Seq Beta (each with a checkbox), Gate Oligo Gamma (no checkbox).
   shot: shots/00-c1-toolbar-0-selected.png
2. PASS — Ticked Gate Seq Alpha + Gate Seq Beta; `[data-testid="sequence-selection-count"]` → "2 selected".
   shot: shots/01-c2-two-selected.png
3. PASS — Analysis tab; the "Reference / alignment collection" fieldset shows the SAME two rows checked
   (shared single model: pUC19 probe unchecked, Gate Seq Alpha ✓, Gate Seq Beta ✓); name "gate-collection"
   typed in the toolbar input (and mirrored in the fieldset's Collection name input).
   shot: shots/02-c3-analysis-fieldset-shared.png
4. PASS — From the TOOLBAR, "Save collection" fired a REAL (unstubbed) POST /api/sequences/actions → 200;
   success status line rendered: "Saved SEQSET-b99ee24611cf5d40586ce4e7"; count returned to "0 selected".
   shot: shots/03-c4-saved-status-reset.png
   Request body (trail.postActions[0].request):
     {"requestId":"<hex24>","operation":"save_collection","label":"gate-collection",
      "members":[{"kind":"record","id":"SEQ-a4836e63051a779c44383e79","type":"sequence"},
                 {"kind":"record","id":"SEQ-cb9f816907d51380eaabaec3","type":"sequence"}]}
   Shape-equal to the fieldset flow body (operation/label/members of {kind:"record",type:"sequence"}; requestId differs by design).
   GET /api/records/SEQSET-b99ee24611cf5d40586ce4e7 → 200 (trail.recordGet), body trimmed:
     {"record":{"recordId":"SEQSET-b99ee24611cf5d40586ce4e7",
       "schemaId":".../sequence-collection.schema.yaml",
       "payload":{"kind":"sequence-collection","id":"SEQSET-b99ee24611cf5d40586ce4e7","label":"gate-collection",
         "members":[{"kind":"record","type":"record-revision","id":"REV-123767EBE422DB7E62BFD2ED39DA2E2A"},
                    {"kind":"record","type":"record-revision","id":"REV-5ADCCA262365D8AAAFCDE104EF5D0AD7"}],
         "createdBy":"USR-BRAD", ...}}}
   (members are the server-pinned record-revision refs of the two checked sequences — the documented pin behaviour.)
   Store check: `GET /api/records?kind=sequence-collection` lists a sequence-collection labelled "gate-collection"
   with those two members.
5. PASS — Fresh reload → select Gate Seq Alpha ("1 selected") → Clear → count "0 selected", Analysis fieldset
   all unchecked, Clear button disabled.
   shots: shots/04-c5a-before-clear-1-selected.png, shots/05-c5b-cleared-analysis-unchecked.png
6. PASS — Search query "Gate" active (visible rows: Gate Seq Alpha, Gate Seq Beta, Gate Oligo Gamma; the
   non-matching sequence pUC19 probe is filtered out). Select-all → count "2 selected": only the 2 VISIBLE
   sequence rows selected; the oligo-spec row has NO checkbox (`sequence-check-OLIGO-GATE-GAMMA-01` count 0)
   and is never selected; pUC19 (sequence, not visible) is not selected → visible-only selection proven.
   shot: shots/06-c6-query-select-all-visible-only.png

## Screenshot hygiene
7 shots, all distinct states. md5 sweep in `md5s.txt`; `md5sum shots/*.png | awk '{print $1}' | sort | uniq -d`
is empty (no duplicate-md5 states).

## Observations (non-blocking)
- The right "AI Chat" pane shows a pre-existing hydrated thread ("gate2 probe" turns) from a prior session on
  `/api/ai/threads/sequences`; not produced by this flow. Zero console errors and zero page errors across the run.
- Criterion 4's stored members are record-revision refs (server `pin`), not the raw sequence ids sent on the wire;
  this is the existing save_collection contract, not a defect.
- The gate left 3 test `sequence-collection` records (one per driver run, all labelled "gate-collection"); all test data.

VERDICT: accept
