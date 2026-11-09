# L2-PROMPT1-GHOST-1 — accepted AI add_material events visible on the Labware-focus grid

Spec authored by orchestrator 2026-11-01T18:2x EDT (l2t1810). All load-bearing cites
re-verified FIRST-HAND at trunk e6f31731 (the lines quoted below are exact).
Scout evidence base: ~/.hermes/cl/receipts/PROMPT1-SCOUT-20261101/20261101T163744/
(record-after.json = the real committed shape; legB2/legC = the live symptom trail).
Brad approval 2026-11-01T17:05 EDT verbatim: "queue it!!!" (his report: "the shorthand
looked right, i accepted. all wells showing empty.").

## 1. The defect (two orphans, one projection)

After accepting an AI `add_material` on the event-editor (deck host), the record is
CORRECT but the Labware-focus well grid renders every well empty, while the deck tile
shows the vessel affected. Cold reload: still empty.

Real committed event (scout receipt record-after.json, event
`evt-add_material-9dbjge70`):
  details = { material: "<display string>", volumeUl: 100, volume: {...},
              wells: [A2..H5] }
  provenance = { actor: ai-agent, method: compiler, actionGroupId: compiler-draft }
  -> NO details.labwareId.

Projection orphan 1 — app/src/graph/lib/eventGraph.ts:920:
  `if (!labwareId) continue`   // labwareId := details.labwareId (:833)
computeLabwareStates(events, labwares) (:813) skips every labware-less event, so the
Labware-focus grid (LabwareEventEditor.tsx:2141/1883/1972 via getWellState) shows
nothing. Transfer/move_tube paths (:839-840, :898-899) already fall back to a single
`labwareId` variable; add_material etc. have NO fallback — the event simply drops out.

Projection orphan 2 — app/src/types/events.ts:613:
  getAddMaterialRef returns aliquot_ref || material_instance_ref || material_spec_ref
  || vendor_product_ref || material_ref. The compiler writes the material NAME under
  `details.material` (AddMaterialDetails :119-124 never declares a bare `material`
  field — BaseEventDetails :101-106 is the only declared-key holder; `material` rides
  as an undeclared extra). Tooltip/ribbon consumers (EventRibbon.tsx:309,
  events.ts:708) name no material.

The DECK tile is not broken because app/src/event-editor/lib/eventWellIndex.ts:236-260
(L2-SUITE-A-uifix2 D2 rule; NOTE: real path is event-editor/lib/, the task text said
graph/lib/) already applies the single-placed-vessel fallback: wells-only events are
attributed when the deck has EXACTLY ONE placed vessel; multiple distinct placed
vessels => attribute to NOTHING (never guess); an explicit reference never re-routes.

## 2. Ruled fix (orch ruling, smallest change, no new writes)

(a) SHARED attribution rule, applied inside computeLabwareStates — NOT at accept time.
    Justification: persistence is already correct and D2's ledger truth must not gain a
    client-minted labwareId the server never validated; the grid and validation
    (eventValidation.ts calls the SAME function) must agree at read time; the rule is
    already specced data-safe. Implementation constraint:
    - Extract the D2 single-placed-vessel semantics into ONE shared helper (module of
      your choice under app/src/graph/lib/ or shared) and have BOTH eventWellIndex.ts
      and eventGraph.ts consume it — NEVER two local vocabularies for one rule (repo
      hard line). Keep eventWellIndex's existing behavior byte-identical (its tests are
      the pin).
    - In computeLabwareStates: an event with wells but NO labwareId (and for transfers:
      no resolvable source/dest) attributes to the sole placed labware of the `labwares`
      map ONLY when it has exactly ONE entry; ZERO or MULTIPLE => skip exactly as today
      (never-guess red-case). No field-name literals, no domain vocabulary in TS; the
      rule keys off placed-labware COUNT only.
    - Check the sibling readers the grid also uses for the SAME events and make them
      consistent: getWellEvents (eventGraph.ts:979+) and eventFocus.ts:73. If
      getWellEvents filters strictly on details.labwareId, an attributed well would
      show fill but empty event-history — apply the shared helper there too (or prove
      with a test that history already agrees).
(b) getAddMaterialRef gains `details.material` as the LAST fallback (after the five
    existing *_ref fields), typed via the declared interface: ADD `material?: string`
    to AddMaterialDetails (app/src/types/events.ts) so the wire key is declared data,
    not an undeclared extra. Tooltip then names the material. Do not reorder existing
    precedence.

Out of scope: server accept/compile paths (shorthandChat.ts:1410,
AgentOrchestrator.ts:649 — persistence stays as-is), the picker weirdness (separate
recon item L2-CLARIFY-WEIRD-1), ClarificationPicker ranking, anything under server/ or
schema/.

## 3. Acceptance (RED-first)

1. RED at HEAD: unit test on a fixture with ONE placed 96-well labware + an
   add_material event shaped EXACTLY like the real committed shape (wells + material +
   volume, NO labwareId) -> computeLabwareStates yields empty states (proves the bug).
   GREEN after: the sole labware's well states carry the material.
2. Multi-vessel red-case: TWO placed labwares + same event -> attributes to NOTHING
   (D2 invariant preserved).
3. Shared-rule pin: the deck-tile attribution (eventWellIndex tests) still green
   unchanged; one test shows both surfaces pick the same labware for the same event set.
4. getAddMaterialRef: details.material-only details now yields a ref (tooltip
   names it); precedence unchanged when any *_ref is present (existing tests green).
5. Orch post-merge (NOT the coder's job): scout drivers legB2.cjs + legC.cjs re-run
   UNCHANGED against :5193 -> grid shows content on selected wells after Accept + cold
   reload, tooltip names "100 uL DMEM", deck tile and grid agree. Browser gate follows.

Gates: `npx vitest run` on the touched app suites + event-editor/lib/eventWellIndex*.test.*
(neighbour pin), `npx tsc --noEmit` app zero NEW vs branch baseline, diff confined to
app/ (eventGraph.ts, events.ts, eventWellIndex.ts + shared helper + tests), zero YAML.

## 4. Turn discipline (HARD — coders die by burning the output-token cap)
One command/read/edit per turn; small turns; append small report sections (<=40 lines);
never paste >60 lines of file content — cite file:line. Report-first: keep the report
current after every step so an exit mid-run loses nothing.

REPORT: /home/brad/.hermes/cl/lanes/2/deliverables/L2-PROMPT1-GHOST-1-report.l2t1810.md
FINAL LINE (exactly one): L2-PROMPT1-GHOST-1 DONE <full 40-char sha of branch tip>
or L2-PROMPT1-GHOST-1 BLOCKED <reason + what landed>

HOUSE RULES: no hardcode, no domain vocabulary literals (DMEM/well/labware names) in
TS branches, never-guess, exactOptionalPropertyTypes on. Do NOT touch lane data, do NOT
restart stacks, do NOT merge or push.
