# L2-DOC-INTAKE-1 / unit g1viewable — report

Worktree: /home/brad/cl-wt/L2-DOCINTAKE-g1viewable-lane2
Branch: cl/lane2-docintake-g1viewable-0402
Base sha: 1dc9db1a5128153b1daea6cb10b4d6a201a6f155 (verified `git rev-parse HEAD` before editing)
Implementation commit: ef7336049573d90f8083af5c3ea230c8410e83e8

## What changed (2 files, both owned by this unit)

- schema/lab/vendor-product.ui.yaml (NEW) — `uiVersion: 1`, schemaId copied verbatim from
  vendor-product.schema.yaml:2, display.titleField `$.name`, display.icon `material` (existing
  token, 3 prior uses in schema/lab/*.ui.yaml). Sections: Identity (9 fields, `$.kind` hidden),
  Documents, Composition drafts. Every field `readonly: true`.
- server/src/ui/VendorProductUiSpec.test.ts (NEW) — 3 tests, loads the REAL schema/ tree via
  `loadAllUISpecs(createUISpecLoader(), resolve(__dirname,'../../../schema'))` and asserts through
  `loader.get(SCHEMA_ID)`, never on file existence.

Not touched: UIHandlers.ts, UISpecLoader.ts, vendor-product.schema.yaml, app/**, other *.ui.yaml,
surface-manifest.ui.yaml (no coverage/manifest test demanded an entry — the loader walks the tree).
`git diff --stat 1dc9db1a..HEAD` (measured at this commit's HEAD) = 3 files changed, 274 insertions(+); the 2 implementation files above plus this report file.

## Deviation from the brief's step 2, with evidence (please read)

The brief asked for `$.documents[*].title` … `$.documents[*].extraction.method` field rows. I did not
declare those, because on the record page they render their LABEL with an EMPTY VALUE. Chain:

- app/src/editor/taptab/documentMapper.ts:283 resolves each slot with `getValueAtPath(data, slot.path)`;
- app/src/shared/lib/formHelpers.ts:15-25 implements it as `stripJsonPath(path).split('.')` and a
  property lookup per part — `documents[*]` is looked up as a literal object key, so it returns
  undefined for `$.a[*].b`;
- app/src/editor/taptab/extensions/WidgetRenderer.tsx formatWidgetDisplayValue returns '' for
  undefined, so the row is blank.
`$.claims[*].claimStatus` (material-receiving.ui.yaml:39) is the review-card/draft-compile path
(server-side resolvePath), not the record-page projection — that precedent does not carry over.
app/** is prohibited for this unit, so the fix had to stay data-side.

Chosen data-side rail, using machinery that already exists: declare each array as ONE `array` field
(`$.documents`, `$.composition_drafts`). ArrayWidget.tsx:214-232 renders read-only arrays as one
`<li><pre>` per item with every field of that item (`formatItem`), so each document's `title`,
`document_kind`, `file_ref.media_type` and `extraction.method` (plus `page_count`) are visible, and
each draft's `status` / `extraction_method` are visible — which is exactly the UNIT sentence and D4's
"the six documents and five drafts are not shown". Read-only, no editing affordance, no new
component, no client change. The test pins this reasoning: it asserts `$.documents` and
`$.composition_drafts` exist, that NO path contains `[*]` (with the reason in a comment), that every
field is readonly, and that `extraction.pages` is never referenced (g1pagemethod owns that).

If the orchestrator prefers the literal `[*]` rows plus a client fix to getValueAtPath, that is a
different (app/**) unit; the yaml change is a 10-line edit.

Projection-level assertion (test 3) walks the real payload shape from the gate receipt through
EditorProjectionService and asserts blocks `['Identity','Documents','Composition drafts']`, the
`$.documents` slot is `widget: array` + `readOnly: true`, and zero error-severity diagnostics — i.e.
the 404 path is gone and the page has structure.

## Verification (raw)

    $ cd server && npx vitest run src/ui/VendorProductUiSpec.test.ts
     ✓ src/ui/VendorProductUiSpec.test.ts  (3 tests) 624ms
     Test Files  1 passed (1)
          Tests  3 passed (3)

    $ cd server && npx vitest run src/ui/UISpecLoader.editor.test.ts   # baseline 28/28
     ✓ src/ui/UISpecLoader.editor.test.ts  (28 tests) 67ms
     Test Files  1 passed (1)
          Tests  28 passed (28)

    $ cd server && npx tsc --noEmit   # a .ts file (the test) was authored
    0 (error lines)

    $ git -c core.fileMode=false status --short
    (clean)

Mutation probe — `mv schema/lab/vendor-product.ui.yaml{,.bak}`, same targeted test:

     Test Files  1 failed (1)
          Tests  3 failed (3)
     FAIL … TypeError: Cannot read properties of undefined (reading 'form')
     FAIL … TypeError: Cannot read properties of undefined (reading 'editor')  ← projectRecord(uiSpec)
     ❯ src/ui/VendorProductUiSpec.test.ts:85
RED with `loader.get()` undefined proves the pin is not riding any auto-generated fallback
(generateUISpecFromSchema was never wired into the record path). File restored, re-run green (above),
`git status` shows no `.bak`.

## Criterion-6 arms

CLOSED by this unit: "at least the finished intake reachable" — /record/<vendorProductId> is now a
declared surface (loader has the spec, projection returns Identity/Documents/Composition drafts)
instead of `UI_SPEC_NOT_FOUND`.
STILL OPEN for the gate (other units/legs, not this one):
- pending-state restore on /lab/materials/new after reload;
- /lab/materials listing a vendor-product kind (D4's `hasVendorProduct: false`);
- D1 per-page extraction method (g1pagemethod unit); D2 door disagreement; D3 unsupported diagnostic;
  S1 uploaded bytes inside the worktree / no data-reference record.

No stack boot was performed; the loader+projection tests are the evidence and YAML is not hot-reloaded.

L2-DOC-INTAKE-1 UNIT g1viewable DONE c67608591c8f4a3b3433b92fd916e9d9f8bbc8c7
L2-DOC-INTAKE-1-g1viewable UNIT unit DONE c67608591c8f4a3b3433b92fd916e9d9f8bbc8c7
