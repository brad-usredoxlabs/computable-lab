/**
 * Per-study workspace UI state — read/written by the event-editor's
 * project-workspace shell (Phase 2 of the workspace redesign).
 *
 * This is NOT a record. It is a sidecar YAML stored alongside the study at
 * `records/studies/<studyId>/workspace.yaml`. It carries only UI state:
 * which viewer tabs are open, which one is active, the right-pane mode
 * (AI/Search/Browse), pane widths, and collapse states. Persisting it next
 * to the study (rather than per-user in localStorage) lets teammates open
 * the same study and see the same arrangement, which is a FAIR/repro win.
 *
 * Conflict policy: last-writer-wins. Pane widths and active modes are
 * low-stakes and the throttled 500ms debounced save on the client side
 * keeps churn small. No optimistic locking.
 *
 * The shape lives in this small server-side module (and is mirrored on the
 * frontend in `app/src/event-editor/workspace/types.ts`). They are
 * structurally identical — keep them in sync when the schema evolves and
 * bump `version`.
 */

/** Discriminator for the open viewer kind. */
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
    };

/** Which mode the right pane is in. */
export type WorkspaceRightPaneMode = 'ai' | 'search' | 'browse';

/**
 * Full workspace state for a single study. `studyId` is redundant with the
 * file path but kept on disk for self-describing reads in the YAML.
 */
export interface WorkspaceState {
  /** Schema version. Bump if the shape changes incompatibly. */
  version: 1;
  studyId: string;
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  rightPaneMode: WorkspaceRightPaneMode;
  rightPaneCollapsed: boolean;
  /** Pane widths as fractions [0,1] summing approximately to 1. */
  paneWidths: { left: number; right: number };
}

/**
 * Default workspace state for a study that has no `workspace.yaml` yet.
 * Loaders should fall back to this so the UI never has to handle a missing
 * file specially.
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
  };
}

/**
 * Shallow validation of an unknown value claiming to be a WorkspaceState.
 * Used on the read path (a hand-edited YAML might be malformed) and on the
 * write path (a misbehaving client might post garbage). Returns the value
 * narrowed to WorkspaceState when valid, null otherwise.
 *
 * Intentionally lenient on unknown extra fields — forward-compat first.
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
    } else {
      return null;
    }
  }
  const mode = v.rightPaneMode;
  if (mode !== 'ai' && mode !== 'search' && mode !== 'browse') return null;
  const collapsed = v.rightPaneCollapsed;
  if (typeof collapsed !== 'boolean') return null;
  const widths = v.paneWidths;
  if (!widths || typeof widths !== 'object') return null;
  const w = widths as Record<string, unknown>;
  if (typeof w.left !== 'number' || typeof w.right !== 'number') return null;
  return {
    version: 1,
    studyId: v.studyId,
    tabs,
    activeTabId: (v.activeTabId as string | null | undefined) ?? null,
    rightPaneMode: mode,
    rightPaneCollapsed: collapsed,
    paneWidths: { left: w.left, right: w.right },
  };
}
