# Creation Entry Points & TapTab-First Record Creation

Status: Draft
Date: 2026-06-10
Authors: Brad (domain lead), Claude (architect)
Related: `specifications/lab-appliance-ui.md`, `specification.md`, `docs/knowledge-layer-canonical-example.md`

## 1. What This Spec Is For

A freshly provisioned appliance is a dead end. The Welcome page offers "search
projects" over an empty store; the picker reports "No studies match." and
provides nowhere to go. Once a project exists, the workspace still offers no
way to create an experiment under it or a run under that — every navigation
surface is read-only, and `ProjectDetailsView` says so in a comment:
*"Creating studies/experiments/runs lives elsewhere (the legacy `/browser`
page or the dedicated CLI)."* The Phase 12 nav restructure removed the legacy
chrome without replacing its creation affordances.

This spec defines the creation spine — project → experiment → run — and makes
**TapTab the canonical creation surface**: the first thing a new user touches
is the structured, ontology-directed editing experience, not a bare modal
form. It also closes the open loop at the bottom of the ontology funnel: the
tier-5 "Create local term" affordance currently renders in menus but persists
nothing.

It is binding on `app/` and `server/`. It is additive: no existing surface is
removed, and one surface is explicitly frozen (§2).

## 2. Design Posture

- **TapTab-first creation.** Creating a record opens a TapTab editor over the
  record's UISpec, not a modal form. Tab moves field-to-field; slash menus
  (`/m`, `/l`, `/p`, …) and the `@` ontology copilot are available in every
  ref-bearing field. The creation flow *is* the onboarding to the editing
  model.
- **The ontology funnel is mandatory, with a real floor.** Field completion
  is directed, in priority order: (1) terms already in the lab's records,
  (2) on-box OAK ontology snapshots, (3) remote OLS4, (4) only when all are
  exhausted, mint a new term in the lab's local namespace. The resolve spine
  already enforces 1–3 by scoring (`server/src/resolve/ResolveSpine.ts`:
  tier gap 0.2 beats max match bonus 0.15, so a local substring match always
  outranks a remote exact match). Tier 4/5 minting is specified in §6.
- **Schema-driven, no new domain routes.** The creation surface is one
  generic component parameterized by `schemaId` + prefilled payload. Adding a
  creatable record kind is a UISpec change, not a route change
  (`lab-appliance-ui.md` §2).
- **The event-editor is frozen.** The deck/what-layer surface
  (`app/src/event-editor/viewer`, `deck`, event authoring, its AI dock) is a
  special surface and is **out of scope**. This spec touches the *navigation
  chrome around it* (Welcome, project picker, project details, Find tab) and
  adds new creation tabs beside it — never the event authoring experience
  itself.

## 3. Current State (verified 2026-06-10, branch `feat/ai-extension-api`)

What exists and is reused:

| Piece | Where | State |
|---|---|---|
| TapTab editor (prose + form postures, Tab nav) | `app/src/editor/taptab/TapTabEditor.tsx`, `tabNavPlugin.ts` | Working |
| Schema → document mapping, 21 widget kinds | `app/src/editor/taptab/documentMapper.ts`, `extensions/WidgetRenderer.tsx` | Working |
| Slash menus `/m /l /p /s /t`, progressive 3-paint rendering | `app/src/shared/taptab/slashMenu/` | Working |
| `@` ontology copilot | `app/src/shared/taptab/ontologyCopilot/` | Working, materials-only |
| Resolve spine, 5 tiers + ranking | `server/src/resolve/ResolveSpine.ts`, `POST /api/resolve` | Working |
| Record CRUD | `POST /api/records` (`RecordHandlers.createRecord`) | Working |
| Study/experiment/run schemas + UISpec form sections | `schema/studies/*.schema.yaml`, `*.ui.yaml` | Present; `run.ui.yaml` already opts into `taptab:` |
| Legacy creation modal | `app/src/knowledge/browser/CreateNodeModal.tsx` | Reachable only from legacy `/browser` |

What is missing (the gaps this spec closes):

1. No creation affordance on Welcome, project picker, project details, or the
   Find tab.
2. No way to create an experiment or run from within a project workspace.
3. `apiClient.addLocalVocabTerm()` is a stub (`app/src/shared/api/client.ts`)
   — tier-5 minting persists nothing.
4. The project picker's empty state is a dead end (and results live in a
   `max-height: 360px` scroll region capped at a 200-record fetch, which
   reads as "cut off").

## 4. The Creation Spine

The hierarchy and parent links follow the schemas: experiments carry a
required `studyId`; runs carry a required `experimentId` (plus `studyId`).
Studies do not enumerate children (`study.schema.yaml` description), so
creation never mutates the parent record — it only stamps the parent id into
the child's payload.

### 4.1 New project — from Welcome and from the picker

- `WelcomePage` gains a primary **"New project"** button beside "Open all
  projects". With zero recent projects, the empty state leads with it.
- `StudyPickerPopover` gains a persistent footer action: **"New project"** —
  and when the filter yields no matches, the empty state becomes **"No
  studies match — create '⟨query⟩'"**, carrying the typed query in as the
  draft title.
- Both routes open the creation surface (§5) for
  `https://computable-lab.com/schema/computable-lab/study.schema.yaml`.
  On save, navigate to `/project/⟨studyId⟩`.

### 4.2 New experiment — from the project workspace

- `ProjectDetailsView` "Experiments" section header gains **"New
  experiment"**; the empty state ("No experiments yet…") replaces its
  go-use-the-legacy-browser copy with the same action.
- `FindTabPanel` mirrors the affordance on the study root node.
- Opens the creation surface for `experiment.schema.yaml` with
  `studyId` prefilled and read-only.

### 4.3 New run — from an experiment node

- Each experiment node in `ProjectDetailsView` and `FindTabPanel` gains
  **"New run"**.
- Opens the creation surface for `run.schema.yaml` with `experimentId` and
  `studyId` prefilled and read-only.

### 4.4 Picker hygiene (small, in passing)

- The "No studies match." empty state always offers creation (§4.1).
- The 200-record fetch cap and the 360px scroll region stay for now, but the
  list footer shows "⟨n⟩ of ⟨total⟩" when the cap truncates, so scrolling vs.
  missing is never ambiguous.

## 5. The Creation Surface

One new generic component, `RecordCreatePanel` (working name), owns the flow:

- **Input:** `schemaId`, `prefill` (partial payload; prefilled parent ids
  render read-only), optional `draftTitle`.
- **Render:** `TapTabEditor` over the schema's UISpec form sections, prose
  posture by default (`uiSpec.taptab?.style` wins when present). Required
  fields carry their existing required styling; slash menus and the `@`
  copilot are enabled exactly as in edit mode.
- **Identity:** `recordId` is generated from the kind prefix + slug, the same
  scheme `CreateNodeModal` uses today (e.g. `STD_0001__⟨slug⟩`); shown as a
  read-only field that live-derives from the title until first save.
- **Save:** `POST /api/records { schemaId, payload }`. On success: §4's
  navigation. On validation failure: surface the server's field errors inline
  on the corresponding field rows.
- **Hosting:** inside a project workspace, the panel opens as a normal
  left-pane deck tab (same mechanism `ProjectDetailsView` uses to open
  artifact viewers). From the Welcome page (no workspace yet), it renders on
  a minimal full-page route, `/create/study`, styled with the same
  design tokens.

`CreateNodeModal` is left in place for the legacy `/browser` page; new
surfaces never link to it. It can be retired when `/browser` is.

## 6. Closing the Funnel: Term Minting

The bottom of the ontology funnel becomes real:

- **Endpoint:** `POST /api/vocab/mint` with
  `{ refKind, label, sourceQuery?, context? }` → creates a minimal record of
  the kind implied by `refKind` (e.g. a draft `material` record for `/m`),
  with:
  - `label` = the user's text,
  - an IRI minted under the workspace namespace
    (`repositories[].namespace.baseUri` from config — per-appliance, so
    minted terms sync through the records repo like any record),
  - `state: draft`, plus a provenance note (`mintedFrom: ⟨sourceQuery⟩`).
- **Pickup:** no new search path needed — the tier-1 records provider
  queries the store, so a minted term appears in the next resolve call and
  outranks every remote candidate by design.
- **Frontend:** the tier-5 "Create local term '⟨query⟩'" candidate (already
  rendered last by the spine, score 0.05) calls the endpoint and inserts the
  resulting mention pill, replacing the `addLocalVocabTerm` stub. The pill is
  visually marked as a local draft term (distinct accent), so minted-vs-
  curated is always visible.
- **Friction is intentional:** minting stays at the bottom of the list, never
  keyboard-default, and requires an explicit pick. The funnel directs; it
  does not block.

## 7. Copilot Breadth (follow-on, same shape)

`OntologyCopilotExtension` currently resolves `kinds: ['material']` only.
Make the `kinds` set a mount-time option so hosts pick what fits their
surface, with the mention pill type following the requested kind. This rides
entirely on the existing resolve spine; no server change.

*(Implementation note: true per-field `refKind` awareness is out of reach
today — the copilot's `@` trigger lives in document text, while `refKind` is
an attribute of FieldRow atoms whose widgets are React inputs outside the
ProseMirror text flow. Mount-time kinds is the honest version until field
widgets host their own trigger.)*

## 8. Out of Scope

- **The event-editor surface** — deck viewer, event authoring, its AI dock
  (§2). Nothing in this spec alters it.
- Flowing-prose inline editing (paragraph text between fields) and
  full-document `@`-mentions outside field values.
- Retiring `/browser` or `CreateNodeModal`.
- Concurrent-editing/locking semantics for newly created records.

## 9. Implementation Sequence

| Phase | Scope | Unblocks |
|---|---|---|
| A | Entry-point affordances: Welcome "New project", picker footer + empty-state create, ProjectDetailsView/FindTabPanel "New experiment"/"New run", picker count footer | The empty-appliance dead end |
| B | `RecordCreatePanel` + `/create/study` route + deck-tab hosting; wire all Phase A affordances to it | TapTab-first creation |
| C | `POST /api/vocab/mint` + tier-5 wiring + draft-pill styling | The funnel's floor |
| D | Copilot `refKind` breadth | Funnel width |

Acceptance, per phase: (A/B) a brand-new appliance can go Welcome → create
project → create experiment → create run entirely through TapTab surfaces,
keyboard-only; (C) a term absent from records and both ontology tiers can be
minted from the slash menu, persists as a draft record, and appears as a
tier-1 candidate on the next search; (D) `@` completes labware and protocol
references in fields that declare those `refKind`s.
