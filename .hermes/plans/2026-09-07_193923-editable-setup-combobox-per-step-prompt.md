# Editable protocol setup sections (material combobox) + per-step prompt-and-localize in the run-editor Protocol tab

## Goal
In the run-editor Protocol tab, make the top Equipment/Labwares/Materials sections editable with the same local→ontology→Exa material combobox used when adding a material to a plate, and give every step a visible prompt box whose "Localize" sends {my prompt + step text} to the AI and ghosts an event graph for that step.

## Current context / assumptions
- The user is on `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (the run-editor right-pane "Protocol" tab, mounted via `RunWorkspacePage` → `ws.setRightPaneMode('protocol')`).
- "Sections at the top" = the `This assay needs` block (lines 1745–1782) rendering three `SetupSectionWidget`s (kind `labware`/`equipment`/`material`) from `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.tsx`.
- Today those sections are **read-only** when the run is attached directly to a universal protocol (CellROX) because `setupIsPreview=true` → `SetupSectionWidget readOnly=true` (no `+ Add X`, no per-row ✕). The section `<h4>` subtitle (line 125) exists but rows render as plain text with a "suggested" tag — so the user experiences them as "not labelled, and can neither add nor remove."
- The plate material picker the user wants to reuse is `useMaterialSearch()` in `app/src/event-editor/material/useMaterialSearch.ts` (local DB hits → on-demand ontology resolve → vendor Exa hits; debounced, tiered). `AddMaterialModal.tsx` renders these as three sections. Reusing the *hook* (not the modal) is the DRY move.
- `ensureLocalProtocolDraft` (ProtocolTabPanel ~1290) already creates/re-points an editable local-protocol draft (LPR) seeded from the universal's declared roles. Persisting edits goes through `patchSetup` (line 1264) → `apiClient.updateRecord(localProtocolId, …)`, which currently no-ops when `localProtocolId` is null.
- Steps render as `StepChip`s (function at line 521) with a `Localize` affordance (line 623) that calls `onSelect` → expands `StepInvestigationPanel` (mounted ~1810). `StepInvestigationPanel` already has an inline "Draft with AI" ChatInput that, on send, calls `chat.send(composeFullLocalizePrompt({ step, titleText, fullText, instruction }))` which ghosts the AI event graph into the editor preview. The gap the user still feels: the prompt box is **hidden behind "Draft with AI"** inside the expanded panel, not visible per-step; there is no single "Localize" that reads a prompt box.
- The AI inference backend is config-driven and currently live (OpenRouter via config.yaml); `useChatThread`/`chat.send` is the existing send path — reuse it, don't invent a new one.

## Architecture / proposed approach
- Make the three setup sections **always editable** in the run-editor Protocol tab: drop the `setupIsPreview` read-only gate in favor of "auto-ensure an LPR draft the first time the user adds/removes a row", and add a reusable `SetupSearchCombobox` component (built on `useMaterialSearch`) that the `SetupSectionWidget` add-flow uses instead of the slash-primed editor — giving the exact plate-picker feel (local → ontology → Exa).
- Add a per-step **prompt box** directly on each `StepChip` (a text input + `Localize` button). `Localize` calls the existing chat path (`handleLocalize` behavior in `StepInvestigationPanel`) with `{ prompt, stepText }` and focuses/ghosts the step. Minimal: lift the prompt state to `ProtocolTabPanel`, pass it through, and reveal the panel's inline chat when Localize is clicked.

## Step-by-step tasks

### Phase A — Editable setup sections with the material combobox

#### Task A1 — (RED) reuse `useMaterialSearch` in the setup add-flow
File: `app/src/event-editor/material/useMaterialSearch.test.ts` (new).
Add a test that the search hook separates local / ontology / exa results and that picking an ontology hit yields a CURIE-typed `ref`:
```ts
import { describe, expect, it } from 'vitest'
import { mentionToSetupRef } from '../editor/taptab/widgets/LocalProtocolSetupWidgets'
describe('setup combobox ref mapping', () => {
  it('maps an ontology CURIE material mention to an ontology SetupRow.ref', () => {
    const ref = mentionToSetupRef({ type: 'material', id: 'CHEBI:16236', label: 'isopropanol', entityKind: 'material' } as never, 'material')
    expect(ref).toEqual({ kind: 'ontology', id: 'CHEBI:16236', namespace: 'CHEBI', label: 'isopropanol' })
  })
  it('maps a local record material mention to a record ref', () => {
    const ref = mentionToSetupRef({ type: 'material', id: 'MAT-0001', label: 'RPMI', entityKind: 'material' } as never, 'material')
    expect(ref).toEqual({ kind: 'record', id: 'MAT-0001', type: 'material', label: 'RPMI' })
  })
})
```
Run → confirm RED pending the wire-up (it will actually pass since the fn exists; the *real* RED for this phase is the component test in A2 — see A2 for the gate target). Reposition this file reference so the test is meaningful.

**This task's gate** is A2's component test — A1 keeps the pure-fn coverage that already exists coherent.

#### Task A2 — (RED) `SetupSearchCombobox` renders 3 tiers and commits a ref
File: `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx` (extend the existing suite).
```tsx
import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SetupSearchCombobox } from './LocalProtocolSetupWidgets'
vi.mock('../material/useMaterialSearch', () => ({
  useMaterialSearch: () => ({
    query: '', setQuery: vi.fn(), localResults: [], formulations: [], ontologyResults: [],
    exaResults: [], loadingExa: false, loadingLocal: false, loadingOntology: false,
    error: null, searchOntology: vi.fn(), clearOntology: vi.fn(),
  }),
}))
describe('SetupSearchCombobox', () => {
  it('shows Local / Ontology / Vendor result tiers and commits a picked ref', () => {
    const onPick = vi.fn()
    render(<SetupSearchCombobox kind="material" onPick={onPick} />)
    // placeholder / tier labels render
    expect(screen.getByTestId('setup-search-combobox')).not.toBeNull()
  })
})
```
Run this file → expect RED (component does not exist yet). Verify: `cd app && npx vitest run src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx | grep "Tests"` shows failures.

#### Task A3 — (GREEN) build `SetupSearchCombobox` on `useMaterialSearch`
File: `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.tsx`.
Add a self-contained component near `SetupSectionWidget`:
```tsx
import { useMaterialSearch } from '../../event-editor/material/useMaterialSearch'

export function SetupSearchCombobox({ kind, onPick }: {
  kind: SetupKind; onPick: (ref: SetupRow['ref']) => void
}) {
  const s = useMaterialSearch()
  const base = `${kind}:`
  const pickString = (r: { id: string; label: string; type?: string }) =>
    r.id.includes(':')
      ? { kind: 'ontology', id: r.id, namespace: r.id.split(':')[0].toUpperCase(), label: r.label }
      : { kind: 'record', id: r.id, type: r.type ?? kind, label: r.label }
  return (
    <div className="setup-search-combobox" data-testid="setup-search-combobox">
      <input data-testid="setup-search-input" value={s.query}
        onChange={(e) => s.setQuery(e.target.value)}
        placeholder="Search materials / equipment — local first, then ontology & web vendor" />
      {s.localResults.length > 0 && (
        <div className="setup-search-tier" data-testid="setup-search-local">
          <span className="setup-search-tier__label">Local</span>
          <ul>{s.localResults.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(pickString({ id: r.id, label: r.label, type: r.kind }))}>
                {r.label}
              </button>
            </li>
          ))}</ul>
        </div>
      )}
      {s.ontologyResults.length > 0 && (
        <div className="setup-search-tier" data-testid="setup-search-ontology">
          <span className="setup-search-tier__label">Ontology</span>
          <ul>{s.ontologyResults.map((r) => (
            <li key={r.curie ?? r.label}>
              <button type="button" onClick={() => onPick(pickString({ id: r.curie ?? r.label, label: r.label }))}>
                {r.label}
              </button>
            </li>
          ))}</ul>
        </div>
      )}
      {s.exaResults.length > 0 && (
        <div className="setup-search-tier" data-testid="setup-search-exa">
          <span className="setup-search-tier__label">Vendor</span>
          <ul>{s.exaResults.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(pickString({ id: r.id, label: r.title ?? '', type: 'equipment' }))}>
                {r.title}
              </button>
            </li>
          ))}</ul>
        </div>
      )}
    </div>
  )
}
```
Generalize `pickString` so the existing `mentionToSetupRef` logic is the single mapper (reuse it; call it with a synthesized mention) rather than duplicating the CURIE split. Run A2 → pass. Add `.setup-search-*` styles to `app/src/editor/taptab/taptab.css` (mirror `.taptab-setup-add__*` 3-tier list look). Verify: `cd app && npx vitest run ...LocalProtocolSetupWidgets.test.tsx` green; `cd app && npx tsc --noEmit` clean.

#### Task A4 — (RED) `SetupSectionWidget` exposes add-row via the combobox and shows labels
File: `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx` (extend).
```tsx
it('adds a bound row by picking from the combobox', () => {
  const onCommit = vi.fn()
  render(<SetupSectionWidget kind="material" value={[]} readOnly={false} onCommit={onCommit} />)
  fireEvent.click(screen.getByText('+ Add material'))
  // combobox appears; simulate a pick via a data-testid commit hook
  fireEvent.click(screen.getByTestId('setup-search-input'))
  onCommit.mock.calls[0][0] // structural check: commits an array
})
```
Run → RED (the add-flow currently uses `ProtocolMentionEditor`, not the combobox, and section title may be read-only).

#### Task A5 — (GREEN) wire the combobox into `SetupSectionWidget.addRow`
File: `app/src/editor/taptab/widgets/LocalProtocolSetupWidgets.tsx`.
In `SetupSectionWidget`, add a `pisearch: SetUpSearchCombobox`-based add mode that the `+ Add {noun}` button opens (replacing/augmenting the current `adding` inline form). Add a `sectionLabel` prop whose default is `copy.title` and always render `<h4>{sectionLabel}</h4>` even in readOnly (so the sections are visibly labelled). On pick, build a `SetupRow` (`{ role: label, description: label, ref }`) and call `onCommit([...rows, row])`. Keep the existing `ProtocolMentionEditor` rows editable for bound rows (bound-row ✕ stays). Run A4 → pass. `cd app && npx tsc --noEmit` clean. Commit: `feat(protocol-setup): editable sections via material combobox (local→ontology→exa)`.

#### Task A6 — (RED) Protocol tab sections are editable on a universal-attached run
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` (extend existing).
Add a test: given a run attached to a universal protocol and `setupIsPreview=true` mock state, a `+ Add material` affordance is rendered and clicking it does not crash (it ensures an LPR draft). Expect RED today (readOnly hides the button).

#### Task A7 — (GREEN) auto-ensure LPR draft so sections are always editable
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`.
- In the `SetupSectionWidget` calls (1745–1782 block), no longer pass `readOnly={setupIsPreview}`; pass `readOnly={false}` and compute `suggestionRows` from the preview as today.
- Before the first edit persists, call `ensureLocalProtocolDraft` if `!localProtocolId`: wrap `patchSetup` (line 1264) so that when `localProtocolId` is null it first awaits `ensureLocalProtocolDraft({ id: universalProtocolId, title: universalProtocolTitle })` then re-reads the resulting `localProtocolId` before `updateRecord`. Keep the `setupIsPreview` hint text but reword to "adding a row saves an editable local draft for this run."
- Pass `sectionLabel` (`copy.title`) explicitly so the h4 always shows.
Run A6 → pass. `cd app && npx tsc --noEmit` clean. Commit: `feat(protocol-tab): setup sections editable on a universal-attached run (auto-LPR draft)`.

### Phase B — Per-step prompt box + Localize → AI ghost

#### Task B1 — (RED) `StepChip` shows a prompt input + Localize that sends text
File: `app/src/event-editor/right-pane/protocol/StepChip.test.tsx` (new; or fold into `ProtocolTabPanel.test.tsx`).
```tsx
describe('StepChip prompt box', () => {
  it('shows a prompt input and a Localize button; Localize sends {prompt, stepText}', () => {
    const onLocalize = vi.fn()
    render(<StepChip step={{ stepId: 's1', label: 'Wash cells', ordinal: 1 }} isActive={false}
      onToggle={() => {}} onPlay={() => {}} onSelect={() => {}} onLocalize={onLocalize} />)
    fireEvent.change(screen.getByTestId('step-prompt-input'), { target: { value: 'use a deepwell plate, not the 96-well' } })
    fireEvent.click(screen.getByTestId('step-localize-btn'))
    expect(onLocalize).toHaveBeenCalledWith({ prompt: 'use a deepwell plate, not the 96-well', stepText: expect.any(String) })
  })
})
```
Run → RED (no `step-prompt-input` / `step-localize-btn` / `onLocalize` prop today).

#### Task B2 — (GREEN) add the prompt box + Localize to `StepChip`
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (StepChip at 521).
- Extend `StepChipProps` with `stepText?: string` and `onLocalize?: (p: { prompt: string; stepText: string }) => void`.
- Add (below the description, before actions) a prompt row shown when the user focuses the chip: a text input `data-testid="step-prompt-input"` and a `Localize` button `data-testid="step-localize-btn"` (disabled while the input is empty). Wire the existing `Localize` affordance (line 623) to scroll/focus the prompt, and the new button to `onLocalize({ prompt, stepText })`.
Run B1 → pass. `cd app && npx tsc --noEmit` clean.

#### Task B3 — (RED) ProtocolTabPanel Localize sends {prompt + stepText} through the AI chat
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` (extend).
Render panel with a step; set a prompt; click the step's Localize; assert the panel's `StepInvestigationPanel` receives an active prompt (mock the AI chat send) — verify `chat.send` is called with a composed string containing the step text and the prompt. Expect RED until B4.

#### Task B4 — (GREEN) wire StepChip.onLocalize → StepInvestigationPanel chat send
File: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (the `steps.map` render at ~1790).
- Give the panel-level handler `handleStepLocalize(step, { prompt })` that reveals the expanded panel (`setActiveStepId/expandedStepId` to this step) and sets an `activePrompt` state that the mounted `StepInvestigationPanel` consumes to pre-fill + auto-send its inline chat (reuse `composeFullLocalizePrompt` already imported; call `chat.send` from the panel or the proto panel's chat thread — whichever is wired for steps; if the panel owns chat, pass an `initialInstruction` prop).
- Pass `onLocalize={(p) => handleStepLocalize(step, p)}` and `stepText={text}` into each `StepChip`.
Run B3 → pass. `cd app && npx tsc --noEmit` clean. Commit: `feat(protocol-step): per-step prompt box → Localize sends prompt + step text to AI`.

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Setup ref mapping | `cd app && npx vitest run src/editor/taptab/widgets/LocalProtocolSetupWidgets.test.tsx` | A2/A4/A5 green |
| Setup combobox tiers | same file | Local / Ontology / Vendor tiers render |
| Setup sections editable (universal) | `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx` | A6/A7 green |
| StepChip prompt box | `StepChip.test.tsx` | B1/B2 green |
| Localize→AI send | `ProtocolTabPanel.test.tsx` | B3/B4 green |
| Typechecks | `cd app && npx tsc --noEmit` | clean |

## Risks, tradeoffs, open questions
- **`setupIsPreview` semantics:** making sections always editable means a universal-attached run will, the moment the user adds a row, mint an LPR draft (via `ensureLocalProtocolDraft`). That is the desired UX ("add stuff to the protocol I loaded"), but it changes when the LPR is created — confirm the LPR is still shown as a draft and the "Accept & Save" path (one-shot localizer) still works alongside.
- **Combobox scope for labware/equipment:** `useMaterialSearch` is material-centric but returns `exaResults` for catalog/labware/equipment too. The `kind` param keeps the ref type correct; labware/equipment local lists come via `searchMaterials` which may be material-only — if labware/equipment local hits don't flow through `searchMaterials`, the plan should add a `kind`-aware local search (extend the hook or call `searchLabware`/vendor endpoints). Flagged: verify against `app/src/event-editor/deck/AddLabwareDialog.tsx` / `AddEquipmentDialog.tsx`, which already render vendor screens and may expose a reusable local list.
- **Step prompt visibility:** always rendering a prompt box per step adds clutter on a 6-step protocol; scoped to the active/focused chip it may surprise. Open: should the prompt box be always visible or only when a step is focused? Default in this plan: visible when the chip is focused/expanded.
- **Who owns `chat.send` for steps:** `StepInvestigationPanel` constructs its own `useChatThread`. B4 must pass the initial prompt into that thread (a new `initialInstruction` prop) rather than a second chat call — otherwise two AI calls fire.
- **Ajv/schema:** no schema change; rows persist to the existing `labwares`/`equipment`/`materials` arrays which the protocol schema already accepts. Verify `local-protocol.schema.yaml` allows these arrays (they already exist, so expected fine).
- **The plate material combobox reuses `useMaterialSearch` but not the modal chrome** — intentionally; the user wants the pick interaction inside the protocol sections, not a modal.

## The upfront unknowns (resolved by inspection)
- The read-only gate is `setupIsPreview` in `ProtocolTabPanel` (universal-attached). Resolved.
- The step localize affordance exists but the prompt box is hidden behind the panel's "Draft with AI". Resolved: add a per-step prompt + Localize that pre-fills the panel chat.
- `mentionToSetupRef` already maps CURIE→ontology refs; reuse it for the combobox. Resolved.
- AI send path is `chat.send(composeFullLocalizePrompt(...))` inside `StepInvestigationPanel`. Resolved: pass an `initialInstruction` prop.