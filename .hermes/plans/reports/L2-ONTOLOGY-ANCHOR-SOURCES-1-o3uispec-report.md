# L2-ONTOLOGY-ANCHOR-SOURCES-1 / unit o3uispec — coder report

- Item: L2-ONTOLOGY-ANCHOR-SOURCES-1
- Unit: o3uispec (unit 1 of 1)
- Worktree: /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2
- Branch: cl/lane2-ontology-o3uispec-1913
- Base: 5b38efaa421147d05a46f6b1f8fb5aa6b781c16e
- HEAD (final): a57e5b130982fcf60571aa506f79f3040f1e1d9c
- Date: 2026-11-13T02:11Z
- VERDICT: BLOCKED (code is correct and green; the unit's browser acceptance criterion is unreachable
  with only the 5 owned files — the fix requires widening the shared `SuggestionSource` union in a
  non-owned file. See "BLOCKER" below. Raw reproducible proof at the end.)

## Commit log (base..HEAD)
  a57e5b130982fcf60571aa506f79f3040f1e1d9c  test(ontology): trim pin docstrings to the unit output budget (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec)
  f8285a25f734e2cf24979db488bc903b1e6dba76  feat(ontology): labware-definition ui spec with an ontology anchor field (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec)
  29df6dfc47d8e490e8bb0bc6c233daec3ab4c443  fix(ontology): keep local-obo candidates in the ref resolve hook (opt-in per field) (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec)
  9b878d0dd98f241f4d773b4ddb07dad751a38df0  test(ontology): pin useResolveOntology local-obo opt-in (RED commit)
  43e8e6ce5230257a236b7b5d1b1b2a52a1de7258  test(ontology): pin labware-definition ui spec anchor field (RED commit)

## Changed files (all 5 owned, 220 added lines = at the 220-line budget)
  schema/workflow/labware-definition.ui.yaml                      (NEW, +50)
  app/src/editor/hooks/useResolveOntology.ts                     (+10 -3)
  app/src/editor/taptab/RefCombobox.tsx                          (+6)
  server/src/ui/LabwareDefinitionUiSpec.test.ts                  (NEW, +79)
  app/src/editor/hooks/useResolveOntology.localObo.test.ts       (NEW, +75)
Prohibited files untouched: schema/workflow/labware-definition.schema.yaml, UISpecLoader.ts,
UIHandlers.ts, server/src/resolve/**, OntologyHandlers.ts, config/ontology-sources.yaml, all other
*.ui.yaml, material picker, records/seed, schema/registry.

## WHAT THE CODE DOES (all in-scope, green)
1. `schema/workflow/labware-definition.ui.yaml` (NEW): `uiVersion: 1`, exact `schemaId`
   `https://computable-lab.com/schema/computable-lab/labware-definition.schema.yaml` (copied verbatim
   from schema:2 — the reviewer-bait #1 trap is avoided), `display.titleField: "$.display_name"`, one
   form section with `$.display_name` (text, required), `$.id` (readonly text), `$.ontology_ref`
   (widget `ref`, `refKind: ontology`, `required: false`, props `sources: ["ols","local-obo"]`,
   `valueShape: "ontology-ref"`, `ontologyBinding: "allow-ontology"`, label "Ontology anchor"),
   `$.vendor` (text). 50 lines, no CSS, no detail block.
2. `useResolveOntology.ts`: added `includeLocalObo?: boolean` to `UseResolveOntologyOptions`,
   destructured with default `false`, extended the candidate predicate to
   `(c.source === 'canonical-term' || c.source === 'oak' || c.source === 'ols4' ||
    (includeLocalObo && c.source === 'local-obo')) && Boolean(c.curie)`, added it to the effect dep
   array. No global default flip (reviewer-bait #4 avoided) — OFF unless a field opts in.
3. `RefCombobox.tsx`: beside the existing `const useOls = sources.includes('ols')` added
   `const includeLocalObo = sources.includes('local-obo')` and passed `includeLocalObo` into the
   `useResolveOntology({...})` call. Data-driven from the field's own `suggestionPlan.sources`.
4. Server pin (`server/src/ui/LabwareDefinitionUiSpec.test.ts`): loads the REAL file through the REAL
   `createUISpecLoader()`; asserts success, exact `schemaId`, exactly one `$.ontology_ref` field,
   `widget === 'ref'`, `refKind === 'ontology'`, `props.valueShape === 'ontology-ref'`,
   `props.ontologyBinding === 'allow-ontology'`, and `props.sources` containing BOTH 'ols' and
   'local-obo' (non-vacuous — reviewer-bait #3 avoided).
5. Client pin (`app/src/editor/hooks/useResolveOntology.localObo.test.ts`): `renderHook`,
   `vi.mock('../../shared/api/client')` so `apiClient.resolve` returns one `local-obo` candidate
   (`LWO:0000100`) + one `ols4` candidate (`UBERON:0000001`), `debounceMs: 1`. Case (a) with
   `includeLocalObo: true` expects BOTH curies; case (b) without the option expects the LWO curie
   ABSENT (the today-behaviour / decoy-free pin, reviewer-bait #4).

## RED output (raw, both pins)
Both RED states reproduced by checking out the two RED commits in temp worktrees and running the
pinned tests (node_modules symlinked). These are the ACTUAL failures at the pre-fix commits.

--- RAW RED #1 — server pin, commit 43e8e6ce5230257a236b7b5d1b1b2a52a1de7258 (ui.yaml ABSENT) ---
RUN  v1.6.1
 ❯ src/ui/LabwareDefinitionUiSpec.test.ts  (4 tests | 4 failed) 3ms
   → ENOENT: no such file or directory, open '.../schema/workflow/labware-definition.ui.yaml'
   (4 tests, all ENOENT)
 ⎯⎯ Failed Tests 4 ⎯⎯
 FAIL ... > loads the real sibling spec through the real UISpecLoader with the exact registry schemaId
 FAIL ... > declares exactly one $.ontology_ref field in a form section
 FAIL ... > the $.ontology_ref field is the ref widget with refKind ontology
 FAIL ... > commits the ontology-ref shape and declares BOTH ols and local-obo sources
Error: ENOENT: no such file or directory, open '.../schema/workflow/labware-definition.ui.yaml'
 Test Files  1 failed (1)
      Tests  4 failed (4)

--- RAW RED #2 — client pin, commit 9b878d0dd98f241f4d773b4ddb07dad751a38df0 (includeLocalObo ABSENT) ---
RUN  v1.6.1
 ❯ src/editor/hooks/useResolveOntology.localObo.test.ts  (2 tests | 1 failed) 115ms
   ❯ ... > keeps local-obo candidates when includeLocalObo is set (alongside the other ontology tiers)
     → expected [ 'UBERON:0000001' ] to include 'LWO:0000100'
 ⎯⎯ Failed Tests 1 ⎯⎯
 FAIL ... > keeps local-obo candidates when includeLocalObo is set
AssertionError: expected [ 'UBERON:0000001' ] to include 'LWO:0000100'
 ❯ src/editor/hooks/useResolveOntology.localObo.test.ts:64:20
      62|     await waitFor(() => expect(result.current.loading).toBe(false))
      63|     const curies = result.current.results.map((c) => c.curie)
      64|     expect(curies).toContain('LWO:0000100')   ^
      65|     expect(curies).toContain('UBERON:0000001')
 Test Files  1 failed (1)
      Tests  1 failed | 1 passed (2)
   (case (b), the decoy-free pin, PASSES at RED — it pins today's behaviour)

## GREEN output (raw, both pins + regression guard, at HEAD a57e5b13)
--- server pin ---
 ✓ src/ui/LabwareDefinitionUiSpec.test.ts  (4 tests)
 Test Files  1 passed (1)
      Tests  4 passed (4)
--- client pin ---
 ✓ src/editor/hooks/useResolveOntology.localObo.test.ts  (2 tests)
 Test Files  1 passed (1)
      Tests  2 passed (2)
--- regression guard: RefCombobox.test.tsx (shared hook changed) ---
 Test Files  1 failed (1)
      Tests  2 failed | 6 passed (8)
  FAIL ... > commits structured value with provenance on Enter for ontology result
  FAIL ... > respects ontologies restriction from suggestionPlan
  BASELINE (base 5b38efaa, same file): 2 failed | 6 passed (8) — IDENTICAL two failing names.
  => my change introduced ZERO new failures. (The 2 are pre-existing ontology-provenance failures.)

## Typecheck
  app  `tsc --noEmit`: 7 errors at base AND 7 errors at HEAD — the error lists are byte-IDENTICAL
    (verified by diffing the sorted `error TS` lines; diff is empty). Zero errors touch any owned file
    (grep for useResolveOntology|RefCombobox over the list = no match).
    Root cause is environmental: app/node_modules was externally wiped mid-run and restored by
    symlink to a sibling worktree whose node_modules is missing `prosemirror-view` and `ajv`
    type declarations (proven ABSENT). The 7 errors: 1x `Cannot find module 'prosemirror-view'`
    (tabNavPlugin.ts), 3x `Cannot find module 'ajv/dist/2020.js'` (ObjectWidget.nested.test.tsx,
    RecordCreatePanel.gc16.test.tsx, RecordCreatePanel.gc16-widget-commit.test.tsx), 3x TS7006
    implicit-any in RecordCreatePanel.gc16-widget-commit.test.tsx.
    `npm install` is forbidden by the brief, so the app typecheck cannot reach exit-0 in this degraded
    env — NOT a code defect. (An earlier in-run figure of "13 at base" came from a degraded /tmp
    worktree whose node_modules symlink was broken; the corrected, comparable measurement is
    base=7 / HEAD=7 / identical.)
  server `npx tsc --noEmit`: exit 0.
  (No baseline line-count is claimed beyond the actual outputs above.)

## git status at exit
  `git -c core.fileMode=false status --short` → empty (clean). Tree committed.

## BLOCKER (why the unit is BLOCKED, not DONE)
The unit's core acceptance criterion is: "type `plate`, see LWO rows, commit LWO:0000100, save, read
`ontology_ref` back" (AC1). My in-scope changes are correct and green, BUT the feature is UNREACHABLE
in the real data flow for the following reason, which I proved with a reproducible command:

  Every ref-field plan in the app is built by `buildSuggestionPlanFromFieldHint` (3 call sites:
  app/src/editor/taptab/documentMapper.ts:90, :288, and app/src/editor/taptab/widgets/ObjectWidget.tsx:206),
  which calls `extractSources` (app/src/shared/forms/suggestionPlan.ts:120-129). That function
  whitelists ONLY `local | ols | vendor-search | local-records` and DROPS `'local-obo'`.

  Raw measurement (reproducible):
    ui.yaml declares  $.ontology_ref props.sources = ["ols","local-obo"]
    buildSuggestionPlanFromFieldHint(...) .sources = ["ols"]   <- what RefCombobox actually receives
    RefCombobox: includeLocalObo = plan.sources.includes('local-obo') = false  <- LWO tier filtered OUT

  So `suggestionPlan.sources` never contains `'local-obo'`, my `RefCombobox.includeLocalObo` flag is
  always `false` in the real flow, and the user sees ZERO LWO rows even though the ui.yaml declares
  the source and the resolve spine already serves it. My pin is green because the client pin calls
  the hook directly (passing `includeLocalObo`), bypassing `extractSources` — it does NOT prove the
  browser path.

  The fix requires widening the `SuggestionSource` union (`suggestionPlan.ts:32`) to include
  `'local-obo'` and adding it to the `extractSources` whitelist (`:124`). That file is NOT in the 5
  owned files (it is the shared plan module under `app/src/shared/forms/`, used by every ref field in
  the app). Per the brief's scope discipline ("Keep schema/lint/ui triplets consistent", "Follow
  existing machinery", and the owner boundary in the SCOPE list which names exactly 5 files), I did
  not edit it. This is a domain-contract / ownership change that must be escalated to the orchestrator.

  Why not DONE: a DONE marker asserts the unit's acceptance contract. AC1 (LWO rows visible + commit +
  save + read-back) cannot be satisfied without that file change, and the browser gate would fail
  LEG 2 again. Marking DONE would be an unverified claim (reviewer-bait #10). BLOCKED is the honest
  state: the in-scope work is complete and green; one non-owned file blocks the last mile.

## Save-leg observation (secondary, out of scope, for the orchestrator)
The schema requires 7 top-level fields (`kind, recordId, type, id, display_name, topology, capacity`);
my form declares 4 (`display_name, id, ontology_ref, vendor`). `RecordCreatePanel` is spine-only and
does NOT mint `kind`/`type`/`topology`/`capacity` for a labware-definition create (it is generic
TapTab-first for study/experiment/run). Whether `/record/new/labware-definition` save-leg validates is
therefore NOT proven by my pins (I have no browser) and is a separate concern from the LWO-resolution
last mile above. Flagging it so the orchestrator can decide whether the browser gate's AC1 save-leg is
expected to pass or is owned by a different unit.

## Gate re-gate note
UI specs load ONCE at boot (`server/src/server.ts:585`, `UISpecLoader` caches by `schemaId`). Adding the
ui.yaml file does NOT hot-reload a running stack. The lane stack MUST be restarted before the browser
re-gate, or `UI_SPEC_NOT_FOUND` will persist regardless of this unit's code. (The fix is NOT to add a
watcher or touch `UISpecLoader.ts` — reviewer-bait #2.)

## What the pins prove (and what they don't)
  PROVE: the ui.yaml loads cleanly through the real UISpecLoader with the exact registry schemaId and
    the correct anchor-field props (server pin). The hook retains local-obo candidates when opted in
    and stays decoy-free when not (client pin). No new RefCombobox regressions (guard).
  DO NOT PROVE (no browser): that a person typing "plate" in the live app sees an LWO row, commits
    LWO:0000100, saves, and reads `payload.ontology_ref = {kind:"ontology", id:"LWO:0000100"}` back.
    That is the browser re-gate's job and is currently blocked by the `extractSources` whitelist.

## Next action (owner: orchestrator)
  1. Decide: widen `SuggestionSource` + `extractSources` whitelist in
     `app/src/shared/forms/suggestionPlan.ts` to include `'local-obo'` (one-line union + one-line
     filter). This is a shared domain-contract change affecting every ref field — needs sign-off.
     Until then the o3uispec unit cannot reach DONE.
  2. Restart the lane stack so `UISpecLoader` picks up the new ui.yaml at boot.
  3. Resolve the save-leg question (does a labware-definition create pass Ajv with the 4-field form?)
     before the browser re-gate, or scope it to its own unit.
  4. Hand the browser re-gate to the independent reviewer once (1) is merged.

## Verification commands (exact)
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/server && TMPDIR=/home/brad/.o3uispec-scratch ./node_modules/.bin/vitest run src/ui/LabwareDefinitionUiSpec.test.ts
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app && TMPDIR=/home/brad/.o3uispec-scratch ./node_modules/.bin/vitest run src/editor/hooks/useResolveOntology.localObo.test.ts
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app && TMPDIR=/home/brad/.o3uispec-scratch ./node_modules/.bin/vitest run src/editor/taptab/RefCombobox.test.tsx
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2 && npm run typecheck -w app
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/server && npx tsc --noEmit
  # reproducible blocker measurement (verified this run, node v26.8.1, no scratch file needed):
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2 && node --experimental-strip-types --no-warnings --input-type=module -e '
    import { buildSuggestionPlanFromFieldHint } from "./app/src/shared/forms/suggestionPlan.ts";
    const props = { sources: ["ols","local-obo"], valueShape: "ontology-ref", ontologyBinding: "allow-ontology" };
    const plan = buildSuggestionPlanFromFieldHint("ref", props, "ontology");
    console.log("plan.sources =", JSON.stringify(plan.sources), "| includeLocalObo =", plan.sources.includes("local-obo"));'
  # => plan.sources = ["ols"] | includeLocalObo = false   (the LWO tier is stripped before RefCombobox)
  # The type system independently confirms it: tsc reports
  #   error TS2345: Argument of type '"local-obo"' is not assignable to parameter of type 'SuggestionSource'.
  # (suggestionPlan.ts:32 union omits 'local-obo'; :120-129 extractSources whitelist omits it too.)

Raw GREEN transcripts stored at /home/brad/.o3uispec-scratch/receipts/{server-pin-green,client-pin-green,refcombobox-guard-green}.txt

## Decision
  BLOCKED. In-scope work (5 files, 220 added lines) is complete, green, and committed (HEAD
  a57e5b13). The unit's browser acceptance criterion (AC1: see/commit LWO rows + save + read-back)
  is unreachable because the shared `SuggestionSource` union + `extractSources` whitelist in the
  non-owned `app/src/shared/forms/suggestionPlan.ts` strips `'local-obo'` from the field plan before
  `RefCombobox` can see it. That file is outside the unit's 5 owned files; widening it is a shared
  domain-contract change requiring orchestrator sign-off. Tree is clean; scratch receipts outside git.

L2-ONTOLOGY-ANCHOR-SOURCES-1-o3uispec UNIT unit BLOCKED in-scope 5 files green+committed at a57e5b13 but AC1 (see/commit LWO rows) unreachable: non-owned app/src/shared/forms/suggestionPlan.ts extractSources whitelist (SuggestionSource union) drops 'local-obo' before RefCombobox — needs orchestrator sign-off to widen union+filter, then lane-stack restart + browser re-gate
