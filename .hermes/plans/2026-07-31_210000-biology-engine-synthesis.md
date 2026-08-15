# Biology Engine + Sidebar State Machine — Synthesis Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Build an ontology-backed semantic compiler for laboratory intent with a state-machine-driven sidebar UI — combining the backend biology engine (operation registry, semantic gaps, ProtocolIntent, graph patching) with the frontend sidebar redesign (Questions/Interpretation/Changes panels, conditional ChatInput, sub-tab navigation) into a single coordinated implementation.

**Architecture:** The backend and frontend changes are interdependent: the sidebar's Interpretation panel needs the ProtocolIntent intermediate to display, the Questions panel needs the generalized gap types to show typed question cards, the Changes panel needs graph patches to show diffs, and the conditional ChatInput needs the sidebar state machine. The implementation is sequenced so each phase delivers a testable increment that works end-to-end, even if later phases aren't done yet.

**Tech Stack:** TypeScript, Fastify, React, TipTap, Zod, vitest, vLLM (Qwen3.6-27B)

---

## How This Plan Synthesizes the Two Source Plans

| Source Plan A (Biology Engine) | Source Plan B (Sidebar State Machine) | Synthesis |
|---|---|---|
| Phase 1: Operation Registry | — | Foundation — needed before gap types can reference operations |
| Phase 2: Semantic Gap Engine | Phase 1: Sidebar State Machine | Combined — gap types drive sidebar state transitions |
| Phase 3: ProtocolIntent as Draft Intermediate | Phase 4: Interpretation Panel | Combined — ProtocolIntent IS the interpretation data |
| Phase 4: Graph Patching | Phase 5: Changes Panel | Combined — patches produce the changes diff |
| Phase 5: Execution Binding Bridge | — | Backend-only, last |
| — | Phase 2: Questions Panel | Frontend-only, depends on gap types |
| — | Phase 3: Conditional ChatInput | Frontend-only, depends on state machine |
| — | Phase 6: Sub-tab Navigation | Frontend-only, depends on all panels existing |

**Key insight:** The two plans share a common boundary — the `AgentResult` returned by the backend and consumed by the frontend. The synthesis plan sequences work so the backend enriches `AgentResult` first (new gap types, intent graph, graph patches), then the frontend consumes those enrichments (typed question cards, interpretation panel, changes diff).

---

## Phased Implementation Overview

```
Phase 1: Operation Registry (backend, standalone)
  ↓ enables: typed operation references in gaps and intent
Phase 2: Sidebar State Machine (frontend, standalone)
  ↓ enables: state-driven rendering, conditional ChatInput
Phase 3: Generalized Gap Engine + Questions Panel (backend + frontend)
  ↓ enables: typed question cards, 5 gap types
Phase 4: ProtocolIntent + Interpretation Panel (backend + frontend)
  ↓ enables: semantic interpretation display
Phase 5: Graph Patching + Changes Panel (backend + frontend)
  ↓ enables: deterministic patches, diff review
Phase 6: Execution Binding Bridge (backend, standalone)
  ↓ enables: instrument capability warnings
Phase 7: Sub-tab Navigation + Polish (frontend)
```

---

## Phase 1: Operation Registry (Backend)

Standalone backend work. No frontend changes. Replaces the three fragmented verb normalization maps with a single YAML-driven registry.

### Task 1.1: Create canonical operations YAML

**Objective:** Single source of truth for verb→operation mappings.

**Files:**
- Create: `schema/registry/operations.yaml`

**Content:** 26+ operations with id, label, primitive (or null for compound), expands_to, aliases, ontology_refs, notes. Includes new aliases: shake→mix, agitate→mix, heat→incubate, acquire_measurement→read, maintain_environment→incubate, control_temperature→incubate, distribute_biological_material→seed, remove_and_replace_liquid→wash.

(Full YAML content is in source plan A, Task 1.1 — copy verbatim.)

**Commit:**
```bash
git add schema/registry/operations.yaml
git commit -m "feat: add canonical operation registry YAML"
```

### Task 1.2: Create OperationRegistry loader + tests

**Objective:** TypeScript loader with alias lookup and Zod validation.

**Files:**
- Create: `server/src/registry/OperationRegistry.ts`
- Create: `server/src/registry/OperationRegistry.test.ts`

**TDD cycle:** Test that shake→mix, agitate→mix, spin→centrifuge, heat→incubate, wash expands to [add_material, transfer], unknown verbs return undefined, listPrimitives returns 9 entries.

(Full implementation in source plan A, Task 1.2 — copy verbatim.)

**Commit:**
```bash
git add server/src/registry/OperationRegistry.ts server/src/registry/OperationRegistry.test.ts
git commit -m "feat: add OperationRegistry loader with alias lookup"
```

### Task 1.3: Replace normalizeCandidateActionVerb with OperationRegistry

**Objective:** Replace the hardcoded alias map in ChatbotCompilePasses.ts.

**Files:**
- Modify: `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts:372`

Replace the body of `normalizeCandidateActionVerb` with a call to `getOperationRegistry().lookup(verb)`. Run existing compiler tests to verify no regressions.

(Full implementation in source plan A, Task 1.3.)

**Commit:**
```bash
git add server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts
git commit -m "refactor: replace hardcoded normalizeCandidateActionVerb with OperationRegistry"
```

### Task 1.4: Add "shake" expander

**Objective:** Add a shake verb expander that lowers to mix with orbital shaking parameters.

**Files:**
- Modify: `server/src/compiler/biology/verbs/simpleVerbs.ts`
- Modify: `server/src/compiler/biology/BiologyVerbExpander.test.ts`

(Full implementation in source plan A, Task 1.4.)

**Commit:**
```bash
git add server/src/compiler/biology/verbs/simpleVerbs.ts server/src/compiler/biology/BiologyVerbExpander.test.ts
git commit -m "feat: add shake verb expander (orbital shaking → mix)"
```

---

## Phase 2: Sidebar State Machine (Frontend)

Standalone frontend work. No backend changes. Introduces the discriminated-union state type and wires it into AiTabPanel.

### Task 2.1: Define AiSidebarState type + reducer + tests

**Objective:** Pure state machine with 6 modes (ready, interpreting, clarifying, updating, reviewing, committing).

**Files:**
- Create: `app/src/event-editor/right-pane/ai/sidebarState.ts`
- Create: `app/src/event-editor/right-pane/ai/sidebarState.test.ts`

Includes: `AiSidebarState` discriminated union, `SidebarAction` union, `sidebarReducer`, selector helpers (`isChatEnabled`, `primaryActionLabel`, `headerLabel`), supporting types (`SemanticInterpretation`, `EventGraphChange`, `ValidationGap`, `InterpretationProgress`).

(Full implementation in source plan B, Task 1.1 — copy verbatim.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/sidebarState.ts app/src/event-editor/right-pane/ai/sidebarState.test.ts
git commit -m "feat: add AiSidebarState discriminated-union state machine"
```

### Task 2.2: Wire sidebar state into AiTabPanel

**Objective:** Integrate sidebar reducer alongside chatReducer, bridge SSE events to sidebar transitions.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx`

Bridge: `handleSend` → `start-interpreting`, `onDraftResult` → `clarifications-needed` or `draft-ready`, `handleClarificationsSubmit` → `submit-answers`, cancel → `cancel`.

(Full implementation in source plan B, Task 1.2.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx
git commit -m "feat: wire AiSidebarState into AiTabPanel with SSE bridge"
```

### Task 2.3: Conditional ChatInput

**Objective:** Hide ChatInput when sidebar mode = 'clarifying', show "Answer the questions above to continue."

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

Wrap ChatInput in conditional: render when `isChatEnabled(sidebar)`, render disabled prompt when `sidebar.mode === 'clarifying'`, render nothing for interpreting/updating/committing.

(Full implementation in source plan B, Phase 3.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat: hide ChatInput during clarification, show disabled prompt"
```

---

## Phase 3: Generalized Gap Engine + Questions Panel (Backend + Frontend)

This is the first cross-boundary phase. Backend adds new gap types; frontend renders them as typed question cards.

### Task 3.1: Extend gap types to 5 categories

**Objective:** Add instance-gap, capability-gap, and semantic-conflict to forceMaterialClarifications.

**Files:**
- Modify: `server/src/ai/forceMaterialClarifications.ts`
- Modify: `server/src/ai/types.ts` (extend `AgentClarificationKind` if needed)
- Modify: `server/src/ai/forceMaterialClarifications.test.ts`

New `SemanticGapReason`: `no-ref`, `unverified-curie`, `needs-quantity`, `instance-gap`, `capability-gap`, `semantic-conflict`.

Each new gap type generates a different `AgentClarificationRequest` with:
- `instance-gap` → kind: 'material', menuProvider: '/m' but searching local inventory instances
- `capability-gap` → kind: 'general', menuProvider: 'choice' with instrument options
- `semantic-conflict` → kind: 'general', menuProvider: 'choice' with resolution options

(Full implementation in source plan A, Task 2.1–2.2.)

**Commit:**
```bash
git add server/src/ai/forceMaterialClarifications.ts server/src/ai/types.ts server/src/ai/forceMaterialClarifications.test.ts
git commit -m "feat: extend gap engine to 5 types (identity, instance, parameter, capability, conflict)"
```

### Task 3.2: Create QuestionsPanel component

**Objective:** Persistent clarification surface with typed question cards.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/QuestionsPanel.tsx`
- Create: `app/src/event-editor/right-pane/ai/QuestionsPanel.test.tsx`

Features:
- Per-question cards with number, kind badge, prompt, snippet
- ClarificationPicker for /m, /l, /e types (reused from existing)
- Progress tracker ("2 of 3 answered")
- Editable answers with "Change" button
- "Update draft" primary button when all answered
- "Cancel this draft and start a new prompt" escape hatch

(Full implementation in source plan B, Task 2.1.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/QuestionsPanel.tsx app/src/event-editor/right-pane/ai/QuestionsPanel.test.tsx
git commit -m "feat: add QuestionsPanel as persistent clarification surface"
```

### Task 3.3: Render QuestionsPanel in AiTabPanel, remove inline ClarificationCards from MessageLog

**Objective:** Move clarifications out of the chat transcript into the persistent panel.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (render QuestionsPanel when mode='clarifying')
- Modify: `app/src/event-editor/right-pane/ai/MessageLog.tsx` (replace ClarificationCards with summary text)

MessageLog shows: "3 clarifications needed — see Questions panel above." The interactive cards live in QuestionsPanel.

(Full implementation in source plan B, Task 2.2.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/MessageLog.tsx
git commit -m "refactor: move clarifications from inline MessageLog to persistent QuestionsPanel"
```

---

## Phase 4: ProtocolIntent + Interpretation Panel (Backend + Frontend)

Backend wires ProtocolIntent into the AI draft flow; frontend shows the interpretation.

### Task 4.1: Add intentGraph to compile_event_graph_draft tool

**Objective:** LLM produces intent graphs (mentions + operations + ordering) instead of direct events.

**Files:**
- Modify: `server/src/ai/submitSuggestionTool.ts` (add intentGraph to tool schema)
- Modify: `server/src/ai/AgentOrchestrator.ts` (convert intentGraph → ProtocolIntent → lower to events)
- Read: `server/src/compiler/protocolIntent/ProtocolIntent.ts` (existing types)

The tool accepts an optional `intentGraph` field. When present, the orchestrator converts it to a `ProtocolIntent` and runs the existing `lower_protocol_intent` pass. When absent, falls back to the current direct-draft path (backward compatible).

(Full implementation in source plan A, Task 3.1.)

**Commit:**
```bash
git add server/src/ai/submitSuggestionTool.ts server/src/ai/AgentOrchestrator.ts
git commit -m "feat: accept ProtocolIntent as AI draft intermediate"
```

### Task 4.2: Return interpretation in AgentResult

**Objective:** Enrich AgentResult with a `SemanticInterpretation` the frontend can render.

**Files:**
- Modify: `server/src/ai/types.ts` (add `interpretation?: SemanticInterpretation` to AgentResult)
- Modify: `server/src/ai/AgentOrchestrator.ts` (populate interpretation from ProtocolIntent)

```typescript
// In AgentResult:
interpretation?: {
  operations: Array<{
    type: string
    target?: string
    material?: string
    parameters?: Record<string, unknown>
    resolved: boolean
  }>
}
```

The orchestrator extracts this from the ProtocolIntent's `operations[]` before lowering to events.

**Commit:**
```bash
git add server/src/ai/types.ts server/src/ai/AgentOrchestrator.ts
git commit -m "feat: return SemanticInterpretation in AgentResult"
```

### Task 4.3: Create InterpretationPanel component

**Objective:** Show parsed operations with resolved/unresolved markers.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/InterpretationPanel.tsx`
- Create: `app/src/event-editor/right-pane/ai/InterpretationPanel.test.tsx`

Renders operations as cards: type (DISPENSE, AGITATE, INCUBATE), target, material, parameters. Unresolved parameters shown with a warning marker.

(Full implementation in source plan B, Task 4.1.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/InterpretationPanel.tsx app/src/event-editor/right-pane/ai/InterpretationPanel.test.tsx
git commit -m "feat: add InterpretationPanel showing parsed operations"
```

### Task 4.4: Wire InterpretationPanel into AiTabPanel

**Objective:** Populate the sidebar's interpretation from AgentResult and render the panel.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

In the `onDraftResult` callback, extract `result.interpretation` and dispatch `draft-ready` with it. The sidebar's `reviewing` state carries the interpretation.

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat: wire InterpretationPanel with AgentResult interpretation"
```

### Task 4.5: Update system prompt to prefer intentGraph output

**Objective:** Guide the LLM toward producing intent graphs.

**Files:**
- Modify: `server/src/ai/AgentOrchestrator.ts` (FORCED_DRAFT_TOOL_INSTRUCTION)

(Full implementation in source plan A, Task 3.2.)

**Commit:**
```bash
git add server/src/ai/AgentOrchestrator.ts
git commit -m "feat: update system prompt to prefer intentGraph output"
```

---

## Phase 5: Graph Patching + Changes Panel (Backend + Frontend)

Backend adds graph patches; frontend shows the diff.

### Task 5.1: Define graph patch operations + application logic

**Objective:** Typed patch format for deterministic graph mutations.

**Files:**
- Create: `server/src/ai/graphPatches.ts`
- Create: `server/src/ai/graphPatches.test.ts`

Patch types: `bind_entity`, `set_parameter`, `add_execution_constraint`, `move_before`, `replace_operation`. The `applyPatches` function applies patches to a ProtocolIntent, validates, and returns applied/rejected/newGaps.

(Full implementation in source plan A, Task 4.1.)

**Commit:**
```bash
git add server/src/ai/graphPatches.ts server/src/ai/graphPatches.test.ts
git commit -m "feat: add graph patch operations for deterministic graph editing"
```

### Task 5.2: Use graph patches for clarification answers

**Objective:** Apply clarification answers as patches instead of full re-draft when possible.

**Files:**
- Modify: `server/src/ai/AgentOrchestrator.ts`

When clarificationAnswers are present AND a prior intent graph exists: convert answers to patches, apply them, and if clean (no rejections, no new gaps), lower the patched intent to events without re-calling the LLM. Fall back to re-draft for structural changes.

(Full implementation in source plan A, Task 4.2.)

**Commit:**
```bash
git add server/src/ai/AgentOrchestrator.ts
git commit -m "feat: apply clarification answers as graph patches instead of re-draft"
```

### Task 5.3: Return changes diff in AgentResult

**Objective:** Enrich AgentResult with a changes array the frontend can render as a diff.

**Files:**
- Modify: `server/src/ai/types.ts` (add `changes?: EventGraphChange[]` to AgentResult)
- Modify: `server/src/ai/AgentOrchestrator.ts` (populate changes from draft events)

```typescript
// In AgentResult:
changes?: Array<{
  op: 'add' | 'modify' | 'remove'
  description: string
  eventId?: string
}>
```

**Commit:**
```bash
git add server/src/ai/types.ts server/src/ai/AgentOrchestrator.ts
git commit -m "feat: return changes diff in AgentResult"
```

### Task 5.4: Create ChangesPanel component

**Objective:** Diff-like review surface with Apply/Discard buttons.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/ChangesPanel.tsx`
- Create: `app/src/event-editor/right-pane/ai/ChangesPanel.test.tsx`

Renders: warnings section, changes diff (+ additions, - removals, ~ modifications), Apply/Discard actions.

(Full implementation in source plan B, Task 5.1.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/ChangesPanel.tsx app/src/event-editor/right-pane/ai/ChangesPanel.test.tsx
git commit -m "feat: add ChangesPanel for draft review with apply/discard"
```

### Task 5.5: Wire ChangesPanel into AiTabPanel

**Objective:** Show ChangesPanel when sidebar mode = 'reviewing', populate from AgentResult.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

Apply button calls `editor.actions.commitPreview()` + `sidebarDispatch({ type: 'commit' })`. Discard calls `handleCancelDraft`.

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat: wire ChangesPanel with AgentResult changes diff"
```

---

## Phase 6: Execution Binding Bridge (Backend)

Standalone backend work. Connects operation requirements to instrument capabilities.

### Task 6.1: Add check_instrument_capabilities compiler pass

**Objective:** After events are produced, check if registered instruments can satisfy the operation requirements.

**Files:**
- Create: `server/src/compiler/pipeline/passes/CheckInstrumentCapabilities.ts`
- Modify: `server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts` (register pass)
- Modify: `schema/registry/compile-pipelines/chatbot-compile.yaml` (add pass to pipeline)

Emits warnings when no registered instrument supports an operation's requirements (e.g. orbital shaking at 1500 rpm with no shaker that goes that fast).

(Full implementation in source plan A, Task 5.1.)

**Commit:**
```bash
git add server/src/compiler/pipeline/passes/CheckInstrumentCapabilities.ts server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts schema/registry/compile-pipelines/chatbot-compile.yaml
git commit -m "feat: add instrument capability checking pass"
```

---

## Phase 7: Sub-tab Navigation + Polish (Frontend)

### Task 7.1: Add sub-tab strip

**Objective:** [Chat] [Questions] [Interpretation] [Changes] sub-tabs with auto-switching.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/ai/ai.css`

Auto-switch based on sidebar mode: clarifying→Questions, interpreting→Interpretation, reviewing→Changes, ready→Chat. Manual override allowed.

(Full implementation in source plan B, Task 6.1.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/ai.css
git commit -m "feat: add sub-tab navigation with auto-switching based on sidebar state"
```

### Task 7.2: Add status footer with primary action

**Objective:** Persistent footer showing current primary action button and progress.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

Footer shows: "2 of 3 answered" + "Continue when all are answered" (clarifying), "Apply to run" (reviewing).

(Full implementation in source plan B, Task 6.2.)

**Commit:**
```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat: add persistent footer with state-driven primary action"
```

---

## Dependency Graph

```
Phase 1 (Operation Registry) ──────────────────────────────┐
                                                             ↓
Phase 2 (Sidebar State Machine) ──┐                          │
                                  ↓                          ↓
Phase 3 (Gap Engine + Questions) ← depends on 1 + 2
                                  ↓
Phase 4 (ProtocolIntent + Interpretation) ← depends on 2
                                  ↓
Phase 5 (Graph Patching + Changes) ← depends on 4
                                  ↓
Phase 6 (Execution Binding) ← depends on 1 (standalone, can run in parallel with 2-5)
                                  ↓
Phase 7 (Sub-tabs + Polish) ← depends on 3, 4, 5
```

**Parallelizable:** Phase 1 and Phase 2 can be implemented simultaneously (different directories, no shared files). Phase 6 can be implemented any time after Phase 1.

---

## Risks and Tradeoffs

1. **ProtocolIntent backward compatibility** — The existing ProtocolIntent types are used in the deterministic precompile path. Wiring them into the AI agent flow may require pipeline ordering changes. Mitigation: the intentGraph field is optional; if absent, the current direct-draft path runs unchanged.

2. **Graph patching vs. re-draft** — Patching is more stable but harder to implement correctly. Trade-off: start with patching for simple cases (bind_entity, set_parameter), fall back to re-draft for structural changes (replace_operation, move_before).

3. **Sidebar reducer coexistence with chat reducer** — Two reducers in AiTabPanel, bridged through callbacks. Risk: state transitions can get out of sync if a callback is missed. Mitigation: the sidebar reducer is the single source of truth for UI mode; the chat reducer only manages the message transcript.

4. **LLM model capability** — Qwen3.6-27B may struggle to produce well-structured intent graphs. Mitigation: the deterministic engine normalizes and validates; malformed intent falls back to direct event drafting.

5. **Interpretation panel is initially sparse** — The backend may not return rich interpretation data until ProtocolIntent is fully wired. Mitigation: the panel handles empty operations gracefully and shows "No operations parsed yet."

6. **Breaking existing tests** — Moving ClarificationCards from MessageLog to QuestionsPanel breaks existing tests. Mitigation: update tests in the same commit as the refactor.

---

## Open Questions

1. Should the Interpretation panel show in real-time during streaming, or only after the draft is complete?
2. Should the Changes panel show a diff against the current graph or just proposed additions?
3. Should capability gaps block the draft (like material gaps) or just warn?
4. Should graph patches be visible to the user as a diff, or applied silently?
5. Should the sub-tab auto-switch be overridable, or should state transitions always force the tab?

---

## Verification

After each phase:

1. Backend tests: `cd server && npx vitest run`
2. Frontend tests: `cd app && npx vitest run`
3. TypeScript: `cd server && npx tsc --noEmit` and `cd app && npx tsc --noEmit`
4. Manual test after Phase 3: type "add 10 µL of 1 µM clofibrate to A1" → Questions panel appears, ChatInput hidden, typed question cards
5. Manual test after Phase 4: type "shake at 600 rpm for 5 min, then incubate at 37°C overnight" → Interpretation panel shows AGITATE + INCUBATE operations
6. Manual test after Phase 5: answer clarifications → Changes panel shows diff, Apply commits to deck
7. Manual test after Phase 7: sub-tabs auto-switch through the full flow: Chat → Interpretation → Questions → Changes → Chat
