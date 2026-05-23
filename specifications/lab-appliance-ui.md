# Lab Appliance UI Surface

Status: Draft
Date: 2026-05-23
Authors: Brad (domain lead), Claude (architect)
Related: `specifications/workflow-and-datatypes-manifesto.md`, `specifications/code-as-data.md`, `specifications/biology-compiler.md`, `specification.md`

## 1. What This Spec Is For

computable-lab is the AGPL-licensed knowledge and authoring substrate of a larger product family. The 1.0 *lab appliance* is the first commercial instantiation: a turnkey box that drives a single instrument — a Molecular Devices SpectraMax Gemini EM fluorescence plate reader — via pylabrobot, captures raw and analyzed data as records, and is loosely modelled (in workflow shape, not in code) after SoftMaxPro 6.3. The appliance's deployment engine, secrets, and the PRL (PyLabRobot) API service live in a separate, private repository at `../cl-appliance/`. This repository remains the public, declarative, schema-driven heart.

This document specifies the UI surface that this repository exposes for the appliance. It is binding on the frontend in `app/`. It is not a migration plan; see the companion plan for the sequence of changes.

## 2. Design Posture

We started with a sprawling, demo-driven UI: a dozen top-level routes, several editors with overlapping responsibilities, and chrome that varied page-to-page. The new event-editor — single shell, dark by default, design-token-driven, AI dock at the foot — proved the model. The rest of the application now adopts that posture.

The posture rests on five non-negotiables, lifted directly from the manifesto:

- **If it can be data, it is data.** Every page is a thin renderer over schemas, lint rules, and UI specs. No page hard-codes a domain. No chrome branches on a schema name.
- **Declarative.** Layouts, columns, filters, and form widgets are read from `*.ui.yaml`. The four endpoints described below are *views* into the same record store, not bespoke applications.
- **Schema-driven.** Adding a record type does not add a route. It appears wherever the schema directs.
- **Compiler-for-biology.** Authoring surfaces produce compilable artifacts. The compiler is always within reach — visible, queryable, AI-assisted — but never hidden.
- **AI-driven, with knowledge/what separation.** Each endpoint carries an AI dock scoped to its layer. The knowledge layer (what is true / known / authorized) and the what layer (what is happening on the bench, right now) are visibly distinct surfaces — never mixed in the same view.

## 3. The Four Endpoints

The appliance UI collapses to four top-level destinations. Anything that does not belong in one of these four does not belong in the top-level chrome at all.

### 3.1 `/browser` — Knowledge Layer

The schema-driven record browser. The single way to navigate everything that has ever been recorded: people, materials, equipment, labware, formulations, components, methods, training, calibrations, conditions, completed runs, derived data. The browser is generated entirely from the schema triplet — list columns from `*.ui.yaml`, filters from schema enums and lint references, detail views from form layout.

Folded in: the legacy schema list, record list, record viewer, raw record editor, record registry, formulations, materials, component library. Each of these becomes a *facet* of the browser, not a route.

The browser's AI dock answers semantic questions over the knowledge graph: "what materials have we used at pH < 4 in the last six months", "which equipment is calibrated and authorized for me to use today". It never proposes execution — that is the job of the `/protocols` and `/event-editor` AI docks.

### 3.2 `/event-editor` — What Layer

The canonical authoring surface for what is happening, or will happen, on a specific deck with specific labware and specific materials. This is the only place in the appliance where concrete, instance-level lab state is edited. Already deployed; this spec freezes its role.

The event-editor opens with a deck, runs through a compiled protocol, and reads instrument output back as events. It is the surface a biologist looks at *while running the plate reader*. It is the surface the appliance's touch screen defaults to in kiosk mode.

### 3.3 `/protocols` — The Bridge

Protocol authoring, compilation, and library management. This is where a method becomes a compilable artifact: source prose, declarative steps, compile diagnostics, foundry status, candidate review. The output is a protocol record that the `/event-editor` can instantiate against a real deck and the PRL API can execute on the SpectraMax.

Folded in: the protocol IDE, the foundry status and acquisition jobs panels, the candidate review surface, the inner-loop strip. Each of these stays — they collapse into one shell with one chrome.

The `/protocols` AI dock proposes protocol drafts, compiles them, surfaces diagnostics, and suggests fixes. It is the bridge between knowledge (which materials exist, which equipment is admissible) and what (which deck slot, which well).

### 3.4 `/literature` — Upstream Knowledge Intake

Where unstructured prose becomes structured knowledge. Vendor protocol PDFs, papers, vendor data sheets, internal SOPs, hand-typed methods — all enter here, get extracted into candidate YAML per `code-as-data.md`, get reviewed by a curator, and end up as records in `/browser`.

Folded in: the literature explorer, the extraction drafts list, the extraction review surface, the ingestion pipeline UI. Ingestion is not its own endpoint; it is the funnel that feeds the literature curator.

The `/literature` AI dock reads prose, proposes extractions, flags ambiguity, and never silently invents certainty.

## 4. Knowledge / What / Bridge / Intake — One Picture

```
              upstream prose
                    │
                    ▼
              /literature      ── intake (PDF → candidate YAML)
                    │
                    ▼
              /browser         ── knowledge layer (what is true)
                    │
                    ▼
              /protocols       ── bridge (knowledge → executable)
                    │
                    ▼
            /event-editor      ── what layer (live deck, live run)
                    │
                    ▼
            instrument (PRL API → SpectraMax)
                    │
                    ▼
               raw + derived
                  records
                    │
                    └────────────► back into /browser
```

Each arrow is a record-producing step. Nothing flows except records. Code interprets, validates, renders, derives — it never *is* the data.

## 5. Chrome Contract

All four endpoints share one shell, lifted from the current `EventEditorShell` pattern:

- **Brand + TopBar.** Single header. Brand on the left, endpoint-specific chips in the middle (vocab, tool, mode — endpoint chooses which to expose), theme toggle and four nav links on the right.
- **Content.** The endpoint's primary surface fills the middle.
- **AI Dock.** A bottom dock, scoped to the endpoint's layer. Always present. Always one chat thread per endpoint, persisted.
- **Fix-It Launcher.** When the endpoint is producing a compilable artifact (`/protocols`, `/event-editor`), the Fix-It panel is reachable from the same launcher used today.
- **Dark by default.** Light theme is supported via the existing `data-theme` switch on the shell. No third theme.

Settings is **not** a top-level nav item. It is reached from the brand menu or a corner gear, and renders inside the shell.

## 6. Design Tokens — One System

The `--ee-*` token set in `app/src/event-editor/styles/eventEditor.css` is the seed for an app-wide token system, renamed to `--cl-*` and lifted to `app/src/shared/styles/tokens.css`. The event-editor keeps its own aliases for transition; the other endpoints adopt the lifted tokens directly. No endpoint defines new color or spacing primitives — only compositions.

Mobile breakpoints are owned by tokens, not by JavaScript. The `useViewport()` hook is reserved for branches that genuinely require a different component tree (kiosk vs. touch, Fix-It tab vs. inline panel) — never for color or spacing.

## 7. Hardware Story: SpectraMax Gemini EM via pylabrobot

The four endpoints, in motion, drive the 1.0 appliance as follows:

1. **`/literature`** — a curator loads the SpectraMax Gemini EM vendor manual and a relevant assay paper. Extraction produces candidate equipment, labware, and method records. The curator approves; records land in Git.
2. **`/browser`** — the appliance owner confirms that the Gemini EM instance is present, calibrated, and authorized for the operator. Plate types supported by the reader are visible as labware records.
3. **`/protocols`** — the operator (or an AI) drafts a fluorescence-read protocol: excitation, emission, well selection, read mode, gain, kinetic interval. The compiler validates against the SpectraMax's declared verbs and admissible labware. Diagnostics resolve in the same surface.
4. **`/event-editor`** — the compiled protocol is instantiated against a concrete plate. The operator confirms deck, plate, and material placement. Pressing Run hands the compiled artifact to the PRL API service (which lives in `../cl-appliance/`).
5. **PRL API → SpectraMax** — pylabrobot drives the instrument. Each well read, error, and timing event is reported back as records.
6. **`/browser`** — raw reads and derived analyses appear as records, indexed alongside the protocol that produced them.

No imperative "appliance flow" code lives in this repository. The flow above is realized as a sequence of records and compiler passes.

## 8. What This Spec Retires

These current routes are not preserved as top-level destinations:

- `/schemas`, `/schemas/:id/records`, `/records/:id`, `/records/:id/edit`, `/new` → `/browser` facets
- `/registry`, `/component-library`, `/formulations`, `/materials` → `/browser` facets
- `/labware-editor`, `/runs/:runId`, `/runs/:runId/editor`, `/runs/:runId/editor/:mode` → subsumed by `/event-editor`
- `/ingestion`, `/extraction`, `/extraction/review/:recordId` → `/literature` facets
- `/protocol-ide`, `/protocol-ide/:sessionId`, `/protocol-ide/foundry/status`, `/protocol-ide/foundry/jobs` → `/protocols` facets
- `/labware-test` → removed
- `/settings` → reached from brand menu, not nav

Old URLs may redirect for one release cycle. They do not stay.

## 9. Non-Goals

- No per-feature top-level routes. New record types do not get new routes; they appear in the relevant endpoint's chrome.
- No schema-name branching in chrome code.
- No top-level Settings.
- No separate AI panel per route — one dock per endpoint, scoped to that endpoint's layer.
- No bespoke ingestion UI outside `/literature`.
- No hidden instrument control. Instrument actions are records, visible in `/event-editor`.
- No commercial / appliance-only code in this repository. Appliance specifics live in `../cl-appliance/`.

## 10. Stability Promise

This document describes **what the appliance UI is**. Implementation details, route names, and the precise composition of the four endpoints' chrome may evolve. The four-endpoint shape and the prime-directive constraints on each endpoint are stable.
