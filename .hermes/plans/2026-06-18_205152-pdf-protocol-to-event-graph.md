# PDF Protocol → Event Graph Workflow

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** When a user ingests a vendor protocol PDF in the AI chat panel, extract structured protocol text, let the user provide implementation context (labwares, robot decks), then have the AI generate an event graph that ghosts onto the deck for accept/revise.

**Architecture:** Add a new backend endpoint to extract protocol candidates from PDF attachments, wire the existing `graphLemurSource` infrastructure in the event editor to surface extracted protocols, add a UI panel for implementation context, and enhance the context builder to feed the protocol candidate + user context into the AI compilation pipeline.

**Tech Stack:** TypeScript (React + Fastify), existing vendor-protocol extraction pipeline, chatbot-compile pipeline.

---

## Current State (what exists)

| Component | Status | File |
|-----------|--------|------|
| PDF text extraction | Working | `server/src/extract/PdfTextAdapter.ts`, `decodeAttachment.ts` |
| Protocol candidate extraction | Working | `server/src/ingestion/vendor-protocol/VendorProtocolCandidateService.ts` |
| Event graph compilation | Working | `server/src/ai/runChatbotCompile.ts` (25-pass pipeline) |
| Ghost preview on deck | Working | `app/src/event-editor/right-pane/ai/draftPreview.ts` |
| Accept/Discard/Revise | Working | `app/src/event-editor/EventEditorContext.tsx` (preview actions) |
| `graphLemurSource` types | Defined but UNUSED | `app/src/event-editor/EventEditorContext.tsx:269` |
| Context builder `graphLemur` support | Defined but UNUSED | `app/src/event-editor/right-pane/ai/AiTabPanel.tsx:232-240` |
| `setGraphLemurSource` action | Defined but NEVER CALLED | `app/src/event-editor/EventEditorContext.tsx:1353` |

**The gap:** The extraction pipeline and ghost preview exist. The `graphLemur` wiring is scaffolded but dead. The AI chat panel sends raw PDF text to the LLM but doesn't extract a structured `ProtocolCandidate` first, so the AI sees unstructured text rather than materials, steps, labware, equipment.

---

## Phase 1: Backend — Protocol extraction endpoint

### Task 1: Create POST /api/ai/extract-protocol endpoint

**Objective:** Add a new API endpoint that accepts a PDF attachment and returns a structured `ProtocolCandidate`.

**Files:**
- Create: `server/src/api/handlers/ExtractProtocolHandler.ts`
- Modify: `server/src/api/routes.ts` (register new route)
- Modify: `app/src/shared/api/client.ts` (add client method)

**Step 1: Create the handler**

Create `server/src/api/handlers/ExtractProtocolHandler.ts`:

```typescript
import { FastifyReply, FastifyRequest } from 'fastify'
import { extractVendorProtocolCandidateFromInput } from '../../ingestion/vendor-protocol/VendorProtocolCandidateService.js'
import type { ProtocolCandidate } from '../../ingestion/vendor-protocol/types.js'

export interface ExtractProtocolRequest {
  // multipart form-data: file field with the PDF
}

export async function extractProtocolHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const data = await request.file({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  })

  if (!data) {
    return reply.code(400).send({ error: 'No file uploaded' })
  }

  const buffer = await data.file.toBuffer()
  const fileName = data.filename ?? 'unknown.pdf'

  const result = await extractVendorProtocolCandidateFromInput({
    workspaceRoot: process.cwd(),
    contentBase64: buffer.toString('base64'),
    fileName,
    persist: false,
  })

  reply.send({
    kind: 'protocol-candidate-extracted' as const,
    source: {
      documentId: result.candidate.source.documentId,
      title: result.candidate.title,
      version: result.candidate.source.version,
      pageCount: result.document.pageCount,
    },
    candidate: result.candidate,
  })
}
```

**Step 2: Register the route**

Modify `server/src/api/routes.ts` — add alongside the existing AI routes:

```typescript
import { extractProtocolHandler } from './handlers/ExtractProtocolHandler.js'

// After existing /ai/assist/stream route:
server.post('/ai/extract-protocol', {
  config: { rawBody: true },
}, extractProtocolHandler)
```

**Step 3: Add client method**

Modify `app/src/shared/api/client.ts` — add a method:

```typescript
async extractProtocol(file: File): Promise<{
  kind: 'protocol-candidate-extracted'
  source: { documentId: string; title: string; version?: string; pageCount: number }
  candidate: ProtocolCandidateSummary
}> {
  const formData = new FormData()
  formData.append('file', file)
  return request('/ai/extract-protocol', {
    method: 'POST',
    body: formData,
  })
}
```

**Step 4: Test**

Run: `cd server && pnpm run test:run -- --grep "extract-protocol"`

Expected: No existing tests — verify endpoint loads by checking server starts without errors.

**Step 5: Commit**

```bash
git add server/src/api/handlers/ExtractProtocolHandler.ts server/src/api/routes.ts app/src/shared/api/client.ts
git commit -m "feat(ai): add POST /ai/extract-protocol endpoint for vendor PDF extraction"
```

---

### Task 2: Enhance AI assist stream to auto-extract protocol candidates from PDF attachments

**Objective:** When the user sends a chat message with a PDF attachment, auto-extract a protocol candidate alongside the raw text, so the AI compilation pipeline receives structured protocol data.

**Files:**
- Modify: `server/src/api/handlers/AIHandlers.ts` (assistStream handler)
- Modify: `server/src/ai/AgentOrchestrator.ts` (run context)

**Step 1: Add protocol extraction to attachment pipeline**

In `AIHandlers.ts`, inside the `assistStream` handler where attachments are decoded (around line 200-250), after calling `decodeAttachmentText`, also check if the attachment is a PDF and run protocol extraction:

```typescript
// After existing decodeAttachmentText call:
const decoded = await decodeAttachmentText(name, mimeType, content)

// For PDFs, also extract a structured protocol candidate
let protocolCandidate: ProtocolCandidate | undefined
if (name.toLowerCase().endsWith('.pdf')) {
  try {
    const extractionResult = await extractVendorProtocolCandidateFromInput({
      workspaceRoot: appConfig.workspaceRoot,
      contentBase64: Buffer.from(content as Uint8Array).toString('base64'),
      fileName: name,
      persist: false,
    })
    protocolCandidate = extractionResult.candidate
  } catch (err) {
    // Log but don't fail — fall back to raw text extraction
    console.warn(`Protocol extraction failed for ${name}:`, err)
  }
}
```

**Step 2: Pass protocol candidate to orchestrator context**

The existing context builder in `AiTabPanel.tsx` already supports `graphLemur.sourceProtocolCandidate`. Modify the orchestrator to receive the extracted candidate and include it in the compilation context.

In the orchestrator's `run` method, when building the pipeline input, include the protocol candidate:

```typescript
// In orchestrator run context builder:
if (protocolCandidate) {
  context.graphLemur = {
    sourceProtocolCandidate: buildProtocolCandidateSummary(protocolCandidate),
    sourcePdf: {
      artifactPath: undefined,
      title: protocolCandidate.title,
      vendor: protocolCandidate.source.vendor,
    },
  }
}
```

**Step 3: Stream the protocol candidate extraction back to the frontend**

Add a new SSE event type for protocol extraction progress:

```typescript
// Stream event: { type: 'protocol_extracted', candidate: ProtocolCandidateSummary }
```

In `app/src/types/ai.ts`, add to `AiStreamEvent`:

```typescript
export interface AiProtocolExtractedEvent {
  type: 'protocol_extracted'
  candidate: AiProtocolCandidateSummary
}
```

**Step 4: Test**

Run: `cd server && pnpm run test:run -- --grep "assistStream"`

Expected: Existing tests pass, no regression.

**Step 5: Commit**

```bash
git add server/src/api/handlers/AIHandlers.ts server/src/ai/AgentOrchestrator.ts app/src/types/ai.ts
git commit -m "feat(ai): auto-extract protocol candidates from PDF attachments in assist stream"
```

---

## Phase 2: Frontend — Surface extracted protocol + implementation context

### Task 3: Add ProtocolSourcePanel in the AI chat panel

**Objective:** When a PDF is attached and a protocol candidate is extracted, show a summary panel in the AI chat that lets the user see what was extracted and provide implementation context.

**Files:**
- Create: `app/src/event-editor/right-pane/ai/ProtocolSourcePanel.tsx`
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (compose new panel)

**Step 1: Create the ProtocolSourcePanel component**

Create `app/src/event-editor/right-pane/ai/ProtocolSourcePanel.tsx`:

```typescript
import { useState } from 'react'
import type { AiProtocolCandidateSummary } from '../../../types/ai'

export interface ProtocolSourcePanelProps {
  candidate: AiProtocolCandidateSummary
  implementationContext: string
  onImplementationContextChange: (text: string) => void
  onExtracted: () => void
}

export function ProtocolSourcePanel({
  candidate,
  implementationContext,
  onImplementationContextChange,
  onExtracted,
}: ProtocolSourcePanelProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="ai-tab__protocol-source" data-testid="protocol-source-panel">
      <div className="ai-tab__protocol-source-header">
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="ai-tab__protocol-source-toggle"
        >
          {collapsed ? '▶' : '▼'} Protocol extracted: {candidate.title}
        </button>
        <span className="ai-tab__protocol-source-badge">
          {candidate.steps?.length ?? 0} steps · {candidate.materials?.length ?? 0} materials
        </span>
      </div>

      {!collapsed && (
        <>
          <div className="ai-tab__protocol-source-summary">
            {candidate.materials?.length ? (
              <div>
                <strong>Materials:</strong>{' '}
                {candidate.materials.map((m) => m.label).join(', ')}
              </div>
            ) : null}
            {candidate.labware?.length ? (
              <div>
                <strong>Labware:</strong>{' '}
                {candidate.labware.map((l) => l.label).join(', ')}
              </div>
            ) : null}
          </div>

          <div className="ai-tab__protocol-source-context">
            <label htmlFor="implementation-context">
              <strong>Implementation context:</strong>
            </label>
            <textarea
              id="implementation-context"
              placeholder="Describe how to implement this protocol: what labwares you have, robot deck, available materials, etc."
              value={implementationContext}
              onChange={(e) => onImplementationContextChange(e.target.value)}
              rows={4}
              className="ai-tab__context-input"
            />
          </div>

          <button
            type="button"
            onClick={onExtracted}
            className="ai-tab__protocol-source-btn"
          >
            Generate event graph from this protocol
          </button>
        </>
      )}
    </div>
  )
}
```

**Step 2: Compose into AiTabPanel**

In `AiTabPanel.tsx`, add state for extracted protocol and implementation context:

```typescript
// State for protocol extraction
const [extractedProtocol, setExtractedProtocol] = useState<AiProtocolCandidateSummary | null>(null)
const [implementationContext, setImplementationContext] = useState('')
```

Add the panel between the `SourcesStrip` and `MessageLog` sections:

```tsx
{extractedProtocol ? (
  <section className="ai-tab__section ai-tab__section--protocol-source">
    <ProtocolSourcePanel
      candidate={extractedProtocol}
      implementationContext={implementationContext}
      onImplementationContextChange={setImplementationContext}
      onExtracted={() => handleProtocolExtract()}
    />
  </section>
) : null}
```

When the `protocol_extracted` SSE event arrives, set the extracted protocol:

```typescript
// In useChatThread event handler, or directly in AiTabPanel:
case 'protocol_extracted':
  setExtractedProtocol(event.candidate)
  break
```

**Step 3: Add CSS styles**

In `app/src/event-editor/right-pane/ai/ai.css`, add:

```css
.ai-tab__protocol-source {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 12px;
  background: var(--surface-color);
}

.ai-tab__protocol-source-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.ai-tab__protocol-source-badge {
  font-size: 11px;
  color: var(--muted-color);
}

.ai-tab__context-input {
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-family: inherit;
  resize: vertical;
}
```

**Step 4: Test**

Run: `cd app && pnpm run test:unit -- --grep "ProtocolSourcePanel"`

Expected: Component renders without errors. Verify with a snapshot test.

**Step 5: Commit**

```bash
git add app/src/event-editor/right-pane/ai/ProtocolSourcePanel.tsx app/src/event-editor/right-pane/ai/AiTabPanel.tsx app/src/event-editor/right-pane/ai/ai.css
git commit -m "feat(ui): add ProtocolSourcePanel for extracted protocol + implementation context"
```

---

### Task 4: Wire implementation context into the AI compilation pipeline

**Objective:** When the user clicks "Generate event graph" or sends a prompt with implementation context, combine the extracted protocol candidate + implementation context into the AI request.

**Files:**
- Modify: `app/src/event-editor/right-pane/ai/useChatThread.ts`
- Modify: `app/src/event-editor/right-pane/ai/assistStream.ts`
- Modify: `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`

**Step 1: Add implementation context to AssistStreamRequest**

In `assistStream.ts`, add to the request interface:

```typescript
export interface AssistStreamRequest {
  // ... existing fields ...
  /** Structured implementation context from the user (labwares, decks, materials). */
  implementationContext?: string
  /** Extracted protocol candidate summary (from vendor PDF). */
  protocolCandidate?: AiProtocolCandidateSummary
}
```

**Step 2: Enhance context builder in AiTabPanel**

In the `context` useMemo in `AiTabPanel.tsx`, include `graphLemur` with the extracted protocol and implementation context:

```typescript
const context = useMemo(() => {
  // ... existing context builder ...

  // Include graphLemur context when a protocol candidate is extracted
  const graphLemurContext = extractedProtocol
    ? {
        graphLemur: {
          revisionMode: Boolean(editorState?.preview),
          sourceProtocolCandidate: extractedProtocol,
          sourcePdf: extractedProtocol.source,
          implementationContext: implementationContext || undefined,
        },
      }
    : {}

  return {
    studyId: ws.state.studyId,
    // ... existing fields ...
    ...graphLemurContext,
  }
}, [/* existing deps */, extractedProtocol, implementationContext])
```

**Step 3: Handle "Generate event graph" button**

In `AiTabPanel.tsx`, implement `handleProtocolExtract`:

```typescript
const handleProtocolExtract = useCallback(async () => {
  // Compose a prompt from the implementation context + protocol title
  const prompt = implementationContext.trim()
    ? `Generate an event graph for ${extractedProtocol?.title}. Implementation context: ${implementationContext}`
    : `Generate an event graph for ${extractedProtocol?.title}.`

  await chat.send(prompt, { enableThinking: false })
}, [extractedProtocol, implementationContext, chat])
```

**Step 4: Wire setGraphLemurSource**

When a protocol candidate is extracted, set it in the event editor state so the context builder picks it up:

```typescript
// In AiTabPanel, when protocol_extracted event arrives:
if (editor && event.type === 'protocol_extracted') {
  editor.actions.setGraphLemurSource({
    sourceProtocolCandidate: event.candidate,
    sourcePdf: event.candidate.source,
  })
}
```

**Step 5: Test**

Run: `pnpm run typecheck -w app`

Expected: TypeScript compiles without errors.

Run: `cd app && pnpm run test:unit -- --grep "AiTabPanel|useChatThread"`

Expected: Existing tests pass.

**Step 6: Commit**

```bash
git add app/src/event-editor/right-pane/ai/useChatThread.ts app/src/event-editor/right-pane/ai/assistStream.ts app/src/event-editor/right-pane/ai/AiTabPanel.tsx
git commit -m "feat(ai): wire implementation context + protocol candidate into AI compilation pipeline"
```

---

## Phase 3: Server — Use protocol candidate in compilation

### Task 5: Enhance system prompt builder to include protocol candidate + implementation context

**Objective:** When a protocol candidate is present in the context, render it in the system prompt so the AI sees structured protocol data instead of raw PDF text.

**Files:**
- Modify: `server/src/ai/systemPrompt.ts`
- Modify: `server/src/ai/RunContextAssembler.ts`

**Step 1: Add protocol candidate rendering to system prompt**

In `systemPrompt.ts`, add a function to format protocol candidates:

```typescript
function formatProtocolCandidate(
  candidate?: EditorContext['graphLemur']?.sourceProtocolCandidate,
  implementationContext?: string,
): string {
  if (!candidate) return ''

  const parts: string[] = []
  parts.push(`\n## Protocol from Vendor Document\nTitle: ${candidate.title}`)
  if (candidate.scope) parts.push(`Scope: ${candidate.scope}`)

  if (candidate.materials?.length) {
    parts.push(`\nMaterials (${candidate.materials.length}):`)
    for (const m of candidate.materials) {
      parts.push(`- ${m.label}${m.role ? ` (${m.role})` : ''}`)
    }
  }

  if (candidate.labware?.length) {
    parts.push(`\nLabware (${candidate.labware.length}):`)
    for (const l of candidate.labware) {
      parts.push(`- ${l.label}${l.role ? ` (${l.role})` : ''}`)
    }
  }

  if (candidate.steps?.length) {
    parts.push(`\nSteps (${candidate.steps.length}):`)
    for (const s of candidate.steps) {
      const num = s.stepNumber ? `${s.stepNumber}${s.substep ?? ''}` : ''
      parts.push(`- ${num} ${s.text}`)
    }
  }

  if (implementationContext) {
    parts.push(`\n## Implementation Context (from user)\n${implementationContext}`)
  }

  return parts.join('\n')
}
```

**Step 2: Call from context assembly**

In the context assembly / system prompt rendering, call this function when `graphLemur.sourceProtocolCandidate` is present.

**Step 3: Test**

Run: `cd server && pnpm run test:run -- --grep "systemPrompt"`

Expected: Existing tests pass.

**Step 4: Commit**

```bash
git add server/src/ai/systemPrompt.ts server/src/ai/RunContextAssembler.ts
git commit -m "feat(ai): render protocol candidate + implementation context in system prompt"
```

---

## Phase 4: Integration test & polish

### Task 6: End-to-end verification

**Objective:** Verify the complete workflow: upload PDF → protocol extracted → implementation context provided → AI generates event graph → ghost preview shown.

**Step 1: Manual integration test**

1. Start the backend: `npm run dev -w server`
2. Start the frontend: `npm run dev -w app`
3. Open the workspace → AI chat panel
4. Upload a vendor protocol PDF (e.g., Zymo Quick-RNA Miniprep)
5. Verify: ProtocolSourcePanel appears with extracted steps/materials/labware
6. Type implementation context: "Use a 96-well deepwell plate for samples, place in slot A1. Use a 96-well PCR plate for elution, slot A2."
7. Click "Generate event graph"
8. Verify: Ghost events appear on the deck canvas
9. Verify: Accept/Discard buttons appear
10. Click Accept → events commit to the graph
11. Click Revise with feedback → events update

**Step 2: Add integration test**

Create: `app/src/event-editor/right-pane/ai/ProtocolSourcePanel.test.tsx`

Test cases:
- Renders protocol summary correctly
- Implementation context textarea updates state
- "Generate" button fires callback

**Step 3: Verify typecheck**

```bash
pnpm run typecheck
```

Expected: No errors.

**Step 4: Commit**

```bash
git add app/src/event-editor/right-pane/ai/ProtocolSourcePanel.test.tsx
git commit -m "test(ui): add ProtocolSourcePanel tests"
```

---

## Summary

| Task | What | Files Changed | Est. Time |
|------|------|---------------|-----------|
| 1 | POST /ai/extract-protocol endpoint | 3 files | 15 min |
| 2 | Auto-extract protocol in assist stream | 3 files | 20 min |
| 3 | ProtocolSourcePanel UI component | 3 files | 20 min |
| 4 | Wire implementation context into AI pipeline | 3 files | 15 min |
| 5 | Enhance system prompt for protocol candidate | 2 files | 10 min |
| 6 | Integration test & verification | 1 file + manual | 15 min |

**Total: ~1.5 hours**

---

## Risks & Tradeoffs

1. **Vendor protocol extraction is specific** — `extractVendorProtocolCandidate` is tuned for vendor PDFs. If a user uploads a lab notebook PDF or a methods section, extraction may be poor. Mitigation: the handler falls back to raw text extraction on failure.

2. **Token budget** — Including full protocol candidate + implementation context in the system prompt adds tokens. On the appliance GPU with a 38k-token context, this may reduce room for the LLM's response. Mitigation: truncate long step lists to first 20 steps.

3. **graphLemur vs. existing context path** — The `graphLemur` context path is partially scaffolded but untested. There may be edge cases in how the context builder serializes it. Mitigation: add unit tests for the context builder with `graphLemur` populated.

4. **setGraphLemurSource is currently dead code** — Calling it for the first time in production means there may be missing type guards or serialization issues. Mitigation: verify the action dispatch works end-to-end before relying on it.

---

## Open Questions

1. Should the implementation context be free-text (textarea) or structured (form fields for labware, deck, materials)? Free-text is simpler and matches the existing chat pattern. Structured form is more guided but more UX work.

2. Should the "Generate event graph" button replace the existing chat flow, or coexist? Current plan: coexist — the button pre-fills a prompt into the chat, the user can edit before sending.

3. Should protocol extraction be synchronous (wait for extraction before showing chat) or async (show extraction progress, then reveal panel)? Current plan: async — show a loading indicator, then reveal the panel.
