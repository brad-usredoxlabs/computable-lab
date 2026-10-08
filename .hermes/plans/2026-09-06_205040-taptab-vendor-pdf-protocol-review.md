# TapTab-native Vendor-PDF Protocol Review (fold the extractor → rich editor into one surface)

## Goal
Replace the current `ProtocolCandidatePreview` step-list in the vendor-PDF review page's right pane with the existing TapTab protocol authoring surface — a resizable 40:60 PDF:TapTab split where the extraction output lands as a semi-structured rich-text protocol (Materials / Equipment / Labware / Steps / Provenance-as-collapsed-disclosure sections) that the biologist reviews, edits, and saves (or saves-as).

## Current context / assumptions (verified by reading the code)
- The right pane of `app/src/ingestion/VendorPdfReviewPage.tsx` (route `/ingestion/vendor-pdf/:recordId`) shows the candidate via `ProtocolCandidatePreview` (`app/src/event-editor/protocol-builder/ProtocolCandidatePreview.tsx`): an ordered step list with on/off toggles + heuristic override fields. It is NOT a rich-text editor. The left pane renders the PDF (pdfjs canvases) with a plain-text fallback.
- **TapTab already exists and is production surface**: `ProjectionTapTabEditor` (`app/src/editor/taptab/TapTabEditor.tsx`) renders a `blocks`/`slots` projection against a `data` payload. It is mounted read-only on `/lab/:category/:entityId` and editable in `DetailPane`/`SlideOverEditor`. No code ships TapTab into the vendor-review page today.
- **A protocol authoring UI spec already exists** at `schema/workflow/protocol.ui.yaml`: sections for Title, Purpose (prose), `roles.materialRoles` (`protocol-material-roles`), `roles.labwareRoles` (`protocol-labware-roles`), `roles.instrumentRoles` (`protocol-equipment-roles`), `steps` (`protocol-step-roles`), `humanStepsText` (prose), Notes (prose).
- **The authoring widgets already exist and are registered** in `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx`, dispatched from `app/src/editor/taptab/extensions/WidgetRenderer.tsx` (lines ~185-199): `ProtocolMaterialRolesWidget`, `ProtocolLabwareRolesWidget`, `ProtocolEquipmentRolesWidget`, `ProtocolStepRolesWidget`, `ProtocolProseAuthoringWidget`. `ProtocolStepRolesWidget` renders an editable numbered list with remove/add + per-step mention editor (`ProtocolMentionEditor`).
- **To get a protocol projection client-side without a persisted record**, `apiClient.getEditorDraftProjection(schemaId)` (`app/src/shared/api/client.ts` ~1889, `POST /ui/schema/:schemaId/editor-draft`, route `server/src/api/routes.ts:303`) returns `{blocks, slots}` for create mode from the ui spec. Pass `data` = the mapped protocol payload. (Draft projection payload may need `kind: 'protocol'`; verify the returned `slots` cover the `protocol.ui.yaml` sections.)
- **The extraction candidate shape** (`app/src/types/ai.ts`): `AiProtocolCandidateSummary = { title, scope?, source?, materials?, labware?, equipment?, steps?, diagnostics? }`, items `AiProtocolCandidateItemSummary = { label, role?, normalizedId?, notes?, evidence?, confidence? }`, steps `AiProtocolCandidateStepSummary = { stepNumber?, title?, text, materials?, labware?, equipment?, notes?, evidence?, confidence?, uncertainty? }`. Evidence anchors `AiProtocolCandidateEvidenceAnchor = { pageNumber?, snippet?, context?, sectionId?, stepNumber? }`.
- **The protocol record shape** (`schema/workflow/protocol.schema.yaml`): `kind`, `recordId`, `title`, `steps[]` (required; steps `stepId/label/ordinal/kind` + `description`, `notes`, `isOptional`), `roles.materialRoles[]` (`roleId` required), `roles.labwareRoles[]` (`roleId` required), `roles.instrumentRoles[]` (`roleId` required), `humanStepsText` string. Step `kind` enum: `add_material|transfer|mix|wash|incubate|read|harvest|other`.
- **Provenance today is per-step text-only** in `ProtocolCandidatePreview`; the tapTab `ProtocolStepRolesWidget` shows only `description` (+ mentions). There is NO schema field on `ProtocolStep` for page provenance yet, so provenance must ride either `notes` (legit) or a new optional field (see Phase 4).
- **Two buttons differ** in `app/src/ingestion/VendorPdfWorkflowTab.tsx` (lines 108-123): a primary "Review" (`recent-extract-*`) and a redundant secondary "View" (`recent-view-*`) — both call the same `openReview(recordId)`. Task 1 removes "View".
- The engine also emits diagnostics/candidate via `server/src/ingestion/vendor-protocol/*` (Zymo normalizer etc.) but the review page consumes `/protocol-builder/extract` (via `ExtractionPanel` pattern) — keep that wire path, map its `candidate` locally.

## Architecture / proposed approach
Reuse the **existing TapTab protocol authoring surface** instead of building a new editor. Three connected changes:

1. **A pure candidate→protocol mapper** (`candidateToProtocolPayload`) turning `AiProtocolCandidateSummary` into the `protocol.schema.yaml` record shape: `{ kind, recordId, title, steps[], roles:{materialRoles,labwareRoles,instrumentRoles}, humanStepsText }`. Materials→`materialRoles`, labware→`labwareRoles`, equipment→`instrumentRoles`, steps→`steps` (with `stepId/ordinal/kind/label/description/notes`), candidate step evidence→`notes` provenance line (Phase 4 makes it a real field). Pure, unit-testable, no I/O.
2. **Render TapTab in the review page's right pane** mounted on a flex splitter: `ProjectionTapTabEditor` fed by `apiClient.getEditorDraftProjection(protocolSchemaId)` + `data: candidateToProtocolPayload(...)`. A split handle lets the biologist drag the 40:60 PDF:TapTab ratio.
3. **Fold step on/off into the editor** as `ProtocolStepRolesWidget` reads/writes `isOptional` (a per-step checkbox) instead of the separate skip-set. Add Save / Save As buttons that POST/PUT the edited payload via `apiClient.createRecord/updateRecord`.

Phases are independent and each lands green + committed; TDD per task.

---

## Phase 1 — Remove the redundant "View" button (delete dead UI)

### Task 1 — Drop "View", keep "Review"
File: `app/src/ingestion/VendorPdfWorkflowTab.tsx`. In the actions block (lines 107-124) delete the second button (the `recent-view-${r.recordId}` one, lines 116-123). Keep only:
```tsx
<div className="vendor-pdf-workflow__item-actions">
  <button
    type="button"
    className="vendor-pdf-workflow__item-btn vendor-pdf-workflow__item-btn--primary"
    data-testid={`recent-extract-${r.recordId}`}
    onClick={() => openReview(r.recordId)}
  >
    Review
  </button>
</div>
```
TDD: update `app/src/ingestion/VendorPdfWorkflowTab.test.tsx` — remove the `View button routes to the review page` case (it asserts `recent-view-*`). Run `npx vitest run src/ingestion/VendorPdfWorkflowTab.test.tsx` → 4 tests pass (was 5). Commit: `chore(ingestion): drop redundant View button; Review is the single surface`.

---

## Phase 2 — Candidate → protocol payload mapper

### Task 2 — New file `app/src/ingestion/candidateToProtocolPayload.ts` (pure mapper, TDD)
Create the mapper as a **pure function** (no imports from client/api — it must be trivially unit-testable).

```ts
// app/src/ingestion/candidateToProtocolPayload.ts
import type {
  AiProtocolCandidateSummary,
  AiProtocolCandidateItemSummary,
  AiProtocolCandidateStepSummary,
} from '../types/ai'

export interface MappedProtocolPayload {
  kind: 'protocol'
  recordId: string
  title: string
  steps: Array<{
    stepId: string
    ordinal: number
    kind: 'add_material' | 'transfer' | 'mix' | 'wash' | 'incubate' | 'read' | 'harvest' | 'other'
    label: string
    description: string
    notes?: string
    isOptional?: boolean
  }>
  roles: {
    materialRoles: Array<{ roleId: string; description: string; allowedMaterialIds?: string[] }>
    labwareRoles: Array<{ roleId: string; description: string; expectedLabwareKinds?: string[] }>
    instrumentRoles: Array<{ roleId: string; description: string; allowedInstrumentIds?: string[] }>
  }
  humanStepsText?: string
}

function slugId(label: string): string {
  const s = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return s.replace(/^-+|-+$/g, '') || 'role'
}

function stepKindFrom(title: string | undefined, text: string): MappedProtocolPayload['steps'][number]['kind'] {
  const t = `${title ?? ''} ${text}`.toLowerCase()
  if (/(incubat|heat|room temp|^?temp|thermal)/.test(`${t} `)) return 'incubate'
  if (/(centrif|spin|pellet)/.test(`${t} `)) return 'harvest'
  if (/(wash)/.test(`${t} `)) return 'wash'
  if (/(add|pipette|dispense|load|aliquot)/.test(`${t} `)) return 'add_material'
  if (/(transfer|move|pour|decant|split)/.test(`${t} `)) return 'transfer'
  if (/(mix|vortex|stir|resuspend|homogen)/.test(`${t} `)) return 'mix'
  if (/(read|measure|scan|assign|quantify|detect)/.test(`${t} `)) return 'read'
  return 'other'
}

export function candidateToProtocolPayload(
  candidate: AiProtocolCandidateSummary,
  recordId: string,
  humanStepsText?: string,
): MappedProtocolPayload {
  const itemRole = (items: AiProtocolCandidateItemSummary[] | undefined, idKey: 'allowedMaterialIds' | 'expectedLabwareKinds' | 'allowedInstrumentIds') =>
    (items ?? []).map<Record<string, unknown>>((it) => {
      const roleId = slugId(it.normalizedId ?? it.role ?? it.label)
      const row: Record<string, unknown> = { roleId, description: it.label }
      if (it.normalizedId) row[idKey] = [it.normalizedId]
      return row
    })

  const steps = (candidate.steps ?? []).map((st, i) => {
    const label = (st.title && st.title.trim())
      ? st.title.trim()
      : (st.text && st.text.trim() ? st.text.trim().slice(0, 80) : `Step ${i + 1}`)
    return {
      stepId: `step-${i + 1}`,
      ordinal: i + 1,
      kind: stepKindFrom(st.title, st.text),
      label,
      description: st.text,
      ...(Array.isArray(st.notes) && st.notes.length > 0 ? { notes: st.notes.join('. ') } : {}),
      ...(Array.isArray(st.evidence) && st.evidence.length > 0
        ? { notes: ([] as string[]).concat(
            Array.isArray(st.notes) ? st.notes : [],
            st.evidence.map((e) => e.pageNumber ? `page ${e.pageNumber}` : 'page ?'),
          ).join(' · ') }
        : {}),
    } as MappedProtocolPayload['steps'][number]
  })

  return {
    kind: 'protocol',
    recordId,
    title: candidate.title ?? 'Untitled protocol',
    steps,
    roles: {
      materialRoles: itemRole(candidate.materials, 'allowedMaterialIds'),
      labwareRoles: itemRole(candidate.labware, 'expectedLabwareKinds'),
      instrumentRoles: itemRole(candidate.equipment, 'allowedInstrumentIds'),
    },
    ...(humanStepsText ? { humanStepsText } : {}),
  }
}
```
TDD (`app/src/ingestion/candidateToProtocolPayload.test.ts`): (1) materials→`materialRoles` with `roleId`/`description`/`allowedMaterialIds`; (2) equipment→`instrumentRoles`, labware→`labwareRoles`; (3) steps map to `stepId step-N`, `ordinal 1..n`, `kind` inferred (`'incubate at 37C'`→`incubate`, bare→`other`), `label` = `title` fallback `text.slice(0,80)`; (4) evidence page number lands in `notes` (`'page 5'` present); (5) empty candidate → `{steps:[], roles:{materialRoles:[],labwareRoles:[],instrumentRoles:[]}}` with title fallback. Run `npx vitest run src/ingestion/candidateToProtocolPayload.test.ts` → 5 pass. Commit: `feat(ingestion): candidate→protocol payload mapper`.

---

## Phase 3 — TapTab in the review page right pane + resizable split

### Task 3 — Mount `ProjectionTapTabEditor` in `VendorPdfReviewPage`
File: `app/src/ingestion/VendorPdfReviewPage.tsx`.
- Add a right-pane state: after `handleExtract` sets `candidate`, also compute `mapped = candidateToProtocolPayload(candidate, 'DRAFT-' + recordId, sourceText)` and store it in a `protocolPayload` state.
- Fetch the draft projection once: `apiClient.getEditorDraftProjection('https://computable-lab.com/schema/computable-lab/protocol.schema.yaml').catch(() => null)` (constant `PROTOCOL_SCHEMA_ID`). Keep `{projection}` state; if it resolves, render:
```tsx
{projection ? (
  <ProjectionTapTabEditor
    blocks={projection.blocks}
    slots={projection.slots}
    data={protocolPayload}
    onUpdate={({ __changed = false, payload } as { __changed?: boolean; payload: Record<string, unknown> }) => {
      setProtocolPayload(payload)
    }}
  />
) : (
  <ProtocolCandidatePreview candidate={candidate} ... /> /* existing fallback */
)}
```
> Note: `ProjectionTapTabEditor`'s `onUpdate` signature is `(serializedPayload, dirty)` (see `TapTabEditorProps`/`OnSerializedChangeCallback` in `taptab/types.ts`). Wire it as `(serialized, dirty) => { if (dirty) setProtocolPayload(serialized) }`. Read-once; the following step adds Save.
- Import `ProjectionTapTabEditor` from `../editor/taptab` and `candidateToProtocolPayload` from `./candidateToProtocolPayload`.
Verify: `npm run typecheck -w app` clean; `npx vitest run src/ingestion/VendorPdfWorkflowTab.test.tsx` still green.

### Task 4 — Resizable left/right split (40:60 default, drag handle)
File: `app/src/ingestion/VendorPdfReviewPage.tsx` (+ `VendorPdfReviewPage.css`).
- Replace the fixed `.vpdf-review__panels` flex with a measured two-pane layout: `leftPct` state (default 40). Left pane `flex: '0 0 ' + leftPct + '%'`, right pane `flex: 1`. Add a drag handle as a thin vertical bar between them; on `pointerdown` → capture start x + start pct, on `pointermove` update `leftPct`, `pointerup` ends. Guard with `onDragStart`/`onDragEnd` (or a `dragging` state) and clamp `leftPct` to `[20, 70]`.
- CSS: give the handle `position:absolute`/full-height, `cursor: col-resize`, and set `touch-action: none`. Keep the existing `.vpdf-review__left`/`__right` internals; only their widths change.
- Add a small label overlay in the handle ("PDF | Editor") as a UX affordance.
Verify: `npm run typecheck -w app`. Manual/E2E later in Phase 6.

### Task 5 — Save / Save As
File: `app/src/ingestion/VendorPdfReviewPage.tsx`. Add two buttons in the header (visible when `protocolPayload`):
- **Save**: `apiClient.updateRecord(protocolPayload.recordId, { ...protocolPayload })` if `isSaved` else `createRecord`. To keep it simple and schema-correct, mint the recordId once on first save: `const recId = 'PRT-' + slugify(title) + '-' + shortUuid()`; on Save, `createRecord({ payload: { ...protocolPayload, recordId: recId } })` and set `isSaved = true`; subsequent clicks `updateRecord(recId, {payload})`. Add minimal `saved` / `saveError` state + toast text.
> Verify whether `createRecord`/`updateRecord` client signatures expect the envelope or raw payload: check `app/src/shared/api/client.ts` `createRecord`/`updateRecord` and pass the documented arg shape. If they expect `{recordId, payload}`, spread accordingly.
- **Save As**: always `createRecord` with a fresh recordId (copy).
Keep these thin and real — not stubs. Verify `npm run typecheck -w app`.

---

## Phase 4 — Provenance as a hidden, collapsed disclosure in the editor

Context: the current per-step provenance is text-only, embedded in `notes` (Task 3's mapper). The goal is a dedicated, app-prefilled, collapsed "view provenance" disclosure inside the TapTab step widget.

### Task 6 — Add an optional `provenance` field to `ProtocolStep` (schema + serializers)
File: `schema/workflow/protocol.schema.yaml`. In the `ProtocolStep` `$defs` (around line 749), add an optional field (additive — validates but never blocks):
```yaml
      provenance:
        type: array
        description: "App-prefilled source anchors (page/section) for this step, shown collapsed in the editor. Advisory; not execution truth."
        items:
          type: object
          additionalProperties: false
          required: [ anchorId ]
          properties:
            anchorId: { type: string }
            pageNumber: { type: integer, minimum: 1 }
            sectionId: { type: string }
            snippet: { type: string }
```
Because `$defs/StepAddMaterial` etc. use `additionalProperties: false` at their level, verify the `oneOf` step variants don't re-collapse `provenance`. If a step variant (e.g. `StepOther`) sets `additionalProperties:false` and forbids it, add `provenance` to that variant too (or rely on the base — confirm by validating a fixture). Run a schema-validate snippet (see Task 7) to prove a step with `provenance` passes.

### Task 7 — Thread provenance through the mapper
`app/src/ingestion/candidateToProtocolPayload.ts`: rather than textual page numbers in `notes`, emit a real `provenance` array on each step:
```ts
provenance: (st.evidence ?? []).map((e, idx) => ({
  anchorId: `src-${i}-${idx + 1}`,
  ...(e.pageNumber ? { pageNumber: e.pageNumber } : {}),
  ...(typeof e.sectionId === 'string' ? { sectionId: e.sectionId } : {}),
  ...(typeof e.snippet === 'string' ? { snippet: e.snippet } : {}),
})),
```
(Keep `notes` strictly for author notes — do not conflate.) Update `MappedProtocolPayload.steps` type + Task 2's tests: evidence page now lands in `provenance[].pageNumber`, and `notes` no longer carries page text.

### Task 8 — Render collapsed provenance in `ProtocolStepRolesWidget`
File: `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx`. In `ProtocolStepRolesWidget`'s step `<li>`, under the `ProtocolMentionEditor`, add a disclosure when the step carries `provenance`:
```tsx
{Array.isArray(step.provenance) && step.provenance.length > 0 ? (
  <details className="taptab-protocol-provenance">
    <summary className="taptab-protocol-provenance__summary">View provenance</summary>
    <ul className="taptab-protocol-provenance__list">
      {step.provenance.map((p) => (
        <li key={p.anchorId}>
          {p.pageNumber ? `Page ${p.pageNumber}` : ''}
          {p.sectionId ? ` · ${p.sectionId}` : ''}
          {p.snippet ? ` — ${p.snippet.slice(0, 80)}` : ''}
        </li>
      ))}
    </ul>
  </details>
) : null}
```
Type the step as `Record<string, unknown>` and read `provenance` defensively. Add CSS in `app/src/editor/taptab/taptab.css` (`.taptab-protocol-provenance`): muted text, small font, triangle disclosure (default `<details>` marker is fine — don't fight it). Collapsed by default (<summary> closed → the triangle affordance the user wants).
TDD (component test `ProtocolAuthoringWidgets.test.ts` — file exists): render `ProtocolStepRolesWidget` with a step carrying `provenance:[{anchorId:'p1',pageNumber:5}]`; assert a "View provenance" summary is present and the page text is NOT visible until the summary is clicked; rerender/click and assert `Page 5` appears.

---

## Phase 5 — Fold step on/off into TapTab (`isOptional`)

### Task 9 — `isOptional` checkbox in `ProtocolStepRolesWidget`
File: `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx`. In each step `<li>`, above the `ProtocolMentionEditor`, add a toggle bound to `isOptional`:
```tsx
<label className="taptab-protocol-step-toggle">
  <input
    type="checkbox"
    checked={Boolean(step.isOptional)}
    onChange={(e) => {
      const next = steps.map((s, idx) => (idx === index ? { ...s, isOptional: e.target.checked } : s))
      onCommit(next)
    }}
  />
  Optional
</label>
```
This replaces the review page's separate `skippedSteps` concept: an "optional" step is one the lab may skip, which is the semantic of `isOptional` already in the schema (line 820-824). On the review page, seed `isOptional` from the candidate/skip state if the old skip-set matters (optional; the mapper currently doesn't mark any — acceptable). Keep `onCommit` the source of truth.
TDD (`ProtocolAuthoringWidgets.test.ts`): render a 2-step value where step 2 has `isOptional:true`; assert step 2's checkbox is checked; toggle it off via `fireEvent.click` and assert `onCommit` is called with the step's `isOptional:false`.

### Task 10 — Remove the now-dead separate overrides/togggles path from `VendorPdfReviewPage`
Once TapTab is mounted (Task 3) and `isOptional` is inside the widget (Task 9), the legacy `ProtocolCandidatePreview` fallback + its `skippedSteps`/`overrides` wiring is only a non-projection fallback. Remove the `onToggleStep`/`onOverrideChange`/`skippedSteps`/`overrides` state if the projection always resolves (keep only the `!projection` fallback that renders a read-only candidate). Verify no other importer depends on those props (`rg "onToggleStep|onOverrideChange|skippedSteps" app/src` — ExtractionPanel/ConfigPanel/ProtocolBuilderOrchestrator still use them, so leave the component itself intact; only strip from `VendorPdfReviewPage`).

---

## Phase 6 — E2E + full verification

### Task 11 — E2E for the new review surface + split
New `app/e2e/vendor-pdf-review-taptab.spec.ts` (pattern-match the existing `e2e/vendor-pdf-review.spec.ts`) using the live store + a run with no method:
- go to `/ingestion/vendor-pdf/VPDF-257F57196F6C`, click `vpdf-review-title`; assert a TapTab editor container `.taptab-editor-container` is present (projection resolved) OR the fallback candidate preview.
- assert the split handle exists (`document.querySelector('[data-testid=vpdf-split-handle]')`) and dragging left narrows the PDF pane (measure `.vpdf-review__left` width before/after).
- (deterministic, mocked) with a stubbed candidate: assert Materials/Equipment/Labware sections render (the `protocol-material-roles`/`protocol-equipment-roles`/`protocol-labware-roles` widget chips) and a "View provenance" `<details>` is collapsed until click.
Run: `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5174 npx playwright test e2e/vendor-pdf-review-taptab.spec.ts --config=playwright.cl-e2e.config.ts --project=chromium-ev`. (Note: `playwright.cl-e2e.config.ts` is a local env config for the installed chromium-1243; recreate if removed.)

### Task 12 — Full verification
- `npm run typecheck -w server` and `npm run typecheck -w app` (both clean).
- `npm run test:run -w server` and the app unit suites for changed files:
  - `npx vitest run src/ingestion/candidateToProtocolPayload.test.ts`
  - `npx vitest run src/ingestion/VendorPdfWorkflowTab.test.tsx`
  - `npx vitest run src/editor/taptab/widgets/ProtocolAuthoringWidgets.test.ts`
- Live (browser): open `/runs/RUN-2026-09-06-run-43wx` → the run's Protocol tab search box; type "cellrox" → Ingested PDFs group shows `VPDF-651F03789D80` with Open (not Attach); Open → the review page renders TapTab; Save writes a `PRT-*` protocol; refresh drops the Save As/record from a stale cache (verify via `GET /records?kind=protocol`).

---

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Workflow tab (View removed) | `npx vitest run src/ingestion/VendorPdfWorkflowTab.test.tsx` | 4 pass (was 5) |
| Mapper | `npx vitest run src/ingestion/candidateToProtocolPayload.test.ts` | 5 pass |
| Schema provenance | run a fixture through Ajv (`schema/workflow/protocol.schema.yaml`) with a step carrying `provenance` | valid |
| Authoring widgets | `npx vitest run src/editor/taptab/widgets/ProtocolAuthoringWidgets.test.ts` | provenance disclose + `isOptional` toggle cases pass |
| App typecheck | `npm run typecheck -w app` | clean |
| Server typecheck | `npm run typecheck -w server` | clean |
| E2E | the Task 11 spec | passes against live |

## Risks, tradeoffs, open questions
- **Projection availability**: if `getEditorDraftProjection(protocolSchemaId)` does not return the `protocol.ui.yaml` sections (or requires an existing record), Task 3 must pivot to (a) `getRecordEditorProjection` of a temp record, or (b) pass a hand-built `uiSpec` to the legacy `TapTabEditor`. Confirm early in Task 3 before building Save. This is the biggest unknown.
- **`onUpdate` payload shape**: `ProjectionTapTabEditor` reports `(serializedPayload, dirty)`; confirm the serialized shape matches `protocol.schema.yaml` (role arrays, steps array) before wiring Save — otherwise Save writes a mis-shaped record.
- **Step-`kind` inference is heuristic**: `stepKindFrom` maps keywords; default `other`. Not perfect — acceptable; the biologist edits in TapTab. False `incubate`/`read` may mislead later compilation; keep `other` as the safe default and don't over-magic.
- **Schema strictness**: adding `provenance` to `ProtocolStep` may conflict with the per-variant `additionalProperties:false` oneOfs — must validate a fixture (Task 7) or the record will fail Ajv on Save. If it fights, fall back to riding `notes` (current Task 3 behavior) and skip Tasks 6-7; keep Task 8 rendering from `notes`-embedded text as a `<details>`. Recommend validating first.
- **Turning on/off vs skipping**: the review page's old `skippedSteps` meant "exclude from draft"; `isOptional` means "may skip at execution." These differ. This plan maps on/off → `isOptional` (cheap, schema-native). If the intent was exclude-from-execution entirely, that's a different flag (out of scope — flag it).
- **Save / Save As durability**: uses the record API (create/update) which is the correct path vs hand-editing YAML. Requires the backend's lifecycle/permissions to allow protocol creation from this surface — `createRecord` may need auth headers/`x-user-id`. Verify Task 5 against the running backend; if it 403s, send the `x-user-id: USR-LOCAL-ADMIN` header (as the backfill script does).
- **Scope of "sections"**: Task 3 renders whatever `protocol.ui.yaml` declares (Title/Purpose/Materials/Labware/Equipment/Steps/Human-Text/Notes). The user asked to guarantee Materials/Equipment/Labware/Steps sections — they already exist in the spec; the mapper populates them. If the user wants an explicit "Reagents" section distinct from Materials, add a section to `protocol.ui.yaml` + a `reagents` field — out of scope here; note as follow-up.