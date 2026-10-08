# Conversational biology workspace: navigation | investigation | persistent agent

Status: Revised design and implementation plan; implementation is not authorized by this document alone.  
Original plan: 2026-09-07. Revised against Brad's subsequent discussion and the current checkout.  
This revision replaces the original task sequence and riff addenda, including the prose-parsed jump mechanism, protocol-only delivery scope, and assumptions about compilation on Accept.

## Implementation status — shipped on `main` 2026-09-08 (Brad: "implement the plan")

Brad authorized full implementation ("I consent to any changes you need to make to implement the plan") and asked that prior subagent work be checked first. Shipped-to-date commits (all browser/test-verified):

- `5c8de1b` + `7e6d8ef` — **Gate A, Phase 4A: deterministic compile-before-commit at step-accept.** `RealizationCompileGate` runs the reviewed `{events, labwares}` through Ajv event-graph schema + lint + reference-connectivity before commit; 422 `REALIZATION_NOT_ACCEPTED` keeps the draft. Client `handleAccept` awaits durable success before `commitPreview()` (UI flips "accepted" only on success); findings surface inline. Live-verified via curl (dangling ref 422, valid mint 200); test records cleaned up.
- `215c785` — **Phase 2 / §5.3 observability: the AI's tool trail renders in chat.** `assistStream` forwards `tool_call`/`tool_result`/`pipeline_diagnostics`/`draft`; `useChatThread` routes them into a per-turn `ChatState.trace`; `MessageLog` renders it under the assistant bubble. Playwright `app/e2e/ai-observability-trace.spec.ts` passes (chromium), asserting the trace renders with real send through the TipTap composer.
- `41c3bd5`+`b4d95b1`+`e744c4e`+`4d142cf` — **Phase 3: the three-pane agent harness is LIVE.** `AppShell`/`WorkspaceMain` render a resizable `PanelGroup [nav | action | chat]` when `navPane` is supplied (two-pane path byte-identical). Left = `ProtocolNavPanel` (step CONCEPTS from the shared `ProtocolSelectionContext`, click to focus a realization on the deck); right = `AiTabPanel` under a live `ChatContextHeader` ("EDITING: Step N — concept", derived from the resolved step never AI prose); `RunProtocolStepsLoader` publishes the run protocol steps eagerly on load so navigation is ready without the Protocol tab. Browser + Playwright `app/e2e/three-pane-harness.spec.ts` (4/4) verify it.
- `e822f8f` — **SOUL.md's "never a third pane" rule FLIPPED** for the run/deck + analysis harness surfaces (two-pane retained for every other endpoint), per decision rule 10 — docs follow shipped code.

Deferred (not yet built): Scenario C, and Scenario B (data-gated on real Ct observation coverage per Gate B / §4B).

## 1. Purpose and product promise

This plan is an **agent harness for biology** — a harness over *deterministic machinery we already have*, not a fresh architecture.

The scientist walks in and wants to get work done: plan the day's experiment, dispatch toward it, and — because they're used to notebooks and still a little distrustful of AI — *inspect the deterministic truth beneath everything the AI says or does*. They don't want to hunt through menus for the correct sequence to launch a GC-FID read. They want to *say it*, have the work happen, and then **dig into** the compiler, the plate/bench viewer, and the dilutions with their own eyes — details they trust and read naturally, even though they can't read code.

So the contract is: **the chat window runs the app; every surface is a deterministic utterance away; and the scientist can confine the AI's context to one aspect with a click.** All of that is *surfacing and making legible* the deterministic context, compute, and record machinery this project already holds.

Three things anchor the framing:

1. **Most of the mechanism exists.** The declarative surface registry + `SurfaceContext` (`{surface, active, selection, prompt}`), the analysis surface (`/analysis`, script methods, immutable revision→run→artifact, chained analyses, storage `data-reference`s), and the agentic `AgentOrchestrator` + MCP `ToolRegistry` are already built. The genuinely *new* work here is small and specific: (a) a **three-pane shell** that makes the permanent conversation + live context header real, and (b) proving the **deterministic-compile-before-commit gate** at the exact step-edit boundary, which today is `commitPreview` → persistence and is **not yet demonstrated** to be a full compiler guarantee.

2. **Two coeval delivery scenarios give the harness its proof, not its identity.** (A) *Change an experiment* — "in step 3, seed two T25 flasks with 100,000 cells each"; (B) *Learn across experiments* — "average Ct for SD1 over three months, binned by cell type/treatment/concentration." Both run through *one* conversation. Scenario B is a complete analysis workflow and is not a navigation demo; nevertheless its **data coverage is unproven** (distinct Ct observations must be inventoried in Phase 0) — the plan stages B as *designed/deliverable after that discovery*, never silently promising an ungrounded Ct pipeline.

3. **The compiler is the leash; local is the default.** The event-graph output must compile through the deterministic compiler before it is even a ghost — a hard gate with a readable rejection reason, not a soft human-OK-later. And the system runs on a locally configured model (qwen 3.5B-A3B class); data never leaves the lab by default, external inference is an explicit opt-in, and there is no silent fallback that ships data out.

## 2. Authority, continuity, and exclusions

Read `specifications/computable-lab-principles.md` as the canonical foundation and `specs/ai-haness.md` as the originating vision. Biological context, material provenance, controlled vocabulary, declarative policy, YAML records, and scientist-owned data govern this work. For knowledge authoring also read `docs/knowledge-layer-canonical-example.md`.

Recent continuity sources (paths relative to this plan):

- `2026-09-06_214008-per-step-subgraph-realization-model.md`: **step concept → referenced realization**, already implemented in substantial part. Preserve it. The indicator identifies the concept being realized; containment is an implementation concern, not the product's organizing model.
- `2026-09-07_003000-investigate-protocol-selection-context-divergence.md`: nested provider root cause and completed fix. Do not reopen it based on the investigation's superseded hypotheses.
- `2026-09-07_193923-editable-setup-combobox-per-step-prompt.md`: editable setup and per-step prompting. Consolidate its conversation into the persistent chat while preserving direct editing and setup capabilities.
- `2026-09-07_184953-promote-run-keeps-event-graph-localized-run-tab.md`: preserve realized event graphs on promotion and step references to other protocols. Its localization-before-attachment proposal was subsequently reversed; current approved universal protocols can attach before localization. Do not restore that gate.
- `2026-09-07_save-saveas-promote-run-tab-approved.md`: preserve current Save/Save As, approval, and attachment behavior; verify current predicates rather than copying contradictory historical examples.
- `2026-09-05_143000-surface-context-small-model-corpus.md`: reuse declared surfaces, surface context, local lab identity, and accepted-work corpus hooks. Generic component-tree page building remains deferred.
- `2026-09-05_150500-analysis-surface-slice-a.md`, `2026-09-05_153000-storage-instrument-analysis-surface.md`, `2026-09-05_170500-analysis-model-lifecycle-chained.md`, and `../../specs/analysis.md`: reuse analysis revisions, runs, storage-backed artifacts, and ViewSpecs; verify implementation rather than assuming every task is complete.

The user's three-pane direction supersedes SOUL.md's historical prohibition for participating agent workspaces. Update that guidance during implementation. Existing nonparticipating routes retain their layouts until deliberately integrated. Preserve the full-page vendor-PDF review/extraction experience and back navigation.

This work does not redesign protocol layers, material identity, the knowledge model, instrument execution, or analysis storage. It does not create a general page builder, a second compiler, a second agent runtime, or a parallel proposal system for every surface. An accepted plan is not evidence of execution; an analysis result is not automatically an accepted assertion.

### The Computable-Lab boundary: the knowledge graph supplies meaning

Both scenarios operate through CL's existing scientific schemas and recorded relationships. The AI interprets intent, resolves terms through tools, and proposes declared operations. It is not the scientific database, the source of biological annotations, or the numerical calculator.

For the Ct investigation, follow measurement/data-reference provenance to the measured subject and its biological `context`, material concept/formulation/instance/aliquot hierarchy, and `measurement-context`. Use existing well-group and role relationships where relevant. Group labels and concentrations must be traceable to those records and their temporal state. If the required link or property is absent, declare the missing fact and, when necessary, extend the relevant schema/lint/UI contract before implementing its adapter. Do not build a parallel AI-inferred table of biological truth.

Preserve the existing knowledge model: a `claim` is a reusable proposition; an `assertion` applies a claim to specified contexts; an `evidence` record links results and sources to assertions; a `context-role` describes a biological role; a `mechanism-model` organizes claim-backed relationships. A grouped Ct table can remain an analysis artifact without inventing a claim. If the scientist asks whether it supports an assertion, evaluate the actual contexts, role prerequisites, measurement method and quantitative result, then propose evidence using those existing schemas. Well position alone never establishes biological meaning.

Numerical work is deterministic query execution or the existing versioned analysis runner operating on frozen, schema-described inputs. AI-authored Python is an inspectable method artifact with declared inputs, parameters and provenance; syntax validity alone does not establish scientific correctness. Cohort rules, mappings, exclusions and lab policy remain declared data, and known-answer tests verify the computation. Do not force arbitrary analysis into experimental PlateEvents, and do not bypass the knowledge graph to have an LLM invent joins, measurements or statistics.

## 3. Implementation baseline: observed, proposed, and unproven

These are source observations, not a fresh live-model or browser verification. The working tree contains extensive existing changes; implementation must inspect current state before edits and preserve unrelated work.

| Area | Observed implementation | Required delta / limit |
|---|---|---|
| Shell | `app/src/shared/shell/AppShell.tsx`, `app/src/run/RunWorkspaceShell.tsx`: two-pane workspace; no `app/src/agent` directory at inspection | Add three-pane composition for participating run/deck and analysis workspaces |
| Context/navigation | Shared `SurfaceContext`, `schema/registry/surfaces/surfaces.yaml`, `openContent`, `ProtocolSelectionContext`, StepIndicator | Persistent, validated working focus across turns and surfaces; registry paths must match actual routes |
| Workspace chat | `AiTabPanel`, `useChatThread`, existing draft-to-preview and revision handling | Conversation is per mount; step investigation has a separate chat loop; consolidate and persist |
| Agent | `AgentOrchestrator`, `ToolRegistry`, `ToolBridge`, `/api/ai/assist/stream`; MCP tools can execute in-process | Default forced-draft mode excludes lookup tools; conversation/lookup versus drafting needs explicit routing |
| Stream | `server/src/ai/types.ts` AgentEvent emits `toolName/args`, `toolName/success/durationMs`, and event drafts | Client `assistStream.ts` drops tool calls/results/drafts/diagnostics. Current tool frames lack call IDs and resolved-result payloads; don't implement the old plan's invented wire shape only on the client |
| Realizations | `subGraphRef`, step graph GET/POST routes, focused preview, manual/AI editing; schema permits graph and protocol references | Preserve concept → realization; verify recursive protocol-reference consumers and diagnose cycles/unsupported refs rather than assuming schema acceptance implements expansion |
| Preview ownership | `ProtocolPreviewBridge` and AI callbacks both write `state.preview` | Distinguish inspection of accepted realizations from pending proposals; switching focus must not overwrite another draft |
| Accept | `StepInvestigationPanel` calls `commitPreview` before persistence callback; step POST creates EVG then updates step ref | No demonstrated full compiler-before-commit guarantee here; implement it, await durable success, check both writes, retain draft on failure |
| Threads | `AiThreadStore` persists per-user/endpoint JSON; conversation schema promotes threads into YAML records | Stable conversation identity, restart recovery, YAML durable source; migrate/reuse rather than another chat store |
| Search | `GraphQueryEngine`, `GraphProjector`, `CollectionService`, YAML graph-query schema | Handles are in-memory; not frozen analysis inputs. Verify coverage and projection identity before using search as a cohort |
| Aggregation | `AggregateQuery.groupBy` is a single string; `execAggregate` calls find with limit 500 | Complete retrieval and joint grouping by three dimensions are missing from this path |
| Time | QueryScope types expose from/to; inspected `inScope` checks containment, not dates | A date field in a request is not proof of date filtering; implement and test actual measurement-time predicates |
| Measurements | GraphProjector derives measurement nodes from read-event details, keyed by graph/labware/channel | Not proof of distinct actual per-well Ct observations; establish ingestion-to-observation joins and stable identities |
| Analysis | `app/src/analysis/AnalysisPage.tsx`, `analysisAuthoring`, `analysisService`, `analysisRunner`, `artifactPromotion`, Python SDK; analysis/view schemas | Connect the conversational cohort to frozen inputs and existing execution/rendering; do not replace with event drafting |
| Labware | Editor supports `flask_t25`; requirement conversion lacks a flask mapping; generic 25 mL flask YAML exists | Editor support is not a resolved T25 definition. A 25 mL flask is not interchangeable with a T25 culture flask; no silent fallback |

## 4. Common interaction and context contract

### 4.1 Three related contexts

- **Working focus:** what the scientist is discussing or changing, identified by real refs, stable subobject IDs, and revisions.
- **Supporting information:** related records, source documents, lookup results, and datasets used to understand that work.
- **Biological context:** scientific state and provenance represented by existing context/material/measurement records. It is not the UI SurfaceContext.

Extend the existing SurfaceContext contract in YAML first. Separate persistent focus from the per-turn prompt. Each turn captures its conversation ID, turn ID, focus/version, selected refs, supporting refs or snapshot identifiers, and pending proposal ID/revision where applicable. Server-resolved state is authoritative; client labels are advisory.

A protocol focus includes the owner record, step ID, concept text, realization ref/revision, setup, and relevant incoming state. An analysis focus includes the cohort/query ref, method revision, run/output refs when present, and parameters. Do not put the entire lab history into the model context; retrieve bounded relevant information and pass dataset handles to computation.

Clicking a step or cohort establishes focus and renders it without calling the model or injecting a synthetic user message. Focus rides with every subsequent turn. Opening supporting material does not silently retarget pending edits. Explicit “work on this instead” changes focus; the header reflects the resolved target. Record focus transitions for recovery and provenance.

A turn started on step 1 remains attached to step 1 if the user visits step 2 before it finishes. Its result is retained under its original target and may offer a Jump action; it must not replace step 2's draft. Returning to an investigation restores its pending work. Manual changes invalidate/rebase dependent drafts explicitly.

### 4.2 Shared lifecycle, surface-specific work

Understand intent → resolve references and inputs → inspect or propose → validate/compute through existing domain services → render → refine → retain the result and its provenance.

The agent may answer in prose, perform read-only lookups, request clarification, navigate, draft a realization, define/run an analysis, or propose a scientific record change. A pending draft does not force every subsequent question into a revision.

Scientific edits require explicit acceptance. A user's request to calculate authorizes routine bounded analysis execution under configured policy; do not add a mandatory “approve cohort” click to every fully specified analysis. Show the cohort/method and support interruption/refinement. Ask when ambiguity materially changes the answer or a required policy/input is missing. Durable analysis execution records may be created as part of that authorized computation; publishing an assertion/evidence relationship or changing experimental records is a separate action.

## 5. Declared actions and agent execution

### 5.1 YAML before TypeScript

Define a small YAML action contract and extend the existing surface registry with supported capabilities, target kinds, input/output schema refs, validation requirements, and effect/review policy. Define lint and UI specs for new record kinds; reuse shared datatypes for nonrecord transport values. Generate or mechanically check TS mirrors against YAML. Ajv remains the structural authority; the lint engine interprets declared business rules. Do not grow another independent validator at the tool boundary.

Initial capabilities must cover both examples: focus/open an existing surface, resolve/search/read, draft/revise a realization, assemble/freeze a cohort, define/run an analysis, and inspect a result. These are required semantics, not assumed existing tool names or a mandate for one new tool per verb. Map each to an existing service and add only missing adapters.

Navigation is structured output, validated and resolved against registered surfaces. Do not scan markdown fences or hidden HTML comments to execute instructions. Unknown targets produce an explainable result. The same navigation service serves clicks and agent actions. Jump buttons reuse those actions; explicit navigation requests may navigate directly. Model-authored notes cannot override the authoritative focus label.

### 5.2 One backend loop, domain-specific services

Reuse `/api/ai/assist/stream` and the in-process tool registry. MCP is an optional exposure of the same services, not a second channel needed to manipulate panes. Account for the configured gateway path; local and gateway adapters must honor the same declared contract.

Separate conversational orchestration from structured drafting. The conversational agent can look up actual records and respond without mutation; requested realization work invokes the existing draft capability. Analysis invokes the existing query/authoring/runner services. Specify routing in declared capabilities/policy, not hardcoded keyword rules. Forced output may constrain the terminal drafting operation; it must not remove investigation tools from the whole conversation.

Declare bounded turns, tool budgets, context retrieval limits, and failure behavior in configuration. User-visible traces show actual operations, retrieved identities, omissions, diagnostics, and concise explanations; do not substitute hidden model reasoning or fictional tool calls for evidence.

### 5.3 Stream contract

Version and validate a compatible extension of AgentEvent before changing the client. Add correlation IDs for turns, calls, proposals and targets, and compact resolved-result summaries/ref links. Match real backend fields and preserve compatibility deliberately. The current `draft` contains events only; labware/final draft data currently comes through `done.result`. Assemble one versioned proposal and avoid staging it twice when both events arrive.

Teach assistStream, chatReducer, useChatThread and MessageLog to preserve/render tool events and pipeline diagnostics. On timeout/cancellation/failure retain completed findings and distinguish an interrupted turn from a successful result. Test parallel calls with the same tool name, out-of-order completions, and stale-target delivery.

## 6. Proposal, validation, and persistence contract

Use one shared proposal envelope with domain-specific payload refs. First inventory existing conversation metadata, graph draft/patch shapes, and analysis records; document what is reused and why any new durable record kind is necessary. Do not create a parallel scientific model.

Required envelope semantics: stable identity/revision; originating conversation/turn; target and base revisions; explicit append/replace/update operations; exact proposed payload or immutable payload refs; dependencies; resolved references; unanswered questions; validation report refs; previous revision; and draft/blocked/ready/accepted/rejected/superseded/stale outcomes. Mutation scope is enforced on the server, not just in a prompt.

For experimental proposals:

- Compile the structured proposal directly through the applicable deterministic pipeline and run schema/lint/reference checks before marking it ready. Incomplete drafts may be shown as incomplete; ghosted does not imply validated.
- Never round-trip a reviewed graph through prose to regenerate a different graph. Any material change produced by compilation becomes the next reviewable proposal.
- Recheck target/base versions and applicable rules on acceptance. Commit the exact reviewed revision; retries must not duplicate events or records.
- Persist all required objects and realization links consistently through the existing store/repo APIs. Check every write result; specify a transaction or recoverable commit protocol where multi-record atomicity is unavailable. Do not update the UI to “accepted” before durable success.
- Keep the draft on failure. Reopen the accepted realization from records and recover its conversation linkage.

Schema validity, lint findings, compilation success, and biological uncertainty are different states. Missing biological facts must not become invented defaults. Domain policy and labware definitions come from YAML. Mathematical algorithms and generic execution machinery remain code interpreting explicit inputs and method definitions.

Persist conversation messages, scope transitions, concise tool outcomes, proposal revisions, and accepted links in schema-backed YAML or references sufficient to reconstruct the work. Reuse/migrate the existing thread API/store and conversation schema; per-endpoint JSON and component memory may be compatibility caches, not the only durable source. Specify stable conversation IDs independent of endpoint, route, or component mount, migration of existing history, safe concurrent appends, and restart recovery. Context compaction must retain original history and provenance refs.

Records remain YAML; raw measurements, images, and model binaries remain on configured storage devices with immutable data-reference identities/hashes. Do not force scientific bytes into YAML or git. Accepted results must remain usable without a model or its transient cache.

## 7. Scenario A: discuss and realize a protocol concept

1. Attach an approved protocol using current behavior; localization is not an attachment prerequisite. Select a step; display the concept and its committed realization, otherwise an explicitly derived realization.
2. Ask a question such as “Do we have a T25?” The agent resolves library/ontology records and can answer without changing the realization.
3. Request the T25/HepG2/DMEM+FBS change. Carry concept text, current draft/realization, setup and prior relevant biological state. Resolve concept/formulation/instance/aliquot distinctions; surface missing biological state as unknown.
4. Create a draft realization with labware and material refs; show additions, changes and removals on the existing event/deck renderer. Support inspection of contents, quantities, concentrations and provenance. Related steps may provide context without becoming edit targets.
5. “Use a T25 instead of the 24-well” revises the held draft, preserving all earlier accepted constraints and stable identities where applicable. A question about the draft may remain prose-only.
6. Accept through section 6 and link the committed realization using the existing subGraphRef model. Existing append semantics must not turn a requested replacement into duplicates. Refresh navigation from records; pending-state badges may come from proposals but cannot masquerade as saved truth.
7. Direct deck editing uses the same target, validation and persistence semantics. Remove the redundant inline conversation only after permanent chat supports the whole workflow.

Preserve step realizations supplied by another protocol/local-protocol. Verify resolution and cycle handling before claiming support. Display which owner/version will receive a change; maintain existing protocol/run distinctions and never rewrite historical execution through a reusable-protocol edit. This plan does not require a lifecycle redesign as a prerequisite.

The T25 regression must test both a valid declared definition and its absence. Diagnose the original wrong-vessel response from actual request/result traces. Do not “fix” the regression by silently adding a guessed seed or treating a generic 25 mL flask as a T25. New library definitions are declared data with verified properties/provenance.

## 8. Scenario B: mean Ct across three months, grouped by biological conditions

### 8.1 Resolve the scientific question

Use the scientist's actual phrase, including “SD1.” Resolve the assay/gene target through recorded identifiers, ontology and assay metadata; do not silently substitute SCD1 or another target. Ask only if unresolved or materially ambiguous.

Resolve “last three months” to explicit start/end timestamps, timezone, boundary convention and the relevant **measurement acquisition time**. Show these in the interpretation. Use declared lab conventions when present; distinguish rolling three calendar months from 90 days. Record the selected target/assay identities and temporal interpretation.

Honor mean Ct as requested. Do not silently convert to delta-Ct, delta-delta-Ct, fold change, or expression abundance. If those are requested later, create the corresponding method revision with explicit reference targets and normalization parameters.

### 8.2 Establish a complete, auditable cohort

Trace actual observed values from their ingestion/data-reference source rows through assay/channel, measurement/read occurrence, well identity, run, and biological context at the relevant time. A planned read or projected graph node without an observed Ct value is not a measurement result.

Specify and verify per-observation identity, including repeated reads and multiple targets in the same well. Do not collapse observations sharing a graph/labware/channel key. Join on recorded identities/provenance, never filename resemblance or model guesses. Inventory the actual qPCR ingestion coverage first; implement a bounded missing adapter if required, or report absent source data honestly.

“All wells” means the complete eligible cohort within the scientist's authorized scope. Implement complete pagination/streaming/materialization with completeness metadata and count reconciliation. Remove the 500-item aggregate truncation from this path; increasing an arbitrary limit is not a complete solution. Implement actual acquisition-time filtering rather than assuming QueryScope.from/to is enforced.

Resolve cell type, treatment identity (including explicit combination treatments), and treatment concentration from scientific context/provenance. Concentration must specify analyte, units, basis and time/state; do not substitute source-stock concentration for the well's treatment condition. Record unit conversions and derivation refs. Missing annotations, unknown concentrations and incompatible units receive explicit unknown groups or declared exclusions with counts, never silent defaults.

Freeze the query, resolved membership, relevant source versions/hashes, projection/join policy version and source-row provenance into a reproducible cohort input using existing data-reference/storage/collection facilities where suitable. An in-memory CollectionService handle is insufficient. Preserve both the query for future refresh and the membership snapshot for this answer. New source data must not change a completed analysis silently.

### 8.3 Compute and render

Jointly group by **cell type × treatment × concentration**, with explicit categories for controls and combination treatments. Define exact-value grouping versus requested concentration bins; preserve units and bin edges. Do not implement this as three unrelated one-dimensional aggregates.

Declare the observation/replicate unit and weighting. For “all wells,” expose well-level weighting rather than silently averaging experiment means; if multiple technical reads represent one well, apply a declared resolution rule or clarify. Distinguish wells, technical replicates, biological samples and independent runs in counts. Declare handling of undetermined/non-numeric Ct, missing values, failed QC, repeated measurements and outliers. Never substitute zero or a cycle cutoff without a declared method.

Reuse the existing query engine where adequate and analysis-revision/run/runner where computation requires it. Close the single-group-field and cohort completeness gaps rather than asking the model to calculate the averages. For this acceptance scenario, preserve the exact analysis method, frozen input refs, parameters, runtime/library versions and any random seeds as applicable. Existing Python methods are valid analysis artifacts; experimental event-graph compilation is not a universal substitute for analysis validation/execution.

The main surface displays the grouped mean Ct, valid observation count, wells/runs represented, missing/excluded counts and a declared variability measure. Use existing ViewSpecs/renderers; a table suffices initially, with a static-figure fallback for richer plots. Clicking a bin exposes every contributing measurement and its source/context. The conversation summarizes computed artifacts and links to them; numbers must come from tool results, not generated prose.

An explicit calculation request permits a routine bounded run once its interpretation is sufficiently grounded. Cohort and method are inspectable without imposing a redundant confirmation wizard. Material ambiguity or absent required policy prompts a focused question. Results are labeled provisional where relevant; they do not automatically publish evidence or assertions.

### 8.4 Refine and retain

“Split HepG2 by passage,” “exclude this failed run,” “show individual experiments,” and “use normalized values” create new cohort/parameter/method versions as appropriate, linked to prior work. Sorting or zooming an existing view requires no model call or scientific rerun. A parameter change reuses an unchanged method revision; a method change creates a new revision with parentRevisionRef. Previous results remain inspectable.

Support opening a contributing experiment, inspecting its biological context, and returning to the analysis without losing conversation, cohort, or outputs. Unsupported operations and absent data produce useful diagnostics, not invented measurements. General evidence authoring uses the existing claim/context/assertion/evidence model and remains separate from merely running an analysis.

## 8.5 Scenario C: navigate across surfaces through one conversation (the shared-interaction proof)

Scenarios A and B are staged as parallel proofs; neither demonstrates the plan's central claim that *one* conversation owns both surfaces. This small, navigation-only scenario is the chain across them: a scientist moves from protocol work, into an existing analysis run, inspects an actual output artifact, and returns to the protocol — without losing the conversation, the held focus, or pending work.

1. From the protocol conversation, request "open the [[assay name]] analysis we ran last week and show me its output." The agent resolves the analysis run through recorded identities and the surface registry, opens it in the center pane, and establishes it as the working focus. No realization is drafted and no scientific record is changed by this navigation.
2. Drill into one **actual output artifact** of that run (a rendered ViewSpec, a storage-backed data-reference, or a plotted bin from a completed analysis). The agent reads the artifact from its declared source and renders it through the existing analysis run/output-artifact/view-spec renderers — not from generated prose.
3. Return to the protocol ("back to step 3") without a new request for the realization. The conversation retains step 3, its concept text, the current realization/draft, setup, and resolved references; the pending draft — if any — is untouched and returns on re-focus. Focus transitions are recorded for recovery and provenance.
4. Confirm the anchoring rules of §4.1 hold across the jump: a pure navigation click or instruction issues **no model call**; the header's authoritative label derives from the *resolved* target; an AI-authored note explains but never overrides focus; and opening supporting material (the run, the artifact) does not silently retarget pending edits on the protocol step.

The explicit deliverable is the chain, not the separate legs: protocol → analysis run → artifact → back to protocol, all in one conversation with focus preserved. Because the live store currently holds 0 `analysis-run` and 0 `data-reference` records (Phase 0 gate B), this scenario is executable today only against a run created by the Phase 4B path; until then it functions as a coverage marker and must be re-scoped to "data coverage first," never demoed on a fabricated artifact.

## 9. Three-pane composition

| Pane | Shared responsibility | Protocol example | Analysis example |
|---|---|---|---|
| Left | Navigate related work and inspect provenance/history | Concepts, steps, referenced protocols, setup links | Cohort, source runs, method/run history, artifacts |
| Center | Inspect and directly manipulate the current work | Event/deck realization and ghost changes | Cohort table, method parameters, results and drill-down |
| Right | Persistent conversation and authoritative working focus | “Realizing Step 3” | “Analyzing Ct for [resolved target], [date interval]” |

Extend AppShell; retain its existing two-pane branch. Pane widths are resizable/persisted, use --cl-* tokens, and are responsive. Avoid fixed proportions as a product invariant. Mobile retains access to navigation, investigation and chat without losing state.

Extract navigation from current RightPane/ProtocolTabPanel instead of duplicating its state. Rich Search/Details/TapTab content opens in the center through registered surfaces rather than being squeezed wholesale into a narrow nav rail. The right column should prioritize conversation, with a compact context header; detailed compiler traces and source records open on demand.

Separate the chat session from EventEditorProvider lifetime. A thin deck adapter may use that provider, but analysis must not require a dummy deck, fake run, or event-graph draft. Share one ProtocolSelectionProvider between protocol navigation and deck consumers; preserve the verified nested-provider fix. Central surface changes must not destroy the conversation.

## 10. Delivery sequence and engineering tasks

All phases below are future work, not checked-off accomplishments. The **framing is harness-over-mechanism**: most of what we reach for already exists (surface registry, SurfaceContext, analysis surface + chained revisions, AgentOrchestrator + MCP tools, storage data-references, PlateMapExporter). So the sequence is: **first make the harness actually drive what exists, then prove the one missing guarantee (compile-before-commit), then stage the data-dependent scenario behind discovery.** Use failing behavioral tests before implementation and current repository verification conventions. Commit-sized boundaries follow real contracts rather than one test asserting each component's internal wiring.

### Phase 0 — Confirm interfaces and scientific data coverage (de-risk before building)

- Inventory *what already exists* against every capability this plan touches: surface registry + SurfaceContext endpoints, the `/analysis` route + analysis service/runner/ViewRenderer, the agentic `AgentOrchestrator` + ToolRegistry + `/api/ai/assist/stream`, storage devices + data-reference + plate-mapping, PlateMapExporter. Record observed-working vs planned. Do not re-implement an existing surface.
- Verify the two load-bearing claims that gate the plan's promise:
  - **Scenario A gate:** the current step-edit acceptance path (`commitPreview` → persistence callback → POST EVG → step ref). Confirm exactly where, if anywhere, the deterministic compiler runs before "accepted". This is the proof the plan must add (compile-before-commit) — see Phase 4A.
  - **Scenario B gate:** inventory the ACTUAL qPCR data-reference → measurement paths and whether distinct Ct observations exist. If absent, Scenario B is *designed but ungrounded* — its delivery is re-scoped to "data coverage first", never silently promised as buildable today.
- Capture a real local-model T25 request/response if suitable data/config exists (no speculative seeds or production edits during diagnosis). Record the configured local model + the explicit opt-in path for external inference.
- Decide the smallest record/schema reuse for focus, proposal, cohort and conversation history. Identify missing lint/UI companions on touched kinds without a repository-wide rewrite.
- Exit: a concrete interface map and implementation deltas for BOTH scenarios; **explicitly separate the new shell/compile work from the re-use of existing machinery**; no "analysis later" substitution and no assumption that analysis already stands on real Ct data.

### Phase 1 — Shared declarative contracts and durable state

- Author YAML action, focus, proposal and stream contracts; extend surface registry and existing record schemas as needed; implement generic validation adapters. **Do not add a second validator or a second chat store** — reuse Ajv as the structural authority and the existing thread store/`AiThreadStore` for durable conversation identity.
- Establish stable conversation IDs and durable YAML state, migration from current endpoint threads, target/base revision tracking, concurrent append and recovery behavior.
- Define cohort metadata/identity, temporal semantics, completeness and grouping/replicate policy in data; connect to existing analysis input contracts.
- Tests: schema startup, invalid action rejection, schema/TS compatibility, round-trip recovery, retained provenance, migration and stale-target handling.

### Phase 2 — Conversational orchestration and tools (drive the existing machinery)

- Reuse the existing orchestrator and registry with declared domain capability adapters. Implement answer/lookup/draft/analysis routing **without globally forcing the draft tool** — a prose/lookup turn must answer without mutating; a requested realization invokes the structured draft capability.
- Extend SSE end to end, including gateway compatibility, correlation IDs, resolved findings and diagnostics. **Render actual tool outcomes** and preserve them on interruption; a visible forced-draft call must not masquerade as evidence that the library was searched — show the actual record lookups.
- Consolidate workspace and step chat state; maintain focus and held draft context across turns; expose analysis tools through the same conversation.
- Tests: a prose-only question leaves the proposal unchanged; actual lookup precedes resolution; draft revises the correct target; same-name concurrent tool calls correlate; duplicate draft/done delivery stages once.

### Phase 3 — Three-pane host and registered navigation (the one genuinely new shell)

- Extend AppShell and participating run/deck plus analysis hosts. Decouple conversation lifetime from editor/route mounts. The right column is a **permanent conversation** with a live context header; it is the surface where the chat "runs the app".
- Reuse navigation/openContent and focus state; render resolved header labels deriving from the **resolved target** (not an AI-authored note); use validated structured actions rather than parsing prose.
- Migrate inline step conversation after functional parity. Preserve setup editing, manual realization editing, protocol attachment and standalone PDF review. The PDF extractor stays full-page with its back arrow.
- Playwright: focus without a model request; protocol → analysis → supporting run → analysis preserves conversation and pending work; responsive access; reload recovery; no nested provider regression.

### Phase 4A — Complete realization workflow with a proven compile gate

- Implement owned inspection/proposal layers, declared labware resolution, stable revisions, deterministic validation/compilation and durable checked acceptance. **The deleted-contract point:** every experimental proposal must pass the deterministic compiler and schema/lint/reference checks before it is "ready"; if compilation changes the proposed events, the scientist sees the changed result before committing; failed persistence keeps the draft; update the UI to "accepted" only after durable success.
- Exercise the real subGraphRef path, replacement semantics and direct editing. Verify protocol-reference expansion behavior and diagnostic paths.
- Tests: T25 present/absent, retained material quantities through revision, unrelated step unchanged, stale draft rejected, compile failure and second-write failure retain work, retry idempotency, reopened realization matches accepted payload.

### Phase 4B — Complete cross-experiment analysis workflow (gated on Phase 0 data coverage)

- Implement/finish actual observation retrieval, measurement-time filtering, complete cohort materialization, stable identity joins and immutable source provenance — **only after Phase 0 confirms the Ct observation path exists**; if it does not, this phase begins with an honest coverage report and a bounded missing adapter, not a fabricated pipeline.
- Support joint grouping and explicit scientific policies; connect frozen inputs to existing analysis authoring/execution and validated ViewSpecs.
- Render bins with counts, exclusions, provenance drill-down and conversational refinements; preserve earlier revisions and results.
- Tests: known-answer multi-run Ct fixture with more than 500 eligible observations, three grouping dimensions, unit conversions, date boundaries, repeated reads, missing annotations, undetermined Ct and no-data cases. Assert exact membership and independent expected statistics, not only a successful tool response.

### Phase 5 — End-to-end delivery and documentation

- Run appropriate schema, service, app and Python tests plus app/server typechecks. UI implementation requires committed, repeatable Playwright tests, not only screenshots or manual browser checks.
- Run both scientific scenarios with the configured local model. Record model/profile, relevant configuration, real traces, input refs, results, diagnostics and known limitations without exposing secrets. Stubbed streams establish reproducible UI behavior but do not establish local-model task success. Confirm the local model is the default and external inference is an explicit opt-in (sovereignty).
- Update SOUL.md's historical layout instruction and relevant orientation docs to the implemented state. Add cross-links/supersession notes to affected Hermes plans so later agents do not restore old gates or redundant loops.
- Retain existing configured corpus capture and link accepted context/action pairs where authorized. External sharing is opt-in lab policy; no automatic external telemetry or inference is required.
- Report each scenario separately. Passing the protocol loop cannot mark analysis complete, a shell demonstration cannot mark either scientific workflow complete, and scenario B is complete only when its Ct cohort is grounded in real observed data.

## 10A. Phase 0 exit — interface map and verified gates (EXECUTED)

Inventoried the live checkout (HEAD `3172680`, servers 3001/3091/5174 up) against every capability this plan touches. **Observed-present:** decor surface registry + `SurfaceContext` (`server/src/surfaceContext/`, `app/src/shared/context/`); analysis surface (schemas `analysis-revision/run/output-artifact/view-spec/data-reference`; `server/src/analysis/{analysisService,analysisRunner,analysisAuthoring,artifactPromotion}`, `app/src/analysis/{AnalysisPage,ViewRenderer}`, `/analysis` route); agentic `AgentOrchestrator` + MCP `ToolRegistry` + `/api/ai/assist/stream`; storage (`server/src/storage/{StorageService,LocalMountStorageProvider,S3StorageProvider,acquisition,plateMapping}`); `PlateMapExporter` (`server/src/execution/PlateMapExporter.ts`). All present — **do not re-implement.**

**Gate A — compile-before-commit: CONFIRMED MISSING at the step-edit boundary.** `POST /protocols/:id/steps/:id/subgraph` (`server/src/api/routes/protocol-steps.ts`) reads `{events, labwares}` from the request body, mints an `event-graph` record, and commits the step's `subGraphRef` **directly — no deterministic compiler is invoked.** The deterministic compile machinery exists (`server/src/compiler/scientistIntent/compileScientistIntent.ts`, `server/src/protocol/StepGraphCompiler.ts`, `server/src/compiler/material/MaterialCompiler.ts`) but is not wired into this accept path. This is the exact gap Phase 4A must close: a reviewed draft exists, but "compiled-before-ready" is not demonstrated. The client route confirms `ProtocolTabPanel.onSaveRealization → apiClient.patchStepSubgraph` commits the preview's raw events.

**Gate B — Scenario-B data coverage: CONFIRMED UNGROUNDED.** Live store has **0 `analysis-run` records and 0 `data-reference` records** — no distinct Ct observation pipeline exists yet. Per §1/§4B, Scenario B is *designed but ungrounded*: its delivery begins with an honest coverage report and a bounded missing adapter, never a fabricated pipeline.

**Scenario-A labware:** `flask_t25` is a first-class editor labware type (`app/src/types/labware.ts:126`, glyph `tc-flask`), representable — but there is no **resolved T25 library record** guaranteed, and the AI's resolution trail is invisible. The T25 error is therefore a joint (data + observability) fix, matching §7's instruction to diagnose from real traces, not add a guessed seed.

**Ownership of remaining work (per plan):** reuse everything above; add the action-contract schema + Ajv validation (Phase 1), the three-pane host (Phase 3, the one genuinely new shell), the compile-before-commit gate at step-accept (Phase 4A), and stage Scenario B behind a Phase-0/4B data-coverage report. No second validator/chat-store/compiler.

## 11. Acceptance matrix

| Contract | Required evidence |
|---|---|
| Declarative foundation | YAML schema/lint/UI where applicable; Ajv validation; removing seeded domain data yields an explainable missing-data outcome, not a hardcoded substitute |
| Discussion versus action | Asking about a draft produces an answer with actual lookup evidence and leaves the draft unchanged |
| Focus ownership | Pure selection makes no AI call; every turn has explicit focus; late results stay with the originating investigation |
| Realization | Concept → referenced realization survives AI/manual changes, replacement, failure, retry and reload |
| Experimental truth | Accepted record content is the reviewed compiled revision; historical runs remain intact |
| Complete cohort | More than 500 observations included correctly; explicit measurement date semantics; source-count reconciliation and no silent truncation |
| Biological grouping | Cell type × treatment × concentration, context-time provenance, unit/basis handling, explicit unknowns/combinations |
| Statistical intent | Mean Ct remains mean Ct; replicate weighting and undetermined values explicit; verified counts/means/variability |
| Reproducibility | Frozen membership and source refs/hashes, exact method/parameters/runtime; rerun does not silently query today's changing cohort |
| Surface breadth | Both complete scenarios work through one conversation; analysis uses real analysis artifacts and registered renderers; Scenario C's protocol → analysis-run → artifact → protocol chain preserves conversation and focus |
| Persistence | Reload/server restart restores conversation, focus, pending work and links; transient handles/model memory are unnecessary for replay |
| Sovereignty | Both scenarios run on the configured local profile with external services disabled; missing local configuration is reported honestly |
| Honest failures | Unknown target, absent Ct data, unsupported join/rendering, execution/compile failure and stale base produce actionable diagnostics |

## 12. Open implementation decisions (bounded)

Resolve these during Phase 0/1 with evidence; they do not reopen the product direction:

- Exact extension versus new record kind for durable proposal/focus/cohort metadata, including the migration of existing endpoint-scoped conversation records.
- Available transaction/recovery mechanism across realization creation and owner-reference updates for each repo adapter.
- Which real qPCR ingestion formats and identifiers are present, and the smallest missing observation adapter if needed.
- Whether multi-key aggregation is an additive graph-query capability or a declared analysis method over a frozen cohort; either must meet the same completeness and reproducibility tests.
- Configured lab defaults for date interpretation, replicate handling, QC and concentration grouping; absence is explicit, never a fabricated scientific policy.

The application-wide direction remains an agent harness for biology: conversation directs work, declared capabilities make it concrete, and existing scientific records, computation and inspection make it trustworthy.
