# Lab Data Science Workspace — Revised Architecture (Two-Pane)

> **For Hermes:** Revised plan per user feedback. No three-pane layout — extends the existing two-pane model with right-pane tabs.

**Goal:** Add data science capabilities (experiment search, visualization, ML modeling, knowledge integration) WITHOUT changing the layout. New right-pane tabs + center-rendered widgets.

**Architecture:** The center pane remains the primary workspace. New right-pane tabs surface navigation (Experiments, Models, Claims). AI-generated widgets render in the center — heatmaps, curves, pathway diagrams — alongside the existing event graph / protocol surfaces.

---

## What Changes

### Layout: Nothing

The two-pane layout stays exactly as it is. No left sidebar, no three-pane split.

### New Right-Pane Tabs

| Tab | Purpose | When It Appears |
|-----|---------|-----------------|
| `Experiments` | Search/filter experiment history | Always available from run-workspace |
| `Models` | ML model registry, training status | When ml-model records exist |
| `Visualizations` | List of rendered widgets, config | When AI creates visualizations |
| `Data Sources` | Measurement contexts, raw data refs | Always available |

These are **tabs**, not persistent panels. User picks one, gets the list, clicks to view details in center.

### Center Pane: Widget Rendering

The center already renders:
- Event graph / labware editor
- Protocol steps
- Ghost preview

New: it also renders **visualization widgets** when AI creates them:
- `PlateHeatmap` — 96-well fluorescence grid
- `DoseResponseCurve` — concentration vs. response scatter + fit
- `KineticTimeSeries` — time-series line chart
- `PathwayDiagram` — pathway with learned edge weights (ML model output)

Widgets are **records**, not ephemeral UI state. They're saved to the record store, linked to source data and models.

### AI Chat: New Tools

The existing AI chat gains new tools:

| Tool | What It Does | Returns |
|------|-------------|---------|
| `search_experiments(query)` | Semantic search over runs/materials/claims | Matching experiment summaries |
| `query_measurements(run_ids)` | Fetch measurement data for runs | Structured data arrays |
| `create_visualization(type, data)` | Generate a widget in center pane | Widget record + SSE event |
| `build_model(data, type, config)` | Generate + run PyTorch code | ml-model record + metrics |
| `author_claim(statement, model)` | Propose claim from model findings | Draft claim for user review |

### Data Flow (Same as Before, Just Two-Pane)

```
User types in AI chat (right pane, Chat tab)
  → "Find my PPARα inhibitor experiments"
  → AI calls search_experiments()
  → Results appear in right pane (Experiments tab)
  → User clicks an experiment
  → Center pane shows event graph + measurements

User: "Build a model from these"
  → AI calls build_model()
  → Model trains in python-executor sandbox
  → AI: "Done — showing results"
  → Center pane renders PathwayDiagram widget
  → Right pane (Models tab) shows model registry entry

User: "What does this tell us?"
  → AI: "CPT1A inhibition strongest effect (0.87). Draft claim?"
  → User: "Yes"
  → AI authors claim/evidence → saved to knowledge layer
  → Right pane (Claims tab) shows new evidence linked to model
```

---

## What's Missing (Gap Analysis — Same as Before)

1. **Experiment search API** — `GET /api/ai/search-experiments` leveraging RetrievalIndex
2. **Visualization widget components** — Recharts-based: PlateHeatmap, DoseResponseCurve, KineticTimeSeries, PathwayDiagram
3. **ML model sandbox** — Python executor service extension with PyTorch
4. **ml-model & analysis schemas** — New knowledge layer record types
5. **New right-pane tabs** — Experiments, Models, Visualizations, Data Sources
6. **AI tools** — search_experiments, build_model, create_visualization, author_claim
7. **System prompt surface** — `data-science` surface in systemPrompt.ts

---

## Phased Implementation (Same 5 Phases, Different Layout)

### Phase 1: Experiment Search + Experiments Tab
- API endpoint for semantic experiment search
- Right-pane "Experiments" tab with search/filter UI
- AI `search_experiments` tool

### Phase 2: Visualization Widgets
- Recharts widget components (PlateHeatmap, etc.)
- Center pane can render widgets alongside event graph
- Right-pane "Visualizations" tab for widget list/config
- AI `create_visualization` tool

### Phase 3: ML Pipeline
- ml-model & analysis schemas
- Python executor ML sandbox
- Right-pane "Models" tab (model registry)
- AI `build_model` tool

### Phase 4: Knowledge Layer Integration
- AI proposes claims from model findings
- Evidence records linked to models
- Right-pane "Claims" tab (already exists in run-workspace:claims)

### Phase 5: Polish
- System prompt `data-science` surface
- Smooth transitions between surfaces
- Widget widget grid layout in center

---

## The Key Difference

**Before (three-pane — rejected):**
- Left menu panel (persistent) + Center widgets + Right AI chat
- Problem: center pane squeezed, too many competing focal points

**Now (two-pane — user preference):**
- Center = primary workspace (event graph OR widgets, full width)
- Right = tabbed navigation (Chat, Experiments, Models, Visualizations, Claims)
- User picks a tab to navigate, content renders in center
- Same pattern as the existing run-workspace tabs

The layout doesn't change. The capabilities do.
