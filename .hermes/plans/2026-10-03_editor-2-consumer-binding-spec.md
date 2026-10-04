# SPEC — EDITOR-2 · Migrate both editor consumers onto the declarative binding + close the missing regression

Lane 1 · trunk `cl/integration-1` @ `34cfe597` · worktree `/mnt/vast/home/brad/git/cl-integration-1`
Tick `20261004T030515` · spec authored by the orchestrator. Deps: EDITOR-1 (DONE, merged `86b63f34`).

## Why
The round-3 gate's defect was a BLANK controlled-document editor. EDITOR-1 shipped the platform
capability (declarative `block.slots` → `block.slotIds`, loader-validated). Nothing uses it yet:
both editor consumers (`controlled-document.ui.yaml`, `budget.ui.yaml`) declare `editor.blocks`
with NO binding, so every block projects `slotIds: []` and the frontend drops it. This task makes
the capability real in the two consumers and closes the exact test omission (slot *exists* vs
block *claims* slot) that let the blank editor pass two gates.

## Verified orientation (orchestrator's own reads + curl; scout recon is screening only)
- **`buildProjectionDocument`** (`app/src/editor/taptab/documentMapper.ts:142-257`, used by
  `RecordViewer.tsx:167` via `ProjectionTapTabEditor`, fed by `GET /api/ui/record/:id/editor`):
  - `:171` `if (block.kind !== 'section') continue;` → **repeater/table blocks never render on the
    generic record page** (budget `line-items` is a repeater; it renders in the run-workspace
    `BudgetDocumentSurface`, not here — pre-existing, NOT your scope).
  - `:173-175` resolves each `block.slotIds` id against `slots` by `s.id === slotId`.
  - `:177` `if (blockSlots.length === 0) continue;` → a block with no claimed slots renders nothing.
  So: `slotIds` populated ⇒ section renders with those field rows, in list order.
- **`UISpecLoader.validateEditorBindings`** (`server/src/ui/UISpecLoader.ts:530-602`) — hard rules
  you must not trip: unknown slot id ⇒ error `:560-563`; same slot in two blocks ⇒ error `:565-569`;
  in a spec with ≥1 explicit binding, a slot claimed by nobody ⇒ error `:593-597` (a slot-less block
  with a `path` still covers slots under that path, `:578-585`).
- **`schema/ui/ui-v1.schema.yaml`**: `editor.blocks[].slots` = array of slot-id strings (`:360-371`);
  `editorSlot.options` is an **array** of `{value,label,description?,disabled?}` (`:432-450`) ⇒ the
  array-form `options:` already in `controlled-document.ui.yaml` is schema-correct for editor slots.
  The architect's `field.options` (object-shape) note concerns **form** fields only — **out of scope
  here, do not touch it** unless it actually blocks the loader.
- **Current projections (curl, BEFORE your change — this is the bug):**
  - `GET /api/ui/record/DOC-DEMO-SOP/editor` → 3 blocks (`identity`, `classification`,
    `document-body`), **all `slotIds: []`**; 9 slots: `id-slot`, `state-slot`, `title-slot`,
    `doctype-slot`, `revision-slot`, `author-ref-slot`, `reviewer-ref-slot`, `approver-ref-slot`,
    `body-slot`; `diagnostics: []`.
  - `GET /api/ui/record/BUD-DEMO-LANE1/editor` → 3 blocks (`header-summary` section, `line-items`
    repeater `path: $.lines`, `totals` section), **all `slotIds: []`**; 4 slots: `title-slot`,
    `state-slot`, `currency-slot`, `notes-slot`; `diagnostics: []`.
- **Lane fixture already exists**: `BUD-DEMO-LANE1` was created by the orchestrator via
  `POST /api/records` (`sourceType: manual`, state `draft`, one demo line). **Reuse it — do not
  create a second budget record.** It lives in the LANE data repo, not git.
- `ControlledDocumentSchemas.test.ts:243-265` asserts slot-level facts only (body slot exists,
  widget `markdown`; ref slots; no `lifecycleId` slot) — **it never asserts that a block CLAIMS a
  slot**, which is exactly how the blank editor survived. `:267-287` asserts the projection's
  diagnostics/slot readOnly, again without block membership.

## Files you own (edit ONLY these)
- `schema/lab/controlled-document.ui.yaml`
- `schema/workflow/budget.ui.yaml`
- `server/src/schema/ControlledDocumentSchemas.test.ts`
- `server/src/ui/EditorProjectionService.test.ts` (consumer additions only — do NOT touch its
  EDITOR-1 semantics tests)
- Worker report: `.hermes/plans/worker-reports/editor-2-20261004T030515.md` (your unique path)
**NO `app/` edits. NO `server/src/ui/*.ts` implementation edits (EDITOR-1 owns them). NO other
ui.yaml. NO lifecycle/lint/schema-triplet changes.**

## Change 1 — `schema/lab/controlled-document.ui.yaml` (all 9 slots claimed, 3 non-empty sections)
Add `slots:` to the three existing blocks (order = intended display order; do not reorder the
existing slot declarations, do not change any widget/path/label/help):
```yaml
    - id: "identity"
      slots: ["id-slot", "title-slot", "state-slot"]
    - id: "classification"
      slots: ["doctype-slot", "revision-slot", "author-ref-slot", "reviewer-ref-slot", "approver-ref-slot"]
    - id: "document-body"
      slots: ["body-slot"]
```
Rationale (decided here, do not re-litigate): identity = identifiers + the declared read-only
`state-slot` (its own help text says state is lifecycle-gated, never a form field — the widget stays
`readonly`, so it is display-only, exactly what `:254-256` of the test permits); classification =
document class, human revision label, and the three role refs; document-body = the `markdown` body
slot. Every slot is claimed exactly once; `$.lifecycleId` is not a slot anywhere (stays that way).
Keep the `form:` fallback block and the header comments byte-identical except where a comment must
now describe the binding.

## Change 2 — `schema/workflow/budget.ui.yaml`
```yaml
    - id: "header-summary"
      slots: ["title-slot", "state-slot", "currency-slot"]
    - id: "line-items"      # unchanged: path: $.lines, prefix binding
    - id: "totals"          # unchanged: no scalar slot belongs to the computed-totals block
    - id: "notes"           # NEW block
      kind: "section"
      label: "Notes"
      help: "<one line>"
      slots: ["notes-slot"]
```
- The `notes` block is **required**: the editor declares a `notes-slot` but no block can host it, and
  the loader errors on any unclaimed slot in an explicitly-bound spec. The file's own `form:`
  fallback already declares a "Notes" section, so this makes editor and fallback
  consistent instead of inventing structure. Keep the block last.
- `totals` keeps NO slots and gains a one-line YAML comment: computed totals are rendered by
  `BudgetDocumentSurface` (run workspace); the generic projection renders only blocks with claimed
  slots. **Do not invent a totals/summary slot id.**
- `line-items` keeps `path: $.lines` with no `slots:` (prefix binding preserved verbatim).

## Change 3 — tests, RED FIRST
Write the failing assertions BEFORE the YAML edits, run them, capture the RED output, then edit.
1. `ControlledDocumentSchemas.test.ts` — strengthen the `:243-285` region (keep existing assertions):
   load the real `controlled-document.ui.yaml`, `projectRecord` the real `validDraft`, then assert
   `projection.blocks` membership:
   - `document-body.slotIds` contains `body-slot` (and the body slot's widget is `markdown`);
   - every one of the 9 declared slot ids is claimed by exactly one block (no unclaimed, no doubles);
   - `identity.slotIds` = `["id-slot","title-slot","state-slot"]`,
     `classification.slotIds` = `["doctype-slot","revision-slot","author-ref-slot","reviewer-ref-slot","approver-ref-slot"]`
     (assert as sets or exact order — order is the contract, so assert exact order);
   - no block has an empty `slotIds`.
2. `EditorProjectionService.test.ts` — add a real-consumer budget describe: read the real
   `schema/workflow/budget.ui.yaml` from disk (mirror the path helper used in
   `ControlledDocumentSchemas.test.ts`), load it through the real `createUISpecLoader()` (it must
   load with **zero validation errors**), `projectRecord` a minimal budget payload, and assert
   `header-summary.slotIds = ["title-slot","state-slot","currency-slot"]`,
   `notes.slotIds = ["notes-slot"]`, `line-items` still `slotIds: []` with `path: $.lines`,
   `totals.slotIds = []`, and that no declared slot is unclaimed.
   Leave the EDITOR-1 semantic tests untouched.

## Acceptance (the orchestrator verifies independently — your summary is not evidence)
- `npx vitest run` green for `server/src/schema/ControlledDocumentSchemas.test.ts`,
  `server/src/ui/EditorProjectionService.test.ts`, `server/src/ui/UISpecLoader.editor.test.ts`,
  `server/src/ui/EditorProjectionFallback.test.ts` (no regressions).
- A loader-level check proves BOTH real consumer specs load with **zero** `validationErrors`.
- Post-change projection evidence from a scratch backend started **from your worktree** (see below):
  `DOC-DEMO-SOP` → 3 blocks, slotIds `["id-slot","title-slot","state-slot"]`,
  `["doctype-slot","revision-slot","author-ref-slot","reviewer-ref-slot","approver-ref-slot"]`,
  `["body-slot"]`, all 9 slots present, `diagnostics: []`;
  `BUD-DEMO-LANE1` → `header-summary` `["title-slot","state-slot","currency-slot"]`, `notes`
  `["notes-slot"]`, all 4 slots present, `diagnostics: []`.
  Paste the raw JSON (trimmed) into your report.
- **No new type errors** (this trunk has pre-existing TS debt: 33 server `error TS` lines on the
  pristine trunk; the bar is "the same set, byte-identical"). `exactOptionalPropertyTypes` stays on.
- Real `git diff` shows ONLY the four owned files.

## Verification mechanics (do NOT restart the shared lane stack)
The lane stack `:3092`/`:5192` is orchestrator-owned and must stay up; your YAML is not live on it
until merge. Verify with your OWN backend from your worktree on a scratch port:
```
cd /mnt/vast/home/brad/git/wt/editor-2-lane1-20261004T030515/server
APP_BASE_PATH=.. PORT=3099 CL_DATA_DIR=/home/brad/.computable-lab-lane1 npx tsx src/server.ts &
```
(poll `http://127.0.0.1:3099/api/health` until ready; then curl the two `/api/ui/record/.../editor`
URLs; then kill **that exact PID** — never a pattern, never `:3001`/`:5174`/`:3092`/`:5192`.)
Run it with `nohup ... &` / background so the tool timeout cannot kill a foreground call.

## Stop boundaries
Return to the architect (`requires-rescope`) — do NOT absorb — if: a populated `block.slotIds` still
yields a blank editor (the mapper/rich-text rewrite is NOT yours); a field's grouping is genuinely
ambiguous between two declared sections; the loader rejects a shape the schema models; a new widget
is demanded. No `form.sections` fallback reversion, no widget changes, no `app/` edits, no
revision/lifecycle work.