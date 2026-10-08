# Vendor-PDF protocol review: real role terms + rich-text lists with X/Add motif in TapTab

## Goal
Make the protocol-ingestion TapTab surface (a) populate **real** materials/equipment/labware names (flow cytometer, CellROX Detection Reagent, SYTOX Dead Cell Stain) instead of generic `material:role` / `equipment:role`, and (b) render every list (Materials, Labware/Consumables, Equipment, Steps) as a **rich-text numbered list** with an **X (remove) + Add** motif floating right — matching the nice step behavior the user already sees.

## Current context / verified facts (read the code + hit the live endpoint today)
- **Extraction is LLM-driven and the generic roles are an extraction-quality bug**, not a mapper bug. `server/src/api/handlers/ProtocolBuilderHandlers.ts` → `buildChunkExtractionPrompt` (line 254) asks the model to emit `materials:[...], equipment:[...], steps:[...]` but gives it only a JSON *shape with empty arrays* — no per-item schema, no "give me the real noun" instruction, no prohibition on placeholder role ids.
- **Proven live:** against the exact CellROX PDF text, a single-chunk extract returned **real** names (`CellROX® Green/Orange/Deep Red`, `SYTOX® Blue/Red Dead Cell Stain`, `Flow Cytometer`); but the full multi-chunk browser flow returned generic `material:role` / `equipment:role`. The degradation happens in the **multi-chunk path**: `mergeChunkResults` (line 380) merges per-chunk `materials/labware/equipment` by `label` and does **not** drop placeholder `role`-only items, and does **not** backfill from `steps[].materials/equipment` (which the model DOES populate with real names).
- The candidate types (`app/src/types/ai.ts`): steps carry `materials?: string[]`, `labware?: string[]`, `equipment?: string[]` (line 493-496) — the **real names are already available per-step** even when the top-level lists are generic. This is the gold source to backfill from.
- **Renderer:** `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx`.
  - `ProtocolRoleListWidget` (line 65) renders roles as **chips/pills** via `roleChips()` (359) → `RefBadge` spans inside `.taptab-chips-list` (line 98-108). NOT a rich-text list.
  - `ProtocolStepRolesWidget` (line 139) already renders a proper numbered `<ol>` with per-step `ProtocolMentionEditor` (rich text) and an `x` remove button (line 185) + an "Add" button (line 201). This is the desired motif the user likes.
  - Each `role` object has `{ roleId, description, [allowedKey]: string[] }`. `roleChips()` maps a role → one or more `Ref` badges (one per `allowedKey` id).
  - Removing a role row today: `onRemove={() => commitRoles(roles.filter((_, i) => i !== chip.roleIndex))}` (line 105). To go list-based with an X, we need a per-**role** (not per-chip) remove: `commitRoles(roles.filter((_, i) => i !== roleIndex))`.
- Live repro URL: `http://computable:5174/ingestion/vendor-pdf/VPDF-651F03789D80` (CellROX). Steps extract great; Materials shows `material:role`, Equipment shows `equipment:role`, Labware empty.
- Schema (`server/src/schema/CandidateMapperSchemaConformance.test.ts`) already proves the mapped payload (with `provenance`/`isOptional`) validates. Role arrays require `roleId` unique. No schema change needed.

## Architecture / proposed approach
Two independent fixes, both landed green + committed:

1. **Extraction quality (server):** tighten `buildChunkExtractionPrompt` to demand real noun labels + prohibit placeholder `role` ids, AND harden `mergeChunkResults` to (a) filter out generic placeholder items and (b) **backfill** `materials/labware/equipment` from the union of real names in `steps[].materials/equipment/labware`. This makes the *data* correct at the source.
2. **Renderer (app):** rewrite `ProtocolRoleListWidget` to render roles as an editable rich-text numbered list (mirroring `ProtocolStepRolesWidget`) with an **X** remove and an **Add** control per list — the motif applied uniformly to Materials / Labware / Equipment / Steps.

Pure, testable pieces: a `normalizeCandidateRoles`-style concatenation is a pure function in the server handler; the `ProtocolRoleListWidget` rewrite is a small component with a render test that mocks `ProtocolMentionEditor` (the heavy TipTap dep) via module mock.

---

## Phase 1 — Extraction: real role names (server)

### Task 1.1 — RED: unit test that placeholder roles are dropped + backfilled from steps
File: `server/src/api/handlers/ProtocolBuilderHandlers.test.ts` (new; the handler file already is testable — check for an existing test; if one exists add to it).
Add a test for the merge logic. First make the merge helpers **exported** pure functions so they're testable without firing an LLM. Extract from `ProtocolBuilderHandlers.ts` the predicate + backfill helpers:

```ts
// at module scope in ProtocolBuilderHandlers.ts
export function isGenericRoleLabel(label: string | undefined): boolean {
  const l = (label ?? '').trim().toLowerCase()
  if (!l) return true
  // 'material:role', 'equipment:role', 'labware:role', 'role', 'n/a', 'unknown'
  return /^(material|equipment|labware|reagent|instrument)?(:| )?role$/i.test(l)
      || /^(n\/?a|unknown|tools?|misc)$/i.test(l)
}

export function backfillRolesFromSteps<T extends { label: string }>(
  generic: T[], steps: Array<{ materials?: string[]; labware?: string[]; equipment?: string[] }>,
  kind: 'materials' | 'labware' | 'equipment',
): T[] {
  const out: T[] = generic.filter((x) => !isGenericRoleLabel(x.label))
  const seen = new Set(out.map((x) => x.label.toLowerCase()))
  for (const step of steps) {
    for (const name of step[kind] ?? []) {
      const n = name.trim()
      if (!n || seen.has(n.toLowerCase())) continue
      seen.add(n.toLowerCase())
      out.push({ label: n } as T)
    }
  }
  return out
}
```
Test expectations (write first; RED):
- `isGenericRoleLabel('material:role') === true`, `isGenericRoleLabel('CellROX Green') === false`, `isGenericRoleLabel('role') === true`, `isGenericRoleLabel('flow cytometer') === false`.
- `backfillRolesFromSteps([{label:'material:role'}], [{materials:['CellROX Detection Reagent','SYTOX Dead Cell Stain']}], 'materials')` → exactly `['CellROX Detection Reagent','SYTOX Dead Cell Stain']` (generic dropped, real backfilled).
- `backfillRolesFromSteps([{label:'Flow Cytometer'}], [{equipment:['Flow Cytometer']}], 'equipment')` → `['Flow Cytometer']` (no dupe).
Verify: `cd server && npx vitest run src/api/handlers/ProtocolBuilderHandlers.test.ts` → fail (helpers don't exist).

### Task 1.2 — GREEN: implement + wire into `mergeChunkResults` + `buildChunkExtractionPrompt`
File: `server/src/api/handlers/ProtocolBuilderHandlers.ts`.
1. Add the two exported helpers (Task 1.1 code) near `mergeChunkResults` (after line 476).
2. In `mergeChunkResults` body, replace the material/labware/equipment merge to drop generics and backfill from the merged `allSteps`:
```ts
const materials = backfillRolesFromSteps(
  Array.from(mergedMaterialLabels), // reuse the dedup loop, or rebuild from chunks' materials
  allSteps, 'materials')
```
   Concretely: change the `materials`/`labware`/`equipment` accumulation (lines 419-453) to push all chunk items (no dedup needed — backfill dedups), then call the backfill helper with `allSteps`.
3. In `buildChunkExtractionPrompt` (line 254), strengthen the JSON example so the model emits real nouns + per-step names. Replace the `JSON.stringify({...})` example block (lines 277-286) with:
```ts
JSON.stringify({
  kind: 'vendor-protocol-candidate',
  title: '',
  materials: [{ label: 'CellROX Detection Reagent', role: 'detection-reagent' }],
  labware: [{ label: '96-well plate' }],
  equipment: [{ label: 'Flow Cytometer' }],
  steps: [{ stepNumber: 1, text: 'Add detection reagent.', materials: ['CellROX Detection Reagent'], equipment: ['Flow Cytometer'] }],
}, null, 2),
```
   and add a guard sentence after the example:
```
'IMPORTANT: materials/labware/equipment label MUST be the concrete noun from the text (e.g. "Flow Cytometer", "SYTOX Dead Cell Stain"). NEVER use placeholders like "material:role", "equipment:role", "role", or "n/a". If a section names none, return []. Also list each item you put in the top-level materials/labware/equipment inside the corresponding per-step arrays.'
```
Run Task 1.1 → pass. Verify the handler file compiles: `cd server && npx tsc --noEmit`. Commit: `fix(ingestion): extraction emits real role noun labels + backfills materials/equipment/labware from steps`.

### Task 1.3 — Live verification (real payoff)
Restart the 3001 backend (target the specific PID/port — never blanket pkill). Then re-drive the review page:
- `cd /mnt/vast/home/brad/git/computable-lab && curl -s -H 'x-user-id: USR-LOCAL-ADMIN' -H 'content-type: application/json' -X POST 'http://127.0.0.1:3001/api/protocol-builder/extract' -d "{\"text\":$(python3 -c "import json,sys;print(json.dumps(sys.stdin.read()))" <<< "$(curl -s -H 'x-user-id: USR-LOCAL-ADMIN' 'http://127.0.0.1:3001/api/records/VPDF-651F03789D80' | python3 -c "import sys,json;d=json.load(sys.stdin);p=d.get('record',d).get('payload',{});print(''.join((pg.get('text') or '') for pg in (p.get('extractedText') or [])))"))"}`  → inspect `candidate.materials` / `candidate.equipment`: expect real names like `CellROX Detection Reagent`, `SYTOX Blue Dead Cell Stain`, `Flow Cytometer` (NOT `material:role`/`equipment:role`). Run with a generous timeout (the full doc is multi-chunk).
  - If the raw curl still shows generics, the model is under-instructed further; the backfill-from-steps guarantees the real names appear regardless (steps carry them). Commit regardless once tests + one live run show at least backfill working.

---

## Phase 2 — Renderer: rich-text lists with X + Add (app)

### Task 2.1 — RED: render test for the rewritten role-list widget
File: `app/src/editor/taptab/widgets/ProtocolRoleListWidget.test.tsx` (new).
Mock the heavy TipTap dep so the widget renders in isolation:
```ts
vi.mock('../../shared/taptab/slashMenu', () => ({ MentionNode: () => null, buildSlashMenuExtension: () => null }))
vi.mock('@tiptap/react', () => ({ EditorContent: () => <div data-testid="tip" />, useEditor: () => ({}), Editor: class {} }))
```
Test: render `ProtocolMaterialRolesWidget` with `value=[{roleId:'detection-reagent',description:'CellROX Detection Reagent',allowedMaterialIds:['CL:CellROX']}]`, `readOnly:false`, `onCommit` spy.
- Assert a `.taptab-protocol-role-list` `<ol>` exists (not `.taptab-chips-list`).
- Assert the role label text is present.
- Assert an X button per row (`aria-label` `Remove role 1`); clicking it commits `[]`.
- Assert an "Add" control exists; after clicking it, an editor row appears (`data-testid="tip"` count increases).
Run → confirm failure (current widget renders `.taptab-chips-list`, no `<ol>`).

### Task 2.2 — GREEN: rewrite `ProtocolRoleListWidget` as a rich-text list
File: `app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx`, replace the body of `ProtocolRoleListWidget` (lines 65-137). Render each `role` as an `<li>` with a `ProtocolMentionEditor` (editable description) + an X remove button + an Add row:
```tsx
function ProtocolRoleListWidget({ value, readOnly, onCommit, label, allowedKey, onRecordPatch, getRecordValue }: ProtocolWidgetProps & { label: string; allowedKey: string }) {
  const roles = Array.isArray(value) ? value as Array<Record<string, unknown>> : []
  const [newRole, setNewRole] = useState('')
  // ... keep newRoleMentions, addRole, syncExternalMentions, addButtonRef exactly as-is ...
  const commitRoles = (next: Array<Record<string, unknown>>) => onCommit(next)
  const updateRoleDescription = (index: number, description: string, mentions: SlashMention[]) => {
    const next = roles.map((r, i) => i === index ? { ...r, description } : r)
    commitRoles(next)
    syncExternalMentions(mentions)
  }
  const visible = roles.map((r, idx) => ({ role: r, label: String(r.description ?? r.roleId ?? ''), idx }))
  return (
    <div className="taptab-protocol-list taptab-protocol-role-list">
      {visible.length === 0 && <span className="taptab-widget-empty">No {emptyRoleLabel(label)}</span>}
      {visible.length > 0 && (
        <ol className="taptab-protocol-numbered-list">
          {visible.map(({ role, label, idx }) => (
            <li className="taptab-protocol-step-item" key={String(role.roleId ?? idx)}>
              <div className="taptab-protocol-step">
                {readOnly ? <span>{label}</span> : (
                  <ProtocolMentionEditor
                    value={label}
                    placeholder={`Describe ${addRoleLabel(label)}`}
                    className="taptab-protocol-role-editor"
                    serialize="readable"
                    defaultSlashCommand={defaultRoleSlashCommand(allowedKey)}
                    onCommit={(description, mentions) => updateRoleDescription(idx, description, mentions)}
                  />
                )}
                {!readOnly && (
                  <button type="button" aria-label={`Remove role ${idx + 1}`} onClick={() => commitRoles(roles.filter((_, i) => i !== idx))}>x</button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
      {!readOnly && (
        <div className="taptab-protocol-add taptab-protocol-add-role" contentEditable={false}>
          <ProtocolMentionEditor value={newRole} placeholder={`Add ${addRoleLabel(label)}`} className="taptab-protocol-role-editor" serialize="readable" defaultSlashCommand={defaultRoleSlashCommand(allowedKey)} focusSignal={newRoleFocusSignal} onMentionSelected={() => { removeSlashMenuRoots(); window.setTimeout(() => addButtonRef.current?.focus(), 0) }} onDraftChange={(text, mentions) => { setNewRole(text); newRoleMentions.current = mentions }} onCommit={(text, mentions) => { setNewRole(text); newRoleMentions.current = mentions }} />
          <button ref={addButtonRef} type="button" className="taptab-protocol-add-btn" tabIndex={0} contentEditable={false} onFocus={removeSlashMenuRoots} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); addRole() }}>+</button>
        </div>
      )}
    </div>
  )
}
```
Remove the old chip path (`roleChips`, `.taptab-chips-list`, `RefBadge` usage) from *this* widget. Keep `roleChips`/`RefBadge` only if still used elsewhere — likely not; verify with `rg "roleChips|RefBadge" app/src/editor/taptab/widgets/ProtocolAuthoringWidgets.tsx` and delete dead code if unused.
Add CSS in `app/src/editor/taptab/taptab.css` for the uniform X/Add right-align on ALL lists (reuse `.taptab-protocol-step-item`, `.taptab-protocol-step`, add `.taptab-protocol-add-role`): give `.taptab-protocol-step` a shared remove-button anchor and `.taptab-protocol-add` a `+` style. The step list already uses `.taptab-protocol-numbered-list` + `.taptab-protocol-step-item` — reusing those classes gives the identical look.
Run Task 2.1 → pass. Verify `cd app && npx tsc --noEmit`. Commit: `feat(ingestion): TapTab role lists render as rich-text numbered lists with X + Add (mirrors steps)`.

### Task 2.3 — Apply the same motif to Steps (already done) — verify consistency
The step widget already has X + Add. Confirm both lists share `.taptab-protocol-numbered-list`/`.taptab-protocol-step-item` so the X and Add visually align. No code change unless Task 2.2 surfaced a gap.

---

## Phase 3 — Full verification + browser pass

### Task 3.1 — Gate
```bash
cd /mnt/vast/home/brad/git/computable-lab/server && npx vitest run src/api/handlers/ProtocolBuilderHandlers.test.ts src/schema/CandidateMapperSchemaConformance.test.ts
cd /mnt/vast/home/brad/git/computable-lab && npx tsc --noEmit -p server/tsconfig.json
cd app && npx vitest run src/editor/taptab/widgets/ProtocolRoleListWidget.test.tsx src/editor/taptab/widgets/ProtocolAuthoringWidgets.test.ts
cd /mnt/vast/home/brad/git/computable-lab && cd app && npx tsc --noEmit
```
Expected: all touched suites green, both typechecks clean.

### Task 3.2 — Browser (live, real payoff)
Open `http://computable:5174/ingestion/vendor-pdf/VPDF-651F03789D80` → Extract Protocol → wait → assert:
1. Materials/Labware/Equipment now show **real names** (e.g. a flow cytometer-equivalent, CellROX/SYTOX terms), **not** `material:role`/`equipment:role`.
2. Materials, Equipment, (and Steps) each render as a numbered rich-text list (`.taptab-protocol-numbered-list`) with an **X** remove per row and an **Add/+** control — NOT pills (no `.taptab-chips-list`).
3. The rendered editor text (dump `.taptab-editor-container` textContent) contains the real nouns.
Command: `curl -s -o /dev/null -w "3001=%{http_code}\n" http://127.0.0.1:3001/api/records?kind=protocol` (backend up) and drive with the browser tool. If a list still shows pills, the CSS/widget isn't rebuilt — HMR should pick it up; hard-reload if stale.

---

## Tests / validation summary
| Area | Command | Expected |
|---|---|---|
| Extraction helpers | `server …/ProtocolBuilderHandlers.test.ts` | `isGenericRoleLabel` + `backfillRolesFromSteps` cases pass |
| Mapper conformance | `server …/CandidateMapperSchemaConformance.test.ts` | 2 pass (unchanged) |
| App static typecheck | `app && tsc --noEmit` | clean |
| Server typecheck | server tsc | clean |
| Role widget render | `app …/ProtocolRoleListWidget.test.tsx` | `<ol>` list + X + Add |
| Live browser | the CellROX review page | real nouns in lists; numbered rich-text, X + Add, no pills |

## Risks, tradeoffs, open questions
- **Extraction still model-dependent**: improving the prompt + backfill-from-steps makes real names *much* more reliable, but the model may still occasionally over/under-name. The backfill-from-steps path is the safety net — it only adds real names already present in step arrays and never reintroduces generics. If a specific PDF still returns generics, that's a per-doc model issue, not the pipeline.
- **`roleChips`/`RefBadge` removal**: the chip path currently holds the "add a second allowed-id" behavior (a role with multiple `allowedMaterialIds` renders multiple badges). The list rewrite shows ONE row per role with the description; the allowed-id set is still stored and editable via mention selection, but the *multi-badge visual* is gone. This matches the user's "rich-text list" ask. If multi-id display matters later, add a collapsed disclosure inside the row — out of scope here.
- **ProtocolMentionEditor in the role editor**: it already powers the step list, so the mention/@ completion works in role rows too. The Add row already uses it (line 112) — unchanged.
- **RED-first for Task 2.1 needs a working mock**: `ProtocolAuthoringWidgets.tsx` imports real TipTap and `taptab.css`. If the isolated render is brittle, fall back to asserting via the existing `DefaultEditorFixtures`/`documentMapper` tests (they mount TapTab) per Task-3 gate rather than a bare component test.
- **`backfillRolesFromSteps` dedup case**: ensure identical role labels across the backfill and existing non-generic roles merge (the `seen` Set handles it). The existing `candidateToProtocolPayload` mapper (client) also dedups by `roleId` — no double-count.
- **Dead code cleanup**: after removing chips, `roleChips`, `roleRef`, and possibly `RefBadge` import become unused — confirm and delete to satisfy DRY/no-dead-code.

## The upfront unknowns (resolved by inspection)
- Did the real names reach the browser? **Confirmed** the single-chunk extract yields real names and steps carry `materials/equipment[]` — so backfill-from-steps is viable and is the deterministic guarantee. The generic roles are a *merge-time* artifact, which Phase 1 removes.
- Is the steps motif already the desired one? **Yes** — `ProtocolStepRolesWidget` already has numbered list + X + Add; Phase 2 reuses its exact markup/classes for the role lists.

---

## Executed 2026-09-07 (both phases landed, verified live)

### Commits on main
- **`5d178bc` fix(ingestion): extraction emits real role noun labels + backfills
  materials/equipment/labware from steps**
  - `isGenericRoleLabel` + `backfillRolesFromSteps` exported helpers (5 unit tests).
  - `mergeChunkResults` now drops generic placeholders and backfills from
    `steps[].materials/labware/equipment` (gold source), deduping case-insensitively.
  - `buildChunkExtractionPrompt` hardened: concrete-noun example + guard against
    `material:role`/`equipment:role`/`n/a` placeholders + instruct per-step arrays.
- **`c8c1f9e` feat(ingestion): TapTab role lists render as rich-text numbered lists
  with X remove + Add (mirrors steps)**
  - `ProtocolRoleListWidget` (Materials/Labware/Equipment) rewritten from RefBadge
    chips/pills to an editable numbered `<ol>` with per-row `ProtocolMentionEditor`,
    an `x` remove, and the shared Add control.
  - Removed dead `roleChips`/`roleRef`/`RefBadge` import. Added `+` affordance.
  - New `ProtocolRoleListWidget.test.tsx` (3 tests) — `<ol>` not chips, X remove
    commits, Add present.

### Full verification
- Server: 7/7 (5 extraction helpers + 2 schema conformance). App: 10/10
  (3 role-list render + 7 ProtocolAuthoringWidgets). Server + app typechecks clean.
- Backend restarted (targeted pid 2929103; 3091/architect-ds4 untouched).
- **Live extraction (curl, full CellROX text):** Materials = `CellROX® Detection
  Reagent`, `SYTOX® Blue/Red Dead Cell Stain`, `complete medium`; Equipment =
  `flow cytometer`; **zero generic placeholders**. (Before: `material:role`,
  `equipment:role`.)
- **Browser (CellROX review page):** Materials + Equipment render as numbered
  `<ol>` lists (no `.taptab-chips-list`), 4 `Remove role` X buttons + Add present;
  editor text contains `CellROX`, `SYTOX`, `Flow Cytometer`, no `material:role`.
  Sections Materials / Consumables / Equipment / Steps all present with uniform
  list motif.
- No test PRT/DRAFT records left in the store.

### Notes / residual
- The live multi-chunk extraction on this PDF now yields real nouns regardless of
  the model's top-level lists (backfill-from-steps guarantees it) — the exact
  item set can still vary per model run, but placeholders are structurally gone.
- `roleChips`/`RefBadge` multi-badge-per-role visual is removed in favor of one
  editable row per role (matches the rich-text-list ask); multi-id display can
  return as a collapsed disclosure later if needed.
