# AI Loop Status & Hermes Comparison

> **For Hermes:** No subagent execution needed — this is an analysis/summary plan.

**Goal:** Summarize the current state of the computable-foundry AI loop and compare it to Hermes `/goals`.

**Date:** 2026-06-18

---

## Current AI Loop Status (as of today)

The AI loop is **not deprecated** — it's actively maintained and working. The confusion likely stems from the "Ralph" coder-critic-retry loop (the autonomous coding agent), which is a separate system within the codebase.

### The AI Loop Architecture (computable-foundry)

The AI loop is a **domain-specific, human-in-the-loop drafting pipeline** for laboratory protocols:

```
User prompt (natural language)
  → Frontend chat (AiTabPanel + useChatThread)
  → SSE stream (POST /api/ai/draft-events/stream)
  → Server orchestrator (AIHandlers.ts)
  → Deterministic precompile (chatbot-compile pipeline)
  → LLM fallback (if deterministic pass has gaps)
  → compile_event_graph_draft tool call
  → Server-side compiler validates + expands
  → Ghost preview rendered on deck
  → User Accept/Discard → commits to event graph
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| Chat thread | `app/.../ai/useChatThread.ts` | Per-tab chat state, SSE consumer |
| Stream dispatcher | `app/.../ai/assistStream.ts` | Routes server events to UI |
| AI handlers | `server/.../AIHandlers.ts` | Route handlers, stream orchestration |
| Compiler pipeline | `server/.../PipelineRunner.ts` | Deterministic passes + LLM fallback |
| System prompt | `server/.../systemPrompt.ts` | Context-aware prompt builder |
| Context builder | `app/.../ai/AiTabPanel.tsx:154-243` | Assembles editor state for server |
| Ghost preview | `app/.../ai/draftPreview.ts` | Converts AI draft to visual overlay |

### What Just Got Wired (Today)

The **PDF → Protocol → Event Graph** path is now complete:

1. `POST /api/ai/extract-protocol` — Extracts structured candidate from uploaded PDF
2. Auto-extraction in `assistStream` — Triggers when PDF is attached
3. `ProtocolSourcePanel` UI — Shows extracted protocol + implementation context textarea
4. Implementation context wiring — Flows from chat → editor → server system prompt
5. System prompt rendering — `formatGraphLemurContext` includes all protocol data

### Current State

- **Typecheck:** ✅ Passing
- **System prompt tests:** ✅ 3/3 passing
- **Server test suite:** ✅ ~95% passing (3 pre-existing failures unrelated to AI)
- **Frontend tests:** ⚠️ Vitest/vite compatibility issue (pre-existing)

---

## Comparison: computable-foundry AI Loop vs. Hermes /goals

| Aspect | computable-foundry AI Loop | Hermes /goals |
|--------|---------------------------|---------------|
| **Purpose** | Domain-specific: draft lab protocols from natural language + structured context | General-purpose: break down tasks into executable subtasks |
| **Execution model** | Human-in-the-loop: user types → AI drafts → user reviews → accept/reject → iterate | Autonomous: subagent executes tasks without user intervention |
| **State management** | React reducer (chatReducer) + editor state machine | Kanban board + todo list per session |
| **Context passing** | Structured context object (labware, events, deck state, protocol candidates) sent to server per-request | Self-contained prompt per subagent with explicit context field |
| **Orchestration** | SSE streaming pipeline with deterministic precompile + LLM fallback | `delegate_task` with per-task subagents |
| **Iteration** | Ghost preview → user correction → revision prompt → full replacement draft | Task-by-task: subagent completes one task, then moves to next |
| **Validation** | Compiler pipeline validates schema, expands macros, checks constraints | Typecheck + linter + test suite per task |
| **Persistence** | YAML records in git repo, event graph in records/ | Session DB, memory, skills |
| **Model access** | Configured via `AI_ENDPOINT` env var (llama.cpp, vLLM, OpenAI-compatible) | Configured via Hermes config.yaml |

### Key Differences

**1. Loop direction:**
- CF: User → AI drafts → User reviews → AI revises (conversational refinement)
- Hermes: User → Plan → Subagents execute autonomously → User reviews final result

**2. Context depth:**
- CF: Rich structured context (labware, events, deck state, protocol data) — the AI sees the full lab state
- Hermes: Self-contained prompt per subagent — context is explicit, not ambient

**3. Iteration granularity:**
- CF: Per-draft iteration (each AI turn produces a full graph draft)
- Hermes: Per-task iteration (each subagent completes a discrete task)

**4. Human oversight:**
- CF: Every draft is a ghost preview — user must Accept before it becomes real
- Hermes: Subagents work autonomously; user reviews at task completion

### How Hermes Could Help Finish the Codebase

**The AI loop is already functional.** The missing pieces are:

1. **Testing gaps** — Some modules lack test coverage (AIHandlers, ExtractProtocolHandler)
2. **Frontend test infra** — Vitest/vite compatibility needs fixing
3. **E2E workflows** — PDF upload → extraction → draft generation needs integration testing
4. **Ralph coder loop** — The autonomous coding agent (Phase 2 wiring) is scaffolded but needs activation

**Hermes can help by:**
- Dispatching subagents to write tests for each module (TDD approach)
- Running the vitest compatibility fix as a discrete task
- Writing E2E Playwright tests for the PDF → graph workflow
- Activating the Ralph coder loop wiring

---

## Files Changed Today

| File | Change |
|------|--------|
| `app/.../EventEditorContext.tsx` | Added `implementationContext` to `EventEditorGraphLemurSource` |
| `app/.../ai/AiTabPanel.tsx` | Wired implementation context through context builder + onGenerate |
| `app/.../ai/ProtocolSourcePanel.tsx` | New UI component for protocol source |
| `app/.../ai/chatReducer.ts` | Added `clear-protocol-candidate` action |
| `app/.../ai/useChatThread.ts` | Exposed `clearProtocolCandidate` method |
| `app/.../ai/ai.css` | Styles for protocol panel |
| `app/src/types/ai.ts` | Added `implementationContext` to `AiGraphLemurContext` |
| `server/src/ai/types.ts` | Added `implementationContext` to `GraphLemurContext` |
| `server/src/ai/systemPrompt.ts` | Render implementation context in graphLemur section |
| `server/.../ExtractProtocolHandler.ts` | New handler for PDF extraction |

---

## Risks & Open Questions

1. **Frontend tests broken** — Vitest/vite compatibility issue needs investigation
2. **Ralph coder loop** — Phase 2 wiring is scaffolded but dormant
3. **E2E testing** — No integration tests for the PDF → graph flow yet
4. **Model dependency** — AI loop requires a configured endpoint (llama.cpp/vLLM)
5. **Token budget** — Full context + protocol candidate + revision history can exceed context windows on smaller models

---
