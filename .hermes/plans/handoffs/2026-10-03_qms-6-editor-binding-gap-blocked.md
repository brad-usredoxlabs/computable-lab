# Handoff — QMS-6 gate OBTAINED (VERDICT: fix); root cause is a PLATFORM capability gap — BLOCKED, back to the architect

Lane 1 · trunk `cl/integration-1` (HEAD `cd00bcf7`, unchanged this tick) · 2026-10-03, orchestrator tick 20261003T222126

## Task
QMS-6 — Registry coverage + signature-aware DocumentControlBar + sign-off receipt.
Status left **blocked** (was in-progress). Three findings; the decisive one is a new platform gap
that QMS-6 is forbidden to absorb (QMS-1 spec: "if a NEW generic widget/projection capability is
required, STOP and return requires-rescope"; QMS-6 spec: "this task MUST NOT absorb it; stop instead").

---

## BLOCKER A — CLEARED this tick
The appliance-2 vision endpoint was UP and stable: `http://appliance-2:11434/v1/models` returned
HTTP 200 on 4/4 probes (0.008–0.030 s), `qwen3.6-35b-a3b` loaded. The `cl-browser-reviewer` gate
ran to completion (exit 0) — no 503.

Receipts: `/home/brad/.hermes/cl/receipts/QMS-6/20261003T222126/`
(`trail.json`, `report.md`, `shots/` ×10). Worker log:
`/home/brad/.hermes/cl/logs/qms6-reviewer-20261003T222126.log`.

**VERDICT: fix** — 6 flows accepted, 4 rows blocked (credential), 2 defects reported. I re-verified
both defects myself (below); ONE is real, ONE is a false positive.

---

## FINDING 1 — REAL, and it is a PLATFORM gap: the document editor renders NO fields at all

### What I observed (my own reproduction, not the reviewer's word)
- `GET /api/ui/record/DOC-DEMO-SOP/editor` (live, :3092) returns **every block with `slotIds: []`**:
  `[{id:identity, slotIds:[]}, {id:classification, slotIds:[]}, {id:document-body, slotIds:[]}]`.
  The 9 slots come back present and correct (`body-slot` widget `markdown`, path `$.body`) — but
  **no block claims any slot**.
- Live on :5192, opening the SOP: the single TipTap node
  (`div.tiptap.ProseMirror.taptab-editor-prose`) is **empty** (`innerHTML === ""`), and neither
  `DEMO GC-FID standard injection` nor `Sandbox-only fixture` appears anywhere in the DOM. The whole
  editor is blank — not just the body. (Reviewer shot: `shots/09-body-empty.png`.)

### Root cause (causal chain, every link opened this session)
1. `schema/lab/controlled-document.ui.yaml` declares an `editor:` block whose three `blocks`
   (identity / classification / document-body) carry `id/kind/label/help` and **no `path`**.
2. `server/src/ui/EditorProjectionService.ts:105-116` `assignSlotsToBlocks()` is the ONLY binding
   mechanism: it binds a slot to a block iff `slot.path.startsWith(block.path)`, and it
   **`continue`s when the block has no `path`** → `slotIds` stays `[]`.
3. `app/src/editor/taptab/documentMapper.ts:173-177` `buildProjectionDocument()` iterates
   `block.slotIds`; an empty list ⇒ `continue` ⇒ that block contributes no field rows.
4. Result: `{type:'doc', content:[]}` → blank editor.

There is **no declarative way** to bind scalar slots to a section block:
- `EditorBlock` (`server/src/ui/types.ts:379-398`) exposes only `path` — documented
  *"For repeater/table: the path to the array field"* — plus `columns`/`visible`. No slot list.
- `EditorSlot` (`:417-444`) has no `block`/`blockId` back-reference.
- `schema/ui/ui-v1.schema.yaml` (the declarative ui-spec contract) has
  `properties: [uiVersion, schemaId, display, form, list, detail]` and `additionalProperties: false`
  — it does not model `editor` at all. UISpecLoader's `validateSpec` validates form/list/detail only,
  so `editor:` is an **undeclared, unvalidated** extension.
- Prefix matching cannot partition sibling scalar paths (`$.id`/`$.state`/`$.docType`/… share no
  non-trivial prefix), so multi-section layout is impossible under the current rule.

Existing tests **encode** the broken behavior: `server/src/ui/EditorProjectionService.test.ts:211-227`
asserts of a budget spec *"header-summary and totals blocks have no path, so no slot assignment"* and
`slotIds` `[]` for the `$.lines` repeater. So the `editor:` path is non-functional for section-style
documents generally (budget.ui.yaml has the same shape) — QMS-2 inherited it, QMS-6 mounted it.

### Why this invalidates a prior "resolved"
QMS-1 (a) was classed **resolved** ("use the `markdown` widget on an `editor.blocks` slot; NOT via the
form.sections fallback"). That check was about the WIDGET (markdown passes through
`projectSlotsFromEditorConfig` untouched) — it never checked the **block→slot binding**, which does not
work. QMS-2 authored the ui.yaml on that guidance and its test
(`server/src/schema/ControlledDocumentSchemas.test.ts:243-285`) asserts only that the body slot EXISTS
in `spec.editor.slots` and that no `UNSUPPORTED_WIDGET` diagnostic is emitted — it never asserts
`block.slotIds`. So the defect passed both.

### Counter-evidence that the data-fallback path DOES work (my own live check)
`CAL-DEMO-GC` (calibration-record, no `editor:` block ⇒ `form.sections` fallback ⇒
`assignSlotsToBlocksFromSections` binds by section membership) **renders all its fields live**:
Identity/ID `CAL-DEMO-GC`, Equipment `EQP-DEMO-GC`, Status `Pass`, Performed By `PER-DEMO-AUTHOR`,
Notes text. `app/src/editor/taptab/extensions/WidgetRenderer.tsx:324-325` renders BOTH `textarea` and
`markdown` as `<RichTextField>` — and `controlled-document.ui.yaml`'s form fallback already declares
`body` as `textarea`. So a rich-text body is achievable on the working path today.

### Remedy options for the architect (I did NOT pick one — this is a design decision)
- (i) **Platform**: add a declarative block↔slot binding (e.g. `block.slots:[ids]` or `slot.block:id`),
  project it in `EditorProjectionService`, model `editor` in `schema/ui/ui-v1.schema.yaml`, and update
  the binding tests. Enables the multi-section layout both QMS-2 and budget intend.
- (ii) **Data-only**: drop the `editor:` block from `schema/lab/controlled-document.ui.yaml` and rely on
  the existing `form:` fallback (body already `textarea` → RichTextField). Reverts QMS-1(a)'s
  "not via fallback" guidance and QMS-2's editor assertions; yields a single-column form layout.
- (iii) **Data hack**: keep one editor block with `path: "$."` — binds all 9 slots into one block
  (code-derived: `'$.body'.startsWith('$.')`), keeping the `markdown` widget; collapses the three
  declared sections into one. Not runtime-verified this tick.

QMS-6 must not absorb any of these. Whichever is chosen re-opens QMS-2's artifact (and its tests), so
this belongs to the architect / Brad.

---

## FINDING 2 — FALSIFIED: the reviewer's Defect 2 is a false positive
The reviewer reported *"CAL-DEMO-GC not discoverable via the Calibrations tab or direct URL (404)"*
(`shots/06-trr-demo-open.png`). **Not true.** My own checks:
- `GET /api/records?kind=calibration-record&limit=100` → 200 with `CAL-DEMO-GC` (also 200 through the
  :5192 proxy).
- Live: the Calibrations tab lists `CAL-DEMO-GC` / tag `calibration-record`; opening it renders all
  fields, with **no** `[data-testid="document-control-bar"]` and no sign-off text.
So Flow E step 11 PASSES; the reviewer likely sampled the tab before its fetch settled. Recorded, not
acted on. (This is a second harness-reliability data point for the reviewer profile.)

---

## BLOCKER B — UNCHANGED, still needs Brad
`USR-LOCAL-ADMIN` (holder of reviewer+approver) has no credential — verified independently:
`/home/brad/.computable-lab/auth/credentials.json` contains **only** `USR-BRAD`; `USR-LOCAL-ADMIN`
exists as a record (HTTP 200) but has no credential entry. So the reviewer signature cannot be minted:
`POST /signatures` needs the session user's password, and `USR-BRAD` is the SOP author (correctly
denied by `requires_different_person`). Consequently these acceptance rows remain **unverified**:
correct-password → `approved`; the second gate `approved→effective`; wrong-password rejection;
same-person denial message; the three stale/content/target probes (delta D6–D9). Brad's documented
`POST /auth/set-password` step (QMS-7 owns the runbook) clears this. I did not fabricate a credential.

---

## What the gate DID establish (real receipts, worth keeping)
`/registry` loads and survives reload; Documents tab lists the SOP with tag `controlled-document`;
`draft→in_review` with **no** password modal; `Approve` **renders** in `in_review` (the round-2 fix
holds) and opens **exactly one** modal ("Sign to move to approved", action `approved`); Cancel sends
nothing and the state is unchanged; TRR-DEMO-1 opens with no lifecycle chrome; /lab "Documents" pill
resolves to controlled-document records; fixture restored to `draft` (confirmed by me via the API).
No console errors. Shots in the receipt dir above.

## Environment facts for Brad (carried, not fixed)
1. **The lane stack is still NOT data-isolated.** The backend answering :3092 (pid **1233556**, cwd
   `/mnt/vast/home/brad/git/cl-integration-1/server`) has **no `CL_DATA_DIR`**, so it resolves
   `dataDir: ${CL_DATA_DIR:-~/.computable-lab}` = **Brad's live data dir**. This tick's review appended
   demo audit events there (A4 covers append-only demo effects). `.run/backend.pid` is stale (says
   1234060). A clean `cl-lane-stack.sh 1 restart` re-points it at `/home/brad/.computable-lab-lane1`
   (exists, but has NO data repo / fixtures yet) — so it cannot be done mid-review without re-seeding.
2. `wt/qms-6-lane1-20261003T1510` (`9adb7bbe`) and `wt/qms-6-fix1-lane1-20261003T1510` (`8b7ada9b`) are
   fully merged into the trunk and can be pruned once QMS-6 closes.
3. `pnpm install --frozen-lockfile` still fails on this trunk (`server/package.json` adds
   `@aws-sdk/client-s3` with no lockfile regen) — pre-existing.

## Next ready task
QMS-6 is blocked on an architect/Brad decision (Finding 1) plus Brad's credential step (Blocker B).
QMS-7 stays blocked behind QMS-6. No lane-1 item is dispatchable until the architect re-scopes
Finding 1.
