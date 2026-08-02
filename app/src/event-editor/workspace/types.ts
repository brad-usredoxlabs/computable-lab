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
 *  - v3 — Phase 1 (this task). Adds execution tab kind for unified
 *    execution view inside the workspace shell. No data migration needed
 *    from v2.
 * Both versions round-trip through `parseWorkspaceState`; older
 * client builds opening a v3 file degrade by dropping unknown kinds.
 */

export type WorkspaceViewerKind = 'deck' | 'pdf' | 'document'

/**
 * `project-details` is treated as a regular tab kind so the existing
 * tab strip / reducer / activate-tab machinery works unchanged. There's
 * one canonical project-details tab per study (id = `details:<studyId>`),
 * auto-opened by the WorkspaceProvider when no tabs exist.
 */
export type WorkspaceTab =
  | {
      id: string
      kind: 'deck'
      /** Empty string = fresh unsaved canvas. */
      eventGraphId: string
      /** When set, graphs saved from this canvas attach to the run. */
      runId?: string
      title: string
    }
  | { id: string; kind: 'pdf'; artifactId: string; title: string }
  | { id: string; kind: 'document'; artifactId: string; title: string }
  | { id: string; kind: 'project-details'; title: string }
  | {
      id: string
      kind: 'record-create'
      nodeType: 'study' | 'experiment' | 'run'
      title: string
      studyId?: string
      experimentId?: string
    }
  | {
      id: string
      kind: 'record-edit'
      /** Existing record opened for viewing/editing in a TapTab left pane. */
      recordId: string
      /** Record kind, for the tab label / icon. */
      recordKind?: string
      title: string
    }
  | {
      id: string
      kind: 'execution'
      eventGraphId: string
      runId: string
      title: string
    }
  | {
      id: string
      kind: 'project'
      /** Study record ID. */
      studyId: string
      title: string
    }
  | {
      id: string
      kind: 'run'
      /** Run record ID. */
      runId: string
      /** The event graph ID for the run's method deck, if it has one. */
      eventGraphId?: string
      title: string
    }
  | {
      id: string
      kind: 'claim'
      /** Claim record ID. */
      claimId: string
      title: string
    }
  | {
      id: string
      kind: 'lab-entity'
      /** Schema ID of the lab entity (protocol, material, labware, equipment, person). */
      schemaId: string
      /** Record ID of the lab entity. */
      recordId: string
      /** Short label for the entity type (e.g. "protocol", "material"). */
      entityType: string
      title: string
    }
  | {
      id: string
      kind: 'collection'
      /** Which collection: projects, runs, claims, lab */
      collection: 'projects' | 'runs' | 'claims' | 'lab'
      title: string
    }
  | {
      id: string
      kind: 'splash'
      title: string
    }

/**
 * Stable id for a creation tab so re-clicking "New …" focuses the open
 * draft instead of stacking duplicates. One in-flight draft per parent.
 */
export function recordCreateTabId(
  nodeType: 'study' | 'experiment' | 'run',
  parentId?: string,
): string {
  return `create:${nodeType}${parentId ? `:${parentId}` : ''}`
}

/**
 * Stable id for an edit tab so re-clicking the same record focuses the open
 * editor instead of stacking duplicates.
 */
export function recordEditTabId(recordId: string): string {
  return `record:${recordId}`
}

/**
 * Stable id for an execution tab so re-clicking "Execute" focuses the open
 * execution view instead of stacking duplicates. One in-flight execution
 * tab per event graph.
 */
export function executionTabId(eventGraphId: string): string {
  return `execution:${eventGraphId}`
}

/** Stable id for a top-level deck tab — one per event graph. Re-opening the
 *  same graph focuses the existing tab instead of stacking duplicates. */
export function deckTabId(eventGraphId: string): string {
  return `deck:${eventGraphId}`
}

/** Stable id for a project tab — one per study. */
export function projectTabId(studyId: string): string {
  return `project:${studyId}`
}

/** Stable id for a run tab so re-clicking the same run focuses it. */
export function runTabId(runId: string): string {
  return `run:${runId}`
}

/** Stable id for a claim tab. */
export function claimTabId(claimId: string): string {
  return `claim:${claimId}`
}

/** Stable id for a lab-entity tab. */
export function labEntityTabId(recordId: string): string {
  return `lab:${recordId}`
}

/** Stable id for a collection tab. */
export function collectionTabId(collection: string): string {
  return `collection:${collection}`
}

/** Stable id for the splash (new-tab launcher) tab. One per open splash. */
export function splashTabId(): string {
  return `splash:${Date.now()}`
}

/** The primary entity type of a workspace tab, for color-coding and
 *  right-pane context selection. Returns null for viewer-only tabs
 *  (deck, pdf, document) that don't represent a primary entity. */
export type EntityTabType = 'project' | 'run' | 'claim' | 'lab'

export function entityTabType(tab: WorkspaceTab): EntityTabType | null {
  switch (tab.kind) {
    case 'project':
      return 'project'
    case 'run':
    case 'execution':
    case 'deck':
      return 'run'
    case 'claim':
      return 'claim'
    case 'lab-entity':
    case 'record-edit':
      return 'lab'
    case 'pdf':
    case 'document':
    case 'project-details':
    case 'record-create':
      return null
    case 'collection':
    case 'splash':
      return null
    default: {
      const _exhaustive: never = tab
      return _exhaustive ?? null
    }
  }
}

/** One crumb in a tab's origin trail ("how I got here"). */
export interface BreadcrumbItem {
  label: string
  entityType: 'project' | 'run' | 'claim' | 'lab' | 'collection' | null
  id?: string
  route?: string
}

/**
 * Phase 12 renamed `browse` to `find`. The `find` tab was removed —
 * it was wrong to surface an in-project tree while viewing a run.
 * `'find'` is kept in the union for backward-compat with persisted
 * workspace.yaml files; RightPane normalizes it to `'ai'` at render
 * time. Phase 13 adds `details` — the single-plate workflow
 * (Materials / Groups / Notes / Read) lifted out of the focused-plate
 * left pane. `protocol` is for showing protocol steps when viewing a
 * run.
 * @deprecated `'find'` is legacy — no longer surfaced as a tab;
 * treated as `'ai'` at render time. Kept for persisted workspace.yaml
 * back-compat (server parser still accepts it).
 */
export type WorkspaceRightPaneMode = 'ai' | 'search' | 'find' | 'details' | 'protocol'

export interface WorkspaceState {
  version: 3
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
 * on a project-details tab so the user sees the project overview, not an
 * empty viewer. Mirrors the server's `defaultWorkspaceState` — keep
 * the two in sync. Phase 1 adds execution tab support.
 */
export function defaultWorkspaceState(studyId: string): WorkspaceState {
  const detailsTabId = projectDetailsTabId(studyId)
  return {
    version: 3,
    studyId,
    tabs: [
      {
        id: detailsTabId,
        kind: 'project-details',
        title: 'Project',
      },
    ],
    activeTabId: detailsTabId,
    rightPaneMode: 'ai',
    rightPaneCollapsed: false,
    paneWidths: { left: 0.6, right: 0.4 },
  }
}