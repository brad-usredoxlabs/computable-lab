# AI Material Clarification Loop Report
## How the AI Confirms Unclear Materials with the User

---

## 1. OVERVIEW

The clarification loop is a **deterministic post-processing net** that intercepts the AI's
drafted events before they reach the user, scans for ungrounded materials, and converts them
into structured clarification cards. The user picks from a live search (reusing the same
resolve spine + slash-menu resolvers as the TapTab editor), and the answers are round-tripped
into the next agent turn to re-draft with grounded materials.

Key design principle: the AI model is explicitly forbidden from authoring its own clarification
options (no resolve tool in draft mode → any CURIEs it lists are hallucinated). The SYSTEM
generates clarifications deterministically, and the user picks from a LIVE search.

---

## 2. THE TWO DETECTION PATHS

There are two independent mechanisms that generate clarification requests:

### A. ForceMaterialClarifications Net (Draft Mode)
`server/src/ai/forceMaterialClarifications.ts`

This is the primary mechanism. After the model calls the `compile_event_graph_draft` tool,
the orchestrator runs the drafted events through `forceMaterialClarifications()` before
returning them to the frontend. This net polices THREE gap types:

| Gap Reason | Trigger | Clarification Type |
|---|---|---|
| `no-ref` | Material survives only as free text in a note, no material_ref at all | `/m` material picker |
| `unverified-curie` | Model recalled a CURIE from memory (not in resolved_context), only in forced-tool mode | `/m` material picker |
| `needs-quantity` | Material is named but has NO concentration, cell count, or ≥2-component snapshot | `choice` (answer in chat) |

**Trusted materials** (pass through untouched):
- Already a formulation (material-spec), instance (aliquot/material-instance), or vendor-product
- A concept AND carries a quantity (concentration + volume → accept-time mints a formulation)

### B. Compiler Gap → Clarification (Legacy/Re-compile Mode)
`server/src/ai/AgentOrchestrator.ts` → `compileResultToAgentResult()`

In non-forced-tool modes (preflight-llm), the compiler runs after the agent draft.
The compiler emits `Gap` objects in `terminalArtifacts.gaps`:
- `kind: 'unresolved_ref'` → material reference couldn't be resolved
- `kind: 'clarification'` → general clarification message
- `kind: 'needs-confirmation'` → requires user confirmation

These gaps are converted to `AgentClarificationRequest[]` via `clarificationRequestsFromGaps()`.

### C. NounPhraseResolver (Pre-compile Detection)
`server/src/compiler/precompile/NounPhraseResolver.ts`

The resolver tries 4 registry tiers before giving up:

| Tier | What it checks | Confidence | Result kind |
|---|---|---|---|
| 0 | Mention placeholders ([[kind:id\|label]]) | 1.0 | material / labware |
| 1 | Labware definition (exact match) | 1.0 | labware |
| 2 | Compound class (exact match) | 1.0 | compound |
| 3 | Ontology term (case-insensitive substring) | 0.7 | ontology |
| 4 | Labware instance (async lookup) | 0.6 | labware-instance |
| — | Fuzzy mention (token overlap ≥ 25%) | 0.5 | material / labware |
| X | No match | 0 | unresolved |

Unresolved nouns flow through three levels:
1. Compiler warnings (`ungrounded_reference` diagnostic, severity: warning)
2. Compile-level gaps (blocking outcome → `outcome = 'gap'`)
3. Concrete clarification requests to the user

### D. MaterialCompiler (Policy-Driven Resolution)
`server/src/compiler/material/MaterialCompiler.ts`

Resolves materials through a 4-layer cascade: analyte → solvent → formulation → material source.
The `clarificationBehavior` policy setting controls near-match handling:
- `'confirm-near-match'`: Near matches push a substitute action → `needs-confirmation`
- `'diagnostic-only'`: Near matches are warnings only → `policy-blocked`

Diagnostic outcomes: `auto-resolved`, `needs-confirmation`, `needs-missing-fact`,
`policy-blocked`, `execution-blocked`

---

## 3. THE STATE MACHINE

```
USER TYPES PROMPT ("add 10 µL of 1 µM clofibrate to A1")
    │
    ▼
POST /ai/draft-events/stream  (SSE)
    │
    ▼
AGENT ORCHESTRATOR (forced-tool mode)
    │
    ├── System prompt: "You MUST call compile_event_graph_draft. The resolve
    │   tool is NOT available. For unknown materials, GROUND as {mint:{label}}.
    │   Do NOT author your own clarificationRequests."
    │
    ├── Model drafts events (1+ LLM turns, max 15)
    │   └── calls compile_event_graph_draft tool with {events, notes, ...}
    │
    ├── Post-tool processing:
    │   ├── enrichAddMaterialRefs() — labels CURIEs using OAK/OLS4
    │   ├── normalizeDraftMaterialRefs() — repairs mangled refs against mentions
    │   └── forceMaterialClarifications(events, {resolvedCuries, policeUnverifiedCuries: true})
    │       │
    │       ├── For each add_material event:
    │       │   ├── hasTrustedSpecOrAliquot? → KEEP (no clarification)
    │       │   ├── hasQuantitySignal? → KEEP (accept-time will materialize)
    │       │   ├── no material_ref at all? → GAP: 'no-ref'
    │       │   ├── memory-recalled CURIE not in resolvedCuries? → GAP: 'unverified-curie'
    │       │   ├── concept but no quantity? → GAP: 'needs-quantity'
    │       │   └── mint/draft ref? → GAP: 'needs-quantity' (if no quantity)
    │       │
    │       └── If ANY gaps: events = [] (HOLD WHOLE DRAFT), return clarificationRequests
    │
    ▼
AGENT RESULT → SSE 'done' event
    {
      events: [],              ← empty when clarifications pending
      clarificationRequests: [
        {
          id: "material-1",
          kind: "material",
          prompt: "Which material is \"clofibrate\"? Pick an ontology term or create a local record.",
          entityType: "material",
          menuProvider: "/m",      ← triggers MaterialPicker in UI
          allowCreateLocal: true,
          query: "clofibrate",     ← pre-fills the search box
          snippet: "Added 10 uL 1 uM clofibrate to A1",
          options: []              ← always empty in forced-tool mode (no hallucinated options)
        }
      ]
    }
    │
    ▼
FRONTEND: MessageLog renders ClarificationCards
    │
    ├── Each request → a card with:
    │   ├── Menu badge: /m (material), /l (labware), /e (equipment), or choice
    │   ├── Prompt text ("Which material is \"clofibrate\"?")
    │   ├── Event snippet (so user sees WHICH material)
    │   ├── If options exist: static option buttons
    │   └── ClarificationPicker (inline search, reuses slash-menu resolvers)
    │       └── resolveMaterial / resolveLabware / resolveEquipment
    │           (same resolve spine: local records → OAK → OLS4 → vendor → mint)
    │
    ├── User picks a suggestion OR types to mint a local term
    │
    ├── groundedAnswerFromMention():
    │   └── If ontology CURIE: groundMaterialRef() → find-or-mint local record
    │       (so the agent sees it in <resolved_context> next turn, no loop)
    │
    ├── AiClarificationAnswer: {requestId, label, mentionToken: "[[material:MAT-xxx|label]]", ref}
    │
    └── ALL cards answered → batch submit
        │
        ▼
    handleClarificationsSubmit():
        ├── Accumulates in resolvedClarificationsRef (keyed by ref id, survives re-drafts)
        ├── Builds prompt: "Use [[material:MAT-xxx|clofibrate]] for material."
        └── chat.send(prompt, {clarificationAnswers: all, enableThinking: false})
            │
            ▼
        POST /ai/draft-events/stream (AGAIN, with clarificationAnswers)
            │
            ▼
        AGENT ORCHESTRATOR (second turn)
            ├── appendClarificationAnswersToPrompt() — injects answers into prompt text
            ├── resolvedMentionsFromAnswers() — converts answers to mention objects
            ├── buildResolvedContextMessage() — injects <resolved_context> block
            │   so the model sees grounded materials as confirmed
            │
            ├── Model re-drafts with the confirmed materials
            │   └── Uses mention tokens ([[material:MAT-xxx|clofibrate]]) in the draft
            │
            ├── forceMaterialClarifications() runs again
            │   └── If all materials now grounded + have quantities → events pass through
            │   └── If still ungrounded → clarification cards again (but resolvedClarifications
            │       ref prevents ping-pong by re-sending ALL prior answers)
            │
            └── Returns events (non-empty this time) → preview renders in editor
                │
                ▼
            USER SEES DRAFT + can Accept/Reject
```

---

## 4. KEY FILES

### Backend (Detection + Generation)
| File | Role |
|---|---|
| `server/src/ai/forceMaterialClarifications.ts` (313 lines) | The deterministic net — classifies each add_material event, generates gap → clarification request |
| `server/src/ai/AgentOrchestrator.ts` (1877 lines) | Orchestrates LLM turns, calls forceMaterialClarifications post-tool, manages resolved mentions |
| `server/src/ai/clarifications.ts` (228 lines) | Converts compiler Gaps → AgentClarificationRequest, normalizes kinds, maps to menu providers |
| `server/src/ai/types.ts` (727 lines) | Type definitions: AgentClarificationRequest, AgentClarificationAnswer, AgentResult |
| `server/src/ai/runChatbotCompile.ts` (587 lines) | Compiler pipeline (deterministic passes), emits gaps on unresolved refs |
| `server/src/ai/materialRefLabels.ts` | Labels CURIEs with human names using OAK/OLS4 (so cards show "clofibrate" not "CHEBI:17790") |

### Backend (API + Communication)
| File | Role |
|---|---|
| `server/src/api/handlers/AIHandlers.ts` (644 lines) | POST /ai/draft-events (JSON) and /ai/draft-events/stream (SSE) |
| `server/src/ai/systemPrompt.ts` | System prompt instructing model: "ask for clarification, don't invent" |

### Frontend (UI + Interaction)
| File | Role |
|---|---|
| `app/src/event-editor/right-pane/ai/MessageLog.tsx` (234 lines) | Renders chat bubbles + ClarificationCards inline in the message stream |
| `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` (225 lines) | Inline search picker — reuses slash-menu resolvers, grounds ontology picks to local records |
| `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (600 lines) | Manages clarification state, resolvedClarificationsRef, handleClarificationsSubmit |
| `app/src/event-editor/right-pane/ai/useChatThread.ts` | Chat hook — sends messages, receives SSE events, stores clarificationRequests |
| `app/src/event-editor/right-pane/ai/assistStream.ts` | SSE parsing + summary text for clarifications |
| `app/src/shared/taptab/slashMenu/resolvers.ts` | resolveMaterial, resolveLabware, resolveEquipment — the same resolvers used in TapTab editor |

---

## 5. COMMUNICATION PROTOCOL

### API Endpoints
| Method | Path | Transport | Purpose |
|---|---|---|---|
| POST | `/ai/draft-events` | JSON | One-shot draft (returns AgentResult) |
| POST | `/ai/draft-events/stream` | SSE | Streaming draft (AgentEvent chunks → done with AgentResult) |
| POST | `/ai/assist/stream` | SSE | General AI assistant stream |

### Request Body (draft-events/stream)
```typescript
{
  prompt: string,                      // user's natural language instruction
  context: EditorContext,              // labware, wells, deck scope, etc.
  history?: ConversationHistoryMessage[],
  clarificationAnswers?: AgentClarificationAnswer[],  // answers from prior turn
  deterministicOnly?: boolean,
  enableThinking?: boolean,
  attachments?: FileAttachment[]
}
```

### AgentResult (response / SSE 'done' event)
```typescript
{
  success: boolean,
  events: PlateEventProposal[],        // empty when clarifications pending
  clarificationRequests?: AgentClarificationRequest[],  // the cards
  clarification?: AgentClarification,   // legacy single-clarification
  unresolvedRefs?: OntologyRefProposal[],
  ontologyBindings?: DraftOntologyBinding[],
  usage?: { promptTokens, completionTokens, totalTokens, turns, toolCalls }
}
```

### AgentClarificationRequest
```typescript
{
  id: string,                          // "material-1", "material-2", etc.
  kind: 'material' | 'labware' | 'equipment' | 'parameter' | 'general' | ...,
  prompt: string,                      // "Which material is \"clofibrate\"?"
  entityType?: string,
  menuProvider: '/m' | '/l' | '/e' | 'choice',  // which picker to show
  query?: string,                      // pre-fills the search box
  snippet?: string,                    // event note for context
  options: AgentClarificationOption[], // static options (usually empty in draft mode)
  allowCreateLocal?: boolean
}
```

### AgentClarificationAnswer (user's response)
```typescript
{
  requestId: string,                   // matches the request id
  optionId?: string,                   // if a static option was picked
  label?: string,                      // display label
  value?: string,                      // for 'choice' (answer in chat)
  mentionToken?: string,               // "[[material:MAT-xxx|clofibrate]]"
  ref?: { kind, id, type, label }      // structured grounding
}
```

---

## 6. THE CLARIFICATION PICKER (Frontend Detail)

The ClarificationPicker reuses the exact same slash-menu resolvers as the TapTab editor:

- `menuProvider: '/m'` → `resolveMaterial` (local records → OAK → OLS4 → vendor → mint)
- `menuProvider: '/l'` → `resolveLabware` (local labware definitions)
- `menuProvider: '/e'` → `resolveEquipment` (local equipment)
- `menuProvider: 'choice'` → no picker, "Answer in chat" button only

When the user picks an ontology CURIE (e.g. `CHEBI:17790`), `groundedAnswerFromMention()`
calls `groundMaterialRef()` which delegates to `ensureLocalMaterialForOntology()` in
`server/src/materials/MaterialGrounding.ts`:
1. Checks if a local material already has that CURIE in its `class[]`
2. Checks by name match
3. Creates a new `MAT-<slug>` record with `status: 'proposed'`, `lifecycleId: 'lab-vocabulary-control'`
4. Domain inferred from CURIE namespace (CHEBI → chemical, CL → cell_line, etc.)

This is critical: a bare CURIE sent back to the agent would NOT be in `<resolved_context>`,
so the forced-draft "clarify ungrounded material" rule would re-fire and the clarification
would loop. Grounding to a local record makes the mention resolvable, so the agent accepts it.

---

## 7. ANTI-PING-PONG MECHANISM

The `resolvedClarificationsRef` in AiTabPanel is a `Map<string, AiClarificationAnswer>`
keyed by the grounded material's ref id (not the request id — request ids aren't
material-stable across re-drafts). Every clarification submit re-sends the FULL set of
accumulated answers, so a material resolved earlier never re-surfaces as a clarification
even if the model re-grounds inconsistently. The map is cleared when the user types a
fresh prompt.

---

## 8. GAP REASON DETAILS

### `no-ref` — "Which material should be added to A1?"
The material survived only as free text in the event's `note` field. No `material_ref`
object at all. The net can't reconstruct which term it is, so it asks with no pre-filled
query.

### `unverified-curie` — "Which material is \"CHEBI:17790\"?"
The model recalled a CURIE from memory (not provided in `<resolved_context>` and not
resolved via the `resolve` tool, which is off in draft mode). This is a hallucination
guard — the model's memory of CURIEs is unreliable. Only policed in forced-tool mode
(`policeUnverifiedCuries: true`); other modes let the compiler validate.

### `needs-quantity` — "I need a volume and a concentration for \"clofibrate\"."
The material IS clear (named, maybe even grounded), but the event has no quantity
signal (no concentration, no cell count, no ≥2-component snapshot). A compound at a
concentration is a formulation, not a bare concept — the lab needs to know how much.
Answered in plain chat ("10 µL of 1 µM"), not with the material picker.

---

## 9. DRAFT MODE CONSTRAINTS

The forced-tool draft mode (the default for the event-editor dock) has several constraints
that shape the clarification loop:

1. **No `resolve` tool**: The model cannot call the resolve spine. It must ground unknown
   materials as `{mint: {label: "clofibrate", domain: "chemical"}}` — never guess a CURIE.

2. **No model-authored clarifications**: The system prompt explicitly says "Do NOT author
   your own material clarificationRequests, and do NOT invent clarification options." Any
   options the model lists are stripped to `[]` — only the live /m search offers real choices.

3. **Hold whole draft on any gap**: When any material needs confirming, ALL events are held
   (events = []), not just the ungrounded subset. This prevents "mixing" — a half-draft ghost
   of grounded materials alongside questions about ungrounded ones.

4. **Batched re-draft**: All clarification cards must be answered before re-drafting. The UI
   shows progress ("2 of 3 answered — pick the rest to draft them together").

5. **Post-tool re-compile skipped**: In forced-tool mode, the compiler re-compile (which
   would validate CURIEs and emit gaps) is deliberately skipped — the draft tool's
   schema-validated payload IS the draft. The forceMaterialClarifications net replaces
   the compiler as the validation gate.

---

## 10. KEY FINDINGS

1. **Two detection paths**: forceMaterialClarifications (draft mode, primary) and compiler
   gaps (legacy re-compile mode). Both produce the same AgentClarificationRequest type.

2. **The model never generates clarification options**: In forced-tool mode, the model has
   no resolve tool, so any CURIEs it lists are hallucinated. Options are always stripped to
   empty — the user picks from a LIVE search via ClarificationPicker.

3. **ClarificationPicker reuses the resolve spine**: The same slash-menu resolvers that power
   the TapTab editor's `/m` command power the clarification search, so grounding behaves
   identically.

4. **Ontology picks are grounded to local records before re-draft**: `groundedAnswerFromMention`
   calls `groundMaterialRef()` (find-or-mint) so the agent sees the pick in `<resolved_context>`
   next turn, preventing clarification loops.

5. **Anti-ping-pong via accumulated answers**: resolvedClarificationsRef re-sends ALL prior
   answers on every clarification submit, so previously-resolved materials don't re-surface.

6. **needs-quantity is a separate concern**: Not about WHICH material, but HOW MUCH. Answered
   in plain chat (no picker), with kind 'parameter' and menuProvider 'choice'.

7. **SSE streaming**: The /ai/draft-events/stream endpoint uses Server-Sent Events. The
   frontend receives status events, tool_call events, text deltas, and a final 'done' event
   with the AgentResult (including clarificationRequests).

8. **No websocket**: Communication is SSE (unidirectional server→client) + POST (client→server).
   No bidirectional websocket. Each user message or clarification batch is a fresh POST.
