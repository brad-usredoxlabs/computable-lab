# Experiment Lifecycle & Knowledge Capture Plan

> **For Hermes:** Focus on data provenance, not widgets. The real challenge is capturing experiment data into the knowledge layer and tracking experiments over time.

**Goal:** Build the infrastructure for the AI to reason over experiment history — what happened, what's planned, and what patterns emerge — and automatically capture insights as knowledge-layer records.

**Architecture:** Extend the run workspace with temporal tracking, build aggregate query infrastructure, and add AI tools that analyze data and propose knowledge-layer records.

---

## The Real Problem

**Data exists but isn't connected.**

```
Event Graph    → captures what happened (events, materials, steps)
  │
  └─ Run Workspace → shows a single run
      │
      └─ Measurements → captured as records
          │
          └─ ??? → evidence? claims? insights?
```

Today: measurements are captured, but evidence records require manual authoring. Claims require manual linking. There's no aggregate view across runs. The AI can't answer "what patterns emerged across my PPARα experiments?"

**The real work is:**
1. **Temporal tracking** — experiment timeline (past → today → future)
2. **Data → Evidence pipeline** — auto-propose evidence from measurements
3. **Aggregate queries** — "all runs with material X" across the history
4. **AI knowledge authoring** — AI proposes claims/assertions from patterns

---

## What Needs to Be Built

### 1. Experiment Timeline

**The question:** "What happened yesterday? What's running today? What's planned for next week?"

**What exists:**
- Run records have timestamps and status
- Run workspace shows individual runs
- API can query runs

**What's missing:**
- Timeline view showing runs across time
- Status tracking: completed, in-progress, planned, scheduled
- AI tool: `search_runs(query)` → returns timeline summary

**Approach:**
- New right-pane tab: "Timeline"
- Query runs by date range, status, materials
- Center pane shows timeline view or opens a specific run

### 2. Data → Evidence Pipeline

**The question:** "This measurement was captured — what does it mean for my assertions?"

**What exists:**
- Measurements captured from plate reader
- Assertions linked to plates/wells
- Evidence schema defined
- AI can analyze data (python-executor-service)

**What's missing:**
- When a measurement is captured, AI automatically analyzes it
- AI proposes evidence record: "This measurement supports assertion X"
- User reviews → confirms → evidence saved

**Approach:**
- After measurement ingest, AI analyzes: statistical significance, effect size
- AI matches measurement to existing assertions for that run
- AI proposes evidence record via SSE event
- User reviews in right-pane "Evidence Drafts" tab
- Confirm → saved as evidence record

### 3. Aggregate Analysis Infrastructure

**The question:** "Show me all my PPARα inhibitor runs — what patterns emerge?"

**What exists:**
- RetrievalIndex for semantic search
- API can query materials
- Python executor for analysis

**What's missing:**
- Cross-run query: "find all runs with material X"
- Aggregate data gathering: measurements across multiple runs
- AI tool: `aggregate_analysis(query)` → cross-run pattern detection
- Context assembly: gather data from multiple runs for AI analysis

**Approach:**
- Query API: filter runs by materials, dates, protocols
- Gather measurements from matching runs
- AI analyzes aggregate: trends, outliers, patterns
- AI proposes: "Pattern observed: X correlates with Y across 12 runs"
- AI can generate visualization on demand (no pre-built widgets needed)

### 4. AI Knowledge Authoring

**The question:** "Based on what I've learned, what claims should I make?"

**What exists:**
- Claim/assertion/evidence schemas
- AI can propose text
- Knowledge browser

**What's missing:**
- AI analyzes aggregate results → proposes claim
- Claim linked to source evidence and runs
- User reviews → edits → confirms → saved

**Approach:**
- AI tool: `propose_claim(analysis)` → drafts claim statement
- Claim includes: statement, claim_refs (what it extends), evidence_refs
- User reviews in right-pane "Claim Drafts" tab
- Confirm → saved as claim record in knowledge layer

---

## The AI Tools

| Tool | What It Does | Returns |
|------|-------------|---------|
| `search_runs(query)` | Find runs by materials, date, status | Run summaries + timeline |
| `analyze_measurement(measurement_id)` | Statistical analysis of a measurement | Analysis + proposed evidence |
| `aggregate_analysis(query)` | Cross-run pattern detection | Patterns + proposed claim |
| `propose_evidence(assertion_id, measurement_id)` | Draft evidence record | Draft evidence |
| `propose_claim(analysis)` | Draft claim from analysis | Draft claim |

---

## What Visualization Looks Like

**Not pre-built widgets — AI-generated on demand.**

When AI analyzes data, it generates visualization code inline:
```typescript
// AI generates this when asked to visualize dose-response:
import { ScatterChart, Scatter, Line, XAxis, YAxis, CartesianGrid } from 'recharts';

// Data from aggregate_analysis result
const data = aggregateResults.doseResponsePoints;

return (
  <ScatterChart width={600} height={400}>
    <CartesianGrid />
    <XAxis dataKey="dose" />
    <YAxis dataKey="response" />
    <Scatter data={data} fill="#8884d8" />
    <Line data={data} type="monotone" stroke="#ff7300" />
  </ScatterChart>
);
```

The AI decides what visualization makes sense. No widget library to maintain. The center pane just renders whatever the AI generates.

---

## Phased Implementation

### Phase 1: Experiment Timeline & Search
**Goal:** "Show me my experiment history"

- `search_runs` AI tool in ToolRegistry
- Timeline view component (right-pane tab)
- Query runs by materials, dates, status
- Center pane shows timeline or opens a run

**Files:**
- `server/src/ai/ToolRegistry.ts` — add `search_runs`
- `app/src/graph/run-workspace/TimelineView.tsx` (new)
- `app/src/graph/run-workspace/RunWorkspaceNav.tsx` — add Timeline tab

### Phase 2: Automated Evidence Proposal
**Goal:** Measurement captured → AI proposes evidence

- Measurement analysis pipeline in python-executor-service
- `analyze_measurement` AI tool
- Evidence draft review in right pane
- Confirm → evidence saved

**Files:**
- `server/python-executor-service/src/python_executor_service/analysis/evidence_proposal.py` (new)
- `server/src/ai/ToolRegistry.ts` — add `analyze_measurement`
- `app/src/event-editor/right-pane/ai/EvidenceDraftPanel.tsx` (new)

### Phase 3: Aggregate Analysis
**Goal:** "What patterns across my PPARα runs?"

- Cross-run query infrastructure
- `aggregate_analysis` AI tool
- Context assembly: gather data from multiple runs
- AI-generated visualization in center pane

**Files:**
- `server/src/api/handlers/AggregateAnalysisHandlers.ts` (new)
- `server/src/ai/ToolRegistry.ts` — add `aggregate_analysis`
- `server/src/ai/AggregateContextAssembler.ts` (new)

### Phase 4: Knowledge Layer Auto-Capture
**Goal:** AI proposes claims from analysis

- `propose_claim` AI tool
- Claim draft review in right pane
- Confirm → claim saved to knowledge layer

**Files:**
- `server/src/ai/ToolRegistry.ts` — add `propose_claim`
- `app/src/event-editor/right-pane/ai/ClaimDraftPanel.tsx` (new)

---

## What This Is NOT

- **Not a dashboard app** — no pre-built widgets
- **Not a data warehouse** — not about storing more data
- **Not a BI tool** — not generic queries, but experiment-specific patterns
- **Not a replacement for the run workspace** — extends it

---

## The Key Insight

**The bottleneck isn't visualization — it's data provenance.**

Data exists. Knowledge exists. The gap is the pipeline between them. Build that pipeline, and the AI can do everything else — visualize, analyze, propose claims — because it has access to the data.
