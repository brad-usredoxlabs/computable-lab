# L2-ONTOLOGY-ANCHOR-SOURCES-1 / unit o3uispec-fix1 — coder report

- Item: L2-ONTOLOGY-ANCHOR-SOURCES-1
- Unit: o3uispec-fix1 (unit 1 of 1, last-mile: extractSources whitelist drops 'local-obo')
- Worktree: /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2
- Branch: cl/lane2-ontology-o3uispec-1913
- Base: ae856b1253206cb7b49c38333e0deed94367a28f (o3uispec BLOCKED report commit; `git rev-parse HEAD` at start = ae856b1253206cb7b49c38333e0deed94367a28f, so no base-drift)
- Date: 2026-11-12 (EST)
- VERDICT: DONE — code-track acceptance contract met (raw outputs below). Browser gate AC1 (LWO rows visible in the real form) remains the item's browser re-gate per the brief; the prerequisite (local-obo surviving extractSources) is now proven through the public surface.

## Commit log (base..HEAD, oldest -> newest)
  bbd096e6619bd57be4e2e64b1f3b4f621c764b37  test(ontology): pin local-obo survives extractSources (RED)
  299e377d1d05070141f1d6f937d5329de7d397f9  fix(ontology): widen SuggestionSource whitelist to include local-obo
  <report-body commit = the sha in the UNIT marker line below>  docs(ontology): o3uispec-fix1 unit report (L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec-fix1)
  <marker-append commit = final HEAD>  appends only the UNIT marker line so it can carry the report-body commit's real sha

## Changed files (exactly 2, 40 added / 2 deleted = 38 net new lines, <= 60 budget)
  app/src/shared/forms/suggestionPlan.test.ts  (NEW, +38)
  app/src/shared/forms/suggestionPlan.ts       (+2 -2: union line 32, filter predicate line 124)

Prohibited files untouched (verified: `git diff --stat ae856b12..299e377d` lists exactly the 2 owned
files): RefCombobox.tsx, useResolveOntology.ts, documentMapper.ts, ObjectWidget.tsx, all
schema/** files. No new source kinds added; default ['local'] fallback unchanged.

## THE FIX
  1. `app/src/shared/forms/suggestionPlan.ts:32` — SuggestionSource union widened:
     - 'local' | 'ols' | 'vendor-search' | 'local-records'
     + 'local' | 'ols' | 'vendor-search' | 'local-records' | 'local-obo'
  2. `app/src/shared/forms/suggestionPlan.ts:124` — extractSources filter predicate widened with
     `|| s === 'local-obo'`.
  Additive only: no existing field declares 'local-obo', so no other field's plan changes.
  Call sites (documentMapper.ts:90/:288, ObjectWidget.tsx:206) pass props through and needed no
  change (per brief; anchors verified at start).

## RED (raw, pre-fix, commit bbd096e6 — pin committed before the fix so it is proven to bite)
Command: `cd app && npx vitest run src/shared/forms/suggestionPlan.test.ts`

  RUN  v1.6.1 /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app
   ❯ src/shared/forms/suggestionPlan.test.ts  (3 tests | 1 failed) 6ms
     ❯ ... > keeps local-obo alongside ols (ui.yaml ["ols","local-obo"] survives the plan build)
       → expected [ 'ols' ] to include 'local-obo'
  ⎯⎯⎯ Failed Tests 1 ⎯⎯⎯
   FAIL  ... > keeps local-obo alongside ols (ui.yaml ["ols","local-obo"] survives the plan build)
  AssertionError: expected [ 'ols' ] to include 'local-obo'
   ❯ src/shared/forms/suggestionPlan.test.ts:23:26
       22|     expect(plan.sources).toContain('ols');
       23|     expect(plan.sources).toContain('local-obo');
  Test Files  1 failed (1)
       Tests  1 failed | 2 passed (3)

(local-obo pin RED as required; the negative pin 'bogus dropped' and the default-['local'] pin
already PASS at RED — they pin today's behaviour and still pass after the fix.)

## GREEN (raw, post-fix, commit 299e377d)
Same command: `cd app && npx vitest run src/shared/forms/suggestionPlan.test.ts`

  RUN  v1.6.1 /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app
   ✓ src/shared/forms/suggestionPlan.test.ts  (3 tests) 3ms
  Test Files  1 passed (1)
       Tests  3 passed (3)

Pins (through the PUBLIC surface only — buildSuggestionPlanFromFieldHint and the exported
extractSources; no private imports):
  1. plan built from props.sources ['ols','local-obo'] (widget 'ref', refKind 'ontology')
     contains BOTH 'ols' and 'local-obo'  (acceptance #2, public-surface pin)
  2. unknown source 'bogus' still dropped, 'ols' kept  (acceptance #3, negative pin)
  3. extractSources() and extractSources({}) still return the default ['local']  (no default change)

## Public-surface measurement (reproducible, run at 299e377d)
  node --experimental-strip-types -e 'import { buildSuggestionPlanFromFieldHint } from
  "./app/src/shared/forms/suggestionPlan.ts"; ...' with props sources ["ols","local-obo"]:
    plan.sources = ["ols","local-obo"] | includeLocalObo = true
  (prior unit measured `["ols"] | includeLocalObo = false` — the blocker is gone.)
  RefCombobox.tsx:90 `sources.includes('local-obo')` now evaluates true for the
  labware-definition.ui.yaml:43 field (`sources: ["ols","local-obo"]`) in the real flow.

## Regression (raw)
  `cd app && npx vitest run src/editor/taptab/RefCombobox | tail -5` at 299e377d:
    Test Files  1 failed (1)
         Tests  2 failed | 6 passed (8)
  Direct baseline measured at base ae856b12 (temp detached worktree, node_modules symlinked,
  same command):
         Tests  2 failed | 6 passed (8)
  Failing names at base AND at HEAD are the SAME two (pre-existing ontology-provenance
  failures, also documented in the prior o3uispec report):
    FAIL  ... > commits structured value with provenance on Enter for ontology result
    FAIL  ... > respects ontologies restriction from suggestionPlan
  => NOT worse than baseline: identical count and identical failing test names.

## Typecheck
  `cd app && npx tsc --noEmit`: rc=2 with 7 errors at 299e377d AND 7 errors at base — the sorted
  error lists are byte-IDENTICAL (diff empty), zero new errors from this change, none touch an
  owned file:
    1x Cannot find module 'prosemirror-view' (tabNavPlugin.ts)
    3x Cannot find module 'ajv/dist/2020.js' (ObjectWidget.nested.test.tsx, RecordCreatePanel.gc16*.test.tsx)
    3x TS7006 implicit any (RecordCreatePanel.gc16-widget-commit.test.tsx)
  Environmental (degraded node_modules in this worktree), exactly as documented in the prior
  o3uispec report ("7 at base AND 7 at HEAD ... NOT a code defect"). Measured base with a temp
  detached worktree at ae856b12 + node_modules symlinks (same environment), sorted, diffed
  (diff output empty).
  Note: the brief's literal "tsc --noEmit rc=0" is unreachable in this degraded environment for
  base too (rc=2 at base) — the contract that matters (no new errors, identical list) is met and
  proven above. npm install is not in this unit's scope.

## git status at exit
  clean (everything committed; `git status --porcelain` = empty at final HEAD).

## Next actions (owner: orchestrator)
  1. Restart the lane stack so UISpecLoader picks up schema/workflow/labware-definition.ui.yaml
     at boot (prior report's re-gate note: ui specs load once at boot, no hot-reload).
  2. Hand the browser re-gate to the independent reviewer (AC1: type 'plate' -> LWO rows visible
     -> commit LWO:0000100 -> save -> read back ontology_ref). The last-mile blocker
     (extractSources dropping 'local-obo') is now fixed and pinned by this unit.
  3. (Carried over from prior report, out of scope here) save-leg question: does a
     labware-definition create pass Ajv with the 4-field form?

## Verification commands (exact)
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app && npx vitest run src/shared/forms/suggestionPlan.test.ts
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app && npx vitest run src/editor/taptab/RefCombobox 2>&1 | tail -5
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2/app && npx tsc --noEmit
  # public-surface measurement (reproducible at any commit >= fix commit 299e377d):
  cd /home/brad/cl-wt/L2-ONTOLOGY-o3uispec-lane2 && node --experimental-strip-types --no-warnings --input-type=module -e '
    import { buildSuggestionPlanFromFieldHint } from "./app/src/shared/forms/suggestionPlan.ts";
    const props = { sources: ["ols","local-obo"], valueShape: "ontology-ref", ontologyBinding: "allow-ontology" };
    const plan = buildSuggestionPlanFromFieldHint("ref", props, "ontology");
    console.log("plan.sources =", JSON.stringify(plan.sources), "| includeLocalObo =", plan.sources.includes("local-obo"));'

Raw receipts (outside git): /home/brad/.o3uispec-scratch/receipts/o3uispec-fix1-{red,green,refcombobox,tsc}.txt
Plus: o3uispec-fix1-refcombobox-base.txt (direct RefCombobox baseline at base ae856b12) and
o3uispec-fix1-base-tsc.txt (sorted base tsc error list, diffed empty vs HEAD list).

## Decision
  DONE. 2 files, one seam: 'local-obo' added to the SuggestionSource union and the
  extractSources filter predicate. RED pin committed before the fix and biting
  (expected [ 'ols' ] to include 'local-obo'); GREEN 3/3 after; public-surface plan now
  carries both sources (includeLocalObo = true); negative + default pins hold; RefCombobox
  regression identical to baseline; tsc error list byte-identical to base (7 environmental,
  0 new). Tree clean.

DONE: L2-ONTOLOGY-ANCHOR-SOURCES-1 o3uispec-fix1
