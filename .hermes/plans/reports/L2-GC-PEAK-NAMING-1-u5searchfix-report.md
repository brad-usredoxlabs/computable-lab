# L2-GC-PEAK-NAMING-1 u5searchfix — unit report (lane 2)

- item: L2-GC-PEAK-NAMING-1-u5searchfix-l2t2673.txt
- branch: cl/lane2-gcpeak-surface-l2t2670 (continued)
- base: a4b7d1bda6b4b680c039f896df01f247ed08f0cf (clean tree at start)
- report path note: this item's lineage reports (u1, u2, u4) are committed under
  `.hermes/plans/reports/` — the launcher grepped the u4 DONE marker from
  `.hermes/plans/reports/L2-GC-PEAK-NAMING-1-u4surface-report.md`. Placed here,
  same directory, not the generic `.hermes/reports/`.

## What was fixed

Browser-gate r3 defect D1 (severity LOW, criterion "no dead chrome"): on the
/registry Compounds tab the "Search compounds..." combobox accepted typing but
did nothing — the tab declares `kinds: []` (RecordRegistryPage.tsx:75), so zero
/api/search requests fired and the list stayed unfiltered (gate run6 trail
steps 9 + network log; shots/04-compounds-search-probe.png).

Disposition: gate-GC-PEAKNAMING-r3-l2t2672.log r3 D1 ("hide the combobox when
the tab has no kinds") under SOP rule 12 — dead chrome is a defect; cut it.
Bedrock (§2.4, .hermes/plans/architect-context-l2.md): "Presentation ≠
execution. A surface is where something is shown or a person acts; a
capability is what executes. A page must never own a capability" — a combobox
with no kinds behind it is a surface with no capability; CompoundClassPanel
is the tab's content. The combobox is NOT wired to filter the panel (panel
lists a small registry; a filter is out of scope and would be a second
surface to keep honest).

## Changed files (2 files)

1. app/src/pages/RecordRegistryPage.tsx — the single render site of
   RecordSearchCombobox (old :906-923) is wrapped in
   `{activeTabConfig.kinds.length > 0 && ( ... )}` plus the u5searchfix D1
   comment ("a registrySource tab declares no kinds, so the combobox would be
   dead chrome — CompoundClassPanel is its content"). Same shape as the
   existing Create-button guard at :829. Every kinds-backed tab renders the
   combobox byte-identical (props, handlers, wrapping div unchanged); the
   compounds tab renders no combobox at all.
2. app/src/pages/RecordRegistryPage.test.tsx — pin:
   `it('u5searchfix D1: the Compounds tab (registrySource, no kinds) renders
   NO search combobox; kinds-backed tabs keep it')` in
   RecordRegistryPage.test.tsx: asserts the combobox is PRESENT on the default
   People tab (placeholder "Search people..."), then clicks Compounds and
   asserts ABSENCE (no record-search-combobox, no search-input, no
   "Search Local" button) while the real CompoundClassPanel still renders its
   `compound-panel` testid ("No compound classes registered" for the empty
   registry). Added `getCompoundClasses: vi.fn().mockResolvedValue({ classes:
   [] })` to the existing apiClient mock (the page calls it for this tab —
   :356-357).

Pin swap per brief VERIFY-1: NO existing test asserted the combobox EXISTS on
the compounds tab (grep of all 11 RecordRegistryPage*.test.tsx: no compounds-
tab combobox assertion; RecordRegistryPage.createTab.test.tsx:480 already
skips `kinds.length === 0` tabs). So no assertion flipped — a new pin was
added instead (absence on compounds + presence on people).

## RED / GREEN evidence (real outputs)

RED — pin run against the BASE page (a4b7d1bda, `git show
a4b7d1bda:app/src/pages/RecordRegistryPage.tsx` temporarily in place; test
file is the final committed one):
    ❯ src/pages/RecordRegistryPage.test.tsx  (20 tests | 1 failed | 19 skipped)
    FAIL  ... > u5searchfix D1: the Compounds tab (registrySource, no kinds) renders NO search combobox; kinds-backed tabs keep it
    AssertionError: expected <div …(1)>…(3)</div> to be null
    Test Files  1 failed (1)
           Tests  1 failed | 19 skipped (20)
(The div is the `registry-list__search` wrapper with the combobox — present
on the Compounds tab at base: the defect.)

GREEN — after the fix, in app/:
    $ npx vitest run src/pages/RecordRegistryPage
    Test Files  11 passed (11)
         Tests  71 passed (71)        (baseline at base: 70 passed across the
                                      same 11 files; the +1 is the new pin;
                                      RecordRegistryPage.test.tsx 19 -> 20)

tsc, in app/:
    $ npx tsc --noEmit  ->  10 "error TS" lines, identical to the baseline at
    base a4b7d1bda (10 pre-existing drift errors in untouched files:
    SchemaRecordForm.tsx, RefCombobox.ontologyref.test.tsx,
    ObjectWidget.nested.test.tsx, RecordCreatePanel.*.test.tsx). 0 new, 0 in
    the two touched files (`grep pages/RecordRegistryPage` on the tsc output:
    no matches).

## Acceptance mapping

1. Compounds tab: no "Search compounds..." input rendered (pin:
   queryByTestId('record-search-combobox') null, queryByTestId('search-input')
   null); CompoundClassPanel list unchanged (real panel renders, empty-registry
   state "No compound classes registered").
2. Kinds-backed tabs unchanged: pin asserts People tab still renders the
   combobox with placeholder "Search people..." (same props as base — the
   conditional only removes the wrapper for `kinds.length === 0`); createTab
   suite (10 tests) green.
3. Suites green: 71/71 across 11 RecordRegistryPage files (no assertion
   flipped — see pin swap note).
4. This report + DONE marker committed; tree clean.

## Verification commands (repeatable, from worktree root)

    cd app && npx vitest run src/pages/RecordRegistryPage   # 11 files, 71 passed
    cd app && npx tsc --noEmit 2>&1 | grep -c "error TS"    # 10 (all pre-existing drift)
    git -C <worktree> log --oneline -4                       # marker, report, pin, fix

## Commits

- e8614c1cf  fix(lane2): L2-GC-PEAK-NAMING-1 u5searchfix — registrySource tabs
  hide the search combobox (dead chrome, gate r3 D1)
- 9b78e9742  test(lane2): L2-GC-PEAK-NAMING-1 u5searchfix — pin asserts
  combobox ABSENCE on Compounds tab, panel via real CompoundClassPanel (RED
  on base: 'expected div to be null')
- (report commit — sha recorded in the DONE marker below)
- (marker commit — top of the tree)

## Next actions / blockers

- None blocking. Remaining: independent browser gate re-run on the served lane
  stack to confirm acceptance 1 visually (Compounds tab shows the panel and
  no search box; People tab search still hits /api/search) — owner: browser
  reviewer. No YAML touched, so no lane-stack reload needed for this unit.

L2-GC-PEAK-NAMING-1-u5searchfix-l2t2673.txt UNIT L2-GC-PEAK-NAMING-1-u5searchfix-l2t2673.txt DONE 3ca1c46b63ec15b9d0a9729ac2fea55910e6c95c
