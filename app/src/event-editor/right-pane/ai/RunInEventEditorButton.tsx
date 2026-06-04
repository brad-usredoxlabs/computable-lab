/**
 * RunInEventEditorButton — surfaces the workspace's distinctive "send my
 * prompt to the deck viewer" gesture.
 *
 * The user might be reading a PDF or drafting a protocol, and want the AI
 * to draft an event graph based on what's on screen. The button:
 *   1. Composes a prefill string = the user's current prompt (passed in)
 *      + a short excerpt from the active viewer's body.
 *   2. Switches the active workspace tab to a deck tab (creating one if
 *      none is open) so the ghost-preview flow lands somewhere visible.
 *   3. Hands the prefill back to the parent for ChatInput to render.
 *
 * Phase 7b does NOT automatically send the prompt — it stages it on the
 * deck-tab AI panel so the user reviews the composed text first. That
 * matches the FAIR-conservative spirit of the rest of the dispatch flow
 * (Accept / Reject before namespace pollution).
 *
 * Visible only when the active viewer is NOT a deck.
 */

import { useCallback } from 'react'
import { useWorkspace } from '../../workspace/WorkspaceContext'
import { useDocumentEditor } from '../../viewer/document/DocumentEditorContext'
import { usePdfViewer } from '../../viewer/pdf/PdfViewerContext'
import type { WorkspaceTab } from '../../workspace/types'

export interface RunInEventEditorButtonProps {
  activeTab: WorkspaceTab | null
  promptDraft: string
  onPrefilled: (text: string) => void
}

const EXCERPT_MAX_CHARS = 1200

export function RunInEventEditorButton({
  activeTab,
  promptDraft,
  onPrefilled,
}: RunInEventEditorButtonProps) {
  // Hooks must be called unconditionally; the providers safely return the
  // default (empty) state when the active viewer isn't of that kind.
  const documentCtx = useDocumentEditor()
  const pdfCtx = usePdfViewer()
  const ws = useWorkspace()

  const visible =
    activeTab !== null && (activeTab.kind === 'pdf' || activeTab.kind === 'document')

  const handleClick = useCallback(() => {
    if (!activeTab) return
    const excerpt = buildExcerpt(activeTab, { documentCtx, pdfCtx })
    const composed = composePrompt(promptDraft, activeTab, excerpt)

    // Make sure there's a deck tab to land on. We don't try to be clever
    // about reusing an existing draft tab — opening a fresh one each time
    // is the predictable behavior. The user can close it manually.
    let deckTabId = ws.state.tabs.find((t) => t.kind === 'deck')?.id
    if (!deckTabId) {
      deckTabId = `tab-deck-${Date.now().toString(36)}`
      ws.openTab({
        id: deckTabId,
        kind: 'deck',
        eventGraphId: '',
        title: 'Dispatched draft',
      })
    } else {
      ws.activateTab(deckTabId)
    }
    onPrefilled(composed)
  }, [activeTab, promptDraft, documentCtx, pdfCtx, ws, onPrefilled])

  if (!visible) return null

  return (
    <button
      type="button"
      className="run-in-event-editor__btn"
      data-testid="run-in-event-editor"
      onClick={handleClick}
      title="Switch to the deck viewer with this prompt + viewer excerpt prefilled. The deck's ghost-preview flow handles the rest."
    >
      Run in event-editor →
    </button>
  )
}

interface BuildExcerptDeps {
  documentCtx: ReturnType<typeof useDocumentEditor>
  pdfCtx: ReturnType<typeof usePdfViewer>
}

function buildExcerpt(
  tab: WorkspaceTab,
  { documentCtx, pdfCtx }: BuildExcerptDeps,
): string {
  if (tab.kind === 'pdf') {
    if (!pdfCtx.extractedText || pdfCtx.extractedText.length === 0) {
      return ''
    }
    // First page is usually the title / intro — most useful to anchor on.
    // The bulky body would dilute the prompt and blow past token limits.
    const joined = pdfCtx.extractedText
      .slice(0, 3)
      .map((p) => `Page ${p.pageNumber}:\n${p.text}`)
      .join('\n\n')
    return truncate(joined, EXCERPT_MAX_CHARS)
  }
  if (tab.kind === 'document') {
    if (documentCtx.loadState.kind !== 'ready') return ''
    const body = documentCtx.loadState.artifact.body
    if (!body) return ''
    return truncate(flattenTipTap(body), EXCERPT_MAX_CHARS)
  }
  return ''
}

type ArtifactTab = Extract<WorkspaceTab, { kind: 'pdf' | 'document' }>

function composePrompt(
  promptDraft: string,
  tab: WorkspaceTab,
  excerpt: string,
): string {
  // The button is only visible when the active tab is pdf/document, so
  // tab.kind === 'deck' shouldn't reach here. Guard explicitly to give
  // TypeScript the narrowing it needs without an unsafe assertion.
  if (tab.kind === 'deck') return promptDraft.trim()
  const artifactTab = tab as ArtifactTab
  const head = promptDraft.trim()
  const sourceLabel =
    artifactTab.kind === 'pdf'
      ? `PDF ${artifactTab.artifactId}`
      : `Document ${artifactTab.artifactId}`
  const parts: string[] = []
  if (head) parts.push(head)
  parts.push('')
  parts.push(`-- Source: ${sourceLabel} (${artifactTab.title}) --`)
  if (excerpt) {
    parts.push(excerpt)
  } else {
    parts.push('(no extracted text available for this source)')
  }
  return parts.join('\n')
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max).trimEnd()}\n…(truncated)`
}

function flattenTipTap(node: unknown): string {
  if (!node || typeof node !== 'object') return ''
  const n = node as { text?: unknown; content?: unknown[]; type?: string }
  let out = ''
  if (typeof n.text === 'string') out += n.text
  if (Array.isArray(n.content)) {
    const childParts: string[] = []
    for (const child of n.content) childParts.push(flattenTipTap(child))
    out += childParts.join(' ')
  }
  // Add a line break between block-level nodes for readability in the
  // composed prompt.
  if (n.type === 'paragraph' || n.type === 'heading') out += '\n'
  return out
}
