# SPEC — EDITOR-1 · Platform: declarative editor block↔slot binding (ui-v1 model, loader validation, projection)

Lane 1 · trunk `cl/integration-1` · worktree `/mnt/vast/home/brad/git/cl-integration-1`
Tick `20261003T200307` · spec authored by orchestrator.

## Why
Round-3 gate blocked QMS-6 on a PLATFORM gap: `EditorProjectionService.assignSlotsToBlocks()`
binds a slot to a block **only** by `slot.path.startsWith(block.path)` and `continue`s when the
block has no `path`. Scalar sibling paths (`$.id`/`$.title`/`$.docType`…) share no prefix, so
section blocks (controlled-document, budget) get `slotIds: []` ⇒ blank editor. The binding rule is
code-only policy and `schema/ui/ui-v1.schema.yaml` does not even model `editor:`.
Remedy (i), architect-decided (W2-D1/W2-D2): **shape A — `block.slots: [slot-id, …]`**.

## Architect semantics (implement exactly; do not re-litigate in code)
- A block declaring `slots` claims exactly those slots, projected into the block's `slotIds` **IN
  LIST ORDER**.
- Blocks WITHOUT `slots` keep the existing path-prefix binding verbatim (repeater/table —
  `$.lines` — untouched).
- Explicitly claimed slots are NEVER reassigned by prefix matching.
- Loader **VALIDATION ERRORS** (not warnings): (a) `block.slots` references an unknown slot id;
  (b) the same slot claimed by two blocks; (c) in a spec whose editor declares ≥1 explicit
  binding, a slot claimed by no block (do not invent a catch-all section).
- A spec with NO explicit bindings keeps today's behavior (pure prefix) — no new default layout,
  so nothing regresses.

## Orientation recon (cl-scout, tick 20261003T200307 — SCREENING; re-verify load-bearing items)
Cross-checked against the orchestrator's own reads of the same files.
- **`EditorBlock`** (`server/src/ui/types.ts:379-398`) fields: `id`, `kind`, `label?`, `help?`,
  `collapsible?`, `collapsed?`, `path?` (documented "For repeater/table: the path to the array
  field"), `columns?`, `visible?`. **No `slots` today — you add it.**
- **`EditorSlot`** (`types.ts:417-444`) fields: `id`, `path`, `label`, `widget`, `help?`,
  `required?`, `suggestionProviders?`, `visible?`, `options?`, `refKind?`, `items?`, `fields?`,
  `props?`.
- **`EditorConfig`** (`types.ts:450-457`): `mode: 'document'`, `blocks: EditorBlock[]`,
  `slots: EditorSlot[]`.
- **`EditorBlockKind`** (`types.ts:364`) = `'section' | 'paragraph' | 'repeater' | 'table'`
  (note: `paragraph` exists too, not just section/repeater/table).
- **`EditorProjectionService.ts`** consumes, per slot: `id`(84), `path`(85), `label`(86),
  `widget`(87), `required`(88), `help`(90), `suggestionProviders`(91), `visible`(92),
  `options`(93), `refKind`(94), `items`(95), `fields`(96), `props`(97); per block: `id`(57),
  `kind`(58), `collapsible`(59), `collapsed`(60), `label`(61), `help`(62), `path`(63),
  `columns`(64), `visible`(65). `assignSlotsToBlocks()` is at :105-116.
- **`UISpecLoader.validateSpec`** (`server/src/ui/UISpecLoader.ts:131-167`) is **hand-written**:
  it validates required fields, `uiVersion`/`schemaId` types, and `form`/`list`/`detail` — it does
  **not** validate `editor`. Errors are **plain strings in a `string[]`** surfaced as
  `validationErrors` in `UISpecLoadResult` (`load()` :68-75). There is **no AJV** and
  `schema/ui/ui-v1.schema.yaml` is **not referenced by any code** (grep found zero references) —
  it is a pure declarative contract document.
- **`schema/ui/ui-v1.schema.yaml`** (298 lines): draft 2020-12; top level `required: [uiVersion,
  schemaId]`, `properties: [uiVersion, schemaId, display, form, list, detail]`,
  `additionalProperties: false` (:274); shared constructs live under the legacy `definitions:` key
  (`section` :95-118, `field` :121-174, `column` :250-272), referenced with `$ref:
  "#/definitions/…"`.
- **`UISpecLoader.editor.test.ts`** already exists and asserts the loader ACCEPTS `editor` blocks/
  slots/kinds/suggestionProviders — but has NO binding/slotIds semantics and NO rejection tests.
- **`EditorProjectionService.test.ts:211-227`** currently ENCODES the broken behavior: it asserts
  the budget `header-summary`/`totals` blocks have `slotIds: []` because they have no `path`.
  `makeBudgetUISpec()` is at :20-79.

## Files you own (edit ONLY these)
- `schema/ui/ui-v1.schema.yaml` — model `editor:` (see below).
- `server/src/ui/EditorProjectionService.ts` + `server/src/ui/EditorProjectionService.test.ts`.
- `server/src/ui/UISpecLoader.ts` + `server/src/ui/UISpecLoader.editor.test.ts`.
- `server/src/ui/types.ts` — **typing only** (add `slots?: string[]` to `EditorBlock`).
- Worker report: `.hermes/plans/worker-reports/editor-1-20261003T200307.md`.
**NO `app/` edits. NO consumer ui.yaml migrations (EDITOR-2 owns `schema/lab/controlled-document.ui.yaml`
and `schema/workflow/budget.ui.yaml`). NO protocol.ui.yaml change.**

## Implementation
1. **types.ts**: add `slots?: string[]` to `EditorBlock` (doc: explicit slot-id claims for
   section-style blocks; repeater/table keep `path`). Keep `exactOptionalPropertyTypes` happy
   (optional, `?:`).
2. **schema/ui/ui-v1.schema.yaml**: add an `editor` property (keeping `additionalProperties:false`,
   **NO escape hatch**), modeling the structure the projection already consumes:
   `mode` (const/enum `document`), `blocks[]` with `id`/`kind`(enum the four kinds)/`label`/`help`/
   `collapsible`/`collapsed`/`path`/`columns`/`visible`/`slots` (array of slot-id strings), and
   `slots[]` covering EVERY field `EditorProjectionService` reads off `EditorSlot` (enumerate from
   `types.ts:417-444` — do not invent). For `slots[].widget`, keep it a **string** (the canonical
   widget set lives in `UISpecLoader.VALID_WIDGET_TYPES`; do not duplicate a narrower enum that
   would drift — and note `readonly`/`markdown`/`combobox` etc. are legitimately in use). Prefer
   `$ref` into `definitions` for reuse, mirroring the existing style. (Nothing validates ui.yaml
   against this file at runtime — its job is to be the declarative contract; correctness is
   enforced by UISpecLoader below.)
3. **UISpecLoader.validateSpec**: add hand-written editor validation returning `string[]` errors in
   the SAME style as the existing checks (e.g. `editor.blocks[1].slots: unknown slot id 'x'`),
   covering: shape/type checks for `editor`/`blocks`/`slots`; per-slot `id`/`path`/`label`/`widget`
   presence + widget membership via `VALID_WIDGET_TYPES`; block `kind` membership; and the three
   SEMANTIC rules (unknown slot ref, double claim, unclaimed-slot-in-an-explicitly-bound-spec).
   Delegate to helpers (`validateEditorConfig`) mirroring `validateFormConfig`. Must not reject any
   existing spec that has no explicit bindings.
4. **EditorProjectionService**: rewrite `assignSlotsToBlocks(blocks, slots)` to bind by `block.slots`
   first (project claims into `slotIds` in list order, marking those slot ids as claimed so prefix
   matching never reassigns them), then fall back to the existing prefix binding per-block for
   blocks with no `slots`. No kind names, no spec names, no hardcoded section policies in TS — the
   YAML drives it. Keep the no-editor `form.sections` path byte-for-byte unchanged.
5. **RED FIRST**: invert `EditorProjectionService.test.ts:211-227` (it currently encodes "pathless
   blocks get no slots"). Write FAILING tests first for: explicit binding, list-order preservation,
   unknown-slot-reference, double-claim, unclaimed-slot, prefix compatibility (repeater `$.lines`
   still binds), explicitly-claimed-slot NOT prefix-reassigned, and the unchanged `form.sections`
   fallback. Add loader-level rejection tests to `UISpecLoader.editor.test.ts`. Call the inversion
   out in the commit message.

## Acceptance (orchestrator verifies — not your word)
- `npm run test` (or the server vitest suite) green for `EditorProjectionService` +
  `UISpecLoader.editor` (+ no regressions in `EditorProjectionFallback.test.ts`).
- Loader validation tests prove a ui spec with an unknown slot ref / double claim / unclaimed slot
  FAILS (`success:false` with the expected `validationErrors` entry).
- `npm run typecheck` (server AND app workspaces) exit 0; `exactOptionalPropertyTypes` stays on.
- Real `git diff` shows only the owned files.

## Verification note (do NOT restart the shared lane stack)
The lane stack (`:3092`/`:5192`, running the TRUNK code) is shared with lane 2 and is OWNED by the
OPS-1 worker this tick. Your branch's TypeScript is not live on `:3092` until merge, so:
- Prove correctness with the unit/contract tests above (the projection is pure).
- If you want the named HTTP regression, start your OWN backend **from your worktree** on a scratch
  port with the same data dir — e.g.
  `cd server && APP_BASE_PATH=.. PORT=3099 CL_DATA_DIR=/home/brad/.computable-lab-lane1 npx tsx src/server.ts &
  ` then `curl -sS :3099/api/ui/record/CAL-DEMO-GC/editor` (expect the fully-populated
  `form.sections` fallback projection) — and **stop it** when done. Do not touch `:3092`/`:5192`,
  never pkill a pattern, never target `:3001`/`:5174`.

## Stop boundaries
Return to the architect (`requires-rescope`): any consumer editor shape not expressible in the
modeled schema; any need to change the projection RESPONSE shape or the frontend document mapper;
any new widget demand. No protocol.ui.yaml migration; no prefix-algorithm refactor beyond the
bullets; no form.sections fallback reversion; no `app/` edits.
