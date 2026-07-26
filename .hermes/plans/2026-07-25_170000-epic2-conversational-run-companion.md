# Conversational Run Companion (Epic 2)

> **Direct-architect workflow:** Dispatch each phase to the architect (122B on thunderbeast). Typecheck → commit → iterate → next phase.

**Goal:** Add a conversational check-in layer to the Run workspace. Biologists type naturally during execution, the AI records structured provenance — no forms, no friction. The event graph shows execution progress with time-stamped chips on each event.

**Architecture:** Three data layers — Protocol (template), Planned Run (experiment with material bindings), Executed Run (provenance + deviations). Two views — Design mode (plan) and Run mode (execute + log). Chat is the check-in mechanism.

**Tech Stack:** React/TypeScript frontend, existing AI infrastructure on backend, existing run-timeline schema from Epic 1.

**UI Convention:** Two-pane layout — chat as a tab in the right pane. Event graph shows execution chips.

---

## The Three Data Layers

```
Protocol (reusable template — WHAT to do)
  ↓ create from
Planned Run (experiment with specific material bindings)
  ↓ execute
Executed Run (provenance: timestamps, observations, deviations)
```

- **Protocol** — vocabulary-level, what steps to perform
- **Planned Run** — instance-level, drawn up in Design mode with specific plates/wells/reagents
- **Executed Run** — provenance-level, recorded during Run mode with actual times, deviations, observations

## The Two Views

1. **Design mode** — event graph editor, building the plan, selecting labware, binding materials
2. **Run mode** — same event graph, now showing execution progress:
   - Events show chips: pending → running → completed (with timestamps)
   - Deviations shown as deviation chips on events
   - Chat panel for natural language check-ins

---

## Phase 1: Chat Panel Shell + Run Mode Activation

**Goal:** Render chat sidebar in Run mode. Basic message input, message list. Switching to Run mode activates the execution view on the graph.

**Files:**
- Create: `app/src/graph/run-workspace/RunChatPanel.tsx` — chat panel component
- Modify: `app/src/graph/RunWorkspacePage.tsx` — add chat tab to right pane, wire Run mode activation
- Modify: `app/src/types/editorMode.ts` — ensure Run mode context flows to chat
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — show execution state chips on events (pending/running/completed)

**What the chat needs:**
- Message input (textarea + send)
- Message list showing user messages + system timestamps
- Local state via `useState` — messages stored locally for now
- Visible only in Run mode

**What the graph needs:**
- Events show their execution state as visual chips (reuse Epic 1's `executionEvents` state enum)
- Clicking an event in Run mode toggles its state (pending → running → completed)
- Timestamp recorded on state transitions

**Acceptance:**
- Switching to Run mode shows chat tab + execution chips on events
- Clicking "complete" on an event records timestamp
- Typing in chat renders messages locally
- `npm run typecheck` passes

---

## Phase 2: Check-in Parser API

**Goal:** Backend endpoint that takes natural language check-in and returns structured execution data.

**Files:**
- Create: `server/src/api/handlers/ObservationHandlers.ts` — new handler
- Modify: `server/src/api/routes.ts` — register routes

**Endpoints:**

```
POST /api/runs/:runId/checkin
Body: { text: string }
Response: {
  // What the AI understood
  interpretation: string,              // "Marked event 3 (incubate) as started"
  suggestedStateChange?: {
    eventRef: string,
    fromState: string,
    toState: string,                   // running | completed | deviated
  },
  observation?: {
    text: string,                      // free-text note
    eventRef?: string,                 // linked event or null for general
  },
  deviation?: {
    eventRef: string,
    parameter: string,                 // e.g. "incubation_time"
    plannedValue: string,              // e.g. "30 min"
    actualValue: string,               // e.g. "25 min"
    note: string,
  },
}
```

**How it works:**
- Pass the current run's planned events so AI can match "the PCR" to event refs
- AI parses: is this a state change ("I'm starting step 3"), an observation ("plate A3 cloudy"), or a deviation ("only did 28 cycles")?
- Return structured suggestion — **do NOT persist yet**
- The response is what the chat shows back to the user for context

**Prompt strategy:**
- System prompt: "You are a lab companion. The user is running an experiment. Parse their check-in into structured data."
- Include the planned run's events with descriptions
- Distinguish: state transitions vs observations vs deviations

**Acceptance:**
- "tubes are now in the shaker" → suggestedStateChange to "running" for incubation event
- "plate A3 looked cloudy" → observation attached to that event
- "only did 28 cycles instead of 35" → deviation with parameter/cycle_count/planned/actual
- `npm run typecheck` passes

---

## Phase 3: Persist Execution Data

**Goal:** AI's parsed check-in gets saved to the Executed Run. No confirmation needed — the system trusts the AI's interpretation and shows it in chat for transparency.

**Files:**
- Modify: `server/src/api/handlers/ObservationHandlers.ts` — persist logic
- Modify: `schema/studies/run-timeline.schema.yaml` — ensure executionEvents schema covers observations and deviations
- Modify: `app/src/graph/run-workspace/RunChatPanel.tsx` — wire to API, show AI interpretation
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — reflect updated execution state
- Modify: `app/src/types/events.ts` — observation/deviation types

**Schema additions to `run-timeline.schema.yaml` executionEvents:**
```yaml
observations:
  type: array
  items:
    type: object
    required: [text, timestamp]
    properties:
      text: { type: string }
      timestamp: { type: string, format: date-time }
      eventRef: { type: string }
deviations:
  type: array
  items:
    type: object
    required: [eventRef, parameter, plannedValue, actualValue, timestamp]
    properties:
      eventRef: { type: string }
      parameter: { type: string }
      plannedValue: { type: string }
      actualValue: { type: string }
      note: { type: string }
      timestamp: { type: string, format: date-time }
```

**Flow:**
1. User types → POST to `/api/runs/:runId/checkin`
2. AI parses → returns structured suggestion
3. **Automatically persisted** (no confirmation needed)
4. Chat shows: the user's message + AI's interpretation below it
5. Graph chips update to reflect state changes

**Why no confirmation:** The goal is low-friction documentation. The AI's interpretation shows in the chat for transparency — if the biologist disagrees, they can type a correction. The system is an ELN, not a regulatory database.

**Acceptance:**
- "tubes are in the shaker" → persisted as state change + shown in chat with interpretation
- "only 28 cycles" → persisted as deviation + shown in chat
- Graph chips update in real-time
- `npm run typecheck` passes

---

## Phase 4: Execution History + Event Drill-down

**Goal:** Clicking an event shows its execution history in the chat. Observations and deviations are linked back to events.

**Files:**
- Modify: `app/src/graph/run-workspace/RunChatPanel.tsx` — event filter view
- Modify: `app/src/graph/events/ribbon/EventRibbon.tsx` — show observation/deviation count badges
- Modify: `server/src/api/handlers/ObservationHandlers.ts` — GET `/api/runs/:runId/events/:eventRef/history`

**What it needs:**
- GET returns all observations + deviations + state changes for a specific event
- Chat shows timeline: "09:15 — Started (by check-in)", "09:47 — Completed", "09:20 — Observation: plate looked cloudy"
- Clicking an event in the graph filters chat to that event's history
- Badge on event showing "3 observations, 1 deviation"

**Acceptance:**
- Clicking event shows its full execution timeline in chat
- Badges show counts of observations/deviations
- `npm run typecheck` passes

---

## Verification per phase

After each phase:
1. `cd ~/git/computable-lab && npm run typecheck`
2. If clean: `git add -A && git commit -m "feat(epic2-phase<N>): <description>"`
3. If errors: iterate until clean before next phase

## Risks

- **AI parsing quality:** Prompt engineering needed. Start with clear examples. May need iterative refinement.
- **Over-interpretation:** AI might be too aggressive in mapping vague statements to events. Keep it conservative — better to attach to the run generally than wrong event.
- **Performance:** Each check-in hits the AI. Consider caching frequent patterns (e.g. "step N done" is a template).
- **Epic 3 dependency:** Deviation data feeds protocol evolution (Epic 3). Make sure the deviation schema is flexible enough for analytics.
