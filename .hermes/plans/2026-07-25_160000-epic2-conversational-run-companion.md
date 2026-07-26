# Conversational Run Companion (Epic 2)

> **For direct-architect:** Dispatch phases sequentially to the architect (122B on thunderbeast). After each phase: typecheck, commit if clean, iterate on failures. No full kanban pipeline.

**Goal:** Add a chat sidebar to the Run workspace where users can type observations and deviations in natural language, AI suggests which event they link to, and structured data gets persisted to the execution graph.

**Architecture:** Frontend chat panel (React) + backend observation parser (AI endpoint) + structured data saved to existing run timeline. Builds on Epic 1's execution state schema.

**Tech Stack:** React/TypeScript frontend, existing AI agent infrastructure on backend, existing run-timeline schema.

**UI Convention:** Two-pane layout — add chat as a tab in the right pane, NOT a new column. Current layout already has tabbed right pane.

---

## Phase 1: Chat Panel Shell

**Goal:** Render a functional chat sidebar in Run mode with message input and message list. No AI yet — just UI shell.

**Files to create/modify:**
- Create: `app/src/graph/run-workspace/RunChatPanel.tsx` — the chat panel component
- Modify: `app/src/graph/RunWorkspacePage.tsx` — add chat tab to right pane tabs
- Modify: `app/src/types/editorMode.ts` — ensure Run mode context is available
- Modify: `app/src/graph/run-workspace/RunWorkspaceNav.tsx` — wire chat visibility to Run mode

**What it needs:**
- Message input (textarea + send button)
- Message list (scrollable, user messages right-aligned)
- Basic TypeScript types: `RunMessage` { id, text, timestamp, type: 'user' | 'ai' }
- Local state via `useState` — no backend yet
- Only visible in Run mode (not Design mode)

**Acceptance:**
- Switching to Run mode shows chat panel as a tab
- Typing and sending renders messages in the list
- Switching back to Design mode hides the chat
- `npm run typecheck` passes

---

## Phase 2: AI Observation Parser API

**Goal:** Backend endpoint that takes user text, returns structured observation/deviation with suggested event link.

**Files to create/modify:**
- Modify: `server/src/api/handlers/ProtocolBuilderHandlers.ts` (or new file `ObservationHandlers.ts`) — add `/api/observations/parse` endpoint
- Modify: `server/src/api/routes.ts` — register the route

**Endpoint spec:**
```
POST /api/observations/parse
Body: { text: string, runId: string }
Response: {
  type: 'observation' | 'deviation' | 'note',
  suggestedEventRef: string | null,
  observation?: { text: string },
  deviation?: {
    parameter: string,        // e.g. "incubation_time"
    plannedValue: string,     // e.g. "30 min"
    actualValue: string,      // e.g. "25 min"
    description: string
  },
  confidence: number
}
```

**How it works:**
- Use existing AI agent infrastructure (same model/tools pipeline as ProtocolBuilder)
- Prompt: parse the user's text against the current run's execution plan
- Return structured suggestion — do NOT persist yet
- Pass the run's current events so AI can match "plate A3" to event refs

**Acceptance:**
- POST returns structured JSON for: "plate A3 looked cloudy" (observation)
- POST returns structured JSON for: "incubated 25 min instead of 30" (deviation)
- `npm run typecheck` passes

---

## Phase 3: Confirmation Flow + Persistence

**Goal:** User confirms the AI's suggested event link, structured data gets saved to the run timeline.

**Files to create/modify:**
- Create: `app/src/graph/run-workspace/ObservationSuggestion.tsx` — confirmation UI component
- Modify: `app/src/graph/run-workspace/RunChatPanel.tsx` — wire to API, show suggestions
- Modify: `server/src/api/handlers/ObservationHandlers.ts` — add `/api/observations/save` endpoint
- Modify: `server/src/api/routes.ts` — register save route
- Modify: `schema/studies/run-timeline.schema.yaml` — add observation/deviation entries to executionEvents
- Modify: `app/src/types/events.ts` — add observation types

**Confirmation UI:**
- AI response appears as a message with: "Did you mean [Step 3: Incubate]?" as a clickable chip
- User clicks confirm → data saved
- User clicks "no" → AI re-parses with feedback

**Persistence:**
- Observation: `{ eventRef, observation: { text, timestamp } }` saved to executionEvents
- Deviation: `{ eventRef, state: 'deviated', deviationNote, deviation: { parameter, plannedValue, actualValue } }` saved to executionEvents
- Reuses Epic 1's `deviationNote` field and `deviated` state enum

**Acceptance:**
- User sends "plate A3 cloudy" → AI suggests event → user confirms → persists
- User sends "25 min instead of 30" → AI suggests deviation → user confirms → event marked deviated
- Refreshing the page shows persisted observations in the chat
- `npm run typecheck` passes

---

## Phase 4: Observation History + Event Linking

**Goal:** Clicking an event in the graph shows its observations in the chat. Observations are queryable by event.

**Files to create/modify:**
- Modify: `app/src/graph/run-workspace/RunChatPanel.tsx` — add event filter / observation history view
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — show observation count badge
- Modify: `server/src/api/handlers/ObservationHandlers.ts` — add GET `/api/observations?runId=&eventRef=`

**What it needs:**
- GET endpoint returns observations filtered by run/event
- Chat panel shows "3 observations" badge on events
- Clicking an event in the graph scrolls chat to its observations
- Observations display with timestamp and event chip

**Acceptance:**
- Event ribbon shows observation count
- Clicking event filters chat to show that event's observations
- `npm run typecheck` passes

---

## Verification per phase

After each phase:
1. `cd ~/git/computable-lab && npm run typecheck`
2. If clean: `git add -A && git commit -m "feat(epic2-<phase>): <description>"`
3. If errors: iterate until clean before proceeding to next phase

## Risks

- **AI parsing quality:** The observation parser prompt needs tuning. Start simple — exact parameter names from the protocol steps. May need Phase 2.5 for prompt refinement.
- **Chat panel width:** Right pane tab is narrow on mobile. Consider collapsible chat on small screens.
- **Race condition:** User sends multiple messages before AI responds. Handle with message queue or disable input during processing.
