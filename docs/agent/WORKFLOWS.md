# Workflows

> End-to-end flows through the system.
>
> Last verified against commit: `af32af9`

## 1. PDF → Protocol Extraction → Record Creation

```
User opens PDF in workspace (kind: 'pdf' tab)
  → PdfViewerContext loads artifact record, populates extractedText[]
User clicks "Convert to Protocol" button in PdfToolbar
  → ConvertToProtocolModal opens (idle phase)
  → User clicks "Extract Protocol"
  → Frontend joins extractedText pages, POSTs to /api/protocol-builder/extract
    → Backend: chunkText() splits into ~10K char chunks
    → For each chunk: buildChunkExtractionPrompt() → inferenceClient.complete()
       with enableThinking: false, max_tokens: 8192
    → extractJsonFromResponse() parses LLM output (handles markdown, bracket-balanced, JSON repair)
    → Fallback: accepts any JSON with steps[] array, coerces to AiProtocolCandidateSummary
    → mergeChunkResults(): steps renumbered, materials/labware/equipment deduplicated
  → Frontend shows preview (title, step count, step list, diagnostics)
  → User selects scope: Project (links.studyId) or Lab (no links)
  → User clicks "Create Protocol"
    → buildProtocolPayload() maps candidate → protocol schema payload
    → apiClient.createRecord('protocol.schema.yaml', payload)
    → Record created, opened as record-edit tab
```

Key files:
- `app/src/event-editor/viewer/pdf/ConvertToProtocolModal.tsx`
- `server/src/api/handlers/ProtocolBuilderHandlers.ts`

## 2. Protocol → Run Creation → Event Graph

```
User opens protocol record (record-edit tab, recordKind: 'protocol')
  → RecordEditPanel shows "Create Run" button
  → User clicks "Create Run"
    → apiClient.createPlannedRun({ title, sourceType: 'protocol', sourceRef: { kind: 'record', id: protocolId, type: 'protocol' } })
    → POST /api/planned-runs
    → ExecutionOrchestrator.createPlannedRun()
      → ProtocolCompiler.lowerToLabProtocol() compiles universal → lab-layer
      → Creates planned-run record with protocolLayer: 'lab'
  → Record-edit tab closes, planned-run appears in Find tab tree
```

Alternative flow (from Find tab):
```
Find tab → RunRow → "Use Protocol" button
  → apiClient.getProtocolContext({ studyId }) fetches available protocols
  → User picks protocol
  → apiClient.useProtocolInRun({ protocolId, runId, studyId })
    → POST /api/protocol-actions/use-in-run
    → ProtocolContextService.useProtocolInRun()
      → Creates planned-run + method event graph
      → Attaches methodEventGraphId to run record
  → Deck tab opens with the method event graph
```

Key files:
- `app/src/event-editor/create/RecordEditPanel.tsx`
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx`
- `server/src/execution/ExecutionOrchestrator.ts`
- `server/src/protocol/ProtocolContextService.ts`

## 3. Protocol Tab → Step Execution → Deviation Recording

```
User opens deck tab with runId → right pane auto-switches to Protocol tab
  → ProtocolTabPanel fetches protocol steps
  → If no protocol attached: ProtocolSelector shows available protocols
  → If protocol attached: StepChips render with Play/visibility/settings
  → ProtocolPreviewBridge ghosts visible steps' events onto canvas
User clicks "Play" on a step
  → StepExecutionModal opens (timestamps, settings, deviations, auto-diff)
  → User fills timestamps, edits settings, adds deviations
  → On submit:
    → PATCH /api/runs/:runId/steps/:stepId/execute (stores step metadata)
    → updateExecutionState(runId, stepId, 'completed') (records observation)
    → Auto-advance to next pending step
  → DeviationRecorder auto-diff available when plannedEvent is passed
```

Key files:
- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- `app/src/components/StepExecutionModal.tsx`
- `app/src/components/DeviationRecorder.tsx`
- `server/src/api/routes/run-execution.ts`

## 4. AI Chat → Event Graph Drafting

```
User types in AI tab chat input (TipTap with slash commands)
  → AiTabPanel assembles context: deck state, events, labwares, selections
  → POST /api/ai/assist/stream (SSE streaming)
    → AgentOrchestrator.run() — tool-calling loop
    → InferenceClient.complete() with enableThinking from config
    → Tools: search_records, compile_event_graph_draft, etc.
  → SSE events stream back: status, tool_call, text_delta, done
  → Draft events appear as ghost/preview on canvas
  → User clicks Accept → events committed to event graph
  → User clicks Discard → preview cleared
```

Key files:
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- `server/src/ai/AgentOrchestrator.ts`
- `server/src/ai/InferenceClient.ts`
- `app/src/event-editor/EventEditorContext.tsx` (preview system)

## 5. Record CRUD (generic)

```
Any record type: POST /api/records { schemaId, payload }
  → RecordHandlers.createRecord()
    → AjvValidator validates against schema
    → LintEngine runs lint rules from *.lint.yaml
    → RecordStoreImpl persists as YAML file
    → GitRepoAdapter commits (if auto-commit enabled)
  → Returns WriteResponse { record, validation, lint, commit? }

GET /api/records/:id → RecordHandlers.getRecord() → RecordStoreImpl.get()
GET /api/records?kind=X → RecordStoreImpl.list({ kind: X })
PUT /api/records/:id { payload } → RecordStoreImpl.update()
```

Key files:
- `server/src/api/handlers/RecordHandlers.ts`
- `server/src/store/RecordStoreImpl.ts`
- `server/src/validation/AjvValidator.ts`
- `server/src/lint/LintEngine.ts`

## 6. Workspace State (per-study UI persistence)

```
WorkspaceProvider mounts with studyId
  → GET /api/studies/:studyId/workspace
  → server reads records/studies/:studyId/workspace.yaml
  → parseWorkspaceState() validates + migrates (browse→find, execution→protocol)
  → Returns WorkspaceState { tabs, activeTabId, rightPaneMode, paneWidths }
User switches tabs, opens/closes viewers, changes right pane mode
  → WorkspaceContext dispatches to reducer
  → Debounced save (500ms): PUT /api/studies/:studyId/workspace
  → server writes workspace.yaml via RecordStoreImpl
```

Key files:
- `app/src/event-editor/workspace/WorkspaceContext.tsx`
- `app/src/event-editor/workspace/types.ts`
- `app/src/event-editor/workspace/reducer.ts`
- `server/src/workspace/types.ts` (parseWorkspaceState, migration)
