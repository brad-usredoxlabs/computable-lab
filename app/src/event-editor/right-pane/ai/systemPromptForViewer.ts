/**
 * systemPromptForViewer — per-viewer-kind system prompt selector.
 *
 * Phase 7's plan called for plumbing this through `aiContext.ts` so the
 * server-side `/api/ai/draft-events/stream` sees a different preamble
 * depending on whether the user is talking from the deck, a PDF, or a
 * document. The plumbing into the live chat flow is Phase 7b (the AI
 * dock refactor); this helper is the lookup the AI panel surfaces today
 * and that Phase 7b will read.
 *
 * Keep the labels stable — they're used as headers in the AI panel and
 * could end up in telemetry as the selected `systemPromptId`.
 */

import type { WorkspaceViewerKind } from '../../workspace/types'

export interface ViewerSystemPrompt {
  /** Stable identifier for telemetry / future server-side selection. */
  id: string
  /** Short human label for UI display. */
  label: string
  /** Full preamble text the server would prepend to the chat history. */
  body: string
}

const DECK: ViewerSystemPrompt = {
  id: 'workspace.deck',
  label: 'Deck (event-graph drafting)',
  body: 'You are helping draft compiler-native event graphs for a lab deck. Prefer structured tool calls over free-text. Ghost previews must not commit local namespace records until the user accepts.',
}

const PDF: ViewerSystemPrompt = {
  id: 'workspace.pdf',
  label: 'PDF (vendor protocol discussion)',
  body: 'You are helping discuss and extract information from the loaded vendor PDF. Quote spans from the document when relevant. Avoid drafting an event graph unless the user explicitly asks to dispatch it to the deck viewer.',
}

const DOCUMENT: ViewerSystemPrompt = {
  id: 'workspace.document',
  label: 'Document (scientific authoring)',
  body: 'You are helping author a scientific document (protocol, write-up, training record, or conclusion). Suggest edits as concrete prose; rewrite sections when asked. Slash-menu mentions of materials / labware / protocols should resolve through the local ontology service before being inserted.',
}

const NO_VIEWER: ViewerSystemPrompt = {
  id: 'workspace.none',
  label: 'Project workspace (no viewer)',
  body: 'You are assisting with a computable-lab study. The user has no viewer tab open yet — encourage them to open a deck, PDF, or document so subsequent answers can ground in concrete artifacts.',
}

export function systemPromptForViewer(
  kind: WorkspaceViewerKind | null,
): ViewerSystemPrompt {
  switch (kind) {
    case 'deck':
      return DECK
    case 'pdf':
      return PDF
    case 'document':
      return DOCUMENT
    case null:
      return NO_VIEWER
    default: {
      const _exhaustive: never = kind
      return _exhaustive ?? NO_VIEWER
    }
  }
}
