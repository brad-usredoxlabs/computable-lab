# Computable Lab UI Specification

**Document type:** Implementation specification  
**Audience:** Programming agents and application developers  
**Scope:** Top-level navigation, workspace layout, project/run/claim/lab views, contextual right-hand pane, and graph-oriented UI behavior  
**Status:** Product-direction specification

---

## 1. Purpose

Computable Lab is a graph-backed application for planning, executing, interpreting, and reusing laboratory work. The user interface must not expose the knowledge graph as a large node-link diagram or force scientists to maintain a rigid containment hierarchy. Instead, it must give users a small number of familiar entry points into the graph and reveal relationships contextually.

The central UI model is:

> **Runs, Projects, and Claims are the primary ways scientists enter the graph.**
>
> **Protocols, materials, labware, instruments, and people are the reusable entities that make those objects meaningful and executable.**
>
> **Calibration, maintenance, and training are evidence-producing activities that establish time-bounded claims about those entities.**

The existing run-centered event editor and deterministic compiler remain the core of the product. The UI redesign must reduce administrative steps before a scientist can begin a run, while making the relationships among work, evidence, and laboratory resources more visible and reusable.

---

## 2. Product principles

The implementation MUST follow these principles.

### 2.1 The graph is the data model, not the primary navigation metaphor

Users should not need to browse an ontology tree or a whole-lab graph to perform routine work. Projects, runs, claims, and lab entities provide stable entry points. Search, AI, typed relationships, and contextual views provide graph traversal.

### 2.2 Do not force a Project → Experiment → Run hierarchy

The current mandatory hierarchy creates unnecessary setup:

```text
Create project → name project → create experiment → name experiment → create run → work
```

The new primary path is:

```text
Open project → New Run → work
```

A run MAY link to multiple projects. A claim MAY be relevant to multiple projects. Neither runs nor claims have one canonical project parent.

The former **Experiment** level MUST NOT remain a required first-class container. Existing experiment groupings should migrate to one or more of:

- tags;
- saved run views;
- named collections defined by queries;
- typed relationships among runs;
- optional user-facing labels such as “baseline,” “pilot,” or “Figure 2.”

A run may appear in multiple saved collections.

### 2.3 Capture metadata from work rather than asking users to enter it twice

The system SHOULD derive context from the run event graph, including selected materials, biological entities, labware, instruments, protocol steps, measurement channels, and treatments. Explicit user entry should be reserved for information that cannot be reliably derived.

### 2.4 Search is easier than organizing

The interface MUST support strong global retrieval across heterogeneous object types. Users should not be required to decide where an object “lives” before they can find or use it.

### 2.5 Relationships should be meaningful

Tags are useful for retrieval, but typed relationships carry scientific meaning.

Examples:

```text
Run tests Claim
Run supports Claim
Run contradicts Claim
Run qualifies Claim
Project investigates Claim
Project depends on Claim
Run uses Protocol
Run uses Material Lot
Run operates Instrument Asset
Run performed by Person
Calibration Run evaluates Instrument Asset
```

The UI SHOULD display relationship verbs rather than generic unlabeled links whenever a typed relationship exists.

---

## 3. Core UI concepts

### 3.1 Project

A Project is a durable statement of purpose. It gathers relevant graph objects without owning them.

A project answers:

- What are we trying to accomplish?
- What questions are currently active?
- What work has recently occurred?
- What claims are being tested or relied upon?
- What should happen next?

Projects are appropriate as the default landing-page cards because they give users human-scale orientation over weeks or months.

### 3.2 Run

A Run is the primary unit of laboratory work and the main execution object. It contains or references the instantiated event graph, plate state, protocol execution, materials, instruments, results, and evidence.

A run answers:

- What are we doing or what did we do?
- What physically happened, in what order, and with which resources?
- What results were produced?
- Which claims were tested, supported, contradicted, or qualified?

The run editor is the product’s highest-value surface and MUST remain fast to enter.

### 3.3 Claim

A Claim is an addressable scientific statement that can accumulate supporting, contradictory, or qualifying evidence. Claims are universal graph objects and MUST NOT belong to a single project.

A claim answers:

- What does the lab currently believe?
- Under which contexts is the statement intended to hold?
- Which runs or literature sources support it?
- Which evidence challenges or narrows it?
- Which projects depend on or investigate it?

### 3.4 Lab

Lab is the top-level home for reusable operational entities. It is not simply a document library. Lab entities have capabilities, versions, states, histories, and relationships to runs and claims.

Lab contains:

- Protocols
- Materials
- Labware
- Instruments and equipment
- Pipettes
- Automation platforms and workcells
- People
- Documents associated with those entities

Calibration, maintenance, verification, qualification, and training appear as activities or evidence records connected to these entities.

---

## 4. Application shell

The desktop application MUST use a three-level shell:

1. **Global navigation bar**
2. **Open-object workspace tab strip**
3. **Main workspace with contextual right-hand pane**

The existing top tabs, run toolbar, and approximately 60/40 split between the main canvas and right pane should be retained where practical.

### 4.1 Global navigation bar

The persistent global navbar MUST contain these primary destinations:

```text
Projects | Runs | Claims | Lab
```

Recommended complete header:

```text
[Computable Lab]  Projects  Runs  Claims  Lab  [Find anything…]  [+ Create]  [User] [Settings]
```

Requirements:

- **Projects** opens the project collection and recent-project grid.
- **Runs** opens the chronological/searchable run collection.
- **Claims** opens the claim collection and evidence-oriented views.
- **Lab** opens the reusable resource collection.
- **+ Create** opens a menu containing New Run, New Project, New Claim, and relevant Lab entity types.
- **New Run** SHOULD be the visually dominant creation action because it is the most frequent and valuable action.
- The global search control SHOULD retrieve projects, runs, claims, lab entities, and imported documents in one result set.
- Clicking the product logo MAY open a lightweight Home/activity view, but Home is not required as one of the four named primary concepts.

### 4.2 Workspace tab strip

The current tabbed workspace MUST be retained and generalized. A tab may represent any primary or reusable entity, not only a project.

Examples:

```text
[P] DHVC
[R] First Titration
[C] Cytation 5 quantifies dsDNA with PicoGreen
[I] Cytation 5 — CYT-01
```

Requirements:

- Every tab MUST visually indicate object type.
- Tabs MUST preserve unsaved state and local UI state when switching.
- Tabs MUST be closable.
- The `+` tab action opens a searchable object launcher and creation menu.
- The active tab determines the main canvas and the default context of the right-hand pane.
- Deep links MUST restore the correct object tab and view.

### 4.3 Main workspace split

The main workspace has:

```text
┌──────────────────────────────────────┬───────────────────────────┐
│                                      │ AI | Find | Search |      │
│       Primary object canvas          │ Details | Protocol        │
│                                      │                           │
│                                      │ Contextual right pane     │
└──────────────────────────────────────┴───────────────────────────┘
```

Requirements:

- Default split should remain close to the current approximately 60% main canvas / 40% right pane.
- The divider MUST be draggable.
- The right pane MUST be collapsible.
- Recommended right-pane minimum width: 360 px.
- Recommended right-pane maximum width: 50% of the viewport.
- Each workspace tab SHOULD retain its own selected right-pane tab and right-pane scroll state.

---

## 5. Projects UI

### 5.1 Project collection

The Projects destination opens a card grid or compact list of recently active projects.

Each project card SHOULD show:

- project title;
- short purpose or current question;
- last activity time;
- active run count;
- unresolved or recently changed claim count;
- recent participants, when useful;
- status such as Active, Paused, or Archived.

Primary actions:

```text
Open Project
New Project
New Run linked to Project
```

### 5.2 Project workspace

A project is a view over related graph objects, not a parent folder. The project workspace SHOULD contain these sections or internal tabs:

```text
Overview | Runs | Claims | Resources | Activity
```

#### Overview

The Overview SHOULD show:

- purpose and description;
- current questions or goals;
- recent and in-progress runs;
- claims the project investigates, aims to establish, assumes, or depends upon;
- recent activity;
- alerts affecting project work, such as an instrument calibration lapse;
- a prominent **New Run** action.

#### Runs

Replace the current **EXPERIMENTS** hierarchy with a **RUNS** area.

Recommended structure:

```text
RUNS                                      [+ New Run]

In progress
Recent
All project-linked runs

SAVED RUN VIEWS
  Titrate Potassium Bicarbonate     2 runs
  Baseline characterization         8 runs
  Figure 2 candidates               5 runs
```

A saved run view is a query or collection, not an owner. A run MAY appear in multiple saved views and multiple projects.

The former project screen action **+ New experiment** MUST become **+ New Run**. Existing experiment records SHOULD be migrated to saved run views or tags while preserving provenance.

#### Claims

The Claims section SHOULD group claims by relationship to the project:

```text
Aims to establish
Investigates
Depends on
Assumes
Potentially challenged
Recently changed
```

A project claim list is a filtered view of universal claims. Creating a claim from a project creates a universal Claim node plus a typed relationship to the project.

#### Resources

The Resources section SHOULD show referenced reusable Lab entities, without copying them into the project:

- pinned protocol versions;
- frequently used materials;
- labware definitions;
- instrument assets;
- automation workcells;
- relevant vendor documents.

Project-specific configuration MAY be stored as a relationship or profile, for example:

```text
Project DHVC prefers Protocol v3
Project DHVC uses Workcell A
```

The underlying protocol or instrument remains a reusable Lab entity.

#### Activity

Activity provides a chronological stream of project-relevant graph changes:

- run created, started, or completed;
- evidence attached;
- claim added or revised;
- resource status changed;
- calibration or maintenance alert;
- external document ingested.

### 5.3 Project right-pane context

When a project is active, the right-hand pane defaults to project scope.

- **AI:** project questions, summaries, planning, and graph-grounded recommendations.
- **Find:** internal objects relevant to or linkable from the project.
- **Search:** external research scoped by the project’s current questions and entities.
- **Details:** project description, relationships, people, provenance, and graph context.
- **Protocol:** linked or recommended protocols; it does not instantiate execution until a run is opened or created.

---

## 6. Runs UI

### 6.1 Run collection

The Runs destination MUST be chronological and retrieval-oriented rather than hierarchical.

Default views:

```text
In progress
Today
Yesterday
This week
Recently viewed
All runs
```

Filters SHOULD include:

- project;
- claim;
- status;
- person;
- date;
- material or biological entity;
- protocol;
- instrument;
- labware;
- tag or saved view.

### 6.2 Run creation

A run can be created globally or from a project.

Minimum creation flow:

1. Create the run with a default title based on date/time or selected protocol.
2. Optionally link the originating project automatically.
3. Open the run editor immediately.
4. Allow additional projects, claims, protocols, and resources to be linked while work proceeds.

The system MUST NOT require the user to create or select an Experiment container.

### 6.3 Run workspace

The existing run-centered plate/event editor remains the primary canvas. Preserve the current high-level arrangement:

- open-object tab strip;
- run control toolbar;
- plan/execute mode control;
- vocabulary selection;
- tool selection;
- deck/labware canvas;
- contextual right pane.

The main run canvas SHOULD support selections at several levels:

```text
Run → deck → labware → well or region → event → material or operation
```

The selected subobject refines the right-pane context, while the run remains the containing context.

For example:

```text
Active object: Run 421
Selected object: wells A1–A6
Selected event: add rotenone
```

### 6.4 Run semantics and control assertions

The Details pane MUST support semantic interpretation of the event graph, not just raw form fields.

Example context:

```text
cells
+ growth medium
+ rotenone
+ ROS-indicating dye
+ incubation
+ fluorescence acquisition in the dye-compatible channel
```

The knowledge layer may infer or suggest:

```text
These wells constitute a positive control for mitochondrial ROS detection.
```

The UI MUST show why the assertion was made, including supporting graph facts and provenance.

Recommended presentation:

```text
Role: Positive control

Reasoning
✓ Cells are present
✓ Rotenone treatment is present
✓ ROS reporter is present
✓ Readout channel matches reporter
✓ Expected direction is increased fluorescence relative to vehicle

Source
Derived from event graph
Supported by Claim CLM-42
Suggested by AI

[Accept] [Edit context] [Reject]
```

The system MUST distinguish:

- explicit user assertions;
- deterministic derivations;
- imported assertions;
- AI-suggested assertions;
- accepted versus unreviewed suggestions.

### 6.5 Run evidence and claims

A run SHOULD expose an evidence area where results can be connected to claims using typed relationships:

```text
Tests
Supports
Contradicts
Qualifies
Inconclusive for
```

The system SHOULD allow the user or AI to draft a claim from selected results, but creation or material revision of a claim requires explicit confirmation.

### 6.6 Run right-pane context

The run is the most feature-complete context for the right pane.

- **AI:** understands the run, selected subgraph, protocol state, results, linked claims, and linked projects.
- **Find:** retrieves internal graph objects that can be used or linked in the run.
- **Search:** finds and ingests external vendor or literature material relevant to the run.
- **Details:** displays and edits semantic context, relationships, provenance, control roles, selected-object details, and assertions.
- **Protocol:** displays and executes the run-specific protocol/event graph.

---

## 7. Claims UI

### 7.1 Claim collection

The Claims destination SHOULD provide operational views rather than folders:

```text
Recently updated
Needs evidence
Provisionally supported
Well supported
Contested
Qualified
Superseded
Used by active projects
```

Search and filters SHOULD include topic, material, biological context, project relationship, evidence type, confidence/status, and recency.

### 7.2 Claim workspace

A claim page MUST contain:

- claim statement;
- status;
- scope/context;
- supporting evidence;
- contradictory evidence;
- qualifying evidence;
- related runs;
- literature and imported evidence;
- related claims;
- projects that investigate, use, assume, or depend upon it;
- revision and supersession history;
- provenance.

Recommended layout:

```text
Claim statement
Status and scope

Evidence ledger
  Supporting
  Contradictory
  Qualifying
  Inconclusive

Connections
  Projects
  Runs
  Related claims
  Protocols and resources

History
```

### 7.3 Claim revisions

Claims MUST be historically traceable. Editing wording that materially changes scientific meaning SHOULD create a new revision or superseding claim rather than silently replacing the previous statement.

Example:

```text
Claim 42:
Cytation 5 quantifies dsDNA from 1–500 ng/mL.

superseded by

Claim 67:
Cytation 5 quantifies purified dsDNA from 1–500 ng/mL,
but plasma reduces the linear range to 1–300 ng/mL.
```

### 7.4 Claim right-pane context

- **AI:** summarizes, compares, identifies missing evidence, and proposes discriminating experiments.
- **Find:** retrieves related internal runs, claims, protocols, resources, and documents.
- **Search:** performs literature and vendor research relevant to the claim.
- **Details:** shows scope, typed relationships, ontology links, provenance, and status.
- **Protocol:** shows protocols previously used to test the claim and protocols proposed for future testing. It MUST NOT imply that a protocol is currently executing unless a run is active.

---

## 8. Lab UI

### 8.1 Lab collection

Lab is a single top-level destination with category navigation:

```text
Lab
  Protocols
  Materials
  Labware
  Instruments & Equipment
  People
  Documents
```

Pipettes and automation platforms are included under **Instruments & Equipment**, with filters or subcategories. Automation workcells may have their own view within that category when their complexity warrants it.

The initial implementation SHOULD emphasize:

1. Protocols
2. Materials
3. Labware
4. Instruments & Equipment

People and Training may be implemented lightly and expanded later.

### 8.2 Protocols

A Protocol is a reusable template for an intended event graph. A run instantiates it into actual events.

Example protocol step:

```text
Incubate the plate for 15 minutes at 37 °C with shaking at 300 rpm.
```

Underlying event subgraph:

```text
Transfer plate to heater-shaker
Set temperature to 37 °C
Set shaking speed to 300 rpm
Start 15-minute timer
Wait for timer
Stop shaking
Return plate to bench
```

Protocol UI MUST support:

- versioning;
- editable step subgraphs;
- parameters and optional parameters;
- compatible labware and instruments;
- manual and automation-capable variants;
- provenance and authorship;
- protocol forks with explicit ancestry;
- runs that instantiated a version;
- claims or evidence associated with protocol performance.

Avoid duplicating a “universal protocol” into a “project protocol” merely because a project uses it. Projects should reference or pin protocol versions. A true modification creates a fork or new version with provenance.

### 8.3 Materials

The material model SHOULD support several levels without requiring all levels in every workflow:

```text
Ontology concept
  Rotenone

Commercial product
  Vendor + catalog number + formulation

Lot
  Lot number + received/expiry/storage information

Aliquot or container
  Local identifier + location + use history
```

The UI MUST make ontology-backed identity available but should present normal scientific labels first. Ontology identifiers and mappings belong in Details, autocomplete, and provenance views rather than dominating routine work.

### 8.4 Labware

Distinguish a reusable labware definition from a physical instance.

```text
Labware definition
  Corning 3603 black 96-well plate
  geometry, well layout, optical properties, dimensions

Physical instance
  Plate PLT-004821
  used in Run 421
```

The UI SHOULD allow lightweight operation without serializing every disposable item, while retaining the ability to identify physical instances when traceability is important.

### 8.5 Instruments and equipment

Distinguish model definitions from physical assets.

```text
Instrument model
  BioTek Cytation 5
  capabilities and supported operations

Instrument asset
  CYT-01
  serial number, location, installed modules, status, history
```

Pipettes are equipment assets with volume ranges, compatible tips, calibration/verification history, and availability. Automation platforms and workcells are equipment assemblies with capabilities, deck definitions, devices, and execution adapters.

An instrument asset page SHOULD show:

- identity and location;
- current derived status;
- capabilities;
- linked protocols;
- recent runs;
- calibration and verification state;
- maintenance timeline;
- vendor documents;
- affected claims and projects when status changes.

### 8.6 People

People are needed first for provenance, not necessarily for a complete QMS.

The system SHOULD initially capture:

- who designed a run;
- who performed events;
- who reviewed results;
- who accepted or revised claims;
- relevant training or qualifications, when recorded.

Do not make advanced QMS workflows part of the initial UI unless explicitly requested. The initial scope does not require CAPA, formal approval routing, change-control boards, competency matrices, or broad electronic-signature workflows.

### 8.7 Calibration, maintenance, and training

Calibration, verification, maintenance, qualification, and training are modeled as graph-connected activities that produce evidence and/or alter entity state.

Example:

```text
Calibration Run CAL-2026-0715
  evaluates → Instrument CYT-01
  uses → Fluorescence reference plate REF-03
  instantiates → Calibration Protocol v4
  produces → Calibration measurements and certificate
  supports → Claim: CYT-01 was within fluorescence specification
  valid through → 2026-10-15
```

The green “within calibration” status on an instrument page MUST be derived from current evidence and validity rules, not stored only as an editable checkbox.

If a calibration is later invalidated, the graph SHOULD make it possible to identify:

- runs performed with the affected asset during the relevant interval;
- claims supported by those runs;
- projects depending on those claims.

Training follows the same pattern:

```text
Training activity
  performed by → Person
  uses → Training protocol or material
  generates → Evidence
  supports → Time-bounded qualification claim
```

The UI may initially display these records without enforcing authorization gates.

---

## 9. Contextual right-hand pane

### 9.1 General behavior

The right pane is contextual to the active workspace object and, when applicable, the selected subobject in the main canvas.

Context resolution order:

```text
Selected subobject → active object → linked project or global graph
```

Examples:

- On a project page, the pane is project-contextual.
- On a run page, it is run-focused and may narrow to a selected plate, well, event, or material.
- On a claim page, it is claim-contextual.
- On a Lab entity page, it is resource-contextual.

The pane MUST visibly identify its current scope near the top to prevent ambiguity.

Example:

```text
RUN 421 / plate-1 / wells A1–A6
```

### 9.2 Tabs

Retain the current five-tab concept:

```text
AI | Find | Search | Details | Protocol
```

Use stable internal tab identifiers so display labels can be changed later without migration.

Because **Find** and **Search** are semantically close, their responsibilities MUST be explicit:

- **Find** means internal retrieval from the Computable Lab graph and ingested artifacts.
- **Search** means external research through Exa or other external sources.

A later copy change from **Search** to **Research** is recommended, but not required for the first implementation.

### 9.3 AI tab

The AI tab MUST:

- receive the active object as default context;
- include the selected subgraph when a plate, well, event, or other subobject is selected;
- allow users to add or remove context objects explicitly;
- ground answers in graph objects and identify the runs, claims, events, resources, and documents used;
- propose relationships and assertions without silently committing them;
- preserve a conversation per workspace tab or provide an explicit context switch.

Examples by context:

```text
Project: What changed this week? Which assumption is weakest?
Run: Compare these wells to prior controls. Draft a claim from these results.
Claim: Summarize contradictory evidence. Design a discriminating run.
Instrument: Which recent runs depend on the current calibration status?
```

### 9.4 Find tab

Find is the internal graph browser and object linker.

It MUST search:

- projects;
- runs;
- claims;
- protocols;
- materials;
- labware;
- instruments and equipment;
- people;
- imported and cached documents.

Requirements:

- Default scope is the active object, with a clear option to search the whole Lab graph.
- Results MUST show object type and relationship to the active object.
- The user MUST be able to open a result in a new workspace tab.
- Where allowed, the user MUST be able to link a result to the active object directly.
- Saved project/run views may be found here, but they are views, not hierarchy nodes.

### 9.5 Search tab

Search is the external research interface, currently backed by Exa.

It SHOULD support:

- vendor PDF discovery;
- literature discovery;
- application notes;
- manuals;
- external protocol references;
- import into the internal document/artifact store;
- creation of evidence links to claims;
- attachment to projects, runs, protocols, instruments, or materials.

External search results are not part of the graph until explicitly ingested or referenced.

### 9.6 Details tab

Details is the semantic context and relationship inspector. It MUST NOT be a generic dump of database columns.

Recommended sections:

```text
Context
Roles and assertions
Connections
Status
Ontology mappings
Provenance
History
```

For run selections, Details is especially important and MUST show:

- materials and biological entities;
- treatments and conditions;
- protocol operation;
- instrument and readout settings;
- control role;
- expected result or direction;
- claim relationships;
- origin of each assertion.

Relationship editing SHOULD use verb-based controls:

```text
This run [supports ▼] [Claim 42]
This project [depends on ▼] [Claim 42]
This run [uses ▼] [Protocol v3]
```

### 9.7 Protocol tab

The Protocol tab is run-focused.

On a run it MUST show the instantiated executable protocol and its current execution state. Each step may expose its underlying event subgraph.

Recommended run behavior:

- show current, completed, upcoming, skipped, and failed steps;
- allow parameter resolution;
- show required materials, labware, and instruments;
- show manual versus automated execution;
- surface compiler errors and unresolved capabilities;
- synchronize step state with the event graph.

On non-run objects:

- Project: show linked, pinned, or recommended protocols.
- Claim: show protocols used to generate evidence or proposed to test the claim.
- Protocol Lab entity: open the reusable protocol editor.
- Instrument/material/labware: show compatible or commonly used protocols.

The UI MUST clearly distinguish a reusable protocol template from a run-specific instantiated protocol.

---

## 10. Graph interaction patterns

### 10.1 Object references

Every graph object reference SHOULD use a consistent chip or compact card containing:

- type icon or type abbreviation;
- human-readable label;
- optional identifier;
- relationship verb when shown in context;
- status when operationally important.

Example:

```text
[Run] First Titration  — supports →  [Claim] Bicarbonate raises medium pH
```

### 10.2 Tags and saved views

Tags are untyped retrieval aids. Saved views are reusable queries. Neither should be presented as ownership.

Examples:

```text
Tags: baseline, pilot, Figure 2

Saved view:
project = DHVC
AND material = potassium bicarbonate
AND status = completed
```

### 10.3 Local graph views

A local graph visualization MAY be provided under Details or an Explore action, but it is not the primary navigation surface.

Default local graph behavior:

- one-hop neighborhood;
- filter by object type;
- filter by relationship type;
- expand deliberately;
- show relationship verbs;
- provide “Why is this related?” paths.

Avoid default whole-graph visualizations that become unreadable.

### 10.4 Provenance display

Assertions and relationships SHOULD display provenance categories:

```text
User-entered
Derived deterministically
Imported
AI-suggested, unreviewed
AI-suggested, accepted
Generated by instrument
Generated by compiler
```

The UI MUST never present an unreviewed AI suggestion as an established user assertion.

---

## 11. Migration from the current UI

The attached current-state screenshots show two useful foundations that should be preserved:

1. a tabbed workspace for open projects/runs;
2. a split workspace with a large main canvas and persistent right-hand pane.

### 11.1 Project-page migration

Current project-page concepts:

```text
EXPERIMENTS
  Experiment
    Run

PROTOCOLS
  Project templates
  Experiment protocols
```

Target project-page concepts:

```text
RUNS
  In progress
  Recent
  All linked runs

SAVED RUN VIEWS
  Former experiment groupings

CLAIMS
  Investigates
  Depends on
  Aims to establish

RESOURCES
  Referenced protocol versions
  Materials, labware, instruments, and documents
```

Specific changes:

- Rename **+ New experiment** to **+ New Run**.
- Remove the requirement to select or create an experiment before creating a run.
- Convert experiment containers into saved run views/tags while preserving names and membership.
- Move reusable protocols to Lab; show references/pinned versions in the project.
- Avoid creating separate project-owned copies unless explicitly forked.

### 11.2 Run-page migration

Preserve:

- the plate/deck canvas;
- the run toolbar;
- Plan/Execute modes;
- vocabulary and tool selection;
- the persistent right pane;
- the five current right-pane tabs.

Enhance:

- object-aware right-pane scope label;
- claim linking and evidence actions;
- semantic Details sections;
- protocol template versus instance distinction;
- internal Find across all graph object types;
- explicit external Search ingestion;
- tabs for claims and Lab entities in the top workspace strip.

### 11.3 Terminology migration

The UI object name is **Run**. The word “experiment” may still appear in natural language, imported metadata, tags, or saved-view names, but it is no longer a mandatory schema level or navigation object.

FAIR Study/Experiment mappings may remain available in export or interoperability layers without controlling the working UI.

---

## 12. Recommended route and component model

This section is implementation guidance rather than a strict framework requirement.

### 12.1 Routes

```text
/projects
/projects/:projectId

/runs
/runs/:runId

/claims
/claims/:claimId

/lab
/lab/protocols
/lab/protocols/:protocolId
/lab/materials
/lab/materials/:materialId
/lab/labware
/lab/labware/:labwareId
/lab/equipment
/lab/equipment/:equipmentId
/lab/people
/lab/people/:personId
```

### 12.2 Application-level components

```text
AppShell
  GlobalNavbar
  WorkspaceTabStrip
  ActiveWorkspace
    ObjectToolbar
    MainCanvas
    ContextPane
      ContextScopeHeader
      ContextTabs
```

Primary object views:

```text
ProjectCollectionView
ProjectWorkspace
RunCollectionView
RunWorkspace
ClaimCollectionView
ClaimWorkspace
LabCollectionView
LabEntityWorkspace
```

### 12.3 Context-pane contract

Each active workspace object SHOULD provide a shared context descriptor:

```ts
type ContextDescriptor = {
  objectType: 'project' | 'run' | 'claim' | 'protocol' | 'material' |
              'labware' | 'equipment' | 'person' | 'document';
  objectId: string;
  label: string;
  selectedSubobject?: {
    objectType: string;
    objectId: string;
    label: string;
  };
  linkedProjectIds?: string[];
  permissions: string[];
};
```

All right-pane tabs consume the same descriptor so that their scope remains synchronized.

### 12.4 Workspace-tab state

Each open tab SHOULD preserve:

```ts
type WorkspaceTabState = {
  objectType: string;
  objectId: string;
  title: string;
  dirty: boolean;
  activeContextTab: 'ai' | 'find' | 'search' | 'details' | 'protocol';
  mainViewState: unknown;
  contextViewState: unknown;
};
```

---

## 13. Acceptance criteria

The UI redesign is complete when all of the following are true.

1. The persistent global navbar contains **Projects, Runs, Claims, and Lab**.
2. The existing open-tab workspace supports projects, runs, claims, and Lab entities.
3. A user can open a project and begin a new run in one action without creating an experiment container.
4. A run can link to multiple projects.
5. A run can test, support, contradict, or qualify multiple claims.
6. A claim is universal and can link to multiple projects and runs without belonging to one project.
7. Former experiment groupings are represented as tags or saved run views.
8. Lab provides reusable Protocol, Material, Labware, Instrument/Equipment, and Person entities.
9. Pipettes and automation platforms are represented as equipment/resources and can be selected during run execution.
10. Protocol templates are clearly distinguished from run-specific instantiated protocol/event graphs.
11. The right-hand pane remains persistent, contextual, resizable, and collapsible.
12. The right-pane scope updates when the active workspace tab or selected run subobject changes.
13. Find searches the internal graph; Search performs external Exa/vendor/literature research.
14. Details displays semantic context, typed relationships, assertions, and provenance rather than only database fields.
15. AI suggestions are visibly distinguished from accepted assertions.
16. Calibration, maintenance, and training records can be connected to resources and produce time-bounded status claims.
17. Instrument calibration status is derived from evidence and validity information.
18. The existing run-centered plate editor remains the primary run canvas.
19. Project pages emphasize purpose, linked runs, claims, and resources rather than containment hierarchy.
20. The UI enables graph traversal through search, typed links, AI, and local context without requiring users to organize objects into a single folder tree.

---

## 14. Non-goals for the initial implementation

The following are explicitly outside the initial UI scope unless separately specified:

- a whole-lab graph visualization as the default interface;
- mandatory FAIR Study/Experiment hierarchy in the working UI;
- a complete regulated QMS;
- CAPA workflows;
- formal change-control boards;
- complex electronic-signature routing;
- mandatory training authorization gates;
- a requirement to serialize every disposable item;
- automatic acceptance of AI-generated claims or relationships.

The schema may retain enough provenance and evidence structure to support future QMS capabilities without making current bench work feel administrative.

---

## 15. Summary mental model

```text
Projects express why work is being done.
Runs record and execute what happened.
Claims express what the evidence suggests is true.
Lab describes what the laboratory can use.
Metadata and typed relationships connect all four.
Search and AI traverse the graph.
```

The application should not ask users where an object belongs. It should help them state what the object is connected to and why.
