/**
 * Per-study workspace UI state — read/written by the event-editor's
 * project-workspace shell (Phase 2 → Phase 12).
 *
 * This is NOT a record. It is a sidecar YAML stored alongside the study at
 * `records/studies/<studyId>/workspace.yaml`. It carries only UI state:
 * which viewer tabs are open, which one is active, the right-pane mode
 * (AI / Find / Search), pane widths, and collapse states. Persisting it
 * next to the study (rather than per-user in localStorage) lets teammates
 * open the same study and see the same arrangement.
 *
 * Conflict policy: last-writer-wins. Pane widths and active modes are
 * low-stakes and the throttled 500ms debounced save on the client side
 * keeps churn small. No optimistic locking.
 *
 * Schema versions:
 *  - v1 — Phase 2 shape: deck / pdf / document tabs only; right-pane
 *    modes 'ai' | 'search' | 'browse'.
 *  - v2 — Phase 12. Adds `project-details` tab kind. Renames the
 *    right-pane 'browse' mode to 'find'. parseWorkspaceState below
 *    accepts BOTH versions; v1 inputs are migrated to v2 in memory and
 *    re-saved on the next PUT.
 *
 * The shape mirrors `app/src/event-editor/workspace/types.ts`. Keep
 * the two in sync when the schema evolves.
 */

export type WorkspaceViewerKind = 'deck' | 'pdf' | 'document';

/** One open viewer tab within a study. */
export type WorkspaceTab =
  | {
      id: string;
      kind: 'deck';
      eventGraphId: string;
      title: string;
    }
  | {
      id: string;
      kind: 'pdf';
      artifactId: string;
      title: string;
    }
  | {
      id: string;
      kind: 'document';
      artifactId: string;
      title: string;
    }
  | {
      id: string;
      kind: 'project-details';
      title: string;
    }
  | {
      id: string;
      kind: 'record-create';
      nodeType: 'study' | 'experiment' | 'run';
      title: string;
      studyId?: string;
      experimentId?: string;
    };

/**
 * Which mode the right pane is in. Phase 12 renamed `browse` to `find`;
 * Phase 13 adds `details` for the single-plate workflow that used to
 * ride as a sidebar column inside the focused-plate left pane.
 */
export type WorkspaceRightPaneMode = 'ai' | 'search' | 'find' | 'details';

/**
 * Full workspace state for a single study. `studyId` is redundant with
 * the file path but kept on disk for self-describing reads in the YAML.
 */
export interface WorkspaceState {
  /** Schema version. v2 as of Phase 12; v1 inputs are migrated on read. */
  version: 2;
  studyId: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  rightPaneMode: WorkspaceRightPaneMode;
  rightPaneCollapsed: boolean;
  /** Pane widths as fractions [0,1] summing approximately to 1. */
  paneWidths: { left: number; right: number };
}

/** Stable id for the project-details tab — one per study. */
export function projectDetailsTabId(studyId: string): string {
  return `details:${studyId}`;
}

/**
 * Default workspace state for a study that has no `workspace.yaml` yet.
 * Phase 12 lands on a project-details tab so the user sees the project
 * overview, not an empty viewer.
 */
export function defaultWorkspaceState(studyId: string): WorkspaceState {
  const detailsId = projectDetailsTabId(studyId);
  return {
    version: 2,
    studyId,
    tabs: [{ id: detailsId, kind: 'project-details', title: 'Project' }],
    activeTabId: detailsId,
    rightPaneMode: 'find',
    rightPaneCollapsed: false,
    paneWidths: { left: 0.6, right: 0.4 },
  };
}

/**
 * Shallow validation of an unknown value claiming to be a WorkspaceState.
 * Used on the read path (a hand-edited YAML might be malformed) and on
 * the write path (a misbehaving client might post garbage). Returns the
 * value narrowed to WorkspaceState when valid, null otherwise.
 *
 * Accepts both v1 and v2 inputs. v1 'browse' mode migrates to v2 'find';
 * v1 files lacking project-details get a fresh one inserted on read so
 * the workspace always has somewhere to land. The returned object is
 * always v2 — older builds re-saving will write v2 in place.
 */
export function parseWorkspaceState(value: unknown): WorkspaceState | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.studyId !== 'string') return null;
  if (!Array.isArray(v.tabs)) return null;
  if (
    v.activeTabId !== null &&
    typeof v.activeTabId !== 'undefined' &&
    typeof v.activeTabId !== 'string'
  )
    return null;
  const tabs: WorkspaceTab[] = [];
  for (const raw of v.tabs) {
    if (!raw || typeof raw !== 'object') return null;
    const t = raw as Record<string, unknown>;
    if (typeof t.id !== 'string' || typeof t.title !== 'string') return null;
    if (t.kind === 'deck' && typeof t.eventGraphId === 'string') {
      tabs.push({ id: t.id, kind: 'deck', eventGraphId: t.eventGraphId, title: t.title });
    } else if (t.kind === 'pdf' && typeof t.artifactId === 'string') {
      tabs.push({ id: t.id, kind: 'pdf', artifactId: t.artifactId, title: t.title });
    } else if (t.kind === 'document' && typeof t.artifactId === 'string') {
      tabs.push({ id: t.id, kind: 'document', artifactId: t.artifactId, title: t.title });
    } else if (t.kind === 'project-details') {
      tabs.push({ id: t.id, kind: 'project-details', title: t.title });
    } else if (
      t.kind === 'record-create' &&
      (t.nodeType === 'study' ||
        t.nodeType === 'experiment' ||
        t.nodeType === 'run')
    ) {
      tabs.push({
        id: t.id,
        kind: 'record-create',
        nodeType: t.nodeType,
        title: t.title,
        ...(typeof t.studyId === 'string' ? { studyId: t.studyId } : {}),
        ...(typeof t.experimentId === 'string'
          ? { experimentId: t.experimentId }
          : {}),
      });
    } else {
      // Unknown kind — drop silently rather than refuse the whole file.
      // Older builds opening a future-versioned file degrade by losing
      // unknown tabs but keep working.
      continue;
    }
  }

  // Migrate v1 'browse' to v2 'find'. Reject any other unknown value.
  let mode: WorkspaceRightPaneMode;
  if (v.rightPaneMode === 'browse') {
    mode = 'find';
  } else if (
    v.rightPaneMode === 'ai' ||
    v.rightPaneMode === 'search' ||
    v.rightPaneMode === 'find' ||
    v.rightPaneMode === 'details'
  ) {
    mode = v.rightPaneMode;
  } else {
    return null;
  }

  const collapsed = v.rightPaneCollapsed;
  if (typeof collapsed !== 'boolean') return null;
  const widths = v.paneWidths;
  if (!widths || typeof widths !== 'object') return null;
  const w = widths as Record<string, unknown>;
  if (typeof w.left !== 'number' || typeof w.right !== 'number') return null;

  // Ensure every study has a project-details tab so the workspace
  // always has a landing place. Inserted at the head so it reads as
  // the canonical "back to overview" tab.
  const detailsId = projectDetailsTabId(v.studyId);
  if (!tabs.some((t) => t.kind === 'project-details')) {
    tabs.unshift({ id: detailsId, kind: 'project-details', title: 'Project' });
  }

  // If the persisted activeTabId no longer matches any tab (e.g. a
  // record was deleted), fall back to the project-details tab so the
  // UI doesn't render with no active selection.
  const persistedActive =
    (v.activeTabId as string | null | undefined) ?? null;
  const activeTabId = tabs.some((t) => t.id === persistedActive)
    ? persistedActive
    : detailsId;

  return {
    version: 2,
    studyId: v.studyId,
    tabs,
    activeTabId,
    rightPaneMode: mode,
    rightPaneCollapsed: collapsed,
    paneWidths: { left: w.left, right: w.right },
  };
}
