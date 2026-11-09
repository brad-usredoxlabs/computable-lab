# L2-TERM-1 browser receipt — vocabulary integrity (picker/popover badge tiers)

VERDICT: accept

Task: L2-TERM-1 — "Vocabulary integrity — picker/popover must never badge a local record or a
composition as an Ontology term".
Base URL: http://localhost:5193 (lane-2 stack; backend :3093).
Served revision: cl/integration-2 @ b5b25c99 — confirmed first-hand: the vite-served module
/src/shared/taptab/slashMenu/tokens.ts contains VOCABULARY_BADGE {ontology:'Ontology',
local:'Local', composition:'Composition', mint:'New'} and the popover field map
ONTOLOGY_FIELD_LABEL {local:'Vocabulary'}.

Surface driven: the AI Chat slash-mention material picker on the run workspace
(/runs/RUN-2026-10-25-run-wnm5 → right pane "AI Chat" → held DMEM clarification → the
"Search materials or mint a local term…" /m picker). Read-only: no row clicked, no
proposal applied; the query was restored to its original 'DMEM' at the end.

Harness: ~/.hermes/cl/browser-receipts/harness, config pw-cfg-ext.ts, project chromium,
PLAYWRIGHT_BASE_URL=http://localhost:5193. 36 steps, 0 fail; shots 09..35 (7 PNGs).
Scripted mouseover dispatch on a LOCAL row is a real mouseover on the button (React onMouseEnter
→ 150ms → side-docked DetailTooltip), executed in a step that does NOT scroll, because the list's
onScroll handler clears any pending hover.

## Acceptance criteria — exercised and passed

1. Picker reachable at :5193 — PASS.
   /runs/RUN-2026-10-25-run-wnm5 mounts the AI Chat material picker (.message-log__clarification-search)
   whose resolver is the /m material mention menu. Typed 'DMEM' (persisted held clarification) and
   'Tris'. Evidence: shots/09-01-dmem-picker-top.png, shots/29... (Tris → see #3).

2. LOCAL tier — PASS. A workspace-record row badges 'Local' with subtitle 'Local record',
   NEVER 'Ontology'. The DMEM query returns local workspace records
   (DMEM / MAT-dmem-ykg0, DMEMHepG2, Thermo DMEM), each badge='Local', subtitle='Local record'
   (trail step 8 result.dmemRows). No row in the set carries an 'Ontology' badge.
   Evidence: shots/12-02-local-tier-rows.png (Local green badges + 'Local record' subtitles),
   shots/20-04-local-row-popover.png.

3. ONTOLOGY tier — PASS (reachable; DMEM itself has no ontology hit here, so a namespace query
   was used, as the criterion allows). 'Tris' returns true ontology hits badged by namespace:
   CHEBI (CHEBI:9754), UNIMOD (UNIMOD:1831), BAO (BAO:0000694), HTTP (the CHEBI IRI) — never a
   bare 'Ontology' on a local record. 'glucose' returns MESH/CHEBI/HTTP/TFO/NCIT/BAO/FOBI/OMIT.
   Evidence: shots/27-05-ontology-tier-tris.png, shots/31-06-ontology-tier-glucose.png
   (trail steps 29/33 results trisRows / glucoseRows).
   NOTE: for 'DMEM' the resolver returns no ontology candidate (the /api/resolve response for
   DMEM is local + mint only), so the ontology tier is not exercised BY the DMEM query — no
   defect; recorded for honesty.

4. COMPOSITION tier — PASS. A multi-part composite label rows as badge='Composition',
   subtitle='Composition'. The DMEM query surfaces many, e.g.
   "Thermo trypsin-EDTA + Thermo DMEM + Thermo FBS + HepG2 cells" and
   "50/50 Trypsin-EDTA/DMEM + 10% FBS with 500 HepG2 cells/ul" (trail step 8). None is badged
   'Ontology'. Evidence: shots/09-01-dmem-picker-top.png, shots/35-07-dmem-restored.png.

5. MINT tier — PASS. The bottom (pinBottom) row reads badge='New',
   label='Create local term "DMEM"', subtitle='mint a draft term into the lab namespace'.
   Evidence: shots/15-03-mint-tier-row.png (bottom row visible), trail step 14.

6. POPOVER — PASS. Hovering a LOCAL row's detail docks a tooltip: source
   'Workspace record (this lab)', field label 'Vocabulary' = value 'local', plus ID / Kind /
   Category. The contradiction string 'Ontology: local' appears nowhere on the page
   (trail step 25 result.contradictionCheck = 'no-ontology-local-contradiction').
   Evidence: shots/20-04-local-row-popover.png.

7. Console / styling — PASS with one attributed pre-existing console error.
   Badge palettes are distinct and match the spec's expectation:
   Local = rgb(240,253,244) greenish; Composition = rgb(204,251,241) teal;
   New = rgb(255,247,237) orange; ontology namespace badges (CHEBI/MESH/…) render in their own
   pale tint, visually distinct from Local and Composition (trail step 9 result.badgePalettes;
   shots/12-02, 27-05). No broken styling observed.
   CONSOLE: one red error — "Failed to load resource: the server responded with a status of 400
   (Bad Request)". Attributed to GET /api/protocols/RUN-2026-10-25-run-wnm5/steps (backend pino
   req-1ea, statusCode 400) fired on run-page load because this run has NO protocol attached
   ("No protocol attached" shows in the left pane). PRE-EXISTING and unrelated to the picker /
   vocabulary flow; not caused by any step here. pageErrors: [].

## Notes / scope
- The DMEM query yields Local + Composition + New (no Ontology); the ontology tier was exercised
  via Tris/glucose. Every tier the criteria name was observed rendering honestly.
- Out of scope for this browser leg (not part of the verbatim "verified by" clause, and not
  reachable without opening a proposal): ProposedGraphModal's reworded heading and the
  ClarificationPanel/ProtocolLocalizationThread consumers. Not gated here.
- No repo files modified; no proposal Apply/accept clicked; picker query restored to 'DMEM'.

## Evidence index (receipts/L2-TERM-1/2026-10-26T0430-tier2)
- trail.json (36 steps, network, consoleErrors, pageErrors)
- shots/09-01-dmem-picker-top.png      — COMPOSITION rows (teal badges)
- shots/12-02-local-tier-rows.png      — LOCAL rows (green 'Local' / 'Local record')
- shots/15-03-mint-tier-row.png        — MINT row ('New' / create local term)
- shots/20-04-local-row-popover.png    — popover: Vocabulary = local, source Workspace record
- shots/27-05-ontology-tier-tris.png   — ONTOLOGY rows (CHEBI/UNIMOD/BAO/HTTP)
- shots/31-06-ontology-tier-glucose.png— ONTOLOGY rows (MESH/CHEBI/NCIT/TFO/…)
- shots/35-07-dmem-restored.png        — picker restored, page normal

VERDICT: accept
