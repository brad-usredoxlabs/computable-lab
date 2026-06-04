/**
 * Frontend per-study workspace state.
 *
 * Mirrors `server/src/workspace/types.ts`. Kept structurally identical so
 * the wire format is round-trippable; bump both `version` fields together
 * when the schema changes incompatibly.
 *
 * Discriminated `WorkspaceTab` union — viewer kinds: deck, pdf, document.
 * Each carries the resource ref the viewer needs (eventGraphId for deck,
 * artifactId for pdf/document).
 */

export type WorkspaceViewerKind = 'deck' | 'pdf' | 'document'

export type WorkspaceTab =
  | { id: string; kind: 'deck'; eventGraphId: string; title: string }
  | { id: string; kind: 'pdf'; artifactId: string; title: string }
  | { id: string; kind: 'document'; artifactId: string; title: string }

export type WorkspaceRightPaneMode = 'ai' | 'search' | 'browse'

export interface WorkspaceState {
  version: 1
  studyId: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
  rightPaneMode: WorkspaceRightPaneMode
  rightPaneCollapsed: boolean
  /** Pane widths as fractions [0,1]. Should sum approximately to 1. */
  paneWidths: { left: number; right: number }
}

/**
 * Default state for a study with no `workspace.yaml` yet. Mirrors the
 * server's `defaultWorkspaceState` — keep the two in sync.
 */
export function defaultWorkspaceState(studyId: string): WorkspaceState {
  return {
    version: 1,
    studyId,
    tabs: [],
    activeTabId: null,
    rightPaneMode: 'ai',
    rightPaneCollapsed: false,
    paneWidths: { left: 0.6, right: 0.4 },
  }
}
