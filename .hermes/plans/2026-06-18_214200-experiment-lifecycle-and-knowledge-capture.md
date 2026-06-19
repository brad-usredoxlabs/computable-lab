# Experiment Lifecycle & Knowledge Capture Plan

> **For Hermes:** Focus on data flow, not widgets. The real challenge is capturing experiment data into the knowledge layer and tracking experiments over time.

**Goal:** Close the loop between event-graph data and the knowledge layer — automate evidence capture from measurements, enable aggregate analysis across runs, and provide temporal experiment tracking.

**Architecture:** Extend the run workspace to show experiment timelines, add automated evidence generation from measurements, and build AI tools that reason over aggregate data patterns.

---

## The Real Problem

Today:
- Event graph captures what happened (events, materials, steps)
- Run workspace shows a single run's state
- Measurements are captured as records
- **But:** Evidence records are manually authored
- **But:** Claims require manual linking to evidence
- **But:** No aggregate view across multiple runs
- **But:** No temporal experiment timeline (past → today → future)

**The gap:** Data exists but doesn't automatically become knowledge. The AI should bridge this — analyzing measurements, proposing evidence, suggesting claims, and showing patterns across the experiment history.

---

## What Needs to Be Built

### 1. Experiment Timeline View

**Problem:** "What happened yesterday? What's scheduled for today? What's planned for next week?"

**Solution:** A temporal view of experiments that shows:
- Completed runs with their results
- Active runs currently in progress
- Planned runs (protocols ready, materials staged)
- Future runs (scheduled, not yet staged)

**How it works:**
- Query runs by date range and status
- Show timeline with run summaries
- Click a run → open its run workspace
- AI can query: "show me all runs from the past week where I used CCCP"

**What exists:**
- Run records have timestamps and status
- Run workspace already shows individual runs
- API can query runs with filters

**What's missing:**
- Timeline view component
- Aggregate query across runs
- AI tool to search runs by materials/context/time

### 2. Automated Evidence Generation

**Problem:** Measurements exist but evidence records are manually authored.

**Solution:** When a measurement is captured, AI automatically:
1. Analyzes the data (statistical significance, effect size)
2. Matches it to existing assertions for that run
3. Proposes an evidence record: "This measurement supports assertion X because..."
4. User reviews → confirms → evidence saved

**How it works:**
```
Measurement captured (e.g., fluorescence readings)
  → AI analyzes: mean, std, CV, comparison to control
  → AI finds: assertion "CCCP increases ROS" linked to this plate
  → AI proposes: evidence record with analysis results
  → User: "Yes, looks right" → saved
  → Evidence links to: measurement, assertion, run, plate
```

**What exists:**
- Measurement records captured from plate reader
- Assertions linked to plates/wells
- Evidence schema defined
- AI can analyze data (python-executor-service)

**What's missing:**
- Automated evidence proposal pipeline
- AI tool: `analyze_measurement(measurement_id)` → proposes evidence
- UI surface for reviewing proposed evidence

### 3. Aggregate Analysis Across Runs

**Problem:** "Show me all my cell culture experiments where I used PPARα inhibitors and tell me what patterns emerge."

**Solution:** AI can query across multiple runs, analyze aggregate data, and surface patterns:

```
User: "What's the dose-response across all my CCCP runs?"
  → AI queries: all runs with CCCP material
  → AI aggregates: measurements from matching wells
  → AI analyzes: dose-response curve across runs
  → AI proposes: "Clear dose-response observed (R²=0.87), with variability between passages"
  → AI visualizes: aggregate scatter + trendline (AI-generated, not pre-built widget)
```

**What exists:**
- RetrievalIndex for semantic search
- API can query materials across runs
- Python executor for analysis

**What's missing:**
- Aggregate query builder: "find runs with material X"
- AI tool: `aggregate_analysis(query)` → cross-run analysis
- Context assembly: gather data from multiple runs for AI analysis

### 4. Knowledge Layer Auto-Capture

**Problem:** Insights from experiments don't automatically become knowledge.

**Solution:** AI proposes claims/assertions/evidence from analysis:

```
After analyzing aggregate data:
  → AI: "Pattern observed: CPT1A inhibition consistently increases ROS (12 runs, p<0.01)"
  → AI: "Propose claim: 'CPT1A inhibition correlates with mitochondrial ROS production'"
  → User: "Yes, but add that it's cell-line-specific"
  → AI: updates claim → user confirms → saved to knowledge layer
```

**What exists:**
- Claim/assertion/evidence schemas
- AI can propose text
- Knowledge browser

**What's missing:**
- AI tool: `propose_claim(analysis)` → drafts claim from analysis
- Context assembly: gather relevant experiments for AI to reason over
- Review workflow: user edits → confirms → saves

---

## The AI Tools That Make This Work

| Tool | What It Does | Returns |
|------|-------------|---------|
| `search_runs(query, filters)` | Find runs by materials, date, status | Run summaries |
| `analyze_measurement(measurement_id)` | Statistical analysis of a measurement | Analysis results + proposed evidence |
| `aggregate_analysis(query)` | Cross-run analysis (e.g., dose-response) | Aggregate results + proposed claim |
| `propose_evidence(assertion_id, measurement_id)` | Auto-generate evidence record | Draft evidence |
| `propose_claim(analysis)` | Draft claim from analysis findings | Draft claim |
| `show_timeline(date_range)` | Temporal experiment view | Timeline summary |

---

## What Gets Visualized

**Not pre-built widgets — AI-generated visualizations.**

When the AI analyzes data, it can:
1. Describe what to visualize: "dose-response scatter with trendline"
2. Generate the code: Recharts/Plotly code inline
3. Render it: center pane shows the visualization
4. Save it: as part of the analysis record

The visualization is **ephemeral and AI-generated** — not a pre-built widget component. The AI decides what visualization makes sense for the data.

---

## Phased Implementation

### Phase 1: Experiment Timeline View
**Goal:** See what happened, what's happening, what's planned.

- Build timeline view component
- Query runs by date/status
- AI tool: `show_timeline`
- Show in center pane when "Timeline" tab selected

### Phase 2: Automated Evidence Proposal
**Goal:** When measurement is captured, AI proposes evidence.

- Analysis pipeline: measurement → statistics → proposal
- AI tool: `analyze_measurement`
- UI surface: proposed evidence review in right pane
- User confirms → evidence saved

### Phase 3: Aggregate Analysis
**Goal:** AI can analyze patterns across multiple runs.

- Cross-run query builder
- AI tool: `aggregate_analysis`
- Context assembly: gather data from multiple runs
- AI-generated visualization in center pane

### Phase 4: Knowledge Layer Auto-Capture
**Goal:** AI proposes claims from analysis.

- AI tool: `propose_claim`
- Draft claim → user reviews → saves to knowledge layer
- Evidence auto-linked to claims

---

## What This Is NOT

- **Not a dashboard app** — not pre-built widgets or fixed views
- **Not a data warehouse** — not about storing more data, but connecting existing data to knowledge
- **Not a BI tool** — not about generic queries, but about experiment-specific patterns
- **Not a replacement for the run workspace** — extends it with temporal view and knowledge capture

---

## The Key Insight

**The bottleneck isn't visualization — it's data flow.**

Data exists (measurements, events, runs). Knowledge exists (claims, assertions, evidence). The gap is **automating the connection** between them so that:
1. Measurements → Evidence (automatically proposed by AI)
2. Patterns → Claims (AI identifies, user confirms)
3. Runs → Timeline (temporal view of experiment history)

The AI chat is the interface. It doesn't need pre-built widgets — it generates visualizations on demand. What it needs is **access to the data** and **tools to analyze it**.
