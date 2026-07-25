# Six Divergent Architect Pitches: ELN-Adjacent Experiment Platform

> Generated: 2026-07-24
> Context: computable-lab codebase (Phase 12 workspace, AgentOrchestrator, MCP server with 25+ tools, PyLabRobot, cl-appliance)
> Target: "Normal" labs — 90% manual operations, some automation (plate readers, Opentrons)

---

## Pitch 1: BenchMate — Chat-Native Experiment Companion

**Elevator pitch:** A conversational workspace where biologists talk through experiments step-by-step, and the AI handles provenance, protocol tracking, and deviation capture in real time.

### Core Approach

The entire interaction surface is a chat thread. The biologist says "I'm setting up the Western blot for the knockdown samples today" and the system:

1. **Recalls** the relevant protocol version (from the protocol candidate system)
2. **Lists** what's needed (materials, labware, plate layout) as a structured card in the chat
3. **Guides** through each step with checkpoints: "Step 3 — Load sample plate into well A1-D8. Done?"
4. **Captures deviations** naturally: if the user says "actually I only had 5 samples so I skipped D6-D8", this is recorded as a first-class deviation event linked to the protocol step
5. **Compiles** the full run (plan → deviations → results → conclusions) into a structured event graph

The UI is the Phase 12 workspace, but the **left pane is dominated by the chat thread** with embedded protocol cards, plate maps, and material references. The right pane is AI context (provenance, related runs, literature).

**Interaction model:** Chat-first. Protocol cards are expandable/inline within the conversation. No separate "protocol editor" — protocols emerge from conversations and are versioned automatically.

### Pros
- Lowest friction: biologists already know how to talk; no new paradigms to learn
- Natural deviation capture: deviations are just things you say in conversation
- Leverages existing `AgentOrchestrator`, `AiThreadStore`, and the AI right-pane architecture directly
- The MCP tool suite (ontology lookups, material creation, plate operations) is already callable from the agent
- Protocol evolution is organic: repeated patterns in conversations surface as "protocol improvement suggestions"

### Cons
- No visual protocol editing: hard to see the full protocol structure at a glance
- Chat history can become unwieldy for multi-day experiments
- Hard to collaborate: async chat doesn't translate well to lab bench handoffs
- Compliance/regulatory concerns: chat transcripts are harder to audit than structured records

### Stack Fit
- **Direct fit** with existing architecture: `AiTabPanel.tsx` → `AiThreadStore` → `AgentOrchestrator`
- MCP tools already support: protocol tools, execution tools, material AI tools, run workspace AI tools
- `RunContextAssembler` provides the context window for protocol-aware conversations
- `clarifications.ts` already handles structured clarification requests (menu-based disambiguation)

### Changes Needed
1. **Run-scoped chat threads**: Current threads are per-viewer/PDF. Need experiment-scoped threads that persist across sessions, with the ability to "start a run" that anchors a thread to a protocol version + material set.
2. **Step checkpoint protocol cards**: Rich chat components that render protocol steps with inline checkboxes, material requirements, and plate layout previews.
3. **Deviation event compiler**: When a user's message contains a deviation, parse it and emit a structured deviation event (linked to protocol step + material) into the event graph, alongside the normal execution events.
4. **Protocol diff/suggestion system**: After a run completes, compare the actual execution (with deviations) against the protocol plan and generate improvement suggestions for the next version.
5. **Multi-day experiment state**: Persist partial run state across browser sessions. The run object tracks "current step" and "completed steps".

### Risks & Unknowns
- **Will biologists actually chat through experiments?** Or will they talk to their labmate and skip the chat? This is the core UX risk.
- **LLM hallucination on protocol steps**: If the AI suggests a wrong concentration or step order, the biologist might not catch it. Need strong grounding via MCP tool calls (material lookups, ontology verification).
- **Thread context bloat**: Long-running experiments with detailed chat histories could exceed context windows. Need intelligent summarization or sliding-window context management.
- **Audio/voice quality at the bench**: Chat assumes typing. Bench-side use means gloves, wet hands, or just being in a hurry. Voice input could help but adds complexity.

---

## Pitch 2: Protocol Canvas — Visual Drag-and-Drop Protocol Builder with Live Execution

**Elevator pitch:** A visual protocol editor where biologists build experiments by dragging materials onto a timeline, and the AI fills in the details, warns about conflicts, and executes automatically what it can.

### Core Approach

A dual-pane visual workspace:

- **Left pane: Protocol Canvas** — A timeline/flowchart where each row is a material (plate, tube, reagent) and each column is a step. Materials are dragged onto the canvas; steps are connected by arrows representing transformations. The canvas is the protocol.
- **Right pane: AI Copilot** — As you build, the AI fills in details (concentrations from material definitions, incubation times from similar protocols, plate layouts). It flags conflicts: "You're using the same plate for two incubations at different temperatures."

**Execution mode:** When running the protocol, the canvas becomes a **live run tracker**. Completed steps turn green, automated steps (PyLabRobot-connected) execute automatically and update in real time, and deviations are shown as branching paths on the timeline.

**Protocol versioning:** Every change to the canvas creates a new version. Deviations during runs are captured as "variant branches" that can be promoted to the main protocol or kept as lab-notebook notes.

### Pros
- Visual: matches how biologists think about protocols (flowcharts, timelines)
- Drag-and-drop is intuitive for protocol assembly
- Conflict detection happens during authoring, not during execution
- Natural fit for plate-based workflows (the existing `DeckView`/`PlateGrid` can be embedded in the canvas)
- Protocol evolution is visible: side-by-side diff of protocol versions

### Cons
- High UI complexity: building a drag-and-drop protocol editor is a significant frontend effort
- May not fit all experiment types (e.g., tissue culture, animal work — harder to visualize as a timeline)
- Learning curve: new paradigm, not just "chat" or "fill forms"
- The visual editor needs to handle complex branching logic (conditionals, loops) which are rare in biology but real

### Stack Fit
- **Leverages** the Phase 12 workspace tab system (new `protocol-canvas` tab kind)
- **Reuses** `ProjectionTapTabEditor` concepts for inline material editing within canvas nodes
- **MCP protocol tools** provide the data layer (protocol candidates, event graph drafts, vendor protocol extraction)
- **PyLabRobot integration** via existing `registerExecutionTools` — the canvas dispatches to these for automated steps
- **AgentOrchestrator** runs in the right pane as the AI copilot, with the canvas state as context

### Changes Needed
1. **Protocol Canvas component**: A new drag-and-drop editor (React Flow or similar) that represents protocols as material-timeline graphs. Needs node types for: materials, steps, conditions, plate layouts.
2. **Canvas-to-event-graph compiler**: Translate the visual protocol into the structured event graph format (same output as `runChatbotCompile`). This is the critical bridge — the canvas is just another input surface.
3. **Live run tracker**: When executing, the canvas switches to "run mode" with step status, automated execution triggers, and deviation capture.
4. **Protocol version diff viewer**: Visual diff between protocol versions (added/removed/modified steps, material changes).
5. **AI copilot integration**: Right-pane AI that watches canvas changes and provides suggestions, warnings, and auto-completions via MCP tool calls.
6. **Material palette**: Drag-from palette of known materials (from the material ontology) onto the canvas.

### Risks & Unknowns
- **Build effort**: This is the heaviest pitch UI-wise. Could consume the entire kanban pipeline for months before a usable prototype.
- **Does drag-and-drop work for protocols?** Protocols are fundamentally temporal and conditional — a simple flowchart may not capture nested conditions or parallel tracks well.
- **Tablet/mobile viability**: Drag-and-drop on mobile is notoriously finicky. Bench-side use needs to work on a tablet.
- **AI copilot latency**: Real-time suggestions while building need fast LLM responses. May require the local model (27B on appliance) for responsiveness.

---

## Pitch 3: LabLedger — Notebook-Style with AI-Backed Semantic Search

**Elevator pitch:** A computational notebook for biology — markdown cells, code cells, protocol cells, and result cells — where the AI indexes everything semantically and connects related work across the lab.

### Core Approach

Think Jupyter Notebook × LabArchives × GitHub Issues. The core unit is a **LabLedger** — a structured notebook with cell types:

- **Narrative cells**: Markdown with rich formatting (what you're doing, why, context)
- **Protocol cells**: Structured protocol steps that can be versioned, referenced, and executed
- **Material cells**: Material definitions linked to the ontology (formulation → instance → aliquot hierarchy)
- **Code cells**: Python for data analysis (leveraging PyLabRobot for hardware control)
- **Result cells**: Data imports, plate reads, images — with automatic provenance linking
- **AI cells**: Natural language prompts that the AI answers using MCP tools (literature search, ontology lookup, protocol comparison)

**AI layer:** Every cell is semantically indexed. When you write "the absorbance readings looked off compared to last week," the AI highlights the relevant prior runs, plate data, and protocol differences. When you write "try the Gibson assembly like we did in the CRISPR project," the AI surfaces that protocol.

**Protocol evolution:** Protocols live as cells within Ledgers. When a protocol cell is executed (manually or automatically), deviations are captured inline as annotations. The AI periodically suggests protocol improvements based on accumulated deviation patterns.

### Pros
- Familiar paradigm: biologists who use Jupyter will feel at home; those who use paper notebooks understand the concept
- Rich content: images, data, code, protocols all coexist naturally
- Semantic search makes historical data discoverable in ways traditional ELNs can't match
- Protocol cells are versioned and diffable (like code)
- Natural for mixed-method labs (wet lab + computational analysis)

### Cons
- Notebook fatigue: Jupyter notebooks have a reputation for becoming "spaghetti code" — hard to maintain
- Less structured than pure ELNs: compliance and data integrity concerns
- AI semantic search adds latency: "thinking" before showing related work
- Notebooks don't naturally support parallel workflows (multiple people working on the same experiment)

### Stack Fit
- **New workspace tab kind**: `ledger` tab that hosts the notebook editor
- **TapTab editor**: The `ProjectionTapTabEditor` with TipTap can be extended with cell-type blocks (protocol cell, material cell, result cell)
- **MCP tools**: Literature search (europmc, exa), bio DB lookups (NCBI, UniProt, PDB, Reactome), ontology tools, record tools
- **AgentOrchestrator**: Powers AI cells and the semantic search layer
- **JsonLd index**: The existing `JsonLdIndex` can provide semantic search over all cells across all ledgers

### Changes Needed
1. **Cell-type system**: Extend TapTab with custom cell types (protocol, material, code, result, AI) — each with different editing and rendering modes.
2. **Semantic indexer**: As cells are saved, extract entities and relationships, index into the JsonLd graph. On query, retrieve semantically related cells.
3. **Protocol cell → event graph bridge**: When a protocol cell is "run", compile it into the event graph format and track execution.
4. **AI cell execution**: AI cells send prompts to `AgentOrchestrator` with MCP tools, render results inline (text, tables, links).
5. **Ledger versioning**: Git-backed versioning (using existing `registerGitTools`) with visual diff viewer for cell-level changes.
6. **Cross-ledger references**: Clicking a material reference jumps to the defining cell; protocol references create traceable links.

### Risks & Unknowns
- **Notebook sprawl**: Without discipline, ledgers become unwieldy. Need strong conventions and AI-assisted organization.
- **TapTab extension complexity**: Adding cell types to TapTab is non-trivial — each needs editing, rendering, and serialization.
- **Semantic search quality**: The AI needs to actually understand biological context for this to feel magical. If it suggests irrelevant things, users will stop trusting it.
- **Collaboration model**: Notebooks are inherently linear. How do two people work on the same Ledger simultaneously? Git merge conflicts for protocol cells could be painful.

---

## Pitch 4: RunPilot — Voice-First Bench-Side Execution Assistant

**Elevator pitch:** A voice-driven assistant that guides biologists through experiments hands-free, records everything automatically, and captures deviations as they happen — built for the reality of working at a bench.

### Core Approach

The primary interface is **voice**. The biologist wears a headset or uses a tablet on the bench:

1. **Start**: "RunPilot, I'm starting the lentiviral transduction on HEK293T cells."
   - System identifies the protocol, materials, and creates a run session.
2. **Guidance**: "What's next?"
   - "Step 2: Thaw the virus stock on ice. You have it in box B3, shelf 2. How long has it been thawing?"
3. **Deviation capture**: "Actually the virus stock is old, I'm using the fresh prep from yesterday."
   - System records: deviation on Step 2 material — substituted material. Logs new material reference.
4. **Results**: "The plate read is done. Absorbance values uploaded."
   - System links the data file to the run, checks against expected ranges, flags anomalies.
5. **Wrap-up**: "Done with the transduction. Everything went smoothly except the virus swap."
   - System generates run summary, updates protocol with deviation note, suggests follow-up.

**Voice-first, screen-second:** The screen shows the current step, materials needed, and a transcript of the interaction. The screen is confirmatory, not primary.

**Multi-modal input**: Voice is primary, but the screen supports quick actions (checkboxes for standard steps, photo capture for gel images, file upload for plate reader data).

### Pros
- Matches real bench work: biologists don't want to stop pipetting to type
- Natural deviation capture: deviations are things you say, not things you fill into forms
- Hands-free operation: critical when working with samples, in BSCs, etc.
- Lower barrier to entry: no forms, no forms, no forms — just talk
- Transcript is automatic provenance: every word is recorded and searchable

### Cons
- Voice recognition accuracy: especially with technical terms, concentrations, well positions
- Privacy: recording conversations in open lab spaces
- Ambient noise: fume hoods, incubators, centrifuges — voice quality degrades
- Requires hardware: headsets or always-on microphones
- Hard to review/edit: voice transcripts are verbose and need summarization

### Stack Fit
- **New input modality**: Voice input feeds into `AgentOrchestrator` as user messages, same as text chat
- **AiThreadStore**: Run sessions are threads with voice transcripts
- **MCP tools**: All existing tools are callable — voice is just another input channel
- **clarifications.ts**: Structured clarification requests work well with voice (the AI asks a question, the user answers verbally)
- **PyLabRobot**: Automated steps triggered by voice commands ("run the plate reader", "load this program on the Opentrons")

### Changes Needed
1. **Voice input layer**: Web Speech API or Whisper (local via the appliance) for STT. Needs to handle biological terminology and support continuous listening with VAD (voice activity detection).
2. **Voice-aware UI**: New workspace tab kind `run-pilot` with: current step display, material list, photo capture button, file upload, and live transcript.
3. **Run session management**: Structured run objects that track protocol version, current step, completed steps, deviations, and linked results.
4. **Voice deviation parser**: When a voice message contains a deviation (substituted material, changed parameter), parse it and emit a structured deviation event.
5. **Photo/image capture**: Camera integration for gel images, colony counts, etc. Linked to run steps.
6. **Offline mode**: Voice input and local processing when WiFi is spotty in the lab. Sync when back online.
7. **Audio storage**: Store audio clips alongside transcripts for audit trail.

### Risks & Unknowns
- **STT accuracy for biology**: Whisper handles general speech well, but "0.5 microliters of the 10-micromolar stock" needs to be precise. Misheard concentrations are dangerous.
- **Adoption friction**: Wearing a headset in a lab feels unusual. Need to validate this isn't rejected on social/cultural grounds.
- **Lab noise**: Background noise from equipment will degrade STT quality. Needs robust VAD and noise cancellation.
- **Privacy/IRB concerns**: Recording lab conversations may raise institutional review board issues, especially with student researchers.
- **Audio storage costs**: Storing audio for every run could get expensive. Need aggressive compression and retention policies.

---

## Pitch 5: ProtocolOS — Code-as-Protocol with AI Transpiler

**Elevator pitch:** Protocols are code — versioned, tested, reviewed, and executed — where biologists write intent in a simple DSL that the AI compiles into executable steps, and deviations are handled like runtime exceptions.

### Core Approach

Biologists write protocols in a **biological DSL** (Domain Specific Language) that looks like structured pseudocode:

```
protocol "Western Blot — Knockdown Efficiency" v2.1
  requires:
    cells: HEK293T, passage 5-8, 6-well plate
    antibody: anti-GFP, 1:1000, Rabbit anti-mouse IgG secondary 1:5000
    equipment: BioRad ChemiDoc MP
  
  steps:
    harvest_cells
      detach with Trypsin-EDTA (5 mL, RT, 5 min)
      count cells → must be 1-2 × 10⁶/mL
    
    lyse_cells
      add RIPA buffer (200 µL per well)
      incubate on ice 30 min
      centrifuge 14,000g, 15 min, 4°C
      collect supernatant → protein sample
  
    quantify_protein
      Bradford assay → adjust to 20 µg/µL
      [auto: send to plate reader if connected]
  
    run_gel
      load 40 µg per lane, 8-12% SDS-PAGE
      run at 120V, 60 min
  
    transfer
      wet transfer, 100V, 90 min, 4°C
    
    probe
      block with 5% BSA, 1h RT
      incubate primary antibody O/N, 4°C, shaking
      wash 3× TBST, 5 min each
      incubate secondary, 1h RT, shaking
      wash 3× TBST, 5 min each
      develop with ECL, expose 1-5 min
  
  outputs:
    image: chemiluminescence image (tiff)
    quantification: band intensity per lane
```

**The AI transpiler** converts this DSL into:
- The structured event graph (for provenance tracking)
- PyLabRobot programs (for automated steps)
- A human-readable checklist (for manual execution)
- Validation rules (concentration ranges, equipment requirements)

**Deviations as exceptions:** When executing, if something deviates, it's like a runtime exception:
```
Step lyse_cells: deviation — used 250 µL RIPA instead of 200 µL (ran low on stock)
Severity: minor (within acceptable range)
Impact: protein concentration may be 20% lower
Action: noted, no correction needed
```

**Protocol lifecycle:** Protocols live in git (using existing `registerGitTools`), with PR-style reviews, version history, and automated testing against material availability.

### Pros
- Precise and unambiguous: code doesn't suffer from vague language
- Version control: native git integration, PR reviews, rollback
- Testable: can validate protocols against material availability, equipment constraints
- Composable: import sub-protocols, mix and match like functions
- Appeals to computational biologists and lab directors who think in structured terms
- Natural bridge to PyLabRobot: code → execution is a well-understood pattern

### Cons
- High barrier to entry: most biologists are NOT comfortable writing code, even DSL code
- Rigid: biology is messy, and code protocols may not capture the intuition-based decisions
- Error-prone: typos in concentrations, wrong units — needs strong validation
- May not fit exploratory work: code implies a planned protocol, not ad-hoc experimentation

### Stack Fit
- **Compiler pipeline**: The existing `ai_precompile` pipeline and `runChatbotCompile` can be extended to parse the DSL and produce event graphs.
- **AgentOrchestrator**: Validates DSL protocols, suggests improvements, compiles to event graphs.
- **MCP protocol tools**: `registerProtocolTools`, vendor protocol tools for importing existing protocols into DSL format.
- **PyLabRobot**: DSL steps with `[auto]` markers compile directly to PyLabRobot programs.
- **Git integration**: `registerGitTools` for version control, PR workflows.
- **Validation tools**: `registerValidationTools` for protocol validation (concentration ranges, equipment checks).

### Changes Needed
1. **DSL parser/compiler**: A parser for the biological DSL that produces structured ASTs, then compiles to event graphs, PyLabRobot programs, and human-readable checklists.
2. **DSL editor**: Code editor with syntax highlighting, autocomplete (materials from ontology, equipment from lab inventory), and validation feedback. Could be Monaco/CodeMirror-based.
3. **Natural language → DSL transpiler**: The AI takes a natural language description and generates DSL code. The biologist reviews and edits. This bridges the gap between "talk" and "code".
4. **Deviation exception handler**: Runtime deviation capture with severity assessment, impact analysis, and decision logging.
5. **Protocol test runner**: Simulate protocol execution against material availability and equipment constraints before running.
6. **Sub-protocol import system**: Like `import` in code — reference other protocols, materials, or labware definitions.

### Risks & Unknowns
- **Will biologists adopt code?** This is the biggest risk. Even with AI transpilation, the core paradigm is code-first. Need to validate with actual users.
- **DSL design**: The DSL needs to be simple enough for biologists but expressive enough for real protocols. Too simple → can't capture complexity; too complex → unusable.
- **Validation coverage**: The AI can validate some things (concentrations, equipment) but not others (is the antibody still good? is the cell line healthy?). False confidence from automated validation is dangerous.
- **Edge case proliferation**: Biology has tons of edge cases. The DSL parser needs to handle them gracefully without becoming a tangle of exceptions.

---

## Pitch 6: Experiment Graph — Living Knowledge Graph with AI Curator

**Elevator pitch:** Every experiment is a node in a living knowledge graph — materials, protocols, results, and insights are connected entities that the AI continuously curates, and biologists navigate visually rather than through forms or chat.

### Core Approach

The core mental model is a **graph**, not a document. Everything is a node:

- **Material nodes**: Concepts, formulations, instances, aliquots (respecting the hierarchy)
- **Protocol nodes**: Protocols, protocol versions, steps
- **Experiment nodes**: Runs, with links to protocols, materials, and results
- **Result nodes**: Data files, plate reads, images, observations
- **Insight nodes**: AI-generated or human-written conclusions, hypotheses, connections

The UI is a **graph navigator**:

1. **Start an experiment**: The biologist describes what they're doing. The AI creates experiment, material, and protocol nodes, connected by relationships.
2. **Execute**: As steps are completed, result nodes are added and linked. Deviations create "variant" edges that branch from the main protocol.
3. **Explore**: After the run, the biologist navigates the graph to see connections: "What other experiments used this material?" "How did this protocol perform compared to previous versions?" "What insights from this run connect to other projects?"
4. **AI curation**: The AI continuously suggests connections, flags anomalies, and proposes new hypotheses based on the graph structure.

**Protocol evolution in the graph:** Protocols are nodes with version edges. When a run deviates, the deviation is a node connected to the protocol step. After multiple runs, the AI proposes protocol improvements as new protocol version nodes, with evidence links to the runs that informed them.

**Search as graph traversal**: Instead of keyword search, the biologist asks "show me all experiments that used this antibody and got unexpected results" — the AI traverses the graph to find connected nodes.

### Pros
- Rich semantic connections: captures relationships that flat ELN records miss
- Protocol evolution is visible: version history with evidence-based improvement suggestions
- Cross-project discovery: experiments, materials, and insights connected across the lab
- Naturally handles complexity: graphs are good at representing interconnected, hierarchical data
- The existing JsonLd infrastructure is already graph-oriented

### Cons
- Graph UIs are hard: navigation, zoom, focus — easy to get lost in a large graph
- Learning curve: biologists don't think in graph theory
- Performance: large graphs with many connections can be slow to render and query
- Initial setup: the graph needs to be seeded with enough data before it becomes useful
- Hard to collaborate: graph navigation is personal, not shared — hard to "show someone what you're looking at"

### Stack Fit
- **JsonLd graph**: The existing `JsonLdProjector`, `GraphBuilder`, and `JsonLdIndex` provide the graph infrastructure
- **MCP tools**: All MCP tools operate on the graph (ontology lookups, material queries, protocol operations)
- **AgentOrchestrator**: Acts as the AI curator, suggesting connections, flagging anomalies, proposing improvements
- **Phase 12 workspace**: New tab kind `experiment-graph` with a graph visualization component
- **Material ontology**: The material hierarchy (concept → formulation → instance → aliquot) maps naturally to graph nodes
- **Protocol candidate system**: Protocol nodes with version edges and evidence anchors

### Changes Needed
1. **Graph visualization component**: Force-directed or hierarchical graph visualization (D3, Cytoscape.js, or React Flow) with zoom, pan, focus, and filter. Needs to handle 100+ nodes without lag.
2. **Node type system**: Different visual representations for different node types (material, protocol, experiment, result, insight) with inline editing.
3. **Graph-aware AI curation**: `AgentOrchestrator` with graph traversal capabilities — suggests connections, detects patterns, proposes improvements.
4. **Experiment creation flow**: Natural language → graph creation. The AI creates nodes and edges based on the biologist's description.
5. **Deviation branching**: Deviations create variant edges that can be promoted to main protocol or kept as notes.
6. **Graph search**: Natural language queries that translate to graph traversals (e.g., "experiments using X with unexpected results").
7. **Graph export**: Export subgraphs as protocol documents, experiment reports, or data packages.

### Risks & Unknowns
- **Graph UI usability**: Graph visualization tools are notoriously hard to make intuitive. Risk of "I can't find anything" user experience.
- **Cold start problem**: The graph is only valuable with enough data. Early adopters won't see the benefit until the graph grows.
- **Performance at scale**: Labs with hundreds of experiments, thousands of materials, and millions of data points need efficient graph queries and rendering.
- **AI curation quality**: The AI needs to make genuinely useful suggestions about connections. Bad suggestions erode trust quickly.
- **Biologists' mental model**: Do biologists think in graphs? Or is this imposing a computer scientist's model onto a biologist's workflow? This is a fundamental UX question.

---

## Comparison Matrix

| Dimension | BenchMate (Chat) | Protocol Canvas (Visual) | LabLedger (Notebook) | RunPilot (Voice) | ProtocolOS (Code) | Experiment Graph (Graph) |
|---|---|---|---|---|---|---|
| **Primary input** | Text chat | Drag-and-drop | Notebook cells | Voice | DSL code | Graph navigation |
| **Protocol authoring** | Emerges from chat | Visual builder | Protocol cells | Voice-driven | Code editor | Graph nodes |
| **Deviation capture** | Natural language | Branching paths | Inline annotations | Spoken deviations | Runtime exceptions | Variant edges |
| **Learning curve** | Very low | Medium | Low | Very low | High | Medium-High |
| **Build effort** | Low | High | Medium | Medium-High | Medium | High |
| **Existing code reuse** | High | Medium | Medium | Medium | Medium-High | High |
| **Bench-side usability** | Low (typing) | Medium (touch) | Low (typing) | **High** (voice) | Low (typing) | Low (nav) |
| **Compliance fit** | Low | Medium | Low | Low | High | Medium |
| **Collaboration** | Low | Medium | Medium | Low | **High** (git) | Low |
| **Protocol evolution** | Organic (chat patterns) | Visual diff | Cell versioning | Transcript analysis | Git + PR review | Graph version edges |
| **Best for** | Quick adoption, daily use | Visual thinkers, plate work | Mixed wet/dry labs | Active bench work | Computational labs, compliance | Long-term knowledge management |

## Shared Infrastructure (All Pitches)

Regardless of which pitch is chosen, these foundations are needed:

1. **Run session model**: A first-class `Run` object that tracks protocol version, materials, steps, deviations, results, and outcomes. All pitches need this.
2. **Deviation event type**: A structured event type in the event graph that links deviations to protocol steps, materials, and severity assessments.
3. **Protocol versioning system**: Protocols as versioned entities with diff capabilities and evidence-based improvement suggestions.
4. **Material availability checker**: Before starting a run, check that required materials are available (or suggest alternatives).
5. **PyLabRobot step dispatcher**: A unified interface that dispatches automated steps to connected hardware via PyLabRobot, with fallback to manual instructions.
6. **Result ingestion pipeline**: Standardized data import from plate readers, gel imagers, etc., with automatic linking to run steps.
7. **AI deviation classifier**: LLM-based classification of deviations (minor/major/critical) with impact assessment.

## Recommendation: Start with BenchMate, Evolve Toward Hybrid

The **BenchMate (Chat-Native)** pitch is the lowest-risk starting point because:
- It leverages the most existing infrastructure (AgentOrchestrator, AiThreadStore, MCP tools)
- Lowest learning curve for biologists
- Natural fit for deviation capture
- Can be iterated on quickly

But the end state should be a **hybrid**:
- Chat as the primary interaction (BenchMate)
- Visual protocol cards embedded in chat (Protocol Canvas elements)
- Notebook-style result cells for data analysis (LabLedger elements)
- Voice input for active bench work (RunPilot elements)
- Code-like protocol versioning for compliance (ProtocolOS elements)
- Graph-backed knowledge connections (Experiment Graph elements)

Each pitch contributes pieces to the final product. The key insight: **the interface should adapt to the context** — chat for planning, voice for execution, visual for protocol review, notebook for analysis, graph for exploration.
