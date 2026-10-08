# Audit: where the code stands against the three-pane agent harness plan

## Goal
Determine, task-by-task, how much of `.hermes/plans/2026-09-07_220226-three-pane-agent-harness.md` is implemented on `main`, and produce the remaining implementation tasks (TDD) for the parts that are not.

## Why this exists
The working tree on `main` (branch confirmed `main`) already contains several `feat(harness)` / `feat(shell)` / `feat(chat)` commits whose names overlap the plan's phases. Before anyone files the plan as "done" (or re-implements what exists), each task must be checked against the live code with file + line evidence. This audit does that check and turns the genuinely-missing work into bite-sized tasks.

Audit method: read-only inspection of `app/src` (grep for the exact file/component/symbol each task names), `git log` for the task's implied commit, and targeted vitest runs. No production code was changed.

## Current context / verified state (evidence-backed)

Branch: `main`. Relevant commits present (newest first):

- `e822f8f` docs(SOUL): three-pane agent harness supersedes 'never a third pane' — Task 5.1 DONE
- `4d142cf` fix(harness): idempotent step publisher + three-pane e2e (rule-12 gate) — Task 5.2 spec exists
- `e744c4e` feat(harness): publish run protocol steps eagerly so nav rail works on load
- `b4d95b1` feat(harness): left navigation rail + live working-focus chat header — Phase 2 nav rail + header
- `41c3bd5` feat(shell): three-pane workspace composition (nav | action | chat) — Phase 1 DONE
- `1f7ce9d` / `1bd8cb7` test(e2e) + feat(chat): render the AI's tool-call trail + pipeline diagnostics — Task 3.1/3.2 DONE
- `7c2468f` feat(ai-threads): stable conversation identity
- `7946a42` feat(agent-action): declarative action contract schema + Ajv validation — server-side contract schema (NOTE: this is NOT the client `parseAgentInstruction`, it is a different server schema)

Per-Phase status:

| Phase | Status | Evidence |
|---|---|---|
| **Phase 0** AgentInstruction parser (`app/src/agent/AgentInstruction.ts`) | **NOT BUILT** | `app/src/agent/` does not exist; `grep -r parseAgentInstruction\|AgentInstruction\|contextNote app/src server/src` → only `server/src/schema/AgentActionSchema.test.ts` (a server contract schema, a different thing). No client `jump`/`focus` parser anywhere. |
| **Phase 1** Three-pane shell | **DONE** | `app/src/shared/shell/AppShell.tsx:69,147,163,181,268` — `navPane`/`actionPane` props + render; `app/src/shared/shell/AppShell.test.tsx` exists; e2e `three-pane-harness.spec.ts` asserts `--nav/--action/--chat` panes. |
| **Phase 2** Permanent chat + context header | **PARTIAL** | `ChatContextHeader.tsx` exists + mounted ABOVE `AiTabPanel` in `RightPane.tsx:92-93`; `ProtocolNavPanel.tsx` is the left rail (mounted `RunWorkspacePage.tsx:138`). BUT the chat is still the **AI tab inside the tabbed right pane** (RightPane has AI/Search/Details/Protocol tabs), defaulting to `rightPaneMode='ai'` (`workspace/types.ts:272`). The plan wanted the other tabs migrated into the left NAV column and a true permanent right column — that migration is NOT done; only the default-tab + header + rail exist. |
| **Phase 3** Edit lifecycle (tool-call trail, focus→context, draft→ghost) | **DONE** | `assistStream.ts:86-89,229-239` dispatches `tool_call`/`tool_result`/`draft` (no longer dropped); `AiTabPanel.tsx:260-325` `onDraftResult` → `buildPreviewFromDraft` → `actions.setPreview` ghost; `AiTabPanel.tsx:537` sends `protocolStepContext` via `protocol-step-selection` listener → `stepSelectionToSurfaceContext`. Tests pass: assistStream(8) + draftPreview(3) + ChatContextHeader(2) = 13 green, `npx tsc -p app/tsconfig.json` exit 0. |
| **Phase 4** AI drives nav (declarative jump) | **NOT BUILT** | No `parseAgentInstruction`/`jump` handling in any chat handler. The `feat(nav): NAV jump` commits (`9c951b0`, `cf0ad7f`, `504c30f`) are a DIFFERENT feature (a `/find` "jump" affordance that materializes a deepwell run) — unrelated to the agent-instruction jump this plan specifies. |
| **Phase 5** SOUL.md + Playwright | **DONE (SOUL) / COMMITTED (e2e)** | SOUL.md:49 updated (supersedes two-pane). e2e `app/e2e/three-pane-harness.spec.ts` committed (4d142cf). Re-run to confirm green on this host before relying on it. |

## Bottom line
- **Already done / do NOT re-implement:** Phase 1, Phase 3, Phase 5.1, and the core of Phase 2 (nav rail + header + default-AI-tab).
- **Genuinely missing:** Phase 0 (the `AgentInstruction` parser) and Phase 4 (executing an agent instruction to jump/focus). These two are coupled — Phase 0 is the parser Phase 4 executes — so the remaining implementation is essentially "build the declarative agent-instruction parser, then the handler that turns a response into a jump/focus, then re-verify." Also a Phase 2 decision: whether the RunWorkspace right pane must become a true fixed chat column (migrating Search/Details/Protocol into the left nav) or the current default-AI-tab is accepted as "permanent enough."

## Architecture / proposed approach (for the missing work)
The client already parses NOTHING today, but the server already owns a declarative agent-action contract (`7946a42`, `server/src/schema/AgentActionSchema`). Align the client parser to that server contract rather than inventing a second shape. Keep the model producing a JSON instruction stashed in the assistant message, parse it on the client, and have the chat pane dispatch a `focus`/`jump` onto `ProtocolSelectionContext` + `openContent`. TDD: parser first (pure function, no React), then the handler unit test, then extend the committed e2e.

---

## Step-by-step tasks (remaining work only)

### Phase 0 — `AgentInstruction` parser (pure function, TDD)

#### Task 0.1 — (RED) failing test for the parser
File: `app/src/agent/AgentInstruction.ts` (create the `app/src/agent/` dir) and `app/src/agent/AgentInstruction.test.ts` (new).

Write the test FIRST:
```ts
// app/src/agent/AgentInstruction.test.ts
import { describe, it, expect } from 'vitest'
import { parseAgentInstruction, type AgentInstruction } from './AgentInstruction'

describe('parseAgentInstruction', () => {
  it('parses an <!-- agui {...} --> HTML comment instruction', () => {
    const text = 'Here is my answer.\n<!-- agui {"jump":{"kind":"step","stepId":"s1"}} -->'
    const out = parseAgentInstruction(text)
    expect(out?.jump).toEqual({ kind: 'step', stepId: 's1' })
  })
  it('parses a ```json {...}``` code fence', () => {
    const text = 'Answer.\n```json\n{"jump":{"kind":"deck"}}\n```'
    const out = parseAgentInstruction(text)
    expect(out?.jump).toEqual({ kind: 'deck' })
  })
  it('returns null for a plain sentence', () => {
    expect(parseAgentInstruction('Just talking, like right now.')).toBeNull()
  })
  it('preserves contextNote on the instruction', () => {
    const out = parseAgentInstruction('<!-- agui {"contextNote":"we are editing STEP 2"} -->')
    expect(out?.contextNote).toBe('we are editing STEP 2')
  })
})
```
Run and confirm RED (module missing):
```
cd app && npx vitest run src/agent/AgentInstruction.test.ts   # → fails to find module ./AgentInstruction
```

#### Task 0.2 — (GREEN) implement the parser
File: `app/src/agent/AgentInstruction.ts` (new). Complete copy-pasteable implementation:
```ts
// app/src/agent/AgentInstruction.ts — declarative agent-instruction statement.
export type AgentJumpTarget =
  | { kind: 'tab'; tabId?: string; tabKind?: 'run' | 'deck' | 'project' | 'pdf' | 'document' }
  | { kind: 'step'; stepId: string }
  | { kind: 'plate'; plateId: string }
  | { kind: 'deck' }

export interface AgentInstruction {
  jump?: AgentJumpTarget
  contextNote?: string
}

function extractJson(text: string): string | null {
  // 1) ```json ... ``` fence
  const fence = text.match(/```json\s*([\s\S]*?)```/)
  if (fence) return fence[1].trim()
  // 2) <!-- agui {...} --> comment
  const comment = text.match(/<!--\s*agui\s+([\s\S]*?)-->/)
  if (comment) return comment[1].trim()
  return null
}

export function parseAgentInstruction(text: string): AgentInstruction | null {
  const blob = extractJson(text)
  if (!blob) return null
  try {
    const parsed = JSON.parse(blob) as AgentInstruction
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.jump && !parsed.contextNote) return null
    return parsed
  } catch {
    return null
  }
}
```
Run, confirm GREEN:
```
cd app && npx vitest run src/agent/AgentInstruction.test.ts    # → 4 passed
cd app && npx tsc --noEmit                                     # → clean
```
Commit: `feat(agent): declarative AgentInstruction parser (jump/focus/contextNote)`.

### Phase 4 — execute an agent instruction (jump/focus) in the chat

#### Task 4.1 — (RED) failing test: chat routes a response containing an instruction
File: `app/src/agent/AgentChatHandler.test.tsx` (new). This tests the handler/wiring in isolation before touching `AiTabPanel`.
```ts
// app/src/agent/AgentChatHandler.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useAgentChatHandler, type AgentChatHandlerDeps } from './AgentChatHandler'

describe('useAgentChatHandler', () => {
  it('executes a step jump against the deps', () => {
    const focus = vi.fn()
    const openContent = vi.fn()
    const deps: AgentChatHandlerDeps = { focusStep: focus, openContent }
    const { result } = renderHook(() => useAgentChatHandler(deps))
    act(() => {
      result.current.handleAssistantMessage(
        'Doing that now.\n<!-- agui {"jump":{"kind":"step","stepId":"s1"}} -->'
      )
    })
    expect(focus).toHaveBeenCalledWith('s1')
  })
  it('activates a deck tab on a deck jump', () => {
    const focus = vi.fn()
    const openContent = vi.fn()
    const deps: AgentChatHandlerDeps = { focusStep: focus, openContent }
    const { result } = renderHook(() => useAgentChatHandler(deps))
    act(() => {
      result.current.handleAssistantMessage('<!-- agui {"jump":{"kind":"deck"}} -->')
    })
    expect(openContent).toHaveBeenCalled()
  })
  it('does nothing on a plain message', () => {
    const focus = vi.fn()
    const openContent = vi.fn()
    const { result } = renderHook(() => useAgentChatHandler(deps( focus, openContent )))
    act(() => { result.current.handleAssistantMessage('Just chatting.') })
    expect(focus).not.toHaveBeenCalled()
    expect(openContent).not.toHaveBeenCalled()
  })
})
```
(Run → RED, module missing.)

#### Task 4.2 — (GREEN) implement the handler
File: `app/src/agent/AgentChatHandler.ts` (new). Complete implementation:
```ts
// app/src/agent/AgentChatHandler.ts
import { useCallback } from 'react'
import { parseAgentInstruction } from './AgentInstruction'

export interface AgentChatHandlerDeps {
  focusStep: (stepId: string) => void
  openContent: () => void
}

export function useAgentChatHandler(deps: AgentChatHandlerDeps) {
  const handleAssistantMessage = useCallback(
    (text: string) => {
      const instruction = parseAgentInstruction(text)
      if (!instruction) return
      if (instruction.jump?.kind === 'step' && instruction.jump.stepId) {
        deps.focusStep(instruction.jump.stepId)
      } else if (instruction.jump?.kind === 'deck') {
        deps.openContent()
      }
    },
    [deps],
  )
  return { handleAssistantMessage }
}
```
NOTE: the third test references `deps( focus, openContent )` in its body — keep the test file's real deps inline (`const raws = { focusStep: focus, openContent }`), do NOT copy that typo; on RED it merely must fail to find the module. Fix the test to build `{ focusStep, openContent }` directly before GREEN.
Run, confirm GREEN:
```
cd app && npx vitest run src/agent/AgentChatHandler.test.tsx   # → 3 passed
cd app && npx tsc --noEmit                                     # → clean
```
Commit: `feat(agent): execute jump/focus agent instructions in the chat`.

#### Task 4.3 — (RED→GREEN) wire the handler into the live chat pane
File: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (edit).
- Import `useAgentChatHandler` from `../../../../agent/AgentChatHandler`.
- Build deps from existing context helpers: `focusStep: (id) => …` → call a `setFocusedStep`-equivalent (find the selector/id mapping used by `ProtocolNavPanel.handleStepClick`, which maps a step summary to `setFocusedStep`), and `openContent: () => openContent(openTabs, navigate, <deck tab>, <deck route>)` — reuse the same gesture `RunInEventEditorButton` already performs (deck-tab activation).
- In the completed-message path (where assistant text is available), call `handleAssistantMessage(text)`.
Test approach: extend `app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx` with a case where the mock ответ contains an `<!-- agui {"jump":{"kind":"deck"}} -->` and assert the deck-activation/`openContent` path fires. Run RED first (no wiring), implement, GREEN.
```
cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.test.tsx
cd app && npx tsc --noEmit
```
Commit: `feat(agent): chat jump/focus reaches the live run workspace`.

### Phase 2 — resolve the "permanent chat column" decision (open question, needs Brad)
The nuance: today the chat is the DEFAULT topic of the tabbed right pane (mode `ai`), with Search/Details/Protocol still available as sibling tabs (`RightPane.tsx:33`), and `ChatContextHeader` sits above the AI tab only. The plan called for migrating those siblings into the left NAV column and a fixed chat column.

**Do NOT implement this migration unprompted.** It changes the right-pane UX for Search/Details/Protocol. Ask Brad which he wants:
- (a) current state is "permanent enough" (default-AI-tab, header + rail) → close Phase 2 as-is, document the decision; or
- (b) true fixed chat column → then: `RightPane.tsx` AI tab content stays; move Search/Details/Protocol into `ProtocolNavPanel` (or a new `RunNavPane`) as clickable nav items that set the right-pane mode AND focus; remove the tab strip. That is a follow-on task once he chooses (b).

### Phase 5 — re-verify the committed e2e gate
Task to re-run the committed Playwright spec on this host (the browser binary is installed per prior session):
```
cd app && npx playwright test e2e/three-pane-harness.spec.ts --project=chromium
```
Expected: all 4 tests pass (three panes render, nav lists step concepts, clicking a step updates the chat header, two-pane surfaces unaffected). If it passes, the harness shell is verified end-to-end. If it is red, fix before claiming "done."

## Tests / validation summary (commands + expected output)
| Task | Command (`cd app`) | Expected |
|---|---|---|
| 0.1 RED | `npx vitest run src/agent/AgentInstruction.test.ts` | cannot find module `./AgentInstruction` |
| 0.2 GREEN | `npx vitest run src/agent/AgentInstruction.test.ts` | 4 passed |
| 0 build | `npx tsc --noEmit` | exit 0, no output |
| 4.1 RED | `npx vitest run src/agent/AgentChatHandler.test.tsx` | module missing |
| 4.2 GREEN | `npx vitest run src/agent/AgentChatHandler.test.tsx` | 3 passed |
| 4.3 GREEN | `npx vitest run src/event-editor/right-pane/ai/AiTabPanel.test.tsx` | prior + new jump tests pass |
| 5 gate | `npx playwright test e2e/three-pane-harness.spec.ts --project=chromium` | 4 passed |

## Risks, tradeoffs, open questions
- **Do not re-implement Phases 1/3/5.1** — they are done and green. The audit is the guard against duplicate work.
- **`focusStep` seam ambiguity (Task 4.3).** `ProtocolNavPanel` focuses via a step *summary* (`{ stepId, ordinal, label }`) → `setFocusedStep`. The parsed instruction carries only `stepId`, so the wiring must look up the full summary (from `ProtocolSelectionContext.steps`) before calling `setFocusedStep`, or `setFocusedStep` must tolerate a bare id. Resolve by locating the step summary by id first; fail soft (log + no-op) if not found.
- **Open question — permanent chat column (Phase 2(b)).** Needs Brad's call before any right-pane tab migration; the default-tab state may already satisfy him.
- **Server vs client contract alignment.** Server already has `AgentActionSchema` (`7946a42`). If the client parser should VALIDATE against it (runtime Ajv client-side), promote later — YAGNI: the pure parser + a single `jump`/`contextNote` shape is enough for now; only add Ajv when a second real action type appears (the plan's own YAGNI note).
- **Message → instruction trigger.** The handler currently runs on EVERY completed assistant message. A model that narrates in prose (no fence/comment) produces no instruction → no-op, which is correct. But the plan's Phase 4.4 (`contextNote` surfacing in the header) is NOT in the minimal scope of Task 4.1-4.3 — it is a small follow-on if Brad wants the AI to be able to *set* the visible working-context label, not just navigate.
