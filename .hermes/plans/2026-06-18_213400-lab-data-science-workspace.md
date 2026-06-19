# Lab Data Science Workspace — Architecture Vision Plan

> **For Hermes:** This is a visionary architecture plan, not a tactical implementation plan. Use as a reference for future phased implementation.

**Goal:** Transform the event-editor / run-workspace into a **three-pane Lab Data Science Workspace** where a user can (a) control instruments, (b) visualize results, (c) build ML models, and (d) author knowledge-layer claims — all guided by an AI chat that reasons over the user's _actual data_.

**Architecture:** Extend the existing four-endpoint appliance model with a new `/data-science` surface that unifies visualization, AI, and the knowledge layer. Reuse the python-executor-service for ML pipeline execution. Route AI through the existing surface-aware system prompt builder.

**Tech Stack:** React (frontend), Fastify + TypeScript (backend), PyLabRobot (instrument control), Python executor service (ML pipeline), PyTorch (model building), sentence-transformers (semantic search), TipTap + Recharts (visualization).

---

## 1. What Already Exists (Infrastructure Inventory)

### Instrument Control
| Component | Status | Location |
|-----------|--------|----------|
| pyLabRobot bridge | ✅ Working | `server/python-executor-service/pylabrobot_bridge.py` |
| plr-instrument-service | ✅ Working | `../cl-appliance/` (private repo) |
| SpectraMax Gemini EM backend | ✅ Working | PyLabRobot |
| `instrument-appliance-job` type | ✅ Defined | `server/src/ai/types.ts:265-284` |
| Plate reader ingestion | ✅ Working | `server/src/api/handlers/AIHandlers.ts` |

### Knowledge Layer
| Component | Status | Schema |
|-----------|--------|--------|
| `claim` | ✅ Defined | `schema/knowledge/claim.schema.yaml` |
| `context` | ✅ Defined | `schema/core/context.schema.yaml` |
| `assertion` | ✅ Defined | `schema/knowledge/assertion.schema.yaml` |
| `evidence` | ✅ Defined | `schema/knowledge/evidence.schema.yaml` |
| `measurement-context` | ✅ Defined | `schema/lab/measurement-context.schema.yaml` |
| `mechanism-model` | ✅ Defined | `schema/knowledge/mechanism-model.schema.yaml` |
| `well-group` | ✅ Defined | `schema/lab/well-group.schema.yaml` |

### AI Infrastructure
| Component | Status | Location |
|-----------|--------|----------|
| Surface-aware system prompt | ✅ Working | `server/src/ai/systemPrompt.ts` |
| SSE streaming chat | ✅ Working | `app/.../ai/assistStream.ts` |
| Run workspace surfaces | ✅ Working | `run-workspace:results`, `run-workspace:claims` |
| Clarification system | ✅ Working | `server/src/ai/types.ts:463-498` |
| Protocol extraction pipeline | ✅ Working | `server/src/api/handlers/ExtractProtocolHandler.ts` |

### Data Layer
| Component | Status | Location |
|-----------|--------|----------|
| RetrievalIndex (semantic search) | ✅ Exists | `server/src/foundry/RetrievalIndex.ts` |
| sentence-transformers | ✅ Tier-2 | CUDA torch |
| Python executor service | ✅ Exists | `server/python-executor-service/` |
| Record store (YAML) | ✅ Working | `server/src/store/` |

---

## 2. What Is Missing (Gap Analysis)

### Missing: Data Science Workspace Surface

**The vision:** Three-pane layout — menu (left), visualization canvas (center), AI chat (right).

**What's missing:**
1. A `/data-science` route that loads the three-pane workspace
2. Visualization widget library (heatmaps, scatter plots, time series, pathway diagrams)
3. Center canvas that can host widgets dynamically (AI-generated or user-placed)
4. Left menu panel for data navigation (experiments, measurements, models)

### Missing: Data Querying Capabilities

**The vision:** "Find all my cell culture experiments where I used pharmaceutical inhibitors of enzymes in the PPARα pathway."

**What's missing:**
1. Semantic search over experiment history (leverages RetrievalIndex + sentence-transformers)
2. Structured query language: filter by materials, equipment, claims, assertions, context properties
3. Query results renderer: show matching runs, their measurements, their evidence
4. AI tool: `search_experiments(query)` — natural language → structured filter → results

### Missing: ML Model Building Pipeline

**The vision:** "Build a PyTorch model of the PPARα pathway from my experimental data."

**What's missing:**
1. `ml-model` record type in the knowledge layer (tracks model specs, training data, results)
2. Python ML pipeline: AI generates PyTorch code → python-executor-service runs it → results captured as records
3. Model training sandbox: isolated Python environment with PyTorch, scikit-learn, pandas
4. Model registry: store trained models, track versions, link to source data
5. AI tool: `build_model(data_source, model_type, hyperparameters)` — orchestrates the pipeline

### Missing: Result Visualization

**The vision:** Heatmaps of plate reader results, scatter plots of dose-response, time-series of kinetic reads.

**What's missing:**
1. Visualization widget components (Recharts-based): `PlateHeatmap`, `DoseResponseCurve`, `KineticTimeSeries`, `PathwayDiagram`
2. Data adapter: convert measurement records → visualization data format
3. Widget registry: declarative spec of which widgets exist, their inputs, their config
4. AI tool: `create_visualization(data_source, chart_type, config)` — generates widget with data

### Missing: Knowledge Layer Integration for ML/Analysis

**The vision:** AI-generated models and analyses tracked as part of the experiment; user can add claims based on findings.

**What's missing:**
1. `ml-model` schema (extends knowledge layer)
2. `analysis` record type (captures analysis results, links to source data and models)
3. AI tool: `author_claim(from_model, statement)` — proposes claims/assertions/evidence from model findings
4. Bidirectional link: ML model → source experiments → claims → model refinement

### Missing: AI Surface for Data Science

**The vision:** AI chat that understands data, can query experiments, build models, and propose visualizations.

**What's missing:**
1. New AI surface: `data-science` with domain-specific preamble
2. System prompt template: `prompts/data-science-agent.md`
3. Context assembler for data-science: assembles measurement data, knowledge layer entries, model registry
4. New AI tools: `search_experiments`, `build_model`, `create_visualization`, `author_claim`, `query_knowledge_layer`

---

## 3. Proposed Architecture

### Three-Pane Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  BRAND  │  Experiment: ROS-POS-CCCP-v2  │  Theme · Settings    │
├──────────┼──────────────────────────────┼──────────────────────┤
│          │                              │                      │
│  MENU    │    VISUALIZATION CANVAS      │     AI CHAT          │
│  Panel   │    (Draggable Widgets)       │     Dock             │
│          │                              │                      │
│ ┌──────┐ │  ┌──────────────────────┐   │  [You]               │
│ │Expts │ │  │ Plate Heatmap        │   │  "Build a PyTorch   │
│ │  ▾   │ │  │ 96-well fluorescence │   │   model of the      │
│ ├──────┤ │  └──────────────────────┘   │   PPARα pathway     │
│ │Models│ │  ┌──────────────────────┐   │   from my cell      │
│ │  ▾   │ │  │ Dose-Response Curve  │   │   culture data"     │
│ ├──────┤ │  └──────────────────────┘   │                    │
│ │Claims│ │  ┌──────────────────────┐   │  [AI]               │
│ │  ▾   │ │  │ Pathway Diagram      │   │  I found 12 experi- │
│ ├──────┤ │  │ PPARα → ROS pathway  │   │  ments matching.    │
│ │Data  │ │  └──────────────────────┘   │  Building model...  │
│ │Sources││                              │                    │
│ └──────┘ │                              │                    │
│          │                              │                    │
├──────────┼──────────────────────────────┼──────────────────────┤
│  AI: "Describe your data science task..."              [Send] │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User prompt (natural language)
  → AI chat (data-science surface)
  → Tool call: search_experiments("PPARα inhibitors, cell culture")
  → RetrievalIndex semantic search + structured query
  → Returns matching runs, measurements, contexts
  → AI summarizes findings to user
  → User: "Build a model"
  → Tool call: build_model(data_source, PyTorch)
  → AI generates Python code
  → python-executor-service runs in sandbox
  → Returns model artifacts, metrics
  → Saved as ml-model record
  → Tool call: create_visualization(model_results)
  → Widget rendered in center canvas
  → User: "What does this tell us?"
  → AI: proposes claims/assertions/evidence
  → Tool call: author_claim(from_model)
  → Evidence record created, linked to model + source data
  → Saved to knowledge layer
```

### Schema Additions

#### `ml-model.schema.yaml` (new)
```yaml
kind: ml-model
properties:
  name: string
  model_type: enum[pytorch, sklearn, xgboost, custom]
  description: string
  source_experiments: ref[]  # links to run records
  training_data: file_ref[]  # links to measurement/result records
  hyperparameters: object
  architecture: string  # model description
  metrics: object  # accuracy, loss, etc.
  artifacts: file_ref[]  # saved model weights
  code_ref: string  # Python code that trained this model
  version: string
  status: enum[training, ready, deprecated]
  knowledge_claims: ref[]  # claims derived from this model
```

#### `analysis.schema.yaml` (new)
```yaml
kind: analysis
properties:
  name: string
  type: enum[statistical, ml_prediction, pathway_analysis, custom]
  description: string
  source_data: ref[]  # measurements, results, contexts
  model_ref: ref  # ml-model that performed this analysis
  results: object  # analysis output
  visualization_ref: ref  # linked visualization widget
  knowledge_claims: ref[]  # claims derived from this analysis
  quality: object  # confidence, significance, etc.
```

---

## 4. Phased Implementation Plan

### Phase 1: Data Querying Foundation (Weeks 1-3)

**Goal:** User can ask "find experiments matching X" and get results.

**Tasks:**
1. Expose RetrievalIndex via API endpoint (`GET /api/ai/search-experiments`)
2. Build `search_experiments` AI tool in ToolRegistry
3. Create structured query builder: natural language → filter over runs/materials/claims
4. Build experiment results renderer component
5. Add `data-science` surface to system prompt builder

**Files to create/modify:**
- `server/src/api/handlers/DataScienceHandlers.ts` (new)
- `server/src/ai/ToolRegistry.ts` — add `search_experiments`
- `server/src/ai/systemPrompt.ts` — add `data-science` surface
- `app/src/data-science/ExperimentSearchResults.tsx` (new)
- `app/src/data-science/DataScienceWorkspace.tsx` (new, initial shell)

### Phase 2: Visualization Widgets (Weeks 2-4)

**Goal:** Plate reader results render as interactive visualizations.

**Tasks:**
1. Create Recharts-based widget components: `PlateHeatmap`, `DoseResponseCurve`, `KineticTimeSeries`
2. Build data adapter: measurement record → visualization data
3. Create widget registry (declarative spec)
4. Build widget canvas in center pane (draggable/resizable)
5. Add `create_visualization` AI tool

**Files to create/modify:**
- `app/src/data-science/widgets/PlateHeatmap.tsx` (new)
- `app/src/data-science/widgets/DoseResponseCurve.tsx` (new)
- `app/src/data-science/widgets/KineticTimeSeries.tsx` (new)
- `app/src/data-science/widgets/WidgetCanvas.tsx` (new)
- `app/src/data-science/WidgetRegistry.ts` (new)
- `server/src/ai/ToolRegistry.ts` — add `create_visualization`

### Phase 3: ML Model Building Pipeline (Weeks 3-6)

**Goal:** User can prompt "build a PyTorch model from my data" and get results.

**Tasks:**
1. Create `ml-model` and `analysis` schemas
2. Build ML sandbox in python-executor-service (isolated env with PyTorch)
3. Create `build_model` AI tool
4. AI generates Python training code from data + prompt
5. Execute code in sandbox, capture artifacts and metrics
6. Save ml-model record with links to source data
7. Build model registry UI in left menu

**Files to create/modify:**
- `schema/knowledge/ml-model.schema.yaml` (new)
- `schema/knowledge/analysis.schema.yaml` (new)
- `server/python-executor-service/src/python_executor_service/ml_sandbox.py` (new)
- `server/src/ai/ToolRegistry.ts` — add `build_model`
- `app/src/data-science/ModelRegistry.tsx` (new)
- `app/src/data-science/ModelResultsPanel.tsx` (new)

### Phase 4: Knowledge Layer Integration (Weeks 5-7)

**Goal:** AI-generated models produce claims/assertions/evidence tracked in the knowledge layer.

**Tasks:**
1. Create `author_claim` AI tool (proposes claims from model findings)
2. AI summarizes model results → proposes claim statement
3. User reviews → confirms → evidence record created
4. Evidence links back to ml-model + source experiments
5. Bidirectional navigation: experiment → model → claim → back to experiment
6. Add knowledge-layer-aware context assembly for data-science surface

**Files to create/modify:**
- `server/src/ai/ToolRegistry.ts` — add `author_claim`
- `server/src/ai/DataScienceContextAssembler.ts` (new)
- `app/src/data-science/KnowledgeLinkPanel.tsx` (new)
- `app/src/data-science/ModelClaimsPanel.tsx` (new)

### Phase 5: Unified Data Science Workspace (Weeks 6-8)

**Goal:** Three-pane workspace with full AI integration.

**Tasks:**
1. Complete three-pane layout (menu left, canvas center, chat right)
2. Left menu: experiments, models, claims, data sources
3. Center canvas: widget grid with drag-and-drop
4. Right chat: data-science AI surface
5. AI can create widgets, run models, author claims — all reflected in the UI
6. Surface-aware system prompt with full context assembly

**Files to create/modify:**
- `app/src/data-science/DataScienceWorkspace.tsx` (complete)
- `app/src/data-science/DataScienceMenu.tsx` (new)
- `server/src/ai/systemPrompt.ts` — complete `data-science` surface
- `prompts/data-science-agent.md` (new)

---

## 5. The "PyTorch Model of PPARα" User Story (End-to-End)

**User prompt:** "Can you take all of my cell culture experiments where I used pharmaceutical inhibitors of enzymes in the PPARα pathway and build a PyTorch model of the pathway?"

### Step 1: AI understands the request
- Tool call: `search_experiments("cell culture", filters: { materials: "PPARα inhibitor" })`
- Returns 12 experiments with 48 measurement contexts

### Step 2: AI prepares data
- Tool call: `query_measurements(run_ids: [...])` — fetches raw fluorescence data
- AI formats data: features (inhibitor type, concentration, timepoint), target (ROS level)

### Step 3: AI builds the model
- Tool call: `build_model({ type: "pytorch", data: ..., architecture: "pathway_graph_neural_net" })`
- AI generates Python code defining the model architecture
- python-executor-service runs in ML sandbox with PyTorch
- Returns: trained model, loss curve, accuracy metrics

### Step 4: Results visualized
- Tool call: `create_visualization({ type: "pathway_diagram", model: ... })`
- Widget rendered: PPARα pathway with learned edge weights
- Additional widgets: loss curve, feature importance, prediction vs. actual scatter

### Step 5: Knowledge layer integration
- AI: "The model suggests that CPT1A inhibition has the strongest effect on ROS production (weight: 0.87). Would you like me to author a claim?"
- User: "Yes"
- Tool call: `author_claim({ model: ..., statement: "PPARα-mediated β-oxidation inhibition by CPT1A correlates with increased mitochondrial ROS production in HepG2 cells" })`
- Evidence record created, linked to model + 12 source experiments
- Claim appears in the knowledge browser

### Step 6: Tracked as experiment artifact
- ml-model record saved with version, hyperparameters, source data refs
- Appears in model registry left menu
- Future experiments can reference this model as prior knowledge

---

## 6. Risks, Tradeoffs, and Open Questions

### Risks
1. **Python sandbox security:** Running user-generated ML code requires isolation. The existing python-executor-service uses subprocess; needs Docker containerization for production.
2. **PyTorch in sandbox:** PyTorch CUDA builds are large (~2GB). The appliance GPU is available, but sandboxing GPU access is non-trivial.
3. **Model quality:** AI-generated ML code may be suboptimal. Need a "coder-critic-retry" loop (like Ralph) for model building.
4. **Data volume:** Plate reader data is small (96 wells × N channels), but scaling to imaging or sequencing requires different storage.

### Tradeoffs
1. **Generic vs. domain-specific:** Should this be a generic "AI data science" tool, or deeply coupled to the lab domain? Recommendation: domain-first. The knowledge layer gives unique value that generic tools can't replicate.
2. **Built-in vs. plugin:** Should ML models be first-class records or external artifacts? Recommendation: first-class records. Everything that can be data should be data.
3. **Real-time vs. batch:** Plate reader data arrives in real-time; model training is batch. Recommendation: separate the two paths but link them via records.

### Open Questions
1. **Which ML frameworks?** PyTorch is requested, but scikit-learn is simpler for tabular data. Recommendation: start with both — AI chooses the right tool.
2. **Model persistence?** Saved weights in records/ as files? Or external model registry? Recommendation: weights as file refs, metadata as records.
3. **Collaboration?** Can other scientists use/extend models? Recommendation: yes, same record-based sharing as protocols.
4. **GPU access?** The appliance has one GPU. Can model training share it with inference? Recommendation: time-slice with priority to inference.

---

## 7. What This Is NOT

- **Not a replacement for the event-editor.** The event-editor is for authoring protocols and running experiments. This workspace is for analyzing results.
- **Not a replacement for the knowledge browser.** The browser is for navigating all records. This workspace focuses on experiment data + models.
- **Not Jupyter.** This is not a notebook. It is a declarative, record-driven workspace where the AI is the primary interaction mode.
- **Not a generic ML platform.** This is specifically for lab data — plate reader results, assay data, experimental metadata, knowledge-layer-grounded analysis.

---

## 8. Relationship to Existing Endpoints

```
/browser          ── knowledge layer (what is true)
  │
  ├── /data-science  ← NEW: data science workspace (analyze, model, visualize)
  │       │
  │       ├── ML models → /browser (as ml-model records)
  │       ├── Evidence → /browser (as evidence records)
  │       └── Claims → /browser (as claim records)
  │
/literature       ── upstream knowledge intake
  │
/protocols        ── bridge (knowledge → executable)
  │
/event-editor     ── what layer (live deck, live run)
  │
  └── instrument (PRL → SpectraMax)
       │
       ├── raw + derived records → /browser
       └── measurement data → /data-science  ← NEW: feeds the workspace
```

The data-science workspace closes the loop: experiments produce data → data gets analyzed → models produce insights → insights become knowledge → knowledge informs future experiments.

---
