# Step-Localization Panel Redesign for Protocol Planning Mode

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Turn the current read-only "step detail + single-prompt AI input" into one large, editable, inline step-localization panel in **Protocol Planning** mode: click a step → a big panel opens beneath it (pushing other chips down) with an editable step **title** (TapTab), the **full step text** (editable TapTab) below it, and a **"how to do this step" prompt box** below that; clicking **Localize/Submit** sends the *whole composed prompt* (title + text + instruction) to the AI and ghosts events on the deck; the existing accept/reject popup gains a **"What to do differently"** box + **Re-Draft/Re-Try** button.

**Architecture:** Consolidate the currently-separate `StepDetailPane` (read-only `<pre>` + "Send selection to AI") and `StepLocalizationPane` (single `ChatInput` + inline Accept/Discard + Save-to-corpus) into **one** expanded inline panel rendered directly under the active step chip in `ProtocolTabPanel`. Reuse the existing TipTap editable-surface pattern (`ChatInput`'s `useEditor` + `editorToText`, and `TapTabEditor` where schema-driven) for the two editable fields. Reuse the existing `useChatThread` + `buildPreviewFromDraft` ghost pipeline unchanged — **each send already revises the ghost** via `revisionHistory`, so "Re-Draft" is just a re-send that appends the "what to do differently" correction to the last instruction. The accept/discard/re-draft affordance lives inline in the panel (the "popup"); the deck's floating `PreviewActionBar` continues to handle persistence on Accept.

**Tech Stack:** React 18, TypeScript (`exactOptionalPropertyTypes`), TipTap 3 (v3 `@tiptap/react`), existing `useChatThread`/`assistStream`/`buildPreviewFromDraft`, `ProtocolSelectionContext` (activeStepId/currentStepId), Tailwind-adjacent inline styles + `protocolTabPanel.css`. All unit tests via Vitest + Testing Library.

---

## Current state (verified, do NOT rebuild)

- **`app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`** — renders `RunHeader`, a vertical `steps.map(...)` of `StepChip`s, then (when a step is active/expanded) a read-only `StepDetailPane` and then `StepLocalizationPane`, both *inline in block flow* (so they already push later chips down). `onSelect` sets `activeStepId`, `expandedStepId`, and `ProtocolSelectionContext.setCurrentStepId` (→ deck current/past highlight).
- **`app/src/run/protocol-planning/StepDetailPane.tsx`** — read-only `<pre>` of the step's long-form text + "Send selection to AI" button (`dispatchProtocolStepSelection` CustomEvent).
- **`app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx`** — `useChatThread(surface=PROTOCOL_LOCALIZE_SURFACE)`; `handleSend(text)` calls `chat.send(buildStepLocalizePrompt(step, text), {enableThinking:false})`; `onDraftResult` → `buildPreviewFromDraft` → `editor.actions.setPreview` (ghost). `handleAccept` → `editor.actions.commitPreview()` + snapshots committed graph; `handleDiscard` → `clearPreview()`. Save-to-corpus via `apiClient.saveCorpusEntry` (source `protocol-loop`, `confirmedBy:'user'`). One `ChatInput` at the bottom.
- **`app/src/event-editor/deck/PreviewActionBar.tsx`** — the deck's floating accept bar (`summary` + Discard + View changes + Accept). This is the other "accept/reject popup"; it does the durable `persistAcceptedEventGraph` on Accept.
- **`app/src/run/protocol-planning/protocolStepSelection.ts`** — `buildStepLocalizePrompt(step, instruction)` (static prefix + instruction; does NOT embed editable title/text), `buildProtocolStepPrompt`, `dispatchProtocolStepSelection`.
- **`app/src/event-editor/right-pane/ai/ChatInput.tsx`** — a self-contained TipTap editor (Document/Paragraph/Text) using `editorToText`, Enter-to-send, `onSend(text)`. **This is the editable-surface pattern to reuse.**
- **`app/src/event-editor/right-pane/ai/useChatThread.ts`** — `SendOptions` already carries `protocolStepContext`. Each `send()` is a fresh turn; the reducer keeps history, so consecutive sends naturally REVISE the preview.
- `.test.tsx` files: `StepLocalizationPane.test.tsx`, `ProtocolTabPanel.test.tsx`.

---

## Approach / data flow (cross-layer trace)

The whole composed prompt is: **edited title + edited full text + "how to do this step" instruction**, all of which already reach the model via the existing `useChatThread` path. The only pipeline change is *what string we build and send*:

```
UI (ProtocolTabPanel expanded panel)
  ├─ editable Title surface        → titleText
  ├─ editable Full-text surface    → fullText
  └─ instruction ChatInput         → instruction
        ↓
composeFullLocalizePrompt({step, titleText, fullText, instruction})
        ↓
chat.send(composed, {enableThinking:false, protocolStepContext:{stepId,stepLabel,highlightedSection:fullText,selectedText:instruction}})
        ↓ (existing, unchanged)
onDraftResult → buildPreviewFromDraft → editor.actions.setPreview (ghost on deck)
        ↓
Accept / Discard / "What to do differently" + Re-Draft   [the popup]
```

**"Re-Draft/Re-Try"** = a second `chat.send` whose prompt appends `Correction: <whatToDoDifferently>` to the last instruction. Because `useChatThread` keeps thread history, the assistant revises the ghost; `buildPreviewFromDraft` merges via `revisionHistory`. No new streaming machinery needed.

---

## Files

- Modify: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx` (the big one — becomes the editable panel, gains re-draft)
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx` (render new panel under active chip; drop the separate StepDetailPane)
- Modify: `app/src/run/protocol-planning/protocolStepSelection.ts` (new `composeFullLocalizePrompt` builder)
- New: `app/src/run/protocol-planning/EditableProtocolText.tsx` (reusable TipTap editable surface — title + prose modes)
- New (test): `app/src/event-editor/right-pane/protocol/StepLocalizationPane.test.tsx` (extend)
- Modify: `app/src/event-editor/right-pane/protocol/protocolTabPanel.css` (panel + editable field + popup styles)
- Deprecate (do not delete yet): `app/src/run/protocol-planning/StepDetailPane.tsx` (superseded; keep exporting, stop mounting)

---

## Tasks

### Task 1: Composable full prompt builder (pure, TDD)

**Objective:** A pure function that composes the *entire* step-localization prompt from the editable title, full text, and instruction — so the panel has exactly one prompt string to send.

**Files:**
- Modify: `app/src/run/protocol-planning/protocolStepSelection.ts`
- Test: `app/src/run/protocol-planning/protocolStepSelection.test.ts` (create; or extend existing)

**Step 1 — Write failing tests:**

```ts
import { describe, it, expect } from 'vitest'
import { composeFullLocalizePrompt, buildStepLocalizePrompt } from './protocolStepSelection'

describe('composeFullLocalizePrompt', () => {
  const step = { stepId: 'S2', label: 'Incubate' }
  it('embeds title, full text, and instruction', () => {
    const out = composeFullLocalizePrompt({ step, titleText: 'Incubate 30 min', fullText: 'Incubate cells at 37C for 30 min', instruction: 'use the QuantStudio 5' })
    expect(out).toContain('Incubate 30 min')          // editable title
    expect(out).toContain('Incubate cells at 37C for 30 min') // editable full text
    expect(out).toContain('use the QuantStudio 5')     // instruction
    expect(out).toContain('S2')
  })
  it('tolerates empty editable surfaces (falls back to step label)', () => {
    const out = composeFullLocalizePrompt({ step, titleText: '', fullText: '', instruction: 'ghost it' })
    expect(out).toContain('Incubate')                  // fallback label
    expect(out).toContain('ghost it')
  })
  it('keeps buildStepLocalizePrompt behavior (back-compat)', () => {
    expect(buildStepLocalizePrompt(step, 'x')).toContain('x')
  })
})
```

**Step 2 — Run, expect FAIL** (`composeFullLocalizePrompt is not defined`).

**Step 3 — Implement (append to protocolStepSelection.ts):**

```ts
/** Compose the FULL step-localization prompt from editable surfaces. */
export interface FullLocalizeInput {
  step: { stepId: string; label: string }
  /** User-edited step title (may be empty → falls back to step.label). */
  titleText?: string
  /** User-edited full step text (may be empty → omitted). */
  fullText?: string
  /** How-to-do-this-step instruction. */
  instruction: string
}
export function composeFullLocalizePrompt(input: FullLocalizeInput): string {
  const { step, titleText, fullText, instruction } = input
  const title = (titleText ?? '').trim() || step.label
  const lines = [
    `Localize step ${step.stepId} ("${title}") for THIS lab's instruments and labware.`,
    ...((fullText ?? '').trim() ? [`Step text:\n"${fullText.trim()}"`] : []),
    ...((instruction ?? '').trim() ? [`User instruction: "${instruction.trim()}"`] : []),
    "Draft/ghost this step's events onto the current event graph so I can review them on the deck.",
  ]
  return lines.join('\n\n')
}
```

**Step 4 — Run, expect PASS.** **Step 5 — Commit** `feat(protocol): compose full step-localization prompt`.

---

### Task 2: Reusable editable TipTap surface

**Objective:** A small, reusable component (`EditableProtocolText`) wrapping the TipTap `useEditor` + `editorToText` pattern (exactly like `ChatInput`) so the title and full-text fields are rich but serialize to plain text for the prompt.

**Files:**
- Create: `app/src/run/protocol-planning/EditableProtocolText.tsx`
- Test: `app/src/run/protocol-planning/EditableProtocolText.test.tsx`

**Step 1 — Failing test:**

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'
import { EditableProtocolText } from './EditableProtocolText'

afterEach(() => cleanup())

describe('EditableProtocolText', () => {
  it('renders a contenteditable pre-filled with the initial text', () => {
    render(<EditableProtocolText initial="Incubate cells" onChange={() => {}} testId="ed-title" />)
    const el = screen.getByTestId('ed-title')
    expect(el).not.toBeNull()
  })
  it('reports text via editorToText on update without crashing', () => {
    const onChange = vi.fn()
    render(<EditableProtocolText initial="hello" onChange={onChange} testId="ed-text" />)
    expect(onChange).not.toHaveBeenCalled() // not called on mount
  })
})
```

**Step 2 — Run, expect FAIL** (component not found).

**Step 3 — Implement (mirror ChatInput's editor construction):**

```tsx
/**
 * EditableProtocolText — a lightweight TipTap surface that serializes to plain
 * text. Reuses the ChatInput pattern (Document/Paragraph/Text + editorToText)
 * so user edits flow back as strings for prompt composition. Optional
 * `prose` style renders the full-text field with paragraphs; `title` renders a
 * single-line-ish title editor.
 */
import { useEffect, useRef } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import Placeholder from '@tiptap/extension-placeholder'
import { editorToText } from '../../../shared/taptab/slashMenu/serialize'

export interface EditableProtocolTextProps {
  initial: string
  onChange: (text: string) => void
  testId?: string
  placeholder?: string
  className?: string
  /** 'title' = compact header; 'prose' = multiline body. */
  kind?: 'title' | 'prose'
}

export function EditableProtocolText({ initial, onChange, testId, placeholder, className = 'editable-text', kind = 'prose' }: EditableProtocolTextProps) {
  const changeRef = useRef(onChange)
  changeRef.current = onChange
  const editor = useEditor({
    extensions: [
      Document, Paragraph, Text,
      Placeholder.configure({ placeholder: placeholder ?? 'Type here…', emptyEditorClass: kind === 'title' ? 'editable-text__ph-title' : 'editable-text__ph' }),
    ],
    content: `<p>${initial.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</p>`,
    onUpdate: ({ editor }) => changeRef.current(editorToText(editor)),
  })
  // Re-seed content when a NEW step is selected (key changes on mount at parent).
  return (
    <div className={`${className} editable-text--${kind}`} data-testid={testId}>
      <EditorContent editor={editor} />
    </div>
  )
}
```

**Step 4 — Run, expect PASS.** **Step 5 — Commit** `feat(protocol): reusable editable protocol text surface`.

> Note: content re-seeding on step switch is handled by the parent mounting this component with a `key={step.stepId}` (Task 4).

---

### Task 3: Integrate editable fields + compose prompt into StepLocalizationPane

**Objective:** Refactor `StepLocalizationPane` to a **panel** that renders (a) an editable title surface, (b) the full step text in an editable surface, (c) an instruction `ChatInput`, and (d) on submit composes and sends the *whole* prompt. Track the composed prompt + last instruction for the Save-to-corpus seam (unchanged).

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/StepLocalizationPane.tsx`
- Modify (test): `app/src/event-editor/right-pane/protocol/StepLocalizationPane.test.tsx`

**Design (Step 1 — add failing tests first, then implement):**

Add to `StepLocalizationPaneProps`:
```ts
export interface StepLocalizationPaneProps {
  runId: string
  step: { stepId: string; label: string }
  stepText?: string      // becomes the editable full-text INITIAL value
}
```

New component state:
```ts
const [titleText, setTitleText] = useState('')
const [fullText, setFullText] = useState(stepText ?? '')   // seeded from long-form
const [lastComposed, setLastComposed] = useState<string | null>(null) // full prompt
const [lastInstruction, setLastInstruction] = useState<string | null>(null)
const [whatToDoDifferently, setWhatToDoDifferently] = useState('')
const [confirmed, setConfirmed] = useState(false)
// ... existing lastAcceptedGraph, saving, saveMsg
```

Replace `handleSend` to compose + send the whole prompt:
```ts
const handleLocalize = useCallback((instruction: string) => {
  setLastInstruction(instruction)
  const composed = composeFullLocalizePrompt({
    step,
    titleText,
    fullText,
    instruction,
  })
  setLastComposed(composed)
  void chat.send(composed, {
    enableThinking: false,
    protocolStepContext: {
      stepId: step.stepId,
      stepLabel: step.label,
      highlightedSection: fullText || stepText || '',
      selectedText: instruction,
    },
  })
}, [chat, step, titleText, fullText, stepText])
```

**"What to do differently" + Re-Draft** (the popup action area, shown when `previewActive`):
```ts
const handleRedraft = useCallback(() => {
  const correction = whatToDoDifferently.trim()
  if (!correction) return
  setWhatToDoDifferently('')
  // Re-send: prior instruction + explicit correction. Appends to thread history
  // so the assistant REVISES the existing ghost (buildPreviewFromDraft merge).
  const base = lastInstruction ?? ''
  const redraftPrompt = composeFullLocalizePrompt({
    step, titleText, fullText,
    instruction: `${base}${base ? '\n' : ''}Correction: ${correction}`,
  })
  setLastComposed(redraftPrompt)
  void chat.send(redraftPrompt, { enableThinking: false })
}, [chat, step, titleText, fullText, lastInstruction, whatToDoDifferently])
```

Render (replace the current single-ChatInput layout):
```tsx
<div className="step-localization-pane" data-testid="step-localization-pane">
  <div className="step-localization-pane__head">
    <span className="step-localization-pane__title">Localize step {step.stepId} — {step.label}</span>
  </div>

  <label className="step-localization-pane__field-label">Step title</label>
  <EditableProtocolText key={`title-${step.stepId}`} kind="title" initial={step.label} onChange={setTitleText} testId="sl-title" />

  <label className="step-localization-pane__field-label">Full step text (edit / trim, then localize)</label>
  <EditableProtocolText key={`text-${step.stepId}`} initial={stepText ?? ''} onChange={setFullText} testId="sl-text" />

  {/* Ghost preview status + accept / redraft / discard — the POPUP */}
  {chat.isStreaming ? <div className="step-localization-pane__streaming">Drafting…</div> : null}
  {previewActive ? (
    <div className="step-localization-pane__popup" data-testid="sl-popup">
      <div className="step-localization-pane__popup-actions">
        <button className="step-localization-pane__btn step-localization-pane__btn--primary" onClick={handleAccept} data-testid="step-localization-accept">Accept</button>
        <button className="step-localization-pane__btn" onClick={handleDiscard} data-testid="step-localization-discard">Discard</button>
      </div>
      <textarea
        className="step-localization-pane__redraft"
        placeholder="What to do differently? (e.g. use the 96-well plate, single-channel pipette)"
        value={whatToDoDifferently}
        onChange={(e) => setWhatToDoDifferently(e.target.value)}
        data-testid="what-differently-input"
        rows={2}
      />
      <button className="step-localization-pane__btn step-localization-pane__btn--redraft" onClick={handleRedraft} disabled={!whatToDoDifferently.trim() || chat.isStreaming} data-testid="redraft-btn">
        {chat.isStreaming ? 'Re-Drafting…' : 'Re-Draft / Re-Try'}
      </button>
    </div>
  ) : null}

  {/* Always-available instruction box (the submit for the first draft) */}
  <ChatInput isStreaming={chat.isStreaming} onSend={handleLocalize} onStop={chat.stop}
    sendLabel={previewActive ? 'Revise' : 'Localize Step'}
    placeholder="How should this step be done? Which labware / pipette / instruments?" />

  {/* Save-to-corpus (existing, unchanged) */}
  {confirmed && lastInstruction ? ( /* existing corpus block */ ) : null}
</div>
```

Update `handleAccept` to record `lastComposed` for the corpus prompt (replaces `buildStepLocalizePrompt(step, lastInstruction)`):
```ts
prompt: { user: lastComposed ?? composeFullLocalizePrompt({ step, titleText, fullText, instruction: lastInstruction ?? '' }), step_context: {...} }
```

**Tests (extend `StepLocalizationPane.test.tsx`):**
- Composes + sends the whole prompt `mockUseChatThread.send` is called with a string containing the edited title, edited full text, AND the instruction.
- Editing the title/text surfaces updates what gets sent (drive via the mock `onChange` of `EditableProtocolText`, or assert the composed string on submit).
- `what-differently-input` + `redraft-btn` appear when `previewActive`; clicking Re-Draft calls `send` with a prompt containing `Correction:` + the entered text, and clears the box.
- Discard hides the popup; Accept still commits + enables Save-to-corpus.

**Step 5 — Commit** `feat(protocol): editable step-localization panel + re-draft`.

---

### Task 4: Mount the panel under the active step (ProtocolTabPanel)

**Objective:** Render the redesigned panel inline under the active step chip (large panel that pushes later chips down), and stop mounting the now-redundant read-only `StepDetailPane`.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.tsx`
- Test: extend `app/src/event-editor/right-pane/protocol/ProtocolTabPanel.test.tsx`

**Step 1 — Decide layout.** The current `steps.map(...)` is block-flow; the panel renders after the active `StepChip` (it already does — `StepDetailPane` + `StepLocalizationPane` are in the same column). Make the panel the single expanded child:
- Remove the `StepDetailPane` render block (lines ~1129-1148).
- Keep the `StepLocalizationPane` render block but pass `stepText` = resolved full step text (already computed) and mount with a `key` that resets when the step changes so editable fields re-seed:
```tsx
{expandedStepId ? (() => {
  const expanded = steps.find((s) => s.stepId === expandedStepId)
  const section = expanded ? splitHumanSteps(humanStepsText ?? '')[expanded.ordinal] : undefined
  const text = section ?? expanded?.description ?? humanStepsText ?? undefined
  return (
    <StepLocalizationPane
      key={`sl-${expandedStepId}`}         // re-seed title/text on step switch
      runId={runId}
      step={expanded ? { stepId: expanded.stepId, label: expanded.label } : { stepId: expandedStepId, label: expandedStepId }}
      stepText={text}
    />
  )
})() : null}
```
- Rename the block-level container so the panel spans full width and pushes chips down (existing `display:flex flexDirection:column gap` already does this).

**Step 2 — Tests.** Assert that selecting a step renders `step-localization-pane` with the editable title+text testids (`sl-title`, `sl-text`), and that the old read-only `step-detail-pane` is gone (or simply not mounted).

**Step 3 — Commit** `feat(protocol): mount editable step-localization panel inline under active step`.

---

### Task 5: Styling

**Objective:** `protocolTabPanel.css` styles for the editable surfaces, the expanded panel, and the accept/redraft/discard popup.

**Files:**
- Modify: `app/src/event-editor/right-pane/protocol/protocolTabPanel.css`

**Add:**
```css
.step-localization-pane { display: flex; flex-direction: column; gap: 8px; padding: 12px; border: 1px solid var(--cl-border); border-radius: 8px; background: var(--cl-bg-elev); margin-top: 8px; }
.step-localization-pane__field-label { font-size: 11px; font-weight: 600; color: var(--cl-text-dim); }
.editable-text { border: 1px solid var(--cl-border); border-radius: 4px; padding: 6px 8px; background: var(--cl-bg); min-height: 32px; }
.editable-text--title .ProseMirror { font-weight: 600; font-size: 13px; }
.editable-text--prose .ProseMirror { font-size: 12px; line-height: 1.5; min-height: 80px; }
.editable-text__ph::before { color: var(--cl-text-dim); content: attr(data-placeholder); }
.step-localization-pane__popup { display: flex; flex-direction: column; gap: 8px; padding: 10px; border: 1px solid var(--cl-accent); border-radius: 6px; background: var(--cl-bg-elev-2); }
.step-localization-pane__popup-actions { display: flex; gap: 6px; }
.step-localization-pane__redraft { width: 100%; font: inherit; min-height: 40px; padding: 6px; border: 1px solid var(--cl-border); border-radius: 4px; background: var(--cl-bg); color: var(--cl-text); resize: vertical; }
.step-localization-pane__btn--redraft { background: var(--cl-accent); color: #fff; }
```

**Commit** `style(protocol): editable step-localization panel + re-draft popup`.

---

### Task 6: Verify gates

- `cd app && npx tsc --noEmit` → clean (no new errors).
- `cd app && npx vitest run src/run/protocol-planning src/event-editor/right-pane/protocol` → all pass (new + existing; the 4 pre-existing `StepLocalizationPane.test.tsx` corpus tests must still pass, now adapted for the composed prompt).
- Regression: pre-existing failures (LabwareGlyph, FindTabPanel*, PdfViewer*, DocumentEditor, ViewerToolbar, ProjectTabStrip — all untouched by this work) must NOT increase in count. Record baseline first.
- Manual (user-driven, browser): run → attach protocol → click a step → large panel opens under it, others pushed down → edit title + full text → type instruction → **Localize Step** → ghost on deck (current highlighted) → **Re-Draft / Re-Try** with "What to do differently" → ghost revises → **Accept** → **Save to corpus** appears.

---

## Risks / tradeoffs

- **Editable surfaces must serialize to plain text** for the model — reuse `editorToText`, not HTML. Keep the `EditableProtocolText` interface string-based.
- **Per-step re-seeding:** TipTap `useEditor` won't reset content when `initial` changes; use `key={step.stepId}` at the mount site so a new step gets a fresh editor. Document this so a future dev doesn't "fix" it by mutating content imperatively.
- **`exactOptionalPropertyTypes`:** when building the corpus `prompt.user`, always provide a concrete string (fall back to `composeFullLocalizePrompt`), never `undefined`/`''` for a required field.
- **Two accept affordances:** the inline panel popup (new re-draft) and the deck `PreviewActionBar` (durable persist on Accept). Keep responsibilities split: inline = draft control (accept/discard/redraft on the ghost), deck bar = persistence. Do not gate the deck bar on the new redraft state.
- **YAGNI:** do NOT add server endpoints, thread persistence, or a new reducer. The whole feature rides existing `useChatThread` + `buildPreviewFromDraft`.
- Do not delete `StepDetailPane.tsx` yet (other callers may import it); just stop mounting it from ProtocolTabPanel.

## Execution handoff

Plan complete and saved. Ready to execute using subagent-driven-development — I'll dispatch a fresh subagent per task with two-stage review (spec compliance then code quality). Shall I proceed?
