# AI Sidebar State Machine Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Replace the current flat chat-bubble + inline-clarification UI with a state-machine-driven sidebar that separates conversation from resolution, gives clarifications a persistent panel, and enforces "exactly one primary action at any moment."

**Architecture:** The backend clarification protocol is already correct (hold draft, return structured requests, batch answers, resubmit). The change is purely frontend: introduce a discriminated-union `AiSidebarState` type, render different layouts per state, move clarification cards out of the chat transcript into a persistent Questions panel, and add an Interpretation panel + Changes panel. The existing `chatReducer` is extended, not replaced — the state machine wraps it.

**Tech Stack:** React, TypeScript, TipTap, vitest, @testing-library/react

---

## Current State Analysis

### What Exists

```
RightPane (tab strip: AI | Find | Search | Details | Protocol)
  └── AiTabPanel (always renders, no state machine)
      ├── System prompt header + WarmIndicator
      ├── SourcesStrip
      ├── ProtocolBuilderOrchestrator (conditional)
      ├── MessageLog
      │   ├── Chat bubbles (map over messages[])
      │   │   └── ClarificationCards (INLINE per message)
      │   │       └── ClarificationPicker (inline search)
      │   ├── Pending bubble (when streaming)
      │   └── Status / error text
      ├── Revision hint (conditional)
      ├── ChatInput (ALWAYS visible — this is the problem)
      └── AddSourceModal
```

### Key Problems

1. **ChatInput is always visible** — even when clarifications are pending, the user sees an active chat input competing with the clarification cards
2. **Clarifications are inline in the chat** — they scroll away, they look like regular assistant messages, and they don't have a stable persistent surface
3. **No explicit state machine** — the flow is a bag of boolean/null flags (`pending`, `status`, `error`, `protocolCandidate`) with implicit transitions
4. **Two sources of truth** — chat state in reducer, draft preview in EventEditorContext, clarification accumulation in a ref
5. **No interpretation or changes panel** — the user can't see what the system thinks the prompt means until the draft appears

### What's Already Right

- Backend protocol is stateless and correct: POST + clarificationAnswers → AgentResult
- `chatReducer` is pure and well-tested (9 actions, all transitions in one place)
- `ClarificationPicker` already reuses slash-menu resolvers (resolveMaterial, resolveLabware)
- `resolvedClarificationsRef` accumulates answers across turns (anti-ping-pong)
- `buildPreviewFromDraft` already produces ghost previews on the deck canvas
- Two-pane layout (right pane tabs, one at a time) is the established pattern

---

## Target State Machine

```typescript
type AiSidebarState =
  | { mode: 'ready' }
  | { mode: 'interpreting'; prompt: string; progress: InterpretationProgress }
  | { mode: 'clarifying'; draftId: string; questions: AiClarificationRequest[];
      answers: Record<string, AiClarificationAnswer>; activeQuestionId: string }
  | { mode: 'updating'; draftId: string }
  | { mode: 'reviewing'; draftId: string; interpretation: SemanticInterpretation;
      changes: EventGraphChange[]; warnings: ValidationGap[] }
  | { mode: 'committing'; draftId: string }
```

**Primary action per state:**
- `ready` → Send a prompt (ChatInput active)
- `interpreting` → Wait (ChatInput disabled, progress shown)
- `clarifying` → Answer questions (Questions panel active, ChatInput hidden)
- `updating` → Wait (progress shown)
- `reviewing` → Review and apply (Changes panel active, ChatInput visible for revisions)
- `committing` → Wait (progress shown)

---

## Phased Implementation

### Phase 1: Sidebar State Machine (Reducer + Types)

Extend the chat reducer with a discriminated-union sidebar mode. No UI changes yet — just the state layer.

### Phase 2: Questions Panel (Extract from MessageLog)

Move ClarificationCards out of MessageLog into a persistent panel that renders when mode = 'clarifying'.

### Phase 3: Conditional ChatInput

Hide/disable ChatInput based on sidebar state. Add "Cancel draft" escape hatch.

### Phase 4: Interpretation Panel

Show what the system thinks the prompt means (operations, materials, parameters resolved so far).

### Phase 5: Changes Panel

Show proposed event-graph changes as a diff-like review surface before commit.

### Phase 6: Sub-tab Navigation

Add [Questions] [Interpretation] [Changes] sub-tabs within the AI panel, with automatic switching based on state transitions.

---

## Phase 1: Sidebar State Machine

### Task 1.1: Define AiSidebarState type

**Objective:** Create the discriminated-union state type for the sidebar.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/sidebarState.ts`
- Test: `app/src/event-editor/right-pane/ai/sidebarState.test.ts`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { initialSidebarState, sidebarReducer, type SidebarAction } from './sidebarState'

describe('sidebarState', () => {
  it('starts in ready mode', () => {
    expect(initialSidebarState.mode).toBe('ready')
  })

  it('transitions ready → interpreting on send', () => {
    const state = sidebarReducer(initialSidebarState, {
      type: 'start-interpreting',
      prompt: 'add 10 uL clofibrate to A1',
    })
    expect(state.mode).toBe('interpreting')
    if (state.mode === 'interpreting') {
      expect(state.prompt).toBe('add 10 uL clofibrate to A1')
    }
  })

  it('transitions interpreting → clarifying when questions arrive', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    const state = sidebarReducer(interpreting, {
      type: 'clarifications-needed',
      draftId: 'draft-1',
      questions: [{ id: 'material-1', kind: 'material', prompt: 'Which?', menuProvider: '/m', options: [] }],
    })
    expect(state.mode).toBe('clarifying')
    if (state.mode === 'clarifying') {
      expect(state.questions).toHaveLength(1)
      expect(state.activeQuestionId).toBe('material-1')
    }
  })

  it('transitions clarifying → updating when all answers submitted', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [{ id: 'q1', kind: 'material', prompt: '?', menuProvider: '/m', options: [] }],
      answers: {},
      activeQuestionId: 'q1',
    }
    const state = sidebarReducer(clarifying, {
      type: 'submit-answers',
      answers: { q1: { requestId: 'q1', label: 'test', mentionToken: '[[material:x|test]]' } },
    })
    expect(state.mode).toBe('updating')
  })

  it('transitions to reviewing when draft is ready', () => {
    const updating = { mode: 'updating' as const, draftId: 'draft-1' }
    const state = sidebarReducer(updating, {
      type: 'draft-ready',
      draftId: 'draft-1',
      interpretation: { operations: [] },
      changes: [],
      warnings: [],
    })
    expect(state.mode).toBe('reviewing')
  })

  it('transitions to ready on cancel', () => {
    const clarifying = {
      mode: 'clarifying' as const,
      draftId: 'draft-1',
      questions: [],
      answers: {},
      activeQuestionId: '',
    }
    const state = sidebarReducer(clarifying, { type: 'cancel' })
    expect(state.mode).toBe('ready')
  })

  it('transitions clarifying directly to reviewing when no questions remain', () => {
    const interpreting = { mode: 'interpreting' as const, prompt: 'test', progress: { steps: [] } }
    const state = sidebarReducer(interpreting, {
      type: 'draft-ready',
      draftId: 'draft-1',
      interpretation: { operations: [] },
      changes: [],
      warnings: [],
    })
    expect(state.mode).toBe('reviewing')
  })
})
```

**Step 2: Run test to verify failure**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/sidebarState.test.ts`
Expected: FAIL — module not found

**Step 3: Write minimal implementation**

```typescript
import type { AiClarificationRequest, AiClarificationAnswer } from '../../../types/ai'

export interface InterpretationStep {
  label: string
  done: boolean
}

export interface InterpretationProgress {
  steps: InterpretationStep[]
}

export interface SemanticInterpretation {
  operations: Array<{
    type: string
    target?: string
    material?: string
    parameters?: Record<string, unknown>
    resolved: boolean
  }>
}

export interface EventGraphChange {
  op: 'add' | 'modify' | 'remove'
  description: string
  eventId?: string
}

export interface ValidationGap {
  code: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export type AiSidebarState =
  | { mode: 'ready' }
  | { mode: 'interpreting'; prompt: string; progress: InterpretationProgress }
  | {
      mode: 'clarifying'
      draftId: string
      questions: AiClarificationRequest[]
      answers: Record<string, AiClarificationAnswer>
      activeQuestionId: string
    }
  | { mode: 'updating'; draftId: string }
  | {
      mode: 'reviewing'
      draftId: string
      interpretation: SemanticInterpretation
      changes: EventGraphChange[]
      warnings: ValidationGap[]
    }
  | { mode: 'committing'; draftId: string }

export type SidebarAction =
  | { type: 'start-interpreting'; prompt: string }
  | { type: 'update-progress'; progress: InterpretationProgress }
  | {
      type: 'clarifications-needed'
      draftId: string
      questions: AiClarificationRequest[]
    }
  | { type: 'answer-question'; questionId: string; answer: AiClarificationAnswer }
  | { type: 'change-question'; questionId: string }
  | { type: 'submit-answers'; answers: Record<string, AiClarificationAnswer> }
  | {
      type: 'draft-ready'
      draftId: string
      interpretation: SemanticInterpretation
      changes: EventGraphChange[]
      warnings: ValidationGap[]
    }
  | { type: 'commit' }
  | { type: 'cancel' }
  | { type: 'reset' }

export const initialSidebarState: AiSidebarState = { mode: 'ready' }

export function sidebarReducer(state: AiSidebarState, action: SidebarAction): AiSidebarState {
  switch (action.type) {
    case 'start-interpreting':
      return {
        mode: 'interpreting',
        prompt: action.prompt,
        progress: { steps: [] },
      }

    case 'update-progress':
      if (state.mode !== 'interpreting') return state
      return { ...state, progress: action.progress }

    case 'clarifications-needed':
      return {
        mode: 'clarifying',
        draftId: action.draftId,
        questions: action.questions,
        answers: {},
        activeQuestionId: action.questions[0]?.id ?? '',
      }

    case 'answer-question':
      if (state.mode !== 'clarifying') return state
      return {
        ...state,
        answers: { ...state.answers, [action.questionId]: action.answer },
      }

    case 'change-question':
      if (state.mode !== 'clarifying') return state
      return { ...state, activeQuestionId: action.questionId }

    case 'submit-answers':
      if (state.mode !== 'clarifying') return state
      return { mode: 'updating', draftId: state.draftId }

    case 'draft-ready':
      return {
        mode: 'reviewing',
        draftId: action.draftId,
        interpretation: action.interpretation,
        changes: action.changes,
        warnings: action.warnings,
      }

    case 'commit':
      if (state.mode !== 'reviewing') return state
      return { mode: 'committing', draftId: state.draftId }

    case 'cancel':
    case 'reset':
      return initialSidebarState

    default: {
      const _exhaustive: never = action
      return _exhaustive ?? state
    }
  }
}

// Selector helpers
export function isChatEnabled(state: AiSidebarState): boolean {
  return state.mode === 'ready' || state.mode === 'reviewing'
}

export function primaryActionLabel(state: AiSidebarState): string | null {
  switch (state.mode) {
    case 'ready': return null // chat input is the action
    case 'interpreting': return null // waiting
    case 'clarifying': return 'Update draft'
    case 'updating': return null // waiting
    case 'reviewing': return 'Apply to run'
    case 'committing': return null // waiting
  }
}

export function headerLabel(state: AiSidebarState): string {
  switch (state.mode) {
    case 'ready': return 'AI Assistant'
    case 'interpreting': return 'Interpreting…'
    case 'clarifying': {
      const answered = Object.keys(state.answers).length
      const total = state.questions.length
      return `${total - answered} answers needed`
    }
    case 'updating': return 'Updating draft…'
    case 'reviewing': return 'Review changes'
    case 'committing': return 'Applying…'
  }
}
```

**Step 4: Run test to verify pass**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/sidebarState.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/ai/sidebarState.ts app/src/event-editor/right-pane/ai/sidebarState.test.ts
git commit -m "feat: add AiSidebarState discriminated-union state machine"
```

### Task 1.2: Wire sidebar state into AiTabPanel

**Objective:** Integrate the sidebar reducer alongside the existing chat reducer, bridging SSE events to sidebar state transitions.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Test: `app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx`

**Step 1: Add sidebar reducer to AiTabPanel**

```typescript
import { useReducer, useCallback, useRef, useMemo, useState, useEffect } from 'react'
import { sidebarReducer, initialSidebarState, isChatEnabled, headerLabel, primaryActionLabel } from './sidebarState'

// Inside AiTabPanel:
const [sidebar, sidebarDispatch] = useReducer(sidebarReducer, initialSidebarState)
```

**Step 2: Bridge chat events to sidebar transitions**

```typescript
// On send:
const handleSend = useCallback(async (text: string) => {
  setPrefill(undefined)
  resolvedClarificationsRef.current.clear()
  sidebarDispatch({ type: 'start-interpreting', prompt: text })
  await chat.send(text, { enableThinking: false })
}, [chat])

// In onDraftResult callback (called by useChatThread when SSE 'done' arrives):
const onDraftResult = useCallback((result: AssistDraftResult, _prompt: string) => {
  const clarifications = result.clarificationRequests ?? []
  if (clarifications.length > 0) {
    sidebarDispatch({
      type: 'clarifications-needed',
      draftId: `draft-${Date.now()}`,
      questions: clarifications,
    })
  } else {
    // No clarifications — go straight to reviewing
    sidebarDispatch({
      type: 'draft-ready',
      draftId: `draft-${Date.now()}`,
      interpretation: { operations: [] }, // TODO: populate from result
      changes: (result.events ?? []).map((e) => ({
        op: 'add' as const,
        description: `${e.verb} → ${e.details?.wells?.join(', ') ?? 'plate'}`,
        eventId: e.eventId,
      })),
      warnings: [],
    })
  }
  // ... existing preview building logic ...
}, [...])

// On clarifications submit:
const handleClarificationsSubmit = useCallback(
  async (answers: AiClarificationAnswer[], requests: AiClarificationRequest[]) => {
    const answerMap = Object.fromEntries(answers.map((a) => [a.requestId, a]))
    sidebarDispatch({ type: 'submit-answers', answers: answerMap })
    // ... existing send logic ...
  }, [...],
)

// On cancel:
const handleCancelDraft = useCallback(() => {
  sidebarDispatch({ type: 'cancel' })
  resolvedClarificationsRef.current.clear()
  editor?.actions.clearPreview()
}, [editor])
```

**Step 3: Add tests verifying sidebar transitions fire**

Test that sending a prompt transitions to 'interpreting', receiving clarifications transitions to 'clarifying', etc.

**Step 4: Run tests**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.test.tsx`
Expected: PASS (existing tests should still pass; new sidebar tests pass)

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx
git commit -m "feat: wire AiSidebarState into AiTabPanel with SSE bridge"
```

---

## Phase 2: Questions Panel

### Task 2.1: Create QuestionsPanel component

**Objective:** Extract ClarificationCards from MessageLog into a standalone persistent panel.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/QuestionsPanel.tsx`
- Test: `app/src/event-editor/right-pane/ai/QuestionsPanel.test.tsx`
- Read: `app/src/event-editor/right-pane/ai/MessageLog.tsx` (existing ClarificationCards to extract)

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuestionsPanel } from './QuestionsPanel'
import type { AiClarificationRequest } from '../../../types/ai'

const mockQuestion: AiClarificationRequest = {
  id: 'q1',
  kind: 'material',
  prompt: 'Which material is "clofibrate"?',
  menuProvider: '/m',
  options: [],
  allowCreateLocal: true,
  query: 'clofibrate',
}

describe('QuestionsPanel', () => {
  it('renders question prompt and progress', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{}}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Which material/)).toBeDefined()
    expect(screen.getByText(/0 of 1 answered/)).toBeDefined()
  })

  it('shows update button when all answered', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{ q1: { requestId: 'q1', label: 'test' } }}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('1 of 1 answered')).toBeDefined()
    expect(screen.getByText('Update draft')).toBeDefined()
  })

  it('shows cancel escape hatch', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{}}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText(/Cancel this draft/)).toBeDefined()
  })

  it('shows answered questions as editable with Change button', () => {
    render(
      <QuestionsPanel
        questions={[mockQuestion]}
        answers={{ q1: { requestId: 'q1', label: 'Clofibrate MAT-001' } }}
        activeQuestionId="q1"
        onAnswer={vi.fn()}
        onChangeQuestion={vi.fn()}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )
    expect(screen.getByText('Clofibrate MAT-001')).toBeDefined()
    expect(screen.getByText('Change')).toBeDefined()
  })
})
```

**Step 2: Run test to verify failure**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/QuestionsPanel.test.tsx`
Expected: FAIL — module not found

**Step 3: Implement QuestionsPanel**

```typescript
import { useState } from 'react'
import type { AiClarificationAnswer, AiClarificationRequest } from '../../../types/ai'
import { ClarificationPicker } from './ClarificationPicker'

export interface QuestionsPanelProps {
  questions: AiClarificationRequest[]
  answers: Record<string, AiClarificationAnswer>
  activeQuestionId: string
  onAnswer: (questionId: string, answer: AiClarificationAnswer) => void
  onChangeQuestion: (questionId: string) => void
  onSubmit: () => void
  onCancel: () => void
}

export function QuestionsPanel({
  questions,
  answers,
  activeQuestionId,
  onAnswer,
  onChangeQuestion,
  onSubmit,
  onCancel,
}: QuestionsPanelProps) {
  const answeredCount = questions.filter((q) => answers[q.id]).length
  const allAnswered = answeredCount === questions.length
  const activeIndex = questions.findIndex((q) => q.id === activeQuestionId)

  return (
    <div className="questions-panel" data-testid="questions-panel">
      <div className="questions-panel__header">
        <span className="questions-panel__count">
          {questions.length - answeredCount} answers needed
        </span>
        <p className="questions-panel__hint">
          The draft is paused until these are resolved.
        </p>
      </div>

      <div className="questions-panel__list">
        {questions.map((request, index) => {
          const answer = answers[request.id]
          const isActive = request.id === activeQuestionId
          return (
            <section
              key={request.id}
              className={
                isActive
                  ? 'questions-panel__card questions-panel__card--active'
                  : 'questions-panel__card'
              }
            >
              <div className="questions-panel__card-head">
                <span className="questions-panel__card-number">
                  Question {index + 1} of {questions.length}
                </span>
                <span className="questions-panel__card-kind">{request.entityType ?? request.kind}</span>
              </div>
              <p className="questions-panel__prompt">{request.prompt}</p>
              {request.snippet ? (
                <p className="questions-panel__snippet">{request.snippet}</p>
              ) : null}
              {answer ? (
                <div className="questions-panel__answered" data-testid={`answered-${request.id}`}>
                  <span>✓ {answer.label ?? answer.value ?? 'answered'}</span>
                  <button
                    type="button"
                    className="questions-panel__change-btn"
                    onClick={() => onChangeQuestion(request.id)}
                  >
                    Change
                  </button>
                </div>
              ) : (
                <ClarificationPicker
                  request={request}
                  onPick={(ans) => onAnswer(request.id, ans)}
                />
              )}
            </section>
          )
        })}
      </div>

      <div className="questions-panel__progress">
        {answeredCount} of {questions.length} answered
      </div>

      <div className="questions-panel__actions">
        {allAnswered ? (
          <button
            type="button"
            className="questions-panel__btn questions-panel__btn--primary"
            onClick={onSubmit}
            data-testid="questions-submit"
          >
            Update draft
          </button>
        ) : null}
        <button
          type="button"
          className="questions-panel__btn questions-panel__btn--cancel"
          onClick={onCancel}
        >
          Cancel this draft and start a new prompt
        </button>
      </div>
    </div>
  )
}
```

**Step 4: Run test to verify pass**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/QuestionsPanel.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/ai/QuestionsPanel.tsx app/src/event-editor/right-pane/ai/QuestionsPanel.test.tsx
git commit -m "feat: add QuestionsPanel as persistent clarification surface"
```

### Task 2.2: Render QuestionsPanel in AiTabPanel when clarifying

**Objective:** Show QuestionsPanel when sidebar mode = 'clarifying', hide inline ClarificationCards from MessageLog.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Modify: `app/src/event-editor/right-pane/ai/MessageLog.tsx` (stop rendering ClarificationCards inline)

**Step 1: In AiTabPanel, render QuestionsPanel when mode === 'clarifying'**

```typescript
// In the render section, between MessageLog and ChatInput:
{sidebar.mode === 'clarifying' ? (
  <section className="ai-tab__section ai-tab__section--questions">
    <QuestionsPanel
      questions={sidebar.questions}
      answers={sidebar.answers}
      activeQuestionId={sidebar.activeQuestionId}
      onAnswer={(qId, ans) => sidebarDispatch({ type: 'answer-question', questionId: qId, answer: ans })}
      onChangeQuestion={(qId) => sidebarDispatch({ type: 'change-question', questionId: qId })}
      onSubmit={() => {
        const answers = sidebar.mode === 'clarifying' ? sidebar.answers : {}
        const requests = sidebar.mode === 'clarifying' ? sidebar.questions : []
        void handleClarificationsSubmit(Object.values(answers), requests)
      }}
      onCancel={handleCancelDraft}
    />
  </section>
) : null}
```

**Step 2: In MessageLog, remove ClarificationCards rendering**

Remove the `ClarificationCards` component import and rendering from `MessageLog.tsx`. The chat transcript should only show a summary:

```typescript
// In MessageLog, replace ClarificationCards with a summary line:
{m.clarificationRequests?.length ? (
  <p className="message-log__clarification-summary">
    {m.clarificationRequests.length} clarification
    {m.clarificationRequests.length > 1 ? 's' : ''} needed —
    see Questions panel above.
  </p>
) : null}
```

**Step 3: Update existing tests**

Update `MessageLog` tests that expected inline ClarificationCards. They should now expect the summary text instead.

**Step 4: Run tests**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/`
Expected: PASS

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/MessageLog.tsx app/src/event-editor/right-pane/ai/MessageLog.batching.test.tsx
git commit -m "refactor: move clarifications from inline MessageLog to persistent QuestionsPanel"
```

---

## Phase 3: Conditional ChatInput

### Task 3.1: Hide ChatInput when clarifying

**Objective:** Replace the always-visible ChatInput with state-conditional rendering.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

**Step 1: Wrap ChatInput in conditional rendering**

```typescript
// Replace the always-rendered ChatInput with:
{isChatEnabled(sidebar) ? (
  <section className="ai-tab__section ai-tab__section--input">
    <ChatInput
      isStreaming={chat.isStreaming}
      onSend={handleSend}
      onStop={chat.stop}
      prefill={prefill}
      sendLabel={previewActive ? 'Revise' : 'Send'}
      {...(previewActive ? { placeholder: 'Describe a revision to the proposed draft…' } : {})}
    />
  </section>
) : sidebar.mode === 'clarifying' ? (
  <section className="ai-tab__section ai-tab__section--input-disabled">
    <p className="ai-tab__input-disabled-text">
      Answer the questions above to continue.
    </p>
  </section>
) : null}
```

**Step 2: Update tests**

Test that ChatInput is NOT rendered when sidebar.mode === 'clarifying'.

**Step 3: Run tests**

Run: `cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.test.tsx`
Expected: PASS

**Step 4: Commit**

```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/AiTabPanel.test.tsx
git commit -m "feat: hide ChatInput during clarification, show disabled prompt"
```

---

## Phase 4: Interpretation Panel

### Task 4.1: Create InterpretationPanel component

**Objective:** Show the system's interpretation of the prompt — operations, materials, parameters, and what's resolved vs unresolved.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/InterpretationPanel.tsx`
- Test: `app/src/event-editor/right-pane/ai/InterpretationPanel.test.tsx`

**Step 1: Write failing test**

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InterpretationPanel } from './InterpretationPanel'

describe('InterpretationPanel', () => {
  it('renders operations with resolved and unresolved markers', () => {
    render(
      <InterpretationPanel
        interpretation={{
          operations: [
            { type: 'dispense', material: 'complete DMEM', resolved: true },
            { type: 'agitate', parameters: { speed: 'unresolved' }, resolved: false },
            { type: 'incubate', parameters: { temperature: '37°C' }, resolved: true },
          ]
        }}
      />,
    )
    expect(screen.getByText('DISPENSE')).toBeDefined()
    expect(screen.getByText(/complete DMEM/)).toBeDefined()
    expect(screen.getByText('AGITATE')).toBeDefined()
    expect(screen.getByText(/unresolved/i)).toBeDefined()
  })

  it('shows empty state when no operations', () => {
    render(<InterpretationPanel interpretation={{ operations: [] }} />)
    expect(screen.getByText(/No operations parsed/)).toBeDefined()
  })
})
```

**Step 2: Implement**

```typescript
import type { SemanticInterpretation } from './sidebarState'

export interface InterpretationPanelProps {
  interpretation: SemanticInterpretation
}

export function InterpretationPanel({ interpretation }: InterpretationPanelProps) {
  if (interpretation.operations.length === 0) {
    return (
      <div className="interpretation-panel" data-testid="interpretation-panel">
        <p className="interpretation-panel__empty">No operations parsed yet.</p>
      </div>
    )
  }

  return (
    <div className="interpretation-panel" data-testid="interpretation-panel">
      <div className="interpretation-panel__operations">
        {interpretation.operations.map((op, i) => (
          <div
            key={i}
            className={
              op.resolved
                ? 'interpretation-panel__operation'
                : 'interpretation-panel__operation interpretation-panel__operation--unresolved'
            }
          >
            <h4 className="interpretation-panel__op-type">{op.type.toUpperCase()}</h4>
            {op.target ? (
              <p className="interpretation-panel__op-target">target: {op.target}</p>
            ) : null}
            {op.material ? (
              <p className="interpretation-panel__op-material">material: {op.material}</p>
            ) : null}
            {op.parameters ? (
              <dl className="interpretation-panel__op-params">
                {Object.entries(op.parameters).map(([key, value]) => (
                  <div key={key} className="interpretation-panel__param">
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
```

**Step 3: Run tests, commit**

```bash
git add app/src/event-editor/right-pane/ai/InterpretationPanel.tsx app/src/event-editor/right-pane/ai/InterpretationPanel.test.tsx
git commit -m "feat: add InterpretationPanel showing parsed operations"
```

---

## Phase 5: Changes Panel

### Task 5.1: Create ChangesPanel component

**Objective:** Show proposed event-graph changes as a diff-like review surface.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/ChangesPanel.tsx`
- Test: `app/src/event-editor/right-pane/ai/ChangesPanel.test.tsx`

**Step 1: Write failing test**

```typescript
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChangesPanel } from './ChangesPanel'

describe('ChangesPanel', () => {
  it('renders changes with + prefix for additions', () => {
    render(
      <ChangesPanel
        changes={[
          { op: 'add', description: 'Dispense complete DMEM into A1-H12' },
          { op: 'add', description: 'Agitate at 600 rpm for 5 min' },
        ]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/Dispense complete DMEM/)).toBeDefined()
    expect(screen.getByText(/Agitate at 600 rpm/)).toBeDefined()
    expect(screen.getByText('Apply to run')).toBeDefined()
  })

  it('shows warnings', () => {
    render(
      <ChangesPanel
        changes={[]}
        warnings={[{ code: 'cap-gap', message: 'No shaker supports 1500 rpm', severity: 'warning' }]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/No shaker supports 1500 rpm/)).toBeDefined()
  })

  it('fires onApply when button clicked', () => {
    const onApply = vi.fn()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'test' }]}
        warnings={[]}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Apply to run'))
    expect(onApply).toHaveBeenCalledOnce()
  })
})
```

**Step 2: Implement**

```typescript
import type { EventGraphChange, ValidationGap } from './sidebarState'

export interface ChangesPanelProps {
  changes: EventGraphChange[]
  warnings: ValidationGap[]
  onApply: () => void
  onDiscard: () => void
}

export function ChangesPanel({ changes, warnings, onApply, onDiscard }: ChangesPanelProps) {
  return (
    <div className="changes-panel" data-testid="changes-panel">
      {warnings.length > 0 ? (
        <div className="changes-panel__warnings">
          {warnings.map((w, i) => (
            <div
              key={i}
              className={`changes-panel__warning changes-panel__warning--${w.severity}`}
            >
              {w.message}
            </div>
          ))}
        </div>
      ) : null}

      <div className="changes-panel__diff">
        {changes.map((change, i) => (
          <div
            key={i}
            className={`changes-panel__change changes-panel__change--${change.op}`}
          >
            <span className="changes-panel__change-prefix">
              {change.op === 'add' ? '+' : change.op === 'remove' ? '-' : '~'}
            </span>
            <span className="changes-panel__change-desc">{change.description}</span>
          </div>
        ))}
      </div>

      <div className="changes-panel__actions">
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--discard"
          onClick={onDiscard}
        >
          Discard
        </button>
        <button
          type="button"
          className="changes-panel__btn changes-panel__btn--apply"
          onClick={onApply}
          data-testid="changes-apply"
        >
          Apply to run
        </button>
      </div>
    </div>
  )
}
```

**Step 3: Run tests, commit**

```bash
git add app/src/event-editor/right-pane/ai/ChangesPanel.tsx app/src/event-editor/right-pane/ai/ChangesPanel.test.tsx
git commit -m "feat: add ChangesPanel for draft review with apply/discard"
```

---

## Phase 6: Sub-tab Navigation

### Task 6.1: Add sub-tab strip to AiTabPanel

**Objective:** Add [Questions] [Interpretation] [Changes] sub-tabs that auto-switch based on sidebar state.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
- Create: `app/src/event-editor/right-pane/ai/aiSidebar.css` (or extend ai.css)

**Step 1: Add sub-tab state and rendering**

```typescript
type AiSubTab = 'chat' | 'questions' | 'interpretation' | 'changes'

// Auto-select sub-tab based on sidebar mode:
const activeSubTab: AiSubTab = useMemo(() => {
  switch (sidebar.mode) {
    case 'clarifying': return 'questions'
    case 'interpreting': return 'interpretation'
    case 'reviewing': return 'changes'
    default: return 'chat'
  }
}, [sidebar.mode])
```

**Step 2: Render sub-tab strip**

```typescript
// In the render, between header and body:
<div className="ai-tab__subtabs">
  {(['chat', 'questions', 'interpretation', 'changes'] as AiSubTab[])
    .filter((tab) => {
      // Only show tabs that have content
      if (tab === 'questions') return sidebar.mode === 'clarifying'
      if (tab === 'interpretation') return sidebar.mode === 'interpreting' || sidebar.mode === 'reviewing'
      if (tab === 'changes') return sidebar.mode === 'reviewing'
      return true // chat is always available
    })
    .map((tab) => (
      <button
        key={tab}
        type="button"
        className={activeSubTab === tab ? 'ai-tab__subtab ai-tab__subtab--active' : 'ai-tab__subtab'}
        onClick={() => setManualSubTab(tab)}
      >
        {tab.charAt(0).toUpperCase() + tab.slice(1)}
      </button>
    ))}
</div>
```

**Step 3: Render the active sub-tab's content**

```typescript
{activeSubTab === 'chat' ? (
  <MessageLog state={chat.state} onClarificationsSubmit={handleClarificationsSubmit} />
) : null}
{activeSubTab === 'questions' && sidebar.mode === 'clarifying' ? (
  <QuestionsPanel ... />
) : null}
{activeSubTab === 'interpretation' && (sidebar.mode === 'interpreting' || sidebar.mode === 'reviewing') ? (
  <InterpretationPanel interpretation={sidebar.mode === 'reviewing' ? sidebar.interpretation : { operations: [] }} />
) : null}
{activeSubTab === 'changes' && sidebar.mode === 'reviewing' ? (
  <ChangesPanel
    changes={sidebar.changes}
    warnings={sidebar.warnings}
    onApply={() => {
      sidebarDispatch({ type: 'commit' })
      editor?.actions.commitPreview()
    }}
    onDiscard={handleCancelDraft}
  />
) : null}
```

**Step 4: Add header with state info**

```typescript
// Replace the current system-prompt-only header:
<header className="ai-tab__header">
  <span className="ai-tab__header-title">{headerLabel(sidebar)}</span>
  {sidebar.mode === 'clarifying' ? (
    <span className="ai-tab__header-badge">
      Draft paused · {sidebar.questions.length - Object.keys(sidebar.answers).length} remaining
    </span>
  ) : null}
  {warm ? <WarmIndicator status={warm.status} /> : null}
</header>
```

**Step 5: Run tests, commit**

```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/ai.css
git commit -m "feat: add sub-tab navigation with auto-switching based on sidebar state"
```

### Task 6.2: Add status footer with primary action

**Objective:** Add a persistent footer showing the current primary action button and state info.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

**Step 1: Add footer**

```typescript
// At the bottom of AiTabPanel, before AddSourceModal:
<footer className="ai-tab__footer">
  {sidebar.mode === 'clarifying' ? (
    <>
      <span className="ai-tab__footer-progress">
        {Object.keys(sidebar.answers).length} of {sidebar.questions.length} answered
      </span>
      <button
        type="button"
        className="ai-tab__footer-btn ai-tab__footer-btn--primary"
        disabled={Object.keys(sidebar.answers).length < sidebar.questions.length}
        onClick={() => {
          if (sidebar.mode !== 'clarifying') return
          void handleClarificationsSubmit(Object.values(sidebar.answers), sidebar.questions)
        }}
      >
        Continue when all are answered
      </button>
    </>
  ) : null}
  {sidebar.mode === 'reviewing' ? (
    <button
      type="button"
      className="ai-tab__footer-btn ai-tab__footer-btn--primary"
      onClick={() => {
        sidebarDispatch({ type: 'commit' })
        editor?.actions.commitPreview()
      }}
    >
      Apply to run
    </button>
  ) : null}
</footer>
```

**Step 2: Run tests, commit**

```bash
git add app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat: add persistent footer with state-driven primary action"
```

---

## Risks and Tradeoffs

1. **Breaking existing tests** — The inline ClarificationCards rendering is tested in MessageLog tests. Moving them to QuestionsPanel means updating those tests. Risk: missing a test that verifies clarification submission behavior.

2. **Sub-tab auto-switching vs. manual override** — Auto-switching on state change is good for discoverability but can be jarring if the user is reading the chat and a state transition yanks them to a different tab. Trade-off: auto-switch on first transition, then let the user manually override until the next state change.

3. **Interpretation panel is speculative** — The backend doesn't currently return a structured "interpretation" of what it parsed. The initial implementation will show an empty or minimal interpretation. The full population of this panel depends on the biology-engine Phase 3 (ProtocolIntent as AI Draft Intermediate).

4. **Changes panel depends on graph diffing** — The initial implementation shows simple "+ operation description" lines. Full diff (modified vs removed events) requires comparing the new draft against the current event graph, which isn't yet implemented.

5. **State machine vs. existing reducer** — The sidebar reducer coexists with the chat reducer. They're bridged through callbacks in AiTabPanel. This means state transitions can get out of sync if a callback is missed. Trade-off: the alternative (merging into one reducer) would require a much larger refactor.

---

## Open Questions

1. Should the Questions panel support keyboard navigation (arrow keys between questions)?
2. Should answered questions collapse to a one-line summary, or stay expanded with a "Change" button?
3. Should the chat transcript be hidden entirely during clarification, or just de-emphasized?
4. Should the Interpretation panel show in real-time during streaming, or only after the draft is complete?
5. Should the Changes panel show a diff against the current graph or just the proposed additions?

---

## Verification

After each phase:

1. Run frontend tests: `cd app && npx vitest run src/event-editor/right-pane/ai/`
2. Run full frontend tests: `cd app && npx vitest run`
3. TypeScript check: `cd app && npx tsc --noEmit`
4. Manual test: type a prompt with an ungrounded material → verify Questions panel appears, ChatInput is hidden, sub-tab switches to Questions
5. Manual test: answer all questions → verify "Update draft" button enables, state transitions to updating → reviewing
6. Manual test: review changes → verify Changes panel shows additions, "Apply to run" commits the preview
