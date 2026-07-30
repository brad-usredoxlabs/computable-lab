# Component Index

> "To modify X, inspect these files first."
>
> Last verified against commit: `af32af9`

## Protocol extraction (PDF → Protocol)

Primary files:
- `app/src/event-editor/viewer/pdf/ConvertToProtocolModal.tsx` — modal UI, scope toggle, buildProtocolPayload()
- `app/src/event-editor/viewer/pdf/PdfToolbar.tsx` — "Convert to Protocol" button
- `app/src/event-editor/viewer/pdf/PdfViewerContext.tsx` — extracted text state
- `server/src/api/handlers/ProtocolBuilderHandlers.ts` — extractProtocol(), chunkText(), buildChunkExtractionPrompt(), mergeChunkResults()

Key interfaces:
- `AiProtocolCandidateSummary` — `app/src/types/ai.ts:467`
- `ProtocolBuilderExtractResponse` — `server/src/api/handlers/ProtocolBuilderHandlers.ts:54`

Common downstream effects:
- Protocol record created via `POST /api/records` with `schemaId: protocol.schema.yaml`
- `links.studyId` set when scope is 'project' (appears in protocol selector)
- Chunked LLM extraction with `enableThinking: false` (Qwen3.5/3.6 thinking models)

## Protocol tab (right pane)

Primary files:
- `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` — step chips, play buttons, settings, execution modal
- `app/src/event-editor/right-pane/protocol/ProtocolSelector.tsx` — protocol picker when no protocol attached
- `app/src/event-editor/right-pane/protocol/SettingsPanel.tsx` — per-step editable parameters
- `app/src/event-editor/protocol/ProtocolSelectionContext.tsx` — shared state (activeStepId, visibleSteps, stepGraphs)
- `app/src/event-editor/protocol/ProtocolPreviewBridge.tsx` — ghosts step events onto canvas

Key interfaces:
- `ProtocolStep` — `ProtocolTabPanel.tsx:42`
- `ProtocolSelectionState` — `ProtocolSelectionContext.tsx`

Common downstream effects:
- `useProtocolSelection()` returns null when no provider — callers must handle null
- `ProtocolSelectionProvider` wraps both deck tabs and the ProtocolTabPanel itself

## Event graph canvas (deck editor)

Primary files:
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx` — workspace shell, left/right pane, provider wiring
- `app/src/event-editor/viewer/deck/DeckViewer.tsx` — renders DeckStage
- `app/src/event-editor/EventEditorContext.tsx` — event editor state, preview system, reducer
- `app/src/graph/LabwareEventEditor.tsx` — full event graph editor (6472 lines)
- `app/src/event-editor/lib/previewProjection.ts` — ghost event rendering

Key interfaces:
- `EventEditorState` — `EventEditorContext.tsx:260`
- `EventEditorPreview` — `EventEditorContext.tsx:61`
- `PlateEvent` — `app/src/types/events.ts`

Common downstream effects:
- Preview events ghost onto canvas via `setPreview()` / `clearPreview()`
- `ProtocolPreviewBridge` reads from `ProtocolSelectionContext` and writes to `EventEditorContext`
- Auto-switches right pane to Protocol tab when deck tab has runId

## Right pane (workspace tabs)

Primary files:
- `app/src/event-editor/right-pane/RightPane.tsx` — tab registry (AI, Find, Search, Details, Protocol)
- `app/src/event-editor/workspace/types.ts` — `WorkspaceRightPaneMode` union, `WorkspaceTab` union
- `app/src/event-editor/workspace/WorkspaceContext.tsx` — per-study workspace state

Key interfaces:
- `WorkspaceRightPaneMode` — `types.ts:105` (`'ai' | 'search' | 'find' | 'details' | 'protocol'`)
- `WorkspaceTab` — `types.ts:33` (deck, pdf, document, project-details, record-create, record-edit, execution)

Common downstream effects:
- Adding a tab: update `WorkspaceRightPaneMode`, create panel in `right-pane/<name>/`, update `RightPane.test.tsx`
- Server migrates 'execution' → 'protocol' in `parseWorkspaceState()` — `server/src/workspace/types.ts:199`

## Record edit (protocol record view)

Primary files:
- `app/src/event-editor/create/RecordEditPanel.tsx` — TapTab editor for records, "Create Run" button for protocols
- `app/src/event-editor/projects/ProjectWorkspacePage.tsx` — passes `recordKind` to RecordEditPanel

Key interfaces:
- `RecordEditPanelProps` — `RecordEditPanel.tsx:25` (recordId, title, recordKind?, onClose?)

Common downstream effects:
- "Create Run" button calls `apiClient.createPlannedRun()` with `sourceType: 'protocol'`
- Only shows when `recordKind === 'protocol'`

## Execution + deviations

Primary files:
- `app/src/components/StepExecutionModal.tsx` — step execution modal with timestamps, settings, deviations, auto-diff
- `app/src/components/DeviationRecorder.tsx` — auto-diff between planned vs executed events
- `app/src/event-editor/execution/ExecutionContext.tsx` — execution session state, persists to backend on start
- `app/src/event-editor/execution/useExecutionState.ts` — API-backed execution state hook
- `app/src/event-editor/execution/ExecutionTabShell.tsx` — left-pane execution viewer
- `app/src/shared/api/execution.ts` — execution API client (updateExecutionState, captureDeviation, getExecutionState)
- `server/src/api/routes/run-execution.ts` — run lifecycle API (start, step execute, complete, deviations)

Key interfaces:
- `StepExecutionData` — `StepExecutionModal.tsx:66`
- `ExecutionState` — `app/src/shared/api/execution.ts:20`

Common downstream effects:
- `ExecutionContext.startExecution()` calls `POST /api/runs/:runId/start` (fire-and-forget)
- Step execution PATCH calls require run status `in_progress`
- `setCurrentStep` API registered at `server/src/api/routes.ts:935`

## Find tab (project navigation)

Primary files:
- `app/src/event-editor/right-pane/find/FindTabPanel.tsx` — study tree, artifacts, protocol picker in RunRow
- `app/src/event-editor/useStudyArtifacts.ts` — artifact fetching hook
- `app/src/event-editor/useProjectInventory.ts` — project inventory hook

Key interfaces:
- `ProtocolContextResponse` — `app/src/shared/api/client.ts:56`

## AI chat (right pane)

Primary files:
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` — chat panel, context assembly
- `app/src/event-editor/right-pane/ai/systemPromptForViewer.ts` — surface-specific system prompts
- `app/src/event-editor/right-pane/ai/ChatInput.tsx` — TipTap rich editor with slash commands
- `server/src/ai/AgentOrchestrator.ts` — AI agent with tool calling
- `server/src/ai/InferenceClient.ts` — OpenAI-compatible inference client, enableThinking handling
- `server/prompts/event-graph-agent.md` — event graph agent system prompt

Common downstream effects:
- `enableThinking: false` in config.yaml → forwarded as `chat_template_kwargs.enable_thinking: false`
- InferenceClient normalizes `content: null` → falls back to `reasoning` field
- Protocol extraction uses its own inference client with `enableThinking: false` per-call

## Server configuration

Primary files:
- `config.yaml` (gitignored) — AI inference, repo, server settings
- `server/src/config/types.ts` — `InferenceConfig`, `AIConfig`, `resolveAiProfile()`
- `server/src/config/loader.ts` — config loading and validation

Common downstream effects:
- `config.yaml` changes require server restart
- `ai.inference.enableThinking: false` disables thinking on all AI calls
- `ai.inference.model` must match exactly what the endpoint serves
