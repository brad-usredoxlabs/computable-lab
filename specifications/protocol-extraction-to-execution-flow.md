# UI Flow Design: Extracted Protocol → Usable ProtocolStep List

## Problem

Users need to **"promote" or "import"** an AI-extracted protocol (`AiProtocolCandidateSummary`) into a real `ProtocolStep` list that can be executed in the event editor. The current system has two partially-overlapping flows but no clear, integrated path from **Search → Review → Configure → Draft → Promote → Execute**.

---

## Entry Points (Where This Happens)

There are **two entry points** into the protocol builder pipeline. Both should converge into the same promotion flow.

### Entry Point 1: Literature/Search Tab → Build Protocol

```
/literature?view=search
  └── SearchResultCard → "Build Protocol" button
       └── Navigate to: /literature?view=build&pdfUrl=URL
            └── PdfProtocolBuilder (PDF viewer + AI chat side panel)
```

**User sees:** Search results from bio-sources. Each card has a "Build Protocol" button.

**User action:** Click "Build Protocol" on a search result.

**Current gap:** `PdfProtocolBuilder` renders the PDF + a chat panel, but there is **no "Extract" button** that produces a candidate and transitions to the configuration flow. The chat surface (`surface: 'protocol-builder'`) can extract interactively via conversation, but there's no structured extraction → preview → configure handoff.

---

### Entry Point 2: Standalone Protocol Builder Page

```
/protocol-builder
  └── ProtocolBuilderPage (two-panel layout)
       ├── Left panel: SourceIntakePanel → ExtractionPanel → ProtocolCandidatePreview
       └── Right panel: RightPanel (tabbed: Preview / Configure / Draft / Promote)
```

**User sees:** "Load Protocol Source" with tabs for PDF URL or paste text.

**User action:** Enter PDF URL or paste text → "Extract Text" → "Extract Protocol" → configure → draft → promote.

**This is the canonical flow** and is the most complete implementation.

---

## Complete Component Flow

### Phase 1: Source Intake

**Component:** `SourceIntakePanel` (inside `ProtocolBuilderPage`)
**Screen:** Two tabs — "PDF URL" and "Paste Text"

```
┌─────────────────────────────────────────────┐
│ Load Protocol Source                        │
│ ┌──────────┐ ┌──────────────┐              │
│ │ PDF URL  │ │ Paste Text   │              │
│ └──────────┘ └──────────────┘              │
│                                             │
│ URL: https://...protocol.pdf                │
│ [Extract Text]                              │
│                                             │
│ ┌─ Source Loaded ────────────────────────┐  │
│ │ 15,234 chars · 2,401 words · 23 steps  │  │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Data transformation:**
- Input: `pdfUrl: string` or `pastedText: string`
- API: `POST /api/protocol-builder/extract-pdf-text` (PDF URL only)
- Output: `sourceText: string` stored in `ProtocolBuilderContext`
- Heuristic: `estimateStepCount()` counts numbered/bulleted lines

---

### Phase 2: AI Extraction

**Component:** `ExtractionPanel` (replaces `SourceIntakePanel` in left panel)
**Screen:** "Extract Protocol" button → loading → candidate preview

```
┌─────────────────────────────────────────────┐
│ Extract Protocol           [Change Source]  │
│ AI will analyze the source text and extract │
│ structured protocol steps, materials, etc.  │
│                                             │
│ [Extract Protocol]                          │
│                                             │
│  Analyzing protocol text...                 │
│  4s elapsed                                 │
└─────────────────────────────────────────────┘
```

After extraction succeeds:

```
┌─────────────────────────────────────────────┐
│ Extract Protocol           [Change Source]  │
│ ┌─ Protocol Title ────────────────────────┐  │
│ │ 23 steps · 12 materials · 5 labware     │  │
│ │                                         │  │
│ │ Materials: [Buffer A] [Enzyme X] ...    │  │
│ │ Labware:   [96-well] [reservoir] ...    │  │
│ │ Equipment: [shaker] [incubator] ...     │  │
│ │                                         │  │
│ │ ▼ Step 1: Wash cells  [On] ⚠           │  │
│ │   Text: Wash cells with ice-cold PBS... │  │
│ │   Materials: PBS                        │  │
│ │   Volume: [___] Temp: [___] Dur: [___]  │  │
│ │                                         │  │
│ │ ▶ Step 2: Add lysis buffer  [On]        │  │
│ │ ▶ Step 3: Incubate 15 min  [On] ⚠       │  │
│ │ ...                                      │  │
│ └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

**Data transformation:**
- Input: `sourceText: string`
- API: `POST /api/protocol-builder/extract`
- Output: `AiProtocolCandidateSummary`
  ```typescript
  {
    kind: 'vendor-protocol-candidate',
    title: string,
    scope?: string,
    materials?: AiProtocolCandidateItemSummary[],
    labware?: AiProtocolCandidateItemSummary[],
    equipment?: AiProtocolCandidateItemSummary[],
    steps?: AiProtocolCandidateStepSummary[],  // ← the extracted steps
    diagnostics?: Diagnostics[],
  }
  ```
- Each `AiProtocolCandidateStepSummary`:
  ```typescript
  {
    stepNumber?: number,
    title?: string,
    text: string,                  // extracted prose
    materials?: string[],
    labware?: string[],
    equipment?: string[],
    uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived',
    confidence?: number,
    evidence?: EvidenceAnchor[],
  }
  ```

---

### Phase 3: Configuration

**Component:** `ConfigPanel` (RightPanel tab: "Configure")
**Screen:** Step toggles + inline overrides (from left panel's `ProtocolCandidatePreview`) + Labware mapping

```
┌───────────────────────────────────────────────────────────┐
│  Preview   │ Configure │ Draft │ Promote                  │
├───────────────────────────────────────────────────────────┤
│ Step Configuration                                        │
│ ┌─ Same candidate preview from left panel ───────────┐    │
│ │ (with toggles + inline overrides already visible)  │    │
│ └───────────────────────────────────────────────────┘    │
│                                                           │
│ Labware Mapping                                           │
│ Select concrete labware + deck slot for each role:        │
│                                                           │
│ 96-well block         [96-Well Flat Bottom ▼]  [A1 ▼]   │
│ Reservoir             [Reservoir 8-channel ▼]  [A2 ▼]   │
│ Tip rack 10µL         [Tip Rack 10uL ▼]        [B1 ▼]   │
│ ...                                                       │
│                                                           │
│ [Draft Protocol] ← primary CTA                           │
└───────────────────────────────────────────────────────────┘
```

**User actions:**
1. Toggle steps On/Off (skip steps not needed)
2. Edit inline overrides: volume, temperature, duration, concentration
3. Map extracted labware roles → concrete labware records + deck slots
4. Click **"Draft Protocol"**

**Data transformation:**
```
AiProtocolCandidateSummary (extracted, raw)
  + Set<string> skippedSteps           ← user toggles
  + StepOverride[] overrides           ← inline edits
  + LabwareMapping[] mappings          ← role → record + slot
  = Draft input payload
```

---

### Phase 4: Draft Generation

**Component:** `DraftPreviewPanel` + `FeedbackChat` (RightPanel tab: "Draft")
**Screen:** Ghost events list + redraft feedback

```
┌───────────────────────────────────────────────────────────┐
│  Preview   │ Configure │ Draft │ Promote                  │
├───────────────────────────────────────────────────────────┤
│ 15 events                        Redraft #0               │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ 1  add_material            [Proposed]                │  │
│ │    Wells: A1-H1                                          │
│ │                                                         │
│ │ 2  incubate                [Proposed]                  │  │
│ │    Wells: A1-H1                                          │
│ │    Notes: 15 min at room temp                           │
│ │                                                         │
│ │ ...                                                     │
│ └──────────────────────────────────────────────────────┘  │
│                                                           │
│ Labware Placements                                        │
│ 96-Well Flat Bottom  ·  plate  ·  Slot A1                │
│ Reservoir 8-channel  ·  reservoir  ·  Slot A2            │
│                                                           │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ [Promote]    [Export JSON]                           │  │
│ └──────────────────────────────────────────────────────┘  │
│                                                           │
│ ┌─ Refine Draft ──────────────────────────────────────┐  │
│ │ Tell the AI what to change...                       │  │
│ │ [Redraft]                                           │  │
│ └────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────┘
```

**Data transformation:**
- Input: Draft payload (candidate + skippedSteps + overrides + mappings)
- API: `POST /api/protocol-builder/draft`
- Output: `PlateEvent[]` (ghost events) + `DraftLabware[]` (placements)
- Each `PlateEvent` has: `event_type`, `details`, `notes`, `eventId`

**Redraft loop:**
```
FeedbackChat remarks + previousDraft → POST /api/protocol-builder/redraft
  → New PlateEvent[] with iteration counter incremented
```

**Key conversion: `toProtocolStep()`** (in `ProtocolTabPanel.tsx`)
This function converts `AiProtocolCandidateStepSummary` → `ProtocolStep` for display in the execution UI:

```
AiProtocolCandidateStepSummary
  → ProtocolStep (stepId, ordinal, label, description, settings[], uncertainty)
    → StepInfo (stepId, label, settings[])    ← for StepExecutionModal
      → PlateEvent (event_type, details)      ← committed to event graph
```

---

### Phase 5: Promotion

**Component:** `PromoteSuccessPanel` (RightPanel tab: "Promote")
**Screen:** Success confirmation with navigation

```
┌───────────────────────────────────────────────────────────┐
│  Preview   │ Configure │ Draft │ Promote                  │
├───────────────────────────────────────────────────────────┤
│                                                           │
│                   ✓                                       │
│              Protocol Promoted                             │
│                                                           │
│           15 events committed                              │
│           Record: PROT-2026-0729-a1b2c3                   │
│                                                           │
│ ┌──────────────────────┐ ┌──────────────────────────┐    │
│ │  Start New Protocol  │ │  View in Event Editor    │    │
│ └──────────────────────┘ └──────────────────────────┘    │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

**Data transformation:**
- Input: `PlateEvent[]` + `DraftLabware[]` + `AiProtocolCandidateSummary`
- API: `POST /api/protocol-builder/promote`
- Output: `{ eventCount: number, recordId: string }`
- Events are committed to the event graph and associated with a record

**Post-promotion:** User navigates to `/project/:recordId` to see the promoted events in the event editor, where `ProtocolTabPanel` renders them as `ProtocolStep` chips with Play buttons.

---

### Phase 6: Execution

**Component:** `ProtocolTabPanel` (inside the event editor's right pane)
**Screen:** Protocol steps as interactive chips with play/visibility controls

```
┌───────────────────────────────────────────────────────────┐
│ Protocol Steps                    [Play All]              │
│ Run: run-abc · 15 steps                                   │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Step 1: Wash cells          [☑] [▶ Play]            │  │
│ │ Materials & Equipment: PBS, 96-well plate            │  │
│ │ Started: 10:00 AM · Completed: 10:05 AM             │  │
│ └──────────────────────────────────────────────────────┘  │
│ ┌──────────────────────────────────────────────────────┐  │
│ │ Step 2: Add lysis buffer      [☑] [▶ Play] ⚠        │  │
│ │ Materials & Equipment: Lysis Buffer, 96-well plate   │  │
│ └──────────────────────────────────────────────────────┘  │
│ ...                                                       │
└───────────────────────────────────────────────────────────┘
```

---

## Data Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│  Source Text (string)                                        │
│  ↓  POST /api/protocol-builder/extract-pdf-text             │
├─────────────────────────────────────────────────────────────┤
│  AiProtocolCandidateSummary                                  │
│  { title, materials[], labware[], equipment[], steps[] }    │
│  ↓  toProtocolStep() (display-only conversion)              │
├─────────────────────────────────────────────────────────────┤
│  ProtocolStep[] (UI display model)                           │
│  { stepId, ordinal, label, description, settings[],         │
│    visible, uncertainty, executionMeta }                     │
│  ↓  User config: skippedSteps + overrides + mappings        │
├─────────────────────────────────────────────────────────────┤
│  Draft Payload                                               │
│  { candidate, sourceText, config: { skippedSteps,           │
│    overrides, mappings } }                                   │
│  ↓  POST /api/protocol-builder/draft                        │
├─────────────────────────────────────────────────────────────┤
│  PlateEvent[] (ghost events, proposed)                       │
│  { event_type, eventId, details, notes }                     │
│  ↓  User feedback → POST /api/protocol-builder/redraft      │
│     (loop until satisfied)                                   │
├─────────────────────────────────────────────────────────────┤
│  Promoted Record                                             │
│  { eventCount, recordId }                                   │
│  ↓  POST /api/protocol-builder/promote                      │
├─────────────────────────────────────────────────────────────┤
│  Committed to event graph                                    │
│  → Visible in ProtocolTabPanel as ProtocolStep chips        │
│  → Executable via StepExecutionModal                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Two Flows, One Gap

### What works: Standalone `/protocol-builder` page
- ✅ Source intake → extraction → config → draft → promote
- ✅ Full lifecycle with context-managed state
- ✅ Iterative redraft with feedback

### What needs bridging: Literature/Search → Protocol Builder
- `SearchResultCard` → "Build Protocol" navigates to `/literature?view=build&pdfUrl=URL`
- `PdfProtocolBuilder` loads the PDF in a viewer + has an AI chat
- **Missing:** No button/flow to extract the PDF into a candidate and transition to the configuration + draft + promote pipeline
- **Fix:** Add an "Extract to Builder" button in `PdfProtocolBuilder` that:
  1. Sends PDF URL to `POST /api/protocol-builder/extract-pdf-text`
  2. Sends text to `POST /api/protocol-builder/extract`
  3. Navigates to `/protocol-builder` with the candidate pre-loaded
  4. Or: Embed `ProtocolBuilderPage`'s context + panels directly into the literature view

### Alternative: Embedded `ProtocolBuilderOrchestrator`
- Lives inside the event editor's AI tab
- Reuses the existing chat thread for draft generation
- Ghosts events directly on the canvas
- **Missing:** No source intake; assumes candidate already exists
- **Best for:** When the user already has a candidate from the extraction pipeline and wants to iterate within the event editor

---

## Component Dependency Map

```
ProtocolBuilderPage (container)
├── ProtocolBuilderProvider (context)
│   └── state: candidate, sourceText, skippedSteps, overrides,
│       mappings, activeTab, draftEvents, draftLabwares,
│       draftIteration, isDrafting, isPromoting, promoted, ...
│
├── Left Panel
│   ├── SourceIntakePanel (phase: no source)
│   │   └── actions.setSourceText(text)
│   └── ExtractionPanel (phase: source loaded)
│       ├── actions.setCandidate(candidate)  via onCandidateExtracted
│       └── ProtocolCandidatePreview (renders extracted steps)
│           └── Step toggles + inline overrides (context-managed)
│
└── Right Panel (RightPanel — tabbed)
    ├── Preview tab: placeholder (preview is in left panel)
    ├── Configure tab:
    │   ├── ConfigPanel
    │   │   ├── ProtocolCandidatePreview (same as left)
    │   │   └── LabwareMappingPanel
    │   └── "Draft Protocol" → POST /api/protocol-builder/draft
    │
    ├── Draft tab:
    │   ├── DraftPreviewPanel (PlateEvent[] as ghost events)
    │   ├── FeedbackChat (iterate with redraft)
    │   └── "Promote" → POST /api/protocol-builder/promote
    │
    └── Promote tab:
        ├── PromoteSuccessPanel (if promoted)
        └── "Promote Draft" button (if not yet promoted)
```

---

## Key Files

| File | Role |
|------|------|
| `protocol-builder/ProtocolBuilderPage.tsx` | Container, orchestrates lifecycle phases |
| `protocol-builder/ProtocolBuilderContext.tsx` | Shared state (candidate, config, draft, promote) |
| `protocol-builder/SourceIntakePanel.tsx` | PDF URL / paste text input |
| `components/protocol-builder/ExtractionPanel.tsx` | Extract button + candidate preview |
| `protocol-builder/ConfigPanel.tsx` | Step config + labware mapping wrapper |
| `event-editor/protocol-builder/ProtocolCandidatePreview.tsx` | Step list with toggles + overrides |
| `event-editor/protocol-builder/LabwareMappingPanel.tsx` | Role→record + slot assignment |
| `protocol-builder/RightPanel.tsx` | Tab bar (Preview/Configure/Draft/Promote) |
| `protocol-builder/DraftPreviewPanel.tsx` | Ghost events + promote/export |
| `protocol-builder/FeedbackChat.tsx` | Iterative redraft input |
| `protocol-builder/PromoteSuccessPanel.tsx` | Post-promotion confirmation |
| `event-editor/right-pane/protocol/ProtocolTabPanel.tsx` | Execution view (plays promoted steps) |
| `protocols/lib/protocol-from-execution.ts` | Transform execution → protocol draft |
| `types/ai.ts` | `AiProtocolCandidateSummary`, `AiProtocolCandidateStepSummary` |
