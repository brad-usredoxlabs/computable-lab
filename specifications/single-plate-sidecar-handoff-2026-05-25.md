# Single-Plate Sidecar Handoff

Status: implementation handoff after sidecar iteration
Date: 2026-05-25
Related: `specifications/single-plate-ros-vertical-slice-plan.md`, `docs/knowledge-layer-canonical-example.md`

## Summary

The original `single-plate-ros-vertical-slice-plan.md` still describes the long-term vertical slice, but the app-side Phase 4 direction has been deliberately reframed.

The plan originally pushed the focused plate rail toward explicit `Hypothesis / Knowledge / Protocol / Readout` authoring: mechanism models, claims, assertions, context roles, and experiment narratives exposed in the UI. That was too knowledge-layer-forward for the target user. The current direction is an OEM-software-style lane: a biologist selects wells, chooses a role such as positive control, negative control, blank, no cells, or sample, and edits the context recipe/channel only when needed.

The key product decision from the latest discussion: for v1, the sidecar should help users define **contexts for reads**, not author full experimental hypotheses. Claims, mechanism models, multi-assertion hypothesis design, and evidence interpretation remain important, but they are out of scope for the simple one-off v1 vertical slice.

## Where We Are Relative To The Original Plan

Phases 1 and 2 are still effectively landed:

- Event-editor `add_material` events preserve structured material identity.
- The add-material modal reuses local material/formulation search and creation paths.
- `/m` material mention behavior was already extended separately.

Phase 3 is still landed mechanically:

- The focused single-plate view has a right rail mounted inside `LabwareFocus`.
- Rail state is stored in `EventEditorContext.plateRail`, keyed by `placementId`.
- Rail state survives selection changes and focus-view toggles.

Phase 4 is only partially complete, and its UI interpretation changed:

- The original plan's visible `Hypothesis / Knowledge / Protocol / Readout` UI is no longer the desired v1 surface.
- The canonical PPAR/clofibrate/mechanism example must remain a capability target, not visible baked-in UI.
- The user-facing lane is now `Materials / Groups / Notes / Read`.
- `Groups` is the bridge between SoftMaxPro-style group assignment and knowledge-layer `context-role` records.

Phase 5 should not start from the original assumption that the rail has explicit assertions. It should consume the newer sidecar shape:

- groups assigned to wells,
- each group carrying a role/context definition,
- each role carrying a fluorescence channel,
- the read section summarizing required channels and missing controls.

## Current Sidecar Behavior

The sidecar currently has these sections:

- `Materials`: select wells, then open the add-material modal.
- `Groups`: assign selected wells to roles through a context editor.
- `Notes`: simple experiment title/rationale fields.
- `Read`: summary of channels derived from assigned groups.

Important implemented behavior:

- Quick role buttons include common roles, currently ROS-oriented for the quick path.
- A role dropdown exposes all seeded/saved role definitions, including MMP roles.
- Clicking a role opens a `Context editor` modal before assigning wells.
- The modal lets the user edit:
  - role name,
  - role type,
  - description,
  - channel/read signal,
  - generic required-material rows,
  - expected direction,
  - notes.
- Required-material rows use the existing material search stack.
- Required-material validation is read-only: it checks existing `add_material` events for the selected wells and flags missing elements. It does not auto-add materials.
- New/custom roles attempt to save as reusable `context-role` records through `POST /records`.
- If context-role creation fails, the group assignment remains as plate draft state and the rail shows a non-blocking warning.
- The `Read` section no longer owns the channel selector. It derives channel summaries from assigned groups and flags missing positive/negative controls per channel.

## Current Draft Data Shape

The rail draft model now stores role-aware group state rather than a flat group enum.

Current conceptual shape:

```ts
type ChannelDraft =
  | { kind: 'readout-ref'; ref: Ref; label: string; excitationNm?: number; emissionNm?: number }
  | { kind: 'custom'; label: string; excitationNm: number | null; emissionNm: number | null }

interface RequiredMaterialDraft {
  id: string
  label: string
  materialRef: Ref | null
  optional?: boolean
}

interface RoleDefinitionDraft {
  id: string
  name: string
  roleType: GroupRole
  description: string
  channel: ChannelDraft
  requiredMaterials: RequiredMaterialDraft[]
  expectedDirection: OutcomeDirection
  roleRef?: Ref
  isSeeded?: boolean
}

interface GroupDraft {
  id: string
  name: string
  role: GroupRole
  roleType: GroupRole
  roleRef?: Ref
  wells: WellId[]
  channel: ChannelDraft
  requiredMaterials: RequiredMaterialDraft[]
  expectedDirection: OutcomeDirection
  notes: string
  validation?: {
    missingRequiredMaterialIds: string[]
    checkedAt: string
  }
}
```

The naming still uses `knowledge` internally because that was the existing `PlateRailDraft` branch. Do not treat that internal field name as user-facing vocabulary.

## Seeded Role And Channel Choices

Seeded role definitions currently include:

- `Positive control for ROS`
- `Negative control for ROS`
- `Positive control for MMP`
- `Negative control for MMP`
- `Blank`
- `No cells`
- `Sample`

Current channel choices include:

- `CellROX Deep Red`, custom draft channel, Ex/Em 644/665.
- `Far-Red Fluorescence`, readout ref `RDEF-PLATE-FAR_RED-ROS`, Ex/Em 640/665.
- `FITC Fluorescence`, readout ref `RDEF-PLATE-FITC-MMP`, Ex/Em 485/535.

Important nuance: CellROX Deep Red 644/665 is currently stored as a custom draft channel because the existing registry readout is generic far-red ROS at 640/665. Later work can decide whether to add a dedicated readout-definition for CellROX or match custom Ex/Em to a registry readout at read time.

## Files Most Relevant To The Current Implementation

Primary sidecar files:

- `app/src/event-editor/rail/state.ts`
- `app/src/event-editor/rail/KnowledgeRailSection.tsx`
- `app/src/event-editor/rail/ContextRoleEditorModal.tsx`
- `app/src/event-editor/rail/ReadoutRailSection.tsx`
- `app/src/event-editor/rail/PlateRail.tsx`
- `app/src/event-editor/rail/ProtocolRailSection.tsx`
- `app/src/event-editor/styles/eventEditor.css`

Modal/material fixes from the same work session:

- `app/src/event-editor/material/AddMaterialModal.tsx`
- `app/src/event-editor/material/AddMaterialModal.test.tsx`
- `app/src/event-editor/material/builders/BuildCompoundForm.tsx`

Schema/server work touched earlier in Phase 4:

- `schema/core/record.schema.yaml`
- `schema/knowledge/evidence.schema.yaml`
- `server/src/api/handlers/SemanticsHandlers.ts`

## Bugs Fixed During This Iteration

Add-material modal:

- The modal backdrop/dialog was too transparent, making typed content hard to read.
- Clicks inside the portal bubbled to the focus backdrop, collapsing the zoomed plate view and losing unsaved modal changes.
- The modal now uses pointer/click propagation guards and more opaque fallback styles.

Baked-in canonical example:

- The stale PPAR/mechanism/hypothesis UI was removed from the visible rail.
- The sidecar no longer exposes `Hypothesis`, `Knowledge`, `Protocol`, or `Readout` as visible section headers.
- Clofibrate examples were neutralized in event-editor material UI copy.

Sidecar workflow:

- Role assignment no longer immediately creates a flat group.
- It opens a context editor first, making channel and required elements explicit.

## Tests Run

Focused app tests passed:

```bash
npm run test -w app -- src/event-editor/rail/state.test.ts src/event-editor/rail/PlateRail.test.tsx src/event-editor/material/AddMaterialModal.test.tsx
```

Result: 3 files passed, 12 tests passed.

Focused server/schema tests passed earlier in the same workstream:

```bash
npm run test:run -w server -- src/schema/MechanismModelSchemas.test.ts src/schema/integration.test.ts src/context/RosRoleAndAssertion.test.ts
```

Result: 3 files passed, 19 tests passed.

App-wide typecheck still fails on existing unrelated repo issues. A filtered typecheck scan for touched sidecar/material files produced no errors after the final fixes.

## Known Gaps And Sharp Edges

The sidecar is improved but not polished.

Important gaps:

- The context editor UI is functional but visually dense.
- Required-material validation only checks exact material ref ids in existing `add_material` events. It does not reason over material classes, composition snapshots, synonyms, or ontology ancestry.
- Required-material rows are generic and flexible, but the UX for choosing labels/materials needs refinement.
- New role creation saves `context-role` records with permissive prerequisite objects. That matches the current schema, but the DSL is not yet formalized.
- The rail keeps role definitions in `EventEditorContext.plateRail`; it does not yet reload reusable `context-role` records from the record store on focus open.
- The `Read` section summarizes channels but does not create `measurement-context` records yet.
- Group/context data is not yet compiled into `well-group`, `context`, `well-role-assignment`, `assertion`, or `measurement-context` records.
- There is no `Read plate` button/modal in the focused plate header yet.
- Phase 6 evidence publication has not started.

## Recommended Next Work

Next technical step before Phase 5 execution:

1. Add a compile/preflight function for sidecar groups.
2. Convert current group/channel drafts into planned record drafts:
   - `well-group` per group,
   - `context-role` refs for saved roles,
   - `measurement-context` per unique channel,
   - possibly `well-role-assignment` per group/channel for v1.
3. Show those planned records in a `Read plate` modal.
4. Block read execution if a selected channel has no positive control or no negative control.
5. Execute simulated Gemini reads per measurement context.

Recommended product/UX step:

- Spend one pass simplifying the context editor layout before adding the read execution modal. The modal is now the conceptual center of the sidecar, so it should feel first-class rather than like a form made of internal fields.

## Mental Model To Preserve

The desired v1 compromise is:

- Biologists think in groups and controls.
- The app stores enough structure to later separate biological context, knowledge claims, and measurement evidence.
- The UI should not force users to understand that separation up front.

In other words: **select wells → choose role → define context recipe/channel → read plate**.

Everything deeper than that, including hypotheses, claims, mechanism models, assertions, and evidence bundles, should be compiled or surfaced later, not required as the primary v1 interaction.
