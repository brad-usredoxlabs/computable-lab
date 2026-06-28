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

import type { WorkspaceTab, WorkspaceViewerKind } from '../../workspace/types'

/** The tab kinds the AI panel can derive a system prompt from. Phase 12
 *  added `project-details`, which uses the same NO_VIEWER preamble as
 *  the null case (no viewer is open, ask the agent to help navigate). */
type SystemPromptKind = WorkspaceViewerKind | 'project-details' | null

/** Convenience: get the SystemPromptKind from a WorkspaceTab (or null). */
export function systemPromptKindForTab(
  tab: WorkspaceTab | null,
): SystemPromptKind {
  if (!tab) return null
  // The record-create and record-edit surfaces have no viewer document to
  // ground on; the NO_VIEWER preamble (navigate / advise) is the right
  // scope for them.
  if (tab.kind === 'record-create' || tab.kind === 'record-edit') return null
  return tab.kind
}

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
  id: 'protocol-builder',
  label: 'Protocol builder',
  body: `You are a practical engineer taking a generic universal protocol and adapting it to the needs of THIS lab based on user input.
The user is loading a vendor PDF (e.g., kit manual, assay protocol, instrument guide) and wants to adapt it to their specific lab setup.

**Lab context — default equipment:**
- 96-well plates on the Opentrons Flex deck
- Reagents loaded into a 12-well reservoir
- Manual protocol on the freeform bench
- 5x16 tube rack with 1.5ml Eppendorf tubes

Your job is to help the user:
1. Understand the vendor protocol sections they reference from the PDF
2. Adapt the protocol to work with their specific lab equipment and reagents
3. Suggest concrete modifications when the vendor protocol does not match their setup
4. Flag any potential issues or incompatibilities

Quote spans from the document when relevant. When the user sends selected text, analyze it and suggest how it applies to their lab context.
If the protocol mentions equipment or consumables that differ from the lab's setup, suggest practical alternatives.
Do NOT invent missing protocol details — if something is unclear, ask for clarification.`,
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

const PROJECT_DETAILS: ViewerSystemPrompt = {
  id: 'workspace.project-details',
  label: 'Project overview',
  body: 'You are assisting with a computable-lab study at the project-overview level — the user is looking at the experiments / runs tree and artifact sections. Help them navigate the project, summarize what they have, or pick a record to open. Do not draft event graphs unless the user explicitly opens a deck.',
}

export function systemPromptForViewer(
  kind: SystemPromptKind,
): ViewerSystemPrompt {
  switch (kind) {
    case 'deck':
      return DECK
    case 'pdf':
      return PDF
    case 'document':
      return DOCUMENT
    case 'project-details':
      return PROJECT_DETAILS
    case null:
      return NO_VIEWER
    default: {
      const _exhaustive: never = kind
      return _exhaustive ?? NO_VIEWER
    }
  }
}
