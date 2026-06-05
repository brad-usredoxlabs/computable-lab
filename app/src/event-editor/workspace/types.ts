/**
 * Frontend per-study workspace state.
 *
 * Mirrors `server/src/workspace/types.ts`. Kept structurally identical so
 * the wire format is round-trippable; bump both `version` fields together
 * when the schema changes incompatibly.
 *
 * Discriminated `WorkspaceTab` union. Viewer kinds (deck / pdf / document)
 * carry the resource ref the viewer needs. The `project-details` kind
 * (Phase 12) is the project-overview landing tab — no resource ref, just
 * a stable id + title.
 *
 * Schema versions:
 *  - v1 — the original Phase 2 shape: deck / pdf / document tabs only.
 *    No project-details. Right-pane mode 'ai' | 'search' | 'browse'.
 *  - v2 — Phase 12 extension. Adds project-details tab kind. Right pane
 *    mode 'browse' renames to 'find' (browse is migrated on load).
 * Both versions round-trip through `parseWorkspaceState`; older
 * client builds opening a v2 file degrade by dropping unknown kinds.
 */

export type WorkspaceViewerKind = 'deck' | 'pdf' | 'document'

/**
 * `project-details` is treated as a regular tab kind so the existing
 * tab strip / reducer / activate-tab machinery works unchanged. There's
 * one canonical project-details tab per study (id = `details:<studyId>`),
 * auto-opened by the WorkspaceProvider when no tabs exist.
 */
export type WorkspaceTab =
  | { id: string; kind: 'deck'; eventGraphId: string; title: string }
  | { id: string; kind: 'pdf'; artifactId: string; title: string }
  | { id: string; kind: 'document'; artifactId: string; title: string }
  | { id: string; kind: 'project-details'; title: string }

/** Phase 12 renames `browse` to `find`. The parser migrates v1 → v2 on read. */
export type WorkspaceRightPaneMode = 'ai' | 'search' | 'find'

export interface WorkspaceState {
  version: 2
  studyId: string
  tabs: WorkspaceTab[]
  activeTabId: string | null
  rightPaneMode: WorkspaceRightPaneMode
  rightPaneCollapsed: boolean
  /** Pane widths as fractions [0,1]. Should sum approximately to 1. */
  paneWidths: { left: number; right: number }
}

/** Stable id for the project-details tab — one per study. */
export function projectDetailsTabId(studyId: string): string {
  return `details:${studyId}`
}

/**
 * Default state for a study with no `workspace.yaml` yet. Phase 12: lands
 * on a project-details tab so the user sees the project overview, not
 * an empty viewer. Mirrors the server's `defaultWorkspaceState` — keep
 * the two in sync.
 */
export function defaultWorkspaceState(studyId: string): WorkspaceState {
  const detailsTabId = projectDetailsTabId(studyId)
  return {
    version: 2,
    studyId,
    tabs: [
      {
        id: detailsTabId,
        kind: 'project-details',
        title: 'Project',
      },
    ],
    activeTabId: detailsTabId,
    rightPaneMode: 'find',
    rightPaneCollapsed: false,
    paneWidths: { left: 0.6, right: 0.4 },
  }
}
